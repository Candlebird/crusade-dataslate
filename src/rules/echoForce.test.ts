import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { hasRule } from './engine';
import { BIG_UNIT, BIG_UNIT_PER, randomEchoes, roleEchoes, roleOf } from './echoForce';
import { mulberry32 } from './zone/dice';

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

describe('garrison by role', () => {
  it('is the same for the same seed, fills its Supply, and has a hero, troops and support', () => {
    for (const target of [750, 1500, 3000]) {
      const a = roleEchoes(book, target, mulberry32(target));
      expect(roleEchoes(book, target, mulberry32(target)).map((u) => u.unitType)).toEqual(a.map((u) => u.unitType));
      const total = a.reduce((n, u) => n + u.points, 0);
      expect(total).toBeLessThanOrEqual(target);
      expect(total).toBeGreaterThan(target * 0.85);
      expect(a.some((u) => hasRule(u.rules, 'Hero'))).toBe(true);
      expect(a.filter((u) => hasRule(u.rules, 'Hero')).length).toBeLessThanOrEqual(Math.max(1, Math.floor(target / 375)));
      const cat = (u: (typeof a)[number]) => book.units.find((c) => c.name === u.unitType)!;
      expect(a.some((u) => roleOf(cat(u)) === 'core')).toBe(true);
      if (target >= 1500) expect(a.some((u) => roleOf(cat(u)) === 'support')).toBe(true);
    }
  });
});
