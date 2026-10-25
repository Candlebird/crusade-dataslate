import type { Unit } from '../../model/types';
import { hasRule, levelForXp } from '../engine';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { pieceById } from './board';
import { luckCap, mendPerk, thrifty } from './drill';
import { inEndless } from './finaleCore';
import { creditMul } from './nexus';
import type { Enemy, TrainingRun, UnitTower } from './types';

// Credits in (kills, waves), credits out (levels, luck, base mends). Spending is only in the build phase.

/** A force's power: its points, with each veteran level adding a share. Sorties scale by it too. */
export function squadPower(units: Unit[]): number {
  return units.reduce((n, u) => n + u.points * (1 + TRAINING.levelPower * levelForXp(u.xp)), 0);
}

/** The points Training prices a unit by: its points, × TRAINING.immobileSurcharge if it is Immobile or a Fortification
 *  (a rule OPR prices low that costs nothing here). Recipe tier, level cap and cost, and the run's power go by it. */
export const trainPoints = (u: Pick<Unit, 'points' | 'rules' | 'category'>): number =>
  u.points * (hasRule(u.rules, 'Immobile') || u.category === 'Fortification' ? TRAINING.immobileSurcharge : 1);

/** The most level-ups a unit of these points may have (TRAINING.levels.caps). */
export const levelCap = (points: number): number => (TRAINING.levels.caps.find((c) => points <= c.upTo) ?? TRAINING.levels.caps[TRAINING.levels.caps.length - 1]).cap;

/** What a crafted unit's next level-up costs: base × its Training points (price, else points) / perPoints × costMul
 *  (a pure sliding scale: a 50-pt unit's first is 17, a 200-pt one's 66), at least minCost, growth times more each level. */
export function levelCost(t: UnitTower): number {
  const L = TRAINING.levels;
  return Math.max(L.minCost, Math.round(((L.base * (t.price ?? t.points)) / L.perPoints) * L.costMul * L.growth ** t.up));
}

const unitPiece = (run: TrainingRun, id: number): UnitTower | undefined => {
  const p = pieceById(run, id);
  return p?.kind === 'unit' ? p : undefined;
};

/** Why unit piece `id` can't level up now, or null. */
export function levelProblem(run: TrainingRun, id: number): string | null {
  if (run.phase !== 'build') return 'Levels are bought between waves.';
  const t = unitPiece(run, id);
  if (!t) return 'Only crafted units level up.';
  if (t.up >= t.cap) return `${t.name} is at its cap (${t.cap}).`;
  if (run.credits < levelCost(t)) return 'Not enough credits.';
  return null;
}

/** Buy a level-up for unit piece `id`. Throws on a problem. */
export function buyLevel(run: TrainingRun, id: number): void {
  const why = levelProblem(run, id);
  if (why) throw new Error(why);
  const t = unitPiece(run, id)!;
  run.credits -= levelCost(t);
  applyLevel(t);
}

/** Give a level-up for free (cards too): +1 up and +1 Tough; false, and nothing, at its cap. */
export function applyLevel(t: UnitTower): boolean {
  if (t.up >= t.cap) return false;
  t.up++;
  t.tough++;
  return true;
}

/** The next luck level's cost (less with the Drill Honours thrift perk), or null at the top. */
export function luckCost(run: TrainingRun): number | null {
  const c = TRAINING.shards.luckCost[run.luck];
  return c === undefined ? null : thrifty(run, c);
}

/** Why luck can't go up now, or null. */
export function luckProblem(run: TrainingRun): string | null {
  if (run.phase !== 'build') return 'Luck is bought between waves.';
  const c = luckCost(run);
  if (c === null) return 'Luck is at its best.';
  if (run.luck >= luckCap(run)) return `Luck ${run.luck + 1} needs a Drill Honour.`;
  if (run.credits < c) return 'Not enough credits.';
  return null;
}

/** Buy the next luck level: better grade odds from the next draft. Throws on a problem. */
export function buyLuck(run: TrainingRun): void {
  const why = luckProblem(run);
  if (why) throw new Error(why);
  run.credits -= luckCost(run)!;
  run.luck++;
}

/** What the next base mend costs (each mend this run `growth` times dearer). */
export const mendCost = (run: TrainingRun): number => Math.round(TRAINING.mend.cost * TRAINING.mend.growth ** run.mends);

/** Why the base can't be mended now (not build phase, full, short of credits), or null. */
export function mendProblem(run: TrainingRun): string | null {
  if (run.phase !== 'build') return 'The base is mended between waves.';
  if (run.baseHp >= TRAINING.baseHp) return 'The base is whole.';
  if (run.credits < mendCost(run)) return 'Not enough credits.';
  return null;
}

/** +TRAINING.mend.hp base HP (more with the Drill Honours mend perk), never above TRAINING.baseHp. Throws on a problem. */
export function buyMend(run: TrainingRun): void {
  const why = mendProblem(run);
  if (why) throw new Error(why);
  run.credits -= mendCost(run);
  run.baseHp = Math.min(TRAINING.baseHp, run.baseHp + TRAINING.mend.hp + mendPerk(run));
  run.mends++;
}

/** Credits a kill pays, before run.mods.bounty: its cost × perCost (at least 1), shared over the TRAINING.wave.crowd
 *  that come in its place (not the Lord's), so most kills pay a fraction of a credit. */
export function killCredits(e: Enemy): number {
  const def = TRAINING_ENEMIES[e.kind];
  return Math.max(1, Math.round(def.cost * TRAINING.credits.perCost)) / (def.spawn === 'boss' ? 1 : TRAINING.wave.crowd);
}

/** What the run's credits in are worth: the Nexus's threat (nexus.ts creditMul), and finale.endlessCredits in Endless. */
const payMul = (run: TrainingRun) => creditMul(run) * (inEndless(run) ? TRAINING.finale.endlessCredits : 1);

/** Pay a kill into run.credits, with the bounty and payMul. Credits may be fractional (the screens show them rounded
 *  down). */
export function payKill(run: TrainingRun, e: Enemy): void {
  run.credits = Math.round((run.credits + killCredits(e) * run.mods.bounty * payMul(run)) * 1e6) / 1e6;
}

/** Credits for clearing wave run.wave: the wave bonus, and the no-leak bonus when run.leaked is 0; × creditMul, and
 *  finale.endlessCredits in Endless. */
export function waveCredits(run: TrainingRun): number {
  const C = TRAINING.credits;
  return Math.round((C.wave + C.perWave * run.wave + (run.leaked === 0 ? C.noLeak : 0)) * payMul(run));
}
