import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from '../downtimeData';
import { affixPace, affixPlan } from './affixes';
import { BASE, dist, mapOf } from './board';
import { LEGS, N, WAYPOINTS, centre, heading, mapFor, route, type MapState } from './map';
import { budgetMul } from './nexus';
import { pick, rand, randInt, type Rng } from './rng';
import { waveDice } from './siege';
import { noteMet } from './tally';
import type { Enemy, SpawnPlan, Tile, TrainingRun } from './types';
import { costOf, countFor, isElite, waveKind } from './waveKinds';

// Waves: what comes (budget by force points, one kind a wave, elites, flyers, bosses, scouts, ambushers, HP scaling),
// spawning and walking.

const W = TRAINING.wave;
const R = TRAINING.route;

/** Every TRAINING.wave.flyEvery-th wave flies. */
export const isFlyWave = (w: number) => w > 0 && w % W.flyEvery === 0;

/** Every TRAINING.wave.bossEvery-th wave brings an Echo Lord. */
export const isBossWave = (w: number) => w > 0 && w % W.bossEvery === 0;

/** Every TRAINING.wave.flyBossEvery-th wave the boss flies (its escorts walk). */
export const isFlyBossWave = (w: number) => w > 0 && w % W.flyBossEvery === 0;

/** What wave `w` is, for the HUD: 'Flying', 'Boss', or both. */
export const waveTags = (w: number): string[] => [
  ...(isFlyWave(w) || isFlyBossWave(w) ? ['Flying'] : []),
  ...(isBossWave(w) ? ['Boss'] : []),
];

/** What wave `w`'s enemies cost in all, for a force of `power` points: base a perPoints, × w^curve × growth^(w−1). */
export const waveBudget = (power: number, w: number) => W.base * (power / W.perPoints) * w ** W.curve * W.growth ** (w - 1);

/** How many times its wounds every enemy has on wave `w`: hpGrowth a wave from hpFrom to hpTo, lateGrowth a wave past it. */
export const lateHp = (w: number) =>
  W.hpGrowth ** (Math.min(Math.max(w, W.hpFrom), W.hpTo) - W.hpFrom) * W.lateGrowth ** Math.max(0, w - W.hpTo);

/** How tough a flyer is on wave `w` beside a walker: flyHp, fading flyFade a wave (the guns on the lane grow slower than the maze). */
export const flyHpAt = (w: number) => W.flyHp * W.flyFade ** (w - 1);

/** How tough the Echo Lord is on wave `w`, beside its share of the budget: bossHp by boss wave, the last holding on. */
export const bossHpAt = (w: number) => W.bossHp[Math.min(W.bossHp.length, Math.max(1, Math.floor(w / W.bossEvery))) - 1];

/** Wave `w`'s spawns for a force of `power` points, sorted by time (rolls `r`): one kind (waveKinds.ts), as many as
 *  the budget buys (past maxCount, or flyMax on a flying wave, the rest makes them tougher), every eliteEvery-th an
 *  elite; a boss wave's escorts take `escorts` of the budget. A flying wave brings flyShare of the budget, its flyers
 *  flyHpAt as tough; on a boss wave that would fly only the boss flies (flyHpAt × flyBossHp as tough), its escorts walk. */
export function planFor(r: Rng, power: number, w: number): SpawnPlan[] {
  const boss = isBossWave(w);
  const skyBoss = boss && (isFlyWave(w) || isFlyBossWave(w));
  // Flyers skip the maze, so a flying wave brings only flyShare of the budget (a flying boss's escorts walk).
  const flies = !boss && isFlyWave(w);
  const budget = waveBudget(power, w) * (flies ? W.flyShare : 1);
  const minions = boss ? budget * W.escorts : budget;
  const kind = waveKind(r, w, flies);
  const { n, hpMul } = countFor(kind, minions, (flies ? W.flyMax : W.maxCount) - (boss ? 1 : 0));
  const hp = hpMul * lateHp(w) * TRAINING.enemyHp * (flies ? flyHpAt(w) : 1);
  const bossMul = Math.max(W.bossMin, (budget - minions) / costOf('lord'));

  const out: SpawnPlan[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    out.push(spawnPlan(r, kind, at, hp, flies, isElite(w, i)));
    at += W.gap * (0.7 + 0.6 * rand(r));
  }
  if (boss) {
    const s = spawnPlan(r, 'lord', at / 2, 1, skyBoss, false);
    s.hp = TRAINING_ENEMIES.lord.hp * TRAINING.enemyHp * lateHp(w) * bossMul * bossHpAt(w) * (skyBoss ? flyHpAt(w) * W.flyBossHp : 1);
    out.push(s);
  }
  return out.sort((a, b) => a.at - b.at);
}

