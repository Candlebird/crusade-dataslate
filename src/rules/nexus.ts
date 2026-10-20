import type { BattleResult, Campaign, CampaignEvent, Force, ForceNexus, Sector } from '../model/types';
import { CATEGORIES, type Category } from './data';
import { ANOMALY_TABLE, BENEFITS, ECHOES, MANIPULATION_PREFIX, NEXUS_ROUNDS, STRONGHOLDS, VOID_TABLE, type NexusTableEntry } from './nexusData';

// Nexus Wars: what a faction earns each round and after each match. The tables and costs live in nexusData.ts;
// the round itself (ending it, income, threat) is in rounds.ts.

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
    return `${factionName(c, e.winner)} wins the home-sector challenge: the winner gains one round of the loser's sector income; the loser forfeits Nexus rewards for that match. ${s.name} does not change hands.`;
  return s.owner === e.winner ? `${factionName(c, e.winner)} holds ${s.name}.` : `${factionName(c, e.winner)} takes control of ${s.name}.`;
}

/** The round being played. */
export const currentRound = (c: Campaign) => c.round ?? 1;

/** Hand a sector to a new owner, noting the old one; a Reinforce doesn't survive the change. */
export function changeHands(s: Sector, owner: string, undo: NonNullable<CampaignEvent['undo']>) {
  undo.owner = s.owner ?? '';
  s.owner = owner;
  if (s.reinforced) {
    undo.reinforced = true;
    delete s.reinforced;
  }
}

/** Apply a reported sector game to the campaign. Home sectors and Voidspawns never change hands. Skirmishes (no sector) are only logged. */
export function recordSectorGame(c: Campaign, e: CampaignEvent) {
  e.round ??= currentRound(c);
  c.log.push(e);
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.winner || e.winner === 'ai') return;
  const undo: NonNullable<CampaignEvent['undo']> = {};
  if (!isStronghold(s) && s.owner !== e.winner) changeHands(s, e.winner, undo);
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
  if (e.undo.reinforced && s.owner === e.undo.owner) s.reinforced = true;
}

// ---- income and after-match generation ----

export type NexusItemKind = 'us' | 'supply' | 'shardRoll' | 'relicRoll' | 'research' | 'manipulation' | 'anomaly' | 'void' | 'matchBonus';

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

/** What one sector pays its owner each round. */
export function incomeItems(s: Sector, prefix = ''): NexusItem[] {
  const key = `${prefix}${s.id}`;
  const b = benefitOf(s);
  const source = `${prefix ? 'Conquest — ' : ''}${s.name}${b ? `: ${b.name}` : ''}`;
  switch (s.type === 'home' || s.type === 'planet' ? s.benefit : s.type) {
    case 'largeShardMine': return [{ key, kind: 'us', source, us: 1 }];
    case 'biomassPool': return [{ key, kind: 'supply', source, supply: 100 }];
    case 'shardMine': return [{ key, kind: 'shardRoll', source }];
    case 'fertileLand': return [{ key, kind: 'supply', source, supply: 50 }];
    case 'spacePort': return [{ key, kind: 'manipulation', source }];
    case 'research': return [{ key, kind: 'research', source: `${source}: Research station` }];
    case 'anomaly': return [{ key, kind: 'anomaly', source: `${source}: Anomaly` }];
    case 'void': return [{ key, kind: 'supply', source: `${source}: Salvage`, supply: NEXUS_ROUNDS.voidSupply }];
    default: return [];
  }
}

/** A won home-sector challenge pays one round of the loser's income, and their standing home perk once. */
function conquestItems(s: Sector): NexusItem[] {
  const key = `conquest:${s.id}`;
  const source = `Conquest — ${s.name}${benefitOf(s) ? `: ${benefitOf(s)!.name}` : ''}`;
  if (s.type === 'home' && s.benefit === 'researchStation') return [{ key, kind: 'research', source }];
  if (s.type === 'home' && s.benefit === 'relicCollector') return [{ key, kind: 'relicRoll', source }];
  return incomeItems(s, 'conquest:');
}

export interface NexusContext {
  items: NexusItem[];
  notes: string[];
  /** The campaign round the match is played in (for the per-round match bonus cap). */
  round?: number;
  /** Retook a sector from the Void Echoes: an extra roll on the AI special table. */
  bounty?: boolean;
  /** Match bonuses the faction's other detachments already earned this round (the cap is the faction's). */
  matchesElsewhere?: number;
}

/** Did this faction take the sector back from the Void Echoes (whether or not the game is logged yet)? */
function retookFromEchoes(c: Campaign, factionId: string, s: Sector) {
  if (isStronghold(s)) return false;
  if (s.owner === ECHOES.id) return true;
  return s.owner === factionId && c.log.some((e) => e.sectorId === s.id && e.winner === factionId && e.undo?.owner === ECHOES.id && (e.round ?? 1) === currentRound(c));
}

