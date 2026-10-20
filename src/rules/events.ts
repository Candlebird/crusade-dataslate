import type { Campaign, Sector } from '../model/types';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import { ECHOES, ECHO_LORDS, GALACTIC_EVENTS, NEXUS_CRISIS, activeCrisis, currentRound, eventById, isStronghold, lordById } from './nexus';
import { spreadInto } from './voidspawn';

// Galactic Events and the Nexus Crisis (values in nexusData.ts).
//  - When the GM ends a round, a Galactic Event is rolled for the next one. The GM can re-roll it or pick another.
//  - Every NEXUS_CRISIS.everyRounds rounds an Echo Lord rises in an Echo-held sector. Every faction fights it together in
//    one battle against the AI before the round ends; how that went is settled when the round ends (endRound, rounds.ts).

const pick = <T>(list: T[], rand: Rand) => list[Math.floor(rand() * list.length)];

/** Set a round's Galactic Event (the current round by default). A Warp Storm picks the sectors it cuts off. */
export function setEvent(c: Campaign, id: string, rand: Rand = Math.random, round = currentRound(c)) {
  const e = eventById(id);
  if (!e) return;
  c.event = { id, round };
  if (e.storm) {
    const open = c.sectors.filter((s) => isPlaced(s) && !isStronghold(s));
    const ids: string[] = [];
    for (let i = 0; i < e.storm && open.length; i++) ids.push(open.splice(Math.floor(rand() * open.length), 1)[0].id);
    c.event.sectorIds = ids;
  }
}

/** Roll (D12) a round's Galactic Event. */
export function rollEvent(c: Campaign, rand: Rand = Math.random, round = currentRound(c)) {
  setEvent(c, pick(GALACTIC_EVENTS, rand).id, rand, round);
}

/** Does a Nexus Crisis begin in this round? */
export const crisisRound = (round: number) => round > 0 && round % NEXUS_CRISIS.everyRounds === 0;

/** Raise an Echo Lord in a random Echo-held sector (the Voidspawn counts) for the round. False when the Echoes hold none. */
export function placeCrisis(c: Campaign, rand: Rand = Math.random, round = currentRound(c)): boolean {
  const held = c.sectors.filter((s) => isPlaced(s) && (s.owner === ECHOES.id || s.type === 'voidspawn'));
  if (!held.length) return false;
  c.crisis = { round, lord: pick(ECHO_LORDS, rand).id, sectorId: pick(held, rand).id };
  return true;
}

export interface CrisisEnd {
  lord: string;
  sectorName: string;
  result: 'won' | 'lost';
  /** Lost, or never fought: the sectors the Echoes took. */
  lost: Sector[];
}

/** Each faction's sector nearest the Crisis (not its home or a stronghold). */
export function crisisForfeits(c: Campaign): Sector[] {
  const at = c.sectors.find((s) => s.id === c.crisis?.sectorId);
  if (!at || !isPlaced(at)) return [];
  const out: Sector[] = [];
  for (const f of c.factions) {
    const near = c.sectors
      .filter((s) => s.owner === f.id && isPlaced(s) && !isStronghold(s))
      .sort((a, b) => hexDistance(at as Hex, a as Hex) - hexDistance(at as Hex, b as Hex) || a.name.localeCompare(b.name))[0];
    if (near) out.push(near);
  }
  return out;
}

/**
 * Settle this round's Crisis as the round ends: unless it was won, the Echoes take each faction's sector nearest the
 * Lord. Undefined when there is no Crisis this round. (The threat change is endRound's.)
 */
export function settleCrisis(c: Campaign, date: string): CrisisEnd | undefined {
  const crisis = activeCrisis(c);
  if (!crisis) return undefined;
  const result = crisis.result === 'won' ? 'won' : 'lost';
  crisis.result = result;
  const lost = result === 'won' ? [] : crisisForfeits(c).filter((s) => spreadInto(c, s.id, date));
  return { lord: lordById(crisis.lord)?.name ?? crisis.lord, sectorName: c.sectors.find((s) => s.id === crisis.sectorId)?.name ?? '?', result, lost };
}
