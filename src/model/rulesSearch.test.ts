import { describe, expect, it } from 'vitest';
import { entryId, rulesIndex, searchRules } from './rulesSearch';
import { RELICS, REWARD_TABLES, SCAR_TABLE, TRAIT_TABLES } from '../rules/data';
import { CRUSADE_TEXT } from '../rules/rulesText';

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

  it('points each hit at its exact entry, with a stable id', () => {
    const idx = rulesIndex();
    const trait = TRAIT_TABLES.Hero[0].name;
    expect(idx.find((h) => h.title === trait)?.entry).toBe(entryId('t-traits', `Hero traits: ${trait}`));
    expect(idx.find((h) => h.title === RELICS[0].name)?.entry).toMatch(/^rule-x-/);
    expect(idx.find((h) => h.text === CRUSADE_TEXT.experience[0])?.entry).toBe(entryId('r-xp', CRUSADE_TEXT.experience[0]));
    expect(entryId('r-xp', 'a')).toBe(entryId('r-xp', 'a'));
    expect(entryId('r-xp', 'a')).not.toBe(entryId('r-xp', 'b'));
    expect(entryId('r-xp', 'a')).toMatch(/^[\w-]+$/);
  });

  it('tells apart the same result in two reward tables', () => {
    const text = 'A Nexus trait token';
    const rows = rulesIndex().filter((h) => h.anchor === 'r-rewards' && h.text === text);
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows.map((h) => h.entry)).size).toBe(rows.length);
    expect(rows[0].entry).toBe(entryId('r-rewards', `${REWARD_TABLES.winner.label}: ${text}`));
  });

  it('gives every entry its own id', () => {
    const seen = new Map<string, string>();
    for (const h of rulesIndex()) {
      const what = `${h.section} / ${h.title ?? h.text}`;
      expect(seen.get(h.entry) ?? what).toBe(what);
      seen.set(h.entry, what);
    }
    expect(rulesIndex().find((h) => h.title === TRAIT_TABLES.Hero[0].name)?.entry).toBe(entryId('t-traits', `Hero traits: ${TRAIT_TABLES.Hero[0].name}`));
  });
});
