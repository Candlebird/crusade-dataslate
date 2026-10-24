import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Effect } from '../abilities';
import type { TrainingEnemyKind } from '../downtimeData';
import { TRAINING } from '../downtimeData';
import { blankRun } from './testRun';
import type { Enemy, ShardPiece, TowerGun, TrainingRun, UnitTower } from './types';

// Scripted dice: each rand() takes the next roll queued (0.99 once they run out: a miss, a save made, no chance).
const rolls: number[] = [];
vi.mock('./rng', async (orig) => ({ ...(await orig<typeof import('./rng')>()), rand: () => rolls.shift() ?? 0.99 }));
vi.mock('./economy', async (orig) => ({ ...(await orig<typeof import('./economy')>()), payKill: vi.fn() }));
vi.mock('./cards', async (orig) => ({ ...(await orig<typeof import('./cards')>()), offerCards: vi.fn() }));

const { abilities, afflict, auras, fire, fireAll, holds, holdTime, hurt, reach, reap, regrabTime, targetFor, tickEnemies } = await import('./combat');
const { dmgMul, toGo } = await import('./harm');
const { payKill } = await import('./economy');
const { offerCards } = await import('./cards');

const gun = (o: Partial<TowerGun> = {}): TowerGun => ({
  name: 'Rifle', melee: false, range: 12, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, bane: false,
  cd: 0, pending: 0, gap: 0, next: 0, ...o,
});
const armed = { hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0 };

let ids = 100;
function unit(o: Partial<UnitTower> = {}, skills: Effect[] = []): UnitTower {
  return {
    id: ids++, x: 20, y: 30, kind: 'unit', unitId: 'u', name: 'Squad', category: 'Infantry', points: 100, rank: 0, tough: 1, size: 5, impact: 0,
    quality: 4, guns: [gun()], ...armed, boost: { ...armed.boost }, dmgBoost: { ...armed.dmgBoost },
    skills: skills.map((effect) => ({ source: 'x', effect, cd: 0 })), up: 0, cap: 3, holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0,
    init: 0, jumpy: false, myopic: false, ...o,
  };
}
function shard(o: Partial<ShardPiece> = {}): ShardPiece {
  return { id: ids++, x: 20, y: 30, kind: 'shard', type: 'firepower', grade: 1, draft: false, quality: 4, guns: [gun()], ...armed, boost: { ...armed.boost }, dmgBoost: { ...armed.dmgBoost }, ...o };
}
function enemy(o: Partial<Enemy> = {}, kind: TrainingEnemyKind = 'drone'): Enemy {
  return { id: ids++, kind, x: 24.5, y: 31.5, leg: 0, hp: 10, maxHp: 10, flies: false, status: {}, dots: [], regrab: 0, ...o };
}

let run: TrainingRun;
beforeEach(() => {
  rolls.length = 0;
  run = blankRun();
  run.phase = 'wave';
  vi.mocked(payKill).mockClear();
  vi.mocked(offerCards).mockClear();
});

describe('reach and targeting', () => {
  it('reaches inches by rangeMul as cells, plus levels and boosts; melee reaches meleeReach', () => {
    expect(reach(unit({ up: 2 }), gun({ range: 12 }))).toBe(12 * TRAINING.rangeMul + 2 * TRAINING.levels.range);
    expect(reach(unit({ up: 2 }), gun({ melee: true, range: 0 }))).toBe(TRAINING.meleeReach);
  });
  it('aims at the enemy in reach furthest along the route', () => {
    const t = unit();
    const near = enemy({ leg: 0 });
    const ahead = enemy({ leg: 4, x: 22.5, y: 33.5 });
    const out = enemy({ leg: 5, x: 50.5, y: 50.5 });
    run.pieces = [t];
    run.enemies = [near, ahead, out];
    expect(toGo(run, ahead)).toBeLessThan(toGo(run, near));
    expect(targetFor(run, t, t.guns[0])).toBe(ahead);
  });
});

