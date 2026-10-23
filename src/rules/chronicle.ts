import type { Campaign, CampaignEvent, TurnReportLine } from '../model/types';
import { rememberedBy, visibleTo } from './fog';
import { journalStatus } from './journal';
import { ECHOES, eventById, factionName } from './nexus';
import { reportFor } from './report';

// The Campaign Chronicle (Nexus Wars): the war's story, round by round. It weaves the games in the log, the turn
// reports, the Galactic Events, the Warlords named and the Crossroads Journals into one history, told through a
// faction's eyes (fog of war, as the log and reports already are) or in full for the GM.

export type ChronicleKind = 'game' | 'raid' | 'event' | 'journal' | 'warlord' | 'map' | 'news';

export interface ChronicleEntry {
  round: number;
  icon: string;
  text: string;
  kind: ChronicleKind;
  /** The factions it concerns (none: news for everyone). */
  factions: string[];
  sectorId?: string;
  /** The logged game it tells of. */
  eventId?: string;
}

export interface ChronicleRound {
  round: number;
  date?: string;
  entries: ChronicleEntry[];
}

/** The games a viewer knows of: the ones it fought, Marauder and Crisis games, and the ones at sectors it saw. Everything with no viewer, nothing for '-'. */
export function logFor(c: Campaign, viewer?: string): CampaignEvent[] {
  if (viewer === '-') return [];
  if (!viewer) return c.log;
  const seen = visibleTo(c, viewer);
  const known = new Set([...seen, ...rememberedBy(c, viewer, seen)]);
  return c.log.filter((e) => e.crisis || e.marauder || e.attacker === viewer || e.defender === viewer || e.winner === viewer || known.has(e.sectorId));
}

const isFaction = (c: Campaign, id?: string): id is string => !!id && c.factions.some((f) => f.id === id);

/** One game, told in a line. */
export function gameLine(c: Campaign, e: CampaignEvent): Pick<ChronicleEntry, 'icon' | 'text'> {
  const at = c.sectors.find((s) => s.id === e.sectorId)?.name ?? 'a lost sector';
  if (e.skirmish) return { icon: '⚔', text: `Skirmish: ${factionName(c, e.winner)} won${e.defender === ECHOES.id ? ` a patrol against the ${ECHOES.name}` : ''}.` };
  if (e.crisis) return { icon: '☄', text: `Nexus Crisis at ${at}: ${e.winner === ECHOES.id ? 'the Echo Lord prevailed' : 'the factions beat the Echo Lord'}.` };
  if (e.marauder) return { icon: '🏴', text: `${factionName(c, e.attacker)} fought ${e.marauder.name} at ${at}: ${e.winner === e.attacker ? 'the band is broken' : 'the Marauders held'}.` };
  if (e.spread) return { icon: '☣', text: `The ${ECHOES.name} spread to ${at}${isFaction(c, e.defender) ? ` from ${factionName(c, e.defender)}` : ''}.` };
  const loot = e.loot ? ` Looted ${e.loot.name}.` : '';
  if (!e.winner) return { icon: '⚖', text: `${at}: ${factionName(c, e.attacker)} and ${factionName(c, e.defender)} fought to a draw.` };
  if (e.winner === e.attacker) return { icon: '⚔', text: `${factionName(c, e.attacker)} took ${at} from ${factionName(c, e.defender)}.${loot}` };
  return { icon: '🛡', text: `${factionName(c, e.defender)} held ${at} against ${factionName(c, e.attacker)}.` };
}

const KIND_BY_ICON: Record<string, ChronicleKind> = { '🏴': 'raid', '☄': 'event', '✧': 'map', '✦': 'map', '♛': 'map', '☠': 'map' };
const BATTLE_ICONS = new Set(['⚔', '🛡', '⚖']);

