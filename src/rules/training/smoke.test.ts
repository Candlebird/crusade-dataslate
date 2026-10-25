import { describe, expect, it } from 'vitest';
import { playJob } from './botJobs';
import { runBots } from './botPool';
import { FORCES } from './testForces';

// The fast suite's check on the balance bot (the full sweeps are *.balance.test.ts, `npm run test:balance`): one sample
// force plays a few waves, and botPool's threads play it exactly as a run in this thread does.

describe('balance bot (smoke)', () => {
  it('plays a sample force through its first waves, and botPool plays it the same', async () => {
    const jobs = [1, 2].map((seed) => ({ units: FORCES[0].units, seed, maxWaves: 6, probe: true }));
    const here = jobs.map(playJob);
    for (const o of here) {
      expect(o.cleared).toBe(6);
      expect(o.probe!.leaks.length).toBeGreaterThan(6);
    }
    const there = await runBots(jobs, 2);
    expect(there.map(({ ms: _, ...o }) => o)).toEqual(here.map(({ ms: _, ...o }) => o));
  }, 60_000);
});
