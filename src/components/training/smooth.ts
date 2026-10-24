import type { Enemy, TrainingRun } from '../../rules/training';

// Render interpolation: the sim steps in fixed STEP chunks (useRunLoop), which at 1× is fewer steps than frames, so
// enemies would hop. The loop snapshots every enemy's spot before each step and leaves `alpha` (how far the clock is
// into the next step); the map draws each enemy that far from its last spot to its current one.

/** Further than this (cells) in one step is a jump (a blink, a spawn), drawn where it landed. */
const JUMP = 3;

interface Smooth {
  prev: Map<number, { x: number; y: number }>;
  alpha: number;
}

const state = new WeakMap<TrainingRun, Smooth>();

const of = (run: TrainingRun): Smooth => {
  let s = state.get(run);
  if (!s) state.set(run, (s = { prev: new Map(), alpha: 1 }));
  return s;
};

/** Before a step: remember where every enemy stands. */
export function snapshot(run: TrainingRun): void {
  const { prev } = of(run);
  prev.clear();
  for (const e of run.enemies) prev.set(e.id, { x: e.x, y: e.y });
}

/** After the steps of a frame: the share of a step the clock is past the last one (1: draw where they are). */
export function setAlpha(run: TrainingRun, alpha: number): void {
  of(run).alpha = Math.min(1, Math.max(0, alpha));
}

/** Where to draw an enemy this frame. */
export function drawAt(run: TrainingRun, e: Enemy): { x: number; y: number } {
  const s = state.get(run);
  const p = s?.prev.get(e.id);
  if (!s || !p || s.alpha >= 1) return e;
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  if (dx * dx + dy * dy > JUMP * JUMP) return e;
  return { x: p.x + dx * s.alpha, y: p.y + dy * s.alpha };
}
