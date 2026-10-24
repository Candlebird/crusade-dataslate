import { beforeEach, describe, expect, it } from 'vitest';
import type { Weapon } from '../../model/types';
import { newUnit } from '../../model/factory';
import { RELICS } from '../data';
import { TRAINING } from '../downtimeData';
import { holds, holdTime, rateOf } from './combat';
import { FX_COLOR } from './harm';
import { unitTower } from './recipes';
import { relicKind, relics, relicText, resetSockets, socketOf } from './relics';
import { blankRun } from './testRun';
import type { Enemy, TowerGun, TrainingRun, UnitTower } from './types';

// Relic sockets: kinds, acts and clocks, each act going off in a wave, all of it gold.

const R = TRAINING.relics;

const gun = (o: Partial<TowerGun> = {}): TowerGun => ({
  name: 'Rifle', melee: false, range: 12, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, bane: false,
  cd: 0, pending: 0, gap: 0, next: 0, ...o,
});
const armed = { hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0 };

let ids = 100;
/** A crafted unit at (20, 30) carrying `names` (relics from the RELICS list). */
function unit(names: string[], o: Partial<UnitTower> = {}): UnitTower {
  return {
    id: ids++, x: 20, y: 30, kind: 'unit', unitId: 'u', name: 'Squad', category: 'Infantry', points: 100, rank: 0, tough: 1, size: 5, impact: 0,
    quality: 4, guns: [gun()], ...armed, boost: { ...armed.boost }, dmgBoost: { ...armed.dmgBoost }, skills: [], up: 0, cap: 3, holdLeft: 0,
    frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0, init: 0, jumpy: false, myopic: false,
    relics: names.map((n) => ({ ...socketOf(RELICS.find((r) => r.name === n)!), cd: 0 })), ...o,
  };
}
function enemy(o: Partial<Enemy> = {}): Enemy {
  return { id: ids++, kind: 'drone', x: 21.5, y: 31.5, leg: 0, hp: 100, maxHp: 100, flies: false, status: {}, dots: [], regrab: 0, ...o };
}

let run: TrainingRun;
beforeEach(() => {
  run = blankRun();
  run.phase = 'wave';
});

