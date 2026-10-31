import { describe, expect, it } from 'vitest';
import type { Campaign, Force } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { BASE } from './board';
import { finalePlan, newFinale } from './finale';
import { LEGS } from './map';
import { checkDmg, checkWaves, colossusDealt, hasChecks, isColossusWave, siegeDmg, siegeFinal } from './siege';
import { checkRanking, collectSiege, postSiege, settleSieges, siegeAssets, siegeOwed } from './siegeBoard';
import { tallyHarm } from './tally';
import { blankRun } from './testRun';
import { planFor, walk } from './waves';
import type { Enemy, TrainingRun } from './types';

// The Weekly Siege's damage checks (from TRAINING.siege.checksFrom): the colossus at waves 10, 20 and 30, each check's
// damage on its own board, and a tiered reward for each check's winner, collected by the force's owner.

const S = TRAINING.siege;
const F = TRAINING.finale;
const NEW = S.checksFrom;
const OLD = '2026-W44';

const checkRun = (o: Partial<TrainingRun> = {}): TrainingRun =>
  Object.assign(blankRun(), { siege: NEW, finale: newFinale(F.from, NEW) }, o);
const colossus = (o: Partial<Enemy> = {}): Enemy =>
  ({ id: 7, kind: 'brute', x: BASE.x, y: BASE.y, leg: LEGS - 1, hp: F.siegeHp, maxHp: F.siegeHp, flies: false, status: {}, dots: [], regrab: 0, final: true, ...o }) as Enemy;

const force = (id: string, factionId?: string): Force =>
  ({ id, name: `Force ${id}`, player: id.toUpperCase(), units: [], ledger: [], ...(factionId ? { nexus: { factionId } } : {}) }) as unknown as Force;
const camp = (o: Partial<Campaign> = {}): Campaign => ({ log: [], sectors: [], factions: [], round: 2, ...o }) as unknown as Campaign;
/** A finished siege run that reached the given checks with this damage. */
const ran = (checks: number[], week = NEW): TrainingRun =>
  Object.assign(blankRun(), { siege: week, wave: checks.length * 10, cleared: checks.length * 10 - 1, phase: 'over', checks, finale: newFinale(F.from, week) });

describe('damage-check weeks', () => {
  it('start from checksFrom; older weeks keep the one Final at 25', () => {
    expect(NEW).toBe('2026-W45');
    expect(hasChecks(OLD)).toBe(false);
    expect(hasChecks(NEW)).toBe(true);
    expect(hasChecks('2026-W52')).toBe(true);
    expect(hasChecks(undefined)).toBe(false);
    expect(checkWaves(OLD)).toEqual([F.from]);
    expect(checkWaves(NEW)).toEqual([10, 20, 30]);
    expect(siegeFinal(NEW)).toBe(30);
    expect(newFinale(F.from, NEW).final).toBe(30);
    expect(newFinale(F.from, OLD).final).toBe(F.from);
    expect(newFinale(F.from, true).final).toBe(F.from);
  });

  it('brings the lone colossus at each check, and opens a new count of damage for it', () => {
    const run = checkRun();
    expect([9, 10, 15, 20, 25, 30].map((w) => isColossusWave(run, w))).toEqual([false, true, false, true, false, true]);
    for (const [i, w] of [10, 20, 30].entries()) {
      run.wave = w;
      const plans = finalePlan(run, planFor(run, 750, w, 30));
      expect(plans).toHaveLength(1);
      expect(plans[0]).toMatchObject({ hp: F.siegeHp, final: true, at: 0 });
      expect(run.checks).toHaveLength(i + 1);
      tallyHarm(run, undefined, colossus(), 1000 * (i + 1), 'shot' as never, false);
    }
    expect(checkDmg(run)).toEqual([1000, 2000, 3000]);
    expect(colossusDealt(run)).toBe(3000);
    expect(siegeDmg(run)).toBe(6000);
    // An ordinary boss wave in between is not a check.
    run.wave = 15;
    expect(finalePlan(run, planFor(run, 750, 15, 30)).length).toBeGreaterThan(1);
  });

  it('lets an earlier check\'s colossus walk off at the base for nothing, but the last one ends the siege', () => {
    const run = checkRun({ wave: 10, checks: [4321], baseHp: TRAINING.baseHp });
    run.enemies = [colossus()];
    walk(run, 0.01);
    expect(run.enemies).toHaveLength(0);
    expect(run.baseHp).toBe(TRAINING.baseHp);
    expect(run.leaked).toBe(0);
    expect(run.finale!.through).toBeFalsy();
    const last = checkRun({ wave: 30, checks: [1, 2, 3] });
    last.enemies = [colossus()];
    walk(last, 0.01);
    expect(last.finale!.through).toBeTruthy();
  });
});

