import type { BattleResult, Campaign, CampaignEvent, Force, ForceNexus, Sector, SectorGuardian } from '../model/types';
import { CATEGORIES, type Category } from './data';
import {
  ANOMALY_TABLE, BENEFITS, ECHOES, ECHO_LORDS, GALACTIC_EVENTS, GUARDIANS, GUARDIAN_LOOT, MANIPULATION_PREFIX, NEXUS_CRISIS, NEXUS_ROUNDS, PRODUCTION, STRONGHOLDS, VOID_TABLE, WARLORDS,
  type GalacticEvent, type NexusTableEntry,
} from './nexusData';
import { explore } from './fog';
import { MARAUDER_ID, unrecordMarauderGame } from './marauders';
import { settleGame, unsettleGame } from './movement';
import { bankCap, hasBuilding, loseBank, produces } from './production';
import { hasPerk } from './warlords';

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
  id === ECHOES.id ? ECHOES.name : id === MARAUDER_ID ? 'Marauders' : c.factions.find((f) => f.id === id)?.name ?? (id ? 'Unknown faction' : 'Unclaimed');

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

export const eventById = (id: string | undefined) => GALACTIC_EVENTS.find((e) => e.id === id);
/** This round's Galactic Event, if one was drawn for it. */
export function activeEvent(c: Campaign): (GalacticEvent & { sectorIds: string[] }) | undefined {
  const e = c.event && c.event.round === currentRound(c) ? eventById(c.event.id) : undefined;
  return e && { ...e, sectorIds: c.event!.sectorIds ?? [] };
}
/** The sector is cut off by this round's Warp Storm: it can't be attacked. */
export const stormed = (c: Campaign, sectorId: string) => !!activeEvent(c)?.sectorIds.includes(sectorId);

export const lordById = (id: string | undefined) => ECHO_LORDS.find((l) => l.id === id);
/** The Nexus Crisis to fight this round, if there is one. */
/** The units of this force that already took part in a game or an Expedition this round. Each unit takes part once a round. */
export function unitsUsed(f: Force, c: Campaign | undefined): string[] {
  const used = f.nexus?.usedUnits;
  return c && used && used.round === currentRound(c) ? used.ids : [];
}

export function markUnitsUsed(f: Force, c: Campaign, ids: string[]) {
  if (!f.nexus) return;
  f.nexus.usedUnits = { round: currentRound(c), ids: [...new Set([...unitsUsed(f, c), ...ids])] };
}

export const activeCrisis = (c: Campaign) => (c.crisis && c.crisis.round === currentRound(c) ? c.crisis : undefined);

/** Hand a sector to a new owner, noting the old one. A Reinforce, the production bank and a guardian don't survive the change (buildings do; a guardian stays when the Echoes take it). */
export function changeHands(s: Sector, owner: string, undo: NonNullable<CampaignEvent['undo']>) {
  undo.owner = s.owner ?? '';
  s.owner = owner;
  if (s.reinforced) {
    undo.reinforced = true;
    delete s.reinforced;
  }
  loseBank(s, undo);
  if (s.guardian && owner !== ECHOES.id) {
    undo.guardian = s.guardian;
    delete s.guardian;
  }
}

/**
 * Roll the slain guardian's loot for the faction that beat it: D6 + its tier's bonus (GUARDIAN_LOOT), and give it.
 * Materials go to the sector's bank (or the faction's home, if the sector has none), up to the bank's cap.
 */
export function rollGuardianLoot(c: Campaign, s: Sector, g: Pick<SectorGuardian, 'tier'>, factionId: string, rand = Math.random): NonNullable<CampaignEvent['loot']> | undefined {
  const f = c.factions.find((x) => x.id === factionId);
  if (!f) return undefined;
  const T = GUARDIAN_LOOT.table;
  const roll = Math.min(T.length, 1 + Math.floor(rand() * 6) + (GUARDIAN_LOOT.bonus[g.tier as keyof typeof GUARDIAN_LOOT.bonus] ?? 0));
  const l = T[roll - 1];
  const loot: NonNullable<CampaignEvent['loot']> = { roll, id: l.id, name: l.name, factionId };
  if (l.id === 'materials') {
    const bank = produces(s) ? s : c.sectors.find((x) => x.type === 'home' && x.owner === factionId);
    if (bank) {
      const before = bank.bank ?? 0;
      bank.bank = Math.max(before, Math.min(bankCap(bank, c), before + (l.amount ?? 0)));
      loot.amount = bank.bank - before;
      loot.sectorId = bank.id;
    }
  } else if (l.id === 'research') {
    loot.amount = l.amount ?? 0;
    f.research = (f.research ?? 0) + loot.amount;
  } else if (l.id === 'blueprint') f.blueprints = (f.blueprints ?? 0) + 1;
  else f.cores = (f.cores ?? 0) + 1;
  return loot;
}

