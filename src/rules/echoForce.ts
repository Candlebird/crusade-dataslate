import { applySelection, type Selection } from '../armyforge/book';
import { unitFromCatalog } from '../model/factory';
import type { CatalogBook, CatalogUnit, Unit } from '../model/types';
import { hasRule } from './engine';

// A random Void Echoes army for the AI side, built from the imported army book to a points target
// with OPR's list limits: a hero per 375 pts, no unit over 35% of the total, 1 + 1 per 750 pts copies.
// Big units (over BIG_UNIT pts) only ever appear once: there's just one model of each.

export const ECHOES_BOOK = 'void-echoes-gf';
export const BIG_UNIT = 250;
type Rand = () => number;

export const echoesBook = (books: CatalogBook[]) => books.find((b) => b.uid === ECHOES_BOOK) ?? books.find((b) => b.name === 'Void Echoes');

export const pick = <T,>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];

/** Take one random option in about half the unit's upgrade sections. */
export function randomSelection(cu: CatalogUnit, rand: Rand): Selection {
  const sel: Selection = {};
  for (const s of cu.sections) if (s.options.length && rand() < 0.5) sel[`${s.id}:${pick(rand, s.options).id}`] = 1;
  return sel;
}

/** A random loadout for the datasheet (the bare datasheet when the upgrades come to nothing). */
export const randomLoadout = (cu: CatalogUnit, rand: Rand) => applySelection(cu, randomSelection(cu, rand));

export function randomEchoes(book: CatalogBook, target: number, rand: Rand = Math.random): Unit[] {
  const maxCost = Math.floor(target * 0.35);
  const maxHeroes = Math.max(1, Math.floor(target / 375));
  const maxCopies = 1 + Math.floor(target / 750);
  const out: Unit[] = [];
  let spent = 0;
  let heroes = 0;
  const copies = new Map<string, number>();
  for (let misses = 0; misses < 60; ) {
    const cu = pick(rand, book.units);
    // Upgrades that don't fit fall back to the bare datasheet.
    const fit = [applySelection(cu, randomSelection(cu, rand)), applySelection(cu, {})].find(
      (l) => l.cost > 0 && l.cost <= maxCost && spent + l.cost <= target,
    );
    const hero = !!fit && hasRule(fit.rules, 'Hero');
    const big = !!fit && (cu.cost > BIG_UNIT || fit.cost > BIG_UNIT || out.some((u) => u.unitType === cu.name && u.points > BIG_UNIT));
    const have = copies.get(cu.id) ?? 0;
    if (!fit || have >= (big ? 1 : maxCopies) || (hero && heroes >= maxHeroes)) {
      misses++;
      continue;
    }
    out.push(unitFromCatalog(cu, fit, book));
    spent += fit.cost;
    heroes += hero ? 1 : 0;
    copies.set(cu.id, (copies.get(cu.id) ?? 0) + 1);
  }
  return out;
}
