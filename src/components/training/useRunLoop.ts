import { useEffect, useRef } from 'react';
import { step, type Phase, type TrainingRun } from '../../rules/training';

// The game loop: fixed steps of STEP seconds (times the speed) while a wave runs, shots fading the rest of the time.
// The map redraws itself; the panels are refreshed a few times a second in a wave and whenever the phase changes.

export const STEP = 0.05;
/** Seconds between panel refreshes during a wave. */
const UI_EVERY = 0.15;

export interface LoopOpts {
  speed: number;
  paused: boolean;
  /** The panels should re-render. */
  onTick: () => void;
  /** The phase changed (a wave cleared, the base fell). */
  onPhase: (run: TrainingRun, was: Phase) => void;
}

export function useRunLoop(run: TrainingRun | null, opts: LoopOpts): void {
  const live = useRef(opts);
  live.current = opts;
  useEffect(() => {
    if (!run) return;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let ui = 0;
    let phase = run.phase;
    const frame = (now: number) => {
      const o = live.current;
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (run.phase === 'wave' && !o.paused) {
        acc += dt * o.speed;
        while (acc >= STEP && run.phase === 'wave') {
          step(run, STEP);
          acc -= STEP;
        }
      } else {
        acc = 0;
        if (run.phase !== 'wave') step(run, dt); // let the last shots fade
      }
      ui += dt;
      if (run.phase !== phase) {
        const was = phase;
        phase = run.phase;
        ui = 0;
        o.onPhase(run, was);
        o.onTick();
      } else if (run.phase === 'wave' && ui > UI_EVERY) {
        ui = 0;
        o.onTick();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [run]);
}
