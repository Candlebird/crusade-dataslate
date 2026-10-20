import type { Campaign, CampaignEvent, Force, Sector, Unit } from '../model/types';
import { BUILDINGS, PRODUCTION } from './nexusData';

// Planet production (Nexus Wars). New units for a Nexus force aren't bought, they're built: every planet and home a
// faction holds banks production Supply each round (PRODUCTION.perRound, or more with Barracks, up to bankRounds
// rounds' worth), and a new unit is produced at one of them, paid from its bank. Banks are lost when a sector changes
// hands; buildings stay for the new owner. Buildings are paid from the bank too (the strong ones also cost Umbra
// Shards); a sector builds one at a time, finished when the round ends. Values live in nexusData.ts.

export const buildingById = (id: string) => BUILDINGS.find((b) => b.id === id);
export const hasBuilding = (s: Sector, id: string) => !!s.buildings?.includes(id);

/** Reinforced for its defender: by a Reinforce order (lost when it changes hands) or by Walls (permanent). */
export const isReinforced = (s: Sector) => !!s.reinforced || hasBuilding(s, 'walls');

/** Building slots a sector has (0 for sectors that don't produce). */
export const buildingSlots = (s: Sector) => PRODUCTION.slots[s.type] ?? 0;
export const produces = (s: Sector) => buildingSlots(s) > 0;

/** Production Supply the sector banks each round. */
export const productionRate = (s: Sector) => (hasBuilding(s, 'barracks') ? PRODUCTION.barracks : PRODUCTION.perRound);
export const bankCap = (s: Sector) => productionRate(s) * PRODUCTION.bankRounds;

/** The sectors a faction can produce units at. */
export const productionSites = (c: Campaign, factionId: string) => c.sectors.filter((s) => s.owner === factionId && produces(s));

/** Round end: every held producing sector banks its production. Returns what each sector gained. */
export function accrueProduction(c: Campaign): { sector: Sector; gained: number }[] {
  const out: { sector: Sector; gained: number }[] = [];
  for (const s of c.sectors) {
    if (!produces(s) || !s.owner || !c.factions.some((f) => f.id === s.owner)) continue;
    const before = s.bank ?? 0;
    s.bank = Math.min(bankCap(s), before + productionRate(s));
    if (s.bank > before) out.push({ sector: s, gained: s.bank - before });
  }
  return out;
}

/** Slots not built on or under construction. */
export const freeSlots = (s: Sector) => buildingSlots(s) - (s.buildings?.length ?? 0) - (s.construction ? 1 : 0);

/** Why the building can't be started here, if it can't. `payer` is the force paying its Umbra Shards. */
export function buildBlock(s: Sector, id: string, payer?: Force): string | undefined {
  const b = buildingById(id);
  if (!b) return 'Unknown building';
  if (!produces(s)) return 'Only planets and home sectors have buildings';
  if (hasBuilding(s, id)) return 'Already built';
  if (s.construction) return `${buildingById(s.construction.id)?.name ?? 'A building'} is already going up here: one at a time`;
  if (freeSlots(s) <= 0) return `No free slot (${buildingSlots(s)})`;
  if ((s.bank ?? 0) < b.cost) return `Needs ${b.cost} banked Supply (${s.bank ?? 0} here)`;
  if (b.shards && (payer?.umbraShards ?? 0) < b.shards) return `Needs ${b.shards} Umbra Shard${b.shards === 1 ? '' : 's'}${payer ? ` (${payer.name} has ${payer.umbraShards})` : ' from one of your forces (none loaded here)'}`;
  return undefined;
}

/** Start a building: its Supply comes from the bank, its Umbra Shards from `payer`. It's finished when the round ends. False when it can't be started. */
export function build(c: Campaign, s: Sector, id: string, payer?: Force, date = '', newId: () => string = () => ''): boolean {
  if (buildBlock(s, id, payer)) return false;
  const b = buildingById(id)!;
  s.bank = (s.bank ?? 0) - b.cost;
  s.construction = { id, round: c.round ?? 1, supply: b.cost, shards: b.shards };
  if (b.shards && payer) {
    payer.umbraShards -= b.shards;
    payer.ledger.push({ id: newId(), date, label: `Nexus — ${b.name} at ${s.name}`, rp: 0, supply: 0, us: -b.shards });
    s.construction.forceId = payer.id;
  }
  return true;
}

/** Stop the building going up: everything paid for it comes back (Supply to the bank, shards to the force that paid). */
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

/** Produce units at a sector: pay their points from its bank; Training Grounds give them their starting XP. False when the bank is short. */
export function produce(s: Sector, units: Unit[]): boolean {
  const cost = units.reduce((n, u) => n + u.points, 0);
  if (cost > (s.bank ?? 0)) return false;
  s.bank = (s.bank ?? 0) - cost;
  const xp = hasBuilding(s, 'training') ? PRODUCTION.trainingXp : 0;
  for (const u of units) {
    u.xp = Math.max(u.xp, xp);
    u.notes = [u.notes, `Produced at ${s.name}.`].filter(Boolean).join(' ');
  }
  return true;
}

/** A captured sector's bank, and any building going up, is lost (noted in `undo`, so deleting the game gives them back). */
export function loseBank(s: Sector, undo: NonNullable<CampaignEvent['undo']>) {
  if (s.bank) undo.bank = s.bank;
  delete s.bank;
  if (s.construction) undo.construction = s.construction;
  delete s.construction;
}

