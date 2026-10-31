import type { Campaign, Force } from '../../model/types';
import { weekSeed } from '../../rules/sortie';
import { createRun, drillOf, finaleOpen, nexusOf, type RunMode, type TrainingRun } from '../../rules/training';
import { thisWeek } from './useSiegeSettle';

// Starting a run: the force's own, held to its Drill Honours, or the Weekly Siege on the week's seed.

const newSeed = () => Math.floor(Math.random() * 2 ** 31);

/** A new run: the Weekly Siege (the week's seed, no story, Nexus or drill; its Final finale.from), or the force's own
 *  (its Final the highest it has open); either Hard or Insane if `mode` (a siege only from the damage checks). */
export function freshRun(force: Force, c: Campaign | undefined, siege: boolean, mode?: RunMode): TrainingRun {
  if (siege) {
    const week = thisWeek();
    return createRun(force.id, force.units, weekSeed(week), undefined, undefined, { siege: week, mode });
  }
  return createRun(force.id, force.units, newSeed(), force.sortie, nexusOf(c), { drill: drillOf(force), final: finaleOpen(force), mode });
}
