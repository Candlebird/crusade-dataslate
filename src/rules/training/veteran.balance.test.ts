import { describe, expect, it } from 'vitest';
import { runBots } from './botPool';
import { FORCES, SEEDS, scarred, veteran } from './testForces';

// Balance: the same sample forces as veterans (traits and relics) and as scarred wrecks, against themselves fresh.
// The spec aims for veterans 3-5 waves further and scarred ones a few less; with slack, a lead of 0-8 waves either way.

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('veteran balance (bot)', () => {
  it('a veteran force goes a few waves further than fresh, a scarred one a few less', async () => {
    const cases = FORCES.flatMap((f) => SEEDS.map((seed) => ({ f, seed })));
    const outs = await runBots(cases.flatMap(({ f, seed }) => [f.units, f.units.map(veteran), f.units.map(scarred)]
      .map((units) => ({ units, seed, maxWaves: 60 }))));
    const fresh = cases.map((_, k) => outs[3 * k].cleared);
    const vets = cases.map((_, k) => outs[3 * k + 1].cleared);
    const scars = cases.map((_, k) => outs[3 * k + 2].cleared);
    const rows = cases.map(({ f, seed }, k) => `${f.name.padEnd(22)} seed ${seed}: fresh ${fresh[k]}  veteran ${vets[k]}  scarred ${scars[k]}`);
    rows.push(`mean: fresh ${mean(fresh).toFixed(1)}  veteran ${mean(vets).toFixed(1)}  scarred ${mean(scars).toFixed(1)}`);
    console.log(rows.join('\n'));
    expect(mean(vets) - mean(fresh)).toBeGreaterThanOrEqual(0);
    expect(mean(vets) - mean(fresh)).toBeLessThanOrEqual(8);
    expect(mean(fresh) - mean(scars)).toBeGreaterThanOrEqual(0);
    expect(mean(fresh) - mean(scars)).toBeLessThanOrEqual(8);
  }, 300_000);
});

describe('Endless (bot)', () => {
  it('a strong force that wins its Final ends within about 5-8 waves of Endless, even with credits banked', async () => {
    // The Final wave hands the run a big purse, as a player who saved up for Endless would carry.
    const cases = FORCES.filter((x) => x.name.endsWith(' A')).flatMap((f) => SEEDS.map((seed) => ({ f, seed })));
    const outs = await runBots(cases.map(({ f, seed }) => ({ units: f.units.map(veteran), seed, maxWaves: 80, bankAtFinal: 1000 })));
    const depths: number[] = [];
    const rows: string[] = [];
    cases.forEach(({ f, seed }, k) => {
      const { endless, cleared } = outs[k];
      if (endless === null) return;
      depths.push(endless);
      rows.push(`${f.name.padEnd(22)} seed ${seed}: Endless ${endless} waves past ${cleared - endless}`);
    });
    console.log(rows.join('\n'));
    expect(depths.length).toBeGreaterThan(0);
    expect(mean(depths)).toBeGreaterThanOrEqual(3);
    expect(mean(depths)).toBeLessThanOrEqual(9);
    expect(Math.max(...depths)).toBeLessThanOrEqual(13);
  }, 300_000);
});
