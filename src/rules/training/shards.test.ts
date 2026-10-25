import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { pieceAt } from './board';
import {
  clearProblem, clearRubble, crumbleDraft, drawDraft, gradeName, keep, keepOptions, keepProblem, placeDraft, placeDraftProblem,
  rollGrade, shardDps, shardPiece, shardValue, toRubble,
} from './shards';
import { blankRun } from './testRun';
import type { DrawnShard, Grade, ShardPiece, TrainingRun } from './types';

// Shards: the draft, merges, rubble, a Shard's tower.

/** A run with this hand, placed at (12 + 3i, 30) in order: the draft at 'keep'. */
function placedRun(hand: DrawnShard[]): TrainingRun {
  const run = blankRun();
  run.draft = { step: 'place', hand: hand.map((h) => ({ ...h })), placed: [] };
  hand.forEach((_, i) => placeDraft(run, 0, 12 + 3 * i, 30));
  return run;
}

const s = (type: DrawnShard['type'], grade: Grade): DrawnShard => ({ type, grade });

describe('grades and draws', () => {
  it('values double a grade', () => {
    expect([1, 2, 3, 4, 5].map((g) => shardValue(g as Grade))).toEqual([1, 2, 4, 8, 16]);
    expect(gradeName(1)).toBe('Cracked');
    expect(gradeName(5)).toBe('Pristine');
  });

  it('luck 0 only draws Cracked; luck 7 draws every grade', () => {
    const run = blankRun(7);
    for (let i = 0; i < 50; i++) expect(rollGrade(run)).toBe(1);
    run.luck = 7;
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(rollGrade(run));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('draws a hand of five, the same for the same dice', () => {
    const a = blankRun(3);
    const b = blankRun(3);
    drawDraft(a);
    drawDraft(b);
    expect(a.draft.step).toBe('place');
    expect(a.draft.hand).toHaveLength(TRAINING.shards.draw);
    expect(a.draft.hand).toEqual(b.draft.hand);
  });
});

describe('placing', () => {
  it('places draft pieces and moves to keep when the hand is empty', () => {
    const run = blankRun();
    drawDraft(run);
    for (let i = 0; i < 5; i++) placeDraft(run, 0, 12 + 3 * i, 30);
    expect(run.draft.step).toBe('keep');
    expect(run.draft.placed).toHaveLength(5);
    expect(run.pieces.every((p) => p.kind === 'shard' && p.draft)).toBe(true);
  });

  it('refuses bad spots and the wrong phase', () => {
    const run = blankRun();
    drawDraft(run);
    expect(placeDraftProblem(run, 0, 2, 2)).not.toBeNull();
    placeDraft(run, 0, 12, 30);
    expect(placeDraftProblem(run, 0, 13, 30)).not.toBeNull();
    expect(placeDraftProblem(run, 9, 20, 30)).not.toBeNull();
    run.phase = 'wave';
    expect(placeDraftProblem(run, 0, 20, 30)).not.toBeNull();
    expect(() => placeDraft(run, 0, 20, 30)).toThrow();
  });

  it('refuses a piece that seals the route', () => {
    // A wall across rows 14–15 with one 2-cell gap at x = 30: plugging the gap cuts the route.
    const run = blankRun();
    for (let x = 0; x < TRAINING.mapSize; x += 2) if (x !== 30) run.pieces.push({ id: run.nextId++, x, y: 14, kind: 'rubble' });
    run.draft = { step: 'place', hand: [s('swift', 1)], placed: [] };
    expect(placeDraftProblem(run, 0, 30, 14)).toMatch(/route/);
  });
});

describe('keeping and merging', () => {
  it('offers a plain keep for each piece, and merges of 2 and 4 alike', () => {
    const run = placedRun([s('swift', 2), s('swift', 2), s('swift', 2), s('swift', 2), s('blast', 1)]);
    const opts = keepOptions(run);
    const [first, , , , last] = run.draft.placed;
    const mine = opts.filter((o) => o.pieceId === first && !o.down);
    expect(mine.map((o) => o.grade)).toEqual([2, 3, 4]);
    expect(mine[2].with).toHaveLength(3);
    expect(opts.filter((o) => o.pieceId === last)).toEqual([{ pieceId: last, grade: 1, with: [] }]);
  });

  it('caps merges at Pristine', () => {
    const run = placedRun([s('vigor', 4), s('vigor', 4), s('vigor', 4), s('vigor', 4), s('vigor', 5)]);
    const opts = keepOptions(run);
    expect(Math.max(...opts.map((o) => o.grade))).toBe(5);
    expect(opts.filter((o) => o.pieceId === run.draft.placed[0] && !o.down).map((o) => o.grade)).toEqual([4, 5]);
    expect(opts.filter((o) => o.pieceId === run.draft.placed[4] && !o.down)).toHaveLength(1);
  });

  it('keeps one (graded up), and the rest crumble', () => {
    const run = placedRun([s('breach', 1), s('breach', 1), s('firepower', 3), s('assault', 1), s('command', 2)]);
    const opt = keepOptions(run).find((o) => o.pieceId === run.draft.placed[1] && o.grade === 2)!;
    keep(run, opt);
    expect(run.draft.step).toBe('done');
    const kept = run.pieces.find((p) => p.kind === 'shard') as ShardPiece;
    expect(kept).toMatchObject({ id: opt.pieceId, grade: 2, draft: false });
    expect(kept.guns[0].attacks).toBe(1);
    expect(run.pieces.filter((p) => p.kind === 'rubble')).toHaveLength(4);
    expect(keepProblem(run, opt)).not.toBeNull();
  });

  it('offers each Shard a grade down too, but never a Cracked one nor with a merge', () => {
    const run = placedRun([s('swift', 4), s('swift', 4), s('blast', 1), s('firepower', 2), s('command', 5)]);
    const downs = keepOptions(run).filter((o) => o.down);
    const [a, b, c, d, e] = run.draft.placed;
    expect(downs).toEqual([
      { pieceId: a, grade: 3, with: [], down: true }, { pieceId: b, grade: 3, with: [], down: true },
      { pieceId: d, grade: 1, with: [], down: true }, { pieceId: e, grade: 4, with: [], down: true },
    ]);
    expect(downs.some((o) => o.pieceId === c)).toBe(false);
  });

  it('keeps a Shard a grade down, and the rest crumble', () => {
    const run = placedRun([s('firepower', 4), s('breach', 1), s('blast', 1), s('assault', 1), s('command', 1)]);
    const opt = keepOptions(run).find((o) => o.pieceId === run.draft.placed[0] && o.down)!;
    expect(keepProblem(run, opt)).toBeNull();
    // A plain keep at the lower grade isn't on offer: the grade down has to say so.
    expect(keepProblem(run, { ...opt, down: undefined })).not.toBeNull();
    keep(run, opt);
    expect(run.pieces.find((p) => p.kind === 'shard')).toMatchObject({ id: opt.pieceId, type: 'firepower', grade: 3, draft: false });
    expect(run.pieces.filter((p) => p.kind === 'rubble')).toHaveLength(4);
  });

  it('refuses a made-up keep', () => {
    const run = placedRun([s('breach', 1), s('firepower', 1), s('blast', 1), s('assault', 1), s('command', 1)]);
    expect(keepProblem(run, { pieceId: run.draft.placed[0], grade: 3, with: [] })).not.toBeNull();
    expect(keepProblem(run, { pieceId: run.draft.placed[0], grade: 1, with: [], down: true })).not.toBeNull();
    expect(() => keep(run, { pieceId: 999, grade: 1, with: [] })).toThrow();
  });

  it('crumbleDraft keeps the exceptions and drops the rest', () => {
    const run = placedRun([s('breach', 1), s('firepower', 1), s('blast', 1), s('assault', 1), s('command', 1)]);
    const [a, b] = run.draft.placed;
    crumbleDraft(run, [a]);
    expect(run.pieces.find((p) => p.id === a)).toMatchObject({ kind: 'shard', draft: false });
    expect(run.pieces.find((p) => p.id === b)?.kind).toBe('rubble');
    expect(run.draft).toEqual({ step: 'done', hand: [], placed: [] });
  });
});

describe('rubble', () => {
  it('turns pieces to rubble in place, and clears it only between waves', () => {
    const run = blankRun();
    run.pieces.push(shardPiece(run.nextId++, { x: 20, y: 20 }, 'blast', 1, false));
    toRubble(run, [1]);
    expect(pieceAt(run, 21, 21)).toEqual({ id: 1, x: 20, y: 20, kind: 'rubble' });
    run.phase = 'wave';
    expect(clearProblem(run, 1)).not.toBeNull();
    run.phase = 'build';
    clearRubble(run, 1);
    expect(run.pieces).toHaveLength(0);
    run.pieces.push(shardPiece(run.nextId++, { x: 20, y: 20 }, 'blast', 1, false));
    expect(clearProblem(run, 2)).not.toBeNull();
  });
});

describe('Shard towers', () => {
  it('get guns from SHARD_TYPES by value', () => {
    const p = shardPiece(1, { x: 20, y: 20 }, 'firepower', 5, false);
    expect(p.guns[0]).toMatchObject({ range: 24, attacks: 16, melee: false });
    expect(p.quality).toBe(TRAINING.shards.quality[4]);
    expect(shardPiece(1, { x: 0, y: 0 }, 'assault', 1, false).guns[0]).toMatchObject({ melee: true, range: 0, attacks: 2 });
    expect(shardPiece(1, { x: 0, y: 0 }, 'breach', 1, false).guns[0].attacks).toBe(1);
  });

  it('do more damage a grade up', () => {
    for (const t of ['assault', 'firepower', 'breach', 'blast', 'bulwark', 'swift', 'command', 'vigor'] as const)
      for (let g = 1; g < 5; g++) expect(shardDps(t, (g + 1) as Grade)).toBeGreaterThanOrEqual(shardDps(t, g as Grade));
  });
});
