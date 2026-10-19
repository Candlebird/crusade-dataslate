import { describe, expect, it } from 'vitest';
import raw from '../data/spears-of-dothea.raw.json';
import { newForce, newUnit } from '../model/factory';
import { applySelection, bookPageUrl, forceArmyUrl, normalizeBook, parseBookUid, parseTextList, parseWeaponText } from './book';

describe('Army Forge book import', () => {
  const book = normalizeBook(raw);

  it('parses links', () => {
    expect(parseBookUid('https://army-forge.onepagerules.com/army-info/grimdark-future/ykNPXx5YgsdGWqJi?armyName=X'))
      .toBe('ykNPXx5YgsdGWqJi');
    expect(parseBookUid('nonsense link')).toBeNull();
  });

  it('links back to Army Forge', () => {
    const url = bookPageUrl('ykNPXx5YgsdGWqJi', 'The Spears of Dothea');
    expect(url).toBe('https://army-forge.onepagerules.com/army-info/grimdark-future/ykNPXx5YgsdGWqJi?armyName=The%20Spears%20of%20Dothea');
    expect(parseBookUid(url)).toBe('ykNPXx5YgsdGWqJi');
    // Units saved before bookUid existed are matched by book name.
    const f = { ...newForce('X'), units: [newUnit({ bookName: book.name })] };
    expect(forceArmyUrl(f, [book])).toBe(url);
    expect(forceArmyUrl({ ...f, armyLink: 'https://example.test/list' }, [book])).toBe('https://example.test/list');
  });

  it('normalizes units', () => {
    expect(book.name).toBe('The Spears of Dothea');
    expect(book.units).toHaveLength(57);
    const cw = book.units.find((u) => u.name === 'Coffin Walker')!;
    expect(cw).toMatchObject({ cost: 210, quality: 4, defense: 3, size: 1 });
    expect(cw.rules).toContain('Tough(6)');
    expect(cw.weapons[0]).toMatchObject({ name: 'Twin Heavy Shred Rifle', count: 2, range: 18, attacks: 4 });
    // units whose profile is stored under "loadout" still get weapons
    expect(book.units[0].weapons.length).toBeGreaterThan(0);
  });

  it('applies a replace option', () => {
    const u = book.units.find((x) => x.sections.some((s) => s.variant === 'replace' && s.pickOne))!;
    const sec = u.sections.find((s) => s.variant === 'replace' && s.pickOne)!;
    const opt = sec.options[0];
    const out = applySelection(u, { [`${sec.id}:${opt.id}`]: 1 });
    expect(out.cost).toBe(u.cost + opt.cost);
    const gained = opt.gains.find((g) => g.kind === 'weapon');
    if (gained && gained.kind === 'weapon') expect(out.weapons.some((w) => w.name === gained.weapon.name)).toBe(true);
  });
});

describe('text list parsing', () => {
  it('parses weapons and unit headers', () => {
    expect(parseWeaponText('2x Heavy Rifle (24", A1, AP(1))')).toEqual({
      name: 'Heavy Rifle', count: 2, range: 24, attacks: 1, rules: ['AP(1)'],
    });
    const units = parseTextList(`++ Spears [GF 1000pts] ++

Force Commander [1] Q3+ D3+ | 65pts | Hero, Tough(3)
Heavy Pistol (12", A1, AP(1)), CCW (A2)

Battle Brothers [5] Q3+ D3+ | 170pts | Fearless
5x Rifle (24", A1), 5x CCW (A1)`);
    expect(units).toHaveLength(2);
    expect(units[0]).toMatchObject({ name: 'Force Commander', size: 1, quality: 3, defense: 3, cost: 65, rules: ['Hero', 'Tough(3)'] });
    expect(units[0].weapons.map((w) => w.name)).toEqual(['Heavy Pistol', 'CCW']);
    expect(units[1].weapons[0]).toMatchObject({ name: 'Rifle', count: 5, range: 24 });
  });
});