describe('fire: OPR rolls', () => {
  it('hits on Quality+, wounds through a failed save', () => {
    const t = unit();
    const e = enemy();
    run.pieces = [t];
    run.enemies = [e];
    rolls.push(0.3, 0.5); // hit on 4+ (p 0.5), save on 5+ fails
    expect(fire(run, t, t.guns[0])).toBe(true);
    expect(e.hp).toBe(9);
    expect(t.dealt).toBe(1);
  });
  it('a made save stops it; AP makes it harder', () => {
    const t = unit();
    const e = enemy();
    run.pieces = [t];
    run.enemies = [e];
    rolls.push(0.3, 0.2);
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(10);
    t.guns[0].ap = 1;
    rolls.push(0.3, 0.2);
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(9);
  });
  it('a shot at an enemy in cover is at -1, and the miss shows as blocked; melee ignores cover', () => {
    const t = unit();
    const e = enemy();
    run.pieces = [t];
    run.enemies = [e];
    run.cover = [{ x: 22, y: 30 }];
    rolls.push(0.4);
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(10);
    expect(run.fx[run.fx.length - 1]?.blocked).toBe(true);
    const m = unit({ guns: [gun({ melee: true, range: 0 })] });
    e.x = 22.5;
    rolls.push(0.4, 0.5);
    fire(run, m, m.guns[0]);
    expect(e.hp).toBe(9);
  });
  it('Deadly sets the damage; armour takes off; marks add', () => {
    const t = unit({ guns: [gun({ deadly: 3 })] });
    const e = enemy({}, 'carapace');
    run.pieces = [t];
    run.enemies = [e];
    rolls.push(0.3, 0.9);
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(8); // 3 − armour 1
    e.status.mark = 1;
    rolls.push(0.3, 0.9);
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(5);
  });
  it('Rending: a 6 to hit is AP 4 and ignores armour', () => {
    const t = unit({ guns: [gun({ rending: true })] });
    const e = enemy({}, 'carapace');
    run.pieces = [t];
    run.enemies = [e];
    rolls.push(0.05, 0.01); // a 6; even a 1-in-100 save roll fails at AP 4
    fire(run, t, t.guns[0]);
    expect(e.hp).toBe(9);
  });
  it('Blast spills onto up to X−1 others close by', () => {
    const t = unit({ guns: [gun({ blast: 3 })] });
    const es = [enemy(), enemy({ x: 25.5 }), enemy({ x: 24.5, y: 32.5 }), enemy({ x: 25.5, y: 32.5 })];
    run.pieces = [t];
    run.enemies = es;
    rolls.push(0.3, 0.9, 0.9, 0.9);
    fire(run, t, t.guns[0]);
    expect(es.filter((e) => e.hp < 10)).toHaveLength(3);
  });
  it('mirrorshell takes 40% from shots; a kill pays and credits the tower; a boss kill offers cards', () => {
    const t = unit();
    const m = enemy({}, 'mirror');
    hurt(run, t, m, 5, 'shot');
    expect(m.hp).toBeCloseTo(8);
    const e = enemy({ hp: 1 });
    hurt(run, t, e, 2, 'shot');
    expect(t.kills).toBe(1);
    expect(payKill).toHaveBeenCalledTimes(1);
    expect(offerCards).not.toHaveBeenCalled();
    hurt(run, t, enemy({ hp: 1 }, 'lord'), 2, 'shot');
    expect(offerCards).toHaveBeenCalledTimes(1);
  });
  it('onHit skills and Shard rules leave statuses on a wound', () => {
    const t = unit({}, [{ kind: 'onHit', status: 'stun', chance: 1 }]);
    const e = enemy();
    run.pieces = [t];
    run.enemies = [e];
    rolls.push(0.3, 0.9, 0.1);
    fire(run, t, t.guns[0]);
    expect(e.status.stun).toBe(TRAINING.status.stun);
    const s = shard({ type: 'swift' });
    rolls.push(0.3, 0.9, 0.1);
    fire(run, s, s.guns[0]);
    expect(e.status.slow).toBe(TRAINING.status.slow);
  });
});

describe('statuses and dots', () => {
  it('execute finishes off a weak enemy, never the boss', () => {
    const t = unit();
    const e = enemy({ hp: 2 });
    afflict(run, t, e, 'execute');
    expect(e.hp).toBeLessThanOrEqual(0);
    const lord = enemy({ hp: 2, maxHp: 100 }, 'lord');
    afflict(run, t, lord, 'execute');
    expect(lord.hp).toBe(2);
  });
  it('knock pushes a walker back up its route', () => {
    const e = enemy({ leg: 1, x: 20.5, y: 24.5 });
    const before = toGo(run, e);
    afflict(run, unit(), e, 'knock');
    expect(toGo(run, e)).toBeGreaterThan(before);
  });
  it('a bleed is a dot credited to its tower, worn down by tickEnemies', () => {
    const t = unit();
    const e = enemy();
    run.pieces = [t];
    run.enemies = [e];
    afflict(run, t, e, 'bleed');
    for (let i = 0; i < 20; i++) tickEnemies(run, 0.05);
    expect(e.hp).toBeCloseTo(10 - TRAINING.bleedDps);
    expect(t.dealt).toBeCloseTo(TRAINING.bleedDps);
    for (let i = 0; i < 60; i++) tickEnemies(run, 0.05);
    expect(e.dots).toHaveLength(0);
    expect(e.status.bleed).toBeUndefined();
  });
});

