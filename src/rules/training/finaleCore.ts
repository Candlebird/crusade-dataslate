import { TRAINING } from '../downtimeData';
import type { TrainingRun } from './types';

// The run's Final wave, on its own so waves.ts can read it without the rest of finale.ts.

/** The run's Final wave: its finale's, else TRAINING.finale.from. */
export const finalOf = (run: Pick<TrainingRun, 'finale'>): number => run.finale?.final ?? TRAINING.finale.from;

/** Has the run won its Final and gone on into Endless. */
export const inEndless = (run: Pick<TrainingRun, 'finale'>): boolean => run.finale?.victory === 'endless';

/** Waves cleared past the Final in Endless (0 before). */
export const endlessDepth = (run: Pick<TrainingRun, 'finale' | 'cleared'>): number =>
  inEndless(run) ? Math.max(0, run.cleared - finalOf(run)) : 0;