describe('damage-check boards and rewards', () => {
  it('ranks each check by each force\'s best there from any attempt', () => {
    const c = camp();
    c.siegeBoard = postSiege(c, force('a', 'red'), ran([5000, 9000]), '2026-11-03');
    c.siegeBoard = postSiege(c, force('a', 'red'), ran([7000]), '2026-11-04');
    c.siegeBoard = postSiege(c, force('b', 'blue'), ran([6000, 8000, 12000]), '2026-11-04');
    expect(checkRanking(c.siegeBoard, NEW, 0).map((e) => [e.forceId, e.checks![0]])).toEqual([['a', 7000], ['b', 6000]]);
    expect(checkRanking(c.siegeBoard, NEW, 1).map((e) => [e.forceId, e.checks![1]])).toEqual([['a', 9000], ['b', 8000]]);
    expect(checkRanking(c.siegeBoard, NEW, 2).map((e) => e.forceId)).toEqual(['b']);
  });

  it('settles one tiered win per check, the asset at the last, and each owner collects once', () => {
    const c = camp();
    const a = force('a', 'red');
    const b = force('b', 'blue');
    c.siegeBoard = postSiege(c, a, ran([7000, 9000]), '2026-11-04');
    c.siegeBoard = postSiege(c, b, ran([6000, 8000, 12000]), '2026-11-04');
    const won = settleSieges(c, '2026-W46', '2026-11-09');
    expect(won.map((w) => [w.tier, w.forceId, w.dmg, w.us, w.rp, w.assets])).toEqual([
      [10, 'a', 7000, S.rewards[10].us, S.rewards[10].rp, 0],
      [20, 'a', 9000, S.rewards[20].us, S.rewards[20].rp, 0],
      [30, 'b', 12000, S.rewards[30].us, S.rewards[30].rp, S.rewards[30].asset],
    ]);
    expect(settleSieges(c, '2026-W46', '2026-11-09')).toEqual([]);
    expect(siegeAssets(c, 'blue')).toBe(1);
    expect(siegeAssets(c, 'red')).toBe(0);

    expect(siegeOwed(c, a)).toHaveLength(2);
    let n = 0;
    const lines = collectSiege(c, a, '2026-11-09', () => `id${n++}`);
    expect(lines).toHaveLength(2);
    expect(a.umbraShards).toBe(S.rewards[10].us + S.rewards[20].us);
    expect(a.ledger.reduce((s, r) => s + (r.rp ?? 0), 0)).toBe(S.rewards[10].rp + S.rewards[20].rp);
    expect(siegeOwed(c, a)).toEqual([]);
    expect(collectSiege(c, a, '2026-11-09', () => 'x')).toEqual([]);
    expect(a.umbraShards).toBe(S.rewards[10].us + S.rewards[20].us);
    collectSiege(c, b, '2026-11-09', () => 'y');
    expect(b.umbraShards).toBe(S.rewards[30].us);
  });

  it('settles an old-format week as before: one winner, one asset', () => {
    const c = camp();
    const run = Object.assign(blankRun(), { siege: OLD, wave: 25, cleared: 24, phase: 'over', finale: { ...newFinale(F.from, OLD), dealt: 5000 } });
    c.siegeBoard = postSiege(c, force('a', 'red'), run, '2026-10-30');
    const won = settleSieges(c, '2026-W45', '2026-11-02');
    expect(won).toHaveLength(1);
    expect(won[0].tier).toBeUndefined();
    expect(siegeAssets(c, 'red')).toBe(1);
    expect(siegeOwed(c, force('a', 'red'))).toEqual([]);
  });
});
