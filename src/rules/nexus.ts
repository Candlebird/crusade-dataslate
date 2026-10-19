import type { BattleResult, Campaign, CampaignEvent, Force, ForceNexus, Sector } from '../model/types';
import { CATEGORIES, type Category } from './data';
import { ANOMALY_TABLE, BENEFITS, ECHOES, MANIPULATION_PREFIX, STRONGHOLDS, VOID_TABLE, type NexusTableEntry } from './nexusData';

// Nexus Wars: what a faction earns after each match. The tables and costs live in nexusData.ts.

export * from './nexusData';

export const benefitOf = (s: Sector) => BENEFITS.find((b) => b.id === s.benefit && b.type === s.type);

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

export const factionName = (c: Campaign, id: string | undefined) =>
  id === ECHOES.id ? ECHOES.name : c.factions.find((f) => f.id === id)?.name ?? (id ? 'Unknown faction' : 'Unclaimed');

export const factionColor = (c: Campaign, id: string | undefined) => (id === ECHOES.id ? ECHOES.color : c.factions.find((f) => f.id === id)?.color);

/** Everyone who can hold sectors: the campaign's factions, then the Void Echoes. */
export const sidesOf = (c: Campaign) => [...c.factions.map((f) => ({ id: f.id, name: f.name, color: f.color })), ECHOES];

/** Home sectors and Voidspawns can be attacked but never change hands. */
export const isStronghold = (s: Sector) => STRONGHOLDS.includes(s.type);

/** What a sector game's result does to the map, in words ('' when nothing changes). */
export function sectorEffect(c: Campaign, e: Pick<CampaignEvent, 'sectorId' | 'winner'>): string {
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.winner || e.winner === 'ai') return '';
  if (s.type === 'voidspawn') return `${factionName(c, e.winner)} beats back the ${ECHOES.name}. ${s.name} does not change hands.`;
  if (s.type === 'home')
    return `${factionName(c, e.winner)} wins the home-sector challenge: the winner gains the loser's faction benefits once; the loser forfeits Nexus benefits for that match. ${s.name} does not change hands.`;
  return s.owner === e.winner ? `${factionName(c, e.winner)} holds ${s.name}.` : `${factionName(c, e.winner)} takes control of ${s.name}.`;
}

/** Apply a reported sector game to the campaign. Home sectors and Voidspawns never change hands. */
export function recordSectorGame(c: Campaign, e: CampaignEvent) {
  c.log.push(e);
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.winner || e.winner === 'ai') return;
  const undo: NonNullable<CampaignEvent['undo']> = {};
  if (!isStronghold(s) && s.owner !== e.winner) {
    undo.owner = s.owner ?? '';
    s.owner = e.winner;
  }
  if (s.type === 'void' && e.defender === 'ai' && !s.rewardClaimed) {
    undo.rewardClaimed = true;
    s.rewardClaimed = true;
  }
  if (Object.keys(undo).length) e.undo = undo;
}

/** Delete a log entry. If nothing has changed the sector since, put it back the way the game found it. */
export function removeSectorGame(c: Campaign, id: string) {
  const i = c.log.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [e] = c.log.splice(i, 1);
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.undo || c.log.slice(i).some((x) => x.sectorId === e.sectorId && x.undo)) return;
  if (e.undo.owner !== undefined && s.owner === e.winner) {
    if (e.undo.owner) s.owner = e.undo.owner;
    else delete s.owner;
  }
  if (e.undo.rewardClaimed) delete s.rewardClaimed;
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
