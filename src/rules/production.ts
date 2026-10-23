import type { Campaign, CampaignEvent, Force, Sector, Unit } from '../model/types';
import { hexDistance, isPlaced } from './hexmap';
import { BUILDINGS, PRODUCTION, WARLORDS, type Building } from './nexusData';
import { knows } from './tech';
import { hasPerk } from './warlords';

// Planet production (Nexus Wars). New units for a Nexus force aren't bought, they're built: every planet and home a
// faction holds banks Materials each round (PRODUCTION.perRound, or more with Barracks, up to bankRounds rounds'
// worth), and a new unit is produced at one of them, paid from its bank. Banks are lost when a sector changes hands;
// buildings stay for the new owner. Buildings are paid from the bank too (the strong ones also cost Umbra Shards); a
// sector builds one at a time, finished when the round ends, and only buildings its owner has researched
// (rules/tech.ts). Values live in nexusData.ts. Materials are saved as `bank` and `construction.supply`.

export const buildingById = (id: string) => BUILDINGS.find((b) => b.id === id);
export const hasBuilding = (s: Sector, id: string) => !!s.buildings?.includes(id);

/** Reinforced for its defender: by a Reinforce order (lost when it changes hands) or by Walls (permanent). */
export const isReinforced = (s: Sector) => !!s.reinforced || hasBuilding(s, 'walls');

export const produces = (s: Sector) => (PRODUCTION.slots[s.type] ?? 0) > 0;
/** Building slots a sector has (0 for sectors that don't produce): a Building Expansion adds one. */
export const buildingSlots = (s: Sector, c?: Campaign) => (produces(s)
  ? (PRODUCTION.slots[s.type] ?? 0) + (s.core ? PRODUCTION.coreSlots : 0) + (s.type === 'home' && hasPerk(c, s.owner, 'homeSlot') ? WARLORDS.homeSlots : 0)
  : 0);

/** A Trade Hub's Materials a round: for each other producing sector its owner holds nearby. */
export function tradeBonus(s: Sector, c?: Campaign): number {
  if (!c || !s.owner || !hasBuilding(s, 'tradeHub') || !isPlaced(s)) return 0;
  const T = PRODUCTION.tradeHub;
  const near = c.sectors.filter((x) => x.id !== s.id && x.owner === s.owner && produces(x) && isPlaced(x) && hexDistance(s, x) <= T.range).length;
  return Math.min(T.max, near * T.perPlanet);
}

/** Materials the sector banks each round (pass the campaign to count a Trade Hub). */
export const productionRate = (s: Sector, c?: Campaign) => (hasBuilding(s, 'barracks') ? PRODUCTION.barracks : PRODUCTION.perRound) + tradeBonus(s, c);
/** The most Materials the bank holds. */
export const bankCap = (s: Sector, c?: Campaign) =>
  productionRate(s, c) * (PRODUCTION.bankRounds + (hasBuilding(s, 'logistics') ? PRODUCTION.logisticsRounds : 0));

/** How many of the building the faction's sectors have. */
export const buildingsHeld = (c: Campaign, factionId: string, id: string) => c.sectors.filter((s) => s.owner === factionId && hasBuilding(s, id)).length;

/** Within an Echo Ward's reach (its sector or one next to it): the Echoes can't spread here. */
export const warded = (c: Campaign, s: Sector) =>
  isPlaced(s) && c.sectors.some((w) => w.owner && hasBuilding(w, 'echoWard') && isPlaced(w) && hexDistance(w, s) <= 1);

/** The sectors a faction can produce units at. */
export const productionSites = (c: Campaign, factionId: string) => c.sectors.filter((s) => s.owner === factionId && produces(s));

/** Take up to `n` banked Materials from the faction, largest banks first. Returns how many it had to give. */
export function withdrawBanked(c: Campaign, factionId: string, n: number): number {
  let left = n;
  for (const s of c.sectors.filter((x) => x.owner === factionId && x.bank).sort((a, b) => (b.bank ?? 0) - (a.bank ?? 0))) {
    const k = Math.min(left, s.bank ?? 0);
    s.bank = (s.bank ?? 0) - k;
    if (!s.bank) delete s.bank;
    left -= k;
  }
  return n - left;
}

/** Bank up to `n` Materials at the faction's producing sectors with room, home first. Returns how many fit. */
export function depositBanked(c: Campaign, factionId: string, n: number): number {
  let left = n;
  const sites = productionSites(c, factionId).sort((a, b) => Number(b.type === 'home') - Number(a.type === 'home'));
  for (const s of sites) {
    const k = Math.min(left, Math.max(0, bankCap(s, c) - (s.bank ?? 0)));
    if (k) s.bank = (s.bank ?? 0) + k;
    left -= k;
  }
  return n - left;
}

