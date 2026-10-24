import { describe, expect, it } from 'vitest';
import { SORTIE, TRAINING } from '../downtimeData';
import { holdTime } from './holds';
import { unsaved } from './harm';
import { isNemesisWave, nemesisPlan, nemesisTick, nemesisTricks, pickNemesis, sigText } from './nemesis';
import { blankRun, testEnemy, testUnit } from './testRun';
import type { RunNemesis, TrainingRun } from './types';
import { createRun, endRun } from './run';
import { planWave, speedOf } from './waves';

// The force's Sortie nemesis as the boss of wave TRAINING.shared.nemesis.wave.

const N = TRAINING.shared.nemesis;
const nem = (o: Partial<RunNemesis> = {}): RunNemesis => ({ id: 'butcher', name: 'Gorrhul', grudge: 1, rematch: 0, sig: 'rage', sigName: 'Mounting Rage', ...o });

/** A wave run with the nemesis on the field. */
function field(n: RunNemesis): TrainingRun {
  const run = blankRun();
  run.phase = 'wave';
  run.wave = N.wave;
  run.nemesis = n;
  run.enemies.push(testEnemy({ kind: 'lord', x: 20.5, y: 32, nem: { born: 0, speed: 1, hard: 0, next: 0, regen: 0 } }));
  return run;
}

describe('nemesis', () => {
  it('is the lord with the biggest grudge, with a rematch trick per Sortie kill', () => {
    expect(pickNemesis(undefined)).toBeUndefined();
    expect(pickNemesis({ nemesis: {} })).toBeUndefined();
    const n = pickNemesis({ nemesis: { butcher: 1, horror: 2 }, bestiary: { 'lord:horror': { met: 3, slain: 5 } } });
    expect(n).toMatchObject({ id: 'horror', grudge: 2, rematch: SORTIE.rematch.tricks.length, sig: 'dive' });
    expect(pickNemesis({ nemesis: { horror: 1, butcher: 1 } })?.id).toBe('butcher');
  });

  it('comes with the run (plain JSON), and the run rolls its quirks as it ends', () => {
    const run = createRun('f', [], 1, { nemesis: { screecher: 2 } });
    expect(run.nemesis).toMatchObject({ id: 'screecher', grudge: 2, sig: 'dirge' });
    expect(createRun('f', [], 1).nemesis).toBeUndefined();
    endRun(run, 'Done.');
    expect(run.gains).toEqual([]);
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });

  it('takes the boss’s place on its wave, tougher for its grudge, once', () => {
    const run = blankRun();
    run.wave = N.wave;
    run.nemesis = nem({ grudge: 2 });
    const plain = planWave({ ...blankRun(), rng: run.rng }, N.wave).find((s) => s.kind === 'lord')!;
    const plans = nemesisPlan(run, planWave(run, N.wave));
    const lord = plans.find((s) => s.kind === 'lord')!;
    expect(lord.nemesis).toBe(true);
    expect(lord.hp).toBeCloseTo(plain.hp * (1 + 2 * N.hp));
    run.nemesis.slain = true;
    expect(isNemesisWave(run, N.wave)).toBe(false);
    expect(isNemesisWave({ ...run, nemesis: nem() }, N.wave - 5)).toBe(false);
  });

  it('says what every signature and trick does', () => {
    for (const s of ['rage', 'dive', 'dirge', 'tremor', 'dread', 'brood']) expect(sigText(s)).not.toBe('');
    expect(nemesisTricks(nem({ rematch: 3 })).map((t) => t.name)).toEqual(['Mounting Rage', 'Hardened', 'Vengeful', 'Regenerating']);
  });

  it('rages faster, and Vengeful on top', () => {
    const run = field(nem({ rematch: 2 }));
    run.t = 10;
    nemesisTick(run, 0.05);
    const e = run.enemies[0];
    expect(e.nem!.speed).toBeCloseTo((1 + Math.min(N.rage.max, N.rage.per * 10)) * N.vengeful);
    expect(speedOf(run, e)).toBeGreaterThan(speedOf(run, { ...e, nem: undefined }));
    expect(e.nem!.hard).toBe(SORTIE.rematch.def);
  });

  it('Hardened saves better', () => {
    const tries = (hard: number) => {
      const run = blankRun(9);
      const e = testEnemy({ kind: 'lord', nem: { born: 0, speed: 1, hard, next: 0, regen: 0 } });
      let n = 0;
      for (let i = 0; i < 600; i++) if (unsaved(run, e, 0)) n++;
      return n;
    };
    expect(tries(1)).toBeLessThan(tries(0));
  });

  it('with Dread, can’t be held', () => {
    const run = field(nem({ sig: 'dread' }));
    nemesisTick(run, 0.05);
    expect(holdTime(run, testUnit({ tough: 6 }), run.enemies[0])).toBe(0);
  });

  it('sings a dirge: towers near it at -1 to hit while it sounds', () => {
    const run = field(nem({ sig: 'dirge' }));
    const near = testUnit();
    const far = testUnit({ x: 2, y: 2 });
    run.pieces.push(near, far);
    nemesisTick(run, 0.05);
    expect(near.boost.hit).toBe(-1);
    expect(far.boost.hit).toBe(0);
  });

  it('stamps the base, broods Swarmlings, dives out of holds', () => {
    const tremor = field(nem({ sig: 'tremor' }));
    for (let t = 0; t < N.tremor.every + 0.1; t += 0.05) nemesisTick(tremor, 0.05);
    expect(tremor.baseHp).toBe(TRAINING.baseHp - N.tremor.dmg);

    const brood = field(nem({ sig: 'brood' }));
    for (let t = 0; t < N.brood.every + 0.1; t += 0.05) nemesisTick(brood, 0.05);
    expect(brood.enemies.filter((e) => e.kind === 'swarm')).toHaveLength(N.brood.n);

    const dive = field(nem({ sig: 'dive' }));
    const t = testUnit({ tough: 3 });
    dive.pieces.push(t);
    const e = dive.enemies[0];
    Object.assign(t, { holding: e.id, holdLeft: 5 });
    e.heldBy = t.id;
    const was = { x: e.x, y: e.y };
    for (let s = 0; s < N.dive.every + 0.1; s += 0.05) nemesisTick(dive, 0.05);
    expect(e.heldBy).toBeUndefined();
    expect(t.holding).toBeUndefined();
    expect(Math.hypot(e.x - was.x, e.y - was.y)).toBeGreaterThan(1);
  });

  it('regenerates with the third trick', () => {
    const run = field(nem({ rematch: 3 }));
    const e = run.enemies[0];
    e.hp = 50;
    for (let t = 0; t < N.regenEvery + 0.1; t += 0.05) nemesisTick(run, 0.05);
    expect(e.hp).toBeCloseTo(50 + 100 * N.regen);
  });
});
