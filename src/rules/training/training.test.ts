import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import maze from '../trainingTestMaze.json';
import { routeLength } from './map';
import { playRun } from './bot';
import { createRun } from './run';
import { placeDraft } from './shards';
import { mapOf, placeProblem } from './board';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';

// Balance: the bot plays a run for sample forces of every army book in the repo; each should land near wave 20-27.

const BOOKS = ['armies/void-echoes.gf.json', 'armies/shadow-stalkers.aof.json', 'src/data/spears-of-dothea.raw.json'];
/** A sample force's points: about this many, never more than `MAX`. */
const AIM = 750;
const MAX = 850;

const bookUnits = (file: string): Unit[] => {
  const book = normalizeBook(JSON.parse(readFileSync(file, 'utf8')));
  return book.units.map((cu) => unitFromCatalog(cu, applySelection(cu, {}), book));
};

/** A ~800 pt force from a book: units in the given order while they fit, until AIM is reached. */
function sample(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  let pts = 0;
  for (const u of units) {
    if (pts >= AIM) break;
    if (pts + u.points > MAX) continue;
    out.push({ ...u, id: `${u.id}-${out.length}` });
    pts += u.points;
  }
  return out;
}

/** Two forces a book: its datasheets in order, and every other one from the back. */
const FORCES = BOOKS.flatMap((file) => {
  const us = bookUnits(file);
  const name = file.split('/').pop()!.split('.')[0];
  return [
    { name: `${name} A`, units: sample(us) },
    { name: `${name} B`, units: sample(us.filter((_, i) => i % 2 === 0).reverse()) },
  ];
});
const SEEDS = [1, 2, 3];

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
