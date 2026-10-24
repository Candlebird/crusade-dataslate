import { SHARD_TYPES, TRAINING, type ShardType } from '../downtimeData';
import { hitChance, pick, saveChance, weighted } from './rng';
import { pieceById, placeProblem } from './board';
import type { Grade, KeepOption, Piece, RubblePiece, ShardPiece, Tile, TowerGun, TrainingRun } from './types';

// The Shard draft: drawing, placing, keeping (and merging), rubble. And a Shard's own tower stats.

/** A grade's value: 2^(grade-1). */
export const shardValue = (g: Grade) => 2 ** (g - 1);

export const SHARD_KINDS = Object.keys(SHARD_TYPES) as ShardType[];
const TOP: Grade = 5;

/** "Cracked" … "Pristine". */
export const gradeName = (g: Grade): string => TRAINING.shards.grades[g - 1];

/** A grade by the odds for the run's luck level. */
export function rollGrade(run: TrainingRun): Grade {
  const odds = TRAINING.shards.odds[Math.max(0, Math.min(TRAINING.shards.odds.length - 1, run.luck))];
  return (weighted(run, odds) + 1) as Grade;
}

/** Start the build phase's draft: draw TRAINING.shards.draw Shards into run.draft.hand, step 'place'. */
export function drawDraft(run: TrainingRun): void {
  const hand = Array.from({ length: TRAINING.shards.draw }, () => {
    const type = pick(run, SHARD_KINDS);
    return { type, grade: rollGrade(run) };
  });
  run.draft = { step: 'place', hand, placed: [] };
}

/** A Shard's weapon at a grade: SHARD_TYPES' attacks per point of value (at least 1), range in inches = cells. */
export function shardGun(type: ShardType, grade: Grade): TowerGun {
  const g = SHARD_TYPES[type].gun;
  return {
    name: `${SHARD_TYPES[type].name} Shard`, melee: !!g.melee, range: g.melee ? 0 : g.range,
    attacks: Math.max(1, Math.round(g.attacks * shardValue(grade))), ap: g.ap, hitMod: 0, blast: g.blast ?? 0,
    deadly: 0, rending: false, reliable: false, bane: false, cd: 0, pending: 0, gap: 0, next: 0,
  };
}

/** A Shard as a piece, with its guns and Quality by type and grade. */
export function shardPiece(id: number, at: Tile, type: ShardType, grade: Grade, draft: boolean): ShardPiece {
  return {
    id, x: at.x, y: at.y, kind: 'shard', type, grade, draft,
    quality: TRAINING.shards.quality[grade - 1], guns: [shardGun(type, grade)], hitShoot: 0, hitMelee: 0, atkBonus: 1,
    boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0,
  };
}

/** A Shard's expected damage a second against Defense `defense` (no armour, cover or auras): for tuning and tests. */
export function shardDps(type: ShardType, grade: Grade, defense = 5): number {
  const g = shardGun(type, grade);
  const every = g.melee ? TRAINING.meleeEvery : TRAINING.shootEvery;
  const hits = g.attacks * hitChance(TRAINING.shards.quality[grade - 1], 0) * (1 - saveChance(defense, g.ap));
  return (hits * Math.max(1, g.blast)) / every;
}

const draftPieces = (run: TrainingRun): ShardPiece[] =>
  run.draft.placed.map((id) => pieceById(run, id)).filter((p): p is ShardPiece => p?.kind === 'shard' && p.draft);

/** Why hand Shard `i` can't go down at (x, y), or null. */
export function placeDraftProblem(run: TrainingRun, i: number, x: number, y: number): string | null {
  if (run.phase !== 'build') return 'Shards go down between waves.';
  if (run.draft.step !== 'place' || !run.draft.hand[i]) return 'No such Shard in hand.';
  return placeProblem(run, x, y);
}

