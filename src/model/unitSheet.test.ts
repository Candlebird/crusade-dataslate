import { describe, expect, it } from 'vitest';
import { scarText, statusNote, traitDesc, weaponTraitDesc, xpNextText } from './unitSheet';
import { LEVEL_THRESHOLDS, MAX_SCARS, TRAIT_TABLES, WEAPON_TRAIT_TABLES } from '../rules/data';

describe('unit sheet helpers', () => {
  it('finds trait descriptions by name, ignoring case', () => {
    const e = TRAIT_TABLES.Hero[0];
    expect(traitDesc(e.name)).toBe(e.desc);
    expect(traitDesc(e.name.toUpperCase())).toBe(e.desc);
    expect(traitDesc('Homebrew thing')).toBeUndefined();
  });

  it('finds weapon trait descriptions', () => {
    const e = WEAPON_TRAIT_TABLES.Melee[0];
    expect(weaponTraitDesc(e.name)).toBe(e.desc);
  });

  it('says how much XP is left to the next level', () => {
    expect(xpNextText(0)).toBe(`${LEVEL_THRESHOLDS[0]} XP to level 1.`);
    expect(xpNextText(LEVEL_THRESHOLDS[0])).toBe(`${LEVEL_THRESHOLDS[1] - LEVEL_THRESHOLDS[0]} XP to level 2.`);
    expect(xpNextText(LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1])).toMatch(/^Max level/);
  });

  it('warns when one more scar removes the unit', () => {
    expect(scarText({ scars: [] })).toBe(`0 of ${MAX_SCARS}. A scar past ${MAX_SCARS} removes the unit.`);
    const full = { scars: Array.from({ length: MAX_SCARS }, (_, i) => ({ id: String(i), name: 'x' })) };
    expect(scarText(full)).toMatch(/one more scar removes/);
  });

  it('only notes units that are not active', () => {
    expect(statusNote({ status: 'active' })).toBeNull();
    expect(statusNote({ status: 'comatose' })).toMatch(/sits out/);
    expect(statusNote({ status: 'removed' })).toMatch(/Fallen/);
  });
});
