import { rand } from '../training/rng';
import { WARPATH } from './data';
import { terrainAt, terrainNear, unblock, type Grid } from './field';
import { blastAt, bestMelee, densest, NO_AURA, rushBlow, strike } from './combat';
import { mods, type Mods } from './mods';
import { clock } from './loot';
import { boon, heroPowerOf, roleOf } from './traits';
import type { Enemy, Squad, SquadRole, WarpathRun } from './types';

// The force moving with the hero. Each archetype has its own orders: Chargers rush straight through packs, untouchable;
// Phantoms blink in and out; Ambushers wait off the field and deploy on a flank; Flyers strafe; Reavers wade into the
// thick of it; Hunters go after elites and bosses; Skirmishers range ahead; Bulwarks guard the hero; Supports stay by the
// hurt; Gunlines and Artillery stand and shoot. Fortifications drop in as turrets, hurt what they land on, come back
// after a while if destroyed, and lift off to drop again near the hero if it walks away.

const W = WARPATH;
const F = W.follow;
const R = W.roles;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A squad's move speed in inches a second. */
const speedOf = (s: Squad) => s.advance * W.hero.speedPer * (s.kind === 'heavy' ? 0.85 : 1) * (boon(s, 'speed') ? R.speedBoon : 1);

const dist2 = (a: { x: number; y: number }, x: number, y: number) => (a.x - x) ** 2 + (a.y - y) ** 2;

/** A fresh spot to drift to round the hero, near the squad's own slot (artillery: behind the hero). */
function driftOf(run: WarpathRun, s: Squad, i: number): { ox: number; oy: number } {
  const sway = (rand(run) - 0.5) * 2 * F.wanderSway;
  const out = F.wanderIn + rand(run) * (F.wanderOut - F.wanderIn);
  const back = s.kind === 'artillery' || roleOf(s) === 'artillery';
  const a = back ? run.face + Math.PI + ((i % 3) - 1) * 0.5 + sway : i * GOLDEN + sway;
  const r = (back ? F.artilleryBack : F.ring + F.ringPer * Math.sqrt(i)) * out;
  return { ox: Math.cos(a) * r, oy: Math.sin(a) * r };
}

