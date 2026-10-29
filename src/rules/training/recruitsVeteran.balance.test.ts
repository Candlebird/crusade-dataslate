import { describe, expect, it } from 'vitest';
import { recruitRuns } from './recruitSweep';

// Balance (bot): fresh (level-0) recruits make a force's waves thicker (waves.ts wideMul) on top of Training being about a
// fifth harder, and a narrow, pricey force may fall early with a raw recruit in it, so at a seasoned force's Final 40
// (veterancy 400) adding 1 or 3 new units (of up to 250 pts) may cost up to about nine waves on average (8.3 / 6.4 when
// set). Its points still barely count past TRAINING.wave.fullPoints (overRate, waves.ts wavePoints); with every point
// counted in full it cost 2.3 / 2.0 waves at the Final 25 and 0.5 / 5.9 at the Final 40, before the harder waves.

describe('recruits (bot)', () => {
  it('adding 1-3 level-0 units costs at most about nine waves (veterancy 400, Final 40)', async () => {
    const rows: string[] = [];
    const [base, one, three] = await recruitRuns([0, 1, 3], 400, 40, rows);
    rows.push(`mean cleared: +0 ${base.toFixed(1)}  +1 ${one.toFixed(1)}  +3 ${three.toFixed(1)}`);
    console.log(rows.join('\n'));
    expect(base - one).toBeLessThanOrEqual(9);
    expect(base - three).toBeLessThanOrEqual(9);
  }, 300_000);
});
