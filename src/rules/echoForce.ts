import { applySelection, type Selection } from '../armyforge/book';
import { unitFromCatalog } from '../model/factory';
import type { CatalogBook, CatalogUnit, Unit } from '../model/types';
import { hasRule, ruleRating } from './engine';
import { builtinEchoes } from '../model/seed';

// A random Void Echoes army for the AI side, built from the imported army book to a points target
// with OPR's list limits: a hero per 375 pts, no unit over 35% of the total, 1 + 1 per 750 pts copies.
// Big units (over BIG_UNIT pts) only ever appear once: there's just one model of each, and only one per full
// BIG_UNIT_PER pts, so a big army is mostly troops, not a wall of monsters that outlasts the fight.

export const ECHOES_BOOK = 'void-echoes-gf';
export const BIG_UNIT = 250;
export const BIG_UNIT_PER = 2000;
type Rand = () => number;

/** The player's copy of the Void Echoes book (it may be edited), else the one that ships with the site. */
export const echoesBook = (books: CatalogBook[]): CatalogBook =>
  books.find((b) => b.uid === ECHOES_BOOK) ?? books.find((b) => b.name === 'Void Echoes') ?? builtinEchoes();

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
  if (!book.units.length) return [];
  const maxCost = Math.floor(target * 0.35);
  const maxHeroes = Math.max(1, Math.floor(target / 375));
  const maxCopies = 1 + Math.floor(target / 750);
  const maxBig = Math.floor(target / BIG_UNIT_PER);
  const out: Unit[] = [];
  let spent = 0;
  let heroes = 0;
  const copies = new Map<string, number>();
  for (let misses = 0; misses < 60; ) {
    const cu = pick(rand, book.units);
    // Upgrades that don't fit fall back to the bare datasheet.
    const bigLeft = out.filter((u) => u.points > BIG_UNIT).length < maxBig;
    const fit = [applySelection(cu, randomSelection(cu, rand)), applySelection(cu, {})].find(
      (l) => l.cost > 0 && l.cost <= maxCost && (bigLeft || l.cost <= BIG_UNIT) && spent + l.cost <= target,
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

/** What a datasheet does in an army: leads it, holds the line, or backs it up (big or Tough models). */
export type EchoRole = 'hero' | 'core' | 'support';
export const roleOf = (cu: Pick<CatalogUnit, 'rules' | 'cost'>): EchoRole =>
  hasRule(cu.rules, 'Hero') ? 'hero' : cu.cost > BIG_UNIT || (ruleRating(cu.rules, 'Tough') ?? 1) >= 3 ? 'support' : 'core';

/** The share of a garrison's points each role aims for; heroes are capped by OPR's limits as ever. */
export const GARRISON_ROLES: Record<EchoRole, number> = { hero: 0.15, core: 0.55, support: 0.3 };

/**
 * A garrison of Echoes built by role: heroes to lead, troops for the line, support behind them, each role filled to its
 * share in turn (with shooting and melee units taken by turns), then topped up to the full target. Same seed, same garrison.
 */
export function roleEchoes(book: CatalogBook, target: number, rand: Rand): Unit[] {
  if (!book.units.length) return [];
  const maxCost = Math.floor(target * 0.35);
  const maxHeroes = Math.max(1, Math.floor(target / 375));
  const maxCopies = 1 + Math.floor(target / 750);
  const maxBig = Math.floor(target / BIG_UNIT_PER);
  const out: Unit[] = [];
  const spentOn: Record<EchoRole, number> = { hero: 0, core: 0, support: 0 };
  let spent = 0;
  let melee = 0;
  let ranged = 0;
  const tryAdd = (role: EchoRole | undefined, cap: number): boolean => {
    const pool = book.units.filter((cu) => !role || roleOf(cu) === role);
    for (let k = 0; k < 12 && pool.length; k++) {
      const cu = pick(rand, pool);
      const bigLeft = out.filter((u) => u.points > BIG_UNIT).length < maxBig;
      const fit = [applySelection(cu, randomSelection(cu, rand)), applySelection(cu, {})].find(
        (l) => l.cost > 0 && l.cost <= maxCost && (bigLeft || l.cost <= BIG_UNIT) && spent + l.cost <= target && l.cost <= cap,
      );
      if (!fit) continue;
      const hero = hasRule(fit.rules, 'Hero');
      const big = cu.cost > BIG_UNIT || fit.cost > BIG_UNIT;
      const have = out.filter((u) => u.unitType === cu.name).length;
      if (have >= (big ? 1 : maxCopies) || (hero && out.filter((u) => hasRule(u.rules, 'Hero')).length >= maxHeroes)) continue;
      const u = unitFromCatalog(cu, fit, book);
      const shoots = u.weapons.some((w) => w.range > 0);
      // Keep shooting and melee in step: skip one that would put a side 2 ahead, unless nothing else turns up.
      if (k < 8 && (shoots ? ranged - melee >= 2 : melee - ranged >= 2)) continue;
      out.push(u);
      spent += fit.cost;
      spentOn[roleOf(cu)] += fit.cost;
      if (shoots) ranged++; else melee++;
      return true;
    }
    return false;
  };
  for (const role of ['hero', 'core', 'support'] as EchoRole[]) {
    const share = target * GARRISON_ROLES[role];
    while (spentOn[role] < share && tryAdd(role, Math.max(share - spentOn[role], role === 'hero' ? maxCost : 0) + 40)) { /* fill */ }
  }
  for (let misses = 0; misses < 30 && spent < target; ) if (!tryAdd(undefined, target)) misses++;
  return out;
}

