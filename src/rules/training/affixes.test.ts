import { describe, expect, it } from 'vitest';
import maze from '../trainingTestMaze.json';
import { TRAINING } from '../downtimeData';
import { affixHit, affixPace, affixPlan, affixTick, onEchoDeath } from './affixes';
import { playRun } from './bot';
import { unsaved } from './harm';
import { FORCES } from './testForces';
import { blankRun, testEnemy } from './testRun';
import type { NexusAffixId, SpawnPlan, TowerGun, TrainingRun } from './types';
import { planWave, speedOf } from './waves';

// Threat affixes at work, and a run under threat still goes the distance.

const X = TRAINING.nexus;

const withAffix = (threat: number, ...affixes: NexusAffixId[]): TrainingRun => {
  const run = blankRun(7);
  run.nexus = { threat, affixes, lords: [] };
  return run;
};

const plan = (o: Partial<SpawnPlan> = {}): SpawnPlan => ({ kind: 'drone', at: 0, leg: 0, x: 0, y: 0, hp: 100, flies: false, ...o });
const gun = (o: Partial<TowerGun> = {}) => ({ melee: false, ...o }) as TowerGun;

describe('threat affixes', () => {
  it('do nothing at threat 0 or outside a campaign', () => {
    const plans = [plan()];
    expect(affixPlan({ rng: 1 }, blankRun(), plans)).toEqual([plan()]);
    expect(affixPace(blankRun(), testEnemy())).toBe(1);
  });

  it('Frenzied adds wounds, Proud veterans, Armoured saves, all by threat', () => {
    const f = affixPlan({ rng: 1 }, withAffix(5, 'frenzied'), [plan()]);
    expect(f[0].hp).toBeCloseTo(100 * (1 + 5 * X.frenzied.per));
    const many = () => Array.from({ length: 400 }, () => plan());
    const p = affixPlan({ rng: 1 }, withAffix(6, 'proud'), many());
    expect(p.filter((s) => s.vet).length / 400).toBeCloseTo(6 * X.proud.per, 1);
    const a = affixPlan({ rng: 1 }, withAffix(4, 'armoured'), many());
    expect(a.filter((s) => s.hard).length / 400).toBeCloseTo(4 * X.armoured.share, 1);
    const through = (hard?: number) => {
      const run = blankRun(3);
      const e = testEnemy({ hard });
      let n = 0;
      for (let i = 0; i < 3000; i++) if (unsaved(run, e, 0)) n++;
      return n / 3000;
    };
    expect(through(1)).toBeCloseTo(through() - 1 / 6, 1);
  });

  it('plans the wave with them, bigger under Fierce', () => {
    const run = withAffix(6, 'fierce');
    const plain = blankRun(7);
    const sum = (ps: SpawnPlan[]) => ps.length;
    expect(sum(planWave(run, 8))).toBeGreaterThanOrEqual(sum(planWave(plain, 8)));
  });

  it('Swift, Warp Currents and a Vengeful rush make Echoes walk faster', () => {
    const e = testEnemy();
    const base = speedOf(blankRun(), e);
    expect(speedOf(withAffix(4, 'swift'), e)).toBeCloseTo(base * (1 + 4 * X.swift.per));
    const cur = blankRun();
    cur.nexus = { threat: 0, affixes: [], event: 'warpCurrents', lords: [] };
    expect(speedOf(cur, e)).toBeCloseTo(base * X.events.warpCurrents.walk);
    const run = withAffix(5, 'vengeful');
    const dead = testEnemy({ hp: 0 });
    const near = testEnemy({ x: dead.x + 1 });
    const far = testEnemy({ x: dead.x + 10 });
    run.enemies.push(dead, near, far);
    onEchoDeath(run, dead);
    expect(near.surge).toBeCloseTo(5 * X.vengeful.secs);
    expect(far.surge).toBeUndefined();
    expect(speedOf(run, near)).toBeCloseTo(base * X.vengeful.mul);
    affixTick(run, 10);
    expect(near.surge).toBe(0);
  });

  it('Regenerating mends Echoes but not a boss', () => {
    const run = withAffix(5, 'regenerating');
    const e = testEnemy({ hp: 50 });
    const boss = testEnemy({ kind: 'lord', hp: 50 });
    run.enemies.push(e, boss);
    affixTick(run, 1);
    expect(e.hp).toBeCloseTo(50 + 100 * 5 * X.regenerating.per);
    expect(boss.hp).toBe(50);
  });

  it('Shrouded and the Ion Storm put far shots at -1, never blows', () => {
    const run = withAffix(4, 'shrouded');
    expect(affixHit(run, gun(), 11, 12)).toBe(-1);
    expect(affixHit(run, gun(), 3, 12)).toBe(0);
    expect(affixHit(run, gun({ melee: true }), 11, 12)).toBe(0);
    const ion = blankRun();
    ion.nexus = { threat: 0, affixes: [], event: 'ionStorm', lords: [] };
    expect(affixHit(ion, gun(), X.events.ionStorm.from + 1, 30)).toBe(-1);
    expect(affixHit(ion, gun(), X.events.ionStorm.from - 1, 30)).toBe(0);
  });

  it('a force under threat 4 with two affixes still goes the distance (bot)', () => {
    const nexus = { threat: 4, affixes: ['swift', 'armoured'] as NexusAffixId[], lords: [] };
    const waves = FORCES.slice(0, 4).map((f) => playRun(f.units, 1, { maze, maxWaves: 40, nexus }).cleared);
    const mean = waves.reduce((a, b) => a + b, 0) / waves.length;
    console.log(`threat 4 (swift, armoured): ${waves.join(', ')}; mean ${mean.toFixed(1)}`);
    expect(mean).toBeGreaterThanOrEqual(15);
  }, 120_000);
});
