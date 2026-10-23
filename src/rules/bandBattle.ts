import type { Campaign, CatalogBook, Force, Marauder, Settings } from '../model/types';
import { positionOf } from './movement';
import { STANDARD_MISSION } from './missions';
import { MARAUDERS } from './nexusData';
import { raidBand, raiderPool } from './raiders';
import { FORMATS, loadForce, loadUnits, newBattle, type TrackedBattle } from './tracker';

// A band that was barred turns on whoever barred it: the fight, set up for the auto-battle. The faction's detachment
// that stood in the band's way (or any of its detachments) against squads from the other armies, to the band's Supply.

/** The faction's detachment that barred the band, or any of its detachments. */
export function bandBlocker(c: Campaign, m: Marauder, factionId: string, forces: Force[]): Force | undefined {
  const mine = forces.filter((f) => f.nexus?.factionId === factionId);
  return mine.find((f) => positionOf(c, f)?.id === m.barred?.sectorId) ?? mine[0];
}

/** A battle (team A the faction, team B the band) for the auto-battle. */
export function bandBattle(c: Campaign, m: Marauder, factionId: string, forces: Force[], books: CatalogBook[], settings: Settings, rand = Math.random): TrackedBattle {
  const b = newBattle(STANDARD_MISSION, `band-${m.id}`, '', rand, FORMATS.find((x) => x.label === '1 v AI'));
  const me = b.sides.find((x) => !x.ai)!;
  const f = bandBlocker(c, m, factionId, forces);
  if (f) loadForce(me, f, undefined, settings, c);
  const band = b.sides.find((x) => x.ai)!;
  loadUnits(band, m.name, raidBand(raiderPool(books, forces, f), m.strength, MARAUDERS.squads, rand).map((x) => x.unit));
  return b;
}
