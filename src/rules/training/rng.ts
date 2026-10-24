// The run's dice: mulberry32 with its state kept on the run, so a saved run rolls on as it would have.

/** Anything holding a mulberry32 state (a run, or a copy of one for a preview). */
export interface Rng {
  rng: number;
}

/** A number in [0, 1). */
export function rand(r: Rng): number {
  r.rng = (r.rng + 0x6d2b79f5) | 0;
  let t = r.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** A whole number in [lo, hi]. */
export const randInt = (r: Rng, lo: number, hi: number) => lo + Math.floor(rand(r) * (hi - lo + 1));

/** One of `xs` (undefined when empty). */
export const pick = <T,>(r: Rng, xs: readonly T[]): T => xs[Math.floor(rand(r) * xs.length)];

/** A D6. */
export const d6 = (r: Rng) => randInt(r, 1, 6);

/** An index into `weights`, each drawn in proportion to its weight. */
export function weighted(r: Rng, weights: readonly number[]): number {
  const total = weights.reduce((n, w) => n + w, 0);
  let x = rand(r) * total;
  for (let i = 0; i < weights.length; i++) if ((x -= weights[i]) < 0) return i;
  return weights.length - 1;
}

/** Shuffle in place, and return it. */
export function shuffle<T>(r: Rng, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand(r) * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

/** An OPR roll's odds: hit on `quality`+ with `mod` (a 6 always hits, a 1 always misses). */
export const hitChance = (quality: number, mod: number) => Math.max(1 / 6, Math.min(5 / 6, (7 - quality + mod) / 6));
/** A save's odds on `defense`+ against `ap` (a 1 always fails). */
export const saveChance = (defense: number, ap: number, mod = 0) => Math.max(0, Math.min(5 / 6, (7 - defense - ap + mod) / 6));

/** A string's FNV-1a hash, as a dice seed. */
export function seedOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h | 0;
}
