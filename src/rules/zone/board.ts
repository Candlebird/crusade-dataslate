import type { SectorType } from '../../model/types';
import type { MissionDef } from '../missions';
import { deploymentMap, type MapShape } from '../tableMap';
import { roll, type Rng } from './dice';

// The zone battle's table: 12" zones, each split 2×2 into 6" squares. Units stand on squares; distances are counted
// in squares (a diagonal step is one), so 6" is a square. Terrain sits on squares, and only Blocking terrain stops
// line of sight. Deployment zones and objective markers come from the mission's table map.

export const SQUARE = 6;
export const ZONE_SQUARES = 2;

export type BoardShape = 'wide' | 'deep' | 'small';

export interface Terrain {
  cover?: boolean;
  difficult?: boolean;
  dangerous?: boolean;
  blocking?: boolean;
  /** What it is, for the map ("Ruins", "Crystal spires"). */
  name: string;
}

export interface Board {
  shape: BoardShape;
  /** Squares across and down. */
  w: number;
  h: number;
  /** Terrain per square, by index (y * w + x); null for open ground. */
  terrain: (Terrain | null)[];
  /** Deployment squares for side 0 (player 1 / attacker) and side 1. */
  deploy: [number[], number[]];
  /** Squares where reserves may come on (missions with edge reserves); empty: any square. */
  edges: number[];
  /** Objective markers, by square. `owner`: a side's own marker (Sabotage, Demolition). */
  objectives: { sq: number; owner?: 0 | 1 }[];
  notes: string[];
}

export const xy = (b: Pick<Board, 'w'>, i: number): [number, number] => [i % b.w, Math.floor(i / b.w)];
export const idx = (b: Pick<Board, 'w'>, x: number, y: number) => y * b.w + x;
export const inside = (b: Pick<Board, 'w' | 'h'>, x: number, y: number) => x >= 0 && y >= 0 && x < b.w && y < b.h;

/** Squares apart, a diagonal step counting as one. */
export function dist(b: Pick<Board, 'w'>, a: number, c: number): number {
  const [ax, ay] = xy(b, a), [cx, cy] = xy(b, c);
  return Math.max(Math.abs(ax - cx), Math.abs(ay - cy));
}

/** Inches to squares of movement: 6" is one square, 12" two (a 2" allowance, as most moves are a bit short of it). */
export const moveSquares = (inches: number) => Math.max(0, Math.floor((inches + 2) / SQUARE));
/** In range: the squares between them, at 6" each, are within the range (with the same 2" allowance). */
export const inRange = (squares: number, range: number) => squares * SQUARE <= range + 2;

/** The zone a square is in, as an index into the zone grid. */
export function zoneOf(b: Pick<Board, 'w'>, i: number): number {
  const [x, y] = xy(b, i);
  const zw = Math.ceil(b.w / ZONE_SQUARES);
  return Math.floor(y / ZONE_SQUARES) * zw + Math.floor(x / ZONE_SQUARES);
}

export function zoneSquares(b: Pick<Board, 'w' | 'h'>, z: number): number[] {
  const zw = Math.ceil(b.w / ZONE_SQUARES);
  const zx = (z % zw) * ZONE_SQUARES, zy = Math.floor(z / zw) * ZONE_SQUARES;
  const out: number[] = [];
  for (let y = zy; y < zy + ZONE_SQUARES; y++) for (let x = zx; x < zx + ZONE_SQUARES; x++) if (inside(b, x, y)) out.push(idx(b, x, y));
  return out;
}

export function neighbours(b: Pick<Board, 'w' | 'h'>, i: number): number[] {
  const [x, y] = xy(b, i);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && inside(b, x + dx, y + dy)) out.push(idx(b, x + dx, y + dy));
  return out;
}

/** Line of sight from one square to another: no Blocking square on the line between their centres. */
export function los(b: Board, a: number, c: number): boolean {
  if (a === c) return true;
  const [ax, ay] = xy(b, a), [cx, cy] = xy(b, c);
  const steps = Math.max(Math.abs(cx - ax), Math.abs(cy - ay)) * 4;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    // A hair off the exact line, so a line along a corner between two squares isn't counted as both.
    const x = Math.round(ax + (cx - ax) * t + 1e-6), y = Math.round(ay + (cy - ay) * t + 1e-6);
    const i = idx(b, x, y);
    if (i !== a && i !== c && b.terrain[i]?.blocking) return false;
  }
  return true;
}

