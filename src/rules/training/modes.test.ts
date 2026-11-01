import { describe, expect, it } from 'vitest';
import type { Campaign, Force } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { trainingFeats } from '../feats';
import { newFinale } from './finale';
import { modeHpAt, modeHpOf, modePlan, modesOpen, scaleReward } from './modes';
import { createRun } from './run';
import { checkRanking, checkReward, collectSiege, payMilestones, postSiege, settleSieges, siegeMilestones } from './siegeBoard';
import { blankRun } from './testRun';
import type { RunMode, SpawnPlan, TrainingRun } from './types';

// Hard and Insane: the waves' wounds ramp up to the mode's multiplier, a siege mode has boards of its own and bigger
// rewards, damage milestones pay once a week a mode, and each mode has its feats.

const M = TRAINING.modes;
const S = TRAINING.siege;
const NEW = S.checksFrom;

const force = (id: string, factionId?: string): Force =>
  ({ id, name: `Force ${id}`, player: id.toUpperCase(), units: [], ledger: [], ...(factionId ? { nexus: { factionId } } : {}) }) as unknown as Force;
const camp = (): Campaign => ({ log: [], sectors: [], factions: [], round: 2 }) as unknown as Campaign;
const ran = (checks: number[], mode?: RunMode): TrainingRun =>
  Object.assign(blankRun(), { siege: NEW, wave: checks.length * 10, cleared: checks.length * 10 - 1, phase: 'over', checks, finale: newFinale(TRAINING.finale.from, NEW), ...(mode ? { mode } : {}) });

describe('mode multipliers', () => {
  it('ramp from 1 at wave 1 to the whole multiplier at rampTo, by the same factor each wave', () => {
    const run = { modeHp: 13 };
    expect(modeHpAt(run, 1)).toBe(1);
    expect(modeHpAt(run, M.rampTo)).toBe(13);
    expect(modeHpAt(run, 40)).toBe(13);
    expect(modeHpAt(run, 1 + (M.rampTo - 1) / 2)).toBeCloseTo(Math.sqrt(13));
    expect(modeHpAt(run, 2) / modeHpAt(run, 1)).toBeCloseTo(modeHpAt(run, 3) / modeHpAt(run, 2));
    expect(modeHpAt({}, 20)).toBe(1);
  });

  it('multiply the wave plans, a boss by only the square root', () => {
    const plans = [{ kind: 'lord', hp: 10 }, { kind: 'drone', hp: 4 }] as SpawnPlan[];
    modePlan({ modeHp: 16 }, M.rampTo + 1, plans);
    expect(plans.map((p) => p.hp)).toEqual([10 * 16 ** M.bossShare, 64]);
    expect(M.bossShare).toBe(0.5);
  });

  it('ease the wave-15 boss by a tenth on Hard and Insane, not on Normal', () => {
    const at15 = (modeHp: number) => modePlan({ modeHp }, 15, [{ kind: 'lord', hp: 100 }, { kind: 'drone', hp: 10 }] as SpawnPlan[]);
    const hard = at15(M.hard.train);
    expect(hard[0].hp).toBeCloseTo(100 * M.hard.train ** M.bossShare * 0.9);
    expect(hard[1].hp).toBeCloseTo(10 * M.hard.train);
    expect(at15(1)[0].hp).toBe(100);
  });

  it('are tuned apart for the siege and other runs, Insane twice Hard', () => {
    expect(modeHpOf(undefined, true)).toBe(1);
    expect(modeHpOf('hard', true)).toBe(M.hard.siege);
    expect(modeHpOf('insane', false)).toBe(M.insane.train);
    expect(M.insane.siege).toBe(2 * M.hard.siege);
    expect(M.insane.train).toBe(2 * M.hard.train);
  });

  it('are open to any run but an old-format siege', () => {
    expect(modesOpen()).toBe(true);
    expect(modesOpen('2026-W44')).toBe(false);
    expect(modesOpen(NEW)).toBe(true);
    expect(createRun('f', [], 1, undefined, undefined, { siege: '2026-W44', mode: 'hard' }).mode).toBeUndefined();
    const hard = createRun('f', [], 1, undefined, undefined, { siege: NEW, mode: 'hard' });
    expect(hard.mode).toBe('hard');
    expect(hard.modeHp).toBe(M.hard.siege);
    expect(createRun('f', [], 1, undefined, undefined, { mode: 'insane' }).modeHp).toBe(M.insane.train);
    expect(createRun('f', [], 1).modeHp).toBeUndefined();
  });

  it('scale rewards up, rounding up', () => {
    expect(scaleReward({ us: 3, rp: 1 }, 'hard')).toEqual({ us: 5, rp: 2 });
    expect(scaleReward({ us: 3, rp: 0 }, 'insane')).toEqual({ us: 6, rp: 0 });
    expect(scaleReward({ us: 3 })).toEqual({ us: 3 });
  });
});

