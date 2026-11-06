import { rand, seedOf } from '../training/rng';
import { WARPATH } from './data';
import type { Enemy, Terrain, TerrainKind } from './types';

// The endless field: terrain laid a chunk at a time from the run's seed (the same chunk always looks the same), and a
// spatial hash over the enemies so targeting and crowding stay cheap with a thousand on the field.

const C = WARPATH.chunk;
const chunkCache = new Map<string, Terrain[]>();

/** The terrain in one chunk: 2–4 features of full OPR kinds, kept off the spawn point and far enough inside the chunk
 *  (7.6") that no feature reaches into the next, so a body only ever checks its own chunk. */
export function chunkTerrain(seed: number, cx: number, cy: number): Terrain[] {
  const key = `${seed}:${cx}:${cy}`;
  const hit = chunkCache.get(key);
  if (hit) return hit;
  const r = { rng: seedOf(key) };
  const out: Terrain[] = [];
  const n = 2 + Math.floor(rand(r) * 3);
  for (let i = 0; i < n; i++) {
    const roll = rand(r);
    const kind: TerrainKind = roll < 0.3 ? 'block' : roll < 0.6 ? 'cover' : roll < 0.85 ? 'difficult' : 'dangerous';
    const x = (cx + 0.16 + rand(r) * 0.68) * C;
    const y = (cy + 0.16 + rand(r) * 0.68) * C;
    const rad = kind === 'block' ? 2 + rand(r) * 2.5 : 3 + rand(r) * 3.5;
    if (Math.hypot(x, y) < 12) continue;
    out.push({ kind, x, y, r: rad, icon: Math.floor(rand(r) * 4) });
  }
  if (chunkCache.size > 4000) chunkCache.clear();
  chunkCache.set(key, out);
  return out;
}

/** Terrain within `pad` inches of a box. */
export function terrainNear(seed: number, x0: number, y0: number, x1: number, y1: number): Terrain[] {
  const out: Terrain[] = [];
  for (let cx = Math.floor(x0 / C); cx <= Math.floor(x1 / C); cx++)
    for (let cy = Math.floor(y0 / C); cy <= Math.floor(y1 / C); cy++) out.push(...chunkTerrain(seed, cx, cy));
  return out;
}

/** The terrain at a point (the first feature it stands in), if any. */
export function terrainAt(seed: number, x: number, y: number): Terrain | undefined {
  for (const t of chunkTerrain(seed, Math.floor(x / C), Math.floor(y / C))) if ((x - t.x) ** 2 + (y - t.y) ** 2 < t.r * t.r) return t;
  return undefined;
}

/** Is (x, y) in cover? */
export const inCover = (seed: number, x: number, y: number) => terrainAt(seed, x, y)?.kind === 'cover';

/** Push a body of radius `br` out of blocking terrain. */
export function unblock(seed: number, p: { x: number; y: number }, br: number): void {
  for (const t of chunkTerrain(seed, Math.floor(p.x / C), Math.floor(p.y / C))) {
    if (t.kind !== 'block') continue;
    const dx = p.x - t.x;
    const dy = p.y - t.y;
    const d = Math.hypot(dx, dy);
    const min = t.r + br;
    if (d < min) {
      const k = d > 1e-6 ? min / d : 1;
      p.x = t.x + (d > 1e-6 ? dx * k : min);
      p.y = t.y + (d > 1e-6 ? dy * k : 0);
    }
  }
}

/** Does a line from a to b pass through blocking terrain (for shots without Indirect)? */
export function blocked(seed: number, ax: number, ay: number, bx: number, by: number): boolean {
  const ts = terrainNear(seed, Math.min(ax, bx), Math.min(ay, by), Math.max(ax, bx), Math.max(ay, by));
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  for (const t of ts) {
    if (t.kind !== 'block') continue;
    const k = Math.max(0, Math.min(1, ((t.x - ax) * dx + (t.y - ay) * dy) / len2));
    if ((ax + dx * k - t.x) ** 2 + (ay + dy * k - t.y) ** 2 < (t.r * 0.8) ** 2) return true;
  }
  return false;
}

/** A spatial hash over the enemies, rebuilt each step: linked lists in typed arrays, keyed by cell. */
export class Grid {
  readonly cell: number;
  private heads = new Map<number, number>();
  private next = new Int32Array(256);
  private list: Enemy[] = [];

  constructor(cell = 4) {
    this.cell = cell;
  }

  private key(cx: number, cy: number) {
    return ((cx + 32768) << 16) | ((cy + 32768) & 0xffff);
  }

  build(enemies: Enemy[]): void {
    this.heads.clear();
    this.list = enemies;
    if (this.next.length < enemies.length) this.next = new Int32Array(enemies.length * 2);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.hp <= 0 || e.emerge) continue;
      const k = this.key(Math.floor(e.x / this.cell), Math.floor(e.y / this.cell));
      this.next[i] = this.heads.get(k) ?? -1;
      this.heads.set(k, i);
    }
  }

  /** Call `f` for each live enemy within `r` of (x, y); stop early if it returns true. */
  near(x: number, y: number, r: number, f: (e: Enemy, d2: number) => boolean | void): void {
    const c = this.cell;
    const r2 = r * r;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++) {
        let i = this.heads.get(this.key(cx, cy)) ?? -1;
        while (i >= 0) {
          const e = this.list[i];
          if (e.hp > 0) {
            const d2 = (e.x - x) ** 2 + (e.y - y) ** 2;
            if (d2 <= r2 && f(e, d2)) return;
          }
          i = this.next[i];
        }
      }
    }
  }

  /** The nearest live enemy within `r`, or the one with the most wounds (a sniper's pick). */
  pick(x: number, y: number, r: number, toughest = false, ok?: (e: Enemy) => boolean): Enemy | undefined {
    let best: Enemy | undefined;
    let score = Infinity;
    this.near(x, y, r, (e, d2) => {
      if (ok && !ok(e)) return;
      const s = toughest ? -e.hp : d2;
      if (s < score) { score = s; best = e; }
    });
    return best;
  }
}
