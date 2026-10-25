import { unitFromCatalog } from '../model/factory';
import type { Campaign, CatalogBook, Force, Sector, SectorGuardian, Unit } from '../model/types';
import type { RelicTier } from './data';
import { aiDefended, sectorThreat } from './difficulty';
import { echoesBook, pick, randomEchoes, randomLoadout } from './echoForce';
import { hasRule, ruleRating } from './engine';
import { takenRelics } from './heroes';
import type { Rand } from './hexmap';
import { GUARDIANS } from './nexusData';
import { randomRelic } from './relicPick';

// Guardian sites (Nexus Wars). AI-held planets, research stations, anomalies and void sectors are watched over by a
// guardian: a Void Echoes Hero with a relic and doubled Tough. Its tier (Common/Rare/Legendary) follows how deep in the
// map the sector sits, and is also the tier of the relic it carries. The guardian leads the sector's garrison, so it
// counts toward the sector's Supply difficulty. A Hero that slays it takes its relic on a 3+ (GUARDIANS.stealRoll).

/** The guardian's tier from the sector's threat (0–1). */
export const guardianTier = (threat: number): RelicTier =>
  threat >= GUARDIANS.legendary ? 'Legendary' : threat >= GUARDIANS.rare ? 'Rare' : 'Common';

/** Double the unit's Tough (a unit without Tough gets Tough(toughFactor)). */
export function empower(u: Unit) {
  const tough = ruleRating(u.rules, 'Tough');
  const next = (tough ?? 1) * GUARDIANS.toughFactor;
  u.rules = tough === null ? [...u.rules, `Tough(${next})`] : u.rules.map((r) => (ruleRating([r], 'Tough') === null ? r : `Tough(${next})`));
  u.tough = next;
}

/** Roll a guardian of a tier: a random Echoes Hero, empowered and carrying a relic of that tier (if one is left). */
export function rollGuardian(book: CatalogBook, tier: RelicTier, taken: Set<string>, rand: Rand, newId: () => string): SectorGuardian | undefined {
  const heroes = book.units.filter((cu) => hasRule(cu.rules, 'Hero'));
  if (!heroes.length) return undefined;
  const cu = pick(rand, heroes);
  const unit = unitFromCatalog(cu, randomLoadout(cu, rand), book);
  const name = `${pick(rand, GUARDIANS.names)} ${pick(rand, GUARDIANS.titles)}`;
  unit.name = name;
  unit.xp = GUARDIANS.xp[tier];
  empower(unit);
  const relic = randomRelic(unit, tier, taken, rand, newId());
  if (relic) {
    unit.relics.push(relic);
    taken.add(relic.name);
  }
  unit.notes = `Guardian of the sector: Tough doubled${relic ? `, carries ${relic.name}` : ''}.`;
  return { name, tier, unit };
}

/** Can this sector have a guardian? An AI-held sector of a guarded type. */
export const guardable = (s: Sector) => GUARDIANS.types.includes(s.type) && aiDefended(s);

/**
 * Roll for a guardian at each guardable sector that hasn't rolled yet (at round end, or when the GM asks): GUARDIANS.chance
 * of one, and a sector that misses stays unguarded for good. Returns the sectors that got one. Does nothing without the
 * Void Echoes book.
 */
export function placeGuardians(c: Campaign, books: CatalogBook[], forces: Force[], rand: Rand, newId: () => string): Sector[] {
  const book = echoesBook(books);
  if (!book) return [];
  const taken = takenRelics(c, forces);
  const out: Sector[] = [];
  for (const s of c.sectors) {
    if (s.guardian || s.unguarded || !guardable(s)) continue;
    if (rand() >= GUARDIANS.chance) {
      s.unguarded = true;
      continue;
    }
    const g = rollGuardian(book, guardianTier(sectorThreat(c, s)), taken, rand, newId);
    if (!g) continue;
    s.guardian = g;
    out.push(s);
  }
  return out;
}

/** Throw out every AI-held site's guardian (and its miss) and roll them all again. Returns the sectors that got one. */
export function rerollGuardians(c: Campaign, books: CatalogBook[], forces: Force[], rand: Rand, newId: () => string): Sector[] {
  if (!echoesBook(books)) return [];
  for (const s of c.sectors) {
    if (!guardable(s)) continue;
    delete s.guardian;
    delete s.unguarded;
  }
  return placeGuardians(c, books, forces, rand, newId);
}

/** The sector's AI garrison: its guardian (if any) leading random Echoes for the rest of the Supply. */
export function garrison(s: Sector, book: CatalogBook, target: number, rand: Rand = Math.random): Unit[] {
  if (!s.guardian) return randomEchoes(book, target, rand);
  const lead: Unit = structuredClone(s.guardian.unit);
  return [lead, ...randomEchoes(book, Math.max(0, target - lead.points), rand)];
}
