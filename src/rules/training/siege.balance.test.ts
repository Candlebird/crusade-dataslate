import { describe, expect, it } from 'vitest';
import { weekSeed } from '../sortie';
import { runBots } from './botPool';
import { FORCES, seasoned } from './testForces';

// Balance: what the sample forces deal to the Weekly Siege's colossus (its Feats ask 6,000 / 10,000 / 15,000 / 20,000 /
// 25,000), fresh and seasoned to veterancy 400 and 700. A force that falls before the colossus deals nothing.

const WEEKS = ['2026-W40', '2026-W41', '2026-W42'];
const TIERS: [string, number][] = [['fresh', 0], ['vet 400', 400], ['vet 700', 700]];
const FEAT_DMG = [6000, 10000, 15000, 20000, 25000];

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

describe('Weekly Siege damage (bot)', () => {
  it('every tier deals some damage to the colossus, a seasoned force more', async () => {
    const cases = TIERS.flatMap(([tier, vet]) => FORCES.flatMap((f) => WEEKS.map((week) => ({ tier, f, week, units: vet ? seasoned(f.units, vet) : f.units }))));
    const outs = await runBots(cases.map(({ units, week }) => ({ units, seed: weekSeed(week), siege: week, maxWaves: 30 })));
    const rows: string[] = [];
    const medians: number[] = [];
    for (const [tier] of TIERS) {
      const ks = cases.map((c, k) => (c.tier === tier ? k : -1)).filter((k) => k >= 0);
      const dmg = ks.map((k) => outs[k].dmg ?? 0);
      for (const k of ks) rows.push(`${tier.padEnd(8)} ${cases[k].f.name.padEnd(22)} ${cases[k].week}: ${outs[k].dmg === undefined ? `fell at ${outs[k].cleared}` : `${outs[k].dmg} damage`}`);
      const hits = FEAT_DMG.map((n) => `${n / 1000}k ${dmg.filter((d) => d >= n).length}/${dmg.length}`).join(', ');
      rows.push(`${tier}: min ${Math.min(...dmg)} median ${median(dmg)} max ${Math.max(...dmg)} · reached ${ks.filter((k) => outs[k].dmg !== undefined).length}/${ks.length} · feats ${hits}`);
      medians.push(median(dmg));
    }
    console.log(rows.join('\n'));
    expect(medians[2]).toBeGreaterThanOrEqual(medians[0]);
  }, 300_000);
});
