import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { newUnit, unitFromCatalog } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { trainPoints } from './economy';
import { habitNames, habitsOf } from './habits';
import { readyRecipes, recipesFor, recipeUses, typeScores, unitTower } from './recipes';
import { shardPiece } from './shards';
import { blankRun } from './testRun';
import type { Grade, Recipe } from './types';

// Recipes from datasheets, and crafted units' tower stats.

const BOOKS = ['armies/void-echoes.gf.json', 'armies/shadow-stalkers.aof.json', 'src/data/spears-of-dothea.raw.json'];

/** Every datasheet of a book, as a force (default loadouts). */
const bookForce = (file: string): Unit[] => {
  const book = normalizeBook(JSON.parse(readFileSync(file, 'utf8')));
  return book.units.map((cu) => unitFromCatalog(cu, applySelection(cu, {}), book));
};

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });

const UNITS = {
  troopers: () => newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
  hero: () => newUnit({ id: 'hero', name: 'Captain', category: 'Hero', tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  tank: () => newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', tough: 6, defense: 2, points: 210, rules: ['Tough(6)', 'Impact(3)'], weapons: [gun('Cannon', 30, 1, 1, ['AP(2)', 'Blast(3)', 'Deadly(3)']), gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
  zerk: () => newUnit({ id: 'zerk', name: 'Berserkers', category: 'Infantry', size: 5, quality: 3, points: 130, rules: ['Furious', 'Fearless'], weapons: [gun('Great Axes', 0, 3, 5, ['AP(1)'])] }),
  snipers: () => newUnit({ id: 'snip', name: 'Snipers', category: 'Infantry', size: 3, quality: 3, defense: 5, points: 90, rules: ['Stealth'], weapons: [gun('Sniper Rifle', 36, 1, 3, ['AP(2)', 'Deadly(2)'])] }),
};
const party = () => Object.values(UNITS).map((f) => f());

const sig = (r: Recipe) => r.slots.map((s) => `${s.type}${s.grade}`).sort().join(',');
const top = (s: Record<string, number>) => Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];

/** The size and grade range a unit's points call for. */
const tier = (points: number) => TRAINING.shards.recipes.find((r) => points <= r.upTo)!;

describe('training recipes', () => {
  it.each(BOOKS)('gives every unit of %s a unique recipe of the right size and grades', (file) => {
    const force = bookForce(file);
    const recipes = recipesFor(force);
    expect(recipes.map((r) => r.unitId)).toEqual(force.map((u) => u.id));
    expect(new Set(recipes.map(sig)).size).toBe(recipes.length);
    for (const r of recipes) {
      // Priced by Training points (an Immobile unit's are surcharged).
      const t = tier(trainPoints(force.find((u) => u.id === r.unitId)!));
      expect(r.slots).toHaveLength(t.count);
      for (const s of r.slots) {
        expect(s.grade).toBeGreaterThanOrEqual(t.grades[0]);
        expect(s.grade).toBeLessThanOrEqual(t.grades[1]);
      }
    }
  });

  it('keeps recipes unique when a force has the same datasheet several times', () => {
    const force = bookForce(BOOKS[2]);
    const thrice = [...force, ...force, ...force].map((u, i) => ({ ...u, id: `${u.id}-${i}` }));
    const recipes = recipesFor(thrice);
    expect(new Set(recipes.map(sig)).size).toBe(thrice.length);
  });

  it('is deterministic, and skips units that cannot train', () => {
    const force = bookForce(BOOKS[0]);
    expect(recipesFor(force)).toEqual(recipesFor(force));
    force[0].status = 'removed';
    expect(recipesFor(force).map((r) => r.unitId)).not.toContain(force[0].id);
  });

  it('draws its types from the datasheet', () => {
    const force = party();
    const [troopers, hero, tank, zerk, snipers] = force;
    expect(['firepower', 'breach']).toContain(top(typeScores(snipers, force)));
    expect(typeScores(snipers, force).firepower).toBeGreaterThan(0);
    expect(top(typeScores(zerk, force))).toBe('assault');
    expect(top(typeScores(hero, force))).toBe('command');
    expect(typeScores(tank, force).blast).toBeGreaterThan(0.5);
    expect(typeScores(troopers, force).blast).toBe(0);
    const byId = Object.fromEntries(recipesFor(force).map((r) => [r.unitId, r]));
    expect(byId.tank.slots.map((s) => s.type)).toContain('blast');
    expect(byId.zerk.slots[0].type).toBe('assault');
  });

  it('puts dearer units of a tier on its higher grade', () => {
    const cheap = newUnit({ id: 'a', points: 105, weapons: [gun('Rifles', 24, 1, 5)] });
    const dear = newUnit({ id: 'b', points: 245, weapons: [gun('Rifles', 24, 1, 5)] });
    const [a, b] = recipesFor([cheap, dear]);
    const sum = (r: Recipe) => r.slots.reduce((n, s) => n + s.grade, 0);
    expect(sum(b)).toBeGreaterThan(sum(a));
  });
});

describe('training recipe checks', () => {
  const recipe: Recipe = { unitId: 'u', name: 'U', points: 150, slots: [{ type: 'firepower', grade: 2 }, { type: 'firepower', grade: 3 }, { type: 'swift', grade: 2 }] };
  const at = { x: 20, y: 20 };
  const s = (id: number, type: 'firepower' | 'swift' | 'blast', grade: Grade, draft = false) => shardPiece(id, at, type, grade, draft);

  it('takes each slot at exactly its grade, in slot order', () => {
    expect(recipeUses(recipe, [s(1, 'firepower', 5), s(2, 'firepower', 3), s(3, 'firepower', 2), s(4, 'swift', 2)])).toEqual([3, 2, 4]);
    // A grade too high no longer fills a slot.
    expect(recipeUses(recipe, [s(2, 'firepower', 3), s(3, 'firepower', 2), s(4, 'swift', 4)])).toBeNull();
    expect(recipeUses(recipe, [s(1, 'firepower', 3), s(2, 'firepower', 3), s(4, 'swift', 2)])).toBeNull();
    expect(recipeUses(recipe, [s(1, 'firepower', 5), s(2, 'firepower', 1), s(4, 'swift', 4)])).toBeNull();
    expect(recipeUses(recipe, [s(1, 'firepower', 3), s(2, 'firepower', 3), s(3, 'blast', 5)])).toBeNull();
  });

  it('prefers kept Shards to draft ones at the same grade', () => {
    expect(recipeUses(recipe, [s(1, 'firepower', 3, true), s(2, 'firepower', 3), s(3, 'firepower', 2), s(4, 'swift', 2)])).toEqual([3, 2, 4]);
  });

  it('lists ready recipes; draft pieces count only once all are placed', () => {
    const run = blankRun();
    run.recipes = [recipe, { ...recipe, unitId: 'v', slots: [{ type: 'blast', grade: 1 }, { type: 'blast', grade: 1 }] }];
    run.pieces = [s(1, 'firepower', 2), s(2, 'firepower', 3), s(3, 'swift', 2, true)];
    run.draft = { step: 'place', hand: [{ type: 'blast', grade: 1 }], placed: [3] };
    expect(readyRecipes(run)).toEqual([]);
    run.draft.step = 'keep';
    expect(readyRecipes(run)).toEqual([{ unitId: 'u', uses: [1, 2, 3] }]);
    run.crafted = ['u'];
    expect(readyRecipes(run)).toEqual([]);
  });
});

describe('training unit towers', () => {
  it('fights with its datasheet: guns, Tough, rules as skills, cap by points', () => {
    const t = unitTower(UNITS.tank(), 7, { x: 12, y: 30 }, 3);
    expect(t).toMatchObject({ kind: 'unit', id: 7, x: 12, y: 30, unitId: 'tank', tough: 6, impact: 3, quality: 4, craftedAt: 3, up: 0, xp: 0 });
    expect(t.cap).toBe(3);
    const cannon = t.guns.find((g) => g.name === 'Cannon')!;
    expect(cannon).toMatchObject({ range: 30, ap: 2, blast: 3, deadly: 3, cd: 0, pending: 0 });
    expect(unitTower(UNITS.hero(), 1, { x: 0, y: 0 }, 0).cap).toBe(5);
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('brings Sortie habits that do something here', () => {
    const u = newUnit({ quirks: ['eagle', 'clumsy', 'quick', 'hardy', 'myopic'], weapons: [gun('Rifles', 24, 1, 5)] });
    expect(habitsOf(u)).toEqual({ shoot: 1, melee: -1, init: 1, jumpy: false, myopic: true, hold: 0, tough: 1, terrain: 0 });
    expect(habitNames(u)).toEqual(['Eagle-eyed', 'Clumsy', 'Quick', 'Hardy', 'Short-sighted']);
    const t = unitTower(u, 1, { x: 0, y: 0 }, 0);
    expect(t.init).toBe(1);
    expect(t.myopic).toBe(true);
  });
});
