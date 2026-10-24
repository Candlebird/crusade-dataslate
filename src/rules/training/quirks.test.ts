import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { rollGains, snubbed, topStat, watchBosses } from './quirks';
import { rand } from './rng';
import { blankRun, testEnemy, testUnit } from './testRun';
import type { TrainingRun } from './types';

// Quirks a run gives: a good one for a long run's MVP, a bad one for a unit a boss walked past untouched.

const Q = TRAINING.shared.quirks;

/** A blank run whose first roll is very low (`r` 0) or very high (`r` 1). */
function rigged(r: number): TrainingRun {
  for (let s = 1; ; s++) {
    const x = rand({ rng: s });
    if (r < 0.5 ? x < 0.05 : x > 0.95) return blankRun(s);
  }
}

describe('quirks', () => {
  it('knows what a unit did most', () => {
    expect(topStat(testUnit())).toBe('shot');
    expect(topStat(testUnit({ tally: { shot: 5, melee: 9, holds: 0 } }))).toBe('melee');
    expect(topStat(testUnit({ tally: { shot: 5, melee: 2, holds: 1 } }))).toBe('holds');
  });

  it('watches the units a boss walks past in reach', () => {
    const run = blankRun();
    run.phase = 'wave';
    const near = testUnit({ unitId: 'near' });
    const far = testUnit({ unitId: 'far', x: 1, y: 1 });
    run.pieces.push(near, far);
    const boss = testEnemy({ kind: 'lord' });
    run.enemies.push(boss, testEnemy());
    watchBosses(run);
    expect(Object.values(run.watch ?? {})).toEqual([{ passed: ['near'], hit: [] }]);
    run.watch![String(boss.id)].hit.push('near');
    expect(snubbed(run).size).toBe(0);
  });

  it('gives the MVP of a long run a good quirk to match, once', () => {
    const run = rigged(0);
    run.wave = Q.goodFrom;
    const t = testUnit({ unitId: 'a', kills: 9, tally: { shot: 1, melee: 50, holds: 0 } });
    run.pieces.push(t);
    const g = rollGains(run);
    expect(g).toEqual([{ unitId: 'a', name: 'Squad', quirk: Q.goods.melee[0], good: true }]);
    expect(rollGains(run)).toBe(g);
  });

  it('gives none before goodFrom, nor one it has', () => {
    const early = rigged(0);
    early.wave = Q.goodFrom - 1;
    early.pieces.push(testUnit({ kills: 9 }));
    expect(rollGains(early)).toEqual([]);
    const has = rigged(0);
    has.wave = Q.goodFrom;
    has.pieces.push(testUnit({ kills: 9, quirks: [Q.goods.shot[0]] }));
    expect(rollGains(has)[0].quirk).toBe(Q.goods.shot[1]);
  });

  it('can leave a bad quirk on a unit a boss passed untouched', () => {
    const run = rigged(0);
    run.wave = 3;
    const t = testUnit({ unitId: 'b' });
    run.pieces.push(t);
    run.watch = { 7: { passed: ['b'], hit: [] } };
    expect(rollGains(run)).toEqual([{ unitId: 'b', name: 'Squad', quirk: Q.bads.shot[0], good: false }]);
    const lucky = rigged(1);
    lucky.pieces.push(testUnit({ unitId: 'b' }));
    lucky.watch = { 7: { passed: ['b'], hit: [] } };
    expect(rollGains(lucky)).toEqual([]);
  });
});
