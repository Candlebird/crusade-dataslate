import { describe, expect, it } from 'vitest';
import { runBots } from './botPool';
import { FORCES } from './testForces';
import type { NexusAffixId } from './types';

// Balance (bot): a run under threat still goes the distance.

describe('threat affixes (bot)', () => {
  it('a force under threat 4 with two affixes still goes the distance (bot)', async () => {
    const nexus = { threat: 4, affixes: ['swift', 'armoured'] as NexusAffixId[], lords: [] };
    const waves = (await runBots(FORCES.slice(0, 4).map((f) => ({ units: f.units, seed: 1, maxWaves: 40, nexus })))).map((o) => o.cleared);
    const mean = waves.reduce((a, b) => a + b, 0) / waves.length;
    console.log(`threat 4 (swift, armoured): ${waves.join(', ')}; mean ${mean.toFixed(1)}`);
    expect(mean).toBeGreaterThanOrEqual(15);
  }, 120_000);
});
