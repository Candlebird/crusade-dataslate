import { unitFromCatalog } from '../model/factory';
import type { Campaign, CatalogBook, Force, HeroOffer, Unit } from '../model/types';
import { LEVEL_THRESHOLDS, type RelicTier } from './data';
import { factionForces, supplyLimit } from './detachments';
import { pick, randomLoadout } from './echoForce';
import { hasRule, relicHolders, relicTierAllowed } from './engine';
import type { Rand } from './hexmap';
import { currentRound } from './nexus';
import { HERO_OFFERS } from './nexusData';
import { randomRelic } from './relicPick';

// Hero offers (Nexus Wars). When a round ends, each faction without an open offer may be offered a wandering hero: a
// random Hero datasheet from the army books its forces are built from, at a random level, sometimes with a relic. The
// offer stands for the round it turns up and the next (HERO_OFFERS.lasts), and costs Umbra Shards to take. A hired hero
// joins one of the faction's forces for good, so it needs room under that force's Supply Limit.

/** The Hero datasheets a faction can be offered: from the books its forces' units come from. */
export function heroPool(books: CatalogBook[], forces: Force[], factionId: string) {
  const uids = new Set(factionForces(forces, factionId).flatMap((f) => f.units.map((u) => u.bookUid).filter(Boolean)));
  return books.filter((b) => uids.has(b.uid)).flatMap((book) => book.units.filter((cu) => hasRule(cu.rules, 'Hero')).map((cu) => ({ book, cu })));
}

function weighted(rand: Rand, weights: number[]) {
  let roll = rand() * weights.reduce((n, w) => n + w, 0);
  for (let i = 0; i < weights.length; i++) if ((roll -= weights[i]) < 0) return i;
  return weights.length - 1;
}

/** Umbra Shards to hire a hero of this level with a relic of this tier (if any). */
export const heroFee = (level: number, relic?: RelicTier) =>
  HERO_OFFERS.fee.base + HERO_OFFERS.fee.perLevel * level + (relic ? HERO_OFFERS.fee.relic[relic] : 0);

/** Roll a hero for a faction, or nothing when its forces' books have no heroes. */
export function rollHero(
  books: CatalogBook[], forces: Force[], factionId: string, taken: Set<string>, rand: Rand, newId: () => string,
): { unit: Unit; fee: number } | undefined {
  const pool = heroPool(books, forces, factionId);
  if (!pool.length) return undefined;
  const { book, cu } = pick(rand, pool);
  const unit = unitFromCatalog(cu, randomLoadout(cu, rand), book);
  const level = weighted(rand, HERO_OFFERS.levelWeights);
  unit.xp = level ? LEVEL_THRESHOLDS[level - 1] : 0;
  let tier: RelicTier | undefined;
  if (rand() < HERO_OFFERS.relicChance) {
    const tiers = (['Legendary', 'Rare', 'Common'] as RelicTier[]).filter((t) => relicTierAllowed(t, unit.xp));
    const relic = randomRelic(unit, pick(rand, tiers), taken, rand, newId());
    if (relic) {
      unit.relics.push(relic);
      taken.add(relic.name);
      tier = relic.tier;
    }
  }
  unit.notes = 'A wandering hero, hired for Umbra Shards.';
  return { unit, fee: heroFee(level, tier) };
}

/** Relic names nobody can be offered: carried by a unit, on another hero offer, or by a guardian. */
export function takenRelics(c: Campaign, forces: Force[]): Set<string> {
  return new Set([
    ...relicHolders(forces).keys(),
    ...(c.offers ?? []).flatMap((o) => o.unit.relics.map((r) => r.name)),
    ...c.sectors.flatMap((s) => s.guardian?.unit.relics.map((r) => r.name) ?? []),
  ]);
}

/** The round an offer leaves at the end of. */
export const offerEnds = (o: HeroOffer) => o.round + HERO_OFFERS.lasts - 1;

/** A faction's offers still standing this round. */
export const openOffers = (c: Campaign, factionId: string) =>
  (c.offers ?? []).filter((o) => o.factionId === factionId && offerEnds(o) >= currentRound(c));

/**
 * Round end (call it once the new round has started): offers past their time leave, and each faction without one may
 * get a new hero. Returns the new offers and the ones that left.
 */
export function rollOffers(
  c: Campaign, books: CatalogBook[], forces: Force[], rand: Rand, newId: () => string,
): { fresh: HeroOffer[]; gone: HeroOffer[] } {
  const round = currentRound(c);
  const gone = (c.offers ?? []).filter((o) => offerEnds(o) < round);
  const offers = (c.offers ?? []).filter((o) => offerEnds(o) >= round);
  const taken = takenRelics(c, forces);
  const fresh: HeroOffer[] = [];
  for (const f of c.factions) {
    if (offers.some((o) => o.factionId === f.id) || rand() >= HERO_OFFERS.chance) continue;
    const hero = rollHero(books, forces, f.id, taken, rand, newId);
    if (hero) fresh.push({ id: newId(), factionId: f.id, round, ...hero });
  }
  c.offers = [...offers, ...fresh];
  if (!c.offers.length) delete c.offers;
  return { fresh, gone };
}

/** Why this force can't hire the hero, if it can't: the offer has to be its faction's and still open, and the force needs the shards and the Supply room. */
export function hireBlock(c: Campaign, o: HeroOffer, f: Force): string | undefined {
  if (f.nexus?.factionId !== o.factionId) return 'The hero is offering to another faction';
  if (offerEnds(o) < currentRound(c)) return 'The hero has moved on';
  if (f.umbraShards < o.fee) return `Needs ${o.fee} Umbra Shards`;
  const used = f.units.filter((u) => u.status !== 'removed').reduce((n, u) => n + u.points, 0);
  if (used + o.unit.points > supplyLimit(f)) return `Needs ${o.unit.points} Supply free (${Math.max(0, supplyLimit(f) - used)} left)`;
  return undefined;
}

/** Hire the hero into the force: it pays the fee, the hero joins (with fresh ids) and the offer is gone. Returns the unit, or nothing when it can't. */
export function hireHero(c: Campaign, offerId: string, f: Force, date: string, newId: () => string): Unit | undefined {
  const o = c.offers?.find((x) => x.id === offerId);
  if (!o || hireBlock(c, o, f)) return undefined;
  const unit: Unit = { ...structuredClone(o.unit), id: newId(), relics: o.unit.relics.map((r) => ({ ...r, id: newId() })) };
  f.units.push(unit);
  f.umbraShards -= o.fee;
  f.ledger.push({ id: newId(), date, label: `Hired ${unit.unitType}, a wandering hero`, rp: 0, supply: 0, us: -o.fee });
  c.offers = c.offers!.filter((x) => x.id !== offerId);
  return unit;
}
