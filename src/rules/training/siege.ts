import type { Rng } from './rng';
import { TRAINING } from '../downtimeData';
import type { TrainingRun } from './types';

// The Weekly Siege (F5): a run on the week's seed (sortie.ts weekSeed, the Sortie weekly's), so every force gets the same
// cover, the same drafts and the same waves (still scaled by its own points), however it plays. Its Final is wave
// TRAINING.finale.from: a lone colossus of finale.siegeHp wounds (finale.ts), the attempt over when it reaches the base.
// Its score is the damage dealt to it (siegeDmg); a force that fell before it, the wave reached. A siege run has no Drill Honours limits or perks, no nemesis and no Nexus (TrainingModal makes it).

/** A salt for each thing the week's seed rolls, so the drafts and the waves don't share dice. */
const SALT = { draft: 0x2545f491, wave: 0x5bd1e995 } as const;

/** Is it a Weekly Siege run? */
export const isSiege = (run: TrainingRun): boolean => !!run.siege;

/** Fresh dice for wave `w`'s `what`, from the run's seed alone: the same in every force's siege of the week. */
export const siegeDice = (run: TrainingRun, what: keyof typeof SALT, w: number): Rng =>
  ({ rng: (run.seed ^ Math.imul(w + 1, SALT[what])) | 0 });

/** The dice a draft is drawn with: the week's in a siege, else the run's own. */
export const draftDice = (run: TrainingRun): Rng => (run.siege ? siegeDice(run, 'draft', run.wave) : run);

/** The dice wave `w` is planned with: the week's in a siege, else `own` (the run, or a copy of it for a preview). */
export const waveDice = (run: TrainingRun, w: number, own: Rng): Rng => (run.siege ? siegeDice(run, 'wave', w) : own);

/** A siege's score: the wave reached (the one it fell on, or the last cleared if it never fell). */
export const siegeScore = (run: TrainingRun): number => Math.max(run.wave, run.cleared);

/** Damage dealt to the siege's colossus, if the run reached it (undefined: it fell before). */
export const siegeDmg = (run: TrainingRun): number | undefined =>
  run.wave >= (run.finale?.final ?? TRAINING.finale.from) ? Math.round(run.finale?.dealt ?? 0) : undefined;

type SiegeResult = { dmg?: number; score: number; cleared: number };

/** A siege result's rank, better first: damage to the colossus (anyone who reached it), else the wave reached and
 *  waves cleared below every damage score. Negative: `a` ranks above `b`. */
export function siegeOrder(a: SiegeResult, b: SiegeResult): number {
  const ha = a.dmg !== undefined;
  const hb = b.dmg !== undefined;
  if (ha !== hb) return ha ? -1 : 1;
  return (b.dmg ?? 0) - (a.dmg ?? 0) || b.score - a.score || b.cleared - a.cleared;
}
