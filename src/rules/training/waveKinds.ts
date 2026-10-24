import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from '../downtimeData';
import { weighted, type Rng } from './rng';

// One kind a wave (Gem TD): which kind comes, how many the budget buys, and which of them are elites.

const W = TRAINING.wave;

/** Kinds that can be wave `w`'s one kind (not the boss): those out by then, a flying wave's only from the main spawn. */
export function kindPool(w: number, flies: boolean): TrainingEnemyKind[] {
  return (Object.keys(TRAINING_ENEMIES) as TrainingEnemyKind[]).filter((k) => {
    const d = TRAINING_ENEMIES[k];
    return d.spawn !== 'boss' && d.from <= w && (!flies || d.spawn === 'main') && (W.kinds[k] ?? 0) > 0;
  });
}

/** Wave `w`'s one kind, drawn by TRAINING.wave.kinds weight from kindPool (rolls `r`). */
export function waveKind(r: Rng, w: number, flies: boolean): TrainingEnemyKind {
  const pool = kindPool(w, flies);
  if (!pool.length) return 'swarm';
  return pool[weighted(r, pool.map((k) => W.kinds[k] ?? 0))];
}

/** How many of `kind` a budget buys (1 to `max`), and the share of their wounds that makes them cost the budget. */
export function countFor(kind: TrainingEnemyKind, budget: number, max: number): { n: number; hpMul: number } {
  const cost = TRAINING_ENEMIES[kind].cost;
  const n = Math.max(1, Math.min(max, Math.round(budget / cost)));
  return { n, hpMul: budget / (n * cost) };
}

/** Is wave `w`'s `i`-th spawn of its kind (from 0) an elite: every eliteEvery-th, from wave eliteFrom. */
export const isElite = (w: number, i: number): boolean => w >= W.eliteFrom && (i + 1) % W.eliteEvery === 0;
