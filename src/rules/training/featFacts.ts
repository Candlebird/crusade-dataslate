import type { Force } from '../../model/types';
import type { TrainingFeatFacts } from '../feats';
import { bossesOf } from './drillBank';
import { endlessDepth } from './finaleCore';
import { siegeDmg } from './siege';
import type { TrainingRun } from './types';
import { finaleOpen, runWon } from './veterancy';

// What a finished run did for its feats (feats.ts trainingFeats), read once the force's Final ladder has banked it.

/** The run's feat facts: lords and bosses slain, a Victory, Endless depth, the siege's damage, and the force's ladder
 *  (the Final open, every Final won) after it. */
export function featFacts(f: Force, run: TrainingRun): TrainingFeatFacts {
  const dmg = run.siege ? siegeDmg(run) : undefined;
  return {
    finalLord: !run.siege && (!!run.finale?.slain || !!run.nemesis?.slain),
    won: runWon(run),
    bosses: bossesOf(run),
    endless: endlessDepth(run),
    open: finaleOpen(f),
    wins: Object.keys(f.finale?.wins ?? {}).map(Number),
    ...(dmg !== undefined ? { siege: dmg } : {}),
  };
}