describe('holds', () => {
  it('holds 0.3 s a Tough, up to 1.5; big ones half as long; never flyers, Aircraft or datasheet Tough 1', () => {
    expect(holdTime(run, unit({ tough: 3 }), enemy())).toBeCloseTo(0.9);
    expect(holdTime(run, unit({ tough: 9 }), enemy())).toBeCloseTo(1.5);
    expect(holdTime(run, unit({ tough: 9 }), enemy({}, 'brute'))).toBeCloseTo(0.75);
    expect(holdTime(run, unit({ tough: 3 }), enemy({ flies: true }))).toBe(0);
    expect(holdTime(run, unit({ tough: 3, category: 'Aircraft' }), enemy())).toBe(0);
    expect(holdTime(run, unit({ tough: 2, up: 1 }), enemy())).toBe(0);
  });
  it('re-grab waits 3 s at Defense 6+, down to 1.5 s at 2+', () => {
    expect(regrabTime(run, enemy({}, 'swarm'))).toBeCloseTo(3);
    expect(regrabTime(run, enemy({}, 'carapace'))).toBeCloseTo(2.25);
  });
  it('grabs one walker in reach, lets go after the hold, and can\'t grab it again until the cooldown ends', () => {
    const t = unit({ tough: 3 });
    const a = enemy({ x: 22.5 });
    const b = enemy({ x: 22.5, y: 30.5 });
    run.pieces = [t];
    run.enemies = [a, b];
    holds(run, 0.05);
    expect(t.holding).toBeDefined();
    const held = run.enemies.find((e) => e.id === t.holding)!;
    expect(held.heldBy).toBe(t.id);
    expect(run.enemies.filter((e) => e.heldBy !== undefined)).toHaveLength(1);
    for (let i = 0; i < 18; i++) holds(run, 0.05);
    expect(t.holding === undefined || t.holding !== held.id).toBe(true);
    expect(held.heldBy).toBeUndefined();
    expect(held.regrab).toBeCloseTo(regrabTime(run, held));
  });
  it('thorns hurt the held enemy; lastStand hits harder while holding', () => {
    const t = unit({ tough: 6 }, [{ kind: 'thorns', n: 1, chance: 0.5 }, { kind: 'lastStand', mul: 1.5 }]);
    const e = enemy({ x: 22.5 });
    run.pieces = [t];
    run.enemies = [e];
    expect(dmgMul(t)).toBe(1);
    for (let i = 0; i < 20; i++) holds(run, 0.05);
    expect(e.hp).toBeLessThan(10);
    expect(dmgMul(t)).toBe(1.5);
  });
  it('reap drops the dead and frees the unit that held them', () => {
    const t = unit({ tough: 3 });
    const e = enemy({ x: 22.5 });
    run.pieces = [t];
    run.enemies = [e];
    holds(run, 0.05);
    e.hp = 0;
    reap(run);
    expect(run.enemies).toHaveLength(0);
    expect(t.holding).toBeUndefined();
  });
});

describe('skills and auras', () => {
  it('a shield gives another tower +n × 10% damage for a round, which wears off', () => {
    const t = unit({}, [{ kind: 'shield', n: 2, every: 2 }]);
    const o = shard({ x: 30 });
    run.pieces = [t, o];
    abilities(run, 0.05);
    expect(o.dmgBoost.mul).toBeCloseTo(0.2);
    expect(dmgMul(o)).toBeCloseTo(1.2);
    auras(run, TRAINING.abilityRound);
    expect(dmgMul(o)).toBe(1);
  });
  it('a heal is a bleed field on enemies within reach of it', () => {
    const t = unit({}, [{ kind: 'heal', n: 1, every: 1 }]);
    const near = enemy({ x: 22.5 });
    const far = enemy({ x: 30.5 });
    run.pieces = [t];
    run.enemies = [near, far];
    abilities(run, 0.05);
    expect(near.dots).toHaveLength(1);
    expect(far.dots).toHaveLength(0);
  });
  it('a Hero gives +1 to hit near it; a death-blast makes a kill near it explode', () => {
    const h = unit({ category: 'Hero' }, [{ kind: 'deathBlast', dmg: 4, radius: 2 }]);
    const o = shard({ x: 24 });
    run.pieces = [h, o];
    auras(run, 0.05);
    expect(o.boost.hit).toBe(1);
    const dead = enemy({ hp: 1, x: 22.5 });
    const by = enemy({ x: 23.5 });
    run.enemies = [dead, by];
    hurt(run, o, dead, 5, 'shot');
    expect(by.hp).toBe(6);
  });
});

describe('fireAll volleys', () => {
  it('spreads a volley over the first part of the wait, then waits', () => {
    const t = unit({ guns: [gun({ attacks: 3 })] });
    run.pieces = [t];
    run.enemies = [enemy({ hp: 999, maxHp: 999 })];
    // Steps of a 40th of the wait (TRAINING.shootEvery): the volley in the first half, the next one from the 40th on.
    const dt = TRAINING.shootEvery / 40;
    for (let i = 0; i < 20; i++) fireAll(run, dt);
    expect(run.fx).toHaveLength(3);
    for (let i = 0; i < 18; i++) fireAll(run, dt);
    expect(run.fx).toHaveLength(3);
    for (let i = 0; i < 4; i++) fireAll(run, dt);
    expect(run.fx.length).toBeGreaterThan(3);
  });
});
