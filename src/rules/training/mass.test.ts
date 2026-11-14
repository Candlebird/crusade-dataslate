import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingEnemyKind } from '../downtimeData';
import { TRAINING } from '../downtimeData';
import { blankRun } from './testRun';
import type { Enemy, TowerGun, TrainingRun, UnitTower } from './types';

// Mass (TRAINING.mass): Tough above mass.from on the datasheet turns into cleaving blows and harder hits on a lone
// enemy or a boss, never into longer holds. Scripted dice as in combat.test.ts.
const rolls: number[] = [];
vi.mock('./rng', async (orig) => ({ ...(await orig<typeof import('./rng')>()), rand: () => rolls.shift() ?? 0.99 }));
vi.mock('./economy', async (orig) => ({ ...(await orig<typeof import('./economy')>()), payKill: vi.fn() }));
vi.mock('./cards', async (orig) => ({ ...(await orig<typeof import('./cards')>()), offerCards: vi.fn() }));

const { fire, holdTime } = await import('./combat');
const { cleaveCount, isLone, loneBonus } = await import('./harm');
const { massOf } = await import('./recipes');

const M = TRAINING.mass;
const BLOW = TRAINING.unitMelee; // a unit's melee blow of 1 damage
const gun = (o: Partial<TowerGun> = {}): TowerGun => ({
  name: 'Claws', melee: true, range: 0, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, bane: false,
  cd: 0, pending: 0, gap: 0, next: 0, ...o,
});
let ids = 100;
const unit = (o: Partial<UnitTower> = {}): UnitTower => ({
  id: ids++, x: 20, y: 30, kind: 'unit', unitId: 'u', name: 'Beast', category: 'Vehicle/Monster', points: 200, rank: 0, tough: 9, size: 1, impact: 0,
  quality: 4, guns: [gun()], hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 },
  kills: 0, dealt: 0, skills: [], up: 0, cap: 3, holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0, init: 0, jumpy: false, myopic: false, ...o,
});
const enemy = (o: Partial<Enemy> = {}, kind: TrainingEnemyKind = 'drone'): Enemy =>
  ({ id: ids++, kind, x: 21.5, y: 31.5, leg: 4, hp: 10, maxHp: 10, flies: false, status: {}, dots: [], regrab: 0, ...o });

let run: TrainingRun;
beforeEach(() => {
  rolls.length = 0;
  run = blankRun();
  run.phase = 'wave';
});

describe('Mass', () => {
  it('is datasheet Tough above mass.from; cleaves one more per cleavePer (capped), and the lone bonus caps', () => {
    expect([1, 3, 4, 6, 9, 15].map(massOf)).toEqual([0, 0, 1, 3, 6, 12]);
    expect([0, 1, 3, 4, 6, 12].map(cleaveCount)).toEqual([0, 1, 1, 2, 2, Math.min(M.cleaveMax, 4)]);
    expect(loneBonus(3)).toBeCloseTo(3 * M.lone);
    expect(loneBonus(100)).toBe(M.loneMax);
  });

  it('a blow that wounds cleaves into an enemy close by for cleaveShare of the damage', () => {
    const t = unit({ mass: 3 });
    const target = enemy();
    const near = enemy({ x: 22.5, leg: 0 });
    run.pieces = [t];
    run.enemies = [target, near];
    rolls.push(0.3, 0.5, 0.5); // hit, target fails its save, the cleaved one fails its save
    fire(run, t, t.guns[0]);
    expect(target.hp).toBeCloseTo(10 - BLOW);
    expect(near.hp).toBeCloseTo(10 - BLOW * M.cleaveShare);
  });

  it('a saved blow cleaves into nothing, and shooting never cleaves', () => {
    const t = unit({ mass: 3 });
    const target = enemy();
    const near = enemy({ x: 22.5, leg: 0 });
    run.pieces = [t];
    run.enemies = [target, near];
    rolls.push(0.3, 0.2);
    fire(run, t, t.guns[0]);
    expect(target.hp).toBe(10);
    expect(near.hp).toBe(10);
    const s = unit({ mass: 3, guns: [gun({ melee: false, range: 12, name: 'Spit' })] });
    run.pieces = [s];
    rolls.push(0.3, 0.5, 0.5);
    fire(run, s, s.guns[0]);
    expect(target.hp).toBe(9);
    expect(near.hp).toBe(10);
  });

  it('hits a lone enemy (none within loneRadius) or a boss harder, any gun; a crowded one as usual', () => {
    const t = unit({ mass: 6, guns: [gun({ melee: false, range: 12, name: 'Spit' })] });
    const lone = enemy();
    run.pieces = [t];
    run.enemies = [lone];
    expect(isLone(run, lone)).toBe(true);
    rolls.push(0.3, 0.5);
    fire(run, t, t.guns[0]);
    expect(lone.hp).toBeCloseTo(10 - (1 + loneBonus(6)));
    const mate = enemy({ x: 22.5, leg: 0 });
    run.enemies = [lone, mate];
    expect(isLone(run, lone)).toBe(false);
    const before = lone.hp;
    rolls.push(0.3, 0.5);
    fire(run, t, t.guns[0]);
    expect(lone.hp).toBeCloseTo(before - 1);
    const boss = enemy({ hp: 100, maxHp: 100 }, 'lord');
    run.enemies = [boss, enemy({ x: 22.5, leg: 0 })];
    expect(isLone(run, boss)).toBe(true);
  });

  it('a unit with no Mass hits as before, and Mass never lengthens a hold', () => {
    const t = unit();
    const target = enemy();
    const near = enemy({ x: 22.5, leg: 0 });
    run.pieces = [t];
    run.enemies = [target, near];
    rolls.push(0.3, 0.5, 0.5);
    fire(run, t, t.guns[0]);
    expect(target.hp).toBeCloseTo(10 - BLOW);
    expect(near.hp).toBe(10);
    expect(holdTime(run, unit({ mass: 12 }), target)).toBe(holdTime(run, unit(), target));
  });
});