export interface MoveOpts {
  strider?: boolean;
  flying?: boolean;
  /** Squares it can't enter (crowded), or can't end on. */
  blocked?: (sq: number) => boolean;
  /** Squares it can't move through at all (enemies, for a charge); flyers pass over them. */
  noPass?: (sq: number) => boolean;
}

/**
 * Squares a unit can reach in up to `steps` squares, and the steps it took to get there. Blocking terrain can't be
 * entered (flyers pass over it but can't stop on it); entering Difficult terrain ends the move, unless it strides or flies.
 */
export function reachable(b: Board, from: number, steps: number, o: MoveOpts = {}): Map<number, number> {
  const out = new Map<number, number>([[from, 0]]);
  let frontier = [from];
  for (let s = 1; s <= steps; s++) {
    const next: number[] = [];
    for (const f of frontier) {
      const t = b.terrain[f];
      if (f !== from && t?.difficult && !o.strider && !o.flying) continue;
      for (const n of neighbours(b, f)) {
        if (out.has(n)) continue;
        const tn = b.terrain[n];
        if (tn?.blocking && !o.flying) continue;
        if (o.noPass?.(n) && !o.flying) continue;
        out.set(n, s);
        next.push(n);
      }
    }
    frontier = next;
  }
  for (const [sq] of out) if (sq !== from && ((b.terrain[sq]?.blocking) || o.blocked?.(sq))) out.delete(sq);
  return out;
}

/** The path's next square from `from` towards `to`, moving up to `steps` squares; the reachable square nearest `to`. */
export function stepToward(b: Board, from: number, to: number, steps: number, o: MoveOpts = {}): number {
  const r = reachable(b, from, steps, o);
  let best = from, bestD = dist(b, from, to), bestS = 0;
  for (const [sq, s] of r) {
    const d = dist(b, sq, to);
    if (d < bestD || (d === bestD && s < bestS)) { best = sq; bestD = d; bestS = s; }
  }
  return best;
}

// ---- Making a board ----

/** What a sector's battlefield looks like: the terrain pieces it draws from, and how much of the table they cover. */
const SECTOR_TERRAIN: Record<SectorType | 'default', { pieces: Terrain[]; density: number }> = {
  home: { density: 0.24, pieces: [{ name: 'Barricades', cover: true }, { name: 'Bunker', blocking: true }, { name: 'Trenches', cover: true, difficult: true }, { name: 'Ruins', cover: true }] },
  planet: { density: 0.26, pieces: [{ name: 'Ruins', cover: true }, { name: 'Woods', cover: true, difficult: true }, { name: 'Hab block', blocking: true }, { name: 'Rubble', difficult: true }, { name: 'Craters', cover: true }] },
  research: { density: 0.24, pieces: [{ name: 'Lab block', blocking: true }, { name: 'Crates', cover: true }, { name: 'Coolant spill', dangerous: true }, { name: 'Gantries', cover: true }] },
  void: { density: 0.16, pieces: [{ name: 'Wreckage', cover: true }, { name: 'Void rift', dangerous: true }, { name: 'Hull spar', blocking: true }] },
  anomaly: { density: 0.24, pieces: [{ name: 'Crystal spires', blocking: true }, { name: 'Warp storm', dangerous: true, difficult: true }, { name: 'Shard field', cover: true, dangerous: true }, { name: 'Twisted ground', difficult: true }] },
  empty: { density: 0.14, pieces: [{ name: 'Rocks', cover: true }, { name: 'Dust drifts', difficult: true }, { name: 'Mesa', blocking: true }] },
  voidspawn: { density: 0.24, pieces: [{ name: 'Hive growth', cover: true, difficult: true }, { name: 'Spawning pool', dangerous: true }, { name: 'Chitin spire', blocking: true }, { name: 'Brood tunnels', difficult: true }] },
  archive: { density: 0.26, pieces: [{ name: 'Stacks', blocking: true }, { name: 'Reading halls', cover: true }, { name: 'Collapsed vault', difficult: true, cover: true }, { name: 'Wards', dangerous: true }] },
  default: { density: 0.22, pieces: [{ name: 'Ruins', cover: true }, { name: 'Woods', cover: true, difficult: true }, { name: 'Building', blocking: true }, { name: 'Rubble', difficult: true }] },
};

