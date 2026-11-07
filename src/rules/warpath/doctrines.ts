import { rand } from '../training/rng';
import { blastAt, densest, hurtEnemy } from './combat';
import { DOCTRINES, STRATAGEMS, TROPHIES } from './data';
import type { Grid } from './field';
import { deadlyNow, doc, minutes, mods } from './mods';
import type { WarpathRun } from './types';

// The doctrines that act on the field rather than turn a stat: blades, shells, Shard blasts and martyrs. Their blows grow
// with the clock, so a pick made early still counts once the swarm has thickened.

const D = DOCTRINES;

/** Where each of the hero's blades is now (none without the doctrine). */
export function bladesOf(run: WarpathRun): { x: number; y: number; a: number }[] {
  const n = doc(run, 'whirlingBlades');
  const B = D.whirlingBlades;
  const storm = run.stratagems?.stormOfSteel;
  const r = B.radius + (storm ? STRATAGEMS.stormOfSteel.reach : 0);
  const spin = B.spin * (storm ? STRATAGEMS.stormOfSteel.spin : 1);
  return Array.from({ length: n }, (_, i) => {
    const a = run.t * spin + (i / n) * Math.PI * 2;
    return { x: run.hx + Math.cos(a) * r, y: run.hy + Math.sin(a) * r, a };
  });
}

function cutWithBlades(run: WarpathRun, grid: Grid): void {
  const B = D.whirlingBlades;
  const dmg = B.dmg * (1 + B.grow * minutes(run)) * mods(run).dmg;
  for (const b of bladesOf(run)) {
    let left = B.most;
    grid.near(b.x, b.y, B.width, (e) => {
      if (e.hp <= 0 || e.emerge) return false;
      hurtEnemy(run, 0, e, dmg);
      return --left <= 0;
    });
  }
}

function fireMission(run: WarpathRun, grid: Grid, shells: number): void {
  const F = D.fireMission;
  const lands = run.stratagems?.dangerClose ? 2 : 1;
  for (let i = 0; i < shells; i++) {
    // Each shell looks somewhere a little different, so a salvo doesn't land in one hole.
    const at = densest(grid, run.hx + (rand(run) - 0.5) * F.reach, run.hy + (rand(run) - 0.5) * F.reach, F.reach / 2);
    if (!at) continue;
    for (let j = 0; j < lands; j++) blastAt(run, grid, 0, at.x, at.y, F.radius, F.hits, F.ap, F.quality, 'boom', { deadly: deadlyNow(run) });
  }
}

/** Trophies at work: a boss's trick, turned to the hero's use. */
function trophyStep(run: WarpathRun, grid: Grid, dt: number): void {
  const c = (run.docClock ??= {});
  const won = run.trophies ?? {};
  const T = TROPHIES;
  const quality = Math.min(4, run.squads[0].quality);
  if (won.wardStone) {
    c.ward = (c.ward ?? T.wardStone.every) - dt;
    if (c.ward <= 0) {
      c.ward = T.wardStone.every;
      run.shield = Math.max(run.shield ?? 0, run.maxHp * T.wardStone.shield);
    }
  }
  if (won.stormcaller) {
    c.storm = (c.storm ?? T.stormcaller.every) - dt;
    if (c.storm <= 0) {
      const at = densest(grid, run.hx, run.hy, T.stormcaller.reach);
      c.storm = at ? T.stormcaller.every : 0.5;
      if (at) blastAt(run, grid, 0, at.x, at.y, T.stormcaller.radius, T.stormcaller.hits, T.stormcaller.ap, quality, 'spell', { deadly: deadlyNow(run) });
    }
  }
  if (won.burstCore) {
    c.burst = (c.burst ?? 0) - dt;
    if (run.struck && c.burst <= 0) {
      c.burst = T.burstCore.every;
      blastAt(run, grid, 0, run.hx, run.hy, T.burstCore.radius, T.burstCore.hits, T.burstCore.ap, quality, 'boom', { deadly: deadlyNow(run) });
    }
  }
  run.struck = false;
  if (won.livingHeart && run.hp > 0 && run.hp < run.maxHp * T.livingHeart.below) run.hp = Math.min(run.maxHp, run.hp + run.maxHp * T.livingHeart.heal * dt);
}

/** Triage: a model back on whichever unit has lost the most. */
function triageStep(run: WarpathRun, dt: number): void {
  const c = (run.docClock ??= {});
  c.triage = (c.triage ?? STRATAGEMS.triage.every) - dt;
  if (c.triage > 0) return;
  c.triage = STRATAGEMS.triage.every;
  let best;
  let worst = 1;
  for (const q of run.squads.slice(1)) {
    if (q.fort || q.alive <= 0 || q.reserve || q.alive / q.size >= worst) continue;
    worst = q.alive / q.size;
    best = q;
  }
  if (!best) return;
  best.alive += 1;
  if (run.fx.length < 700) run.fx.push({ kind: 'heal', x: best.x, y: best.y - 2, n: 1, t: 0.8 });
}

/** The doctrines' own clocks, once a step. */
export function doctrineStep(run: WarpathRun, grid: Grid, dt: number): void {
  const c = (run.docClock ??= {});
  const quality = Math.min(4, run.squads[0].quality);
  const chain = run.stratagems?.chainReaction ? STRATAGEMS.chainReaction.mul : 1;

  if (doc(run, 'whirlingBlades') > 0) {
    c.blade = (c.blade ?? 0) - dt;
    if (c.blade <= 0) {
      c.blade = D.whirlingBlades.tick;
      cutWithBlades(run, grid);
    }
  }

  const shells = doc(run, 'fireMission');
  if (shells > 0) {
    c.mission = (c.mission ?? D.fireMission.every) - dt;
    if (c.mission <= 0) {
      c.mission = D.fireMission.every;
      fireMission(run, grid, shells);
    }
  }

  const V = D.volatileShards;
  if ((run.shardCharge ?? 0) >= V.every) {
    run.shardCharge = 0;
    const l = doc(run, 'volatileShards');
    blastAt(run, grid, 0, run.hx, run.hy, (V.radius + l) * chain, Math.round((V.hits + V.perLevel * l) * chain), V.ap, quality, 'spell', { deadly: deadlyNow(run) });
  }

  // Martyrs go off two a step, so a squad wiped at once can't stall a frame.
  const M = D.martyrdom;
  for (let i = 0; i < 2 && run.martyrs?.length; i++) {
    const p = run.martyrs.shift()!;
    blastAt(run, grid, 0, p.x, p.y, M.radius * chain, Math.round(M.hits * doc(run, 'martyrdom') * chain), M.ap, quality, 'boom', { deadly: deadlyNow(run) });
  }

  if (run.stratagems?.triage) triageStep(run, dt);
  trophyStep(run, grid, dt);
}
