import type { Campaign, CatalogBook, Force, Sector, Settings } from '../model/types';
import { supplyLimit } from './detachments';
import { aiDefended, ratingFor } from './difficulty';
import { echoesBook } from './echoForce';
import { garrison } from './guardians';
import { STANDARD_MISSION } from './missions';
import { positionOf } from './movement';
import { ECHOES, OVERRUN } from './nexusData';
import type { Attack } from './orders';
import { FORMATS, atSector, loadForce, loadUnits, newBattle, type TrackedBattle } from './tracker';

// Overrun (Nexus Wars). Table time is scarce, so an attack doesn't always need it: a detachment that clearly
// outweighs an AI garrison may fight it out on the auto-battle instead. It can still lose. Set pieces stay at the
// table: guardians, the Voidspawn, home sectors and player-held sectors. Any attack that can't be played can still be
// settled on the auto-battle by the GM (the fallback), so one player's empty week doesn't stall the campaign.

/** The biggest AI garrison a detachment of this Supply Limit may overrun. */
export function overrunMax(supply: number): number {
  const { share, upper, knee, step } = OVERRUN;
  const reach = share * Math.min(supply, knee) + upper * Math.max(0, supply - knee);
  return Math.floor(reach / step + 1e-9) * step;
}

/** Why `force` can't overrun `s`, or '' when it can. */
export function overrunBlock(s: Sector, force: Force | undefined): string {
  if (!aiDefended(s)) return 'only AI-held sectors can be overrun';
  if (s.type === 'home' || s.type === 'voidspawn') return 'set pieces are fought at the table';
  if (s.guardian) return `${s.guardian.name} is fought at the table`;
  const rating = ratingFor(s, force?.nexus?.factionId);
  if (!force || rating === undefined) return 'the sector is not rated yet';
  const max = overrunMax(supplyLimit(force));
  return rating > max ? `its ${rating} Supply garrison is over the ${max} this detachment can overrun` : '';
}

/** The defender's detachment for an attack fought without the table: the one dug in, else one there, else any of theirs. */
function defenderForce(c: Campaign, a: Attack, forces: Force[]): Force | undefined {
  const theirs = forces.filter((f) => f.nexus?.factionId === a.defender);
  return theirs.find((f) => f.id === a.dugIn) ?? theirs.find((f) => positionOf(c, f)?.id === a.sectorId) ?? theirs[0];
}

/**
 * The attack, set up on the tracker for the auto-battle: the attacking detachment as team A. An AI-held sector fields
 * its garrison at the attacker's rating (led by its guardian, if any); a player-held one its defending detachment,
 * or the Echoes standing in when it has none.
 */
export function attackBattle(c: Campaign, a: Attack, forces: Force[], books: CatalogBook[], settings: Settings, rand = Math.random): TrackedBattle {
  const s = c.sectors.find((x) => x.id === a.sectorId)!;
  const defender = aiDefended(s) ? undefined : defenderForce(c, a, forces);
  const b = newBattle(STANDARD_MISSION, `auto-${a.sectorId}-${a.forceId ?? a.factionId}-${Date.now()}`, new Date().toISOString(), rand,
    FORMATS.find((x) => x.label === (defender ? '1 v 1' : '1 v AI')));
  atSector(b, c, forces, settings, a.sectorId, a.factionId, a.forceId);
  if (defender) loadForce(b.sides[1], defender, undefined, settings, c);
  else {
    const attacker = forces.find((f) => f.id === a.forceId);
    const target = ratingFor(s, a.factionId) ?? (attacker ? supplyLimit(attacker) : 1000);
    loadUnits(b.sides.find((x) => x.ai)!, ECHOES.name, garrison(s, echoesBook(books), target, rand));
  }
  return b;
}