/** The board size for a battle: under 1250 pts a side 4×4 zones, otherwise wide (6×4) or deep (4×6) at random. */
export function boardShape(points: number, rng: Rng): BoardShape {
  if (points > 0 && points < 1250) return 'small';
  return rng() < 0.5 ? 'wide' : 'deep';
}

const tableFor = (shape: BoardShape) => (shape === 'small' ? { w: 48, h: 48 } : shape === 'wide' ? { w: 72, h: 48 } : { w: 48, h: 72 });

/** Squares whose centre lies inside a map shape. */
function covered(b: Pick<Board, 'w' | 'h'>, s: MapShape, t: { w: number; h: number }): number[] {
  const out: number[] = [];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const cx = x * SQUARE + SQUARE / 2, cy = y * SQUARE + SQUARE / 2;
    let hit = false;
    if (s.kind === 'rect') hit = cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h;
    else if (s.kind === 'circle') hit = Math.hypot(cx - s.cx, cy - s.cy) <= s.r + 1;
    else if (s.kind === 'band') hit = cx <= s.d || cy <= s.d || cx >= t.w - s.d || cy >= t.h - s.d;
    if (hit) out.push(idx(b, x, y));
  }
  return out;
}

export interface BoardOpts {
  points: number;
  mission: MissionDef;
  sector?: SectorType;
  shape?: BoardShape;
  /** Markers rolled ('D3+2') come from here. */
  rng: Rng;
}

/** A battle's board: its shape, deployment zones and markers from the mission's map, and seeded terrain for the sector. */
export function makeBoard(o: BoardOpts): Board {
  const shape = o.shape ?? boardShape(o.points, o.rng);
  const t = tableFor(shape);
  const b: Board = { shape, w: t.w / SQUARE, h: t.h / SQUARE, terrain: [], deploy: [[], []], edges: [], objectives: [], notes: [] };
  b.terrain = Array(b.w * b.h).fill(null);

  const map = deploymentMap(o.mission, o.points, { ...t, label: '', why: '' });
  const shapes = map?.shapes ?? deploymentMap({ ...o.mission, id: 'opr-standard', deployment: undefined }, o.points, { ...t, label: '', why: '' })!.shapes;
  for (const s of shapes) {
    if (s.kind === 'rect' || s.kind === 'circle' || s.kind === 'band') {
      if (s.side === 'none') { if (s.kind === 'band') b.edges = covered(b, s, t); continue; }
      const sq = covered(b, s, t);
      b.deploy[s.side === 'A' ? 0 : 1].push(...sq);
      if (s.kind === 'band') b.edges = sq;
    }
  }
  // No zone drawn for a side (The Rescue): the core-rules long-edge zones.
  if (!b.deploy[0].length || !b.deploy[1].length) {
    const std = deploymentMap({ ...o.mission, id: 'opr-standard', deployment: undefined, roles: false }, o.points, { ...t, label: '', why: '' })!;
    for (const s of std.shapes) if (s.kind === 'rect' && s.side !== 'none' && !b.deploy[s.side === 'A' ? 0 : 1].length) b.deploy[s.side === 'A' ? 0 : 1] = covered(b, s, t);
  }
  // The raid and last stand put the attacker on the edges and the defender in the middle: the edge band would
  // swallow the defender's circle, so take the circle out of it.
  b.deploy[0] = b.deploy[0].filter((s) => !b.deploy[1].includes(s));
  // Ambush: the attacker sets up anywhere over 12" from the defender's zone.
  if (o.mission.id === 'opr-ambush') b.deploy[0] = all(b).filter((s) => b.deploy[1].every((d) => dist(b, s, d) > 2));

  const markers = shapes.filter((s): s is Extract<MapShape, { kind: 'marker' }> => s.kind === 'marker');
  const sqAt = (x: number, y: number) => idx(b, Math.min(b.w - 1, Math.floor(x / SQUARE)), Math.min(b.h - 1, Math.floor(y / SQUARE)));
  const own = (o.mission.rules ?? []).some((r) => r.text.startsWith('Each player sets up 1 marker 12"'));
  if (markers.length) {
    for (const m of markers) {
      // A marker on a zone line (12" from an edge) goes on the square inside no man's land.
      let sq = sqAt(m.x, Math.abs(m.y - t.h) < 0.01 ? t.h - 1 : m.y - (m.y > t.h / 2 ? 0.01 : 0));
      if (b.deploy.some((d) => d.includes(sq)) && !/hq/i.test(o.mission.id) && o.mission.id !== 'opr-breakthrough' && o.mission.id !== 'opr-headquarters') {
        const [x, y] = xy(b, sq);
        sq = idx(b, x, y < b.h / 2 ? y + 1 : y - 1);
      }
      b.objectives.push({ sq });
    }
    if (own && b.objectives.length === 2) {
      // Each side's own marker is the one nearer its own edge.
      const near0 = (s: number) => Math.min(...b.deploy[0].map((d) => dist(b, s, d)));
      const [a, c] = b.objectives;
      a.owner = near0(a.sq) <= near0(c.sq) ? 0 : 1;
      c.owner = a.owner === 0 ? 1 : 0;
    }
  } else {
    const n = typeof o.mission.objectives === 'number' ? o.mission.objectives : Math.max(1, roll(o.mission.objectives, o.rng));
    b.objectives = placeMarkers(b, n, o.rng).map((sq) => ({ sq }));
  }
  if (map?.notes.length) b.notes.push(...map.notes);

  placeTerrain(b, o.sector, o.rng);
  return b;
}

