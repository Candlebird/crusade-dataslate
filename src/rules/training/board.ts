import { TRAINING } from '../downtimeData';
import { centre, mapFor, noBuild, open, overlaps, route, within, type MapState, type Tile } from './map';
import type { Piece, ShardPiece, Tower, TrainingRun, UnitTower } from './types';

// The board as a run stands: which pieces are where, the maze they make, and cover. Read-only helpers every module uses.

export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** The middle of a piece (or any 2×2 at its top-left cell). */
export const centreOf = (p: Tile) => centre(p);

/** The base: its middle, its top-left cell and how close counts as reaching it. */
export const BASE = { ...centre(TRAINING.route.base), tile: TRAINING.route.base, radius: 1.2 };

export const pieceById = (run: TrainingRun, id: number): Piece | undefined => run.pieces.find((p) => p.id === id);

/** The piece covering cell (x, y), if any. */
export const pieceAt = (run: TrainingRun, x: number, y: number): Piece | undefined => run.pieces.find((p) => within(p, x, y));

/** Kept Shards and crafted units: everything that fires during a wave. */
export const towers = (run: TrainingRun): Tower[] => run.pieces.filter((p): p is Tower => p.kind === 'unit' || (p.kind === 'shard' && !p.draft));

export const unitTowers = (run: TrainingRun): UnitTower[] => run.pieces.filter((p): p is UnitTower => p.kind === 'unit');

/** Shards on the map: kept ones, and this draft's when `draft` is set. */
export const shardsOnMap = (run: TrainingRun, draft = true): ShardPiece[] =>
  run.pieces.filter((p): p is ShardPiece => p.kind === 'shard' && (draft || !p.draft));

/** The last maze each run asked for, with the cells it was built from: a wave asks every step, and checking the
 *  cells is far cheaper than map.ts's layout key. */
const last = new WeakMap<TrainingRun, { at: number[]; m: MapState }>();

/** The maze as it stands (every piece blocks its cells). Cached by layout in map.ts. */
export function mapOf(run: TrainingRun): MapState {
  const ps = run.pieces;
  const hit = last.get(run);
  if (hit && hit.at.length === ps.length * 2 && ps.every((p, i) => hit.at[2 * i] === p.x && hit.at[2 * i + 1] === p.y)) return hit.m;
  const m = mapFor(ps);
  last.set(run, { at: ps.flatMap((p) => [p.x, p.y]), m });
  return m;
}

/** The cells a walker crosses, spawn to base. */
export const routeOf = (run: TrainingRun): Tile[] => route(mapOf(run));

/** Why a new piece can't go with its top-left cell at (x, y), or null when it can: on the map, off the pads and the
 *  spawn corner, clear of other pieces, and leaving the route open. */
export function placeProblem(run: TrainingRun, x: number, y: number): string | null {
  const why = noBuild(x, y);
  if (why) return why;
  const at = { x, y };
  if (run.pieces.some((p) => overlaps(p, at))) return 'Something already stands there.';
  if (!open([...run.pieces, at])) return 'That would wall the route off.';
  return null;
}

/** Is cell (x, y) in a cover patch? */
export function inCover(run: TrainingRun, x: number, y: number): boolean {
  const s = TRAINING.cover.size;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return run.cover.some((c) => cx >= c.x && cx < c.x + s && cy >= c.y && cy < c.y + s);
}
