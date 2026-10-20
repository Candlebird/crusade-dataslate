import type { Campaign, Force } from '../model/types';
import { currentRound, factionName } from './nexus';
import { NEXUS_DETACHMENTS } from './nexusData';

// Nexus Wars detachments: a faction can field several forces. Round income, the match bonus and the
// once-a-round reorganisation are the faction's, so they're counted across all of its forces.

export const factionForces = (forces: Force[], factionId: string) => forces.filter((f) => f.nexus?.factionId === factionId);

/** "Faction", or "Faction — Force" when the faction fields more than one detachment. */
export function detachmentName(c: Campaign, forces: Force[], f: Force): string {
  const faction = factionName(c, f.nexus?.factionId);
  return factionForces(forces, f.nexus?.factionId ?? '').length > 1 ? `${faction} — ${f.name}` : faction;
}

/** The last round any of the faction's forces claimed income for. */
export function factionClaimedRound(forces: Force[], factionId: string): number | undefined {
  const claimed = factionForces(forces, factionId).map((f) => f.nexus!.claimedRound).filter((r): r is number => r !== undefined);
  return claimed.length ? Math.max(...claimed) : undefined;
}

/** Match bonuses the faction's forces have earned in this round, leaving out one force if given. */
export function matchBonusesEarned(forces: Force[], factionId: string, round: number, exceptId?: string) {
  return factionForces(forces, factionId)
    .filter((f) => f.id !== exceptId && f.nexus!.matchBonus?.round === round)
    .reduce((n, f) => n + f.nexus!.matchBonus!.count, 0);
}

/** Did the faction already reorganise its detachments this round? */
export const reorganisedThisRound = (c: Campaign, forces: Force[], factionId: string) =>
  factionForces(forces, factionId).some((f) => f.nexus!.reorganisedRound === currentRound(c));

export const supplyLimit = (f: Force) => f.startingSupply + f.ledger.reduce((n, e) => n + e.supply, 0);

/** Where everything ends up: each force's Supply Limit and Umbra Shards, and which force each moved unit joins. */
export interface ReorganisePlan {
  supply: Record<string, number>;
  us: Record<string, number>;
  /** Unit id → the force it moves to. Units left out stay put. */
  units: Record<string, string>;
}

export function reorganisePlan(forces: Force[]): ReorganisePlan {
  return {
    supply: Object.fromEntries(forces.map((f) => [f.id, supplyLimit(f)])),
    us: Object.fromEntries(forces.map((f) => [f.id, f.umbraShards])),
    units: {},
  };
}

/** Why the plan can't be applied: Supply must add up to what the forces have now, shards to that less the cost. */
export function reorganiseProblems(forces: Force[], plan: ReorganisePlan): string[] {
  const out: string[] = [];
  const sum = (r: Record<string, number>) => forces.reduce((n, f) => n + (r[f.id] ?? 0), 0);
  const supply = forces.reduce((n, f) => n + supplyLimit(f), 0);
  const us = forces.reduce((n, f) => n + f.umbraShards, 0) - NEXUS_DETACHMENTS.reorganiseCost;
  if (forces.length < 2) out.push('Reorganising needs at least two forces in the faction.');
  if (us < 0) out.push(`Reorganising costs ${NEXUS_DETACHMENTS.reorganiseCost} Umbra Shard${NEXUS_DETACHMENTS.reorganiseCost === 1 ? '' : 's'}; the faction has ${us + NEXUS_DETACHMENTS.reorganiseCost}.`);
  else if (sum(plan.us) !== us) out.push(`Umbra Shards add up to ${sum(plan.us)}; they must add up to ${us}.`);
  if (sum(plan.supply) !== supply) out.push(`Supply adds up to ${sum(plan.supply)}; it must add up to ${supply}.`);
  if (forces.some((f) => (plan.supply[f.id] ?? 0) < 0 || (plan.us[f.id] ?? 0) < 0)) out.push('No force can go below 0.');
  return out;
}

/** Points each force would field after the plan: a warning, not a block. */
export function plannedPoints(forces: Force[], plan: ReorganisePlan): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(forces.map((f) => [f.id, 0]));
  for (const f of forces) {
    for (const u of f.units) {
      if (u.status === 'removed') continue;
      const to = plan.units[u.id] ?? f.id;
      out[to in out ? to : f.id] += u.points;
    }
  }
  return out;
}

/**
 * Apply a reorganisation to drafts of all the faction's forces: Supply moves through ledger entries, units move
 * with their XP, traits and relics, and moved units leave the old force's battle lists. Returns the problems
 * instead when it can't be applied.
 */
export function reorganise(forces: Force[], plan: ReorganisePlan, round: number, date: string, newId: () => string): string[] {
  const problems = reorganiseProblems(forces, plan);
  if (problems.length) return problems;
  const byId = new Map(forces.map((f) => [f.id, f]));
  const moving = forces.flatMap((f) => f.units.filter((u) => plan.units[u.id] && plan.units[u.id] !== f.id && byId.has(plan.units[u.id])).map((u) => ({ from: f, u })));
  for (const { from, u } of moving) {
    from.units = from.units.filter((x) => x.id !== u.id);
    for (const l of from.lists ?? []) {
      l.unitIds = l.unitIds.filter((id) => id !== u.id);
      l.joins = Object.fromEntries(Object.entries(l.joins).filter(([hero, unit]) => hero !== u.id && unit !== u.id));
    }
    byId.get(plan.units[u.id])!.units.push(u);
  }
  for (const f of forces) {
    const delta = plan.supply[f.id] - supplyLimit(f);
    const us = plan.us[f.id] - f.umbraShards;
    if (delta || us) f.ledger.push({ id: newId(), date, label: 'Nexus — Detachments reorganised', rp: 0, supply: delta, ...(us ? { us } : {}) });
    f.umbraShards = plan.us[f.id];
    f.nexus!.reorganisedRound = round;
  }
  return [];
}
