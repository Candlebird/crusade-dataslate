import { uid } from '../model/factory';
import type { Campaign, CampaignEvent, Sector } from '../model/types';
import { frontier, isPlaced, type Rand } from './hexmap';
import { ECHOES, ECHOES_SKIP, changeHands, currentRound, isStronghold } from './nexus';
import { localDate } from '../model/date';

// The Void Echoes spread from their territory when a round ends (how far depends on their threat: rounds.ts).

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
