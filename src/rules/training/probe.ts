import type { Unit } from '../../model/types';
import maze from '../trainingTestMaze.json';
import { TRAINING_ENEMIES } from '../downtimeData';
import { playRun } from './bot';
import { LEGS } from './map';
import { isFlyWave } from './waves';
import type { RunNexus, TrainingRun } from './types';

// Test-only: the balance bot's run with probes on it (the balance tests' numbers). Never imported by the app.

/** What a probed run did: waves cleared, base HP each wave let through, and the pad each boss died on. */
export interface Probe {
  cleared: number;
  /** The wave it fell on (cleared + 1), and whether it flew. */
  fell: number;
  fellFlying: boolean;
  /** Enemies through, by wave (index = wave number). */
  leaks: number[];
  /** Each boss: its wave and the pads it had reached when it died (LEGS when it got through). */
  bosses: { wave: number; pad: number }[];
  /** Base HP lost on each wave (index = wave number), and the base HP it went in with. */
  hpLost: number[];
  hpIn: number[];
  /** The wave each crafted unit came out after (run.cleared at the craft), earliest first. */
  crafts: number[];
}

/** Does wave `w` fly? */
export const flies = isFlyWave;

/** A probe to watch a bot run with (playRun's `watch`); `done` reads it once the run is over. */
export function prober(): { watch: (run: TrainingRun) => void; done: (run: TrainingRun) => Probe } {
  const leaks: number[] = [];
  const bosses: { wave: number; pad: number }[] = [];
  const live = new Map<number, { wave: number; pad: number }>();
  const hpIn: number[] = [];
  const hpLost: number[] = [];
  const watch = (run: TrainingRun) => {
    leaks[run.wave] = run.leaked;
    hpIn[run.wave] = Math.max(hpIn[run.wave] ?? 0, run.baseHp);
    hpLost[run.wave] = hpIn[run.wave] - run.baseHp;
    const seen = new Set<number>();
    for (const e of run.enemies) {
      if (TRAINING_ENEMIES[e.kind].spawn !== 'boss') continue;
      seen.add(e.id);
      live.set(e.id, { wave: run.wave, pad: e.leg });
    }
    for (const [id, b] of live) {
      if (seen.has(id)) continue;
      // Gone: slain where it last stood, or through (it was on the last leg and the wave's leaks went up).
      bosses.push(b.pad >= LEGS - 1 && run.leaked > 0 ? { wave: b.wave, pad: LEGS } : b);
      live.delete(id);
    }
  };
  const done = (run: TrainingRun): Probe => {
    for (const b of live.values()) bosses.push({ wave: b.wave, pad: LEGS });
    const fell = run.cleared + 1;
    const crafts = run.pieces.flatMap((x) => (x.kind === 'unit' ? [x.craftedAt] : [])).sort((a, b) => a - b);
    return { cleared: run.cleared, fell, fellFlying: flies(fell), leaks, bosses, hpLost, hpIn, crafts };
  };
  return { watch, done };
}

/** Play a bot run (the test maze) and probe it. */
export function probeRun(units: Unit[], seed: number, opts: { maxWaves?: number; nexus?: RunNexus } = {}): Probe {
  const p = prober();
  return p.done(playRun(units, seed, { maze, maxWaves: opts.maxWaves ?? 60, nexus: opts.nexus, watch: p.watch }));
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
