import { describe, expect, it } from 'vitest';
import type { CatalogBook } from './types';
import { blankDatasheet, removeDatasheet, saveDatasheet, splitRules } from './bookEdit';

function book(): CatalogBook {
  const a = { ...blankDatasheet(), id: 'a', name: 'Echo Walker' };
  const b = { ...blankDatasheet(), id: 'b', name: 'Void Wraith' };
  return { uid: 'v', name: 'Void Echoes', faction: '', version: '1', importedAt: '', units: [a, b], rules: [], spells: [], unitTags: { 'Echo Walker': ['Chaff'] } };
}

describe('editing army book datasheets', () => {
  it('splits rules on commas outside brackets', () => {
    expect(splitRules('Hero, Tough(3), Blast(3, 6) ,, Fearless')).toEqual(['Hero', 'Tough(3)', 'Blast(3, 6)', 'Fearless']);
  });

  it('saves edits, carrying tags across a rename, and adds new datasheets', () => {
    const b = book();
    saveDatasheet(b, { ...b.units[0], name: 'Echo Stalker', quality: 3 });
    expect(b.units[0]).toMatchObject({ id: 'a', name: 'Echo Stalker', quality: 3 });
    expect(b.unitTags).toEqual({ 'Echo Stalker': ['Chaff'] });
    expect(b.edited).toBe(true);
    saveDatasheet(b, { ...blankDatasheet(), id: 'c', name: 'Shade' });
    expect(b.units.map((u) => u.id)).toEqual(['a', 'b', 'c']);
  });

  it('removes a datasheet and its tags', () => {
    const b = book();
    removeDatasheet(b, 'a');
    expect(b.units.map((u) => u.id)).toEqual(['b']);
    expect(b.unitTags).toEqual({});
  });
});
