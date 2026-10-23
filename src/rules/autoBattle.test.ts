import { describe, expect, it } from 'vitest';
import { newUnit } from '../model/factory';
import type { Campaign, Unit } from '../model/types';
import { AUTO_BATTLE, applyAutoBattle, autoBattle, autoBattleBlock, autoOdds, autoSetup, avgAttacks, fighter, fightersOf } from './autoBattle';
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

  it('judges by the share of each army lost, so a bigger army is not punished for offering more to kill', () => {
    const big = Array.from({ length: 12 }, () => squad());
    const wins = Array.from({ length: 20 }, (_, i) => autoBattle(fightersOf(battle(big, big.slice(0, 6).map(() => squad())), []), seeded(i + 1)));
    expect(wins.filter((r) => r.winner === 'A').length).toBeGreaterThanOrEqual(16);
    for (const r of wins.filter((x) => x.winner === 'A')) expect(r.lost.B! - r.lost.A!).toBeGreaterThan(AUTO_BATTLE.drawMargin);
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
    // Applying the same run again changes nothing.
    const xp = b.sides[0].units[0].xp;
    applyAutoBattle(b, r);
    expect(b.sides[0].units[0].xp).toBe(xp);
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

describe('auto-battle abilities', () => {
  const fight = (a: Unit, b: Unit, seed = 3) => autoBattle(fightersOf(battle([a], [b]), []), seeded(seed));
  const notes = (r: ReturnType<typeof autoBattle>) => r.moves.flatMap((m) => m.notes ?? []);

  it('lists what a unit can do, and takes penalties off its numbers', () => {
    expect(rate(squad({ upgrades: [{ id: 'u', name: 'Field Medic', unique: false }] })).notes.some((n) => n.startsWith('Field Medic'))).toBe(true);
    expect(rate(squad({ scars: [{ id: 's', name: 'Crippling Injury' }] })).attack).toBeLessThan(rate(squad()).attack);
  });

  it('shields soak wounds, and a lucky unit gets back up once', () => {
    let soaked = false;
    let up = false;
    for (let seed = 1; seed <= 20; seed++) {
      const n = notes(fight(squad({ rules: ['Guard Stance', 'Lucky'] }), squad({ quality: 3, defense: 3 }), seed));
      soaked ||= n.some((x) => x.includes('shield soaks'));
      up ||= n.some((x) => x.includes('gets back up'));
    }
    expect(soaked).toBe(true);
    expect(up).toBe(true);
  });

  it('a medic heals a hurt ally as its own move', () => {
    let healed = false;
    for (let seed = 1; seed <= 20 && !healed; seed++) {
      const r = autoBattle(fightersOf(battle([squad({ upgrades: [{ id: 'u', name: 'Field Medic', unique: false }] }), squad()], [squad(), squad()]), []), seeded(seed));
      healed = r.moves.some((m) => m.kind === 'heal' && m.dmg > 0) || notes(r).some((x) => x.startsWith('Field Medic'));
    }
    expect(healed).toBe(true);
  });

  it('a stunned unit loses its turn', () => {
    let stunned = false;
    for (let seed = 1; seed <= 30 && !stunned; seed++) stunned = fight(squad({ rules: ['Temporal Rift'] }), squad(), seed).moves.some((m) => m.kind === 'stunned');
    expect(stunned).toBe(true);
  });
});

describe('auto-battle heroes and forecast', () => {
  it("has a hero join its side's biggest unit, and nobody picks it out while that unit stands", () => {
    const hero = squad({ name: 'Captain', size: 1, tough: 3, rules: ['Hero'] });
    const b = battle([hero, squad({ size: 10 }), squad()], [squad(), squad(), squad()]);
    const f = fightersOf(b, []);
    const r = autoBattle(f, seeded(3));
    const h = r.fighters.find((x) => x.hero)!;
    const host = r.fighters.find((x) => x.key === h.host)!;
    expect(host.size).toBe(10);
    const hostDown = r.moves.findIndex((m) => m.target === host.key && m.targetHp <= 0);
    const atHero = r.moves.findIndex((m) => m.target === h.key && m.kind !== 'heal');
    if (atHero >= 0) {
      expect(hostDown).toBeGreaterThanOrEqual(0);
      expect(atHero).toBeGreaterThan(hostDown);
    }
  });

  it('forecasts wins, losses, and scars only for the sides that make death rolls', () => {
    const b = battle([squad(), squad(), squad(), squad()], [squad()]);
    const f = fightersOf(b, []);
    const odds = autoOdds(f, {}, new Set([b.sides[0].id]), 50, seeded(5));
    expect(odds.A!.win).toBeGreaterThan(0.8);
    expect(odds.B!.unitsLost).toBeGreaterThan(odds.A!.unitsLost);
    expect(odds.B!.scar).toBe(0);
    for (const o of [odds.A!, odds.B!]) {
      expect(o.scar).toBeGreaterThanOrEqual(o.comatose);
      expect(o.scar).toBeLessThanOrEqual(1);
    }
    // Lowered Constitution rolls two dice: more scars for the same losses.
    const weak = fightersOf(battle([squad(), squad()], [squad(), squad()]), []);
    const frail = weak.map((x) => ({ ...x, deathDice: 2 }));
    const one = autoOdds(weak, {}, new Set(weak.map((x) => x.sideId)), 50, seeded(9));
    const two = autoOdds(frail, {}, new Set(weak.map((x) => x.sideId)), 50, seeded(9));
    expect(two.A!.unitsLost).toBe(one.A!.unitsLost);
    expect(two.A!.scar).toBeGreaterThan(one.A!.scar);
  });
});
