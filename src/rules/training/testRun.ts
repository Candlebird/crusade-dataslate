import { TRAINING } from '../downtimeData';
import type { TrainingRun } from './types';

// Test-only: an empty run in the build phase (no recipes, no cover, no draft), for module tests that need a run
// without createRun. Not in index.ts.

export function blankRun(seed = 1): TrainingRun {
  return {
    v: 1, forceId: 'f', seed, rng: seed, phase: 'build', wave: 0, cleared: 0, t: 0, power: 800, baseHp: TRAINING.baseHp,
    credits: 0, luck: 0, mends: 0, leaked: 0, nextId: 1, pieces: [], draft: { step: 'done', hand: [], placed: [] },
    recipes: [], crafted: [], enemies: [], queue: [], cover: [], cards: [], mods: { bounty: 1, holdMul: 1, regrabAdd: 0 },
    banked: {}, fx: [], log: [],
  };
}
