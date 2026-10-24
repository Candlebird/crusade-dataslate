import { TRAINING } from '../downtimeData';

// The Training map: a square grid of cells the enemy crosses from its spawn past each checkpoint pad in turn to the
// base. Every piece on it (a unit, a Shard, rubble or cover) is 2×2 cells, set down by its top-left cell, so pieces can
// sit a cell apart and leave a 1-cell gap the enemy can still squeeze through. Each leg of the route has its own flow
// field: every cell's walking distance to that leg's goal, 8-connected, with no cutting past a blocked corner. The
// spawn, the pads and the base are 2×2 areas too.

export interface Tile {
  x: number;
  y: number;
}

export const N = TRAINING.mapSize;
const R = TRAINING.route;
/** Spawn, the pads in order, then the base, each by its top-left cell. Leg k runs from WAYPOINTS[k] to WAYPOINTS[k + 1]. */
export const WAYPOINTS: Tile[] = [R.spawn, ...R.pads, R.base];
export const LEGS = WAYPOINTS.length - 1;

export const idx = (x: number, y: number) => y * N + x;
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N;
/** The middle of a 2×2 piece or area set down at `t`. */
export const centre = (t: Tile) => ({ x: t.x + 1, y: t.y + 1 });
/** The cell a point is on, kept on the map. */
export const tileAt = (x: number, y: number): Tile => ({ x: Math.min(N - 1, Math.max(0, Math.floor(x))), y: Math.min(N - 1, Math.max(0, Math.floor(y))) });
/** The four cells of a 2×2 piece or area set down at `t`. */
export const cells = (t: Tile): Tile[] => [{ x: t.x, y: t.y }, { x: t.x + 1, y: t.y }, { x: t.x, y: t.y + 1 }, { x: t.x + 1, y: t.y + 1 }];
/** Is the cell (x, y) inside the 2×2 piece or area set down at `t`? */
export const within = (t: Tile, x: number, y: number) => x >= t.x && x <= t.x + 1 && y >= t.y && y <= t.y + 1;
/** Do two 2×2 pieces set down at `a` and `b` share a cell? */
export const overlaps = (a: Tile, b: Tile) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;

/** Why no piece can be set down with its top-left cell at (x, y), whatever stands round it, or null when one can. */
export function noBuild(x: number, y: number): string | null {
  if (!inMap(x, y) || !inMap(x + 1, y + 1)) return 'That is off the map.';
  const at = { x, y };
  if (overlaps(at, R.base)) return 'That is the base.';
  if (R.pads.some((p) => overlaps(at, p))) return 'That is a checkpoint pad: the enemy has to walk over it.';
  if (x <= R.noBuild && y <= R.noBuild) return 'Nothing can be built this close to where the enemy comes in.';
  return null;
}

const SQ = Math.SQRT2;
const DIRS: [number, number, number][] = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ]];

/** The cells a walker can step to from (x, y), with what each step costs: diagonals only past two open sides. */
function steps(blocked: Uint8Array, x: number, y: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (const [dx, dy, c] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (!inMap(nx, ny) || blocked[idx(nx, ny)]) continue;
    if (dx && dy && (blocked[idx(x + dx, y)] || blocked[idx(x, y + dy)])) continue;
    out.push([nx, ny, c]);
  }
  return out;
}

