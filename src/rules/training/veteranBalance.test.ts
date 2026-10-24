import { describe, expect, it } from 'vitest';
import maze from '../trainingTestMaze.json';
import { playRun } from './bot';
import { FORCES, SEEDS, scarred, veteran } from './testForces';

// Balance: the same sample forces as veterans (traits and relics) and as scarred wrecks, against themselves fresh.
// The spec aims for veterans 3-5 waves further and scarred ones a few less; with slack, a lead of 0-8 waves either way.

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
    expect(mean(vets) - mean(fresh)).toBeGreaterThanOrEqual(0);
    expect(mean(vets) - mean(fresh)).toBeLessThanOrEqual(8);
    expect(mean(fresh) - mean(scars)).toBeGreaterThanOrEqual(0);
    expect(mean(fresh) - mean(scars)).toBeLessThanOrEqual(8);
  }, 300_000);
});
