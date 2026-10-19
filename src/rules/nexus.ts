import type { BattleResult, Campaign, CampaignEvent, Force, ForceNexus, Sector, SectorType } from '../model/types';
import { CATEGORIES, type Category } from './data';

// Nexus Wars: sectors, their benefits, and what a faction earns after each match.

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
export const benefitOf = (s: Sector) => BENEFITS.find((b) => b.id === s.benefit && b.type === s.type);

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

export const emptyNexus = (factionId: string): ForceNexus => ({ factionId, permanentTables: [], tempTables: [], traitTokens: 0, pending: [] });

/** Can this force take a Nexus trait for a unit of this category right now? */
export function nexusAccess(force: Force, category: Category): 'unlocked' | 'token' | null {
  const n = force.nexus;
  if (!n) return 'unlocked'; // not in a Nexus campaign: no gating
  if (n.tempTables === 'all' || n.tempTables.includes(category) || n.permanentTables.includes(category)) return 'unlocked';
  return n.traitTokens > 0 ? 'token' : null;
}

export function unlockedTables(n: ForceNexus): Category[] {
  if (n.tempTables === 'all') return [...CATEGORIES];
  return CATEGORIES.filter((c) => n.permanentTables.includes(c) || (n.tempTables as Category[]).includes(c));
}

export const ownedSectors = (c: Campaign, factionId: string) => c.sectors.filter((s) => s.owner === factionId);
export const homeOf = (c: Campaign, factionId: string) => c.sectors.find((s) => s.type === 'home' && s.owner === factionId);

/** Apply a reported sector game to the campaign. Home sectors never change hands. */
export function recordSectorGame(c: Campaign, e: CampaignEvent) {
  c.log.push(e);
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.winner || e.winner === 'ai') return;
  if (s.type !== 'home') s.owner = e.winner;
  if (s.type === 'void' && e.defender === 'ai') s.rewardClaimed = true;
}

// ---- after-match generation ----

export type NexusItemKind = 'us' | 'supply' | 'shardRoll' | 'relicRoll' | 'research' | 'manipulation' | 'anomaly' | 'void';

export interface NexusItem {
  key: string;
  kind: NexusItemKind;
  source: string;
  us?: number;
  supply?: number;
}

export interface NexusPick {
  roll: number | null;
  /** Research table (Category), relic name, or manipulation name. */
  choice: string;
  /** Unit id, or "<unitId>:<scarId>" for scar removal. */
  target: string;
  alloc: Record<string, number>;
}
export const emptyNexusPick = (): NexusPick => ({ roll: null, choice: '', target: '', alloc: {} });

/** What one sector gives its owner after a match. `once` = a home-sector conquest, where standing perks pay out once too. */
function sectorItems(s: Sector, prefix: string, won: boolean, once: boolean): NexusItem[] {
  const key = `${prefix}${s.id}`;
  const b = benefitOf(s);
  const source = `${prefix ? 'Conquest — ' : ''}${s.name}${b ? `: ${b.name}` : ''}`;
  switch (s.type === 'home' || s.type === 'planet' ? s.benefit : s.type) {
    case 'largeShardMine': return [{ key, kind: 'us', source, us: 1 }];
    case 'biomassPool': return [{ key, kind: 'supply', source, supply: 100 }];
    case 'relicCollector': return won ? [{ key, kind: 'relicRoll', source }] : [];
    case 'researchStation': return once ? [{ key, kind: 'research', source }] : [];
    case 'shardMine': return [{ key, kind: 'shardRoll', source }];
    case 'fertileLand': return [{ key, kind: 'supply', source, supply: 50 }];
    case 'spacePort': return once ? [{ key, kind: 'manipulation', source }] : [];
    case 'research': return [{ key, kind: 'research', source: `${s.name}: Research station` }];
    case 'anomaly': return [{ key, kind: 'anomaly', source: `${s.name}: Anomaly` }];
    default: return [];
  }
}

export interface NexusContext {
  items: NexusItem[];
  notes: string[];
}

/** Everything a faction earns after a match, given the campaign, the sector fought over (if any) and the result. */
export function nexusGeneration(c: Campaign | undefined, factionId: string | undefined, sectorId: string, result: BattleResult, vsAi: boolean): NexusContext {
  if (!c || !factionId || !c.factions.some((f) => f.id === factionId)) return { items: [], notes: [] };
  const won = result === 'win';
  const fought = c.sectors.find((s) => s.id === sectorId);
  const notes: string[] = [];
  const items: NexusItem[] = [];

  if (fought?.type === 'home' && !vsAi && result !== 'draw' && fought.owner) {
    const defending = fought.owner === factionId;
    if (!won) {
      notes.push(`Lost a home-sector challenge ${defending ? 'defending' : 'attacking'} ${fought.name}: basic crusade rewards only, Nexus benefits forfeited.`);
      return { items, notes };
    }
    if (!defending) {
      const loser = c.factions.find((f) => f.id === fought.owner);
      notes.push(`Conquered ${loser?.name ?? 'the enemy'}'s home sector: you gain all their faction benefits once.`);
      for (const s of ownedSectors(c, fought.owner)) items.push(...sectorItems(s, 'conquest:', won, true));
    }
  }

  for (const s of ownedSectors(c, factionId)) items.push(...sectorItems(s, '', won, false));

  if (fought?.type === 'void' && vsAi && won) {
    if (fought.rewardClaimed) notes.push(`${fought.name}'s one-off reward has already been claimed.`);
    else items.push({ key: 'void', kind: 'void', source: `${fought.name}: Void / Space hulk` });
  }
  return { items, notes };
}

export const ROLL_SIDES: Partial<Record<NexusItemKind, number>> = { shardRoll: 6, relicRoll: 6, anomaly: 6, void: 6 };

/** The table entry a rolled item resolves to, for anomaly / void rolls. */
export function nexusEntry(item: NexusItem, pick: NexusPick | undefined): NexusTableEntry | null {
  const roll = pick?.roll;
  if (!roll) return null;
  if (item.kind === 'anomaly') return ANOMALY_TABLE[roll - 1] ?? null;
  if (item.kind === 'void') return VOID_TABLE[roll - 1] ?? null;
  return null;
}

/** What to do at the start of resolving a match: last match's temporary unlocks and manipulations expire. */
export function expireNexus(n: ForceNexus) {
  n.tempTables = [];
  n.pending = n.pending.filter((p) => !p.startsWith(MANIPULATION_PREFIX));
}
