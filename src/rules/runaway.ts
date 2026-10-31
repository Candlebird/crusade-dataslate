import type { Campaign, SectorType } from '../model/types';
import { EXPANSION_US, NEXUS_ROUNDS } from './nexusData';

// Snowball brakes (Nexus Wars): a faction far ahead on sectors pays more for Supply and Forced Expansion, and the Void
// Echoes and Marauders come for it first. Factions behind get the catch-up bonus instead (rounds.ts underdogBonus).
// Values live in NEXUS_ROUNDS.runaway (nexusData.ts).

/**
 * The factions far ahead: holding the most sectors (not counting homes), at least NEXUS_ROUNDS.runaway.lead more than
 * the faction holding the fewest.
 */
export function runaways(c: Campaign | undefined): string[] {
  if (!c || c.factions.length < 2) return [];
  const counts = c.factions.map((f) => ({ id: f.id, n: c.sectors.filter((s) => s.owner === f.id && s.type !== 'home').length }));
  const top = Math.max(...counts.map((x) => x.n));
  const low = Math.min(...counts.map((x) => x.n));
  return top - low >= NEXUS_ROUNDS.runaway.lead ? counts.filter((x) => x.n === top).map((x) => x.id) : [];
}

export const isRunaway = (c: Campaign | undefined, factionId: string | undefined) => !!factionId && runaways(c).includes(factionId);

/** RP for one Increase Supply: dearer for a faction far ahead. */
export const supplyRpCost = (c: Campaign | undefined, factionId: string | undefined, base: number) =>
  base * (isRunaway(c, factionId) ? NEXUS_ROUNDS.runaway.supplyRp : 1);

/** Umbra Shards for a Forced Expansion into a sector of this type, or undefined if it can't be taken: dearer for a faction far ahead. */
export function expansionCost(c: Campaign | undefined, factionId: string | undefined, type: SectorType): number | undefined {
  const base = EXPANSION_US[type];
  if (base === undefined) return undefined;
  return isRunaway(c, factionId) ? Math.ceil(base * NEXUS_ROUNDS.runaway.expansion) : base;
}
