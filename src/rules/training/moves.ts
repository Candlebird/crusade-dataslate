import { pieceById } from './board';
import { noBuild, open, overlaps } from './map';
import type { Piece, TrainingRun, UnitTower } from './types';

// Scout and Ambush (datasheet rules) between waves: once a build phase a Scout unit may move to any open spot, and an
// Ambush unit may swap places with another piece (a defence, a Shard or rubble). The route must stay open either way.

const unitPiece = (run: TrainingRun, id: number): UnitTower | undefined => {
  const p = pieceById(run, id);
  return p?.kind === 'unit' ? p : undefined;
};

/** Why unit piece `id` can't make its `rule` move now (the checks both moves share), or null. */
function moveProblem(run: TrainingRun, id: number, rule: 'scout' | 'ambush'): string | null {
  if (run.phase !== 'build') return 'Units move between waves.';
  const t = unitPiece(run, id);
  if (!t) return 'Only a crafted unit moves.';
  if (!t[rule]) return `${t.name} has no ${rule === 'scout' ? 'Scout' : 'Ambush'} rule.`;
  if (run.moved?.includes(id)) return `${t.name} has already moved this build phase.`;
  return null;
}

const markMoved = (run: TrainingRun, id: number) => { run.moved = [...(run.moved ?? []), id]; };

/** Why Scout unit `id` can't move with its top-left cell to (x, y), or null: on the map, off the pads and spawn,
 *  clear of every other piece, and the route left open. */
export function scoutMoveProblem(run: TrainingRun, id: number, x: number, y: number): string | null {
  const why = moveProblem(run, id, 'scout');
  if (why) return why;
  const t = unitPiece(run, id)!;
  if (t.x === x && t.y === y) return `${t.name} is already there.`;
  const no = noBuild(x, y);
  if (no) return no;
  const others = run.pieces.filter((p) => p !== t);
  const at = { x, y };
  if (others.some((p) => overlaps(p, at))) return 'Something already stands there.';
  if (!open([...others, at])) return 'That would wall the route off.';
  return null;
}

/** Move Scout unit `id` to (x, y), once this build phase. Throws on a problem. */
export function scoutMove(run: TrainingRun, id: number, x: number, y: number): void {
  const why = scoutMoveProblem(run, id, x, y);
  if (why) throw new Error(why);
  const t = unitPiece(run, id)!;
  t.x = x;
  t.y = y;
  markMoved(run, id);
  run.log.push(`${t.name} scouts to a new spot.`);
}

/** Where every piece would stand with `a` and `b` swapped. */
const swapped = (run: TrainingRun, a: Piece, b: Piece) =>
  run.pieces.map((p) => (p === a ? { x: b.x, y: b.y } : p === b ? { x: a.x, y: a.y } : p));

/** Why Ambush unit `id` can't swap places with piece `otherId` (a defence, unit, Shard or rubble), or null. */
export function ambushSwapProblem(run: TrainingRun, id: number, otherId: number): string | null {
  const why = moveProblem(run, id, 'ambush');
  if (why) return why;
  const t = unitPiece(run, id)!;
  const o = pieceById(run, otherId);
  if (!o || o === t) return 'Pick another piece on the map to swap with.';
  if (!open(swapped(run, t, o))) return 'That would wall the route off.';
  return null;
}

/** Swap Ambush unit `id` with piece `otherId`, once this build phase. Throws on a problem. */
export function ambushSwap(run: TrainingRun, id: number, otherId: number): void {
  const why = ambushSwapProblem(run, id, otherId);
  if (why) throw new Error(why);
  const t = unitPiece(run, id)!;
  const o = pieceById(run, otherId)!;
  [t.x, t.y, o.x, o.y] = [o.x, o.y, t.x, t.y];
  markMoved(run, id);
  run.log.push(`${t.name} springs an ambush, trading places.`);
}

/** Has unit piece `id` made its Scout or Ambush move this build phase? */
export const hasMoved = (run: TrainingRun, id: number): boolean => !!run.moved?.includes(id);
