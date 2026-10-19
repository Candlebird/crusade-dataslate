import { describe, expect, it } from 'vitest';
import { buildSeedState } from './seed';
import { newUnit } from './factory';
import { allTags, bookOf, matchesTags, normalizeTag, setDatasheetTags, unitTags } from './tags';

describe('unit tags', () => {
  it('are kept on the book per datasheet and shared by its units', () => {
    const s = buildSeedState();
    const book = s.books[0];
    const fang = s.forces[0].units.find((u) => u.unitType === 'Force Commander')!;
    setDatasheetTags(s, book.uid, 'Force Commander', ['Commander', 'All-Rounder', 'Commander']);
    expect(book.unitTags?.['Force Commander']).toEqual(['All-Rounder', 'Commander']);
    expect(book.updatedAt).toBeTruthy();
    expect(unitTags(fang, s.books)).toEqual(['All-Rounder', 'Commander']);
    expect(allTags(s.books)).toEqual(['All-Rounder', 'Commander']);
    setDatasheetTags(s, book.uid, 'Force Commander', []);
    expect(book.unitTags).toBeUndefined();
  });

  it('finds the book of a pasted unit by its datasheet name', () => {
    const s = buildSeedState();
    expect(bookOf(newUnit({ unitType: 'Force Commander' }), s.books)?.uid).toBe(s.books[0].uid);
    expect(bookOf(newUnit({ unitType: 'Homebrew Thing' }), s.books)).toBeUndefined();
  });

  it('reuses the spelling of an existing tag and filters on every picked tag', () => {
    expect(normalizeTag('  chaff  ', ['Chaff'])).toBe('Chaff');
    expect(normalizeTag('Fast   Mover', [])).toBe('Fast Mover');
    expect(matchesTags(['Chaff', 'Fast'], ['Chaff'])).toBe(true);
    expect(matchesTags(['Chaff'], ['Chaff', 'Fast'])).toBe(false);
    expect(matchesTags([], [])).toBe(true);
  });
});
