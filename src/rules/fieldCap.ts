import type { Campaign, CampaignFaction, Force, Sector } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { positionOf } from './movement';
import { currentRound, markUnitsUsed } from './nexus';
import { FIELD_CAP, RAID, UNDERDOG_XP } from './nexusData';

// The field cap (Nexus Wars): how much Supply one detachment can hold. It grows each round, so armies get bigger as the
// campaign goes on, but no one detachment runs away from the rest. Supply a detachment earns past its cap goes to its
// faction's bank, where any of the faction's players can hand it to a detachment with room, or found a new one with it.
// A detachment already over the cap when it came in keeps what it has (grandfathered), but grows no more until the cap
// passes it.

/** The field cap this round: FIELD_CAP (or the GM's override), growing each round up to its max. */
export function fieldCap(c: Campaign | undefined): number {
  const { base, perRound, max } = c?.fieldCap ?? FIELD_CAP;
  return Math.min(max, base + perRound * (c ? currentRound(c) : 1));
}

/** The most Supply this detachment can hold: the cap, or what it was grandfathered at, whichever is more. */
export const capFor = (c: Campaign | undefined, f: Force) => Math.max(fieldCap(c), f.nexus?.capHold ?? 0);

/** Supply this detachment can still take before it hits its cap. */
export const roomFor = (c: Campaign | undefined, f: Force) => Math.max(0, capFor(c, f) - supplyLimit(f));

const factionOf = (c: Campaign, f: Force): CampaignFaction | undefined => c.factions.find((x) => x.id === f.nexus?.factionId);

/** Does the cap apply to this force: it's in one of the campaign's factions? */
export const capped = (c: Campaign | undefined, f: Force): c is Campaign => !!c && !!factionOf(c, f);

/**
 * Hold a detachment to its cap. The first time it's checked, Supply already over the cap is grandfathered (`capHold`).
 * After that, any Supply past its cap goes to the faction's bank, with a ledger entry to show where it went. A
 * grandfathered detachment's hold shrinks with its Supply (it can't grow back to it) and is dropped once the cap passes it.
 * Mutates `f` and the campaign; returns the Supply banked.
 */
export function sweepCap(c: Campaign | undefined, f: Force, date: string, newId: () => string): number {
  if (!capped(c, f) || !f.nexus) return 0;
  const n = f.nexus;
  const supply = supplyLimit(f);
  const cap = fieldCap(c);
  if (!n.capSeen) {
    n.capSeen = true;
    if (supply > cap) n.capHold = supply;
    return 0;
  }
  if (n.capHold !== undefined) {
    n.capHold = Math.min(n.capHold, Math.max(supply, cap));
    if (n.capHold <= cap) delete n.capHold;
  }
  const over = supply - capFor(c, f);
  if (over <= 0) return 0;
  f.ledger.push({ id: newId(), date, label: 'Nexus — Over the field cap: to the faction bank', rp: 0, supply: -over });
  const faction = factionOf(c, f)!;
  faction.bank = (faction.bank ?? 0) + over;
  return over;
}

/** Take in any bank Supply handed to this detachment (another player's app may have made the grant). Returns the Supply. */
export function claimGrants(c: Campaign | undefined, f: Force, date: string, newId: () => string): number {
  if (!capped(c, f)) return 0;
  const faction = factionOf(c, f)!;
  const mine = (faction.grants ?? []).filter((g) => g.forceId === f.id);
  if (!mine.length) return 0;
  faction.grants = faction.grants!.filter((g) => g.forceId !== f.id);
  if (!faction.grants.length) delete faction.grants;
  const supply = mine.reduce((n, g) => n + g.supply, 0);
  f.ledger.push({ id: newId(), date, label: 'Nexus — Supply from the faction bank', rp: 0, supply });
  return supply;
}

/** Bank Supply already handed out but not taken in yet, for a detachment. */
export const pendingGrants = (c: Campaign, f: Force) =>
  (factionOf(c, f)?.grants ?? []).filter((g) => g.forceId === f.id).reduce((n, g) => n + g.supply, 0);

/** Why `supply` can't go from the bank to the detachment: the bank must hold it, and the detachment must have room. */
export function grantProblem(c: Campaign, f: Force, supply: number): string | undefined {
  const faction = factionOf(c, f);
  if (!faction) return 'That detachment isn\'t in a faction.';
  if (!Number.isInteger(supply) || supply <= 0) return 'Give a whole number of Supply.';
  if (supply > (faction.bank ?? 0)) return `The bank holds ${faction.bank ?? 0} Supply.`;
  const room = roomFor(c, f) - pendingGrants(c, f);
  if (supply > room) return `${f.name} has room for ${Math.max(0, room)} more Supply this round.`;
  return undefined;
}

/** Hand bank Supply to one of the faction's detachments: it lands when that force's owner next opens the app (at once for your own). */
export function grantFromBank(c: Campaign, f: Force, supply: number, newId: () => string): string | undefined {
  const problem = grantProblem(c, f, supply);
  if (problem) return problem;
  const faction = factionOf(c, f)!;
  faction.bank = (faction.bank ?? 0) - supply;
  faction.grants = [...(faction.grants ?? []), { id: newId(), forceId: f.id, supply }];
  return undefined;
}

/** Why a new detachment can't be founded with `supply` from the faction's bank. */
export function foundProblem(c: Campaign, factionId: string, supply: number): string | undefined {
  const bank = c.factions.find((x) => x.id === factionId)?.bank ?? 0;
  if (bank < FIELD_CAP.foundMin) return `A new detachment needs at least ${FIELD_CAP.foundMin} Supply from the bank; it holds ${bank}.`;
  if (!Number.isInteger(supply) || supply < FIELD_CAP.foundMin) return `Found it with at least ${FIELD_CAP.foundMin} Supply.`;
  if (supply > bank) return `The bank holds ${bank} Supply.`;
  if (supply > fieldCap(c)) return `No more than the field cap (${fieldCap(c)}).`;
  return undefined;
}

