import { describe, expect, it } from 'vitest';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import {
  applyLevel, buyLevel, buyLuck, buyMend, killCredits, levelCap, levelCost, levelProblem, luckCost, luckProblem, mendCost,
  mendProblem, payKill, waveCredits,
} from './economy';
import { blankRun } from './testRun';
import type { Enemy, UnitTower } from './types';

// Credits in and out.

const unit = (points: number, up = 0): UnitTower => ({
  id: 9, x: 20, y: 20, kind: 'unit', unitId: 'u', name: 'Squad', category: 'Infantry' as UnitTower['category'], points, rank: 0,
  tough: 1, size: 1, impact: 0, skills: [], up, cap: levelCap(points), holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0,
  init: 0, jumpy: false, myopic: false, quality: 4, guns: [], hitShoot: 0, hitMelee: 0, atkBonus: 1,
  boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0,
});

const enemy = (kind: Enemy['kind']): Enemy => ({ id: 1, kind, x: 0, y: 0, leg: 0, hp: 1, maxHp: 1, flies: false, status: {}, dots: [], regrab: 0 });

describe('levels', () => {
  it('caps by points', () => {
    expect([50, 100, 101, 200, 250, 350, 401, 900].map(levelCap)).toEqual([5, 5, 4, 4, 3, 2, 1, 1]);
  });

  it('cost slides with points (×1.1) and grows with level, never under minCost', () => {
    // 30 a 100 pts × 1.1: a 50-pt unit's first level 16.5 → 17, a 200-pt unit's 66.
    expect([50, 100, 200, 300].map((p) => levelCost(unit(p)))).toEqual([17, 33, 66, 99]);
    expect(levelCost(unit(300, 1))).toBe(Math.round(99 * TRAINING.levels.growth));
    expect(levelCost(unit(5))).toBe(TRAINING.levels.minCost);
    expect(levelCost({ ...unit(100), price: 112.5 })).toBe(37); // the Immobile surcharge (immobile.test.ts)
  });

  it('buys a level: credits, up and Tough; stops at the cap', () => {
    const run = blankRun();
    const t = unit(450);
    run.pieces.push(t);
    expect(levelProblem(run, t.id)).toMatch(/credits/);
    run.credits = 1000;
    buyLevel(run, t.id);
    expect(t).toMatchObject({ up: 1, tough: 2 });
    expect(run.credits).toBe(1000 - 149); // 30 × 4.5 × 1.1 = 148.5
    expect(levelProblem(run, t.id)).toMatch(/cap/);
    expect(applyLevel(t)).toBe(false);
    expect(() => buyLevel(run, t.id)).toThrow();
    expect(levelProblem(run, 12345)).not.toBeNull();
    run.phase = 'wave';
    expect(levelProblem(run, t.id)).not.toBeNull();
  });
});

describe('luck', () => {
  it('climbs 0..10 for its costs', () => {
    const run = blankRun();
    run.credits = 10000;
    let spent = 0;
    for (const c of TRAINING.shards.luckCost) {
      expect(luckCost(run)).toBe(c);
      buyLuck(run);
      spent += c;
    }
    expect(run.luck).toBe(TRAINING.shards.luckCost.length);
    expect(run.credits).toBe(10000 - spent);
    expect(luckCost(run)).toBeNull();
    expect(luckProblem(run)).not.toBeNull();
  });
});

describe('mending', () => {
  it('adds HP up to the full base, each mend dearer', () => {
    const run = blankRun();
    run.credits = 1000;
    expect(mendProblem(run)).toMatch(/whole/);
    run.baseHp = TRAINING.baseHp - 2;
    const first = mendCost(run);
    buyMend(run);
    expect(run.baseHp).toBe(TRAINING.baseHp);
    expect(run.mends).toBe(1);
    expect(mendCost(run)).toBeGreaterThan(first);
    run.baseHp = 1;
    run.phase = 'wave';
    expect(mendProblem(run)).not.toBeNull();
  });
});

describe('credits', () => {
  it('pays kills by cost, with the bounty', () => {
    expect(killCredits(enemy('swarm'))).toBe(1 / TRAINING.wave.crowd);
    const lord = TRAINING_ENEMIES.lord.cost * TRAINING.credits.perCost;
    expect(killCredits(enemy('lord'))).toBe(lord);
    const run = blankRun();
    run.mods.bounty = 1.25;
    payKill(run, enemy('lord'));
    expect(run.credits).toBeCloseTo(lord * 1.25, 6);
  });

  it('pays a wave bonus, and more with no leaks', () => {
    const run = blankRun();
    const C = TRAINING.credits;
    run.wave = 4;
    expect(waveCredits(run)).toBe(C.wave + 4 * C.perWave + C.noLeak);
    run.leaked = 2;
    expect(waveCredits(run)).toBe(C.wave + 4 * C.perWave);
  });
});