/** Set hand Shard `i` down at (x, y) as a draft piece; with the hand empty the draft moves to 'keep'. Throws on a problem. */
export function placeDraft(run: TrainingRun, i: number, x: number, y: number): void {
  const why = placeDraftProblem(run, i, x, y);
  if (why) throw new Error(why);
  const [s] = run.draft.hand.splice(i, 1);
  const p = shardPiece(run.nextId++, { x, y }, s.type, s.grade, true);
  run.pieces.push(p);
  run.draft.placed.push(p.id);
  if (!run.draft.hand.length) run.draft.step = 'keep';
}

/** Every way to keep a piece of this draft: each plain, and merges of 2 alike (+1 grade) or 4 alike (+2), cap 5.
 *  A merge that can't raise the grade (already Pristine) isn't offered. Merges use the earliest-placed alike pieces. */
export function keepOptions(run: TrainingRun): KeepOption[] {
  if (run.phase !== 'build' || run.draft.step !== 'keep') return [];
  const ps = draftPieces(run);
  const out: KeepOption[] = [];
  for (const p of ps) {
    out.push({ pieceId: p.id, grade: p.grade, with: [] });
    if (p.grade >= TOP) continue;
    const alike = ps.filter((o) => o !== p && o.type === p.type && o.grade === p.grade).map((o) => o.id);
    if (alike.length >= 1) out.push({ pieceId: p.id, grade: Math.min(TOP, p.grade + 1) as Grade, with: alike.slice(0, 1) });
    if (alike.length >= 3 && p.grade + 1 < TOP) out.push({ pieceId: p.id, grade: Math.min(TOP, p.grade + 2) as Grade, with: alike.slice(0, 3) });
  }
  return out;
}

/** Why this keep can't be made (not keep time, or not one of keepOptions), or null. */
export function keepProblem(run: TrainingRun, opt: KeepOption): string | null {
  if (run.phase !== 'build' || run.draft.step !== 'keep') return 'Nothing to keep yet.';
  const ok = keepOptions(run).some((o) => o.pieceId === opt.pieceId && o.grade === opt.grade && o.with.length === opt.with.length && o.with.every((id) => opt.with.includes(id)));
  return ok ? null : 'That Shard can’t be kept that way.';
}

/** Keep one: it stays (graded up by a merge), every other draft piece crumbles to rubble, step 'done'. Throws on a problem. */
export function keep(run: TrainingRun, opt: KeepOption): void {
  const why = keepProblem(run, opt);
  if (why) throw new Error(why);
  const p = pieceById(run, opt.pieceId) as ShardPiece;
  replace(run, shardPiece(p.id, p, p.type, opt.grade, false));
  crumbleDraft(run, [p.id]);
}

function replace(run: TrainingRun, p: Piece): void {
  const i = run.pieces.findIndex((o) => o.id === p.id);
  if (i >= 0) run.pieces[i] = p;
}

/** Turn these pieces into rubble where they stand (same ids and cells). */
export function toRubble(run: TrainingRun, ids: number[]): void {
  for (const id of ids) {
    const p = pieceById(run, id);
    if (p && p.kind !== 'rubble') replace(run, { id: p.id, x: p.x, y: p.y, kind: 'rubble' } satisfies RubblePiece);
  }
}

/** End the draft without a keep (a craft took its place): every draft piece not in `except` crumbles and those in it
 *  are kept as they are; any Shards still in hand are lost; step 'done'. */
export function crumbleDraft(run: TrainingRun, except: number[]): void {
  const ps = draftPieces(run);
  toRubble(run, ps.filter((p) => !except.includes(p.id)).map((p) => p.id));
  for (const p of ps) if (except.includes(p.id)) p.draft = false;
  run.draft = { step: 'done', hand: [], placed: [] };
}

/** Why piece `id` can't be cleared (only rubble, only in the build phase), or null. */
export function clearProblem(run: TrainingRun, id: number): string | null {
  if (run.phase !== 'build') return 'Rubble is cleared between waves.';
  if (pieceById(run, id)?.kind !== 'rubble') return 'Only rubble can be cleared.';
  return null;
}

/** Clear rubble `id` (free). Throws on a problem. */
export function clearRubble(run: TrainingRun, id: number): void {
  const why = clearProblem(run, id);
  if (why) throw new Error(why);
  run.pieces = run.pieces.filter((p) => p.id !== id);
}