/** Round end: every held producing sector banks its production. Returns what each sector gained. */
export function accrueProduction(c: Campaign): { sector: Sector; gained: number }[] {
  const out: { sector: Sector; gained: number }[] = [];
  for (const s of c.sectors) {
    if (!produces(s) || !s.owner || !c.factions.some((f) => f.id === s.owner)) continue;
    // Marauders raided it: nothing this round.
    if (s.raided !== undefined) {
      const raided = s.raided === (c.round ?? 1);
      delete s.raided;
      if (raided) continue;
    }
    const before = s.bank ?? 0;
    s.bank = Math.max(before, Math.min(bankCap(s, c), before + productionRate(s, c)));
    if (s.bank > before) out.push({ sector: s, gained: s.bank - before });
  }
  return out;
}

/** Slots not built on or under construction. */
export const freeSlots = (s: Sector, c?: Campaign) => buildingSlots(s, c) - (s.buildings?.length ?? 0) - (s.construction ? 1 : 0);

/** The Materials a building costs at this sector: less for an Architect Warlord's faction. */
export const buildCost = (b: Pick<Building, 'cost'>, s: Sector, c?: Campaign) =>
  hasPerk(c, s.owner, 'cheapBuild') ? Math.round(b.cost * (1 - WARLORDS.buildDiscount)) : b.cost;

/**
 * Why the building can't be started here, if it can't. `payer` is the force paying its Umbra Shards; pass the campaign
 * to check that the sector's owner has researched it.
 */
export function buildBlock(s: Sector, id: string, payer?: Force, c?: Campaign): string | undefined {
  const b = buildingById(id);
  if (!b) return 'Unknown building';
  if (!produces(s)) return 'Only planets and home sectors have buildings';
  if (hasBuilding(s, id)) return 'Already built';
  if (b.homeOnly && s.type !== 'home') return 'Only a home sector can build it';
  if (c && !knows(c.factions.find((f) => f.id === s.owner), b)) return 'Not researched yet (see the tech tree)';
  if (s.construction) return `${buildingById(s.construction.id)?.name ?? 'A building'} is already going up here: one at a time`;
  if (freeSlots(s, c) <= 0) return `No free slot (${buildingSlots(s, c)})`;
  if ((s.bank ?? 0) < buildCost(b, s, c)) return `Needs ${buildCost(b, s, c)} Materials (${s.bank ?? 0} banked here)`;
  if (b.shards && (payer?.umbraShards ?? 0) < b.shards) return `Needs ${b.shards} Umbra Shard${b.shards === 1 ? '' : 's'}${payer ? ` (${payer.name} has ${payer.umbraShards})` : ' from one of your forces (none loaded here)'}`;
  return undefined;
}

/** Start a building: its Materials come from the bank, its Umbra Shards from `payer`. It's finished when the round ends. False when it can't be started. */
export function build(c: Campaign, s: Sector, id: string, payer?: Force, date = '', newId: () => string = () => ''): boolean {
  if (buildBlock(s, id, payer, c)) return false;
  const b = buildingById(id)!;
  const cost = buildCost(b, s, c);
  s.bank = (s.bank ?? 0) - cost;
  s.construction = { id, round: c.round ?? 1, supply: cost, shards: b.shards };
  if (b.shards && payer) {
    payer.umbraShards -= b.shards;
    payer.ledger.push({ id: newId(), date, label: `Nexus — ${b.name} at ${s.name}`, rp: 0, supply: 0, us: -b.shards });
    s.construction.forceId = payer.id;
  }
  return true;
}

/** Stop the building going up: everything paid for it comes back (Materials to the bank, shards to the force that paid). */
export function cancelBuilding(s: Sector, forces: Force[], date = '', newId: () => string = () => ''): void {
  const k = s.construction;
  if (!k) return;
  s.bank = (s.bank ?? 0) + k.supply;
  const payer = forces.find((f) => f.id === k.forceId);
  if (payer && k.shards) {
    payer.umbraShards += k.shards;
    payer.ledger.push({ id: newId(), date, label: `Nexus — ${buildingById(k.id)?.name ?? k.id} at ${s.name} cancelled`, rp: 0, supply: 0, us: k.shards });
  }
  delete s.construction;
}

/** Round end: every building going up at a held sector is finished. Returns the sectors and what was built. */
export function finishConstruction(c: Campaign): { sector: Sector; building: string }[] {
  const out: { sector: Sector; building: string }[] = [];
  for (const s of c.sectors) {
    const k = s.construction;
    if (!k || !s.owner || !c.factions.some((f) => f.id === s.owner)) continue;
    if (!hasBuilding(s, k.id)) s.buildings = [...(s.buildings ?? []), k.id];
    delete s.construction;
    out.push({ sector: s, building: k.id });
  }
  return out;
}

/** Tear a building down (no refund): to free its slot. */
export function demolish(s: Sector, id: string) {
  s.buildings = (s.buildings ?? []).filter((b) => b !== id);
  if (!s.buildings.length) delete s.buildings;
}

