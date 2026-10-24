import type { Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { centreOf, placeProblem, routeOf, shardsOnMap, unitTowers } from './board';
import { pickCard } from './cards';
import { buyLevel, buyLuck, buyMend, levelCost, levelProblem, luckProblem, mendProblem } from './economy';
import { N, overlaps } from './map';
import { craftDefault, readyDefaults } from './emplacements';
import { readyRecipes } from './recipes';
import { craft, createRun, endRun, startWave, step } from './run';
import { keep, keepOptions, placeDraft } from './shards';
import type { KeepOption, RunDrill, RunNexus, ShardPiece, Tile, TrainingRun } from './types';

// Test-only balance bot: plays a whole run headless. Never imported by the app (index.ts leaves it out).

/** A maze spot, as in src/rules/trainingTestMaze.json. */
export interface MazeSpot {
  n: number;
  x: number;
  y: number;
}

/** The bot mends the base at or below this much HP. */
const MEND_AT = TRAINING.baseHp / 2;
/** Game seconds a wave may run before the bot calls it off (a stuck wave would never end). */
const WAVE_LIMIT = 900;

const near = (route: Tile[], p: Tile) => {
  const c = centreOf(p);
  return Math.min(...route.map((r) => Math.hypot(r.x + 0.5 - c.x, r.y + 0.5 - c.y)));
};

/** Free spots off the maze, nearest the route first (never on the route itself). */
function offMaze(run: TrainingRun): Tile[] {
  const gap = new Float64Array(N * N).fill(Infinity);
  for (const r of routeOf(run)) gap[r.y * N + r.x] = 0;
  // Two passes of a chamfer sweep: distance (in steps) from the route, good enough to rank spots.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    if (x) gap[i] = Math.min(gap[i], gap[i - 1] + 1);
    if (y) gap[i] = Math.min(gap[i], gap[i - N] + 1);
  }
  for (let y = N - 1; y >= 0; y--) for (let x = N - 1; x >= 0; x--) {
    const i = y * N + x;
    if (x < N - 1) gap[i] = Math.min(gap[i], gap[i + 1] + 1);
    if (y < N - 1) gap[i] = Math.min(gap[i], gap[i + N] + 1);
  }
  const out: { t: Tile; d: number }[] = [];
  for (let y = 0; y < N - 1; y++) for (let x = 0; x < N - 1; x++) {
    const d = Math.min(gap[y * N + x], gap[y * N + x + 1], gap[(y + 1) * N + x], gap[(y + 1) * N + x + 1]);
    if (d >= 1 && !run.pieces.some((p) => overlaps(p, { x, y }))) out.push({ t: { x, y }, d });
  }
  return out.sort((a, b) => a.d - b.d).map((o) => o.t);
}

/** The next legal spot from `cursor` on the maze, or, with the maze used up, a free spot near the route. */
function nextSpot(run: TrainingRun, maze: MazeSpot[], cursor: number): { at: Tile; cursor: number } | null {
  while (cursor < maze.length) {
    const s = maze[cursor++];
    if (!placeProblem(run, s.x, s.y)) return { at: s, cursor };
  }
  const at = offMaze(run).find((t) => !placeProblem(run, t.x, t.y));
  return at ? { at, cursor } : null;
}

/** How far a keep takes the closest uncrafted recipe: the share of its slots the kept Shards (with this one) fill. */
function progress(run: TrainingRun, opt: KeepOption): number {
  const kept = shardsOnMap(run, false);
  const p = shardsOnMap(run).find((s) => s.id === opt.pieceId)!;
  const pool: ShardPiece[] = [...kept, { ...p, grade: opt.grade }];
  let best = 0;
  for (const r of run.recipes) {
    if (run.crafted.includes(r.unitId)) continue;
    // Slots filled: the largest sub-recipe the pool satisfies, slot by slot (greedy is close enough for a bot).
    let n = 0;
    const used = new Set<number>();
    for (const s of [...r.slots].sort((a, b) => b.grade - a.grade)) {
      const m = pool.filter((x) => !used.has(x.id) && x.type === s.type && x.grade >= s.grade).sort((a, b) => a.grade - b.grade)[0];
      if (m) { used.add(m.id); n++; }
    }
    // Only count it if this Shard is part of what fills it.
    if (used.has(opt.pieceId)) best = Math.max(best, n / r.slots.length);
  }
  return best;
}

