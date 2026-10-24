import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../../model/types';
import { newUnit } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { recipesFor, unitTower } from './recipes';
import { FORCES } from './testForces';
import type { Grade, RecipeSlot } from './types';
import { adjustSlots, gritOf, rangeBonus, recordBadges, recordBudget, traitType } from './veterans';

// Living recipes: traits lift a unit's recipe, scars crack it, and what the record does reaches the tower.

const V = TRAINING.veterans;

const w = (name: string, range: number, traits: string[] = []): Weapon =>
  ({ id: name, name, range, attacks: 1, count: 5, rules: [], traits: traits.map((t, i) => ({ id: `${name}${i}`, name: t, unique: false })) });

/** A plain 120 pt squad with `traits` and `scars` on its record. */
const squad = (traits: string[] = [], scars: string[] = [], weapons = [w('Rifles', 24), w('CCW', 0)]): Unit => ({
  ...newUnit({ id: 'u', name: 'Squad', category: 'Infantry', size: 5, points: 120, weapons }),
  upgrades: traits.map((name, i) => ({ id: `t${i}`, name, unique: false })),
  scars: scars.map((name, i) => ({ id: `s${i}`, name })),
});

const slot = (type: RecipeSlot['type'], grade: number): RecipeSlot => ({ type, grade: grade as Grade });
const grades = (xs: RecipeSlot[]) => xs.map((s) => s.grade);

describe('recipe budget', () => {
  it('nets traits against scars, capped either way', () => {
    expect(recordBudget(squad(['Resilient', 'Point Blank'])).lifts).toHaveLength(2);
    expect(recordBudget(squad(['Resilient'], ['Faulty Aim', 'Weakened Armor']))).toEqual({ lifts: [], cracks: 1 });
    expect(recordBudget(squad(['Resilient', 'Point Blank', 'Blade Master', 'Fortified', 'Protected'])).lifts).toHaveLength(V.cap);
    expect(recordBudget(squad([], ['Faulty Aim', 'Weakened Armor', 'Damaged Equipment', 'Weak Spot'])).cracks).toBe(V.cap);
  });

  it('ignores scars that are not scars here (Comatose)', () => {
    expect(recordBudget(squad([], ['Comatose']))).toEqual({ lifts: [], cracks: 0 });
  });

  it('types a trait by the table, its effect, or its weapon', () => {
    expect(traitType({ name: 'Resilient', kind: 'trait' })).toBe('bulwark');
    expect(traitType({ name: 'Blade Master', kind: 'trait' })).toBe('assault');
    expect(traitType({ name: 'Some Odd Thing', kind: 'trait', weapon: 'Axe', melee: true })).toBe('assault');
    expect(traitType({ name: 'Some Odd Thing', kind: 'trait', weapon: 'Gun', melee: false })).toBe('firepower');
  });
});

describe('adjusting a recipe', () => {
  const base = [slot('firepower', 2), slot('bulwark', 2), slot('assault', 3)];

  it('a trait lifts a slot of its own type, else the lowest slot', () => {
    expect(adjustSlots(base, { lifts: ['bulwark'], cracks: 0 })).toEqual([slot('firepower', 2), slot('bulwark', 3), slot('assault', 3)]);
    expect(grades(adjustSlots(base, { lifts: ['vigor'], cracks: 0 }))).toEqual([3, 2, 3]);
    expect(grades(adjustSlots(base, { lifts: [undefined], cracks: 0 }))).toEqual([3, 2, 3]);
  });

  it('never lifts past Pristine: with every slot Pristine a trait adds a Cracked slot, up to maxSlots', () => {
    const full = [slot('firepower', 5), slot('bulwark', 5)];
    const out = adjustSlots(full, { lifts: ['vigor', 'vigor', 'vigor'], cracks: 0 });
    expect(out).toEqual([...full, slot('vigor', 3)]);
    const five = Array.from({ length: V.maxSlots }, () => slot('swift', 5));
    expect(adjustSlots(five, { lifts: ['vigor'], cracks: 0 })).toEqual(five);
    const own = adjustSlots([slot('firepower', 5), slot('bulwark', 4)], { lifts: ['firepower'], cracks: 0 });
    expect(grades(own)).toEqual([5, 5]);
  });

  it('a scar cracks the dearest slot, never below Cracked', () => {
    expect(grades(adjustSlots(base, { lifts: [], cracks: 1 }))).toEqual([2, 2, 2]);
    expect(grades(adjustSlots([slot('swift', 1)], { lifts: [], cracks: 3 }))).toEqual([1]);
  });

  it('leaves the slots it was given alone', () => {
    const copy = base.map((s) => ({ ...s }));
    adjustSlots(base, { lifts: ['bulwark', 'firepower'], cracks: 0 });
    expect(base).toEqual(copy);
  });
});

