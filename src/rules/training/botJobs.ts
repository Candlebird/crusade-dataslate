import type { Unit } from '../../model/types';
import maze from '../trainingTestMaze.json';
import { playRun } from './bot';
import { endlessDepth, inEndless } from './finaleCore';
import { prober, type Probe } from './probe';
import { siegeDmg } from './siege';
import type { RunNexus, TrainingRun } from './types';

// Test-only: one balance-bot run as plain data, so botPool can play it on a worker thread. Never imported by the app.

/** A bot run on the test maze: `probe` probes it (probe.ts); `bankAtFinal` hands the run that many credits once its
 *  Final wave is on (a player who saved up for Endless). */
export interface BotJob {
  units: Unit[];
  seed: number;
  maxWaves?: number;
  final?: number;
  nexus?: RunNexus;
  probe?: boolean;
  bankAtFinal?: number;
  /** A Weekly Siege run of this ISO week (the seed should be that week's). */
  siege?: string;
}

/** What a played job did (and its probe, when asked for); `endless` is its Endless depth, null if it never got there. */
export interface BotOut {
  cleared: number;
  crafted: number;
  luck: number;
  endless: number | null;
  ms: number;
  probe?: Probe;
  /** A siege's damage to the colossus (undefined: it never reached it). */
  dmg?: number;
}

export function playJob(job: BotJob): BotOut {
  const t0 = performance.now();
  const p = job.probe ? prober() : undefined;
  const bank = job.bankAtFinal;
  let banked = false;
  const watch = p || bank ? (r: TrainingRun) => {
    if (bank && !banked && r.wave === r.finale?.final) { banked = true; r.credits += bank; }
    p?.watch(r);
  } : undefined;
  const run = playRun(job.units, job.seed, { maze, maxWaves: job.maxWaves ?? 60, final: job.final, nexus: job.nexus, siege: job.siege, watch });
  return {
    cleared: run.cleared, crafted: run.crafted.length, luck: run.luck, endless: inEndless(run) ? endlessDepth(run) : null,
    ms: performance.now() - t0, probe: p?.done(run), ...(job.siege ? { dmg: siegeDmg(run) } : {}),
  };
}
