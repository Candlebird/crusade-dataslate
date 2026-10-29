import type { Campaign, Force, Sector } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import { ECHOES, activeEvent } from './nexus';
import { DIFFICULTY_LEVELS, NEXUS_DIFFICULTY, SECTOR_MODIFIERS } from './nexusData';

// Nexus Wars sector difficulty. Every sector off a faction's home is rated in Supply: the size of the AI garrison that
// holds it. Ratings run from NEXUS_DIFFICULTY.min up to the faction's own total Supply × maxFactor, so the far reaches
// of the map are always a step up for whoever attacks, and they're recalculated every round as the factions grow. A
// small faction isn't priced out by the leader's growth, and the leader's growth shows as reach (Overrun), not odds.
// Each sector rolls one offset up or down, the same for every faction, so nearby sectors differ. Each sector also
// rolls one modifier (two when it's rated hard) that favours its defender. The Voidspawn is everyone's top: the
// biggest faction's maximum.

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A faction's total Supply Limit across all its detachments. */
export const factionSupply = (forces: Force[], factionId: string) =>
  factionForces(forces, factionId).reduce((n, f) => n + supplyLimit(f), 0);

/** The campaign's difficulty level (the GM picks it on the Nexus Wars page). */
export const difficultyLevel = (c: Campaign) =>
  DIFFICULTY_LEVELS.find((l) => l.id === c.difficulty) ?? DIFFICULTY_LEVELS.find((l) => l.id === 'normal')!;

/**
 * The current scale of sector ratings: `base` near the homes up to `max`; with the random roll, ratings land in
 * `min`–`max`. The campaign's difficulty level scales all three.
 */
export function difficultyRange(c: Campaign, forces: Force[], factionId?: string) {
  const { min, minSpread, maxFactor, step, floor, jitter } = NEXUS_DIFFICULTY;
  const top = factionId ? factionSupply(forces, factionId) : Math.max(0, ...c.factions.map((f) => factionSupply(forces, f.id)));
  const scaled = (n: number) => Math.max(step, Math.round((n * difficultyLevel(c).scale) / step) * step);
  return {
    min: scaled(Math.max(floor, min - jitter)),
    base: scaled(min),
    max: scaled(Math.max(min + minSpread, Math.round((top * maxFactor) / step) * step)),
  };
}

/**
 * The garrison `factionId` faces at `s`: its own rating, else the sector's (the biggest faction's scale). With the
 * campaign, the round's Galactic Event counts too (a Blood Moon swells AI garrisons, to the nearest 10).
 */
export function ratingFor(s: Sector, factionId?: string, c?: Campaign): number | undefined {
  const rating = (factionId && s.ratings?.[factionId]) || s.difficulty;
  const swell = c && aiDefended(s) ? activeEvent(c)?.garrison : undefined;
  return rating !== undefined && swell ? Math.round((rating * swell) / 10) * 10 : rating;
}

/** Is the sector held by the AI (unclaimed, or the Echoes'), so an attacker faces its garrison? */
export const aiDefended = (s: Sector) => !s.owner || s.owner === ECHOES.id;

/** How far up the difficulty scale a sector sits, 0–1: further from every home is harder, and some types are tougher. */
export function sectorThreat(c: Campaign, s: Sector): number {
  const { distanceWeight, typeBonus } = NEXUS_DIFFICULTY;
  if (s.type === 'voidspawn') return 1;
  const homes = c.sectors.filter((x): x is Sector & Hex => x.type === 'home' && isPlaced(x));
  if (!isPlaced(s) || !homes.length) return clamp(0.5 + typeBonus[s.type], 0, 1);
  const away = (x: Sector) => (isPlaced(x) ? Math.min(...homes.map((h) => hexDistance(h, x))) : 0);
  const furthest = Math.max(1, ...c.sectors.map(away));
  return clamp((distanceWeight * (away(s) - 1)) / Math.max(1, furthest - 1) + typeBonus[s.type], 0, 1);
}

export const modifierOf = (id: string) => SECTOR_MODIFIERS.find((m) => m.id === id);

/**
 * Rate every sector off the homes against the current range, and roll modifiers for any sector without them. With
 * `reroll`, AI-held sectors roll fresh modifiers (a new round, a new garrison); player-held sectors keep theirs.
 * Mutates `c`; returns the range used.
 */
export function rateSectors(c: Campaign, forces: Force[], rand: Rand = Math.random, o: { reroll?: boolean } = {}) {
  const range = difficultyRange(c, forces);
  const own = c.factions.map((f) => [f.id, difficultyRange(c, forces, f.id)] as const);
  const { step, hardAt, jitter } = NEXUS_DIFFICULTY;
  const roll = () => (Math.floor(rand() * (2 * Math.floor(jitter / step) + 1)) - Math.floor(jitter / step)) * step;
  for (const s of c.sectors) {
    if (s.type === 'home') {
      delete s.difficulty;
      delete s.ratings;
      delete s.modifiers;
      continue;
    }
    const t = sectorThreat(c, s);
    // The Voidspawn is always the top of the scale; everything else rolls around its place on it.
    if (s.type === 'voidspawn') {
      s.difficulty = range.max;
      delete s.ratings;
    } else {
      const offset = roll();
      const rate = (r: typeof range) => clamp(Math.round((r.base + t * (r.max - r.base)) / step) * step + offset, r.min, r.max);
      s.difficulty = rate(range);
      s.ratings = Object.fromEntries(own.map(([id, r]) => [id, rate(r)]));
    }
    if (s.modifiers?.length && !(o.reroll && aiDefended(s))) continue;
    const pool = [...SECTOR_MODIFIERS];
    const picks: string[] = [];
    for (let i = 0; i < (t >= hardAt ? 2 : 1) && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    s.modifiers = picks;
  }
  return { min: range.min, max: range.max };
}
