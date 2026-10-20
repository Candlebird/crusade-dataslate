import type { Campaign, Force, Sector } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import { ECHOES } from './nexus';
import { NEXUS_DIFFICULTY, SECTOR_MODIFIERS } from './nexusData';

// Nexus Wars sector difficulty. Every sector off a faction's home is rated in Supply: the size of the AI garrison that
// holds it. Ratings run from NEXUS_DIFFICULTY.min up to the biggest faction's total Supply × maxFactor, so the far
// reaches of the map are always a step up, and they're recalculated every round as the factions grow. Each sector also
// rolls one modifier (two when it's rated hard) that favours its defender.

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A faction's total Supply Limit across all its detachments. */
export const factionSupply = (forces: Force[], factionId: string) =>
  factionForces(forces, factionId).reduce((n, f) => n + supplyLimit(f), 0);

/** The current range of sector ratings. */
export function difficultyRange(c: Campaign, forces: Force[]) {
  const { min, maxFactor, step } = NEXUS_DIFFICULTY;
  const top = Math.max(0, ...c.factions.map((f) => factionSupply(forces, f.id)));
  return { min, max: Math.max(min, Math.round((top * maxFactor) / step) * step) };
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
  const { step, hardAt } = NEXUS_DIFFICULTY;
  for (const s of c.sectors) {
    if (s.type === 'home') {
      delete s.difficulty;
      delete s.modifiers;
      continue;
    }
    const t = sectorThreat(c, s);
    s.difficulty = Math.round((range.min + t * (range.max - range.min)) / step) * step;
    if (s.modifiers?.length && !(o.reroll && aiDefended(s))) continue;
    const pool = [...SECTOR_MODIFIERS];
    const picks: string[] = [];
    for (let i = 0; i < (t >= hardAt ? 2 : 1) && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    s.modifiers = picks;
  }
  return range;
}
