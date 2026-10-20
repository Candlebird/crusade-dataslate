import { describe, expect, it } from 'vitest';
import { newUnit } from '../model/factory';
import type { Campaign, Unit } from '../model/types';
import { AUTO_BATTLE, applyAutoBattle, autoBattle, autoBattleBlock, autoSetup, avgAttacks, fighter, fightersOf } from './autoBattle';
import { FACE_OFF_MISSIONS } from './missions';
import { leaders, loadUnits, newBattle, resultFor } from './tracker';

// Auto-battle: overall Attack and Defense from a unit's profile, then 4 rounds of trading blows.

const rifle = { id: 'r', name: 'Rifles', count: 5, range: 24, attacks: 1, rules: [], traits: [] };
const blade = { id: 'b', name: 'Blades', count: 5, range: 0, attacks: 2, rules: ['AP(1)'], traits: [] };
const squad = (over: Partial<Unit> = {}): Unit => newUnit({ name: 'Squad', size: 5, quality: 4, defense: 4, points: 150, weapons: [rifle, blade], ...over });
const tracked = (u: Unit) => ({ id: u.id, name: u.name, wounds: u.size * (u.tough || 1), maxWounds: u.size * (u.tough || 1), points: u.points });
const rate = (u: Unit) => fighter(u, tracked(u), 's', 'A');

