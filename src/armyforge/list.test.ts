import { describe, expect, it } from 'vitest';
import raw from '../data/spears-of-dothea.raw.json';
import { interpretJson } from '../model/io';
import { normalizeBook } from './book';
import { MissingBooksError, listToForce } from './list';

const ARMY = 'ykNPXx5YgsdGWqJi';
const unit = (id: string, selectionId: string, selectedUpgrades: object[] = [], joinToUnit: string | null = null, combined = false) => ({
  id, armyId: ARMY, selectionId, selectedUpgrades, combined, joinToUnit, xp: 0, traits: [], notes: null,
});
const save = {
  id: 'RsEuAw2GFxTT', armyId: ARMY, armyIds: [ARMY], armyName: 'The Spears of Dothea', gameSystem: 'gf', listPoints: 780, saveVersion: 3,
  list: {
    name: 'The Spears of Dothea', pointsLimit: 1000,
    units: [
      unit('a7BtpeG', 'jJkAK'),
      unit('2_M9XA9', 'OuD2l', [{ instanceId: 'oC09eRNtG', upgradeId: 'k4o3Z', optionId: '7Jp3K' }], 'mJuFS'),
      unit('6ynjJBf', 'mJuFS', [{ instanceId: 'htoV8ptoZ', upgradeId: 'd--I7', optionId: 'iaF6D' }]),
      unit('evG8jcR', 'MziwE'),
      unit('YK_ZN6Z', 'T8zw6'),
    ],
  },
};

describe('Army Forge list import', () => {
  const book = normalizeBook(raw);

  it('recognizes a list save', () => {
    expect(interpretJson(save).kind).toBe('armyList');
  });

  it('builds a force with stats, upgrades and joins from the army book', () => {
    const f = listToForce(save, [book]);
    expect(f.name).toBe('The Spears of Dothea');
    expect(f.units.map((u) => u.unitType)).toEqual(['Flying Autocannon Commander', 'Force Commander', 'Battle Brothers', 'Spider Turret', 'Coffin Walker']);
    expect(f.units.reduce((n, u) => n + u.points, 0)).toBe(780);
    const [, cmd, bros, , walker] = f.units;
    expect(cmd.weapons.some((w) => w.name.startsWith('Plasma Burst Pistol'))).toBe(true);
    expect(bros.weapons.some((w) => w.name === 'Heavy Machinegun')).toBe(true);
    expect(walker).toMatchObject({ size: 1, tough: 6, quality: 4, defense: 3 });
    expect(f.lists).toHaveLength(1);
    expect(f.lists![0]).toMatchObject({ pointsLimit: 1000, unitIds: f.units.map((u) => u.id), joins: { [cmd.id]: bros.id } });
  });

  it('merges a combined unit into its partner', () => {
    const two = { ...save, list: { ...save.list, units: [unit('6ynjJBf', 'x1'), unit('6ynjJBf', 'x2', [], 'x1', true)] } };
    const f = listToForce(two, [book]);
    expect(f.units).toHaveLength(1);
    expect(f.units[0]).toMatchObject({ size: 10, points: 340 });
  });

  it('a combined unit brings its weapons, and a hero joined to either half joins the merged unit', () => {
    const one = listToForce({ ...save, list: { ...save.list, units: [unit('6ynjJBf', 'x1')] } }, [book]).units[0];
    const two = {
      ...save,
      list: { ...save.list, units: [unit('6ynjJBf', 'x1'), unit('6ynjJBf', 'x2', [], 'x1', true), unit('2_M9XA9', 'h', [], 'x2')] },
    };
    const f = listToForce(two, [book]);
    const [bros, hero] = f.units;
    expect(bros.weapons.map((w) => [w.name, w.count])).toEqual(one.weapons.map((w) => [w.name, w.count * 2]));
    expect(f.lists![0].joins).toEqual({ [hero.id]: bros.id });
  });

  it('asks for the army book when it is missing', () => {
    expect(() => listToForce(save, [])).toThrow(MissingBooksError);
  });
});
