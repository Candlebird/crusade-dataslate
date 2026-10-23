import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { hasRule } from './engine';
import { BIG_UNIT, BIG_UNIT_PER, randomEchoes } from './echoForce';

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));

describe('random Void Echoes force', () => {
  it('gives an empty force for a book with no units instead of throwing', () => {
    expect(randomEchoes({ ...book, units: [] }, 1000)).toEqual([]);
  });

  it('stays within the target and the list limits', () => {
    for (const target of [500, 1000, 2000, 4000]) {
      for (let i = 0; i < 20; i++) {
        const units = randomEchoes(book, target);
        const total = units.reduce((n, u) => n + u.points, 0);
        expect(total).toBeLessThanOrEqual(target);
        expect(total).toBeGreaterThan(target * 0.7);
        expect(units.every((u) => u.points <= target * 0.35)).toBe(true);
        expect(units.filter((u) => hasRule(u.rules, 'Hero')).length).toBeLessThanOrEqual(Math.max(1, Math.floor(target / 375)));
        const counts = new Map<string, number>();
        units.forEach((u) => counts.set(u.unitType, (counts.get(u.unitType) ?? 0) + 1));
        expect(Math.max(...counts.values())).toBeLessThanOrEqual(1 + Math.floor(target / 750));
        expect(units.every((u) => u.bookName === book.name)).toBe(true);
        const big = units.filter((u) => u.points > BIG_UNIT).map((u) => u.unitType);
        expect(big.filter((t) => counts.get(t)! > 1)).toEqual([]);
        expect(big.length).toBeLessThanOrEqual(Math.floor(target / BIG_UNIT_PER));
      }
    }
  });
});
