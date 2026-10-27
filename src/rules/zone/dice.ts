import type { Dice } from '../oprRules';

// Dice for the zone battle (and the Sortie): a seeded generator, so a saved battle replays the same, and dice
// expressions as the army books write them ('D3', 'D6+1', '2D6').

export type Rng = () => number;

/** A small, fast seeded generator (mulberry32). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from a string (a battle id, a sector id). */
export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** A generator that can be saved and picked up again: its state is just a number. */
export interface SavedRng { seed: number; n: number }

/** Resume a saved generator: the same seed, `n` draws in. */
export function resume(s: SavedRng): Rng & { saved: () => SavedRng } {
  const base = mulberry32(s.seed);
  for (let i = 0; i < s.n; i++) base();
  let n = s.n;
  const r = (() => { n++; return base(); }) as Rng & { saved: () => SavedRng };
  r.saved = () => ({ seed: s.seed, n });
  return r;
}

export const d6 = (rng: Rng) => 1 + Math.floor(rng() * 6);
export const d3 = (rng: Rng) => 1 + Math.floor(rng() * 3);

/** Roll a dice expression: 3, 'D3', 'D6+1', '2D6'. */
export function roll(d: Dice, rng: Rng): number {
  if (typeof d === 'number') return d;
  const m = d.replace(/\s/g, '').match(/^(\d*)D(\d+)(?:([+-])(\d+))?$/i);
  if (!m) return Number(d.replace(/[^\d]/g, '')) || 1;
  const n = Number(m[1] || 1);
  let total = 0;
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng() * Number(m[2]));
  const add = Number(m[4] || 0);
  return total + (m[3] === '-' ? -add : add);
}

/** The average of a dice expression. */
export function average(d: Dice): number {
  if (typeof d === 'number') return d;
  const m = d.replace(/\s/g, '').match(/^(\d*)D(\d+)(?:([+-])(\d+))?$/i);
  if (!m) return Number(d.replace(/[^\d]/g, '')) || 1;
  const add = Number(m[4] || 0);
  return (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2 + (m[3] === '-' ? -add : add);
}
