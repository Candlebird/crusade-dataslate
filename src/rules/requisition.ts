// Checks for the Requisition shop: what can be bought, for which unit.
import type { Unit } from '../model/types';
import type { RelicTier, Requisition } from './data';
import { relicTaken, type RelicHolder } from './engine';

export const RELIC_TIER: Record<string, RelicTier> = { 'Common Relic': 'Common', 'Rare Relic': 'Rare', 'Legendary Relic': 'Legendary' };
/** Requisitions whose effect the shop applies itself; the rest are recorded in the ledger only. */
export const NEEDS_UNIT = new Set(['Remove a Scar', 'Off Duty Training', 'Elite Reinforcements', 'Heroic Rise', ...Object.keys(RELIC_TIER)]);

/** Whether a unit can take this requisition at all. */
export function requisitionEligible(name: string, u: Unit): boolean {
  if (name === 'Remove a Scar') return u.scars.length > 0;
  if (name === 'Heroic Rise') return u.category !== 'Hero' && !u.heroicRise;
  return true;
}

/** Why the purchase can't go ahead, or null. Re-checked after every buy, since the shop keeps its selection. */
export function requisitionProblem(sel: Requisition | null, rp: number, unit: Unit | undefined, choice: string, held: Map<string, RelicHolder[]>): string | null {
  if (!sel) return 'Choose a requisition.';
  if (sel.cost > rp) return `Needs ${sel.cost} RP (you have ${rp}).`;
  if (NEEDS_UNIT.has(sel.name) && !unit) return 'Choose a unit.';
  if (unit && !requisitionEligible(sel.name, unit)) return 'That unit can\'t take this requisition.';
  const tier = RELIC_TIER[sel.name];
  if (sel.name === 'Remove a Scar' && !unit!.scars.some((x) => x.id === choice)) return 'Choose a scar.';
  if (tier) {
    if (!choice) return 'Choose a relic.';
    const taken = relicTaken(held, choice);
    if (taken) return `${choice}: ${taken}.`;
  }
  return null;
}
