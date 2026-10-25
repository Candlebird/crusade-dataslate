import { describe, expect, it } from 'vitest';
import type { Weapon } from '../../model/types';
import { newUnit } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { levelCost, trainPoints } from './economy';
import { recipesFor, unitTower } from './recipes';
import { createRun } from './run';

// Immobile units and Fortifications are priced in Training as if their points were immobileSurcharge times higher.

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });
const weapons = () => [gun('Heavy Cannon', 36, 2, 1, ['AP(2)']), gun('Twin MG', 24, 3, 1, ['AP(1)'])];

describe('Immobile surcharge', () => {
  const S = TRAINING.immobileSurcharge;
  const bunker = newUnit({ id: 'b', name: 'Bunker', category: 'Fortification', tough: 6, defense: 2, points: 160, rules: ['Immobile', 'Tough(6)'], weapons: weapons() });
  const twin = newUnit({ id: 't', name: 'Walker', category: 'Vehicle/Monster', tough: 6, defense: 2, points: 160 * S, rules: ['Tough(6)'], weapons: weapons() });
  const plain = newUnit({ id: 'p', name: 'Walker', category: 'Vehicle/Monster', tough: 6, defense: 2, points: 160, rules: ['Tough(6)'], weapons: weapons() });

  it('counts an Immobile unit (or a Fortification) at the surcharge, any other at its points', () => {
    expect(trainPoints(bunker)).toBeCloseTo(160 * S);
    expect(trainPoints({ ...plain, rules: ['Immobile'] })).toBeCloseTo(160 * S);
    expect(trainPoints({ ...plain, category: 'Fortification' })).toBeCloseTo(160 * S);
    expect(trainPoints(plain)).toBe(160);
    expect(bunker.points).toBe(160);
  });

  it('prices an Immobile unit\'s recipe, level cap and level costs as a mobile one costing that much more', () => {
    const grades = (u: typeof bunker) => recipesFor([u])[0].slots.map((s) => s.grade).sort();
    expect(grades(bunker)).toEqual(grades(twin));
    expect(recipesFor([bunker])[0].points).toBe(160);
    const a = unitTower(bunker, 1, { x: 0, y: 0 }, 0);
    const b = unitTower(twin, 2, { x: 0, y: 0 }, 0);
    expect(a.points).toBe(160);
    expect(a.cap).toBe(b.cap);
    for (let up = 0; up < 3; up++) expect(levelCost({ ...a, up })).toBe(levelCost({ ...b, up }));
    expect(levelCost(a)).toBeGreaterThan(levelCost(unitTower(plain, 3, { x: 0, y: 0 }, 0)));
  });

  it('gives the waves the surcharged power', () => {
    expect(createRun('f', [bunker], 1).power).toBeCloseTo(createRun('f', [twin], 1).power);
  });
});
