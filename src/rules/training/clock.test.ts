import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { gameSeconds } from './clock';

describe('gameSeconds', () => {
  it('runs 1× at half the old speed, and scales with the speed', () => {
    expect(TRAINING.timeScale).toBe(0.5);
    expect(gameSeconds(1, 1)).toBeCloseTo(0.5);
    expect(gameSeconds(1, 4)).toBeCloseTo(2);
    expect(gameSeconds(0, 3)).toBe(0);
  });
});
