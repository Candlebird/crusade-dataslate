import { describe, expect, it } from 'vitest';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import maze from '../trainingTestMaze.json';
import { WAYPOINTS, centre, mapFor, open, route, routeLength } from './map';
import { blankRun } from './testRun';
import type { Enemy, RubblePiece, TrainingRun } from './types';
import {
  isBossWave, isFlyBossWave, isFlyWave, layCover, leakCost, planWave, previewGroups, previewWave, runCover, spawnDue,
  speedOf, walk, waveBudget,
} from './waves';

// Waves: planning, spawning, walking and leaks.

const W = TRAINING.wave;

const foe = (kind: Enemy['kind'], o: Partial<Enemy> = {}): Enemy => {
  const c = centre(WAYPOINTS[o.leg ?? 0]);
  return { id: 1, kind, x: c.x, y: c.y, leg: 0, hp: 5, maxHp: 5, flies: false, status: {}, dots: [], regrab: 0, ...o };
};

/** The test maze as rubble, keeping only the spots that leave the route open. */
function mazeRun(): TrainingRun {
  const run = blankRun();
  for (const s of maze as { n: number; x: number; y: number }[]) {
    const p: RubblePiece = { id: s.n, x: s.x, y: s.y, kind: 'rubble' };
    if (open([...run.pieces, p])) run.pieces.push(p);
  }
  return run;
}

/** Walk one enemy until it leaks (or `max` seconds pass); the seconds it took. */
function timeToLeak(run: TrainingRun, e: Enemy, max = 600): number {
  run.enemies = [e];
  let t = 0;
  while (run.enemies.length && t < max) {
    walk(run, 0.05);
    t += 0.05;
  }
  return t;
}

describe('wave kinds', () => {
  it('flyers every 4th, a boss every 5th, a flying boss every 20th', () => {
    expect([1, 2, 3, 4, 8].map(isFlyWave)).toEqual([false, false, false, true, true]);
    expect([4, 5, 10, 11].map(isBossWave)).toEqual([false, true, true, false]);
    expect([5, 20, 40, 60].map(isFlyBossWave)).toEqual([false, true, true, true]);
  });
});

describe('planWave', () => {
  it('spends a budget that grows 12% a wave and scales with the force', () => {
    expect(waveBudget(1000, 2) / waveBudget(1000, 1)).toBeCloseTo(W.growth);
    expect(waveBudget(2000, 3)).toBeCloseTo(2 * waveBudget(1000, 3));
    const run = blankRun();
    const cost = (w: number) => planWave(run, w).reduce((n, s) => n + TRAINING_ENEMIES[s.kind].cost, 0);
    expect(cost(3)).toBeLessThanOrEqual(waveBudget(run.power, 3));
    expect(cost(14)).toBeGreaterThan(cost(2));
  });

  it('is sorted, staggered and repeatable from the dice', () => {
    const a = planWave(blankRun(7), 9);
    expect(a).toEqual(planWave(blankRun(7), 9));
    expect(a.map((s) => s.at)).toEqual([...a.map((s) => s.at)].sort((x, y) => x - y));
    expect(new Set(a.map((s) => s.at)).size).toBe(a.length);
  });

  it('flies every flying wave, never otherwise', () => {
    expect(planWave(blankRun(), 4).every((s) => s.flies)).toBe(true);
    expect(planWave(blankRun(), 6).some((s) => s.flies)).toBe(false);
  });

  it('brings one Echo Lord every boss wave, flying on wave 20', () => {
    for (const w of [5, 10, 20]) {
      const p = planWave(blankRun(), w);
      expect(p.filter((s) => s.kind === 'lord')).toHaveLength(1);
      expect(p.every((s) => s.flies)).toBe(w === 20);
    }
    expect(planWave(blankRun(), 6).some((s) => s.kind === 'lord')).toBe(false);
  });

  it('sends Scouts in on pad 1 and Ambushers from the spawn, both with less HP', () => {
    const plans = Array.from({ length: 20 }, (_, i) => planWave({ ...blankRun(i + 1), power: 2000 }, 9)).flat();
    const base = (k: Enemy['kind']) => TRAINING_ENEMIES[k].hp * TRAINING.enemyHp;
    const scout = plans.find((s) => s.kind === 'outrider' && !s.vet)!;
    const amb = plans.find((s) => s.kind === 'stalker' && !s.vet)!;
    expect(scout.leg).toBe(TRAINING.route.scoutAt);
    expect(scout.hp).toBeCloseTo(base('outrider') * W.scoutHp);
    expect(amb.leg).toBe(0);
    expect(amb.hp).toBeCloseTo(base('stalker') * W.ambushHp);
  });

  it('has veterans only from vetFrom, and HP growth past hpFrom', () => {
    expect(planWave(blankRun(), W.vetFrom - 1).some((s) => s.vet)).toBe(false);
    const swarm = planWave({ ...blankRun(), power: 10 / waveBudget(1, W.hpFrom + 4) }, W.hpFrom + 4).find((s) => s.kind === 'swarm' && !s.vet)!;
    expect(swarm.hp).toBeCloseTo(TRAINING_ENEMIES.swarm.hp * TRAINING.enemyHp * W.hpGrowth ** 4);
  });

  it('previews the next wave without rolling the run\'s dice', () => {
    const run = blankRun(3);
    run.wave = 6;
    const rng = run.rng;
    const p = previewWave(run);
    expect(run.rng).toBe(rng);
    expect(p).toEqual(planWave(run, 7));
    const g = previewGroups(p);
    expect(g.reduce((n, x) => n + x.n, 0)).toBe(p.length);
  });
});

