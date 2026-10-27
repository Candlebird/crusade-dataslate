import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import { ATTACK_DEFEND_MISSIONS, FACE_OFF_MISSIONS, PROGRESSIVE_MISSIONS, STANDARD_MISSION } from '../missions';
import { bookRules } from '../oprRules';
import { dist, los, makeBoard, reachable, zoneOf } from './board';
import { mulberry32 } from './dice';
import { join, maxWoundsOf, profileOf, unitHooks, woundsOf } from './profile';
import { playOut, quickBattle, randomArmy, simSetup } from './sim';
import { createBattle, deploy, pickDeploy, startDeploy, toDeploy } from './engine';
import type { ZBattle } from './state';
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
    const { battle } = startZoneBattle(t, [], books, 'quick', undefined, 9);
    expect(battle.units.length).toBe(armies[0].length + armies[1].length);
    const hurt = battle.units.find((u) => u.id === zoneKey(t.sides[1].id, t.sides[1].units[0].id))!;
    expect(woundsOf(hurt.p, hurt.id)).toBe(t.sides[1].units[0].maxWounds - 1);
    playOut(battle);
    expect(battle.phase).toBe('ended');
    applyZoneBattle(t, battle, ZONE_REWARDS.quick.xp);
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
