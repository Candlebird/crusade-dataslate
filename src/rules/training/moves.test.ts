import { describe, expect, it } from 'vitest';
import { newUnit } from '../../model/factory';
import { N, noBuild, open } from './map';
import { ambushSwap, ambushSwapProblem, hasMoved, scoutMove, scoutMoveProblem } from './moves';
import { unitTower } from './recipes';
import { shardPiece, toRubble } from './shards';
import { startWave } from './run';
import { blankRun, testUnit } from './testRun';
import type { RubblePiece, TrainingRun } from './types';

// Scout and Ambush: one move a build phase, the route kept open.

/** A spot (top-left) nothing on `run` covers that a piece could go on, scanning from (x0, y0). */
function freeSpot(run: TrainingRun, x0: number, y0: number) {
  for (let y = y0; y < N - 1; y += 2) for (let x = x0; x < N - 1; x += 2) {
    const at = { x, y };
    if (!noBuild(x, y) && !run.pieces.some((p) => Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1) && open([...run.pieces, at])) return at;
  }
  throw new Error('no spot');
}

describe('Scout and Ambush', () => {
  it('a unit takes the rules from its datasheet', () => {
    const u = (rules: string[]) => unitTower(newUnit({ id: 'u', name: 'U', category: 'Infantry', points: 100, rules }), 1, { x: 20, y: 30 }, 0);
    expect(u(['Scout'])).toMatchObject({ scout: true });
    expect(u(['Ambush'])).toMatchObject({ ambush: true });
    expect(u([]).scout).toBeUndefined();
    expect(u([]).ambush).toBeUndefined();
  });

  it('Scout: once a build phase, to an open spot only', () => {
    const run = blankRun();
    const t = testUnit({ scout: true });
    const plain = testUnit({ x: 30, y: 30 });
    run.pieces.push(t, plain);
    const to = freeSpot(run, 10, 10);
    expect(scoutMoveProblem(run, plain.id, to.x, to.y)).toMatch(/Scout/);
    expect(scoutMoveProblem(run, t.id, plain.x, plain.y + 1)).toMatch(/stands/);
    expect(scoutMoveProblem(run, t.id, -1, 0)).toMatch(/off the map/);
    expect(scoutMoveProblem(run, t.id, t.x + 1, t.y)).toBeNull(); // overlapping its own old spot is fine
    scoutMove(run, t.id, to.x, to.y);
    expect(t).toMatchObject(to);
    expect(hasMoved(run, t.id)).toBe(true);
    expect(scoutMoveProblem(run, t.id, 20, 30)).toMatch(/already moved/);
    expect(() => scoutMove(run, t.id, 20, 30)).toThrow();
    run.phase = 'wave';
    expect(scoutMoveProblem(run, t.id, 20, 30)).toMatch(/between waves/);
  });

  it('Scout: never walls the route off', () => {
    // A wall of rubble across the map with one gap: the gap can't be filled.
    for (let c = 6; c < N - 2; c += 2) {
      const run = blankRun();
      const ys = Array.from({ length: Math.floor(N / 2) }, (_, i) => i * 2);
      const gap = ys.find((y) => !noBuild(c, y));
      if (gap === undefined || ys.some((y) => y !== gap && noBuild(c, y))) continue;
      run.pieces.push(...ys.filter((y) => y !== gap).map((y): RubblePiece => ({ kind: 'rubble', id: run.nextId++, x: c, y })));
      if (!open(run.pieces) || open([...run.pieces, { x: c, y: gap }])) continue;
      const t = testUnit({ scout: true, ...freeSpot(run, c + 2, 0) });
      run.pieces.push(t);
      expect(scoutMoveProblem(run, t.id, c, gap)).toMatch(/wall/);
      return;
    }
    throw new Error('no column for the wall');
  });

  it('Ambush: swaps with another piece once a build phase; a new wave gives the move back', () => {
    const run = blankRun();
    const t = testUnit({ ambush: true });
    const s = shardPiece(run.nextId++, freeSpot(run, 10, 10), 'assault', 1, false);
    const r = shardPiece(run.nextId++, freeSpot({ ...run, pieces: [...run.pieces, s] }, 30, 10), 'swift', 1, false);
    run.pieces.push(t, s, r);
    toRubble(run, [r.id]);
    expect(ambushSwapProblem(run, t.id, t.id)).toMatch(/another/);
    expect(ambushSwapProblem(run, t.id, 999)).toMatch(/another/);
    expect(ambushSwapProblem(run, s.id, t.id)).toMatch(/crafted unit/);
    const [ts, ss] = [{ x: t.x, y: t.y }, { x: s.x, y: s.y }];
    ambushSwap(run, t.id, s.id);
    expect(t).toMatchObject(ss);
    expect(s).toMatchObject(ts);
    expect(ambushSwapProblem(run, t.id, r.id)).toMatch(/already moved/);
    expect(scoutMoveProblem(run, t.id, 0, 0)).toMatch(/Scout/);
    run.credits = 0;
    startWave(run);
    expect(run.moved).toBeUndefined();
    run.phase = 'build';
    expect(ambushSwapProblem(run, t.id, r.id)).toBeNull(); // rubble too
  });
});
