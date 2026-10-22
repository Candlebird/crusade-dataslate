import type { CatalogBook, Force, Unit } from '../model/types';
import { newForce, uid, unitFromCatalog } from '../model/factory';
import { newList } from '../rules/lists';
import { applySelection, type Selection } from './book';

type Raw = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** An Army Forge list save (the .json from "Export list"): only ids pointing into the army book. */
export function isListSave(data: Raw): boolean {
  return !!data?.saveVersion && Array.isArray(data?.list?.units) && typeof data?.armyId === 'string';
}

/** Army book uids a list save needs. */
export function listBookUids(raw: Raw): string[] {
  const ids = new Set<string>([raw.armyId, ...(raw.armyIds ?? []), ...raw.list.units.map((u: Raw) => u.armyId)]);
  return [...ids].filter(Boolean);
}

/** Build a force, with full stats and a matching battle list, from an Army Forge list save. */
export function listToForce(raw: Raw, books: CatalogBook[]): Force {
  const missing = listBookUids(raw).filter((id) => !books.some((b) => b.uid === id));
  if (missing.length) throw new MissingBooksError(missing, raw.armyName);

  const f = newForce(raw.list.name || raw.armyName || 'Imported list');
  const main = books.find((b) => b.uid === raw.armyId)!;
  f.faction = main.faction || main.name;

  const bySelection = new Map<string, Unit>();
  const joins: [string, string][] = [];
  const combined: [Unit, string][] = [];
  /** Combined copies, by selection id, to the unit they were merged into (a hero may be joined to either half). */
  const merged = new Map<string, Unit>();
  for (const lu of raw.list.units as Raw[]) {
    const book = books.find((b) => b.uid === (lu.armyId ?? raw.armyId))!;
    const cu = book.units.find((u) => u.id === lu.id);
    if (!cu) throw new Error(`"${book.name}" has no datasheet ${lu.id}. Re-import the army book from Army Forge and try again.`);
    const sel: Selection = {};
    for (const up of lu.selectedUpgrades ?? []) {
      const key = `${up.upgradeId}:${up.optionId}`;
      sel[key] = (sel[key] ?? 0) + 1;
    }
    const unit = unitFromCatalog(cu, applySelection(cu, sel), book, lu.customName ?? '');
    unit.xp = lu.xp ?? 0;
    unit.notes = lu.notes ?? '';
    bySelection.set(lu.selectionId, unit);
    if (lu.joinToUnit) (lu.combined ? combined : joins).push(lu.combined ? [unit, lu.joinToUnit] : [lu.selectionId, lu.joinToUnit]);
  }

  // A combined unit is a second copy merged into its partner: one unit of double size.
  for (const [copy, target] of combined) {
    const base = bySelection.get(target);
    if (!base) continue;
    base.size += copy.size;
    base.points += copy.points;
    // The copy's models bring their weapons, upgrades included.
    for (const w of copy.weapons) {
      const same = base.weapons.find((x) => x.name === w.name && x.range === w.range && x.attacks === w.attacks && x.rules.join() === w.rules.join());
      if (same) same.count += w.count;
      else base.weapons.push(w);
    }
    for (const [k, v] of bySelection) if (v === copy) { bySelection.delete(k); merged.set(k, base); }
  }

  f.units = [...bySelection.values()];
  const list = newList(f, uid());
  list.name = raw.list.name || list.name;
  list.pointsLimit = raw.list.pointsLimit || list.pointsLimit;
  list.unitIds = f.units.map((u) => u.id);
  for (const [hero, target] of joins) {
    const h = bySelection.get(hero);
    const t = bySelection.get(target) ?? merged.get(target);
    if (h && t) list.joins[h.id] = t.id;
  }
  f.lists = [list];
  return f;
}

export class MissingBooksError extends Error {
  constructor(public uids: string[], armyName?: string) {
    super(`This Army Forge list needs the army book${armyName ? ` "${armyName}"` : ''}. Import it on the Army Books page first, then drop the list again.`);
  }
}
