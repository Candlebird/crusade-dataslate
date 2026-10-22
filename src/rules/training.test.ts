import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../model/types';
import { newUnit } from '../model/factory';
import { TRAINING, TRAINING_ENEMIES } from './downtimeData';
import {
  BASE, buyUpgrade, createRun, liftTower, placeTower, planWave, squadPower, startWave, step, upgradeCost, waveCredits, type TrainingRun,
} from './training';

// Training sim (tower defense).

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });

function squad(): Unit[] {
  return [
    newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
    newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
    newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', size: 1, tough: 6, quality: 4, defense: 2, points: 210, rules: ['Tough(6)', 'Impact(3)'], weapons: [gun('Cannon', 30, 1, 1, ['AP(2)', 'Blast(3)', 'Deadly(3)']), gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
    newUnit({ id: 'elite', name: 'Veterans', category: 'Elite', size: 5, quality: 3, defense: 4, points: 150, weapons: [gun('Plasma', 18, 1, 5, ['AP(2)'])] }),
    newUnit({ id: 'bunker', name: 'Bunker', category: 'Fortification', size: 1, tough: 6, quality: 4, defense: 2, points: 90, weapons: [gun('Twin MG', 24, 4, 1)] }),
  ];
}

/** Stand the squad in a ring two tiles out, heavier on the favoured side. */
function placeAll(run: TrainingRun) {
  const spots = [[0, -2], [2, 0], [0, 2], [-2, 0], [1, -1], [-1, 1], [1, 1], [-1, -1]];
  run.towers.filter((t) => !t.dead).forEach((t, i) => {
    if (t.category === 'Fortification' && t.x >= 0 && t.placedAt < run.wave) return;
    const [dx, dy] = spots[i];
    placeTower(run, t.unitId, BASE.tile + dx, BASE.tile + dy);
  });
}

/** Auto-play without buying anything. */
function holdOut(units: Unit[], seed: number) {
  const run = createRun(units, seed);
  const power = squadPower(units);
  while (run.phase !== 'over' && run.wave < 40) {
    placeAll(run);
    startWave(run, power);
    while (run.phase === 'wave') step(run, 0.05);
  }
  return run;
}

/** Auto-play: buy upgrades as soon as they're affordable, damage first, spread round the squad. */
function play(units: Unit[], seed: number, maxWaves = 40) {
  const run = createRun(units, seed);
  const power = squadPower(units);
  let i = 0;
  const kinds = ['dmg', 'rate', 'hp', 'range'] as const;
  while (run.phase !== 'over' && run.wave < maxWaves) {
    placeAll(run);
    startWave(run, power);
    while (run.phase === 'wave') {
      step(run, 0.05);
      const live = run.towers.filter((t) => t.x >= 0 && !t.dead);
      if (run.phase === 'wave' && live.length && Math.floor(run.credits) >= upgradeCost(run.bought)) {
        buyUpgrade(run, live[i % live.length].unitId, kinds[Math.floor(i / live.length) % 4]);
        i++;
      }
    }
  }
  return run;
}

describe('training', () => {
  it('is the same run from the same seed', () => {
    const a = play(squad(), 7);
    const b = play(squad(), 7);
    expect(a.cleared).toBe(b.cleared);
    expect(a.credits).toBe(b.credits);
  });

  it('sends Scouts and Ambushers in from the far side', () => {
    const run = createRun(squad(), 3);
    run.dir = 0; // from the north: y small
    for (let w = 3; w < 9; w++) {
      for (const s of planWave(run, 3000, w)) {
        const spawn = TRAINING_ENEMIES[s.kind].spawn;
        if (spawn === 'scout' || spawn === 'ambush') expect(s.y).toBeGreaterThan(BASE.y);
      }
    }
    const main = planWave(run, 3000, 6).filter((s) => TRAINING_ENEMIES[s.kind].spawn === 'main');
    const north = main.filter((s) => s.y < BASE.y).length / main.length;
    expect(north).toBeGreaterThan(0.6);
    expect(north).toBeLessThan(1);
  });

  it('drops about upgradesPerWave upgrades a wave', () => {
    for (const w of [1, 4, 9]) {
      const n = TRAINING.upgradesPerWave * (w - 1);
      const costs = Array.from({ length: TRAINING.upgradesPerWave }, (_, i) => upgradeCost(n + i));
      expect(waveCredits(w)).toBe(costs.reduce((a, b) => a + b, 0));
    }
    expect(upgradeCost(1)).toBeGreaterThan(upgradeCost(0));
    const run = createRun(squad(), 1);
    const plan = planWave(run, squadPower(squad()), 4);
    expect(plan.reduce((n, s) => n + s.credits, 0)).toBeCloseTo(waveCredits(4));
  });

  it('caps XP at 3 a run and keeps what a fallen unit earned', () => {
    // A run long enough to reach the cap.
    let run = play(squad(), 0);
    for (let seed = 1; seed < 50 && run.cleared < TRAINING.xpEvery * TRAINING.xpCap; seed++) run = play(squad(), seed);
    expect(run.phase).toBe('over');
    for (const t of run.towers) expect(t.xp).toBeLessThanOrEqual(TRAINING.xpCap);
    expect(run.towers.some((t) => t.xp === TRAINING.xpCap)).toBe(true);
  });

  it('keeps Fortifications where they stand once a wave has started', () => {
    const run = createRun(squad(), 2);
    placeTower(run, 'bunker', 5, 5);
    placeTower(run, 'bunker', 6, 5); // still free to move
    expect(() => placeTower(run, 'inf', BASE.tile, BASE.tile)).toThrow(/base/);
    expect(() => placeTower(run, 'inf', 0, 4)).toThrow(/outer ring/);
    startWave(run, 500);
    expect(() => placeTower(run, 'inf', 4, 4)).toThrow(/between waves/);
    run.phase = 'setup';
    expect(() => placeTower(run, 'bunker', 7, 5)).toThrow(/Fortifications/);
    expect(() => liftTower(run, 'bunker')).toThrow(/Fortifications/);
  });

  it('ends when the base falls', () => {
    const run = createRun(squad(), 5);
    placeTower(run, 'hero', 1, 1);
    startWave(run, 50000);
    for (let i = 0; i < 20000 && run.phase === 'wave'; i++) step(run, 0.05);
    expect(run.phase).toBe('over');
    expect(run.baseHp === 0 || run.towers.every((t) => t.dead || t.x < 0)).toBe(true);
    expect(run.log[run.log.length - 1]).toMatch(/falls/);
  });

  it('balance: a typical squad falls around wave 4 without upgrades and reaches about wave 12 with them', () => {
    const bare = Array.from({ length: 20 }, (_, i) => holdOut(squad(), 100 + i).cleared).sort((a, b) => a - b);
    const results = Array.from({ length: 20 }, (_, i) => play(squad(), 100 + i).cleared).sort((a, b) => a - b);
    if (process.env.TRAINING_BALANCE) console.log('waves cleared, no upgrades', bare.join(' '), '/ with upgrades', results.join(' '));
    expect(bare[10]).toBeGreaterThanOrEqual(2);
    expect(bare[10]).toBeLessThanOrEqual(4);
    expect(results[2]).toBeGreaterThanOrEqual(3);
    const median = results[10];
    expect(median).toBeGreaterThanOrEqual(9);
    expect(median).toBeLessThanOrEqual(14);
  });
});
