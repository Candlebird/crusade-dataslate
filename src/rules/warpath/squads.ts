import { rand } from '../training/rng';
import { WARPATH } from './data';
import { terrainAt, terrainNear, unblock, type Grid } from './field';
import { blastAt } from './combat';
import { mods } from './mods';
import { clock } from './loot';
import type { Squad, WarpathRun } from './types';

// The force moving with the hero: squads drift round a loose ring about it (each near its own slot), heavy ones lag,
// artillery hangs back, aircraft fly loops, melee squads sally at enemies close by, and infantry take cover near the
// hero, leaving it to fall back in when the hero moves on. Fortifications drop in as turrets, hurt what
// they land on, come back after a while if destroyed, and lift off to drop again near the hero if it walks away.

const W = WARPATH;
const F = W.follow;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A squad's move speed in inches a second. */
const speedOf = (s: Squad) => s.advance * W.hero.speedPer * (s.kind === 'heavy' ? 0.85 : 1);

/** Only melee guns (it sallies). */
const brawler = (s: Squad) => s.guns.length > 0 && s.guns.every((g) => g.melee);

/** A fresh spot to drift to round the hero, near the squad's own slot (artillery: behind the hero). */
function driftOf(run: WarpathRun, s: Squad, i: number): { ox: number; oy: number } {
  const sway = (rand(run) - 0.5) * 2 * F.wanderSway;
  const out = F.wanderIn + rand(run) * (F.wanderOut - F.wanderIn);
  const a = s.kind === 'artillery' ? run.face + Math.PI + ((i % 3) - 1) * 0.5 + sway : i * GOLDEN + sway;
  const r = (s.kind === 'artillery' ? F.artilleryBack : F.ring + F.ringPer * Math.sqrt(i)) * out;
  return { ox: Math.cos(a) * r, oy: Math.sin(a) * r };
}

/** Infantry and lone heroes: a spot in cover within reach of the hero, in a feature not already full. */
function findCover(run: WarpathRun, s: Squad): { x: number; y: number } | undefined {
  const R = F.coverSeek;
  let best: { x: number; y: number } | undefined;
  let bestD = Infinity;
  for (const t of terrainNear(run.seed, run.hx - R, run.hy - R, run.hx + R, run.hy + R)) {
    if (t.kind !== 'cover' || (t.x - run.hx) ** 2 + (t.y - run.hy) ** 2 > R * R) continue;
    const held = run.squads.filter((q) => q !== s && q.cover && (q.cover.x - t.x) ** 2 + (q.cover.y - t.y) ** 2 < t.r * t.r).length;
    if (held >= F.coverShare) continue;
    const d = (t.x - s.x) ** 2 + (t.y - s.y) ** 2;
    if (d >= bestD) continue;
    const a = rand(run) * Math.PI * 2;
    const r = rand(run) * t.r * 0.5;
    best = { x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r };
    bestD = d;
  }
  return best;
}

/** Where a squad wants to stand: its cover if it holds some, else a spot it drifts to round the hero. */
function anchorOf(run: WarpathRun, s: Squad, i: number, dt: number): { x: number; y: number } {
  if (s.cover && (s.cover.x - run.hx) ** 2 + (s.cover.y - run.hy) ** 2 > F.coverLeash ** 2) delete s.cover;
  const w = (s.wander ??= { ...driftOf(run, s, i), t: 0 });
  w.t -= dt;
  if (w.t <= 0) {
    Object.assign(w, driftOf(run, s, i));
    w.t = F.wanderMin + rand(run) * (F.wanderMax - F.wanderMin);
    if (s.kind === 'foot' && !s.cover) s.cover = findCover(run, s);
  }
  if (s.cover) return s.cover;
  return { x: run.hx + w.ox, y: run.hy + w.oy };
}

/** Land a fortification near the hero, at a spot ahead of it. */
function dropFort(run: WarpathRun, s: Squad): void {
  const a = run.face + (rand(run) - 0.5) * 2.4;
  const p = { x: run.hx + Math.cos(a) * W.fort.land, y: run.hy + Math.sin(a) * W.fort.land };
  unblock(run.seed, p, 1.5);
  s.x = p.x;
  s.y = p.y;
  s.fort!.fall = 1.2;
}

function fortStep(run: WarpathRun, grid: Grid, s: Squad, si: number, dt: number): void {
  const f = s.fort!;
  if (f.down > 0) {
    f.down -= dt;
    if (f.down <= 0) {
      if (f.hp <= 0) f.hp = f.maxHp;
      dropFort(run, s);
    }
    return;
  }
  if (f.fall > 0) {
    f.fall -= dt;
    if (f.fall <= 0) {
      run.fx.push({ kind: 'land', x: s.x, y: s.y, n: W.fort.impactRadius, t: 0.6 });
      blastAt(run, grid, si, s.x, s.y, W.fort.impactRadius, W.fort.impact * s.size, 1, 3, 'land');
    }
    return;
  }
  if ((s.x - run.hx) ** 2 + (s.y - run.hy) ** 2 > W.fort.leash ** 2) {
    f.down = W.fort.redrop;
    run.log.push(`${clock(run.t)} ${s.name} lifts off to follow.`);
  }
}

/** Squads move, forts drop, and lost models come back. */
export function squadStep(run: WarpathRun, grid: Grid, dt: number): void {
  const m = mods(run);
  run.squads.forEach((s, si) => {
    if (si === 0) return;
    // Lost models come back one at a time (wiped squads too, once one does).
    if (s.alive < s.size && s.kind !== 'fort') {
      s.regen -= dt;
      if (s.regen <= 0) {
        s.alive += 1;
        s.regen = W.losses.regen * m.modelRegen;
      }
    } else s.regen = W.losses.regen * m.modelRegen;
    if (s.kind === 'fort') return fortStep(run, grid, s, si, dt);
    if (s.kind === 'air') {
      s.angle += (W.air.speed / W.air.radius) * dt * (si % 2 ? 1 : -1);
      s.x = run.hx + Math.cos(s.angle) * W.air.radius * 0.8;
      s.y = run.hy + Math.sin(s.angle) * W.air.radius * 0.55;
      return;
    }
    let goal = anchorOf(run, s, si, dt);
    if (brawler(s)) {
      const reach = Math.max(...s.guns.map((g) => g.reach)) + 4;
      const foe = grid.pick(goal.x, goal.y, reach);
      if (foe) goal = { x: foe.x, y: foe.y };
    }
    const dx = goal.x - s.x;
    const dy = goal.y - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.3) return;
    let v = speedOf(s) * (d > 15 ? 2 : d > 6 ? 1.3 : 1);
    if (s.kind === 'heavy') v *= Math.min(1, d / (F.lag * F.heavyLag));
    if (terrainAt(run.seed, s.x, s.y)?.kind === 'difficult') v *= 0.7;
    const step = Math.min(d, v * dt);
    s.x += (dx / d) * step;
    s.y += (dy / d) * step;
    unblock(run.seed, s, 1.2);
    // Far behind (stuck on terrain): catch up.
    if ((s.x - run.hx) ** 2 + (s.y - run.hy) ** 2 > 40 * 40) { s.x = goal.x; s.y = goal.y; }
  });
}

/** The hero's speed in inches a second. */
export function heroSpeed(run: WarpathRun, fear: boolean): number {
  const h = run.squads[0];
  const t = terrainAt(run.seed, run.hx, run.hy);
  return h.advance * W.hero.speedPer * mods(run).speed * (1 + W.levels.speed * h.level) * (fear ? 0.7 : 1) * (t?.kind === 'difficult' ? 0.6 : 1);
}