describe('recipes of a veteran force', () => {
  const sum = (xs: RecipeSlot[]) => xs.reduce((n, s) => n + s.grade, 0);

  it('stay unique within a force, dearer for veterans and cheaper for the scarred', () => {
    for (const f of FORCES) {
      const fresh = recipesFor(f.units);
      const vets = recipesFor(f.units.map((u) => ({ ...u, upgrades: [{ id: 't', name: 'Resilient', unique: false }, { id: 't2', name: 'Point Blank', unique: false }] })));
      const scarred = recipesFor(f.units.map((u) => ({ ...u, scars: [{ id: 's', name: 'Faulty Aim' }] })));
      for (const rs of [vets, scarred]) {
        const sigs = rs.map((r) => r.slots.map((s) => `${s.type}${s.grade}`).sort().join(','));
        expect(new Set(sigs).size).toBe(rs.length);
      }
      expect(vets.reduce((n, r) => n + sum(r.slots), 0)).toBeGreaterThan(fresh.reduce((n, r) => n + sum(r.slots), 0));
      expect(scarred.reduce((n, r) => n + sum(r.slots), 0)).toBeLessThan(fresh.reduce((n, r) => n + sum(r.slots), 0));
    }
  });
});

describe('what the record does on the tower', () => {
  it('grit: longer holds, more Tough, more damage for each lift, less for each crack', () => {
    expect(gritOf(squad())).toEqual({ hold: 1, tough: 0, atk: 0, init: 0 });
    const vet = gritOf(squad(['Resilient', 'Tough +3']));
    expect(vet.hold).toBeCloseTo(1 + V.grit.Resilient.hold!);
    expect(vet.tough).toBe(3);
    expect(vet.atk).toBeCloseTo(2 * V.liftDmg);
    const scar = gritOf(squad([], ['Weakened Armor']));
    expect(scar.hold).toBeCloseTo(1 + V.grit['Weakened Armor'].hold!);
    expect(scar.atk).toBeCloseTo(-V.crackDmg);
  });

  it('reaches the tower: Tough, damage, hold share; +6" range adds reach', () => {
    const fresh = unitTower(squad(), 1, { x: 0, y: 0 }, 1);
    const vet = unitTower(squad(['Tough +3', 'Resilient'], [], [w('Rifles', 24, ['+6" range']), w('CCW', 0)]), 1, { x: 0, y: 0 }, 1);
    expect(vet.tough).toBe(fresh.tough + 3);
    expect(vet.atkBonus).toBeGreaterThan(fresh.atkBonus);
    expect(vet.grit).toBeCloseTo(1 + V.grit.Resilient.hold!);
    expect(fresh.grit).toBeUndefined();
    const rifle = (t: typeof vet) => t.guns.find((g) => g.name.startsWith('Rifles'))!.range;
    expect(rifle(vet) - rifle(fresh)).toBe(V.rangeTrait);
    expect(rangeBonus(squad([], [], [w('Rifles', 24, ['+6" range', '+6" range'])]), 'Rifles')).toBe(2 * V.rangeTrait);
  });

  it('badges every trait and scar with its type and what it does here', () => {
    const u = squad(['Resilient', 'Blade Master'], ['Faulty Aim'], [w('Rifles', 24, ['Rending'])]);
    const b = recordBadges(u);
    expect(b.map((x) => x.name)).toEqual(['Resilient', 'Blade Master', 'Rending (Rifles)', 'Faulty Aim']);
    expect(b.map((x) => x.kind)).toEqual(['trait', 'trait', 'trait', 'scar']);
    expect(b[0].type).toBe('bulwark');
    expect(b[3].type).toBeUndefined();
    for (const x of b) expect(x.text.length).toBeGreaterThan(3);
  });
});
