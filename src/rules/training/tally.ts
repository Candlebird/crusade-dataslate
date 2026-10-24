import { TRAINING_ENEMIES } from '../downtimeData';
import type { Harm } from './harm';
import type { Enemy, RunBeast, Tally, Tower, TrainingRun, UnitTower } from './types';

// Run tallies the Sortie layer reads at the end of a run: what each crafted unit did (shots, blows, holds), which
// units hit each boss, and the Echoes met and slain for the bestiary. harm.hurt, holds and waves.spawnDue write them.

/** The bestiary tally an enemy counts under: its kind, or 'nemesis'. */
export const beastOf = (e: Enemy): string => (e.nem ? 'nemesis' : e.kind);

const tallyOf = (t: UnitTower): Tally => (t.tally ??= { shot: 0, melee: 0, holds: 0 });

const beast = (run: TrainingRun, k: string): RunBeast => ((run.beasts ??= {})[k] ??= { met: 0, slain: 0 });

/** A boss's watch: units it walked past in reach, and units that hit it (unit ids). */
export const watchOf = (run: TrainingRun, e: Enemy) => ((run.watch ??= {})[String(e.id)] ??= { passed: [], hit: [] });

/** Damage `dealt` to `e` by `by`: a unit's shots and blows count to its tally, any hit on a boss to the boss's watch, a
 *  kill to the bestiary (and a nemesis slain is marked on run.nemesis). */
export function tallyHarm(run: TrainingRun, by: Tower | undefined, e: Enemy, dealt: number, how: Harm, killed: boolean): void {
  if (by?.kind === 'unit') {
    if (how !== 'other') tallyOf(by)[how] += dealt;
    if (TRAINING_ENEMIES[e.kind].spawn === 'boss' && dealt > 0) {
      const w = watchOf(run, e);
      if (!w.hit.includes(by.unitId)) w.hit.push(by.unitId);
    }
  }
  if (!killed) return;
  beast(run, beastOf(e)).slain += 1;
  if (e.nem && run.nemesis && !run.nemesis.slain) {
    run.nemesis.slain = true;
    run.log.push(`${run.nemesis.name} falls: it will meet your next Sortie hurt, and a trick short.`);
  }
}

/** A unit grabbed a walker. */
export const tallyHold = (t: UnitTower): void => { tallyOf(t).holds += 1; };

/** An enemy came on: its kind is met once a wave. */
export function noteMet(run: TrainingRun, e: Enemy): void {
  const b = beast(run, beastOf(e));
  if (b.at === run.wave) return;
  b.met += 1;
  b.at = run.wave;
}