/** Every cell's walking distance to the 2×2 area at `goal` (Infinity where it can't get there). */
function flowField(blocked: Uint8Array, goal: Tile): Float64Array {
  const d = new Float64Array(N * N).fill(Infinity);
  // A binary heap of [distance, cell].
  const heap: [number, number][] = [];
  const push = (v: [number, number]) => {
    heap.push(v);
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  for (const c of cells(goal)) {
    d[idx(c.x, c.y)] = 0;
    push([0, idx(c.x, c.y)]);
  }
  while (heap.length) {
    const [du, u] = pop();
    if (du > d[u]) continue;
    for (const [nx, ny, c] of steps(blocked, u % N, Math.floor(u / N))) {
      const v = idx(nx, ny);
      if (du + c < d[v]) {
        d[v] = du + c;
        push([d[v], v]);
      }
    }
  }
  return d;
}

/** The map as it stands: which cells are blocked, each leg's flow field and each leg's length. */
export interface MapState {
  blocked: Uint8Array;
  fields: Float64Array[];
  lengths: number[];
}

const cache = new Map<string, MapState>();

/** The cells these 2×2 pieces cover, marked on a grid. */
function blockGrid(pieces: Tile[]): Uint8Array {
  const blocked = new Uint8Array(N * N);
  for (const p of pieces) for (const c of cells(p)) if (inMap(c.x, c.y)) blocked[idx(c.x, c.y)] = 1;
  return blocked;
}

/** The map with these 2×2 pieces down. Layouts are cached, so asking again for one already seen is free. */
export function mapFor(pieces: Tile[]): MapState {
  const key = pieces.map((t) => idx(t.x, t.y)).sort((a, b) => a - b).join(',');
  const hit = cache.get(key);
  if (hit) return hit;
  const blocked = blockGrid(pieces);
  const fields = WAYPOINTS.slice(1).map((g) => flowField(blocked, g));
  // A leg's length is from the middle of the area it starts on.
  const lengths = fields.map((f, k) => Math.min(...cells(WAYPOINTS[k]).map((c) => f[idx(c.x, c.y)])) + 0.5);
  const m = { blocked, fields, lengths };
  if (cache.size > 64) cache.delete(cache.keys().next().value!);
  cache.set(key, m);
  return m;
}

/** Can a walker still get from the spawn past every pad to the base with these 2×2 pieces down? */
export function open(pieces: Tile[]): boolean {
  const blocked = blockGrid(pieces);
  // Diagonals need both sides open, so 4-connected reach is the same as walking reach.
  const seen = new Uint8Array(N * N);
  const s = idx(R.spawn.x, R.spawn.y);
  if (blocked[s]) return false;
  const q = [s];
  seen[s] = 1;
  while (q.length) {
    const u = q.pop()!;
    const x = u % N;
    const y = Math.floor(u / N);
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const nx = x + dx;
      const ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const v = idx(nx, ny);
      if (seen[v] || blocked[v]) continue;
      seen[v] = 1;
      q.push(v);
    }
  }
  return WAYPOINTS.every((t) => seen[idx(t.x, t.y)]);
}

/** Where a walker on leg `leg` at (x, y) heads next: the middle of its best next cell, or of the leg's goal once on it. */
export function heading(m: MapState, leg: number, x: number, y: number): { x: number; y: number } {
  const goal = WAYPOINTS[leg + 1];
  const t = tileAt(x, y);
  if (within(goal, t.x, t.y)) return centre(goal);
  const f = m.fields[leg];
  let best: { x: number; y: number } | undefined;
  let score = Infinity;
  for (const [nx, ny, c] of steps(m.blocked, t.x, t.y)) {
    const s = c + f[idx(nx, ny)];
    if (s < score) { score = s; best = { x: nx + 0.5, y: ny + 0.5 }; }
  }
  // Nowhere to go (it can't happen once placements keep the route open): straight for the goal.
  return best ?? centre(goal);
}

/** The point a walker on leg `leg` at (x, y) is pushed back to, `n` cells up its route (where it came from). */
export function upstream(m: MapState, leg: number, x: number, y: number, n: number): { x: number; y: number } {
  const f = m.fields[leg];
  let t = tileAt(x, y);
  for (let i = 0; i < n; i++) {
    let best: Tile | undefined;
    let score = f[idx(t.x, t.y)];
    for (const [nx, ny] of steps(m.blocked, t.x, t.y)) {
      const s = f[idx(nx, ny)];
      if (Number.isFinite(s) && s > score) { score = s; best = { x: nx, y: ny }; }
    }
    if (!best) break;
    t = best;
  }
  return { x: t.x + 0.5, y: t.y + 0.5 };
}

/** How far a walker on leg `leg` at (x, y) still has to go to the base. */
export function remaining(m: MapState, leg: number, x: number, y: number): number {
  const t = tileAt(x, y);
  const here = m.fields[leg][idx(t.x, t.y)];
  const g = centre(WAYPOINTS[leg + 1]);
  const toGoal = Number.isFinite(here) ? here : Math.hypot(g.x - x, g.y - y);
  let rest = 0;
  for (let i = leg + 1; i < m.lengths.length; i++) rest += m.lengths[i];
  return toGoal + rest;
}

/** The route's whole length, spawn to base. */
export const routeLength = (m: MapState) => m.lengths.reduce((n, l) => n + l, 0);

/** The cells a walker crosses, spawn to base, in order. */
export function route(m: MapState): Tile[] {
  const out: Tile[] = [WAYPOINTS[0]];
  for (let leg = 0; leg < LEGS; leg++) {
    const goal = WAYPOINTS[leg + 1];
    let t = out[out.length - 1];
    for (let guard = 0; guard < N * N && !within(goal, t.x, t.y); guard++) {
      const h = heading(m, leg, t.x + 0.5, t.y + 0.5);
      const next = tileAt(h.x, h.y);
      if (next.x === t.x && next.y === t.y) break;
      t = next;
      out.push(t);
    }
  }
  return out;
}
