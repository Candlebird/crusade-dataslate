import { describe, expect, it } from 'vitest';
import { recruitRuns } from './recruitSweep';

// Balance (bot): fresh (level-0) recruits make a force's waves thicker (waves.ts wideMul: a wide force fills its recipes
// sooner) but its points barely count past TRAINING.wave.fullPoints (overRate, waves.ts wavePoints), so at the first Final
// (25) adding 1 or 3 new units (of up to 250 pts) costs at most about two and a half waves on average. (Without the wide
// rule it cost under a wave; with every point counted in full 2.3 / 2.0 waves at the Final 25 and 0.5 / 5.9 at the Final 40.)

describe('recruits (bot)', () => {
  it('adding 1-3 level-0 units costs at most about two and a half waves (veterancy 0, Final 25)', async () => {
    const rows: string[] = [];
    const [base, one, three] = await recruitRuns([0, 1, 3], 0, 25, rows);
    rows.push(`mean cleared: +0 ${base.toFixed(1)}  +1 ${one.toFixed(1)}  +3 ${three.toFixed(1)}`);
    console.log(rows.join('\n'));
    expect(base - one).toBeLessThanOrEqual(2.5);
    expect(base - three).toBeLessThanOrEqual(2.5);
  }, 300_000);
});
