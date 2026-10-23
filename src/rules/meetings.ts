import type { Campaign, Force, MeetingCall, Settings } from '../model/types';
import { isPlaced } from './hexmap';
import { nearestHeld, positionOf, setPosition } from './movement';
import type { Move, Revealed } from './orders';
import { STANDARD_MISSION } from './missions';
import { FORMATS, loadForce, newBattle, type TrackedBattle } from './tracker';

// Meeting engagements (Nexus Wars): detachments of two factions whose moves through open ground run into each other.
// Each side picks Fight or Pass. Both pass and they pass by; either fights and they fight it out (at the table, or
// on the auto-battle): the winner takes the hex, the loser falls back to its faction's nearest sector.

export interface Meeting {
  /** Stable across reloads: the hex and both detachments. */
  key: string;
  /** Where they meet. */
  sectorId: string;
  /** The two detachments, each moving or standing there. */
  sides: [string, string];
  /** How they ran into each other. */
  how: 'same' | 'swap' | 'onto';
}

const keyOf = (sectorId: string, a: string, b: string) => `${sectorId}:${[a, b].sort().join(':')}`;

/** Every meeting the revealed moves make: two factions moving into the same hex, swapping hexes, or one moving onto the other. */
export function meetings(c: Campaign, revealed: Pick<Revealed, 'moves'>, forces: Force[]): Meeting[] {
  const out: Meeting[] = [];
  const add = (sectorId: string, a: string, b: string, how: Meeting['how']) => {
    const key = keyOf(sectorId, a, b);
    if (!out.some((m) => m.key === key || (m.sides.includes(a) && m.sides.includes(b)))) out.push({ key, sectorId, sides: [a, b], how });
  };
  const force = (id: string) => forces.find((f) => f.id === id);
  const start = (m: Move) => { const f = force(m.forceId); return f && positionOf(c, f)?.id; };
  const { moves } = revealed;
  moves.forEach((m, i) => {
    for (const o of moves.slice(i + 1)) {
      if (o.factionId === m.factionId) continue;
      if (o.sectorId === m.sectorId) add(m.sectorId, m.forceId, o.forceId, 'same');
      else if (o.sectorId === start(m) && m.sectorId === start(o)) add(m.sectorId, m.forceId, o.forceId, 'swap');
    }
    // Detachments that stay put (holding, attacking, or with no order) stand in the way.
    for (const f of forces) {
      if (!f.nexus || f.nexus.factionId === m.factionId || moves.some((x) => x.forceId === f.id)) continue;
      if (!c.factions.some((x) => x.id === f.nexus!.factionId)) continue;
      if (positionOf(c, f)?.id === m.sectorId) add(m.sectorId, m.forceId, f.id, 'onto');
    }
  });
  return out;
}

/** The orders round's meeting calls and results, if they're for this round. */
const record = (c: Campaign, round: number) => (c.meetings?.round === round ? c.meetings : undefined);

/** Where a meeting stands: open (a side hasn't picked), passed (both passed), fight (someone fights, no result yet), or settled. */
export function meetingState(c: Campaign, m: Meeting, round: number): 'open' | 'passed' | 'fight' | 'settled' {
  const r = record(c, round);
  if (r?.results[m.key] !== undefined) return 'settled';
  const calls = r?.calls[m.key] ?? {};
  if (m.sides.some((s) => calls[s] === 'fight')) return 'fight';
  return m.sides.every((s) => calls[s] === 'pass') ? 'passed' : 'open';
}

/** A side picks Fight or Pass (picking again changes it, until there's a result). */
export function callMeeting(c: Campaign, round: number, key: string, forceId: string, call: MeetingCall) {
  if (c.meetings?.round !== round) c.meetings = { round, calls: {}, results: {} };
  (c.meetings.calls[key] ??= {})[forceId] = call;
}

/** The fight's result: the winning detachment, or '' for a draw. */
export function settleMeeting(c: Campaign, round: number, key: string, winner: string) {
  if (c.meetings?.round !== round) c.meetings = { round, calls: {}, results: {} };
  c.meetings.results[key] = winner;
}

/** Take a result back, to fight again. */
export function unsettleMeeting(c: Campaign, round: number, key: string) {
  if (c.meetings?.round === round) delete c.meetings.results[key];
}

/**
 * What the meetings do to each detachment: 'back' (lost, falls back to its faction's nearest sector) or 'stay'
 * (a draw: a mover stays where it was). Winners and those that passed by move as ordered.
 */
export function meetingOutcomes(c: Campaign, ms: Meeting[], round: number): Map<string, { to: 'back' | 'stay'; from: string }> {
  const out = new Map<string, { to: 'back' | 'stay'; from: string }>();
  const r = record(c, round);
  for (const m of ms) {
    const winner = r?.results[m.key];
    if (winner === undefined) continue;
    for (const s of m.sides) {
      if (winner === s) continue;
      const to = winner === '' ? 'stay' : 'back';
      if (out.get(s)?.to !== 'back') out.set(s, { to, from: m.sectorId });
    }
  }
  return out;
}

/** Send a beaten detachment back to its faction's nearest sector. Returns false when it has nowhere to go. */
export function fallBack(c: Campaign, force: Force, from: string): boolean {
  const hex = c.sectors.find((s) => s.id === from);
  const to = force.nexus && nearestHeld(c, force.nexus.factionId, hex && isPlaced(hex) ? hex : undefined);
  if (!force.nexus || !to) return false;
  setPosition(c, force.id, { sectorId: to.id, factionId: force.nexus.factionId });
  return true;
}

/** The fight for the auto-battle: the first side's detachment as team A, the other as team B. */
export function meetingBattle(c: Campaign, m: Meeting, forces: Force[], settings: Settings, rand = Math.random): TrackedBattle {
  const b = newBattle(STANDARD_MISSION, `meet-${m.key}`, '', rand, FORMATS.find((x) => x.label === '1 v 1'));
  m.sides.forEach((id, i) => {
    const f = forces.find((x) => x.id === id);
    if (f) loadForce(b.sides[i], f, undefined, settings, c);
  });
  return b;
}
