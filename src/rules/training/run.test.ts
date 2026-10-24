import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import maze from '../trainingTestMaze.json';
import { pieceById, placeProblem } from './board';
import { craft, craftProblem, createRun, endRun, mvp, quitRun, runXp, startProblem, startWave, step, takeXp } from './run';
import { keep, keepOptions, placeDraft, shardPiece } from './shards';
import type { TrainingRun, UnitTower } from './types';

// A run end to end: create, draft, craft, a wave stepped to its end, XP and the finish.

const bookForce = (file: string): Unit[] => {
  const book = normalizeBook(JSON.parse(readFileSync(file, 'utf8')));
  return book.units.map((cu) => unitFromCatalog(cu, applySelection(cu, {}), book));
};
const FORCE = bookForce('armies/void-echoes.gf.json').slice(0, 8);

/** Lay the hand down at the next legal maze spots; returns the cursor moved on. */
function placeHand(run: TrainingRun, at = 0): number {
  while (run.draft.hand.length) {
    const s = maze[at++];
    if (!placeProblem(run, s.x, s.y)) placeDraft(run, 0, s.x, s.y);
  }
  return at;
}

/** Step a wave to its end (or `secs` of game time). */
function playWave(run: TrainingRun, secs = 900) {
  for (let t = 0; t < secs && run.phase === 'wave'; t += 0.05) step(run, 0.05);
}

describe('training run', () => {
  it('starts in the build phase with recipes, cover, credits and a draft in hand', () => {
    const run = createRun('f1', FORCE, 7);
    expect(run.phase).toBe('build');
    expect(run.recipes).toHaveLength(FORCE.length);
    expect(run.power).toBe(FORCE.reduce((n, u) => n + u.points, 0));
    expect(run.cover.length).toBeGreaterThanOrEqual(TRAINING.cover.patches[0]);
    expect(run.credits).toBe(TRAINING.credits.start);
    expect(run.draft.hand).toHaveLength(TRAINING.shards.draw);
    expect(startProblem(run)).toMatch(/draft/);
  });

  it('plays a draft and a wave through to the next build phase', () => {
    const run = createRun('f1', FORCE, 3);
    placeHand(run);
    expect(run.draft.step).toBe('keep');
    keep(run, keepOptions(run)[0]);
    expect(startProblem(run)).toBeNull();
    startWave(run);
    expect(run.queue.length).toBeGreaterThan(0);
    playWave(run);
    expect(run.phase).toBe('build');
    expect(run.cleared).toBe(1);
    expect(run.draft.step).toBe('place');
    expect(run.credits).toBeGreaterThan(TRAINING.credits.start);
  });

  it('crafts a unit onto one of the Shards its recipe uses; the rest crumble', () => {
    const run = createRun('f1', FORCE, 5);
    const r = run.recipes[0];
    const ids = r.slots.map((s, i) => {
      const p = shardPiece(run.nextId++, maze[i * 3], s.type, s.grade, false);
      run.pieces.push(p);
      return p.id;
    });
    expect(craftProblem(run, r.unitId, ids, 999)).toMatch(/stand on/);
    craft(run, FORCE[0], ids, ids[0]);
    const t = pieceById(run, ids[0]) as UnitTower;
    expect(t.kind).toBe('unit');
    expect(t.unitId).toBe(r.unitId);
    for (const id of ids.slice(1)) expect(pieceById(run, id)?.kind).toBe('rubble');
    expect(run.crafted).toEqual([r.unitId]);
    expect(craftProblem(run, r.unitId, ids, ids[0])).toBeTruthy();
    expect(run.draft.step).toBe('place');
  });

  it('a craft with this draft’s pieces stands in for the keep', () => {
    const run = createRun('f1', FORCE, 9);
    const r = run.recipes[0];
    run.draft.hand = r.slots.map((s) => ({ type: s.type, grade: s.grade }));
    placeHand(run);
    const uses = [...run.draft.placed];
    expect(craftProblem(run, r.unitId, uses, uses[1])).toBeNull();
    craft(run, FORCE[0], uses, uses[1]);
    expect(run.draft.step).toBe('done');
    expect(pieceById(run, uses[1])?.kind).toBe('unit');
  });

  it('gives crafted units XP every xpEvery waves cleared, banked once', () => {
    const run = createRun('f1', FORCE, 2);
    const r = run.recipes[0];
    const p = shardPiece(run.nextId++, maze[0], r.slots[0].type, 5, false);
    run.pieces.push(p);
    const ids = [p.id, ...r.slots.slice(1).map((s, i) => {
      const q = shardPiece(run.nextId++, maze[(i + 1) * 3], s.type, 5, false);
      run.pieces.push(q);
      return q.id;
    })];
    craft(run, FORCE[0], ids, p.id);
    for (let w = 1; w <= TRAINING.xpEvery; w++) {
      run.phase = 'wave';
      run.wave = w;
      step(run, 0.05);
    }
    expect(run.cleared).toBe(TRAINING.xpEvery);
    expect(runXp(run)).toEqual({ [r.unitId]: TRAINING.xpPerWave });
    expect(takeXp(run)).toEqual({ [r.unitId]: TRAINING.xpPerWave });
    expect(takeXp(run)).toEqual({});
    expect(mvp(run)?.unitId).toBe(r.unitId);
  });

  it('counts the waves cleared from the first with nothing through, and stops at the first leak (Gatekeeper)', () => {
    const run = createRun('f1', FORCE, 2);
    const clear = (leaked: number) => {
      run.phase = 'wave';
      run.wave += 1;
      run.leaked = leaked;
      step(run, 0.05);
    };
    clear(0);
    clear(0);
    expect(run.clean).toBe(2);
    clear(1);
    clear(0);
    expect(run.cleared).toBe(4);
    expect(run.clean).toBe(2);
  });

  it('ends when the base falls, and a quit ends it once', () => {
    const run = createRun('f1', FORCE, 4);
    run.phase = 'wave';
    run.baseHp = 0;
    run.queue = [{ kind: 'drone', at: 99, leg: 0, x: 5, y: 5, hp: 1, flies: false }];
    step(run, 0.05);
    expect(run.phase).toBe('over');
    expect(run.queue).toEqual([]);
    const lines = run.log.length;
    quitRun(run);
    endRun(run, 'again');
    expect(run.log).toHaveLength(lines);
    expect(startProblem(run)).toMatch(/over/);
  });
});
