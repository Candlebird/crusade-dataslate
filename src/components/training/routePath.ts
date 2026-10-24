import { BASE, LEGS, WAYPOINTS, centre, heading, mapOf, type MapState, type TrainingRun } from '../../rules/training';

// The line a walker actually takes, for drawing: from the spawn's middle, cell middle to cell middle down each leg's
// flow field (as waves.ts move does), through each pad's middle, to the base. map.ts route() lists cells from the
// spawn's top-left cell instead, which draws half a cell off the walkers.

export interface Pt {
  x: number;
  y: number;
}

const cache = new WeakMap<MapState, Pt[]>();

export function walkPath(run: TrainingRun): Pt[] {
  const m = mapOf(run);
  const hit = cache.get(m);
  if (hit) return hit;
  let at: Pt = centre(WAYPOINTS[0]);
  const out: Pt[] = [at];
  for (let leg = 0; leg < LEGS; leg++) {
    const goal = centre(WAYPOINTS[leg + 1]);
    for (let guard = 0; guard < 4000; guard++) {
      const to = heading(m, leg, at.x, at.y);
      if (to.x === at.x && to.y === at.y) break;
      out.push(to);
      at = to;
      if (to.x === goal.x && to.y === goal.y) break;
      // The last leg ends where the walker reaches the base.
      if (leg === LEGS - 1 && Math.hypot(to.x - BASE.x, to.y - BASE.y) <= BASE.radius) break;
    }
  }
  cache.set(m, out);
  return out;
}