describe('cover', () => {
  it('lays apart, off the pads, most of it on the route', () => {
    const r = { rng: 5 };
    const path = route(mapFor([]));
    const cover = layCover(r, 8, path);
    expect(cover).toHaveLength(8);
    const s = TRAINING.cover.size;
    for (const c of cover) {
      expect(WAYPOINTS.some((t) => c.x <= t.x + 1 && t.x <= c.x + s - 1 && c.y <= t.y + 1 && t.y <= c.y + s - 1)).toBe(false);
      expect(cover.filter((d) => Math.abs(d.x - c.x) < s && Math.abs(d.y - c.y) < s)).toHaveLength(1);
    }
    const onPath = cover.filter((c) => path.some((p) => p.x >= c.x && p.x < c.x + s && p.y >= c.y && p.y < c.y + s));
    expect(onPath.length).toBeGreaterThanOrEqual(Math.round(8 * TRAINING.cover.onRoute));
    const n = runCover({ rng: 9 }).length;
    expect(n).toBeGreaterThanOrEqual(TRAINING.cover.patches[0]);
    expect(n).toBeLessThanOrEqual(TRAINING.cover.patches[1]);
  });
});

describe('spawning and walking', () => {
  it('spawns what is due, with fresh ids', () => {
    const run = blankRun();
    run.queue = planWave(run, 3);
    run.nextId = 50;
    run.t = run.queue[1].at;
    spawnDue(run);
    expect(run.enemies.length).toBeGreaterThanOrEqual(2);
    expect(run.enemies[0]).toMatchObject({ id: 50, hp: run.enemies[0].maxHp, dots: [], regrab: 0 });
  });

  it('crosses the test maze in about 60-90 s at drone speed', () => {
    const run = mazeRun();
    expect(routeLength(mapFor(run.pieces))).toBeGreaterThan(1300);
    const t = timeToLeak(run, foe('drone'));
    expect(t).toBeGreaterThan(60);
    expect(t).toBeLessThan(90);
    expect(run.leaked).toBe(1);
    expect(run.baseHp).toBe(TRAINING.baseHp - 1);
  });

  it('flies straight pad to pad, ignoring the maze', () => {
    expect(timeToLeak(mazeRun(), foe('drone', { flies: true }))).toBeLessThan(15);
  });

  it('stands still held or stunned, and goes at half speed slowed', () => {
    const run = blankRun();
    const held = foe('drone', { heldBy: 3 });
    const stunned = foe('drone', { id: 2, status: { stun: 1 } });
    run.enemies = [held, stunned];
    walk(run, 1);
    expect([held.x, held.y, stunned.x, stunned.y]).toEqual([5, 5, 5, 5]);
    const slowed = foe('drone', { status: { slow: 1 } });
    expect(speedOf(run, slowed)).toBeCloseTo(TRAINING_ENEMIES.drone.speed * TRAINING.walkMul * TRAINING.slowMul);
  });

  it('jumps an Ambusher from pad ambushFrom to pad ambushAt', () => {
    const run = blankRun();
    const p = centre(WAYPOINTS[TRAINING.route.ambushFrom]);
    const e = foe('stalker', { x: p.x, y: p.y - 0.5 });
    run.enemies = [e];
    walk(run, 0.1);
    const to = centre(WAYPOINTS[TRAINING.route.ambushAt]);
    expect(e).toMatchObject({ leg: TRAINING.route.ambushAt, jumped: true, x: to.x, y: to.y });
  });

  it('leaks 1, 3 for heavy or veteran, 10 for the boss', () => {
    expect(leakCost(foe('drone'))).toBe(1);
    expect(leakCost(foe('drone', { vet: true }))).toBe(3);
    expect(['brute', 'carapace', 'mirror'].map((k) => leakCost(foe(k as Enemy['kind'])))).toEqual([3, 3, 3]);
    expect(leakCost(foe('lord'))).toBe(10);
  });
});
