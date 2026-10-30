import type { Unit } from './types';
import {
  MAX_SCARS,
  NEXUS_TRAITS,
  TRAIT_TABLES,
  UNIQUE_TRAIT_TABLES,
  UNIQUE_WEAPON_TRAIT_TABLES,
  WEAPON_TRAIT_TABLES,
  type TableEntry,
} from '../rules/data';
import { xpProgress } from '../rules/engine';

const find = (tables: TableEntry[][], name: string): string | undefined => {
  const key = name.trim().toLowerCase();
  for (const t of tables) for (const e of t) if (e.name.toLowerCase() === key) return e.desc;
  return undefined;
};

/** What a unit trait does, from the trait tables (undefined for a homebrew name). */
export function traitDesc(name: string): string | undefined {
  return find([...Object.values(TRAIT_TABLES), ...Object.values(UNIQUE_TRAIT_TABLES), ...Object.values(NEXUS_TRAITS)], name);
}

/** What a weapon trait does, from the weapon trait tables. */
export function weaponTraitDesc(name: string): string | undefined {
  return find([...Object.values(WEAPON_TRAIT_TABLES), ...Object.values(UNIQUE_WEAPON_TRAIT_TABLES)], name);
}

/** One line under the XP bar: how far it is to the next level. */
export function xpNextText(xp: number): string {
  const p = xpProgress(xp);
  if (p.next == null) return 'Max level. More XP unlocks swapping an upgrade.';
  return `${Math.ceil(p.next - xp - 1e-9)} XP to level ${p.level + 1}.`;
}

/** How close the unit is to being removed by scars. */
export function scarText(u: Pick<Unit, 'scars'>): string {
  const n = u.scars.length;
  if (n >= MAX_SCARS) return `${n} of ${MAX_SCARS}: one more scar removes the unit.`;
  return `${n} of ${MAX_SCARS}. A scar past ${MAX_SCARS} removes the unit.`;
}

/** A short banner for a unit that is not simply active, or null. */
export function statusNote(u: Pick<Unit, 'status'>): string | null {
  if (u.status === 'comatose') return 'Comatose: it sits out your next game, then wakes up after that battle.';
  if (u.status === 'removed') return 'Fallen: this unit has been removed from the army.';
  return null;
}
