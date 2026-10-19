import { uid } from './factory';
import type { CatalogBook, CatalogUnit } from './types';

// Hand edits to an army book's datasheets, for books with no real Army Forge page.

/** Split "Hero, Tough(3), Caster(1)" into rules, leaving commas inside brackets alone. */
export const splitRules = (s: string) => s.split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

export const blankDatasheet = (): CatalogUnit => ({ id: uid(), name: 'New unit', cost: 0, size: 1, quality: 4, defense: 4, rules: [], weapons: [], sections: [] });

/** Put an edited datasheet into the book, carrying its tags over if it was renamed. */
export function saveDatasheet(b: CatalogBook, u: CatalogUnit) {
  const i = b.units.findIndex((x) => x.id === u.id);
  const old = b.units[i];
  if (old && old.name !== u.name && b.unitTags?.[old.name]) {
    // Only move the tags if no other datasheet still uses the old name.
    if (!b.units.some((x) => x !== old && x.name === old.name)) {
      b.unitTags[u.name] = [...new Set([...(b.unitTags[u.name] ?? []), ...b.unitTags[old.name]])];
      delete b.unitTags[old.name];
    }
  }
  if (i < 0) b.units.push(u);
  else b.units[i] = u;
  b.edited = true;
}

export function removeDatasheet(b: CatalogBook, id: string) {
  const u = b.units.find((x) => x.id === id);
  b.units = b.units.filter((x) => x.id !== id);
  if (u && b.unitTags?.[u.name] && !b.units.some((x) => x.name === u.name)) delete b.unitTags[u.name];
  b.edited = true;
}
