import { rand } from '../training/rng';
import { blastAt, densest, hurtEnemy } from './combat';
import { DOCTRINES, STRATAGEMS } from './data';
import type { Grid } from './field';
import { doc, minutes, mods } from './mods';
import type { WarpathRun } from './types';

// The doctrines that act on the field rather than turn a stat: blades, shells, Shard blasts and martyrs. Their blows grow
// with the clock, so a pick made early still counts once the swarm has thickened.

const D = DOCTRINES;

/** A blast's Deadly now: one more every four minutes. */
const deadlyNow = (run: WarpathRun) => 1 + Math.floor(minutes(run) / 4);

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
}
