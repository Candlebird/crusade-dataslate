import type { Unit } from '../../model/types';
import { SHARD_TYPES, TRAINING } from '../downtimeData';
import { centreOf, placeProblem, routeOf, shardsOnMap, unitTowers } from './board';
import { pickCard } from './cards';
import { buyLevel, buyLuck, buyMend, levelCost, levelProblem, luckProblem, mendProblem } from './economy';
import { N, overlaps } from './map';
import { craftDefault, readyDefaults } from './emplacements';
import { readyRecipes } from './recipes';
import { craft, createRun, endRun, startWave, step } from './run';
import { keep, keepOptions, placeDraft } from './shards';
import type { KeepOption, RunDrill, RunNexus, ShardPiece, Tile, TrainingRun } from './types';

// The balance bot: plays a whole run headless for the tests, and a move at a time for the app's Auto (debug) button
// (botMoves). index.ts leaves it out: the app imports it from here.

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

/** How much a keep's Shard shoots at walkers on its own: its attacks × the route cells in its reach. The first keep
 *  goes by it (a gun that covers the route, as a player's would be), every later one only as a tie-break. */
function gunOf(run: TrainingRun, opt: KeepOption): number {
  const p = shardsOnMap(run).find((s) => s.id === opt.pieceId)!;
  const g = SHARD_TYPES[p.type].gun;
  const reach = g.melee ? TRAINING.meleeReach : g.range * TRAINING.rangeMul;
  const c = centreOf(p);
  return g.attacks * routeOf(run).filter((r) => Math.hypot(r.x + 0.5 - c.x, r.y + 0.5 - c.y) <= reach).length;
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
 *  Shard nearest the route; a move a yield. */
function* craftAll(run: TrainingRun, units: Unit[]): Generator<string, void> {
  for (let ready = readyRecipes(run); ready.length; ready = readyRecipes(run)) {
    const { unitId, uses } = ready[0];
    const u = units.find((x) => x.id === unitId)!;
    craft(run, u, uses, nearest(run, uses).id);
    yield `crafts ${u.name}`;
  }
  const spare = () => readyDefaults(run).filter((d) => !shardsOnMap(run).some((p) => d.uses.includes(p.id) && wanted(run, p)));
  for (let ready = spare(); ready.length; ready = spare()) {
    const { key, uses } = ready[0];
    craftDefault(run, key, uses, nearest(run, uses).id);
    yield 'crafts a defence';
  }
}

/** Spend: mend when low, then levels cheapest first, then luck; a move a yield. */
function* spend(run: TrainingRun): Generator<string, void> {
  while (run.baseHp <= MEND_AT && !mendProblem(run)) {
    buyMend(run);
    yield 'mends the base';
  }
  for (;;) {
    const t = unitTowers(run).filter((u) => !levelProblem(run, u.id)).sort((a, b) => levelCost(a) - levelCost(b))[0];
    if (t) buyLevel(run, t.id);
    else if (!luckProblem(run)) buyLuck(run);
    else return;
    yield t ? `levels ${t.name}` : 'buys luck';
  }
}

/** The card the bot takes from an offer. */
export const BOT_CARD = 0;

/** One build phase as the bot plays it, a move at a time (each yield is one move done, said in a few words): picks a
 *  card, places the hand at the next legal maze spots from `cursor`, keeps, crafts, spends. Returns the cursor moved on.
 *  Every loop looks at the run afresh after each move, so the player may act between moves. */
export function* botMoves(run: TrainingRun, units: Unit[], maze: MazeSpot[], cursor: number): Generator<string, number> {
  if (run.offer?.length) {
    pickCard(run, BOT_CARD);
    yield 'takes a card';
  }
  yield* craftAll(run, units);
  while (run.draft.step === 'place' && run.draft.hand.length) {
    const s = nextSpot(run, maze, cursor);
    if (!s) break;
    cursor = s.cursor;
    placeDraft(run, 0, s.at.x, s.at.y);
    yield 'places a Shard';
  }
  yield* craftAll(run, units);
  if (run.draft.step === 'keep') {
    // The bot never keeps a Shard a grade down (it only crafts units, whose recipes take a grade or better).
    const opts = keepOptions(run).filter((o) => !o.down).map((o) => ({ o, p: progress(run, o), g: gunOf(run, o) }));
    const first = !shardsOnMap(run, false).length && !unitTowers(run).length;
    opts.sort((a, b) => (first ? b.g - a.g : 0) || b.p - a.p || b.o.grade - a.o.grade || b.g - a.g || a.o.with.length - b.o.with.length);
    keep(run, opts[0].o);
    yield 'keeps a Shard';
  }
  yield* craftAll(run, units);
  yield* spend(run);
  return cursor;
}

/** One build phase played straight through (botMoves). Returns the cursor moved on. */
export function botBuild(run: TrainingRun, units: Unit[], maze: MazeSpot[], cursor: number): number {
  const g = botMoves(run, units, maze, cursor);
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
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

