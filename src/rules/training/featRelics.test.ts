import { beforeEach, describe, expect, it } from 'vitest';
import { RELICS } from '../data';
import { TRAINING } from '../downtimeData';
import { randomRelic } from '../relicPick';
import { newUnit } from '../../model/factory';
import { unsaved } from './harm';
import { relics, relicText, socketOf } from './relics';
import { blankRun } from './testRun';
import type { Enemy, TowerGun, TrainingRun, UnitTower } from './types';

// The Feats' own relics (Crown of the Last Lord, Colossus Splinter): never drawn at random; in Training the Crown
// sunders (AP+1 taken), the Splinter shoots; a relic pulse on the Siege colossus counts from siegeBase wounds.

const R = TRAINING.relics;
const relic = (name: string) => RELICS.find((r) => r.name === name)!;
const gun = (): TowerGun => ({
  name: 'Rifle', melee: false, range: 12, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, bane: false,
  cd: 0, pending: 0, gap: 0, next: 0,
});
let ids = 500;
function unit(names: string[]): UnitTower {
  return {
    id: ids++, x: 20, y: 30, kind: 'unit', unitId: 'u', name: 'Squad', category: 'Infantry', points: 100, rank: 0, tough: 1, size: 5, impact: 0,
    quality: 4, guns: [gun()], hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 },
    kills: 0, dealt: 0, skills: [], up: 0, cap: 3, holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0, init: 0, jumpy: false, myopic: false,
    relics: names.map((n) => ({ ...socketOf(relic(n)), cd: 0 })),
  };
}
const enemy = (o: Partial<Enemy> = {}): Enemy =>
  ({ id: ids++, kind: 'drone', x: 21.5, y: 31.5, leg: 0, hp: 100, maxHp: 100, flies: false, status: {}, dots: [], regrab: 0, ...o });

let run: TrainingRun;
beforeEach(() => {
  run = blankRun();
  run.phase = 'wave';
});

describe('feat relics', () => {
  it('are Legendary, tagged to their feat, and never in a random pool', () => {
    expect(relic('Crown of the Last Lord')).toMatchObject({ tier: 'Legendary', training: 'trainFinal50' });
    expect(relic('Colossus Splinter')).toMatchObject({ tier: 'Legendary', training: 'siege25', profile: '24", A3, AP(3), Rending' });
    const u = newUnit({ name: 'A' });
    const seen = new Set<string>();
    for (let i = 0; i < 400; i++) seen.add(randomRelic(u, 'Legendary', new Set(), () => (i + 0.5) / 400, 'x')!.name);
    expect(seen.has('Crown of the Last Lord') || seen.has('Colossus Splinter')).toBe(false);
  });

  it('the Splinter shoots; the Crown sunders, a boss first, for sunder.secs', () => {
    expect(socketOf(relic('Colossus Splinter')).act).toBe('shot');
    const s = socketOf(relic('Crown of the Last Lord'));
    expect(s.act).toBe('sunder');
    expect(relicText(s)).toContain('AP(+1)');
    const t = unit(['Crown of the Last Lord']);
    const plain = enemy();
    const boss = enemy({ kind: 'lord', x: 22, y: 31 });
    run.pieces.push(t);
    run.enemies.push(plain, boss);
    relics(run, 0.1);
    expect(boss.sunder).toBe(R.sunder.secs);
    expect(plain.sunder).toBeUndefined();
    t.relics![0].cd = 1e9;
    relics(run, R.sunder.secs + 0.1);
    expect(boss.sunder).toBeUndefined();
  });

  it('a sundered enemy saves worse: AP+1 on every hit', () => {
    const e = enemy();
    const rolls = (on: boolean) => {
      e.sunder = on ? 3 : undefined;
      let n = 0;
      for (let i = 0; i < 2000; i++) if (unsaved(run, e, 0)) n++;
      return n;
    };
    expect(rolls(true)).toBeGreaterThan(rolls(false));
  });

  it('a relic pulse on the Siege colossus counts from siegeBase wounds, not its millions', () => {
    const t = unit(['Wreck-Core Reactor']);
    const big = enemy({ hp: 1e7, maxHp: 1e7, final: true, kind: 'drone' });
    run.siege = '2026-W40';
    run.pieces.push(t);
    run.enemies.push(big);
    relics(run, 0.1);
    expect(1e7 - big.hp).toBeLessThanOrEqual(R.pulse.siegeBase);
    expect(1e7 - big.hp).toBeGreaterThan(0);
  });
});
