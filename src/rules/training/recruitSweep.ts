import { runBots } from './botPool';
import { mean } from './probe';
import { FORCES, SEEDS, recruits, seasoned } from './testForces';

// Test-only: the recruits balance tests' sweep. Never imported by the app.

/** Six seeds for the recruits checks: one bot run swings by many waves on a small change. */
const RECRUIT_SEEDS = [...SEEDS, 4, 5, 6];

/** For each count in `ns`: mean waves cleared over the sample forces (seasoned to veterancy `vet`) with that many fresh
 *  recruits added to each, against the Final `final`; a line a force and count goes in `rows`. Played on botPool. */
export async function recruitRuns(ns: number[], vet: number, final: number, rows: string[]): Promise<number[]> {
  const sets = ns.flatMap((n) => FORCES.map((f) => ({ n, f, units: [...(vet ? seasoned(f.units, vet) : f.units), ...recruits(f, n)] })));
  const outs = await runBots(sets.flatMap((s) => RECRUIT_SEEDS.map((seed) => ({ units: s.units, seed, maxWaves: 60, final }))));
  const got = sets.map((_, k) => outs.slice(k * RECRUIT_SEEDS.length, (k + 1) * RECRUIT_SEEDS.length).map((o) => o.cleared));
  sets.forEach((s, k) => rows.push(`${s.f.name.padEnd(22)} +${s.n} (${s.units.reduce((t, u) => t + u.points, 0)} pts): ${got[k].join(' ')}`));
  return ns.map((n) => mean(sets.flatMap((s, k) => (s.n === n ? got[k] : []))));
}
