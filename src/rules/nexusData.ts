import type { SectorType } from '../model/types';

// Nexus Wars homebrew values: sector types, benefits, the Anomaly / Void tables, Combat Manipulations
// and the Umbra Shard shop. Tweak them here; the logic in nexus.ts reads everything from this file.
// (Benefit ids are stored on sectors in saved campaigns, so rename a benefit's name, not its id.)

export const SECTOR_TYPES: Record<SectorType, { label: string; desc: string }> = {
  home: { label: 'Home sector', desc: 'Each faction has one. It can be attacked but never controlled.' },
  planet: { label: 'Planet', desc: 'Gives one benefit to whoever controls it.' },
  research: { label: 'Research station', desc: 'Each round, unlock one Nexus Traits table until your next round income.' },
  void: { label: 'Void / Space hulk', desc: 'Defeat an AI opponent here for a one-off D6 reward. Salvage: +25 Supply each round while you hold it.' },
  anomaly: { label: 'Anomaly', desc: 'Roll a D6 on the Anomaly table each round.' },
  empty: { label: 'Empty space', desc: 'No benefit.' },
  voidspawn: { label: 'Voidspawn', desc: "The Void Echoes' home sector. It can be attacked but never controlled. When a round ends the Echoes spread from their territory; beating them here lowers their threat the most." },
};
export const SECTOR_TYPE_KEYS = Object.keys(SECTOR_TYPES) as SectorType[];

/** Sectors that can be attacked but never change hands. */
export const STRONGHOLDS: SectorType[] = ['home', 'voidspawn'];

/** The Void Echoes, the AI force: they hold the Voidspawns and spread from them. Their id is the AI's. */
export const ECHOES = { id: 'ai', name: 'Void Echoes', color: '#7d3cff' };
/** Sector types the Void Echoes never spread into (strongholds are never taken either). */
export const ECHOES_SKIP: SectorType[] = ['empty'];

export interface Benefit {
  id: string;
  type: 'home' | 'planet';
  name: string;
  desc: string;
}

export const BENEFITS: Benefit[] = [
  { id: 'largeShardMine', type: 'home', name: 'Large Shard Mine', desc: '+1 Umbra Shard each round.' },
  { id: 'researchStation', type: 'home', name: 'Research Station', desc: 'Unlock one Nexus Traits table permanently.' },
  { id: 'relicCollector', type: 'home', name: 'Relic Collector', desc: 'On a win, roll a D6: on a 6 gain a Common Relic. Nexus Relics cost 3 Umbra Shards less.' },
  { id: 'biomassPool', type: 'home', name: 'Biomass Pool', desc: '+100 Supply each round.' },
  { id: 'shardMine', type: 'planet', name: 'Shard Mine', desc: 'Each round, roll a D6: on a 3+ gain 1 Umbra Shard.' },
  { id: 'fertileLand', type: 'planet', name: 'Fertile Land', desc: '+50 Supply each round.' },
  { id: 'spacePort', type: 'planet', name: 'Militarized Space Port', desc: '1 free Combat Manipulation each round, for your next match.' },
];

/** The campaign round: income, catch-up and the Void Echoes' threat. */
export const NEXUS_ROUNDS = {
  /** Umbra Shards for each match a force plays, at most `matchBonusMax` per round. */
  matchBonusUs: 1,
  matchBonusMax: 2,
  /** Catch-up: +1 Umbra Shard per this many sectors behind the faction holding the most, up to `underdogMax`. */
  underdogStep: 2,
  underdogMax: 3,
  /** Rounds 1 to this: no home-sector challenges, and the Echoes only spread into unclaimed sectors. */
  graceRounds: 3,
  /** Threat starts here and stays between 0 and `threatMax`. */
  threatStart: 1,
  threatMax: 6,
  /** Each round's end: threat rises by this, and falls for every win against the Echoes that round. */
  threatPerRound: 1,
  threatPerWin: 1,
  threatPerVoidspawnWin: 2,
  /** Sectors the Echoes spread into when a round ends, by threat level (index 0 to threatMax). */
  spreadsByThreat: [0, 1, 1, 2, 2, 3, 3],
  /** The Echoes prefer sectors held by the faction with the most sectors: they weigh this many times more. */
  leaderWeight: 3,
  /** Salvage from a held Void / Space hulk sector, each round. */
  voidSupply: 25,
  /** Shard Mine: roll this or more on a D6 for 1 Umbra Shard. */
  shardMineRoll: 3,
  /** Relic Collector: Nexus Relics cost this many fewer Umbra Shards. */
  relicCollectorDiscount: 3,
  /** How many ended rounds the campaign keeps, so players who miss a few can still claim their income. */
  keepRounds: 8,
};

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
  { text: 'All Nexus tables unlocked until your next round income', unlockAll: true },
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
  { name: 'Bombardment', desc: 'At the end of round 1, one enemy unit takes 6 hits with AP(1).' },
  { name: 'Dark Shroud', desc: 'The first time one chosen unit takes wounds, ignore up to 3 of them.' },
];
export const MANIPULATION_PREFIX = 'Combat Manipulation';
export const ORGANIZED_STRIKE = 'Organized Strike';

export type UmbraBuy = 'rp' | 'knowledge' | 'manipulation' | 'strike' | 'reinforce' | 'expansion' | 'relic' | 'evolution';
export const UMBRA_SHOP: { key: UmbraBuy; name: string; cost: number; desc: string }[] = [
  { key: 'rp', name: 'Requisition', cost: 3, desc: 'Convert into 1 RP.' },
  { key: 'knowledge', name: 'Umbral Knowledge', cost: 1, desc: '+3 XP to one unit.' },
  { key: 'manipulation', name: 'Combat Manipulation', cost: 1, desc: 'One tactical advantage for your next match.' },
  { key: 'strike', name: ORGANIZED_STRIKE, cost: 2, desc: '+200 Supply Limit once, when attacking a sector.' },
  { key: 'reinforce', name: 'Reinforce Sector', cost: 3, desc: '+200 Supply Limit when defending that sector. One per sector; lost if the sector changes hands.' },
  { key: 'expansion', name: 'Forced Expansion', cost: 5, desc: 'Take an uncontrolled sector without a match (no match rewards).' },
  { key: 'relic', name: 'Nexus Relic', cost: 6, desc: 'Bought together with the normal Crusade relic requisition (its RP cost too).' },
  { key: 'evolution', name: 'Umbral Evolution', cost: 12, desc: 'A free unique Nexus trait: BP goes up, but it does not use a level.' },
];
