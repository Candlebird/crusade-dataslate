import { describe, expect, it } from 'vitest';
import { glossary, listIssues, listTotals, listUnits, newList, ruleName, weaponColumns } from './lists';
import { interpretJson } from '../model/io';
import { newForce, newUnit } from '../model/factory';
import { DEFAULT_SETTINGS, type CatalogBook, type Force, type Unit } from '../model/types';

const unit = (id: string, over: Partial<Unit> = {}): Unit =>
  newUnit({ id, unitType: id, category: 'Infantry', points: 100, size: 5, ...over });

function force(): Force {
  const f = newForce('Test');
  f.units = [
    unit('hero', { category: 'Hero', rules: ['Hero', 'Tough(3)'], points: 120, size: 1 }),
    unit('squad', { rules: ['Fearless'] }),
    unit('tank', { category: 'Vehicle/Monster', points: 300, size: 1 }),
    unit('dead', { status: 'removed' }),
  ];
  f.lists = [newList(f, 'l1')];
  return f;
}

const book: CatalogBook = {
  uid: 'b', name: 'Book', faction: '', version: '1', importedAt: '', units: [], spells: [],
  rules: [{ name: 'Tough', desc: 'Book tough.' }],
};

describe('battle lists', () => {
  it('starts from the previous list size', () => {
    const f = force();
    f.lists![0].pointsLimit = 1500;
    expect(newList(f, 'l2')).toMatchObject({ name: 'Battle list 2', pointsLimit: 1500, unitIds: [] });
  });

  it('puts a joined hero right after its unit', () => {
    const f = force();
    const l = { ...f.lists![0], unitIds: ['hero', 'squad', 'tank'], joins: { hero: 'squad' } };
    expect(listUnits(f, l).map((u) => u.id)).toEqual(['squad', 'hero', 'tank']);
    // Joining an unselected unit leaves the hero on its own.
    expect(listUnits(f, { ...l, unitIds: ['hero', 'tank'] }).map((u) => u.id)).toEqual(['hero', 'tank']);
  });

  it('totals the list and flags problems', () => {
    const f = force();
    const l = { ...f.lists![0], pointsLimit: 500, unitIds: ['hero', 'squad', 'tank', 'dead'] };
    expect(listTotals(f, l, DEFAULT_SETTINGS)).toMatchObject({ points: 620, units: 4, models: 12 });
    const texts = listIssues(f, l, DEFAULT_SETTINGS).map((i) => `${i.level}: ${i.text}`);
    expect(texts.some((t) => t.startsWith('error: Over the 500 pt limit by 120'))).toBe(true);
    expect(texts.some((t) => t.startsWith('error: dead has fallen'))).toBe(true);
    expect(texts.some((t) => t.includes('tank costs over 35%'))).toBe(true);
  });

  it('splits weapon AP from special rules', () => {
    expect(weaponColumns({ id: 'w', name: 'Gun', count: 1, range: 24, attacks: 4, rules: ['AP(2)', 'Rending'], traits: [] }))
      .toEqual({ ap: '2', special: ['Rending'] });
    expect(ruleName('Tough(3)')).toBe('Tough');
    expect(ruleName('Tough +3')).toBe('Tough');
  });

  it('builds the glossary from books, core rules and crusade tables', () => {
    const f = force();
    const core = interpretJson({
      rules: [{ name: 'Tough', description: 'Core tough.' }, { name: 'Fearless', description: 'Core fearless.' }, { name: 'Sniper REMOVE', description: 'x' }],
      traits: [{ name: 'Veteran', description: 'Official trait.' }],
    });
    expect(core.kind).toBe('coreRules');
    if (core.kind !== 'coreRules') return;
    expect(core.rules.map((r) => r.name)).toEqual(['Tough', 'Fearless']);
    const units = f.units.slice(0, 2).map((u) => ({ ...u, bookUid: 'b' }));
    const g = glossary(units, [book], core.rules);
    // The unit's own book wins; Hero has no description anywhere so it is left out.
    expect(g).toEqual([{ name: 'Fearless', desc: 'Core fearless.' }, { name: 'Tough', desc: 'Book tough.' }]);
  });
});