/** One spawn: where it comes in (Scouts on pad scoutAt), its wounds (Scouts, Ambushers and elites adjusted). */
function spawnPlan(r: Rng, kind: TrainingEnemyKind, at: number, hpMul: number, flies: boolean, elite: boolean): SpawnPlan {
  const def = TRAINING_ENEMIES[kind];
  const leg = def.spawn === 'scout' ? R.scoutAt : 0;
  const c = centre(WAYPOINTS[leg]);
  const share = def.spawn === 'scout' ? W.scoutHp : def.spawn === 'ambush' ? W.ambushHp : 1;
  const hp = def.hp * hpMul * share * (elite ? W.eliteHp : 1);
  const x = c.x + (rand(r) - 0.5) * 0.6;
  const y = c.y + (rand(r) - 0.5) * 0.6;
  return { kind, at, leg, x, y, hp, flies, ...(elite ? { elite } : {}) };
}

/** Wave `w`'s spawns, sorted by time, rolling `r`: the Nexus's budget and affixes on them (nexus.ts, affixes.ts). */
const nexusWave = (r: Rng, run: TrainingRun, w: number) => affixPlan(r, run, planFor(r, run.power * budgetMul(run), w));

/** Wave `w`'s spawns, sorted by time (rolls the run's dice; a siege's own for the wave). */
export const planWave = (run: TrainingRun, w: number): SpawnPlan[] => nexusWave(waveDice(run, w, run), run, w);

/** The next wave as startWave will plan it, without touching the run (rolls on a copy of the dice). */
export const previewWave = (run: TrainingRun): SpawnPlan[] => nexusWave(waveDice(run, run.wave + 1, { rng: run.rng }), run, run.wave + 1);

/** A wave's spawns grouped by kind, for the preview: how many, how many elites, a plain one's wounds, and if they fly. */
export interface PreviewGroup {
  kind: TrainingEnemyKind;
  n: number;
  elites: number;
  hp: number;
  flies: boolean;
}

export function previewGroups(plans: SpawnPlan[]): PreviewGroup[] {
  const groups = new Map<TrainingEnemyKind, PreviewGroup>();
  for (const s of plans) {
    const g = groups.get(s.kind) ?? { kind: s.kind, n: 0, elites: 0, hp: 0, flies: s.flies };
    g.n += 1;
    if (s.elite) g.elites += 1;
    else g.hp = Math.round(s.hp);
    if (!g.hp) g.hp = Math.round(s.hp / W.eliteHp);
    groups.set(s.kind, g);
  }
  return [...groups.values()];
}

/** The wave's one kind (not the boss), for the preview and the log. */
export const mainKind = (plans: SpawnPlan[]): TrainingEnemyKind | undefined =>
  plans.find((s) => TRAINING_ENEMIES[s.kind].spawn !== 'boss')?.kind;

/** Does the size×size patch at `a` share a cell with the 2×2 area at `t`? */
const touches = (a: Tile, s: number, t: Tile) => a.x <= t.x + 1 && t.x <= a.x + s - 1 && a.y <= t.y + 1 && t.y <= a.y + s - 1;

/** Cover patches for a run: `n` of them, TRAINING.cover.onRoute of them on `route` cells (the empty map's route). */
export function layCover(r: Rng, n: number, route: Tile[], taken: Tile[] = []): Tile[] {
  const s = TRAINING.cover.size;
  const half = Math.floor(s / 2);
  const onRoute = Math.round(n * TRAINING.cover.onRoute);
  const out: Tile[] = [];
  const ok = (a: Tile) =>
    a.x >= 0 && a.y >= 0 && a.x + s <= N && a.y + s <= N
    && !WAYPOINTS.some((t) => touches(a, s, t))
    && ![...taken, ...out].some((c) => Math.abs(c.x - a.x) < s && Math.abs(c.y - a.y) < s);
  for (let guard = 0; guard < 500 && out.length < n; guard++) {
    const c = out.length < onRoute && route.length ? pick(r, route) : undefined;
    const a = c ? { x: c.x - half, y: c.y - half } : { x: randInt(r, 0, N - s), y: randInt(r, 0, N - s) };
    if (ok(a)) out.push(a);
  }
  return out;
}

/** A new run's cover: TRAINING.cover.patches patches (and `extra` more: the Derelict Fleet), biased to the empty map's route. */
export const runCover = (r: Rng, extra = 0): Tile[] =>
  layCover(r, randInt(r, TRAINING.cover.patches[0], TRAINING.cover.patches[1]) + extra, route(mapFor([])));

/** An enemy on the field from a spawn plan (id run.nextId++), met for the bestiary. A nemesis plan gets its tricks
 *  through `nem` (nemesis.ts sets them up), a real lord's through `lord` (lords.ts); an Armoured one its `hard`. */
