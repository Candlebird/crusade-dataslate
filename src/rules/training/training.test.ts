import { describe, expect, it } from 'vitest';
import maze from '../trainingTestMaze.json';
import { routeLength } from './map';
import { playRun } from './bot';
import { createRun } from './run';
import { placeDraft } from './shards';
import { mapOf, placeProblem } from './board';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { FORCES, SEEDS } from './testForces';

// Balance: the bot plays a run for sample forces of every army book in the repo; each should land near wave 20-27.

describe('training balance (bot)', () => {
  it('a typical walker takes about 60-90 s to walk the full test maze at 1×', () => {
    const run = createRun('m', [], 1);
    for (const s of maze) {
      if (run.draft.step !== 'place') run.draft = { step: 'place', hand: [{ type: 'assault', grade: 1 }], placed: [] };
      if (!placeProblem(run, s.x, s.y)) placeDraft(run, 0, s.x, s.y);
    }
    const cells = routeLength(mapOf(run));
    const secs = cells / (TRAINING_ENEMIES.drone.speed * TRAINING.walkMul);
    console.log(`test maze: ${Math.round(cells)} cells, a drone walks it in ${secs.toFixed(0)} s`);
    expect(secs).toBeGreaterThan(55);
    expect(secs).toBeLessThan(95);
  });

  it('every sample force reaches about wave 20-27', () => {
    const rows: string[] = [];
    const results: number[] = [];
    for (const f of FORCES) {
      const pts = f.units.reduce((n, u) => n + u.points, 0);
      for (const seed of SEEDS) {
        const t0 = performance.now();
        const run = playRun(f.units, seed, { maze, maxWaves: 60 });
        results.push(run.cleared);
        rows.push(`${f.name.padEnd(22)} ${String(pts).padStart(4)} pts ${f.units.length} units  seed ${seed}: wave ${run.cleared}` +
          `  crafted ${run.crafted.length}  luck ${run.luck}  ${Math.round(performance.now() - t0)} ms`);
      }
    }
    console.log(rows.join('\n'));
    for (const w of results) {
      expect(w).toBeGreaterThanOrEqual(15);
      expect(w).toBeLessThanOrEqual(35);
    }
  }, 120_000);
});
