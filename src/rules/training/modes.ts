import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { hasChecks } from './siege';
import type { RunMode, SpawnPlan, TrainingRun } from './types';

// Hard and Insane: thicker waves (their wounds times the mode's multiplier, ramping in over the first waves), their own
// siege boards, bigger siege rewards and their own feats. Normal is no mode at all.

const M = TRAINING.modes;

export const MODES: RunMode[] = ['hard', 'insane'];

/** A mode's name ('Normal' for none). */
export const modeName = (mode?: RunMode) => (mode ? M[mode].name : 'Normal');

/** Whether a run of this kind may pick a mode: any run but a siege before the damage checks. */
export const modesOpen = (siege?: string) => !siege || hasChecks(siege);

/** The multiplier a mode puts on the waves at full ramp, a siege's or another run's. */
export const modeHpOf = (mode: RunMode | undefined, siege: boolean) => (mode ? M[mode][siege ? 'siege' : 'train'] : 1);

/** The run's wave-wounds multiplier at wave `w`: 1 at wave 1, growing by the same factor each wave to the whole of
 *  run.modeHp at M.rampTo, so the first waves (a Shard or two on the map) are only a little tougher than Normal's. */
export function modeHpAt(run: Pick<TrainingRun, 'modeHp'>, w: number): number {
  const top = run.modeHp ?? 1;
  if (top === 1) return 1;
  return top ** Math.min(1, Math.max(0, (w - 1) / (M.rampTo - 1)));
}

/** A wave's plans with the mode's wounds on them (the siege colossus is set afterwards, the same in every mode). */
export function modePlan(run: Pick<TrainingRun, 'modeHp' | 'hpFlat'>, w: number, plans: SpawnPlan[]): SpawnPlan[] {
  const mode = modeHpAt(run, w);
  const flat = run.hpFlat ?? 1;
  if (mode === 1 && flat === 1) return plans;
  // A boss takes only the mode's multiplier to the power bossShare (its escorts the whole of it): one Echo the maze must
  // bring down in one pass, and the boss offer of cards rides on slaying it.
  const boss = mode ** M.bossShare * (mode === 1 ? 1 : M.bossWave[w] ?? 1) * flat;
  for (const p of plans) p.hp *= TRAINING_ENEMIES[p.kind].spawn === 'boss' ? boss : mode * flat;
  return plans;
}

/** A mode's reward multiplier (1 for Normal). */
export const modeReward = (mode?: RunMode) => (mode ? M[mode].reward : 1);

/** A reward times the mode's multiplier, each part rounded up. */
export function scaleReward<T extends Record<string, number | undefined>>(r: T, mode?: RunMode): T {
  const mul = modeReward(mode);
  if (mul === 1) return { ...r };
  const out: Record<string, number | undefined> = {};
  for (const [k, v] of Object.entries(r)) out[k] = v ? Math.ceil(v * mul) : v;
  return out as T;
}