/** The history the viewer may read (all of it with no viewer, none for '-'), newest round first. */
export function chronicle(c: Campaign, viewer?: string): ChronicleRound[] {
  if (viewer === '-') return [];
  const rounds = new Map<number, ChronicleRound>();
  const add = (round: number, e: Omit<ChronicleEntry, 'round'>) => {
    let r = rounds.get(round);
    if (!r) rounds.set(round, (r = { round, entries: [] }));
    r.entries.push({ round, ...e });
  };
  const ownerOf = (sectorId?: string) => c.sectors.find((s) => s.id === sectorId)?.owner;

  for (const s of c.rounds ?? []) {
    if (!rounds.has(s.round)) rounds.set(s.round, { round: s.round, date: s.date, entries: [] });
    if (s.event) add(s.round, { icon: '✺', kind: 'event', factions: [], text: `Galactic event: ${eventById(s.event)?.name ?? s.event}.` });
  }
  const now = c.round ?? 1;
  if (c.event?.round === now) add(now, { icon: '✺', kind: 'event', factions: [], text: `Galactic event: ${eventById(c.event.id)?.name ?? c.event.id}.` });

  for (const f of c.factions) {
    if (f.warlord)
      add(f.warlord.since, { icon: '♚', kind: 'warlord', factions: [f.id], text: `${f.warlord.name} became ${f.name}'s Warlord.` });
  }

  const games = logFor(c, viewer);
  for (const e of games) {
    add(e.round ?? 1, { ...gameLine(c, e), kind: 'game', eventId: e.id, sectorId: e.skirmish ? undefined : e.sectorId,
      factions: [...new Set([e.attacker, e.defender, e.winner].filter((x) => isFaction(c, x)))] });
  }

  for (const r of c.reports ?? []) {
    const round = rounds.get(r.round) ?? { round: r.round, entries: [] };
    round.date ??= r.date;
    rounds.set(r.round, round);
    const fought = (l: TurnReportLine) => l.eventId || (BATTLE_ICONS.has(l.icon) && c.log.some((e) => (e.round ?? 1) === r.round && e.sectorId === l.sectorId));
    for (const l of reportFor(r, viewer)) {
      // Games come from the log, and events from the rounds, so they aren't told twice.
      if (fought(l) || l.icon === '✺') continue;
      const kind = KIND_BY_ICON[l.icon] ?? 'news';
      const owner = ownerOf(l.sectorId);
      add(r.round, { icon: l.icon, text: l.text, kind, sectorId: l.sectorId, factions: l.factions ?? (kind === 'raid' && isFaction(c, owner) ? [owner] : []) });
    }
  }

  for (const j of c.journals ?? []) {
    if (viewer && j.factionId !== viewer) continue;
    const ending = j.picked != null ? j.options?.[j.picked]?.title : undefined;
    const status = journalStatus(j);
    add(j.round, {
      icon: '📜', kind: 'journal', factions: [j.factionId], sectorId: j.sectorId,
      text: ending ? `${j.warlord} came to a crossroads, and chose: ${ending}.` : `${j.warlord} came to a crossroads${status === 'offer' ? ' — an ending waits to be picked' : ' — the tale is still being played'}.`,
    });
  }

  for (const d of c.duels ?? []) {
    if (d.status !== 'settled') continue;
    const sides = [d.challenger.factionId, d.challenged.factionId];
    if (viewer && !sides.includes(viewer)) continue;
    add(d.round, {
      icon: '⚔', kind: 'game', factions: sides,
      text: `Duel: ${factionName(c, sides[0])} vs ${factionName(c, sides[1])} — ${d.winner ? `${factionName(c, d.winner)} won the wager` : 'a draw'}.`,
    });
  }

  return [...rounds.values()].filter((r) => r.entries.length).sort((a, b) => b.round - a.round);
}

/** The entries that concern a faction (all of them, with none). */
export const chronicleOf = (rounds: ChronicleRound[], factionId?: string): ChronicleRound[] =>
  !factionId ? rounds : rounds.map((r) => ({ ...r, entries: r.entries.filter((e) => e.factions.includes(factionId)) })).filter((r) => r.entries.length);