/** The share of a unit's points a Foundry and a Vehicle Bay here take off. */
export function produceDiscount(s: Sector, u: Pick<Unit, 'tough'>): number {
  const V = PRODUCTION.vehicleBay;
  return (hasBuilding(s, 'foundry') ? PRODUCTION.foundryDiscount : 0) + (hasBuilding(s, 'vehicleBay') && u.tough >= V.tough ? V.discount : 0);
}
/** Materials one unit costs to produce here. */
export const unitCost = (s: Sector, u: Pick<Unit, 'points' | 'tough'>) => Math.round(u.points * (1 - produceDiscount(s, u)));
/** Materials the units cost to produce here. */
export const produceCost = (s: Sector, units: Pick<Unit, 'points' | 'tough'>[]) => units.reduce((n, u) => n + unitCost(s, u), 0);

/**
 * Produce units at a sector: pay their Materials from its bank. Training Grounds give them their starting XP, an
 * Armoury a free weapon upgrade (noted on the unit), a War Academy a trait token for `force`, a Warmaster Warlord more
 * XP (pass the campaign). False when the bank is short.
 */
export function produce(s: Sector, units: Unit[], force?: Force, c?: Campaign): boolean {
  const cost = produceCost(s, units);
  if (cost > (s.bank ?? 0)) return false;
  s.bank = (s.bank ?? 0) - cost;
  const xp = (hasBuilding(s, 'training') ? PRODUCTION.trainingXp : 0)
    + (hasPerk(c, s.owner, 'drilled') ? WARLORDS.drilledXp : 0) + (hasPerk(c, s.owner, 'veterans') ? WARLORDS.veteransXp : 0);
  const perks = [hasBuilding(s, 'armoury') && 'a free weapon upgrade (Armoury)', hasBuilding(s, 'academy') && 'a free trait token (War Academy)'].filter(Boolean);
  for (const u of units) {
    u.xp = Math.max(u.xp, xp);
    u.notes = [u.notes, `Produced at ${s.name}${perks.length ? `, with ${perks.join(' and ')}` : ''}.`].filter(Boolean).join(' ');
  }
  if (hasBuilding(s, 'academy') && force?.nexus) force.nexus.traitTokens += units.length;
  return true;
}

/** Grand Exchange trades (once a round, at a home with one). */
export type ExchangeTrade = 'buyShard' | 'sellShard';

export function exchangeBlock(c: Campaign, s: Sector, trade: ExchangeTrade, f?: Force): string | undefined {
  const X = PRODUCTION.exchange;
  if (!hasBuilding(s, 'exchange')) return 'No Grand Exchange here';
  if (s.exchanged === (c.round ?? 1)) return 'Already traded this round';
  if (!f) return 'Needs one of your forces to hold the shards';
  if (trade === 'buyShard' && (s.bank ?? 0) < X.materials) return `Needs ${X.materials} Materials (${s.bank ?? 0} banked)`;
  if (trade === 'sellShard' && f.umbraShards < X.shards) return `${f.name} needs ${X.shards} Umbra Shards`;
  return undefined;
}

/** Trade at the Grand Exchange: Materials for a shard into `f`, or a shard from `f` for Materials (up to the bank's cap). */
export function exchange(c: Campaign, s: Sector, trade: ExchangeTrade, f: Force, date = '', newId: () => string = () => ''): boolean {
  if (exchangeBlock(c, s, trade, f)) return false;
  const X = PRODUCTION.exchange;
  const buy = trade === 'buyShard';
  s.bank = buy ? (s.bank ?? 0) - X.materials : Math.max(s.bank ?? 0, Math.min(bankCap(s, c), (s.bank ?? 0) + X.back));
  f.umbraShards += buy ? X.shards : -X.shards;
  f.ledger.push({ id: newId(), date, label: `Nexus — Grand Exchange at ${s.name}`, rp: 0, supply: 0, us: buy ? X.shards : -X.shards });
  s.exchanged = c.round ?? 1;
  return true;
}

/** Why the faction can't install a Building Expansion here, if it can't. */
export function coreBlock(c: Campaign, s: Sector): string | undefined {
  const f = c.factions.find((x) => x.id === s.owner);
  if (!f) return 'Only a faction can install one';
  if (!(f.cores ?? 0)) return 'No Building Expansion to install (Guardian loot)';
  if (s.type !== 'planet') return 'Only planets take a Building Expansion';
  if (s.core) return 'This planet already has one';
  return undefined;
}

/** Install one of the owner's Building Expansions on the planet: one more building slot, for good. */
export function installCore(c: Campaign, s: Sector): boolean {
  if (coreBlock(c, s)) return false;
  const f = c.factions.find((x) => x.id === s.owner)!;
  f.cores = (f.cores ?? 0) - 1;
  if (!f.cores) delete f.cores;
  s.core = true;
  return true;
}

/** A captured sector's bank, and any building going up, is lost (noted in `undo`, so deleting the game gives them back). */
export function loseBank(s: Sector, undo: NonNullable<CampaignEvent['undo']>) {
  if (s.bank) undo.bank = s.bank;
  delete s.bank;
  if (s.construction) undo.construction = s.construction;
  delete s.construction;
}

