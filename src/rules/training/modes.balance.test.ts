import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { weekSeed } from '../sortie';
import { runBots } from './botPool';
import type { BotJob } from './botJobs';
import { FORCES, seasoned } from './testForces';

// Balance: Hard and Insane, tuned from a real force that dealt 60,000 to the W44 colossus. The bot stands in for that
// force: each sample force (seasoned to veterancy 700) has its waves' wounds divided by its "strength", 60,000 over its
// own damage to the old wave-25 colossus, so the bot plays as a force that would deal 60,000 there. Hard (the mode's
// multiplier on top) should leave it reaching the siege's last check, or winning the Final at 25, only some of the time;
// Insane (twice Hard's) next to never.

const TARGET = 60_000;
const OLD_WEEKS = ['2026-W40', '2026-W41', '2026-W42'];
const NEW_WEEKS = ['2026-W45', '2026-W46', '2026-W47', '2026-W48'];
const SEEDS = [11, 23, 37, 41, 53, 67];
const VET = 700;
/** Set SWEEP=1 for the whole grid (the tuning table); otherwise just Hard's and Insane's multipliers. */
const SWEEP = !!process.env.SWEEP;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

describe('Hard and Insane (bot)', () => {
  it('Hard is a hard win for a 60,000 force; Insane next to impossible', async () => {
    const forces = FORCES.map((f) => ({ ...f, units: seasoned(f.units, VET) }));
    // Each force's strength: 60,000 over its median damage to the old colossus.
    const old = await runBots(forces.flatMap((f) => OLD_WEEKS.map((w) => ({ units: f.units, seed: weekSeed(w), siege: w, maxWaves: 30 }))));
    const strength = forces.map((_, i) => TARGET / Math.max(1000, median(old.slice(i * OLD_WEEKS.length, (i + 1) * OLD_WEEKS.length).map((o) => o.dmg ?? 0))));

    const rows: string[] = [];
    const sweep = async (label: string, GRID: number[], job: (units: BotJob['units'], k: number) => BotJob, ks: number[], ok: (o: Awaited<ReturnType<typeof runBots>>[number]) => boolean) => {
      const cases = forces.flatMap((f, i) => GRID.flatMap((g) => ks.map((k) => ({ i, g, job: { ...job(f.units, k), hpFlat: 1 / strength[i], modeHp: g } }))));
      const outs = await runBots(cases.map((c) => c.job));
      const rate = (i: number, g: number) => {
        const hits = cases.map((c, n) => (c.i === i && c.g === g ? ok(outs[n]) : null)).filter((x) => x !== null);
        return hits.filter(Boolean).length / hits.length;
      };
      const tops: number[] = [];
      for (const [i, f] of forces.entries()) {
        const rates = GRID.map((g) => rate(i, g));
        // The multiplier where it gets through half the time (the last on the grid at or above a half).
        const top = GRID.filter((_, n) => rates[n] >= 0.5).pop() ?? 0;
        tops.push(top);
        rows.push(`${label} ${f.name.padEnd(22)} strength ${strength[i].toFixed(1).padStart(5)}: ${GRID.map((g, n) => `x${g} ${Math.round(rates[n] * 100)}%`).join('  ')} -> ${top}`);
      }
      rows.push(`${label}: median half-way multiplier ${median(tops)}`);
      const all = (g: number) => forces.map((_, i) => rate(i, g));
      return { tops, all };
    };

    const grid = (m: 'siege' | 'train') => (SWEEP ? [6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 40] : [TRAINING.modes.hard[m], TRAINING.modes.insane[m]]);
    const siege = await sweep('siege', grid('siege'), (units, k) => ({ units, seed: weekSeed(NEW_WEEKS[k]), siege: NEW_WEEKS[k], maxWaves: 30 }), NEW_WEEKS.map((_, k) => k), (o) => (o.checks ?? 0) >= TRAINING.siege.checks.length);
    const train = await sweep('train', grid('train'), (units, k) => ({ units, seed: SEEDS[k], final: TRAINING.finale.from, maxWaves: TRAINING.finale.from }), SEEDS.map((_, k) => k), (o) => !!o.won);
    console.log(rows.join('\n'));
    if (SWEEP) return;
    // Hard: a 60,000 force gets through some of the time, not always; Insane: next to never.
    const M = TRAINING.modes;
    for (const [r, m] of [[siege, 'siege'], [train, 'train']] as const) {
      expect(median(r.all(M.hard[m])), `${m} on Hard`).toBeGreaterThanOrEqual(0.25);
      expect(median(r.all(M.hard[m])), `${m} on Hard`).toBeLessThanOrEqual(0.9);
      expect(median(r.all(M.insane[m])), `${m} on Insane`).toBeLessThanOrEqual(0.25);
    }
  }, 1_200_000);
});
