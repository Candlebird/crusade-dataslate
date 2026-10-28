import { describe, expect, it } from 'vitest';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { countFor, isElite, kindPool, waveKind } from './waveKinds';

// One kind a wave: the pool, the draw, how many a budget buys, and elites.

const W = TRAINING.wave;

describe('kindPool', () => {
  it('holds only kinds out by then, never the boss, and only main-spawn kinds on a flying wave', () => {
    expect(kindPool(1, false).every((k) => TRAINING_ENEMIES[k].from <= 1)).toBe(true);
    expect(kindPool(30, false)).not.toContain('lord');
    expect(kindPool(30, true).every((k) => TRAINING_ENEMIES[k].spawn === 'main')).toBe(true);
    expect(kindPool(30, false).length).toBeGreaterThan(kindPool(1, false).length);
  });

  it('draws from it by weight, repeatably', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, i) => waveKind({ rng: i + 1 }, 30, false)));
    for (const k of seen) expect(kindPool(30, false)).toContain(k);
    expect(seen.size).toBe(kindPool(30, false).length);
    expect(waveKind({ rng: 9 }, 12, false)).toBe(waveKind({ rng: 9 }, 12, false));
  });
});

describe('countFor', () => {
  it('buys round(budget / cost), at least 1 and at most max, and spends the rest on wounds', () => {
    // A drone costs 2 / crowd of a budget, a swarm 1 / crowd.
    const crowd = TRAINING.wave.crowd;
    const ten = countFor('drone', 20 / crowd, 60);
    expect(ten.n).toBe(10);
    expect(ten.hpMul).toBeCloseTo(1);
    expect(countFor('drone', 0.1, 60).n).toBe(1);
    const big = countFor('swarm', 120 / crowd, 60);
    expect(big.n).toBe(60);
    expect(big.hpMul).toBeCloseTo(2);
  });
});

describe('isElite', () => {
  it('makes about 1 in eliteEvery an elite, from wave eliteFrom', () => {
    expect(Array.from({ length: 30 }, (_, i) => isElite(W.eliteFrom - 1, i)).some(Boolean)).toBe(false);
    const n = Array.from({ length: 60 }, (_, i) => isElite(W.eliteFrom, i)).filter(Boolean).length;
    expect(n).toBe(60 / W.eliteEvery);
    expect(W.eliteEvery).toBe(6);
  });
});
