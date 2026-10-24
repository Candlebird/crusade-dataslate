import { describe, expect, it } from 'vitest';
import { hurt } from './harm';
import { holds } from './holds';
import { beastOf, noteMet } from './tally';
import { blankRun, testEnemy, testUnit } from './testRun';
import { spawnOne } from './waves';

// The run's tallies for the Sortie layer: what units did, who hit a boss, Echoes met and slain.

describe('tally', () => {
  it('counts a unit’s shots and blows, and kills into the bestiary', () => {
    const run = blankRun();
    const t = testUnit();
    run.pieces.push(t);
    const e = testEnemy({ hp: 10, maxHp: 10 });
    run.enemies.push(e);
    hurt(run, t, e, 4, 'shot');
    hurt(run, t, e, 3, 'melee');
    hurt(run, t, e, 9, 'shot');
    expect(t.tally).toEqual({ shot: 7, melee: 3, holds: 0 });
    expect(run.beasts?.drone).toMatchObject({ slain: 1 });
  });

  it('notes who hit a boss', () => {
    const run = blankRun();
    const t = testUnit({ unitId: 'a' });
    const e = testEnemy({ kind: 'lord' });
    hurt(run, t, e, 2, 'shot');
    hurt(run, undefined, e, 2, 'other');
    expect(run.watch?.[String(e.id)]).toEqual({ passed: [], hit: ['a'] });
  });

  it('meets each kind once a wave, and a nemesis as itself', () => {
    const run = blankRun();
    run.wave = 1;
    noteMet(run, testEnemy());
    noteMet(run, testEnemy());
    run.wave = 2;
    noteMet(run, testEnemy());
    expect(run.beasts?.drone.met).toBe(2);
    const n = spawnOne(run, { kind: 'lord', at: 0, leg: 0, x: 1, y: 1, hp: 50, flies: false, nemesis: true });
    expect(beastOf(n)).toBe('nemesis');
    expect(run.beasts?.nemesis.met).toBe(1);
  });

  it('marks the nemesis slain', () => {
    const run = blankRun();
    run.nemesis = { id: 'butcher', name: 'Gorrhul', grudge: 1, rematch: 0, sig: 'rage', sigName: 'Mounting Rage' };
    const e = testEnemy({ kind: 'lord', hp: 5, nem: { born: 0, speed: 1, hard: 0, next: 0, regen: 0 } });
    hurt(run, undefined, e, 10, 'other');
    expect(run.nemesis.slain).toBe(true);
    expect(run.beasts?.nemesis.slain).toBe(1);
  });

  it('counts holds', () => {
    const run = blankRun();
    run.phase = 'wave';
    const t = testUnit({ tough: 3 });
    run.pieces.push(t);
    run.enemies.push(testEnemy({ x: 20.5, y: 30.5 }));
    holds(run, 0.05);
    expect(t.tally?.holds).toBe(1);
  });

  it('names the unit that slays the nemesis or a real lord (records.ts), none for other harm', () => {
    const run = blankRun();
    const t = testUnit({ unitId: 'a' });
    run.nemesis = { id: 'butcher', name: 'Gorrhul', grudge: 1, rematch: 0, sig: 'rage', sigName: 'Mounting Rage' };
    run.nexus = { threat: 1, affixes: [], lords: [{ key: 'g', name: 'Vex', tier: 'Rare', trick: 'ward', from: 'guardian' }, { key: 'h', name: 'Ool', tier: 'Rare', trick: 'ward', from: 'guardian' }] } as unknown as typeof run.nexus;
    const nem = testEnemy({ kind: 'lord', hp: 1, maxHp: 1, nem: {} as never });
    const lord = testEnemy({ kind: 'lord', hp: 1, maxHp: 1, lord: { i: 0, next: 0, ward: 0, burst: 0 } });
    const other = testEnemy({ kind: 'lord', hp: 1, maxHp: 1, lord: { i: 1, next: 0, ward: 0, burst: 0 } });
    run.enemies.push(nem, lord, other);
    hurt(run, t, nem, 5, 'shot');
    hurt(run, t, lord, 5, 'melee');
    hurt(run, undefined, other, 5, 'other');
    expect(run.nemesis).toMatchObject({ slain: true, by: 'a' });
    expect(run.nexus!.lords[0]).toMatchObject({ slain: true, by: 'a' });
    expect(run.nexus!.lords[1].slain).toBe(true);
    expect(run.nexus!.lords[1].by).toBeUndefined();
  });
});