export function spawnOne(run: TrainingRun, s: SpawnPlan): Enemy {
  const next = centre(WAYPOINTS[Math.min(LEGS, s.leg + 1)]);
  const e: Enemy = {
    id: run.nextId++, kind: s.kind, x: s.x, y: s.y, leg: s.leg, face: Math.atan2(next.y - s.y, next.x - s.x),
    hp: s.hp, maxHp: s.hp, flies: s.flies, ...(s.elite ? { elite: true } : {}), status: {}, dots: [], regrab: 0,
    ...(s.nemesis ? { nem: { born: run.t, speed: 1, hard: 0, next: 0, regen: 0 } } : {}),
    ...(s.lord !== undefined ? { lord: { i: s.lord, next: 0, ward: 0, burst: 0 } } : {}),
    ...(s.hard ? { hard: s.hard } : {}),
  };
  run.enemies.push(e);
  noteMet(run, e);
  return e;
}

/** Move due spawns from run.queue into run.enemies. */
export function spawnDue(run: TrainingRun): void {
  while (run.queue.length && run.queue[0].at <= run.t) spawnOne(run, run.queue.shift()!);
}

/** An enemy's speed now, in cells a second (slow, daze; a nemesis's rage and Vengeful; a real lord's Surge; the
 *  Nexus's Swift, Warp Currents and Vengeful rushes). */
export function speedOf(run: TrainingRun, e: Enemy): number {
  const slow = (e.status.slow ?? 0) > 0 ? TRAINING.slowMul : 1;
  const daze = (e.status.daze ?? 0) > 0 ? TRAINING.dazeMul : 1;
  const surge = (e.lord?.burst ?? 0) > 0 ? TRAINING.nexus.tricks.burst.mul : 1;
  return TRAINING_ENEMIES[e.kind].speed * TRAINING.walkMul * slow * daze * (e.nem?.speed ?? 1) * surge * affixPace(run, e);
}

/** Base HP an enemy costs if it gets through: its own leak, or leak.elite for an elite; a boss its leak × the share
 *  of its wounds left (rounded up), never below leak.bossMin. */
export function leakCost(e: Enemy): number {
  const def = TRAINING_ENEMIES[e.kind];
  if (def.spawn !== 'boss') return Math.max(def.leak, e.elite ? TRAINING.leak.elite : 0);
  return Math.max(TRAINING.leak.bossMin, Math.ceil(def.leak * Math.min(1, Math.max(0, e.hp) / e.maxHp)));
}

/** Is it standing still this step: held, stunned or dead. */
const still = (e: Enemy) => e.hp <= 0 || e.heldBy !== undefined || (e.status.stun ?? 0) > 0;

/** Has it reached the base. */
export const atBase = (e: Enemy) => e.leg >= LEGS - 1 && dist(e.x, e.y, BASE.x, BASE.y) <= BASE.radius;

/**
 * Move an enemy `step` cells along its route: a walker cell to cell down the flow field, a flyer straight for the next
 * pad. Reaching a pad's middle it starts the next leg; an Ambusher reaching pad ambushFrom comes out on pad ambushAt.
 */
export function move(m: MapState | undefined, e: Enemy, step: number): void {
  for (let guard = 0; guard < 16 && step > 1e-9 && !atBase(e); guard++) {
    const goal = centre(WAYPOINTS[e.leg + 1]);
    const to = e.flies || !m ? goal : heading(m, e.leg, e.x, e.y);
    const d = dist(e.x, e.y, to.x, to.y);
    if (d > 1e-9) e.face = Math.atan2(to.y - e.y, to.x - e.x);
    if (d > step) {
      e.x += ((to.x - e.x) / d) * step;
      e.y += ((to.y - e.y) / d) * step;
      return;
    }
    e.x = to.x;
    e.y = to.y;
    step -= d;
    if (e.leg < LEGS - 1 && to.x === goal.x && to.y === goal.y) {
      e.leg += 1;
      if (TRAINING_ENEMIES[e.kind].spawn === 'ambush' && !e.jumped && e.leg === R.ambushFrom) {
        const p = centre(WAYPOINTS[R.ambushAt]);
        Object.assign(e, { x: p.x, y: p.y, leg: R.ambushAt, jumped: true });
        return;
      }
    }
  }
}

/** Walk every enemy not held or stunned (flyers straight pad to pad); ambush jumps; leaks cost run.baseHp, count run.leaked. */
export function walk(run: TrainingRun, dt: number): void {
  let m: MapState | undefined;
  const gone = new Set<number>();
  for (const e of run.enemies) {
    if (still(e)) continue;
    if (!e.flies) m ??= mapOf(run);
    move(m, e, speedOf(run, e) * dt);
    if (atBase(e)) {
      run.baseHp = Math.max(0, run.baseHp - leakCost(e));
      run.leaked += 1;
      gone.add(e.id);
    }
  }
  if (gone.size) run.enemies = run.enemies.filter((e) => !gone.has(e.id));
}
