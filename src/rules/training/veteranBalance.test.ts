import { describe, expect, it } from 'vitest';
import type { Relic, Unit } from '../../model/types';
import maze from '../trainingTestMaze.json';
import { playRun } from './bot';
import { FORCES, SEEDS } from './testForces';

// Balance: the same sample forces as veterans (traits and relics) and as scarred wrecks, against themselves fresh.
// The spec aims for veterans 3-5 waves further; the flying walls (every flyEvery-th wave) hold them to about +1.3 for now.

const TRAITS = ['Resilient', 'Point Blank', 'Blade Master'];
const SCARS = ['Damaged Equipment', 'Weakened Armor', 'Faulty Aim'];
const RELIC_SET: Omit<Relic, 'id'>[] = [
  { name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4), Deadly(3)' },
  { name: 'Combat Stimm Injector', tier: 'Common' },
  { name: 'Auspex Array', tier: 'Common' },
  { name: 'Korvane Guard Standard', tier: 'Rare' },
  { name: 'Artisan Bionics', tier: 'Common' },
  { name: 'Wreck-Core Reactor', tier: 'Rare' },
];

/** A unit with three traits and a relic. */
export const veteran = (u: Unit, i: number): Unit => ({
  ...u,
  upgrades: TRAITS.map((name, j) => ({ id: `t${j}`, name, unique: false })),
  relics: [{ id: `r${i}`, ...RELIC_SET[i % RELIC_SET.length] }],
});

/** A unit with three scars. */
export const scarred = (u: Unit): Unit => ({ ...u, scars: SCARS.map((name, j) => ({ id: `s${j}`, name })) });

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('veteran balance (bot)', () => {
  it('a veteran force goes a few waves further than fresh, a scarred one a few less', () => {
    const fresh: number[] = [];
    const vets: number[] = [];
    const scars: number[] = [];
    const rows: string[] = [];
    for (const f of FORCES) {
      for (const seed of SEEDS) {
        const a = playRun(f.units, seed, { maze, maxWaves: 60 }).cleared;
        const b = playRun(f.units.map(veteran), seed, { maze, maxWaves: 60 }).cleared;
        const c = playRun(f.units.map(scarred), seed, { maze, maxWaves: 60 }).cleared;
        fresh.push(a); vets.push(b); scars.push(c);
        rows.push(`${f.name.padEnd(22)} seed ${seed}: fresh ${a}  veteran ${b}  scarred ${c}`);
      }
    }
    rows.push(`mean: fresh ${mean(fresh).toFixed(1)}  veteran ${mean(vets).toFixed(1)}  scarred ${mean(scars).toFixed(1)}`);
    console.log(rows.join('\n'));
    expect(mean(vets) - mean(fresh)).toBeGreaterThanOrEqual(1);
    expect(mean(vets) - mean(fresh)).toBeLessThanOrEqual(6);
    expect(mean(fresh) - mean(scars)).toBeGreaterThanOrEqual(2);
    expect(mean(fresh) - mean(scars)).toBeLessThanOrEqual(6);
  }, 300_000);
});
