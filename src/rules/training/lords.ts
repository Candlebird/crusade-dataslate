import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { centreOf, dist, mapOf, towers } from './board';
import { lordIndex, TRICK_NAMES } from './lordPick';
import { wrench } from './nemesis';
import { lateHp, move, spawnOne } from './waves';
import type { Enemy, RunLord, SpawnPlan, Tower, TowerGun, TrainingRun } from './types';

// The campaign's real Echo Lords on the field (F3): each leads its boss wave (lordPick.ts says which), tougher by tier,
// with its one trick mapped to the maze. Slain, it goes in the bestiary as slain (tally.ts, bestiary.ts).

const L = TRAINING.nexus.lords;
const T = TRAINING.nexus.tricks;

/** The real lord an enemy is, if it is one. */
export const lordOf = (run: TrainingRun, e: Enemy): RunLord | undefined => (e.lord ? run.nexus?.lords[e.lord.i] : undefined);

/** A wave's plans with its real lord in the boss's place (not on the nemesis's wave): wounds × lords.hp by tier. */
export function lordPlan(run: TrainingRun, plans: SpawnPlan[]): SpawnPlan[] {
  const i = lordIndex(run, run.wave);
  const l = i === undefined ? undefined : run.nexus?.lords[i];
  const boss = plans.find((s) => TRAINING_ENEMIES[s.kind].spawn === 'boss' && !s.nemesis);
  if (!l || !boss) return plans;
  boss.lord = i;
  boss.hp *= L.hp[l.tier];
  run.log.push(`${l.name} (${l.tier}) leads the wave: ${TRICK_NAMES[l.trick]}.`);
  return plans;
}

/** Seconds between goes of a timed trick (0: it has none). */
const every = (k: RunLord['trick']) =>
  k === 'teleport' ? T.teleport.every : k === 'shield' ? T.shield.every : k === 'summon' ? T.summon.every
    : k === 'burst' ? T.burst.every : k === 'regen' ? T.regen.every : k === 'storm' ? T.storm.every : 0;

/** Towers within `r` cells of an enemy. */
const towersNear = (run: TrainingRun, e: Enemy, r: number): Tower[] =>
  towers(run).filter((t) => { const c = centreOf(t); return dist(c.x, c.y, e.x, e.y) <= r; });

/** One go of a timed trick. */
function act(run: TrainingRun, e: Enemy, k: RunLord['trick']) {
  const s = e.lord!;
  if (k === 'teleport') {
    wrench(run, e);
    move(e.flies ? undefined : mapOf(run), e, T.teleport.cells);
  } else if (k === 'shield') {
    s.ward = e.maxHp * T.shield.share;
  } else if (k === 'summon') {
    const hp = TRAINING_ENEMIES.swarm.hp * TRAINING.enemyHp * lateHp(run.wave) * T.summon.hp;
    for (let i = 0; i < T.summon.n; i++) {
      spawnOne(run, { kind: 'swarm', at: run.t, leg: e.leg, x: e.x + (i - (T.summon.n - 1) / 2) * T.summon.spread, y: e.y, hp, flies: e.flies });
    }
  } else if (k === 'burst') {
    s.burst = T.burst.secs;
  } else if (k === 'regen') {
    e.hp = Math.min(e.maxHp, e.hp + e.maxHp * T.regen.share);
  } else if (k === 'storm') {
    for (const t of towersNear(run, e, T.storm.radius)) for (const g of t.guns) Object.assign(g, { cd: Math.max(g.cd, T.storm.secs), pending: 0 });
  }
}

/** Real lords' tricks, every step after the nemesis's: Dread's -1 to hit on towers near it, the timed tricks (a ward
 *  is up from the start), and a Surge wearing off. */
export function lordTick(run: TrainingRun, dt: number): void {
  for (const e of run.enemies) {
    const l = lordOf(run, e);
    const s = e.lord;
    if (!l || !s || e.hp <= 0) continue;
    if (!s.armed) Object.assign(s, { armed: true, next: every(l.trick), ward: l.trick === 'shield' ? e.maxHp * T.shield.share : 0 });
    if (s.burst > 0) s.burst = Math.max(0, s.burst - dt);
    if (l.trick === 'fear') for (const t of towersNear(run, e, T.fear.radius)) t.boost.hit -= 1;
    if (every(l.trick) && (s.next -= dt) <= 0) {
      s.next += every(l.trick);
      act(run, e, l.trick);
    }
  }
}

/** A real lord's to-hit modifier against a gun: Mirror Veil, -1 to shots. */
export const lordHit = (run: TrainingRun, g: TowerGun, e: Enemy) => (!g.melee && lordOf(run, e)?.trick === 'stealth' ? -1 : 0);

/** Damage that gets through to a real lord: Umbral Hide cuts shots from afar, a ward soaks what it can. */
export function lordDmg(run: TrainingRun, by: Tower | undefined, e: Enemy, dmg: number, how: 'shot' | 'melee' | 'other'): number {
  const l = lordOf(run, e);
  if (!l || !e.lord) return dmg;
  if (l.trick === 'armour' && how === 'shot' && by) {
    const c = centreOf(by);
    if (dist(c.x, c.y, e.x, e.y) > T.armour.from) dmg *= T.armour.mul;
  }
  const soak = Math.min(e.lord.ward, dmg);
  e.lord.ward -= soak;
  return dmg - soak;
}
