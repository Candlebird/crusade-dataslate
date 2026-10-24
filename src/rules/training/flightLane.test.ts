import { describe, expect, it } from 'vitest';
import { SHARD_TYPES } from '../downtimeData';
import { fire } from './combat';
import { antiAir, LANE, laneCells, laneDist, spotsBy } from './flightLane';
import { rangeCells } from './harm';
import { shardPiece } from './shards';
import { blankRun, testEnemy } from './testRun';
import { WAYPOINTS } from './map';

describe('the flight lane', () => {
  it('runs spawn to each pad to the base', () => {
    expect(LANE).toHaveLength(WAYPOINTS.length - 1);
    expect(laneDist(LANE[0].a.x, LANE[0].a.y)).toBe(0);
    expect(laneCells().length).toBeGreaterThan(100);
  });

  it('every leg can be covered by Firepower and Swift Shards built beside it', () => {
    const fp = rangeCells(SHARD_TYPES.firepower.gun.range);
    const sw = rangeCells(SHARD_TYPES.swift.gun.range);
    for (const l of LANE) {
      expect(spotsBy(l, fp).length).toBeGreaterThan(10);
      expect(spotsBy(l, sw).length).toBeGreaterThan(4);
    }
  });

  it('Firepower and Swift do more to flyers', () => {
    expect(antiAir('firepower')).toBeGreaterThan(1);
    expect(antiAir('swift')).toBeGreaterThan(1);
    expect(antiAir('bulwark')).toBe(1);
    const dealt = (flies: boolean) => {
      const run = blankRun(3);
      const t = shardPiece(1, { x: 20, y: 30 }, 'firepower', 5, false);
      t.quality = 2;
      run.pieces.push(t);
      const e = testEnemy({ flies, hp: 1e6, maxHp: 1e6 });
      run.enemies.push(e);
      for (let i = 0; i < 400; i++) fire(run, t, t.guns[0]);
      return 1e6 - e.hp;
    };
    expect(dealt(true) / dealt(false)).toBeCloseTo(SHARD_TYPES.firepower.air!, 1);
  });
});