/** Infantry and lone heroes: a spot in cover within reach of the hero, in a feature not already full. */
function findCover(run: WarpathRun, s: Squad): { x: number; y: number } | undefined {
  const R2 = F.coverSeek;
  let best: { x: number; y: number } | undefined;
  let bestD = Infinity;
  for (const t of terrainNear(run.seed, run.hx - R2, run.hy - R2, run.hx + R2, run.hy + R2)) {
    if (t.kind !== 'cover' || (t.x - run.hx) ** 2 + (t.y - run.hy) ** 2 > R2 * R2) continue;
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

/** Those that dig in behind what's near. */
const COVER: SquadRole[] = ['gunline', 'mystic', 'support', 'hunter'];

/** Where a squad wants to stand: its cover if it holds some, else a spot it drifts to round the hero. */
function anchorOf(run: WarpathRun, s: Squad, i: number, dt: number): { x: number; y: number } {
  if (s.cover && (s.cover.x - run.hx) ** 2 + (s.cover.y - run.hy) ** 2 > F.coverLeash ** 2) delete s.cover;
  const w = (s.wander ??= { ...driftOf(run, s, i), t: 0 });
  w.t -= dt;
  if (w.t <= 0) {
    Object.assign(w, driftOf(run, s, i));
    w.t = F.wanderMin + rand(run) * (F.wanderMax - F.wanderMin);
    if (s.kind === 'foot' && !s.cover && COVER.includes(roleOf(s))) s.cover = findCover(run, s);
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

/** Start a charge from (x, y) through a point, and out the far side. */
function startRush(run: WarpathRun, s: Squad, x: number, y: number, tx: number, ty: number, len: number): void {
  const d = Math.hypot(tx - x, ty - y) || 1;
  const ux = (tx - x) / d;
  const uy = (ty - y) / d;
  s.rush = { x: x + ux * len, y: y + uy * len, t: R.rushTime, hit: [] };
  s.charged = R.rushTime;
  if (run.fx.length < 700) run.fx.push({ kind: 'dash', x, y, x2: s.rush.x, y2: s.rush.y, t: 0.45 });
}

/** A charge under way: straight on, running down all it passes. Returns where it's got to. */
function rushStep(run: WarpathRun, grid: Grid, s: Squad, si: number, px: number, py: number, dt: number, m: Mods): { x: number; y: number } {
  const r = s.rush!;
  const v = Math.max(R.rushMin, s.advance * W.hero.speedPer * R.dash);
  const d = Math.hypot(r.x - px, r.y - py) || 1;
  const go = Math.min(d, v * dt);
  const x = px + ((r.x - px) / d) * go;
  const y = py + ((r.y - py) / d) * go;
  r.t -= dt;
  s.charged = Math.max(s.charged ?? 0, R.firstBlows);
  const run_over: Enemy[] = [];
  grid.near(x, y, R.impactRadius, (e) => {
    if (r.hit.length + run_over.length >= R.impactCap) return true;
    if (!r.hit.includes(e.id)) run_over.push(e);
  });
  for (const e of run_over) {
    r.hit.push(e.id);
    rushBlow(run, grid, si, e, m);
  }
  if (r.t <= 0 || d <= go) {
    delete s.rush;
    s.charged = R.fight;
    s.rushCd = si === 0 ? R.heroRushEvery * m.cd : R.rushCd;
  }
  return { x, y };
}

/** A flyer's straight run: at the thickest pack near the hero and on past it, then round for another. */
function flyStep(run: WarpathRun, grid: Grid, s: Squad, dt: number): void {
  if (!s.pass || dist2(s, s.pass.x, s.pass.y) < 4) {
    const k = densest(grid, run.hx, run.hy, W.air.seek);
    const tx = k?.x ?? run.hx + (rand(run) - 0.5) * W.air.seek;
    const ty = k?.y ?? run.hy + (rand(run) - 0.5) * W.air.seek;
    const d = Math.hypot(tx - s.x, ty - s.y) || 1;
    s.pass = { x: tx + ((tx - s.x) / d) * W.air.over, y: ty + ((ty - s.y) / d) * W.air.over };
  }
  const d = Math.hypot(s.pass.x - s.x, s.pass.y - s.y) || 1;
  const go = Math.min(d, W.air.speed * dt);
  s.angle = Math.atan2(s.pass.y - s.y, s.pass.x - s.x);
  s.x += ((s.pass.x - s.x) / d) * go;
  s.y += ((s.pass.y - s.y) / d) * go;
  // Left far behind: a new run from where the hero's gone.
  if (dist2(s, run.hx, run.hy) > 60 * 60) delete s.pass;
}

/** A Phantom: blink into a knot, fight for a moment, blink back out. Returns true while it's in the pack. */
function blinkStep(run: WarpathRun, grid: Grid, s: Squad, si: number, i: number, dt: number, m: Mods): boolean {
  if ((s.stay ?? 0) > 0) {
    s.stay! -= dt;
    if (s.stay! > 0) return true;
    const a = i * GOLDEN + rand(run);
    if (run.fx.length < 700) run.fx.push({ kind: 'spell', x: s.x, y: s.y, n: 2, t: 0.4 });
    s.x = run.hx + Math.cos(a) * F.ring;
    s.y = run.hy + Math.sin(a) * F.ring;
    unblock(run.seed, s, 1.2);
    s.blink = R.blinkEvery * m.cd;
    return false;
  }
  s.blink = (s.blink ?? R.blinkEvery / 3) - dt;
  if (s.blink > 0) return false;
  const k = densest(grid, run.hx, run.hy, R.blinkSeek, R.knotMin);
  if (!k) { s.blink = 0.5; return false; }
  if (run.fx.length < 700) run.fx.push({ kind: 'spell', x: s.x, y: s.y, n: 2, t: 0.4 });
  s.x = k.x;
  s.y = k.y;
  unblock(run.seed, s, 1.2);
  s.stay = R.blinkStay;
  s.charged = R.firstBlows;
  run.fx.push({ kind: 'spell', x: s.x, y: s.y, n: 3, t: 0.5 });
  burst(run, grid, si, s.x, s.y, m);
  return true;
}

/** What arrives out of nowhere hits everything round it once. */
function burst(run: WarpathRun, grid: Grid, si: number, x: number, y: number, m: Mods): void {
  const s = run.squads[si];
  const g = bestMelee(s) ?? s.guns[0];
  if (!g) return;
  const near: Enemy[] = [];
  grid.near(x, y, R.heroSwarm, (e) => { near.push(e); return near.length >= R.impactCap; });
  for (const e of near) strike(run, grid, si, g, e, m, NO_AURA, false, false);
}

/** An Ambusher: off the field until a pack shows a flank, then in on it for a while. True while it holds its ground. */
function ambushStep(run: WarpathRun, grid: Grid, s: Squad, si: number, dt: number, m: Mods): boolean {
  if (s.reserve) {
    s.reserve -= dt;
    if (s.reserve > 0) return true;
    const k = densest(grid, run.hx, run.hy, R.deployLeash);
    if (!k) { s.reserve = 0.5; return true; }
    const a = Math.atan2(k.y - run.hy, k.x - run.hx) + (rand(run) < 0.5 ? 1 : -1) * Math.PI / 2;
    const p = { x: k.x + Math.cos(a) * R.knotR, y: k.y + Math.sin(a) * R.knotR };
    unblock(run.seed, p, 1.2);
    s.x = p.x;
    s.y = p.y;
    delete s.reserve;
    delete s.wander;
    delete s.cover;
    s.stay = R.ambushStay;
    s.charged = R.firstBlows;
    run.fx.push({ kind: 'land', x: s.x, y: s.y, n: 3, t: 0.5 });
    burst(run, grid, si, s.x, s.y, m);
    return true;
  }
  if (s.stay === undefined || (s.stay -= dt) <= 0 || dist2(s, run.hx, run.hy) > (R.deployLeash * 1.8) ** 2) {
    if (run.fx.length < 700) run.fx.push({ kind: 'land', x: s.x, y: s.y, n: 2, t: 0.4 });
    s.reserve = R.ambushWait;
    delete s.stay;
    return true;
  }
  return true;
}

/** Find (at most once a second) the spot this squad is going for. */
function look(run: WarpathRun, s: Squad, find: () => { x: number; y: number } | undefined): { x: number; y: number } | undefined {
  if (s.knot && s.knot.t > run.t) return s.knot;
  const p = find();
  if (p) s.knot = { x: p.x, y: p.y, t: run.t + 1 };
  else delete s.knot;
  return p;
}

/** Orders: where a squad wants to stand, by its archetype. */
function orders(run: WarpathRun, grid: Grid, s: Squad, si: number, dt: number): { x: number; y: number } {
  const anchor = anchorOf(run, s, si, dt);
  const stayPut = (leash: number) => {
    if (s.cover) return s.cover;
    if (dist2(s, run.hx, run.hy) < leash ** 2 && !s.homing) return { x: s.x, y: s.y };
    // Past the leash: back to the anchor, and hold again once it's there.
    s.homing = dist2(s, anchor.x, anchor.y) >= 1;
    return anchor;
  };
  const foe = (r: number) => grid.pick(s.x, s.y, r);
  switch (roleOf(s)) {
    case 'gunline': return stayPut(R.holdLeash);
    case 'artillery': return stayPut(R.deployLeash);
    case 'reaver': {
      const k = look(run, s, () => densest(grid, run.hx, run.hy, R.skirmishLeash));
      return k ?? anchor;
    }
    case 'charger': case 'phantom': {
      // Between rushes it fights whatever's closest.
      const e = (s.charged ?? 0) > 0 ? foe(8) : undefined;
      return e ?? anchor;
    }
    case 'hunter': {
      const k = look(run, s, () => grid.pick(run.hx, run.hy, R.huntR, true, (e) => !!e.boss || !!e.elite));
      if (!k) return anchor;
      const best = Math.max(...s.guns.map((g) => g.reach)) * 0.75;
      const d = Math.sqrt(dist2(s, k.x, k.y)) || 1;
      return d <= best ? { x: s.x, y: s.y } : { x: k.x + ((s.x - k.x) / d) * best, y: k.y + ((s.y - k.y) / d) * best };
    }
    case 'skirmisher': {
      const e = foe(R.kite);
      if (e) {
        const d = Math.sqrt(dist2(s, e.x, e.y)) || 1;
        return { x: s.x + ((s.x - e.x) / d) * 6, y: s.y + ((s.y - e.y) / d) * 6 };
      }
      const w = s.wander!;
      return { x: run.hx + Math.cos(run.face) * R.ahead + w.ox * 0.8, y: run.hy + Math.sin(run.face) * R.ahead + w.oy * 0.8 };
    }
    case 'bulwark': {
      const e = grid.pick(run.hx, run.hy, R.guard);
      if (!e) return anchor;
      const d = Math.hypot(e.x - run.hx, e.y - run.hy) || 1;
      const out = Math.min(R.guardOut, d);
      const sway = ((si % 3) - 1) * 0.7;
      const a = Math.atan2(e.y - run.hy, e.x - run.hx) + sway;
      return { x: run.hx + Math.cos(a) * out, y: run.hy + Math.sin(a) * out };
    }
    case 'support': {
      let best: Squad | undefined;
      let worst = 1;
      for (let i = 1; i < run.squads.length; i++) {
        const q = run.squads[i];
        if (q === s || q.alive <= 0 || q.reserve || q.fort || dist2(q, run.hx, run.hy) > R.guard ** 2) continue;
        const left = q.alive / q.size;
        if (left < worst) { worst = left; best = q; }
      }
      return best ? { x: best.x + 1.5, y: best.y + 1.5 } : anchor;
    }
    default: return anchor;
  }
}

/** A Bulwark's stomp when foes are on it. */
function stompStep(run: WarpathRun, grid: Grid, s: Squad, si: number, dt: number): void {
  s.stomp = (s.stomp ?? R.stompEvery) - dt;
  if (s.stomp > 0) return;
  if (!grid.pick(s.x, s.y, R.stompR)) { s.stomp = 0.25; return; }
  s.stomp = R.stompEvery;
  blastAt(run, grid, si, s.x, s.y, R.stompR, s.size + 2 * s.tough, 1, s.quality, 'land');
}

/** Boons, charges and Fear wear off. */
function tick(s: Squad, dt: number): void {
  if (s.boon) for (const k in s.boon) {
    const id = k as keyof typeof s.boon;
    s.boon[id] = (s.boon[id] ?? 0) - dt;
    if ((s.boon[id] ?? 0) <= 0) delete s.boon[id];
  }
  if (s.charged && !s.rush) s.charged = Math.max(0, s.charged - dt);
  if (s.shaken) s.shaken = Math.max(0, s.shaken - dt);
  if (s.rushCd) s.rushCd = Math.max(0, s.rushCd - dt);
}

/** A wiped squad comes back at the hero's side, not where it fell. */
function regroup(run: WarpathRun, s: Squad): void {
  const a = rand(run) * Math.PI * 2;
  s.x = run.hx + Math.cos(a) * F.ring;
  s.y = run.hy + Math.sin(a) * F.ring;
  unblock(run.seed, s, 1.2);
  delete s.wander;
  delete s.cover;
  delete s.rush;
  delete s.pass;
  delete s.knot;
}

/** Every unit back to full strength: lost models stand again, wiped squads regroup, a wrecked fort drops back in.
 *  Returns how many units it brought back. */
export function reviveAll(run: WarpathRun): number {
  const regen = W.losses.regen * mods(run).modelRegen;
  let n = 0;
  for (const s of run.squads.slice(1)) {
    if (s.fort) {
      if (s.fort.hp < s.fort.maxHp) n++;
      if (s.fort.hp <= 0) s.fort.down = Math.min(s.fort.down, 0.01);
      s.fort.hp = s.fort.maxHp;
    }
    if (s.alive >= s.size && !s.wounds) continue;
    if (!s.fort) n++;
    if (s.alive <= 0 && s.kind !== 'air' && !s.fort) regroup(run, s);
    s.alive = s.size;
    s.wounds = 0;
    s.regen = regen;
    if (!s.reserve && run.fx.length < 700) run.fx.push({ kind: 'boon', x: s.x, y: s.y, n: 2, t: 0.6 });
  }
  return n;
}

/** Squads move, forts drop, and lost models come back. */
export function squadStep(run: WarpathRun, grid: Grid, dt: number): void {
  const m = mods(run);
  // A Transport nearby: models come back faster.
  const ferries = run.squads.filter((s) => s.traits?.ferry && s.alive > 0);
  run.squads.forEach((s, si) => {
    tick(s, dt);
    if (si === 0) return;
    // Lost models come back one at a time (wiped squads too, once one does).
    if (s.alive < s.size && s.kind !== 'fort') {
      const ferry = ferries.some((f) => f !== s && dist2(f, s.x, s.y) < R.ferryReach ** 2);
      s.regen -= dt * (ferry ? R.ferryRate : 1);
      if (s.regen <= 0) {
        if (s.alive <= 0 && s.kind !== 'air') regroup(run, s);
        s.alive += 1;
        s.regen = W.losses.regen * m.modelRegen;
      }
    } else s.regen = W.losses.regen * m.modelRegen;
    if (s.kind === 'fort') return fortStep(run, grid, s, si, dt);
    if (s.alive <= 0) return;
    const role = roleOf(s);
    if (role === 'flyer') return flyStep(run, grid, s, dt);
    if (s.rush) {
      const p = rushStep(run, grid, s, si, s.x, s.y, dt, m);
      s.x = p.x;
      s.y = p.y;
      if (!s.rush) unblock(run.seed, s, 1.2);
      return;
    }
    if (role === 'charger' && !s.rushCd) {
      const k = densest(grid, s.x, s.y, R.rushLeash);
      if (k && dist2(k, run.hx, run.hy) < (R.rushLeash * 1.3) ** 2) {
        const d = Math.hypot(k.x - s.x, k.y - s.y);
        startRush(run, s, s.x, s.y, k.x, k.y, d + R.rushExtra);
        return;
      }
      s.rushCd = 0.25;
    }
    if (role === 'phantom' && blinkStep(run, grid, s, si, si, dt, m)) return;
    if (role === 'ambusher') {
      ambushStep(run, grid, s, si, dt, m);
      if (s.reserve) return;
      const e = grid.pick(s.x, s.y, 8);
      if (e) moveTo(run, s, e.x, e.y, dt);
      else s.held = (s.held ?? 0) + dt;
      return;
    }
    if (role === 'bulwark') stompStep(run, grid, s, si, dt);
    // Scouts pull Shards in as they range.
    if (s.traits?.scout && Math.floor(run.t * 4) !== Math.floor((run.t - dt) * 4)) {
      for (const p of run.pickups) if (p.kind === 'gem' && dist2(p, s.x, s.y) < R.scoutPull ** 2) p.pulled = true;
    }
    const goal = orders(run, grid, s, si, dt);
    moveTo(run, s, goal.x, goal.y, dt);
  });
}

/** A step towards a spot: heavy ones lag, difficult ground slows (not Striders), and it counts how long it's stood still. */
function moveTo(run: WarpathRun, s: Squad, gx: number, gy: number, dt: number): void {
  const dx = gx - s.x;
  const dy = gy - s.y;
  const d = Math.hypot(dx, dy);
  if (d < 0.3) { s.held = (s.held ?? 0) + dt; return; }
  s.held = 0;
  let v = speedOf(s) * (d > 15 ? 2 : d > 6 ? 1.3 : 1);
  if (s.kind === 'heavy') v *= Math.min(1, Math.max(0.4, d / (F.lag * F.heavyLag)));
  if (!s.body?.strider && terrainAt(run.seed, s.x, s.y)?.kind === 'difficult') v *= 0.7;
  const go = Math.min(d, v * dt);
  s.x += (dx / d) * go;
  s.y += (dy / d) * go;
  if (!s.body?.flying) unblock(run.seed, s, 1.2);
  // Far behind (stuck on terrain): catch up.
  if ((s.x - run.hx) ** 2 + (s.y - run.hy) ** 2 > 40 * 40) { s.x = gx; s.y = gy; }
}

/** The hero's button and any charge under way. A charge goes the way it's steered, untouchable; a blink jumps and bursts
 *  at both ends. */
export function heroAct(run: WarpathRun, grid: Grid, input: { dx: number; dy: number; act?: boolean }, dt: number): void {
  const h = run.squads[0];
  const m = mods(run);
  if (h.rush) {
    const p = rushStep(run, grid, h, 0, run.hx, run.hy, dt, m);
    run.hx = p.x;
    run.hy = p.y;
    run.iframes = Math.max(run.iframes, dt * 2);
    if (!h.rush && !h.body?.flying) {
      const q = { x: run.hx, y: run.hy };
      unblock(run.seed, q, 0.8);
      run.hx = q.x;
      run.hy = q.y;
    }
    return;
  }
  if (!input.act || h.rushCd) return;
  const power = heroPowerOf(h);
  if (!power) return;
  const len = Math.hypot(input.dx, input.dy);
  const a = len > 0.05 ? Math.atan2(input.dy, input.dx) : run.face;
  if (power === 'rush') {
    startRush(run, h, run.hx, run.hy, run.hx + Math.cos(a), run.hy + Math.sin(a), R.heroRush);
    return;
  }
  burst(run, grid, 0, run.hx, run.hy, m);
  run.fx.push({ kind: 'spell', x: run.hx, y: run.hy, n: R.heroSwarm, t: 0.4 });
  const p = { x: run.hx + Math.cos(a) * R.heroBlink, y: run.hy + Math.sin(a) * R.heroBlink };
  if (!h.body?.flying) unblock(run.seed, p, 0.8);
  run.hx = p.x;
  run.hy = p.y;
  run.iframes = Math.max(run.iframes, R.heroBlinkSafe);
  h.charged = R.firstBlows;
  h.rushCd = R.heroBlinkEvery * m.cd;
  burst(run, grid, 0, run.hx, run.hy, m);
  run.fx.push({ kind: 'spell', x: run.hx, y: run.hy, n: R.heroSwarm, t: 0.5 });
}

/** The hero button's cooldown as a share left (0 ready, 1 just used), or undefined if the hero has none. */
export function heroCooldown(run: WarpathRun): { power: 'rush' | 'blink'; left: number } | undefined {
  const h = run.squads[0];
  const power = heroPowerOf(h);
  if (!power) return undefined;
  const full = (power === 'rush' ? R.heroRushEvery : R.heroBlinkEvery) * mods(run).cd;
  return { power, left: h.rush ? 1 : Math.min(1, (h.rushCd ?? 0) / full) };
}

/** The hero's speed in inches a second. */
export function heroSpeed(run: WarpathRun, fear: boolean): number {
  const h = run.squads[0];
  const t = h.body?.strider ? undefined : terrainAt(run.seed, run.hx, run.hy);
  return h.advance * W.hero.speedPer * mods(run).speed * (1 + W.levels.speed * h.level) * (fear ? 0.7 : 1) * (t?.kind === 'difficult' ? 0.6 : 1) * (boon(h, 'speed') ? R.speedBoon : 1);
}
