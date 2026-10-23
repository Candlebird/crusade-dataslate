import { describe, expect, it } from 'vitest';
import { migrateForce, RULES_VERSION } from './migrate';
import { newForce, newUnit } from '../model/factory';
import type { Force } from '../model/types';

function oldForce(): Force {
  const f = newForce('Old');
  delete f.rulesVersion;
  f.units = [
    newUnit({
      id: 'u',
      upgrades: [
        { id: '1', name: 'Protected', unique: false },
        { id: '2', name: 'Self-Repair', unique: false },
        { id: '3', name: 'Takedown', unique: false },
        { id: '4', name: 'Fly + Fast', unique: true },
        { id: '5', name: 'Scout 9"', unique: false },
      ],
      weapons: [{
        id: 'w', name: 'Blade', count: 1, range: 0, attacks: 2, rules: [],
        traits: [{ id: 'a', name: 'Quickened Blade (+1 A, Lance)', unique: false }, { id: 'b', name: 'Shock', unique: false }],
      }],
      relics: [
        { id: 'r1', name: 'Common Weapon (Artificer)', tier: 'Common' },
        { id: 'r2', name: 'Warp-infusion', tier: 'Common' },
        { id: 'r3', name: "Shadow's Touch", tier: 'Common', profile: 'Melee, A3, AP(1), Warp' },
      ],
      scars: [{ id: 's', name: 'Weakened Muscles', desc: '-1 Quality in melee.' }],
    }),
  ];
  return f;
}

describe('migrateForce', () => {
  it('renames old homebrew names to the official rules in one pass', () => {
    const u = migrateForce(oldForce()).units[0];
    expect(u.upgrades.map((x) => x.name)).toEqual(['Fortified', 'Protected', 'Takedown Strike', 'Flying + Fast', 'Scout']);
    expect(u.weapons[0].traits.map((x) => x.name)).toEqual(['Quickened Blade (+1 A, Thrust)', 'Surge']);
    expect(u.relics.map((r) => r.name)).toEqual(['Common Weapon (Surge)', 'Warp-infusion', "Shadow's Touch"]);
    expect(u.relics[2].profile).toBe('Melee, A3, AP(1), Quake');
    expect(u.scars[0].desc).toBe('Gets -1 to hit rolls in melee.');
  });

  it('refreshes relic profiles from version 2 without renaming again', () => {
    const f = newForce('Balanced');
    f.rulesVersion = 2;
    f.units = [newUnit({ id: 'u', relics: [
      { id: 'r1', name: 'Fang of the River Goul', tier: 'Common', profile: 'Melee, A6, AP(2), Demolish' },
      { id: 'r2', name: 'Protected Relic', tier: 'Common', profile: 'Custom' },
    ] })];
    const u = migrateForce(f).units[0];
    expect(u.relics.map((r) => r.profile)).toEqual(['Melee, A4, AP(1), Demolish', 'Custom']);
    expect(u.relics[1].name).toBe('Protected Relic');
  });

  it('runs only once, so new names are not renamed again', () => {
    const once = migrateForce(oldForce());
    expect(once.rulesVersion).toBe(RULES_VERSION);
    expect(migrateForce(once)).toBe(once);
    expect(newForce().rulesVersion).toBe(RULES_VERSION);
  });

  it('triples Umbra Shards from before version 4, once', () => {
    const f = newForce('Balanced');
    f.rulesVersion = 3;
    f.umbraShards = 2;
    const once = migrateForce(f);
    expect(once.umbraShards).toBe(6);
    expect(migrateForce(once).umbraShards).toBe(6);
  });
});
