import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { NEXUS_TRAITS, RELICS, RELIC_WEAPON_RULES, SCAR_TABLE, TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES } from './data';
import { auditBook, auditCrusade, bookRules, parseSpell, resolve } from './oprRules';

const load = (f: string) => normalizeBook(JSON.parse(readFileSync(f, 'utf8')));
const BOOKS = {
  dothea: load('src/data/spears-of-dothea.raw.json'),
  echoes: load('armies/void-echoes.gf.json'),
  stalkers: load('armies/shadow-stalkers.aof.json'),
};

describe('book import', () => {
  it('keeps renamed rules with the rule they stand for', () => {
    const heal = BOOKS.dothea.rules.find((r) => r.name === 'Heal');
    expect(heal?.alias).toBe('Mend');
    expect(BOOKS.dothea.rules.find((r) => r.name === 'Psy-Barrier')?.alias).toBe('Resistance');
  });
});

describe('rules map', () => {
  const br = bookRules([BOOKS.dothea]);
  it('plays Heal as Mend, and Healing Aura as Regeneration for the unit', () => {
    expect(resolve('Heal', br)?.hooks[0]).toMatchObject({ k: 'heal', n: 'D3', range: 3 });
    expect(resolve('Healing Aura', br)).toMatchObject({ scope: 'unit', hooks: [{ k: 'ignore', on: 5, regen: true }] });
    // An old import without the alias still works off the built-in table.
    expect(resolve('Heal')?.hooks[0].k).toBe('heal');
  });
  it('reads ratings and suffixes', () => {
    expect(resolve('Tough(6)')?.hooks).toEqual([{ k: 'tough', n: 6 }]);
    expect(resolve('Blast(3)')?.hooks[0]).toEqual({ k: 'blast', n: 3 });
    expect(resolve('AP(+1) when Shooting Aura', br)).toMatchObject({ scope: 'unit', hooks: [{ k: 'ap', n: 1, c: { when: 'shoot' } }] });
  });
  it('maps every crusade trait, relic and scar', () => {
    const all = [
      ...Object.values(TRAIT_TABLES).flat(), ...Object.values(UNIQUE_TRAIT_TABLES).flat(), ...Object.values(WEAPON_TRAIT_TABLES).flat(),
      ...Object.values(UNIQUE_WEAPON_TRAIT_TABLES).flat(), ...SCAR_TABLE, ...RELICS, ...RELIC_WEAPON_RULES, ...Object.values(NEXUS_TRAITS).flat(),
    ];
    const missing = auditCrusade(all).filter((r) => r.note === 'Not in the rules map').map((r) => r.name);
    expect(missing).toEqual([]);
  });
  it('reads spells', () => {
    const rain = BOOKS.dothea.spells.find((s) => s.name === 'Dothean Rain')!;
    expect(parseSpell(rain).hits).toMatchObject({ n: 2, ap: 2 });
    for (const b of Object.values(BOOKS)) for (const s of b.spells) expect(parseSpell(s, bookRules([b])).none, `${b.name}: ${s.name}: ${s.effect}`).toBeUndefined();
  });
});

describe('book audit', () => {
  for (const [key, book] of Object.entries(BOOKS)) {
    it(`${key}: every rule is mapped or flagged with a reason`, () => {
      const rows = auditBook(book);
      const gaps = rows.filter((r) => r.status === 'none' && !r.note?.length);
      expect(gaps).toEqual([]);
      if (process.env.AUDIT) console.log(`\n${book.name}\n` + rows.filter((r) => r.status !== 'full').map((r) => `  ${r.status.padEnd(7)} ${r.name}: ${r.note ?? ''}`).join('\n'));
    });
  }
});
