import { uid } from '../model/factory';
import type { Campaign, CampaignEvent } from '../model/types';
import { frontier, isPlaced, type Rand } from './hexmap';
import { ECHOES, ECHOES_SKIP, isStronghold } from './nexus';

// The Void Echoes spread one sector from their territory each round, picked at random.

/** Sectors the Void Echoes could spread into: next to their territory, never empty space or a stronghold. */
export function spreadTargets(c: Campaign) {
  const front = frontier(c, ECHOES.id);
  return c.sectors.filter((s) => isPlaced(s) && front.has(s.id) && !ECHOES_SKIP.includes(s.type) && !isStronghold(s));
}

/** A random sector for the Void Echoes to spread into, if there is one. */
export function pickSpread(c: Campaign, rand: Rand = Math.random) {
  const options = spreadTargets(c);
  return options.length ? options[Math.floor(rand() * options.length)] : undefined;
}

/** The Void Echoes take the sector; the log entry remembers the old owner so deleting it puts the sector back. */
export function spreadInto(c: Campaign, sectorId: string, date = new Date().toISOString().slice(0, 10)): CampaignEvent | null {
  const s = c.sectors.find((x) => x.id === sectorId);
  if (!s || s.owner === ECHOES.id || isStronghold(s)) return null;
  const e: CampaignEvent = {
    id: uid(), date, sectorId: s.id, attacker: ECHOES.id, defender: s.owner ?? '', winner: ECHOES.id, notes: '',
    spread: true, undo: { owner: s.owner ?? '' },
  };
  s.owner = ECHOES.id;
  c.log.push(e);
  return e;
}
