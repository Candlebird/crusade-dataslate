import type { CatalogUnit, Force, Unit } from './types';
import type { Loadout } from '../armyforge/book';
import { STARTING_SUPPLY } from '../rules/data';
import { detectCategory, ruleRating } from '../rules/engine';

export const uid = () => crypto.randomUUID().slice(0, 12);
export const nowIso = () => new Date().toISOString();

export function newForce(name = 'New Force'): Force {
  return {
    id: uid(), name, faction: '', player: '', description: '', startingSupply: STARTING_SUPPLY,
    battles: 0, wins: 0, ledger: [], units: [], umbraShards: 0, createdAt: nowIso(), updatedAt: nowIso(),
  };
}

export function newUnit(over: Partial<Unit> = {}): Unit {
  return {
    id: uid(), name: '', unitType: '', category: 'Infantry', categoryOverridden: false,
    points: 0, size: 1, quality: 4, defense: 4, tough: 1, rules: [], weapons: [], xp: 0,
    upgrades: [], scars: [], relics: [], bpAdjust: 0, status: 'active', battles: 0, kills: 0, notes: '',
    ...over,
  };
}

/** Create a crusade unit from an army-book datasheet plus the chosen loadout. */
export function unitFromCatalog(cu: CatalogUnit, loadout: Loadout, book: { uid: string; name: string }, name = ''): Unit {
  const tough = ruleRating(loadout.rules, 'Tough') ?? 1;
  return newUnit({
    name,
    unitType: cu.name,
    bookName: book.name,
    bookUid: book.uid,
    points: loadout.cost,
    size: cu.size,
    quality: cu.quality,
    defense: cu.defense,
    tough,
    rules: loadout.rules,
    weapons: loadout.weapons.map((w) => ({ ...w, id: uid(), traits: [] })),
    category: detectCategory({ rules: loadout.rules, size: cu.size, tough, name: cu.name }),
  });
}
