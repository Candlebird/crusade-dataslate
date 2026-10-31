import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import { ATTACK_DEFEND_MISSIONS, FACE_OFF_MISSIONS, PROGRESSIVE_MISSIONS, STANDARD_MISSION } from '../missions';
import { bookRules } from '../oprRules';
import { dist, los, makeBoard, reachable, zoneOf } from './board';
import { mulberry32 } from './dice';
import { join, maxWoundsOf, profileOf, unitHooks, woundsOf } from './profile';
import { woundsLeft } from './combat';
import { playOut, quickBattle, randomArmy, simSetup } from './sim';
import { act, actions, arriveSquares, attackNow, autoDeploy, chargeTargets, createBattle, speed, deploySquares, isHeroUnit, onActivation, ready, deploy, pickDeploy, startDeploy, toDeploy } from './engine';
import { onTable } from './state';
import { aiTurn } from './ai';
import type { ZBattle, ZUnit } from './state';
import type { Campaign } from '../../model/types';
import { applyZoneBattle, startZoneBattle, zoneKey, ZONE_REWARDS } from './setup';
import { newBattle, trackerUnit } from '../tracker';

const load = (f: string) => normalizeBook(JSON.parse(readFileSync(f, 'utf8')));
export const ECHOES = load('armies/void-echoes.gf.json');
export const DOTHEA = load('src/data/spears-of-dothea.raw.json');

/** A unit from a book by datasheet name, with options picked by label (e.g. 'Great Flayer'). */
export function bookUnit(book: ReturnType<typeof load>, name: string, picks: string[] = []) {
  const cu = book.units.find((u) => u.name === name)!;
  const sel: Record<string, number> = {};
  for (const s of cu.sections) for (const o of s.options) if (picks.some((p) => o.label.includes(p))) sel[`${s.id}:${o.id}`] = 1;
  return unitFromCatalog(cu, applySelection(cu, sel), book);
}

describe('profile', () => {
  const br = bookRules([ECHOES]);
  it('reads a mount out of its label', () => {
    const cu = ECHOES.units.find((u) => u.sections.some((s) => s.options.some((o) => o.label.includes('Great Flayer'))))!;
    const u = bookUnit(ECHOES, cu.name, ['Great Flayer']);
    const p = profileOf(u, 't1', br);
    expect(p.guns.some((g) => g.name === 'Heavy Claws')).toBe(true);
    expect(p.kits[0].tough).toBe(u.tough + 6);
    expect(unitHooks(p).some((h) => h.k === 'hitIn')).toBe(true);
  });
  it('spreads weapons over models and takes old wounds off the plainest', () => {
    const u = DOTHEA.units.find((x) => x.size >= 5)!;
    const unit = unitFromCatalog(u, applySelection(u, {}), DOTHEA);
    const p = profileOf(unit, 't1', bookRules([DOTHEA]), unit.size * unit.tough - 2);
    expect(p.models.every((m) => m.guns.length > 0)).toBe(true);
    expect(woundsOf(p, 't1')).toBe(unit.size * unit.tough - 2);
    const hero = DOTHEA.units.find((x) => x.rules.some((r) => r === 'Hero'))!;
    const h = profileOf(unitFromCatalog(hero, applySelection(hero, {}), DOTHEA), 'h1', bookRules([DOTHEA]));
    const j = join(p, h);
    expect(maxWoundsOf(j)).toBe(maxWoundsOf(p) + maxWoundsOf(h));
    expect(j.models[j.models.length - 1].rank).toBeGreaterThanOrEqual(100);
  });
});