/** Of Shards `uses`, the one nearest the route (where a craft stands). */
const nearest = (run: TrainingRun, uses: number[]): ShardPiece => {
  const route = routeOf(run);
  return shardsOnMap(run).filter((s) => uses.includes(s.id)).sort((a, b) => near(route, a) - near(route, b))[0];
};

/** Could an uncrafted unit's recipe still use this Shard (its type, at a slot's grade or better)? */
const wanted = (run: TrainingRun, p: ShardPiece) =>
  run.recipes.some((r) => !run.crafted.includes(r.unitId) && r.slots.some((s) => s.type === p.type && p.grade >= s.grade));

/** Craft every ready recipe, then every ready default tower none of whose Shards a unit still wants, each on its used
 *  Shard nearest the route. */
function craftAll(run: TrainingRun, units: Unit[]): void {
  for (let ready = readyRecipes(run); ready.length; ready = readyRecipes(run)) {
    const { unitId, uses } = ready[0];
    craft(run, units.find((u) => u.id === unitId)!, uses, nearest(run, uses).id);
  }
  const spare = () => readyDefaults(run).filter((d) => !shardsOnMap(run).some((p) => d.uses.includes(p.id) && wanted(run, p)));
  for (let ready = spare(); ready.length; ready = spare()) {
    const { key, uses } = ready[0];
    craftDefault(run, key, uses, nearest(run, uses).id);
  }
}

/** Spend: mend when low, then levels cheapest first, then luck. */
function spend(run: TrainingRun): void {
  while (run.baseHp <= MEND_AT && !mendProblem(run)) buyMend(run);
  for (;;) {
    const t = unitTowers(run).filter((u) => !levelProblem(run, u.id)).sort((a, b) => levelCost(a) - levelCost(b))[0];
    if (t) buyLevel(run, t.id);
    else if (!luckProblem(run)) buyLuck(run);
    else return;
  }
}

/** One build phase as the bot plays it: places the hand at the next legal maze spots from `cursor`, keeps, crafts,
 *  spends, picks a card. Returns the cursor moved on. */
export function botBuild(run: TrainingRun, units: Unit[], maze: MazeSpot[], cursor: number): number {
  if (run.offer?.length) pickCard(run, 0);
  craftAll(run, units);
  while (run.draft.step === 'place' && run.draft.hand.length) {
    const s = nextSpot(run, maze, cursor);
    if (!s) break;
    cursor = s.cursor;
    placeDraft(run, 0, s.at.x, s.at.y);
  }
  craftAll(run, units);
  if (run.draft.step === 'keep') {
    const opts = keepOptions(run).map((o) => ({ o, p: progress(run, o) }));
    opts.sort((a, b) => b.p - a.p || b.o.grade - a.o.grade || a.o.with.length - b.o.with.length);
    keep(run, opts[0].o);
  }
  craftAll(run, units);
  spend(run);
  return cursor;
}

/** Play a run to its end (or `maxWaves` cleared), stepping `dt` (default 0.05) at a time; `nexus`: a campaign's;
 *  `drill`, `siege`: createRun's opts; `watch` is called after every step of a wave (the balance tests' probes). */
export function playRun(units: Unit[], seed: number,
  opts: { maze?: MazeSpot[]; maxWaves?: number; dt?: number; nexus?: RunNexus; drill?: RunDrill; siege?: string; watch?: (run: TrainingRun) => void } = {}): TrainingRun {
  const { maze = [], maxWaves = 60, dt = 0.05 } = opts;
  const run = createRun('bot', units, seed, undefined, opts.nexus, { drill: opts.drill, siege: opts.siege });
  let cursor = 0;
  while (run.phase !== 'over' && run.cleared < maxWaves) {
    cursor = botBuild(run, units, maze, cursor);
    if (run.draft.step !== 'done') { endRun(run, 'The bot is stuck.'); break; }
    startWave(run);
    while (run.phase === 'wave' && run.t < WAVE_LIMIT) {
      step(run, dt);
      opts.watch?.(run);
    }
    if (run.phase === 'wave') endRun(run, 'The wave never ends.');
  }
  return run;
}