/** A seeded rng, so the same battle plays out the same way. */
function seeded(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

function battle(a: Unit[], b: Unit[]) {
  const t = newBattle(FACE_OFF_MISSIONS[0], 'x', '2026-10-20', () => 0.5);
  loadUnits(t.sides[0], 'Alpha', a);
  loadUnits(t.sides[1], 'Bravo', b);
  return t;
}

describe('auto-battle ratings', () => {
  it('reads dice attacks as their average', () => {
    expect([avgAttacks(3), avgAttacks('D3'), avgAttacks('2D6+1'), avgAttacks('D6')]).toEqual([3, 2, 8, 3.5]);
  });

  it('rates better quality, weapons and armour higher', () => {
    const base = rate(squad());
    expect(rate(squad({ quality: 3 })).attack).toBeGreaterThan(base.attack);
    expect(rate(squad({ weapons: [{ ...rifle, rules: ['AP(2)'] }, blade] })).shoot).toBeGreaterThan(base.shoot);
    expect(rate(squad({ weapons: [rifle, { ...blade, traits: [{ id: 't', name: '+1 A', unique: false }] }] })).melee).toBeGreaterThan(base.melee);
    expect(rate(squad({ defense: 3 })).def).toBeGreaterThan(base.def);
    expect(rate(squad({ upgrades: [{ id: 'u', name: 'Resilient', unique: false }] })).def).toBeGreaterThan(base.def);
    expect(rate(squad({ rules: ['Regeneration'] })).def).toBeGreaterThan(base.def);
    expect(rate(squad({ xp: 30 })).attack).toBeGreaterThan(base.attack);
    expect(rate(squad({ scars: [{ id: 's', name: 'Weakened Armor' }] })).def).toBeLessThan(base.def);
    expect(rate(squad({ relics: [{ id: 'x', name: 'Relic', tier: 'Legendary' }] })).notes.some((n) => n.includes('Relic'))).toBe(true);
  });
});

describe('auto-battle', () => {
  it('plays out the same with the same luck, over at most 4 rounds', () => {
    const b = battle([squad(), squad()], [squad(), squad()]);
    const f = fightersOf(b, []);
    expect(f).toHaveLength(4);
    const r1 = autoBattle(f, seeded(7));
    const r2 = autoBattle(f, seeded(7));
    expect(r1).toEqual(r2);
    expect(Math.max(...r1.moves.map((m) => m.round))).toBeLessThanOrEqual(AUTO_BATTLE.rounds);
    expect(r1.moves.length).toBeGreaterThan(0);
    // The starting fighters are untouched.
    expect(f.every((x) => x.hp === x.maxHp)).toBe(true);
  });

  it('usually goes to the much stronger side', () => {
    const elite = () => squad({ quality: 2, defense: 2, weapons: [{ ...rifle, rules: ['AP(2)'], attacks: 3 }, { ...blade, attacks: 4 }] });
    const wins = Array.from({ length: 10 }, (_, i) => autoBattle(fightersOf(battle([elite(), elite()], [squad(), squad()]), []), seeded(i + 1)).winner);
    expect(wins.filter((w) => w === 'A').length).toBeGreaterThanOrEqual(8);
  });

  it('applies losses, kill XP and the winner to the battle', () => {
    const elite = squad({ quality: 2, defense: 2, weapons: [{ ...rifle, attacks: 4, rules: ['AP(3)'] }] });
    const b = battle([elite], [squad()]);
    expect(autoBattleBlock(b)).toBeUndefined();
    const r = autoBattle(fightersOf(b, []), seeded(3));
    applyAutoBattle(b, r);
    expect(b.ended).toBe(true);
    expect(b.auto?.winner).toBe(r.winner);
    const enemy = b.sides[1].units[0];
    expect(enemy.wounds).toBe(r.fighters.find((f) => f.team === 'B')!.hp);
    expect(enemy.destroyed).toBe(enemy.wounds === 0);
    expect(b.sides[0].units[0].xp).toBe(r.fighters.find((f) => f.team === 'A')!.xp);
    expect(autoBattleBlock(b)).toMatch(/over/);
  });

  it('decides the winner over the VP score', () => {
    const b = battle([squad()], [squad()]);
    b.auto = { winner: 'B', dealt: { A: 0, B: 150 } };
    expect(leaders(b)).toEqual(['B']);
    expect(resultFor(b, b.sides[0].id)).toBe('loss');
    b.auto.winner = 'draw';
    expect(resultFor(b, b.sides[1].id)).toBe('draw');
  });
});

describe('auto-battle morale and sector effects', () => {
  // Bravo holds the sector; Alpha attacks it.
  const sectorBattle = (modifiers: string[], a = [squad(), squad()], d = [squad(), squad()]) => {
    const b = battle(a, d);
    b.sectorId = 's';
    b.attacker = 'A';
    const c = {
      id: 'c', name: 'Test', updatedAt: '', round: 1, log: [],
      factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
      sectors: [{ id: 's', name: 'Sector', type: 'planet', owner: 'B', notes: '', q: 0, r: 0, modifiers }],
    } as Campaign;
    return autoSetup(b, [], c);
  };

  it('Shakes units at half strength or beaten in melee, and they rally on their next turn', () => {
    const moves = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((seed) => autoBattle(fightersOf(battle([squad(), squad()], [squad(), squad()]), []), seeded(seed)).moves);
    expect(moves.some((m) => m.shaken?.length)).toBe(true);
    expect(moves.some((m) => m.kind === 'rally')).toBe(true);
    expect(rate(squad({ rules: ['Fearless'] })).morale).toBe(1);
  });

  it('applies the sector modifiers to the defenders and attackers', () => {
    const s = sectorBattle(['fanatics', 'entrenched', 'minefield', 'initiative', 'tide']);
    const def = s.fighters.filter((f) => f.team === 'B');
    const att = s.fighters.filter((f) => f.team === 'A');
    expect(def.every((f) => f.morale === 1 && f.r1Def === 1)).toBe(true);
    expect(att.every((f) => f.morale === 0 && f.r1Def === 0 && f.mines)).toBe(true);
    expect([s.first, s.tide]).toEqual(['B', 'B']);
    expect(s.effects).toHaveLength(5);
    expect(def[0].notes.some((n) => n.startsWith('Fanatical Garrison'))).toBe(true);
    // Veterans pick two defenders, and their Attack goes up.
    const v = sectorBattle(['veterans']).fighters.filter((f) => f.team === 'B');
    expect(v.every((f) => f.hitMelee === 1)).toBe(true);
    expect(v[0].melee).toBeGreaterThan(rate(squad()).melee);
    expect(sectorBattle([]).effects).toEqual([]);
  });

  it('brings back the first defending unit destroyed with Endless Tide', () => {
    const big = () => squad({ quality: 2, defense: 2, size: 10, weapons: [{ ...rifle, count: 10, rules: ['AP(2)'] }, { ...blade, count: 10 }] });
    const s = sectorBattle(['tide'], [big(), big(), big()], [squad({ size: 1 }), squad()]);
    const returns = [1, 2, 3, 4, 5].map((seed) => autoBattle(s.fighters, seeded(seed), AUTO_BATTLE.rounds, s).moves.filter((m) => m.kind === 'return'));
    expect(returns.some((r) => r.length === 1)).toBe(true);
    expect(returns.every((r) => r.length <= 1)).toBe(true);
  });
});