describe('relic kinds and sockets', () => {
  it('sorts unmapped relics by kind: banner, armour, artefact, else wargear', () => {
    expect(relicKind('Korvane Guard Standard')).toBe('banner');
    expect(relicKind('Artisan Bionics')).toBe('armour');
    expect(relicKind('Auspex Array')).toBe('artefact');
    expect(relicKind('Wreck-Core Reactor')).toBe('wargear');
    expect(relicKind('Something Nobody Wrote')).toBe('wargear');
  });

  it('gives each kind its act, a weapon relic a shot with its gun, and a mapped effect its own', () => {
    expect(socketOf({ name: 'Wreck-Core Reactor', tier: 'Rare' }).act).toBe('pulse');
    expect(socketOf({ name: 'Artisan Bionics', tier: 'Common' }).act).toBe('brace');
    expect(socketOf({ name: 'Auspex Array', tier: 'Common' }).act).toBe('mark');
    expect(socketOf({ name: 'Korvane Guard Standard', tier: 'Rare' }).act).toBe('rally');
    const eye = socketOf({ name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4)' });
    expect(eye).toMatchObject({ act: 'shot', gun: 'Terminus Eye' });
    const s = socketOf({ name: 'Unstable Matter Projector', tier: 'Rare' });
    expect(s.act).toBe('barrage');
    expect(s.effect?.kind).toBe('barrage');
  });

  it('sets the clock by rarity and act, the first go `first` of the way in', () => {
    for (const tier of ['Common', 'Rare', 'Legendary'] as const) {
      const s = socketOf({ name: 'Wreck-Core Reactor', tier });
      expect(s.every).toBe(R.cd[tier] * R.actMul.pulse);
      expect(s.cd).toBeCloseTo(s.every * R.first);
    }
    expect(socketOf({ name: 'Artisan Bionics', tier: 'Common' }).every).toBe(Math.round(R.cd.Common * R.actMul.brace * 10) / 10);
  });

  it('has words for every relic in the list', () => {
    for (const r of RELICS) expect(relicText(socketOf(r)).length).toBeGreaterThan(5);
  });
});

describe('relics going off', () => {
  it('a wargear pulse hurts nearby enemies by a share of their wounds, in gold, and restarts its clock', () => {
    const t = unit(['Wreck-Core Reactor']);
    const e = enemy();
    run.pieces.push(t);
    run.enemies.push(e);
    relics(run, 0.1);
    expect(e.hp).toBeCloseTo(100 * (1 - R.pulse.share.Rare));
    expect(run.fx.length).toBeGreaterThan(0);
    expect(run.fx.every((f) => f.color === FX_COLOR.relic)).toBe(true);
    expect(t.relics![0].cd).toBe(t.relics![0].every);
  });

  it('waits (tries again next step) with nothing in range', () => {
    const t = unit(['Wreck-Core Reactor']);
    run.pieces.push(t);
    relics(run, 0.1);
    expect(t.relics![0].cd).toBe(0);
    expect(run.fx).toHaveLength(0);
  });

  it('a weapon relic fires its own gun several times, drawn gold', () => {
    const t = unit(['Terminus Eye'], { guns: [gun(), gun({ name: 'Terminus Eye', relic: true, ap: 4 })] });
    t.relics = [{ ...socketOf({ name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4)' }), cd: 0 }];
    run.pieces.push(t);
    run.enemies.push(enemy({ hp: 1000, maxHp: 1000 }));
    relics(run, 0.1);
    expect(run.fx.length).toBeGreaterThanOrEqual(R.shot.attacks);
    expect(run.fx.every((f) => f.color === FX_COLOR.relic)).toBe(true);
  });

  it('an artefact marks every enemy in reach', () => {
    const t = unit(['Auspex Array']);
    const near = [enemy(), enemy({ x: 25, y: 31 })];
    const far = enemy({ x: 50, y: 50 });
    run.pieces.push(t);
    run.enemies.push(...near, far);
    relics(run, 0.1);
    for (const e of near) expect(e.status.mark).toBeGreaterThan(0);
    expect(far.status.mark ?? 0).toBe(0);
  });

  it('armour braces a unit that can hold: its next hold lasts brace.mul as long, then the brace is spent', () => {
    const t = unit(['Artisan Bionics'], { tough: 3, guns: [gun({ melee: true, range: 0 })] });
    run.pieces.push(t);
    relics(run, 0.1);
    expect(t.brace).toBe(R.brace.mul);
    const e = enemy({ x: 21, y: 31 });
    run.enemies.push(e);
    holds(run, 0);
    expect(t.holding).toBe(e.id);
    expect(t.holdLeft).toBeCloseTo(holdTime(run, t, e) * R.brace.mul);
    expect(t.brace).toBe(0);
  });

  it('armour on a unit that can\'t hold gives it a damage ward while it has a target', () => {
    const t = unit(['Artisan Bionics']);
    run.pieces.push(t);
    run.enemies.push(enemy());
    relics(run, 0.1);
    expect(t.brace ?? 0).toBe(0);
    expect(t.dmgBoost).toEqual({ mul: R.brace.ward, left: R.brace.secs });
  });

  it('a banner rallies towers near it once one has a target: they attack faster until it wears off', () => {
    const t = unit(['Korvane Guard Standard']);
    const other = unit([], { x: 22, y: 30 });
    run.pieces.push(t, other);
    relics(run, 0.1);
    expect(other.rush).toBeUndefined();
    run.enemies.push(enemy());
    const before = rateOf(run, other);
    relics(run, 0.1);
    expect(other.rush).toEqual({ mul: R.rally.mul, left: R.rally.secs });
    expect(rateOf(run, other)).toBeCloseTo(before * (1 + R.rally.mul));
    relics(run, R.rally.secs + 0.1);
    expect(other.rush).toBeUndefined();
  });

  it('a new wave puts every clock back to its first go', () => {
    const t = unit(['Wreck-Core Reactor', 'Auspex Array']);
    resetSockets(t);
    for (const s of t.relics!) expect(s.cd).toBeCloseTo(s.every * R.first);
  });
});

describe('crafted units carry their relics', () => {
  const w = (name: string, range: number): Weapon => ({ id: name, name, range, attacks: 1, count: 5, rules: [], traits: [] });

  it('socketed on the tower, the weapon relic its own gun marked as a relic; plain JSON', () => {
    const u = newUnit({ id: 'u', name: 'Vets', category: 'Infantry', size: 5, points: 120, weapons: [w('Rifles', 24), w('CCW', 0)] });
    u.relics = [
      { id: 'r1', name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4), Deadly(3)' },
      { id: 'r2', name: 'Korvane Guard Standard', tier: 'Rare' },
    ];
    const t = unitTower(u, 1, { x: 10, y: 10 }, 1);
    expect(t.relics?.map((s) => s.act)).toEqual(['shot', 'rally']);
    expect(t.guns.find((g) => g.name.startsWith('Terminus Eye'))?.relic).toBe(true);
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });

  it('carries no sockets without relics', () => {
    const u = newUnit({ id: 'u', name: 'Fresh', category: 'Infantry', size: 5, points: 120, weapons: [w('Rifles', 24)] });
    expect(unitTower(u, 1, { x: 10, y: 10 }, 1).relics).toBeUndefined();
  });
});