describe('board', () => {
  const missions = [...FACE_OFF_MISSIONS, ...PROGRESSIVE_MISSIONS, ...ATTACK_DEFEND_MISSIONS];
  it('builds every mission on every shape', () => {
    for (const m of missions) for (const shape of ['wide', 'deep', 'small'] as const) {
      const b = makeBoard({ points: 2000, mission: m, shape, sector: 'planet', rng: mulberry32(7) });
      expect(b.deploy[0].length, `${m.id} ${shape}`).toBeGreaterThan(0);
      expect(b.deploy[1].length, `${m.id} ${shape}`).toBeGreaterThan(0);
      expect(b.objectives.length, `${m.id} ${shape}`).toBeGreaterThan(0);
      expect(b.deploy[0].some((s) => b.deploy[1].includes(s))).toBe(false);
    }
  });
  it('measures, sees and moves', () => {
    const b = makeBoard({ points: 2000, mission: STANDARD_MISSION, shape: 'wide', rng: mulberry32(1) });
    expect(b.w).toBe(12);
    expect(b.h).toBe(8);
    expect(dist(b, 0, 13)).toBe(1);
    expect(zoneOf(b, 13)).toBe(0);
    b.terrain.fill(null);
    b.terrain[2] = { name: 'Wall', blocking: true };
    expect(los(b, 0, 4)).toBe(false);
    expect(los(b, 0, 48)).toBe(true);
    expect(reachable(b, 0, 2).has(2)).toBe(false);
    b.terrain[1] = { name: 'Mud', difficult: true };
    expect(reachable(b, 0, 2).get(1)).toBe(1);
  });
});

