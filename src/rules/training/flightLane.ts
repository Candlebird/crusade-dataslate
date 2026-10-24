import { SHARD_TYPES, TRAINING, type ShardType } from '../downtimeData';
import { centre, N, noBuild, WAYPOINTS, type Tile } from './map';

// The flight lane: flyers go straight pad to pad (waves.ts move), so the lane is fixed. Building along it is open
// (only the pads, base and spawn corner are barred) and Firepower and Swift Shards do more to what flies it.

export interface Leg {
  a: { x: number; y: number };
  b: { x: number; y: number };
}

/** The lane's legs: spawn to each pad in turn, then the base (centres). */
export const LANE: Leg[] = WAYPOINTS.slice(1).map((t, i) => ({ a: centre(WAYPOINTS[i]), b: centre(t) }));

/** How far (x, y) is from a leg's straight line. */
export function legDist(l: Leg, x: number, y: number): number {
  const dx = l.b.x - l.a.x;
  const dy = l.b.y - l.a.y;
  const len = dx * dx + dy * dy;
  const k = len ? Math.max(0, Math.min(1, ((x - l.a.x) * dx + (y - l.a.y) * dy) / len)) : 0;
  return Math.hypot(x - (l.a.x + k * dx), y - (l.a.y + k * dy));
}

/** How far (x, y) is from the nearest leg of the lane. */
export const laneDist = (x: number, y: number): number => Math.min(...LANE.map((l) => legDist(l, x, y)));

let band: Tile[] | undefined;
/** The cells within TRAINING.flightLane.width of the lane (their centres), for drawing. */
export function laneCells(): Tile[] {
  band ??= Array.from({ length: N * N }, (_, i) => ({ x: i % N, y: Math.floor(i / N) }))
    .filter((c) => laneDist(c.x + 0.5, c.y + 0.5) <= TRAINING.flightLane.width);
  return band;
}

/** A Shard type's damage share against flyers (SHARD_TYPES `air`, 1 for most). */
export const antiAir = (type: ShardType): number => SHARD_TYPES[type].air ?? 1;

/** Spots a piece can go (empty map) with its centre within `r` cells of leg `l`. */
export function spotsBy(l: Leg, r: number): Tile[] {
  const out: Tile[] = [];
  for (let y = 0; y < N - 1; y++) {
    for (let x = 0; x < N - 1; x++) if (!noBuild(x, y) && legDist(l, x + 1, y + 1) <= r) out.push({ x, y });
  }
  return out;
}