/** Take a guardian's loot back (its log entry was deleted), as far as it hasn't been spent. */
function returnGuardianLoot(c: Campaign, loot: NonNullable<CampaignEvent['loot']>) {
  const f = c.factions.find((x) => x.id === loot.factionId);
  const take = (n: number | undefined, k: number) => Math.max(0, (n ?? 0) - k) || undefined;
  if (loot.id === 'materials') {
    const s = c.sectors.find((x) => x.id === loot.sectorId);
    if (s && s.owner === loot.factionId) s.bank = take(s.bank, loot.amount ?? 0);
  }
  if (!f) return;
  if (loot.id === 'research') f.research = take(f.research, loot.amount ?? 0);
  if (loot.id === 'blueprint') f.blueprints = take(f.blueprints, 1);
  if (loot.id === 'core') f.cores = take(f.cores, 1);
}

/** Apply a reported sector game to the campaign. Home sectors and Voidspawns never change hands. Skirmishes (no sector) are only logged. */
export function recordSectorGame(c: Campaign, e: CampaignEvent, rand = Math.random) {
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
  // The first to beat a Lost Archive's garrison carries off its Archive unlock; plundered, it fades when the round ends.
  if (s.type === 'archive' && e.defender === 'ai' && !s.rewardClaimed) {
    undo.rewardClaimed = true;
    s.rewardClaimed = true;
    const f = c.factions.find((x) => x.id === e.winner);
    if (f) {
      undo.archive = true;
      f.archives = (f.archives ?? 0) + 1;
    }
  }
  if (undo.guardian) e.loot = rollGuardianLoot(c, s, undo.guardian, e.winner, rand);
  settleGame(c, e, s, undo);
  if (Object.keys(undo).length) e.undo = undo;
  explore(c);
}

/** Delete a log entry. If nothing has changed the sector since, put it back the way the game found it. */
export function removeSectorGame(c: Campaign, id: string) {
  const i = c.log.findIndex((x) => x.id === id);
  if (i < 0) return;
  const [e] = c.log.splice(i, 1);
  // A game against marauders didn't change the map: the band it broke comes back, and its loot goes.
  if (e.marauder) {
    unrecordMarauderGame(c, e);
    if (e.loot) returnGuardianLoot(c, e.loot);
    return;
  }
  // A Crisis battle didn't change the map: deleting it means the Crisis hasn't been fought yet (while its round lasts).
  if (e.crisis) {
    const crisis = activeCrisis(c);
    if (crisis?.battleId && crisis.battleId === e.battleId) {
      delete crisis.result;
      delete crisis.mvp;
      delete crisis.battleId;
    }
    return;
  }
  const s = c.sectors.find((x) => x.id === e.sectorId);
  if (!s || !e.undo || c.log.slice(i).some((x) => x.sectorId === e.sectorId && x.undo)) return;
  if (e.undo.owner !== undefined && s.owner === e.winner) {
    if (e.undo.owner) s.owner = e.undo.owner;
    else delete s.owner;
  }
  if (e.undo.rewardClaimed) delete s.rewardClaimed;
  const winner = c.factions.find((x) => x.id === e.winner);
  if (e.undo.archive && winner) {
    winner.archives = Math.max(0, (winner.archives ?? 0) - 1);
    if (!winner.archives) delete winner.archives;
  }
  if (e.undo.reinforced && (s.owner ?? '') === e.undo.owner) s.reinforced = true;
  if (e.undo.bank && (s.owner ?? '') === e.undo.owner) s.bank = e.undo.bank;
  if (e.undo.construction && (s.owner ?? '') === e.undo.owner) s.construction = e.undo.construction;
  if (e.undo.guardian && (s.owner ?? '') === e.undo.owner) s.guardian = e.undo.guardian;
  if (e.loot) returnGuardianLoot(c, e.loot);
  if (e.undo.positions) unsettleGame(c, e.undo.positions);
}

