import type { SectorType } from '../model/types';

// Nexus Wars homebrew values: sector types, benefits, the Anomaly / Void tables, Combat Manipulations
// and the Umbra Shard shop. Tweak them here; the logic in nexus.ts reads everything from this file.
// (Benefit ids are stored on sectors in saved campaigns, so rename a benefit's name, not its id.)

export const SECTOR_TYPES: Record<SectorType, { label: string; desc: string }> = {
  home: { label: 'Home sector', desc: 'Each faction has one. It can be attacked but never controlled.' },
  planet: { label: 'Planet', desc: 'Gives one benefit to whoever controls it.' },
  research: { label: 'Research station', desc: 'After each match, unlock one Nexus Traits table until the next match.' },
  void: { label: 'Void / Space hulk', desc: 'Defeat an AI opponent here for a one-off D6 reward.' },
  anomaly: { label: 'Anomaly', desc: 'Roll a D6 on the Anomaly table after each match.' },
  empty: { label: 'Empty space', desc: 'No benefit.' },
};
export const SECTOR_TYPE_KEYS = Object.keys(SECTOR_TYPES) as SectorType[];

export interface Benefit {
  id: string;
  type: 'home' | 'planet';
  name: string;
  desc: string;
}

export const BENEFITS: Benefit[] = [
  { id: 'largeShardMine', type: 'home', name: 'Large Shard Mine', desc: '+1 Umbra Shard generated after each match.' },
  { id: 'researchStation', type: 'home', name: 'Research Station', desc: 'Unlock one Nexus Traits table permanently.' },
  { id: 'relicCollector', type: 'home', name: 'Relic Collector', desc: 'On a win, roll a D6: on a 6 gain a Common Relic.' },
  { id: 'biomassPool', type: 'home', name: 'Biomass Pool', desc: '+100 Supply generated after each match.' },
  { id: 'shardMine', type: 'planet', name: 'Shard Mine', desc: 'After each match, roll a D6: on a 4+ gain 1 Umbra Shard.' },
  { id: 'fertileLand', type: 'planet', name: 'Fertile Land', desc: '+50 Supply generated after each match.' },
  { id: 'spacePort', type: 'planet', name: 'Militarized Space Port', desc: '1 free Combat Manipulation at the start of each match.' },
];

export interface NexusTableEntry {
  text: string;
  us?: number;
  supply?: number;
  xp?: number;
  removeScar?: boolean;
  unlockAll?: boolean;
  traitToken?: boolean;
  free?: string;
  nexusRelic?: boolean;
}

export const ANOMALY_TABLE: NexusTableEntry[] = [
  { text: '+1 Umbra Shard', us: 1 },
  { text: '+2 Umbra Shards', us: 2 },
  { text: '+50 Supply', supply: 50 },
  { text: '+100 Supply', supply: 100 },
  { text: 'Remove 1 battle scar from a unit', removeScar: true },
  { text: 'All Nexus tables unlocked until the next match', unlockAll: true },
];

export const VOID_TABLE: NexusTableEntry[] = [
  { text: '3 XP to distribute', xp: 3 },
  { text: '6 XP to distribute and +1 Umbra Shard', xp: 6, us: 1 },
  { text: 'Upgrade one unit with any Nexus Trait when levelling up', traitToken: true },
  { text: '+2 Umbra Shards', us: 2 },
  { text: 'One free weapon upgrade', free: 'Free weapon upgrade' },
  { text: 'A Common Nexus Relic (Rare if none is available)', nexusRelic: true },
];

export const COMBAT_MANIPULATIONS = [
  { name: 'Umbral Fog of War', desc: 'Up to 3 units may hold deployment.' },
  { name: 'From the Shadows', desc: 'One unit gains Ambush.' },
  { name: 'Bombardment', desc: 'At the end of round 1, one enemy unit takes a Dangerous Terrain test.' },
  { name: 'Dark Shroud', desc: 'The first time one chosen unit takes wounds, ignore them.' },
];
export const MANIPULATION_PREFIX = 'Combat Manipulation';
export const ORGANIZED_STRIKE = 'Organized Strike';

export type UmbraBuy = 'rp' | 'knowledge' | 'manipulation' | 'strike' | 'reinforce' | 'expansion' | 'relic' | 'evolution';
export const UMBRA_SHOP: { key: UmbraBuy; name: string; cost: number; desc: string }[] = [
  { key: 'rp', name: 'Requisition', cost: 3, desc: 'Convert into 1 RP.' },
  { key: 'knowledge', name: 'Umbral Knowledge', cost: 1, desc: '+3 XP to one unit.' },
  { key: 'manipulation', name: 'Combat Manipulation', cost: 1, desc: 'One tactical advantage for your next match.' },
  { key: 'strike', name: ORGANIZED_STRIKE, cost: 2, desc: '+200 Supply Limit once, when attacking a sector.' },
  { key: 'reinforce', name: 'Reinforce Sector', cost: 3, desc: 'Permanent: +200 Supply when defending that sector.' },
  { key: 'expansion', name: 'Forced Expansion', cost: 5, desc: 'Take an uncontrolled sector without a match (no match rewards).' },
  { key: 'relic', name: 'Nexus Relic', cost: 6, desc: 'Bought together with the normal Crusade relic requisition (its RP cost too).' },
  { key: 'evolution', name: 'Umbral Evolution', cost: 12, desc: 'A free unique Nexus trait: BP goes up, but it does not use a level.' },
];
