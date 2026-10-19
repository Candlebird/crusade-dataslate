import { describe, expect, it } from 'vitest';
import {
  applyScar,
  battlePoints,
  deathDiceCount,
  deathOutcome,
  detectCategory,
  levelForXp,
  pendingLevels,
  previousBracketXp,
  relicSlots,
  sufferingRolls,
  upgradesUsed,
  validateUnit,
  xpProgress,
} from './engine';
import { DEFAULT_SETTINGS, type Unit } from '../model/types';

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u', name: 'Test', unitType: 'Test', category: 'Hero', categoryOverridden: false,
  points: 100, size: 1, quality: 3, defense: 3, tough: 3, rules: [], weapons: [], xp: 0,
  upgrades: [], scars: [], relics: [], bpAdjust: 0, status: 'active', battles: 0, kills: 0, notes: '',
  ...over,
});

describe('levels', () => {
  it('uses 10/20/40/60/90/120/170 thresholds', () => {
    expect([0, 9, 10, 19, 20, 40, 59, 60, 90, 120, 169, 170, 500].map(levelForXp))
      .toEqual([0, 0, 1, 1, 2, 3, 3, 4, 5, 6, 6, 7, 7]);
  });
  it('tracks progress and post-170 replacements', () => {
    expect(xpProgress(30)).toMatchObject({ level: 2, floor: 20, next: 40, pct: 0.5 });
    expect(xpProgress(215)).toMatchObject({ level: 7, next: null, replacements: 2 });
  });
});

describe('pending level-ups', () => {
  it('counts levels earned but not spent', () => {
    expect(pendingLevels(unit({ xp: 25 }))).toBe(2);
    expect(pendingLevels(unit({ xp: 25, upgrades: [{ id: 't', name: 'Tough', unique: false }] }))).toBe(1);
  });
  it('ignores free traits, overspending and fallen units', () => {
    expect(pendingLevels(unit({ xp: 10, upgrades: [{ id: 't', name: 'Gift', unique: false, free: true }] }))).toBe(1);
    expect(pendingLevels(unit({ xp: 0, upgrades: [{ id: 't', name: 'Tough', unique: false }] }))).toBe(0);
    expect(pendingLevels(unit({ xp: 40, status: 'removed' }))).toBe(0);
  });
});

describe('relic slots', () => {
  it('follows the XP brackets', () => {
    expect([0, 9, 10, 40, 41, 59, 60, 120, 121, 199, 200].map(relicSlots))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });
});

describe('category detection', () => {
  it('handles keywords, size and toughness', () => {
    expect(detectCategory({ rules: ['Hero', 'Tough(3)'], size: 1 })).toBe('Hero');
    expect(detectCategory({ rules: ['Aircraft', 'Tough(6)'], size: 1 })).toBe('Aircraft');
    expect(detectCategory({ rules: ['Immobile'], size: 1 })).toBe('Fortification');
    expect(detectCategory({ rules: [], size: 5 })).toBe('Infantry');
    expect(detectCategory({ rules: ['Tough(3)'], size: 1 })).toBe('Elite');
    expect(detectCategory({ rules: ['Tough(12)'], size: 1 })).toBe('Vehicle/Monster');
    expect(detectCategory({ rules: ['Tough(6)'], size: 1, name: 'Coffin Walker' })).toBe('Vehicle/Monster');
  });
});

describe('battle points', () => {
  it('counts upgrades, relics and scars', () => {
    const u = unit({
      upgrades: [{ id: '1', name: 'Takedown Strike', unique: false }, { id: '2', name: 'Crazed', unique: true }],
      relics: [{ id: 'r', name: 'Oblivion Orb', tier: 'Legendary' }],
      scars: [{ id: 's', name: 'Faulty Aim' }],
    });
    expect(battlePoints(u, DEFAULT_SETTINGS)).toBe(1 + 2 + 4 - 1);
  });
  it('treats two infantry weapon traits as one upgrade', () => {
    const u = unit({
      category: 'Infantry',
      weapons: [{ id: 'w', name: 'Blade', count: 5, range: 0, attacks: 2, rules: [],
        traits: [{ id: 'a', name: '+1 A', unique: false }, { id: 'b', name: 'Thrust', unique: false }] }],
    });
    expect(battlePoints(u, DEFAULT_SETTINGS)).toBe(1);
    expect(upgradesUsed(u)).toBe(1);
  });
});

describe('validation', () => {
  it('flags limits', () => {
    const u = unit({
      xp: 5,
      upgrades: Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `T${i}`, unique: false })),
      relics: [{ id: 'r', name: 'Vortex Grenade', tier: 'Rare' }],
    });
    const text = validateUnit(u).map((i) => i.text).join('\n');
    expect(text).toMatch(/6\/5 normal traits/);
    expect(text).toMatch(/only 0 relic slot/);
    expect(text).toMatch(/needs 41\+ XP/);
  });
});

describe('deaths', () => {
  it('scars on any 1, +1 XP on a 6 otherwise', () => {
    expect(deathOutcome([1])).toBe('scar');
    expect(deathOutcome([6])).toBe('xp');
    expect(deathOutcome([3])).toBe('none');
    expect(deathOutcome([6, 1])).toBe('scar');
    expect(deathOutcome([6, 4])).toBe('xp');
  });
  it('rolls two dice with Lowered Constitution', () => {
    expect(deathDiceCount(unit())).toBe(1);
    expect(deathDiceCount(unit({ scars: [{ id: 's', name: 'Lowered Constitution' }] }))).toBe(2);
  });
  it('applies scars, comatose and removal on the 4th', () => {
    const u = unit();
    expect(applyScar(u, { id: 'c', name: 'Comatose' })).toBe('comatose');
    expect(u.scars).toHaveLength(0);
    expect(u.status).toBe('comatose');
    const v = unit();
    for (let i = 0; i < 3; i++) expect(applyScar(v, { id: `${i}`, name: 'Weak Spot' })).toBe('scarred');
    expect(applyScar(v, { id: '4', name: 'Weak Spot' })).toBe('removed');
    expect(v.status).toBe('removed');
  });
  it('drops to the previous XP bracket when losing a trait', () => {
    expect([5, 12, 25, 45, 100, 200].map(previousBracketXp)).toEqual([0, 0, 10, 20, 60, 120]);
  });
});

describe('growth through suffering', () => {
  it('rolls once per 5 BP difference, minimum 1', () => {
    expect([[10, 10], [10, 8], [10, 11], [10, 15], [10, 24], [0, 10]].map(([a, b]) => sufferingRolls(a, b)))
      .toEqual([0, 0, 1, 1, 2, 2]);
  });
});

describe('heroic rise', () => {
  it('allows relics on non-heroes', () => {
    const relics = [{ id: 'r', name: 'Artisan Bionics', tier: 'Common' as const }];
    const base = { category: 'Infantry' as const, xp: 10, relics };
    expect(validateUnit(unit(base)).some((i) => i.text.includes('Heroes only'))).toBe(true);
    expect(validateUnit(unit({ ...base, heroicRise: true })).some((i) => i.text.includes('Heroes only'))).toBe(false);
  });
});
