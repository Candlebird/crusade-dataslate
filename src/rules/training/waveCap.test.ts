import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { hurtBase } from './waves';
import type { TrainingRun } from './types';

describe('Training: no one wave wipes the base', () => {
  it('takes at most TRAINING.leak.waveCap of the base a wave, and the count starts over each wave', () => {
    const run = { baseHp: TRAINING.baseHp, waveLost: 0 } as TrainingRun;
    for (let i = 0; i < 60; i++) hurtBase(run, 3);
    const cap = TRAINING.baseHp * TRAINING.leak.waveCap;
    expect(run.baseHp).toBe(TRAINING.baseHp - cap);
    run.waveLost = 0;
    for (let i = 0; i < 60; i++) hurtBase(run, 16);
    expect(run.baseHp).toBe(Math.max(0, TRAINING.baseHp - 2 * cap));
  });
});