/** Who challenged a home sector this round: the latest logged game there against its owner. */
function challengerOf(c: Campaign, sectorId: string, owner: string): string | undefined {
  const games = c.log.filter((e) => e.sectorId === sectorId && !e.spread && (e.round ?? 1) === currentRound(c));
  for (const e of games.reverse()) {
    const other = e.attacker === owner ? e.defender : e.attacker;
    if (other && other !== owner && c.factions.some((f) => f.id === other)) return other;
  }
  return undefined;
}

/** Why a home sector can't be challenged right now (the opening rounds, or it was already challenged this round), if it can't. */
export function homeChallengeBlock(c: Campaign, s: Sector | undefined): string | undefined {
  if (s?.type !== 'home' || !s.owner) return undefined;
  if (currentRound(c) <= NEXUS_ROUNDS.graceRounds) return `No home-sector challenges until round ${NEXUS_ROUNDS.graceRounds + 1}`;
  if (challengerOf(c, s.id, s.owner)) return 'Home sector already challenged this round';
  return undefined;
}

/** What a faction earns from the match itself, given the campaign, the sector fought over (if any) and the result.
 *  Sector income is paid once per round instead (rounds.ts). `opponent` is the enemy faction, if known. */
export function nexusGeneration(c: Campaign | undefined, factionId: string | undefined, sectorId: string, result: BattleResult, vsAi: boolean, opponent?: string): NexusContext {
  if (!c || !factionId || !c.factions.some((f) => f.id === factionId)) return { items: [], notes: [] };
  const won = result === 'win';
  const fought = c.sectors.find((s) => s.id === sectorId);
  const notes: string[] = [];
  const items: NexusItem[] = [];
  const ctx: NexusContext = { items, notes, round: currentRound(c) };

  if (fought?.type === 'home' && !vsAi && result !== 'draw' && fought.owner) {
    const defending = fought.owner === factionId;
    if (!won) {
      notes.push(`Lost a home-sector challenge ${defending ? 'defending' : 'attacking'} ${fought.name}: basic crusade rewards only, Nexus rewards forfeited.`);
      return ctx;
    }
    // Winning as the defender pays the same prize the other way round.
    const loserId = defending ? (opponent && opponent !== factionId ? opponent : challengerOf(c, fought.id, factionId)) : fought.owner;
    const loser = c.factions.find((f) => f.id === loserId);
    if (loser) {
      notes.push(`${defending ? 'Repelled' : 'Won'} a home-sector challenge against ${loser.name}: you gain one round of their sector income.`);
      for (const s of ownedSectors(c, loser.id)) items.push(...conquestItems(s));
    } else notes.push('Held your home sector. Log the game with the challenger to claim one round of their sector income.');
  }

  if (!fought && won) {
    const wins = c.log.filter((e) => e.skirmish && e.winner === factionId && (e.round ?? 1) === ctx.round).length;
    notes.push(wins < NEXUS_ROUNDS.assetsMax
      ? `Skirmish win: +1 Strategic Asset for ${factionName(c, factionId)} to spend in this round's Battle (${wins + 1} of ${NEXUS_ROUNDS.assetsMax}).`
      : `Skirmish win: ${factionName(c, factionId)} already has its ${NEXUS_ROUNDS.assetsMax} Strategic Assets this round.`);
    if (vsAi) notes.push(`A patrol against the ${ECHOES.name}: their threat goes down ${NEXUS_ROUNDS.threatPerPatrolWin} at the round's end.`);
  }
  items.push({ key: 'matchBonus', kind: 'matchBonus', source: 'Match bonus', us: NEXUS_ROUNDS.matchBonusUs });
  const home = homeOf(c, factionId);
  if (won && home?.benefit === 'relicCollector') items.push({ key: home.id, kind: 'relicRoll', source: `${home.name}: Relic Collector` });

  if (fought?.type === 'void' && vsAi && won) {
    if (fought.rewardClaimed) notes.push(`${fought.name}'s one-off reward has already been claimed.`);
    else items.push({ key: 'void', kind: 'void', source: `${fought.name}: Void / Space hulk` });
  }
  if (fought && won && vsAi && retookFromEchoes(c, factionId, fought)) {
    ctx.bounty = true;
    notes.push(`Retook ${fought.name} from the ${ECHOES.name}: a bounty roll on the AI special table.`);
  }
  return ctx;
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

/** What to do at the start of resolving a match: last match's Combat Manipulations are spent. */
export function expireNexus(n: ForceNexus) {
  n.pending = n.pending.filter((p) => !p.startsWith(MANIPULATION_PREFIX));
}