/** Found a detachment with bank Supply: takes it off the bank and writes it into the new force's ledger. */
export function foundFromBank(c: Campaign, f: Force, supply: number, date: string, newId: () => string): string | undefined {
  const fid = f.nexus?.factionId;
  if (!fid) return 'That force isn\'t in a faction.';
  const problem = foundProblem(c, fid, supply);
  if (problem) return problem;
  const faction = c.factions.find((x) => x.id === fid)!;
  faction.bank = (faction.bank ?? 0) - supply;
  f.ledger.push({ id: newId(), date, label: 'Nexus — Founded from the faction bank', rp: 0, supply });
  f.nexus!.capSeen = true;
  return undefined;
}

/** Umbra Shards to move a unit between two detachments: free when they stand in the same sector. */
export function transferCost(c: Campaign, from: Force, to: Force): number {
  const a = positionOf(c, from);
  const b = positionOf(c, to);
  return a && b && a.id === b.id ? 0 : FIELD_CAP.transferUs;
}

/** Why a unit can't move from one detachment to another. */
export function transferProblem(c: Campaign, forces: Force[], from: Force, to: Force, unitId: string): string | undefined {
  if (from.id === to.id) return 'Pick another detachment.';
  if (!from.nexus?.factionId || from.nexus.factionId !== to.nexus?.factionId) return 'Units move only between one faction\'s detachments.';
  if (!factionForces(forces, from.nexus.factionId).some((x) => x.id === to.id)) return 'Units move only between one faction\'s detachments.';
  const u = from.units.find((x) => x.id === unitId);
  if (!u || u.status === 'removed') return 'That unit isn\'t in the detachment.';
  const cost = transferCost(c, from, to);
  if (from.umbraShards < cost) return `Moving it to another sector costs ${cost} Umbra Shards; ${from.name} has ${from.umbraShards}.`;
  return undefined;
}

/**
 * Move a unit (with its XP, traits and relics) to another of the faction's detachments. The shards come out of the
 * detachment it leaves. It arrives Battle-Worn for the round: a unit fights for one detachment a round.
 */
export function transferUnit(c: Campaign, forces: Force[], from: Force, to: Force, unitId: string, date: string, newId: () => string): string | undefined {
  const problem = transferProblem(c, forces, from, to, unitId);
  if (problem) return problem;
  const cost = transferCost(c, from, to);
  const u = from.units.find((x) => x.id === unitId)!;
  from.units = from.units.filter((x) => x.id !== unitId);
  for (const l of from.lists ?? []) {
    l.unitIds = l.unitIds.filter((id) => id !== unitId);
    l.joins = Object.fromEntries(Object.entries(l.joins).filter(([hero, unit]) => hero !== unitId && unit !== unitId));
  }
  to.units.push(u);
  if (cost) {
    from.umbraShards -= cost;
    from.ledger.push({ id: newId(), date, label: `Nexus — Sent ${u.name} to ${to.name}`, rp: 0, supply: 0, us: -cost });
  }
  if (to.nexus) markUnitsUsed(to, c, [unitId]);
  return undefined;
}

/** Points of the detachment's active units. */
export const fieldedPoints = (f: Force) => f.units.filter((u) => u.status === 'active').reduce((n, u) => n + u.points, 0);

/** A lean detachment (it has active units, worth FIELD_CAP.lean points at most) moves FIELD_CAP.leanMove more hexes. */
export const isLean = (f: Force) => f.units.some((u) => u.status === 'active') && fieldedPoints(f) <= FIELD_CAP.lean;

/** Underdog XP: on a win, each unit that fought gets +1 XP for each UNDERDOG_XP.gap the garrison was over the attackers' Supply. */
export function underdogXp(garrison: number | undefined, attackers: number): number {
  if (!garrison || attackers <= 0 || garrison <= attackers) return 0;
  return Math.min(UNDERDOG_XP.max, Math.floor((garrison / attackers - 1) / UNDERDOG_XP.gap + 1e-9));
}

/** Should the app offer a raid: the garrison is over RAID.prompt × the attackers' Supply? */
export const raidOffered = (garrison: number | undefined, attackers: number) => !!garrison && attackers > 0 && garrison > attackers * RAID.prompt;

/** A sector's raid cut, 0 to 1. */
export const cutOf = (s: Sector) => Math.min(1, Math.max(0, s.cut ?? 0));

/** A won raid cuts the sector's garrison by RAID.cut more. Returns the cut added, so deleting the game can take it back. */
export function cutGarrison(s: Sector): number {
  const before = cutOf(s);
  s.cut = Math.min(1, Math.round((before + RAID.cut) * 100) / 100);
  return s.cut - before;
}

/** Take back a deleted raid's cut. */
export function uncutGarrison(s: Sector, cut: number) {
  const next = Math.round((cutOf(s) - cut) * 100) / 100;
  if (next > 0) s.cut = next;
  else delete s.cut;
}

/** When a round ends, sectors nobody attacked that round grow back RAID.regrow (up to their full garrison). */
export function regrowCuts(c: Campaign, round: number) {
  const hit = new Set(c.log.filter((e) => e.round === round && !e.spread && !e.skirmish && !e.crisis).map((e) => e.sectorId));
  for (const s of c.sectors) {
    if (!s.cut || hit.has(s.id)) continue;
    const next = Math.round((s.cut - RAID.regrow) * 100) / 100;
    if (next > 0) s.cut = next;
    else delete s.cut;
  }
}
