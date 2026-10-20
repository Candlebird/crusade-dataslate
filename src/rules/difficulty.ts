import type { Campaign, Force, Sector } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import { ECHOES } from './nexus';
import { DIFFICULTY_LEVELS, NEXUS_DIFFICULTY, SECTOR_MODIFIERS } from './nexusData';

// Nexus Wars sector difficulty. Every sector off a faction's home is rated in Supply: the size of the AI garrison that
// holds it. Ratings run from NEXUS_DIFFICULTY.min up to the biggest faction's total Supply × maxFactor, so the far
// reaches of the map are always a step up, and they're recalculated every round as the factions grow. Each rating then
// rolls up or down a little, so nearby sectors differ. Each sector also rolls one modifier (two when it's rated hard)
// that favours its defender.

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
export function difficultyRange(c: Campaign, forces: Force[]) {
  const { min, minSpread, maxFactor, step, floor, jitter } = NEXUS_DIFFICULTY;
  const top = Math.max(0, ...c.factions.map((f) => factionSupply(forces, f.id)));
  const scaled = (n: number) => Math.max(step, Math.round((n * difficultyLevel(c).scale) / step) * step);
  return {
    min: scaled(Math.max(floor, min - jitter)),
    base: scaled(min),
    max: scaled(Math.max(min + minSpread, Math.round((top * maxFactor) / step) * step)),
  };
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
  const { step, hardAt, jitter } = NEXUS_DIFFICULTY;
  const roll = () => (Math.floor(rand() * (2 * Math.floor(jitter / step) + 1)) - Math.floor(jitter / step)) * step;
  for (const s of c.sectors) {
    if (s.type === 'home') {
      delete s.difficulty;
      delete s.modifiers;
      continue;
    }
    const t = sectorThreat(c, s);
    // The Voidspawn is always the top of the scale; everything else rolls around its place on it.
    const rated = Math.round((range.base + t * (range.max - range.base)) / step) * step;
    s.difficulty = s.type === 'voidspawn' ? range.max : clamp(rated + roll(), range.min, range.max);
    if (s.modifiers?.length && !(o.reroll && aiDefended(s))) continue;
    const pool = [...SECTOR_MODIFIERS];
    const picks: string[] = [];
    for (let i = 0; i < (t >= hardAt ? 2 : 1) && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    s.modifiers = picks;
  }
  return { min: range.min, max: range.max };
}
