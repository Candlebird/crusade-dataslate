// The relic vault: every force keeps relics none of its units carry. Relics move freely between the vault and any
// unit with room for them; a relic won by a unit that can't take it (no free slot, not a relic bearer, or short of
// the tier's XP) goes to the vault instead of over the unit's limit.
import type { Force, Relic, Unit } from '../model/types';
import { RELIC_TIER_MIN_XP } from './data';
import { relicBearer, relicSlots, relicTierAllowed } from './engine';

export const vaultOf = (f: Force): Relic[] => f.relicVault ?? [];

/** Why this unit can't carry one more relic of this kind (undefined if it can). */
export function carryProblem(u: Unit, r: Pick<Relic, 'tier'>): string | undefined {
  if (u.status === 'removed') return 'Removed from the army.';
  if (!relicBearer(u)) return 'Only Heroes and units with Heroic Rise carry relics.';
  if (u.relics.length >= relicSlots(u.xp)) return `No free relic slot (${u.relics.length}/${relicSlots(u.xp)}).`;
  if (!relicTierAllowed(r.tier, u.xp)) return `${r.tier} relics need ${RELIC_TIER_MIN_XP[r.tier]}+ XP.`;
  return undefined;
}

/** Put a unit's relic in the vault. False when there's no such relic. */
export function stowRelic(f: Force, unitId: string, relicId: string): boolean {
  const u = f.units.find((x) => x.id === unitId);
  const i = u?.relics.findIndex((r) => r.id === relicId) ?? -1;
  if (!u || i < 0) return false;
  f.relicVault = [...vaultOf(f), ...u.relics.splice(i, 1)];
  return true;
}

/** Give a unit a relic from the vault. False when it isn't there or the unit can't carry it. */
export function equipRelic(f: Force, unitId: string, relicId: string): boolean {
  const u = f.units.find((x) => x.id === unitId);
  const r = vaultOf(f).find((x) => x.id === relicId);
  if (!u || !r || carryProblem(u, r)) return false;
  f.relicVault = vaultOf(f).filter((x) => x !== r);
  u.relics.push(r);
  return true;
}

/** A won relic: to the unit when it can carry it, else to the force's vault. Says where it went. */
export function grantRelic(f: Force, u: Unit | undefined, r: Relic): 'unit' | 'vault' {
  if (u && !carryProblem(u, r)) {
    u.relics.push(r);
    return 'unit';
  }
  f.relicVault = [...vaultOf(f), r];
  return 'vault';
}

/** The summary words for a granted relic. */
export const grantText = (r: Relic, u: Unit | undefined, where: 'unit' | 'vault', name = u?.name) =>
  where === 'unit' ? `${r.name} to ${name}` : `${r.name} to the relic vault${u ? ` (${name} has no room for it)` : ''}`;
