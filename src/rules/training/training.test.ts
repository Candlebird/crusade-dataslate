import { describe, expect, it } from 'vitest';
import maze from '../trainingTestMaze.json';
import { routeLength } from './map';
import { createRun } from './run';
import { placeDraft } from './shards';
import { mapOf, placeProblem } from './board';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';

// The test maze the balance bot plays on (bot.balance.test.ts has its runs for the sample forces).

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
});
