import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../../armyforge/book';
import type { CatalogBook } from '../../model/types';
import { roleEchoes } from '../echoForce';
import { FACE_OFF_MISSIONS, PROGRESSIVE_MISSIONS, STANDARD_MISSION } from '../missions';

const MISSIONS = [STANDARD_MISSION, ...FACE_OFF_MISSIONS, ...PROGRESSIVE_MISSIONS];
import { mulberry32, quickBattle, randomArmy } from './sim';

// `npm run test:balance`: bot-vs-bot zone battles at equal points, which should come out close to 50/50.
const load = (f: string) => normalizeBook(JSON.parse(readFileSync(f, 'utf8')));
const ECHOES = load('armies/void-echoes.gf.json');
const BOOKS: CatalogBook[] = [load('src/data/spears-of-dothea.raw.json'), load('armies/shadow-stalkers.aof.json')];

function sweep(n: number, points: number, sides: (rng: () => number, i: number) => [CatalogBook, () => ReturnType<typeof randomArmy>, CatalogBook, () => ReturnType<typeof randomArmy>]) {
  const tally = { a: 0, d: 0, draw: 0 };
  for (let i = 0; i < n; i++) {
    const rng = mulberry32(1000 + i);
    const [ab, au, db, du] = sides(rng, i);
    const mission = MISSIONS[i % MISSIONS.length];
    const b = quickBattle(mission, { book: ab, units: au() }, { book: db, units: du() }, 7 + i);
    const w = b.result?.winner;
    if (w === 0) tally.a++; else if (w === 1) tally.d++; else tally.draw++;
  }
  console.log(`${points} pts:`, tally);
  return tally;
}

describe('zone battle balance', () => {
  for (const points of [1000, 2000]) {
    it(`a player army against an Echo garrison of the same Supply is close to even (${points} pts)`, () => {
      const t = sweep(120, points, (rng, i) => {
        const book = BOOKS[i % BOOKS.length];
        return [book, () => randomArmy(book, points, rng, 'p'), ECHOES, () => roleEchoes(ECHOES, points, rng)];
      });
      const decided = t.a + t.d;
      expect(t.a / decided).toBeGreaterThan(0.35);
      expect(t.a / decided).toBeLessThan(0.65);
    }, 600000);
  }
  it('a mirror match is close to even', () => {
    const t = sweep(120, 1500, (rng) => [ECHOES, () => randomArmy(ECHOES, 1500, rng, 'a'), ECHOES, () => randomArmy(ECHOES, 1500, rng, 'b')]);
    expect(t.a / (t.a + t.d)).toBeGreaterThan(0.38);
    expect(t.a / (t.a + t.d)).toBeLessThan(0.62);
  }, 600000);
});
