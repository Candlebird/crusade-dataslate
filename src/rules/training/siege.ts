import type { Rng } from './rng';
import { TRAINING } from '../downtimeData';
import type { TrainingRun } from './types';

// The Weekly Siege (F5): a run on the week's seed (sortie.ts weekSeed, the Sortie weekly's), so every force gets the same
// terrain, the same drafts and the same waves (still scaled by its own points), however it plays. Its Final is wave
// TRAINING.finale.from: a lone colossus of finale.siegeHp wounds (finale.ts), the attempt over when it reaches the base.
// Its score is the damage dealt to it (siegeDmg); a force that fell before it, the wave reached. A siege run has no Drill Honours limits or perks, no nemesis and no Nexus (TrainingModal makes it).
// From week TRAINING.siege.checksFrom on, the siege runs to the last of TRAINING.siege.checks and meets the colossus at
// each of them (damage checks): run.checks holds each one's damage, and each has its own board (siegeBoard.ts).

/** A salt for each thing the week's seed rolls, so the drafts and the waves don't share dice. */
const SALT = { draft: 0x2545f491, wave: 0x5bd1e995 } as const;

const S = TRAINING.siege;

/** Does week `week`'s siege run the damage checks (from TRAINING.siege.checksFrom)? Earlier weeks keep one at wave 25. */
export const hasChecks = (week?: string): boolean => !!week && week >= S.checksFrom;

/** The colossus waves of week `week`'s siege, lowest first: the damage checks, or the old Final alone. */
export const checkWaves = (week?: string): number[] => (hasChecks(week) ? [...S.checks] : [TRAINING.finale.from]);

/** The Final wave of week `week`'s siege (its last colossus). */
export const siegeFinal = (week?: string): number => checkWaves(week)[checkWaves(week).length - 1];

/** Is wave `w` one the colossus comes on in this run (a siege's check, or its Final)? */
export const isColossusWave = (run: Pick<TrainingRun, 'siege'>, w: number): boolean => !!run.siege && checkWaves(run.siege).includes(w);

/** Damage dealt at each check reached so far (the one under way counting), rounded; empty before the first or in an
 *  old-style siege. */
export const checkDmg = (run: Pick<TrainingRun, 'checks'>): number[] => (run.checks ?? []).map((n) => Math.round(n));

/** Damage dealt to the colossus on the wave under way (or the last it met): the check's, else the Final's. */
export const colossusDealt = (run: Pick<TrainingRun, 'checks' | 'finale'>): number =>
  run.checks?.length ? run.checks[run.checks.length - 1] : run.finale?.dealt ?? 0;

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

/** Damage dealt to the siege's colossus, if the run reached it (undefined: it fell before); with damage checks, the
 *  total over every check it reached. */
export const siegeDmg = (run: TrainingRun): number | undefined => {
  if (hasChecks(run.siege)) return run.checks?.length ? checkDmg(run).reduce((a, b) => a + b, 0) : undefined;
  return run.wave >= (run.finale?.final ?? TRAINING.finale.from) ? Math.round(run.finale?.dealt ?? 0) : undefined;
};

type SiegeResult = { dmg?: number; score: number; cleared: number };

/** A siege result's rank, better first: damage to the colossus (anyone who reached it), else the wave reached and
 *  waves cleared below every damage score. Negative: `a` ranks above `b`. */
export function siegeOrder(a: SiegeResult, b: SiegeResult): number {
  const ha = a.dmg !== undefined;
  const hb = b.dmg !== undefined;
  if (ha !== hb) return ha ? -1 : 1;
  return (b.dmg ?? 0) - (a.dmg ?? 0) || b.score - a.score || b.cleared - a.cleared;
}