// ---- income and after-match generation ----

export type NexusItemKind = 'us' | 'supply' | 'shardRoll' | 'relicRoll' | 'research' | 'manipulation' | 'anomaly' | 'void' | 'matchBonus' | 'relic' | 'relicSteal' | 'medicae';

export interface NexusItem {
  key: string;
  kind: NexusItemKind;
  source: string;
  us?: number;
  supply?: number;
  /** kind 'relic': this relic and no other. kind 'relicSteal': the slain guardian's relic, if a Hero took it. */
  relic?: string;
}

/** A 'relicSteal' pick's `choice` when the relic was taken (a Hero slew the guardian and made the roll). */
export const RELIC_TAKEN = 'taken';

export interface NexusPick {
  roll: number | null;
  /** Research table (Category), relic name, or manipulation name. */
  choice: string;
  /** Unit id, or "<unitId>:<scarId>" for scar removal. */
  target: string;
  alloc: Record<string, number>;
}
export const emptyNexusPick = (): NexusPick => ({ roll: null, choice: '', target: '', alloc: {} });

/** What one sector pays its owner each round: its benefit, then its buildings. */
export function incomeItems(s: Sector, prefix = ''): NexusItem[] {
  const key = `${prefix}${s.id}`;
  const out = benefitItems(s, prefix);
  const place = `${prefix ? 'Conquest — ' : ''}${s.name}`;
  if (hasBuilding(s, 'refinery')) out.push({ key: `${key}:refinery`, kind: 'shardRoll', source: `${place}: Shard Refinery` });
  if (hasBuilding(s, 'depot')) out.push({ key: `${key}:depot`, kind: 'supply', source: `${place}: Supply Depot`, supply: PRODUCTION.depotSupply });
  if (hasBuilding(s, 'medicae')) out.push({ key: `${key}:medicae`, kind: 'medicae', source: `${place}: Medicae Ward` });
  if (hasBuilding(s, 'spire')) out.push({ key: `${key}:spire`, kind: 'us', source: `${place}: Umbral Spire`, us: 3 });
  return out;
}

