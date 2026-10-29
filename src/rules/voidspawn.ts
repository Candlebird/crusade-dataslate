import { uid } from '../model/factory';
import type { Campaign, CampaignEvent, EchoMark, Force, Sector } from '../model/types';
import { frontier, isPlaced, type Rand } from './hexmap';
import { ECHOES, ECHOES_SKIP, changeHands, currentRound, isStronghold, stormed } from './nexus';
import { ECHO_MARKS } from './nexusData';
import { warded } from './production';
import { localDate } from '../model/date';

// The Void Echoes spread from their territory when a round ends, into the sectors marked when it began (how many
// depends on their threat: rounds.ts).

/** Sectors the Void Echoes could spread into: next to their territory, never empty space or a stronghold. */
export function spreadTargets(c: Campaign) {
  const front = frontier(c, ECHOES.id);
  return c.sectors.filter((s) => isPlaced(s) && front.has(s.id) && !ECHOES_SKIP.includes(s.type) && !isStronghold(s));
}

/** A random sector for the Void Echoes to spread into, if there is one. `weight` makes some sectors likelier. */
export function pickSpread(c: Campaign, rand: Rand = Math.random, weight: (s: Sector) => number = () => 1, only: (s: Sector) => boolean = () => true) {
  const options = spreadTargets(c).filter(only);
  const total = options.reduce((n, s) => n + weight(s), 0);
  let x = rand() * total;
  for (const s of options) {
    x -= weight(s);
    if (x < 0) return s;
  }
  return options[options.length - 1];
}

/** The Void Echoes take the sector; the log entry remembers the old owner so deleting it puts the sector back. */
export function spreadInto(c: Campaign, sectorId: string, date = localDate()): CampaignEvent | null {
  const s = c.sectors.find((x) => x.id === sectorId);
  if (!s || s.owner === ECHOES.id || isStronghold(s)) return null;
  const e: CampaignEvent = {
    id: uid(), date, sectorId: s.id, attacker: ECHOES.id, defender: s.owner ?? '', winner: ECHOES.id, notes: '',
    spread: true, round: currentRound(c), undo: {},
  };
  changeHands(s, ECHOES.id, e.undo!);
  c.log.push(e);
  return e;
}

// ---- Echo marks ----
// When a round begins the Echoes' targets for its end are marked on the map (placeEchoMarks, rounds.ts). A mark falls
// when the round ends unless the line is held: a detachment of the sector's faction stands there, or a faction that won
// a Battle against the Echoes this round broke it. Values live in ECHO_MARKS (nexusData.ts).

/** This round's marks (none until they're placed). */
export const echoMarks = (c: Campaign): EchoMark[] => (c.echoMarks?.round === currentRound(c) ? c.echoMarks.marks : []);

export const markOn = (c: Campaign, sectorId: string) => echoMarks(c).find((m) => m.sectorId === sectorId);

/**
 * The factions with a detachment standing in the sector to hold it: its own (anyone's, when nobody holds it). With the
 * forces, a position only counts while the force still exists and fights for that faction.
 */
export function holders(c: Campaign, s: Sector, forces?: Force[]): string[] {
  const out = new Set<string>();
  for (const [id, p] of Object.entries(c.positions ?? {})) {
    if (p.sectorId !== s.id || (s.owner && p.factionId !== s.owner)) continue;
    if (forces && !forces.some((f) => f.id === id && f.nexus?.factionId === p.factionId)) continue;
    out.add(p.factionId);
  }
  return [...out];
}

/** Battles (not skirmishes or the Crisis) a faction won against the Echoes in a round. */
export const battlesWonVsEchoes = (c: Campaign, factionId: string, round = currentRound(c)) =>
  c.log.filter((e) => !e.spread && !e.skirmish && !e.crisis && !e.marauder && (e.round ?? 1) === round && e.winner === factionId
    && (e.attacker === ECHOES.id || e.defender === ECHOES.id)).length;

/** Marks the faction may still break this round. */
export const breaksLeft = (c: Campaign, factionId: string) =>
  Math.max(0, battlesWonVsEchoes(c, factionId) * ECHO_MARKS.breaksPerWin - echoMarks(c).filter((m) => m.brokenBy === factionId).length);

/** Break a mark for a faction that won a Battle against the Echoes. False when it can't. */
export function breakMark(c: Campaign, sectorId: string, factionId: string): boolean {
  const m = markOn(c, sectorId);
  if (!m || m.brokenBy || breaksLeft(c, factionId) < 1) return false;
  m.brokenBy = factionId;
  return true;
}

/** Put a broken mark back (broken by mistake). */
export function restoreMark(c: Campaign, sectorId: string) {
  const m = markOn(c, sectorId);
  if (m) delete m.brokenBy;
}

export type MarkResult = 'fell' | 'held' | 'broken' | 'cutOff' | 'warded';

export interface MarkEnd {
  sector: Sector;
  result: MarkResult;
  /** Who held the line or broke the mark. */
  by: string[];
  /** Who held the sector when the round ended. */
  owner?: string;
  /** Broken at the round's end with a Battle win its faction hadn't spent. */
  auto?: boolean;
}

/**
 * The round ends: each of its marks falls to the Echoes or is held. A faction's unspent breaks go to its own marked
 * sectors no detachment holds. A mark the Echoes no longer border (cut off) or an Echo Ward covers fades.
 */
export function resolveMarks(c: Campaign, marks: EchoMark[], date = localDate(), forces?: Force[]): MarkEnd[] {
  const out: MarkEnd[] = [];
  const auto = new Set<EchoMark>();
  for (const f of c.factions) {
    let left = breaksLeft(c, f.id);
    for (const m of marks) {
      const s = c.sectors.find((x) => x.id === m.sectorId);
      if (left < 1 || !s || m.brokenBy || s.owner !== f.id || holders(c, s, forces).length) continue;
      m.brokenBy = f.id;
      auto.add(m);
      left--;
    }
  }
  for (const m of marks) {
    const s = c.sectors.find((x) => x.id === m.sectorId);
    if (!s || s.owner === ECHOES.id || isStronghold(s)) continue;
    const owner = s.owner;
    const held = holders(c, s, forces);
    const result: MarkResult = m.brokenBy ? 'broken' : held.length ? 'held'
      : !spreadTargets(c).some((x) => x.id === s.id) || stormed(c, s.id) ? 'cutOff' : warded(c, s) ? 'warded' : 'fell';
    if (result === 'fell' && !spreadInto(c, s.id, date)) continue;
    out.push({ sector: s, result, by: m.brokenBy ? [m.brokenBy] : held, ...(owner ? { owner } : {}), ...(auto.has(m) ? { auto: true } : {}) });
  }
  return out;
}
