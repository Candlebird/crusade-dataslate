import type { Unit } from '../../model/types';
import maze from '../trainingTestMaze.json';
import { TRAINING_ENEMIES } from '../downtimeData';
import { playRun } from './bot';
import { LEGS } from './map';
import { isFlyWave, isFlyBossWave } from './waves';
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
}

/** Does wave `w` fly (a flying wave, or a flying boss)? */
export const flies = (w: number) => isFlyWave(w) || isFlyBossWave(w);

/** A probe to watch a bot run with (playRun's `watch`); `done` reads it once the run is over. */
export function prober(): { watch: (run: TrainingRun) => void; done: (run: TrainingRun) => Probe } {
  const leaks: number[] = [];
  const bosses: { wave: number; pad: number }[] = [];
  const live = new Map<number, { wave: number; pad: number }>();
  const watch = (run: TrainingRun) => {
    leaks[run.wave] = run.leaked;
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
    return { cleared: run.cleared, fell, fellFlying: flies(fell), leaks, bosses };
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