describe('battle', () => {
  const missions = [STANDARD_MISSION, ...FACE_OFF_MISSIONS, ...PROGRESSIVE_MISSIONS, ...ATTACK_DEFEND_MISSIONS];
  it('plays every mission out, AI against AI', () => {
    for (const [i, m] of missions.entries()) {
      const rng = mulberry32(100 + i);
      const a = { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') };
      const d = { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') };
      const b = quickBattle(m, a, d, 100 + i);
      expect(b.phase, `${m.id}: ${b.log.slice(-3).map((l) => l.text).join(' / ')}`).toBe('ended');
      expect(b.result, m.id).toBeDefined();
      expect(b.log.some((l) => l.kind === 'shoot' || l.kind === 'melee'), m.id).toBe(true);
    }
  });
  it('plays a move and its shooting as two stages, when split', () => {
    const rng = mulberry32(7);
    const a = { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') };
    const d = { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') };
    const b = playOut(createBattle(simSetup(STANDARD_MISSION, a, d, 7)), [0, 1], 0);
    let stages = 0;
    for (let n = 0; b.phase === 'battle' && n < 2000; n++) {
      const o = aiTurn(b, b.turn)!;
      const out = act(b, o, true);
      if (!b.pending) continue;
      stages++;
      expect(out.some((l) => l.kind === 'shoot'), 'no shooting in the move stage').toBe(false);
      expect(act(b, o, true), 'nothing else acts while one is pending').toEqual([]);
      const turn = b.turn;
      const shots = attackNow(b, o.target).filter((l) => l.kind === 'shoot');
      expect(b.pending).toBeUndefined();
      expect(ready(b, turn).map((u) => u.id), 'its activation is over').not.toContain(o.unit);
      for (const l of shots) expect(typeof l.wounds).toBe('number');
    }
    expect(b.phase).toBe('ended');
    expect(stages).toBeGreaterThan(0);
  });
  it('lets the player aim an ability that goes off as the unit activates (Mend)', () => {
    const a = { book: DOTHEA, units: ['Tech Druid', 'Furious Druid', 'Healing Druid'].map((n) => bookUnit(DOTHEA, n)) };
    const d = { book: ECHOES, units: randomArmy(ECHOES, 600, mulberry32(3), 'e') };
    const b = playOut(createBattle(simSetup(STANDARD_MISSION, a, d, 3)), [0, 1], 0);
    const [druid, x, y] = ['Tech Druid', 'Furious Druid', 'Healing Druid'].map((n) => b.units.find((u) => u.name === n)!);
    x.sq = y.sq = druid.sq;
    x.p.models[0].hurt = 1;
    y.p.models[0].hurt = 1;
    b.turn = druid.side;
    const [mend] = onActivation(b, druid);
    expect(mend.label).toMatch(/^Heals/);
    expect(mend.targets.map((t) => t.id).sort()).toEqual([x.id, y.id].sort());
    act(b, { unit: druid.id, action: 'hold', aid: y.id }, true);
    expect(woundsLeft(y)).toBe(maxWoundsOf(y.p));
    expect(woundsLeft(x)).toBe(maxWoundsOf(x.p) - 1);
  });
});


describe('campaign hookup', () => {
  it('fights a tracked battle and writes it back', () => {
    const rng = mulberry32(42);
    const t = newBattle(STANDARD_MISSION, 'tb1', '2026-10-26', () => 0.5);
    const armies = [randomArmy(ECHOES, 1000, rng, 'e'), randomArmy(DOTHEA, 1000, rng, 'd')];
    const books = [ECHOES, DOTHEA].map((x, i) => ({ ...x, uid: `book${i}` }));
    t.sides.forEach((s, i) => {
      s.roster = armies[i].map((u) => ({ ...u, bookUid: `book${i}` }));
      s.units = s.roster.map(trackerUnit);
    });
    // An old wound carries in.
    t.sides[1].units[0].wounds = t.sides[1].units[0].maxWounds - 1;
    // A Battle-Worn unit fights at -1 Quality and -1 Defense.
    t.sides[0].units[0].worn = true;
    const { battle } = startZoneBattle(t, [], books, 'quick', undefined, 9);
    expect(battle.units.length).toBe(armies[0].length + armies[1].length);
    const worn = battle.units.find((u) => u.id === zoneKey(t.sides[0].id, t.sides[0].units[0].id))!;
    expect(worn.p.kits[0].quality).toBe(Math.min(6, armies[0][0].quality + 1));
    expect(worn.p.kits[0].defense).toBe(Math.min(6, armies[0][0].defense + 1));
    const hurt = battle.units.find((u) => u.id === zoneKey(t.sides[1].id, t.sides[1].units[0].id))!;
    expect(woundsOf(hurt.p, hurt.id)).toBe(t.sides[1].units[0].maxWounds - 1);
    playOut(battle);
    expect(battle.phase).toBe('ended');
    applyZoneBattle(t, battle, ZONE_REWARDS.quick.xp);
    // Nexus Resonance: casters get +1 to cast.
    const c = { id: 'c', name: '', updatedAt: '', round: 2, factions: [], sectors: [], log: [], event: { id: 'resonance', round: 2 } } as Campaign;
    const res = startZoneBattle(newBattle(STANDARD_MISSION, 'tb2', '2026-10-26', () => 0.5), [], books, 'quick', c, 9);
    expect(res.battle.castBonus).toBe(1);
    expect(t.ended).toBe(true);
    expect(t.auto?.winner).toBeDefined();
    expect(t.control.length).toBe(battle.history.length);
    const lost = t.sides.flatMap((s) => s.units).filter((u) => u.destroyed).length;
    expect(lost).toBeGreaterThan(0);
  });
});

describe('saving', () => {
  it('picks up from a save exactly where it was', () => {
    const rng = mulberry32(77);
    const a = { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') };
    const d = { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') };
    const b = createBattle(simSetup(STANDARD_MISSION, a, d, 77));
    playOut(b, [0, 1], 20);
    expect(b.phase).toBe('battle');
    const saved: ZBattle = JSON.parse(JSON.stringify(b));
    playOut(b);
    playOut(saved);
    expect(saved.result).toEqual(b.result);
    expect(saved.log.length).toBe(b.log.length);
  });
  it('deploys in turn, Ambush waits, and the battle starts once all are down', () => {
    const rng = mulberry32(3);
    const b = createBattle(simSetup(STANDARD_MISSION, { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') }, { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') }, 3));
    startDeploy(b);
    const sides: number[] = [];
    while (b.phase === 'deploy') {
      sides.push(b.turn);
      const u = toDeploy(b, b.turn)[0];
      deploy(b, u.id, pickDeploy(b, u));
    }
    // Alternates while both sides have units left.
    const both = Math.min(...[0, 1].map((s) => sides.filter((x) => x === s).length)) * 2;
    for (let i = 1; i < both; i++) expect(sides[i]).not.toBe(sides[i - 1]);
    expect(b.phase).toBe('battle');
    for (const u of b.units.filter((x) => !x.joinedTo && !x.destroyed)) expect(u.sq >= 0 || !!u.used.ambushing).toBe(true);
  });
});

describe('ambush and fortifications', () => {
  const battle = (mission = STANDARD_MISSION, seed = 5) => {
    const rng = mulberry32(seed);
    return createBattle(simSetup(mission, { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') }, { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') }, seed));
  };
  /** Deploys every unit, `pick` choosing where (a unit with no square left goes to reserve, as Auto-deploy does). */
  const deployAll = (b: ZBattle, pick: (u: ZUnit) => number | 'ambush' = (u) => pickDeploy(b, u), seen?: (u: ZUnit, at: number | 'ambush') => void) => {
    if (b.phase === 'join') startDeploy(b);
    for (let n = 0; b.phase === 'deploy' && n < 400; n++) {
      const u = toDeploy(b, b.turn)[0];
      const at = pick(u);
      seen?.(u, at);
      if (at === -1) autoDeploy(b, b.turn);
      else deploy(b, u.id, at);
    }
  };

  it('places Ambushers at the start of round 2, before anyone activates, and they still activate that round', () => {
    const b = battle();
    const amb = b.units.find((u) => u.side === 0 && !u.destroyed && !isHeroUnit(u))!;
    for (const u of b.units) delete u.ambush;
    amb.ambush = true;
    deployAll(b, (u) => (u === amb ? 'ambush' : pickDeploy(b, u)));
    // Not in round 1.
    expect(ready(b, 0)).not.toContain(amb);
    expect(actions(b, amb)).toEqual([]);
    for (let n = 0; b.round === 1 && b.phase === 'battle' && n < 200; n++) act(b, aiTurn(b, b.turn)!);
    expect(b.round).toBe(2);
    expect(b.placing).toBe(true);
    expect(b.turn).toBe(0);
    expect(ready(b, 0)).toEqual([amb]);
    expect(actions(b, amb)).toEqual(['arrive', 'wait']);
    const sq = arriveSquares(b, amb)[0];
    for (const e of onTable(b).filter((x) => x.side === 1)) expect(dist(b.board, sq, e.sq)).toBeGreaterThanOrEqual(2);
    act(b, { unit: amb.id, action: 'arrive', to: sq });
    expect(amb.sq).toBe(sq);
    expect(b.placing).toBeUndefined();
    expect(amb.activated).toBe(false);
    expect(ready(b, 0)).toContain(amb);
  });

  it('can keep waiting, and one placed in the last round neither seizes nor contests', () => {
    const b = battle();
    const amb = b.units.find((u) => u.side === 0 && !u.destroyed && !isHeroUnit(u))!;
    for (const u of b.units) delete u.ambush;
    amb.ambush = true;
    b.rounds = 2;
    deployAll(b, (u) => (u === amb ? 'ambush' : pickDeploy(b, u)));
    for (let n = 0; b.round === 1 && b.phase === 'battle' && n < 200; n++) act(b, aiTurn(b, b.turn)!);
    expect(b.placing).toBe(true);
    // Every enemy off the table, so the marker is the Ambusher's alone if it may take it.
    for (const e of b.units.filter((u) => u.side === 1)) e.destroyed = true;
    b.control = b.control.map(() => '');
    act(b, { unit: amb.id, action: 'arrive', to: b.board.objectives[0].sq });
    expect(amb.used.late).toBe(1);
    for (const u of b.units.filter((x) => x.side === 0 && x !== amb)) u.destroyed = true;
    act(b, { unit: amb.id, action: 'hold' });
    expect(b.history[b.history.length - 1][0]).toBe('');
    // Keeping one waiting.
    const w = battle(STANDARD_MISSION, 6);
    const amb2 = w.units.find((u) => u.side === 1 && !u.destroyed && !isHeroUnit(u))!;
    for (const u of w.units) delete u.ambush;
    amb2.ambush = true;
    deployAll(w, (u) => (u === amb2 ? 'ambush' : pickDeploy(w, u)));
    for (let n = 0; w.round === 1 && w.phase === 'battle' && n < 200; n++) act(w, aiTurn(w, w.turn)!);
    w.turn = 1;
    act(w, { unit: amb2.id, action: 'wait' });
    expect(amb2.sq).toBe(-1);
    expect(w.placing).toBeUndefined();
    expect(ready(w, 1)).not.toContain(amb2);
  });

  it('plays the Ambush mission\'s three deployment waves', () => {
    const mission = ATTACK_DEFEND_MISSIONS.find((m) => m.id === 'opr-ambush')!;
    const b = battle(mission, 11);
    const defenders = b.units.filter((u) => u.side === 1 && !u.destroyed && !u.joinedTo).length;
    const order: number[] = [];
    deployAll(b, (u) => pickDeploy(b, u), (u, at) => {
      if (typeof at === 'number' && at >= 0) {
        const foes = onTable(b).filter((x) => x.side !== u.side);
        if (u.side === 0 || order.filter((s) => s === 1).length >= Math.ceil(defenders / 2)) {
          for (const f of foes) expect(dist(b.board, at, f.sq)).toBeGreaterThanOrEqual(3);
        } else expect(b.board.deploy[1]).toContain(at);
        const friends = onTable(b).filter((x) => x.side === 0);
        if (u.side === 0 && friends.length) expect(friends.some((f) => dist(b.board, at, f.sq) <= 1)).toBe(true);
      }
      order.push(b.turn);
    });
    expect(b.phase).toBe('battle');
    const half = Math.ceil(defenders / 2);
    expect(order.slice(0, half).every((s) => s === 1)).toBe(true);
    const firstAttacker = order.indexOf(0);
    expect(firstAttacker).toBe(half);
    expect(order.slice(firstAttacker).indexOf(1)).toBe(order.filter((s) => s === 0).length);
  });

  it('lets a Fortification set up anywhere but the enemy\'s zone', () => {
    const b = battle();
    const fort = b.units.find((u) => u.side === 0 && !u.destroyed && !isHeroUnit(u))!;
    fort.p = { ...fort.p, shared: [...fort.p.shared, { k: 'immobile' } as never] };
    startDeploy(b);
    b.turn = 0;
    const squares = deploySquares(b, fort);
    const enemy = new Set(b.board.deploy[1]);
    expect(squares.some((sq) => enemy.has(sq))).toBe(false);
    expect(squares.some((sq) => !b.board.deploy[0].includes(sq))).toBe(true);
    // Other units still go in their own zone.
    const plain = b.units.find((u) => u.side === 0 && u !== fort && !u.destroyed && !u.scout)!;
    expect(deploySquares(b, plain).every((sq) => b.board.deploy[0].includes(sq))).toBe(true);
    deployAll(b);
    expect(b.phase).toBe('battle');
    expect(enemy.has(fort.sq)).toBe(false);
  });

  it('plays out every mission with Ambushers and Fortifications on both sides', () => {
    for (const m of [STANDARD_MISSION, ...ATTACK_DEFEND_MISSIONS]) {
      const b = battle(m, 21);
      for (const s of [0, 1]) {
        const us = b.units.filter((u) => u.side === s && !u.destroyed && !isHeroUnit(u));
        us[0].ambush = true;
        us[1].p = { ...us[1].p, shared: [...us[1].p.shared, { k: 'immobile' } as never] };
      }
      playOut(b);
      expect(b.phase, m.id).toBe('ended');
    }
  });
});

describe('charges and melee', () => {
  /** A cleared board with one unit a side that can fight: everyone else is gone but a spare each, in far corners. */
  function duel() {
    const rng = mulberry32(11);
    const a = { book: DOTHEA, units: randomArmy(DOTHEA, 1500, rng, 'd') };
    const d = { book: ECHOES, units: randomArmy(ECHOES, 1500, rng, 'e') };
    const b = playOut(createBattle(simSetup(STANDARD_MISSION, a, d, 11)), [0, 1], 0);
    b.board.terrain = b.board.terrain.map(() => null);
    const plain = (u: ZUnit) => speed(b, u).rush === 2 && !unitHooks(u.p).some((h) => h.k === 'flying');
    const brawler = (u: ZUnit) => plain(u) && u.p.guns.some((g) => g.range === 0);
    const me = b.units.find((u) => u.side === 1 && !u.joinedTo && brawler(u) && !unitHooks(u.p).some((h) => h.k === 'impact'))!;
    const foe = b.units.find((u) => u.side === 0 && !unitHooks(u.p).some((h) => h.k === 'shroud'))!;
    const spares = [b.units.find((u) => u.side === 0 && u !== foe)!, b.units.find((u) => u.side === 1 && !u.joinedTo && u !== me)!];
    for (const u of b.units) if (![me, foe, ...spares].includes(u)) u.destroyed = true;
    const { w, h } = b.board;
    spares[0].sq = 0;
    spares[1].sq = w * h - 1;
    for (const u of b.units) { u.activated = false; u.shaken = false; u.joinedTo = undefined; }
    b.phase = 'battle';
    b.placing = undefined;
    b.pending = undefined;
    b.turn = me.side;
    const at = (x: number, y: number) => y * w + x;
    return { b, me, foe, at };
  }

  it('reaches an enemy a full move away, ending beside it', () => {
    const { b, me, foe, at } = duel();
    me.sq = at(1, 3);
    foe.sq = at(4, 3);
    const c = chargeTargets(b, me).find((x) => x.target === foe)!;
    expect(c, 'two squares of movement reach beside an enemy three squares off').toBeDefined();
    expect(c.froms.sort((x, y) => x - y)).toEqual([at(3, 2), at(3, 3), at(3, 4)]);
    act(b, { unit: me.id, action: 'charge', target: foe.id });
    expect(b.log.some((l) => l.kind === 'melee' && l.unit === me.id)).toBe(true);
  });

  it('picks the side it strikes from, but never one past its move or through the enemy', () => {
    const { b, me, foe, at } = duel();
    me.sq = at(1, 3);
    foe.sq = at(3, 3);
    const c = chargeTargets(b, me).find((x) => x.target === foe)!;
    expect(c.froms).toContain(at(3, 2));
    expect(c.froms).toContain(at(3, 4));
    expect(c.froms, 'behind it is three squares round').not.toContain(at(4, 3));
    act(b, { unit: me.id, action: 'charge', target: foe.id, to: at(3, 2) });
    expect([at(3, 2), foe.sq]).toContain(me.sq);
    expect(b.log.some((l) => l.kind === 'move' && l.text.includes('charges'))).toBe(true);
  });

  it('can Advance next to an enemy and fight it in melee instead of shooting', () => {
    const { b, me, foe, at } = duel();
    me.sq = at(1, 3);
    foe.sq = at(3, 3);
    act(b, { unit: me.id, action: 'advance', to: at(2, 3) }, 'always');
    expect(b.pending?.melee).toBe(true);
    const out = attackNow(b, foe.id, false, true);
    expect(out.some((l) => l.text.includes('in melee'))).toBe(true);
    expect(out.some((l) => l.kind === 'melee' && l.unit === me.id)).toBe(true);
    expect(out.some((l) => l.kind === 'melee' && l.text.includes('Impact')), 'no Impact without a charge').toBe(false);
    expect(b.pending).toBeUndefined();
  });
});