const all = (b: Pick<Board, 'w' | 'h'>) => Array.from({ length: b.w * b.h }, (_, i) => i);

/** Markers the players would place: outside the deployment zones and over 9" apart, spread over the table, mirrored. */
function placeMarkers(b: Board, n: number, rng: Rng): number[] {
  let free = all(b).filter((s) => !b.deploy[0].includes(s) && !b.deploy[1].includes(s));
  // Ambush: the attacker can set up nearly anywhere, so only the defender's zone is kept clear.
  if (free.length < b.w * 2) free = all(b).filter((s) => !b.deploy[1].includes(s) && !b.deploy[1].some((d) => dist(b, s, d) < 1));
  const out: number[] = [];
  const mirror = (s: number) => { const [x, y] = xy(b, s); return idx(b, b.w - 1 - x, b.h - 1 - y); };
  const ok = (p: number, gap: number) => free.includes(p) && !out.includes(p) && out.every((q) => dist(b, p, q) >= gap);
  let guard = 0;
  while (out.length < n && guard++ < 300) {
    const s = free[Math.floor(rng() * free.length)];
    if (out.length + 1 < n) {
      // In mirrored pairs, so neither side gets the better spread.
      const m = mirror(s);
      if (m !== s && ok(s, 2) && ok(m, 2) && dist(b, s, m) >= 2) out.push(s, m);
    } else if (ok(s, 2) && (Math.abs(xy(b, s)[1] - (b.h - 1) / 2) <= 1 || guard > 150)) out.push(s);
  }
  // Too crowded for that: any free square, as far apart as it allows.
  for (const gap of [2, 1]) for (const s of free) if (out.length < n && ok(s, gap)) out.push(s);
  return out.slice(0, n);
}

/** Terrain for the sector: about a fifth to a quarter of the squares, never Blocking on a deployment zone or marker. */
function placeTerrain(b: Board, sector: SectorType | undefined, rng: Rng) {
  const kind = SECTOR_TERRAIN[sector ?? 'default'] ?? SECTOR_TERRAIN.default;
  const count = Math.round(b.w * b.h * kind.density);
  const marker = new Set(b.objectives.map((o) => o.sq));
  const deploy = new Set([...b.deploy[0], ...b.deploy[1]]);
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 20) {
    const s = Math.floor(rng() * b.w * b.h);
    if (b.terrain[s]) continue;
    const piece = kind.pieces[Math.floor(rng() * kind.pieces.length)];
    if (piece.blocking) {
      if (marker.has(s) || deploy.has(s)) continue;
      // Keep the table open: no Blocking square beside another, and no more than one in twelve.
      if (neighbours(b, s).some((n) => b.terrain[n]?.blocking)) continue;
      if (b.terrain.filter((x) => x?.blocking).length >= Math.ceil((b.w * b.h) / 12)) continue;
    }
    if (piece.dangerous && marker.has(s)) continue;
    b.terrain[s] = { ...piece };
    placed++;
  }
}
