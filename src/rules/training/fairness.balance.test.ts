import { describe, expect, it } from 'vitest';
import { weekSeed } from '../sortie';
import { runBots } from './botPool';
import type { BotJob, Knobs } from './botJobs';
import { FAIR_FORCES, seasoned } from './testForces';

// Balance probe: is Training fair to every army book? Three average 2000 pt forces a book (testForces FAIR_FORCES)
// play Training runs (waves cleared) and the Weekly Siege fresh and seasoned (damage to the colossus). It prints each
// book's numbers and the spread between books. FAIR_KNOBS (JSON, a partial TRAINING) tries other settings.

const KNOBS: Knobs | undefined = process.env.FAIR_KNOBS ? JSON.parse(process.env.FAIR_KNOBS) : undefined;
const WEEKS = ['2026-W38', '2026-W39', '2026-W40', '2026-W41', '2026-W42', '2026-W43', '2026-W44', '2026-W45'];
const TIERS = [0, 700];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

describe('fairness between army books (bot)', () => {
  it('prints each book\'s waves cleared and Siege damage', async () => {
    type Case = { f: (typeof FAIR_FORCES)[number]; what: string; job: BotJob };
    const cases: Case[] = FAIR_FORCES.flatMap((f) => [
      ...SEEDS.map((seed) => ({ f, what: 'train', job: { units: f.units, seed, maxWaves: 40 } })),
      ...TIERS.flatMap((vet) => WEEKS.map((w) => ({ f, what: `siege ${vet}`, job: { units: vet ? seasoned(f.units, vet) : f.units, seed: weekSeed(w), siege: w, maxWaves: 30 } }))),
    ]).map((c) => (KNOBS ? { ...c, job: { ...c.job, knobs: KNOBS } } : c));
    const outs = await runBots(cases.map((c) => c.job));
    const lines: string[] = [KNOBS ? `knobs ${JSON.stringify(KNOBS)}` : 'knobs: none'];
    for (const f of FAIR_FORCES) lines.push(`${f.name}: ${f.units.reduce((s, u) => s + u.points, 0)} pts, ${f.units.map((u) => `${u.unitType} ${u.points}`).join(', ')}`);
    const books = [...new Set(FAIR_FORCES.map((f) => f.book))];
    const whats = ['train', ...TIERS.map((v) => `siege ${v}`)];
    const table: Record<string, Record<string, number>> = {};
    for (const b of books) {
      table[b] = {};
      for (const w of whats) {
        const vals = cases.map((c, k) => (c.f.book === b && c.what === w ? (w === 'train' ? outs[k].cleared : outs[k].dmg ?? 0) : null)).filter((v): v is number => v !== null);
        table[b][w] = mean(vals);
        const fell = cases.map((c, k) => (c.f.book === b && c.what === w && outs[k].dmg === undefined ? outs[k].cleared + 1 : null)).filter((v) => v !== null);
        const zeros = w === 'train' ? '' : ` zero ${vals.filter((v) => !v).length}/${vals.length} fell on ${fell.sort((x, y) => x - y).join(',')}`;
        lines.push(`${b.padEnd(20)} ${w.padEnd(10)} mean ${mean(vals).toFixed(w === 'train' ? 1 : 0).padStart(7)} median ${String(median(vals)).padStart(6)}${zeros}  [${vals.join(' ')}]`);
      }
    }
    for (const f of FAIR_FORCES) {
      lines.push(`FORCE ${f.name.padEnd(22)} ` + whats.map((w) => {
        const vals = cases.map((c, k) => (c.f === f && c.what === w ? (w === 'train' ? outs[k].cleared : outs[k].dmg ?? 0) : null)).filter((v): v is number => v !== null);
        return `${w} ${mean(vals).toFixed(w === 'train' ? 1 : 0).padStart(6)}`;
      }).join('  '));
    }
    for (const w of whats) {
      const ms = books.map((b) => table[b][w]);
      lines.push(`SPREAD ${w.padEnd(10)} worst/best ${(Math.min(...ms) / Math.max(...ms)).toFixed(2)}  ${books.map((b, i) => `${b} ${ms[i].toFixed(w === 'train' ? 1 : 0)}`).join(' · ')}`);
    }
    if (process.env.FAIR_DIAG) for (const f of FAIR_FORCES) {
      const ks = cases.map((c, k) => (c.f === f && c.what === 'train' ? k : -1)).filter((k) => k >= 0);
      const by = new Map<string, { n: number; at: number; dealt: number; pts: number }>();
      let def = 0;
      for (const k of ks) {
        def += outs[k].defDealt ?? 0;
        for (const m of outs[k].made ?? []) {
          const e = by.get(m.name) ?? { n: 0, at: 0, dealt: 0, pts: m.points };
          e.n++; e.at += m.at; e.dealt += m.dealt;
          by.set(m.name, e);
        }
      }
      const unitDealt = [...by.values()].reduce((a, e) => a + e.dealt, 0);
      lines.push(`DIAG ${f.name}: units ${Math.round(unitDealt / ks.length)} defences ${Math.round(def / ks.length)} a run; ` +
        [...by].map(([n, e]) => `${n} ${e.pts}p x${e.n} @${(e.at / e.n).toFixed(0)} ${Math.round(e.dealt / e.n)}`).join(' | '));
    }
    console.log(lines.join('\n'));
    expect(outs.length).toBe(cases.length);
  }, 1_200_000);
});