describe('mode siege boards', () => {
  it('keep each mode apart, and pay each its own winners, times its reward', () => {
    const c = camp();
    const a = force('a', 'red');
    c.siegeBoard = postSiege(c, a, ran([7000]), '2026-11-04');
    c.siegeBoard = postSiege(c, a, ran([3000, 4000, 5000], 'hard'), '2026-11-04');
    c.siegeBoard = postSiege(c, force('b', 'blue'), ran([9000], 'hard'), '2026-11-05');
    expect(checkRanking(c.siegeBoard, NEW, 0).map((e) => e.forceId)).toEqual(['a']);
    expect(checkRanking(c.siegeBoard, NEW, 0, 'hard').map((e) => e.forceId)).toEqual(['b', 'a']);
    expect(checkRanking(c.siegeBoard, NEW, 0, 'insane')).toEqual([]);

    const won = settleSieges(c, '2026-W46', '2026-11-09');
    expect(won.map((w) => [w.mode, w.tier, w.forceId])).toEqual([[undefined, 10, 'a'], ['hard', 10, 'b'], ['hard', 20, 'a'], ['hard', 30, 'a']]);
    const h30 = won.find((w) => w.mode === 'hard' && w.tier === 30)!;
    expect(h30.us).toBe(checkReward(30, 'hard').us);
    expect(h30.us).toBe(Math.ceil(S.rewards[30].us * M.hard.reward));
    expect(h30.assets).toBe(S.rewards[30].asset);

    // Normal's and Hard's wave-10 wins are both collected, each once.
    const lines = collectSiege(c, a, '2026-11-09', () => 'x');
    expect(lines).toHaveLength(3);
    expect(a.umbraShards).toBe(S.rewards[10].us + checkReward(20, 'hard').us + checkReward(30, 'hard').us);
    expect(collectSiege(c, a, '2026-11-09', () => 'x')).toEqual([]);
  });

  it('pay damage milestones once a week in each mode', () => {
    const f = force('a');
    const run = ran([1000, 2000, 30_000]);
    const passed = S.milestones.filter((m) => m.dmg <= 30_000);
    expect(siegeMilestones(f, run).map((m) => m.dmg)).toEqual(passed.map((m) => m.dmg));
    expect(payMilestones(f, run, '2026-11-04', () => 'x')).toHaveLength(passed.length);
    expect(f.umbraShards).toBe(passed.reduce((n, m) => n + m.us, 0));
    expect(payMilestones(f, run, '2026-11-04', () => 'x')).toEqual([]);
    // The same damage on Insane pays again, doubled.
    const insane = payMilestones(f, ran([1000, 2000, 30_000], 'insane'), '2026-11-04', () => 'x');
    expect(insane).toHaveLength(passed.length);
    expect(f.umbraShards).toBe(passed.reduce((n, m) => n + m.us + Math.ceil(m.us * M.insane.reward), 0));
    // Not reaching the last check pays nothing; nor does an old-format week.
    expect(siegeMilestones(force('b'), ran([50_000, 50_000]))).toEqual([]);
    expect(siegeMilestones(force('b'), { ...ran([1, 2, 99_000]), siege: '2026-W44' })).toEqual([]);
  });
});

describe('mode feats', () => {
  it('count the checks reached, the damage at the last, and a Final won', () => {
    expect(trainingFeats(0, 0, {})).not.toContain('hardCheck10');
    expect(trainingFeats(19, 0, { mode: 'hard', checks: 2, lastCheck: 1000 })).toEqual(expect.arrayContaining(['hardCheck10', 'hardCheck20']));
    expect(trainingFeats(19, 0, { mode: 'hard', checks: 2, lastCheck: 1000 })).not.toContain('hardCheck30');
    const insane = trainingFeats(29, 0, { mode: 'insane', checks: 3, lastCheck: 60_000 });
    expect(insane).toEqual(expect.arrayContaining(['insaneCheck10', 'insaneCheck20', 'insaneCheck30', 'insaneDmg']));
    expect(insane).not.toContain('hardCheck10');
    expect(trainingFeats(25, 0, { mode: 'hard', won: true })).toContain('hardWin');
  });
});
