import type { Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import maze from '../trainingTestMaze.json';
import { playRun } from './bot';
import { endlessDepth, inEndless } from './finaleCore';
import { prober, type Probe } from './probe';
import { siegeDmg } from './siege';
import { runWon } from './veterancy';
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
  /** The waves' wounds multiplier at full ramp (a Hard or Insane mode, modes.ts). */
  modeHp?: number;
  /** Test-only: a flat multiplier on every wave's wounds (a stronger force's stand-in). */
  hpFlat?: number;
  /** Test-only: TRAINING settings to try for this run (a balance sweep), merged in deep (arrays replaced) and put back
   *  after, e.g. { mass: { lone: 0.08 } }. */
  knobs?: Knobs;
}

/** A partial TRAINING, as plain data. */
export type Knobs = { [k: string]: unknown };

const isObj = (v: unknown): v is Knobs => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Merge `knobs` into `into` deep; return what it replaced, to merge back after. */
function merge(into: Knobs, knobs: Knobs): Knobs {
  const old: Knobs = {};
  for (const [k, v] of Object.entries(knobs)) {
    if (isObj(v) && isObj(into[k])) old[k] = merge(into[k] as Knobs, v);
    else { old[k] = into[k]; into[k] = v; }
  }
  return old;
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
  /** A siege's damage checks met. */
  checks?: number;
  /** It won its Final. */
  won?: boolean;
  /** The run's trophies taken, and its crafted units that picked a specialisation (balance probes). */
  trophies?: string[];
  specs?: number;
  /** Each crafted unit still on the map: its datasheet, points, damage dealt and the wave it came out on; and what
   *  the defences dealt in all (balance probes). */
  made?: { name: string; points: number; dealt: number; at: number; mass?: number }[];
  defDealt?: number;
}

export function playJob(job: BotJob): BotOut {
  if (!job.knobs) return play(job);
  const old = merge(TRAINING as unknown as Knobs, job.knobs);
  try { return play(job); } finally { merge(TRAINING as unknown as Knobs, old); }
}

function play(job: BotJob): BotOut {
  const t0 = performance.now();
  const p = job.probe ? prober() : undefined;
  const bank = job.bankAtFinal;
  let banked = false;
  const watch = p || bank ? (r: TrainingRun) => {
    if (bank && !banked && r.wave === r.finale?.final) { banked = true; r.credits += bank; }
    p?.watch(r);
  } : undefined;
  const run = playRun(job.units, job.seed, { maze, maxWaves: job.maxWaves ?? 60, final: job.final, nexus: job.nexus, siege: job.siege, modeHp: job.modeHp, hpFlat: job.hpFlat, watch });
  return {
    cleared: run.cleared, crafted: run.crafted.length, luck: run.luck, endless: inEndless(run) ? endlessDepth(run) : null,
    ms: performance.now() - t0, probe: p?.done(run), ...(job.siege ? { dmg: siegeDmg(run), checks: run.checks?.length ?? 0 } : {}),
    won: runWon(run),
    trophies: run.trophies ?? [],
    specs: run.pieces.filter((x) => 'spec' in x && x.spec).length,
    made: run.pieces.flatMap((x) => (x.kind === 'unit' ? [{ name: x.name, points: x.points, dealt: Math.round(x.dealt), at: x.craftedAt, ...(x.mass ? { mass: x.mass } : {}) }] : [])),
    defDealt: Math.round(run.pieces.reduce((n, x) => n + (x.kind !== 'unit' && 'dealt' in x ? (x.dealt as number) : 0), 0)),
  };
}
