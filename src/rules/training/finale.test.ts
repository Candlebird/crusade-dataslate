import { describe, expect, it } from 'vitest';
import type { Force, Unit } from '../../model/types';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { endlessDepth, inEndless } from './finaleCore';
import { finalBoss, finalePlan, newFinale } from './finale';
import { lordWaves } from './lordPick';
import { bankVictory, continueEndless, createRun, startProblem, step } from './run';
import { siegeDmg, siegeOrder } from './siege';
import { blankRun } from './testRun';
import { FORCES } from './testForces';
import { bankFinale, finaleOpen, finaleTrack, noteVeterancy, veterancyOf } from './veterancy';
import { climbAt, isFlyWave, planFor } from './waves';
import type { RunNexus, TrainingRun } from './types';

// The Final wave: the ladder, its boss, the Victory and Endless, the Siege's damage check, and no cliff past wave 25.

const F = TRAINING.finale;
const isBoss = (k: string) => TRAINING_ENEMIES[k as keyof typeof TRAINING_ENEMIES].spawn === 'boss';

/** A wave's escort wounds (everything but the boss), the mean over `n` dice. */
function escorts(w: number, final: number, n = 30): number {
  let s = 0;
  for (let i = 1; i <= n; i++) for (const p of planFor({ rng: i * 7919 }, 750, w, final)) if (!isBoss(p.kind)) s += p.hp;
  return s / n;
}

const forceOf = (xp: number[], finale?: Force['finale']): Force =>
  ({ id: 'f', units: xp.map((x, i) => ({ id: `u${i}`, xp: x })) as Unit[], ...(finale ? { finale } : {}) }) as Force;

describe('the Final-wave ladder', () => {
  it('opens a step only with a Victory below it and the veterancy bar', () => {
    expect(finaleOpen(forceOf([0]))).toBe(F.from);
    expect(finaleOpen(forceOf([999]))).toBe(F.from);
    const won = { vet: 0, open: F.from, wins: { [F.from]: '2026-10-24' } };
    expect(finaleOpen(forceOf([F.bars[F.from + F.step] - 1], won))).toBe(F.from);
    expect(finaleOpen(forceOf([F.bars[F.from + F.step]], won))).toBe(F.from + F.step);
    // An opened step stays open, and veterancy never drops (a unit removed or its XP lost).
    const f = forceOf([F.bars[F.from + F.step]], won);
    noteVeterancy(f);
    f.units = [];
    expect(veterancyOf(f)).toBe(F.bars[F.from + F.step]);
    expect(finaleOpen(f)).toBe(F.from + F.step);
    expect(finaleTrack(f).steps.map((s) => s.n)).toEqual([25, 30, 35, 40, 45, 50]);
  });

  it('a fresh force meets the Final at 25', () => {
    const run = createRun('f', FORCES[0].units, 1);
    expect(run.finale?.final).toBe(F.from);
    expect(createRun('f', FORCES[0].units, 1, undefined, undefined, { final: 99 }).finale?.final).toBe(F.to);
  });

  it('puts the Nexus Crisis lord on the Final at 50, and a named lord elsewhere', () => {
    const nx = { threat: 0, affixes: [], lords: [1, 2, 3, 4, 5].map((i) => ({ key: `k${i}`, name: `L${i}`, tier: 'Rare', trick: 'summon', from: i === 5 ? 'crisis' : 'guardian' })) } as unknown as RunNexus;
    expect(lordWaves(nx, false, 50)).toEqual([5, 10, 15, 20, 50]);
    expect(finalBoss({ nexus: nx, finale: newFinale(50) })).toBe('L5');
    expect(finalBoss({ finale: newFinale(30) })).toBe('The Hollow King');
  });
});

describe('the Victory and Endless', () => {
  /** A run on its Final wave with the boss just slain and the field clear. */
  const beaten = (): TrainingRun => Object.assign(blankRun(), { phase: 'wave', wave: F.from, cleared: F.from - 1, finale: { ...newFinale(F.from), slain: true } });

  it('holds the run for the choice, then goes on into Endless', () => {
    const run = beaten();
    step(run, 0.05);
    expect(run.phase).toBe('build');
    expect(run.finale?.victory).toBe('pending');
    expect(startProblem(run)).toMatch(/Victory/);
    continueEndless(run);
    expect(inEndless(run)).toBe(true);
    run.cleared = F.from + 3;
    expect(endlessDepth(run)).toBe(3);
  });

  it('banks a Victory once, the first noted', () => {
    const run = beaten();
    step(run, 0.05);
    bankVictory(run);
    expect(run.phase).toBe('over');
    const f = forceOf([F.bars[F.from + F.step]]);
    expect(bankFinale(f, run, '2026-10-24')).toEqual([`First Victory at the Final wave ${F.from}`, `The Final wave ${F.from + F.step} opens`]);
    expect(bankFinale(f, run, '2026-10-25')).toEqual([]);
    expect(f.finale?.wins[F.from]).toBe('2026-10-24');
  });
});

describe('the Weekly Siege', () => {
  it('meets a lone colossus of siegeHp at the Final', () => {
    const run = Object.assign(blankRun(), { siege: '2026-W43', wave: F.from, finale: newFinale(40, true) });
    expect(run.finale.final).toBe(F.from);
    const plans = finalePlan(run, planFor(run, 750, F.from));
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ hp: F.siegeHp, final: true, at: 0 });
    run.finale.dealt = 1234.4;
    expect(siegeDmg(run)).toBe(1234);
  });

  it('ranks any damage above every force that fell before the colossus', () => {
    const rows = [{ score: 24, cleared: 23 }, { dmg: 10, score: 25, cleared: 24 }, { dmg: 500, score: 25, cleared: 24 }, { score: 12, cleared: 11 }];
    expect([...rows].sort(siegeOrder).map((r) => r.dmg ?? r.score)).toEqual([500, 10, 24, 12]);
  });
});

describe('the climb past wave 25', () => {
  it('is flat to 25, then climbs, steeper in Endless', () => {
    expect(climbAt(F.from)).toBe(1);
    expect(climbAt(30, 50)).toBeCloseTo(F.climb ** 5);
    expect(climbAt(31, 25) / climbAt(30, 25)).toBeGreaterThan(climbAt(27, 25) / climbAt(26, 25));
  });

  it('has no cliff after a boss wave (wave 26 was 2.81 times wave 25)', () => {
    for (const final of [25, 50]) {
      for (let w = 26; w <= 60; w++) {
        if (isFlyWave(w)) continue;
        const prev = isFlyWave(w - 1) ? w - 2 : w - 1;
        const r = escorts(w, final) / escorts(prev, final);
        expect(r, `wave ${w} / ${prev} (Final ${final})`).toBeLessThan(prev === w - 2 ? 1.8 : 1.5);
      }
    }
  });
});
