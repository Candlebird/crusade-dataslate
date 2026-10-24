import { describe, expect, it } from 'vitest';
import { recruitRuns } from './probe';

// Balance (bot): a force that takes on fresh (level-0) recruits mustn't fall sooner. Waves scale with the force's
// points, each past TRAINING.wave.fullPoints counting only overRate of one (waves.ts wavePoints), so at a seasoned
// force's Final 40 (veterancy 400) adding 1 or 3 new units (of up to 250 pts) costs at most about a wave on average. (With every point counted in full
// it cost 2.3 / 2.0 waves at the Final 25 and 0.5 / 5.9 at the Final 40.)

describe('recruits (bot)', () => {
  it('adding 1-3 level-0 units costs at most about a wave (veterancy 400, Final 40)', () => {
    const rows: string[] = [];
    const [base, one, three] = [0, 1, 3].map((n) => recruitRuns(n, 400, 40, rows));
    rows.push(`mean cleared: +0 ${base.toFixed(1)}  +1 ${one.toFixed(1)}  +3 ${three.toFixed(1)}`);
    console.log(rows.join('\n'));
    expect(base - one).toBeLessThanOrEqual(1.2);
    expect(base - three).toBeLessThanOrEqual(1.2);
  }, 900_000);
});
