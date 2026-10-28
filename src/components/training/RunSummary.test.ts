import { describe, expect, it } from 'vitest';
import { blankRun } from '../../rules/training/testRun';
import { endReason } from './RunSummary';

describe('endReason', () => {
  it('reads how the run ended from its closing log line', () => {
    const run = blankRun();
    run.log = ['Wave 3 cleared.', 'The base falls. Waves cleared: 7.'];
    expect(endReason(run)).toBe('The base falls.');
  });
  it('finds the closing line when later lines follow it', () => {
    const run = blankRun();
    run.log = ['Victory banked. Waves cleared: 12.', 'Drill Honour earned.'];
    expect(endReason(run)).toBe('Victory banked.');
  });
  it('is null when the run has no closing line', () => {
    const run = blankRun();
    run.log = ['Wave 1 cleared.'];
    expect(endReason(run)).toBeNull();
  });
});
