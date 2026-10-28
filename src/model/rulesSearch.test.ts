import { describe, expect, it } from 'vitest';
import { rulesIndex, searchRules } from './rulesSearch';
import { RELICS, SCAR_TABLE, TRAIT_TABLES } from '../rules/data';

describe('rules search', () => {
  it('indexes traits, relics and scars on their pages', () => {
    const idx = rulesIndex();
    const trait = TRAIT_TABLES.Hero[0].name;
    expect(idx.find((h) => h.title === trait)).toMatchObject({ page: 'traits', anchor: 't-traits' });
    expect(idx.find((h) => h.title === RELICS[0].name)?.page).toBe('relics');
    expect(idx.find((h) => h.title === SCAR_TABLE[0].name)).toMatchObject({ page: undefined, anchor: 'r-deaths' });
  });

  it('finds an entry by a word of its name, ignoring case, name matches first', () => {
    const name = TRAIT_TABLES.Hero[0].name;
    const hits = searchRules(name.toUpperCase());
    expect(hits[0].title).toBe(name);
  });

  it('needs every word to match, and ignores empty or one-letter queries', () => {
    expect(searchRules('')).toEqual([]);
    expect(searchRules('a')).toEqual([]);
    expect(searchRules('zzqx nothing')).toEqual([]);
  });

  it('caps the number of hits', () => {
    expect(searchRules('the', 5)).toHaveLength(5);
  });
});
