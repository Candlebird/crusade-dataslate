import type { Campaign, Force, Sector } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import { ECHOES, activeEvent } from './nexus';
import { cutOf, fieldCap } from './fieldCap';
import { DIFFICULTY_LEVELS, NEXUS_DIFFICULTY, RATING_BANDS, SECTOR_MODIFIERS } from './nexusData';

// Nexus Wars sector difficulty. Every sector off the homes is rated in Supply: the size of the AI garrison that holds
// it. Ratings come in bands scaled to the field cap (rules/fieldCap.ts), not to anyone's Supply, so one faction's growth
// doesn't raise everyone's targets: near the homes a garrison is RATING_BANDS.near × the cap, at the far reach far × the
// cap, and the set pieces (the Voidspawn, a Lost Archive, a guardian's sector) setPiece × the cap. They're recalculated
// when a round ends, as the cap grows. Each sector rolls one offset up or down, so nearby sectors differ, and one
// modifier (two when it's rated hard) that favours its defender. A won raid cuts a garrison for good (Sector.cut).

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** A faction's total Supply Limit across all its detachments. */
export const factionSupply = (forces: Force[], factionId: string) =>
  factionForces(forces, factionId).reduce((n, f) => n + supplyLimit(f), 0);

/** The campaign's difficulty level (the GM picks it on the Nexus Wars page). */
export const difficultyLevel = (c: Campaign) =>
  DIFFICULTY_LEVELS.find((l) => l.id === c.difficulty) ?? DIFFICULTY_LEVELS.find((l) => l.id === 'normal')!;

/** Set pieces are rated RATING_BANDS.setPiece × the cap: the Voidspawn, a Lost Archive, and any sector a guardian holds. */
export const setPiece = (s: Sector) => s.type === 'voidspawn' || s.type === 'archive' || (!!s.guardian && aiDefended(s));

/**
 * The current scale of sector ratings, all on the field cap and scaled by the difficulty level: `base` near the homes,
 * `far` at the far reach, `max` for the set pieces; with the random roll, ratings land in `min`–`max`.
 */
export function difficultyRange(c: Campaign, _forces?: Force[]) {
  const { near, far, setPiece: top, jitter } = RATING_BANDS;
  const { step } = NEXUS_DIFFICULTY;
  const cap = fieldCap(c);
  const scaled = (n: number) => Math.max(step, Math.round((n * cap * difficultyLevel(c).scale) / step) * step);
  return { min: scaled(near - jitter), base: scaled(near), far: scaled(far), max: scaled(top) };
}

/**
 * The garrison at `s`: its rating, less any raid cut (to the nearest 10). With the campaign, the round's Galactic Event
 * counts too (a Blood Moon swells AI garrisons). The faction no longer matters: every faction faces the same garrison.
 */
export function ratingFor(s: Sector, _factionId?: string, c?: Campaign): number | undefined {
  if (s.difficulty === undefined) return undefined;
  const cut = 1 - cutOf(s);
  const swell = c && aiDefended(s) ? activeEvent(c)?.garrison ?? 1 : 1;
  return cut === 1 && swell === 1 ? s.difficulty : Math.round((s.difficulty * cut * swell) / 10) * 10;
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
export function rateSectors(c: Campaign, _forces?: Force[], rand: Rand = Math.random, o: { reroll?: boolean } = {}) {
  const range = difficultyRange(c);
  const { step, hardAt } = NEXUS_DIFFICULTY;
  const jitter = Math.floor((RATING_BANDS.jitter * fieldCap(c) * difficultyLevel(c).scale) / step);
  const roll = () => (Math.floor(rand() * (2 * jitter + 1)) - jitter) * step;
  for (const s of c.sectors) {
    if (s.type === 'home') {
      delete s.difficulty;
      delete s.ratings;
      delete s.modifiers;
      continue;
    }
    delete s.ratings;
    const t = sectorThreat(c, s);
    // Set pieces sit at the top of the scale; everything else rolls around its place in the near–far band.
    if (setPiece(s)) s.difficulty = range.max;
    else s.difficulty = clamp(Math.round((range.base + t * (range.far - range.base)) / step) * step + roll(), range.min, range.max);
    if (s.modifiers?.length && !(o.reroll && aiDefended(s))) continue;
    const pool = [...SECTOR_MODIFIERS];
    const picks: string[] = [];
    for (let i = 0; i < (t >= hardAt ? 2 : 1) && pool.length; i++) picks.push(pool.splice(Math.floor(rand() * pool.length), 1)[0].id);
    s.modifiers = picks;
  }
  return { min: range.min, max: range.max };
}

/** A guardian that turned up since the last rating makes its sector a set piece: rate it so. */
export function rateGuardians(c: Campaign) {
  const top = difficultyRange(c).max;
  for (const s of c.sectors) if (setPiece(s) && s.type !== 'home') s.difficulty = top;
}