function benefitItems(s: Sector, prefix: string): NexusItem[] {
  const key = `${prefix}${s.id}`;
  const b = benefitOf(s);
  const source = `${prefix ? 'Conquest — ' : ''}${s.name}${b ? `: ${b.name}` : ''}`;
  switch (s.type === 'home' || s.type === 'planet' ? s.benefit : s.type) {
    case 'largeShardMine': return [{ key, kind: 'us', source, us: 3 }];
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

/** The guardian a faction beat at a sector: still standing there (the game isn't logged yet), or taken by its win this round. */
function slainGuardian(c: Campaign, factionId: string, s: Sector): SectorGuardian | undefined {
  if (s.guardian) return s.guardian;
  return c.log.find((e) => e.sectorId === s.id && e.winner === factionId && e.undo?.guardian && (e.round ?? 1) === currentRound(c))?.undo?.guardian;
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
  if (s && stormed(c, s.id)) return `Cut off by the ${activeEvent(c)!.name} this round`;
  if (s?.type !== 'home' || !s.owner) return undefined;
  if (activeEvent(c)?.noHome) return `No home-sector challenges during the ${activeEvent(c)!.name}`;
  if (currentRound(c) <= NEXUS_ROUNDS.graceRounds) return `No home-sector challenges until round ${NEXUS_ROUNDS.graceRounds + 1}`;
  if (challengerOf(c, s.id, s.owner)) return 'Home sector already challenged this round';
  return undefined;
}

/** What a faction earns from the match itself, given the campaign, the sector fought over (if any) and the result.
 *  Sector income is paid once per round instead (rounds.ts). `opponent` is the enemy faction, if known. */
export function nexusGeneration(
  c: Campaign | undefined, factionId: string | undefined, sectorId: string, result: BattleResult, vsAi: boolean, opponent?: string,
  /** From a tracked battle: its Crisis round (if it was the Nexus Crisis), the recording force, and the battle's MVP force. */
  battle?: { crisis?: number; forceId?: string; mvp?: string },
): NexusContext {
  if (!c || !factionId || !c.factions.some((f) => f.id === factionId)) return { items: [], notes: [] };
  const won = result === 'win';
  if (battle?.crisis && c.crisis?.round === battle.crisis) return crisisGeneration(c, won, battle.forceId, battle.mvp ?? c.crisis.mvp);
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
  // A Reaver Warlord's force takes more from its wins.
  const lord = c.factions.find((f) => f.id === factionId)?.warlord;
  const reaver = won && battle?.forceId && lord?.forceId === battle.forceId
    ? (hasPerk(c, factionId, 'plunder') ? WARLORDS.plunder : 0) + (hasPerk(c, factionId, 'warlust') ? WARLORDS.warlust : 0) : 0;
  if (reaver) items.push({ key: 'warlord', kind: 'us', source: `Warlord ${lord!.name} (Reaver)`, us: reaver });
  const home = homeOf(c, factionId);
  if (won && home?.benefit === 'relicCollector') items.push({ key: home.id, kind: 'relicRoll', source: `${home.name}: Relic Collector` });

  if (fought?.type === 'void' && vsAi && won) {
    if (fought.rewardClaimed) notes.push(`${fought.name}'s one-off reward has already been claimed.`);
    else items.push({ key: 'void', kind: 'void', source: `${fought.name}: Void / Space hulk` });
  }
  if (fought?.type === 'archive' && vsAi && won)
    notes.push(fought.rewardClaimed
      ? `${fought.name} has already been plundered.`
      : `Took ${fought.name}: +1 Archive unlock for ${factionName(c, factionId)}, to research any one building from the tech tree, ignoring its requirements.`);
  const guardian = fought && won && vsAi ? slainGuardian(c, factionId, fought) : undefined;
  if (guardian) {
    const relic = guardian.unit.relics[0];
    if (relic) items.push({ key: 'guardian', kind: 'relicSteal', source: `${guardian.name}, guardian of ${fought!.name}: ${relic.name}`, relic: relic.name });
    notes.push(`Slew ${guardian.name}, the ${guardian.tier} guardian of ${fought!.name}${relic
      ? `. If one of your Heroes (or a Heroic Rise unit) dealt the killing blow and rolled ${GUARDIANS.stealRoll}+, it took ${relic.name}`
      : ''}.`);
  }
  if (fought && won && vsAi && retookFromEchoes(c, factionId, fought)) {
    ctx.bounty = true;
    notes.push(`Retook ${fought.name} from the ${ECHOES.name}: a bounty roll on the AI special table.`);
  }
  return ctx;
}

/** What a force earns from fighting the Nexus Crisis. */
function crisisGeneration(c: Campaign, won: boolean, forceId: string | undefined, mvp: string | undefined): NexusContext {
  const crisis = c.crisis!;
  const lord = lordById(crisis.lord)?.name ?? 'the Echo Lord';
  const items: NexusItem[] = [{ key: 'matchBonus', kind: 'matchBonus', source: 'Match bonus', us: NEXUS_ROUNDS.matchBonusUs }];
  const notes: string[] = [];
  if (won) {
    items.push({ key: 'crisis', kind: 'us', source: `Nexus Crisis — ${lord} defeated`, us: NEXUS_CRISIS.winUs });
    if (forceId && mvp === forceId) items.push({ key: 'crisisMvp', kind: 'relic', source: `Nexus Crisis MVP: a ${NEXUS_CRISIS.mvpTier} relic` });
  } else notes.push(`The Nexus Crisis was lost: the ${ECHOES.name} take each faction's sector nearest ${lord} when the round ends.`);
  return { items, notes, round: crisis.round };
}

export const ROLL_SIDES: Partial<Record<NexusItemKind, number>> = { shardRoll: 6, relicRoll: 6, anomaly: 6, void: 6 };

/** A Medicae Ward's round income: no roll. */
export const MEDICAE_ENTRY: NexusTableEntry = { text: 'Remove 1 battle scar from a unit', removeScar: true };

/** The table entry an item resolves to: anomaly / void rolls, and the Medicae Ward. */
export function nexusEntry(item: NexusItem, pick: NexusPick | undefined): NexusTableEntry | null {
  if (item.kind === 'medicae') return MEDICAE_ENTRY;
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
