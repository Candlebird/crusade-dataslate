import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, CatalogBook, Force, Sector } from '../model/types';
import { ruleRating, hasRule } from './engine';
import { sectorThreat } from './difficulty';
import { empower, guardable, guardianTier, placeGuardians, rerollGuardians } from './guardians';
import { ECHOES } from './nexus';
import { GUARDIANS } from './nexusData';

// Guardian sites (Nexus Wars): AI-held points of interest get an empowered Void Echoes hero carrying a relic.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
book.name = ECHOES.name;

// Off the map, so every sector's threat comes from its type alone: the planet, station, anomaly and void are Rare,
// the archive Legendary.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '' },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '' },
      { id: 'p1', name: 'Wild Planet', type: 'planet', notes: '' },
      { id: 'r1', name: 'Echo Station', type: 'research', owner: ECHOES.id, notes: '' },
      { id: 'an', name: 'Rift', type: 'anomaly', notes: '' },
      { id: 'v', name: 'Hulk', type: 'void', notes: '' },
      { id: 'ar', name: 'Archive', type: 'archive', notes: '' },
      { id: 'e', name: 'Nothing', type: 'empty', notes: '' },
      { id: 'vs', name: 'Spawn', type: 'voidspawn', notes: '' },
    ],
    log: [],
  };
}

const ids = () => { let n = 0; return () => `id${n++}`; };
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const relicsOf = (ss: Sector[]) => ss.flatMap((s) => s.guardian?.unit.relics.map((r) => r.name) ?? []);
const GUARDED = ['an', 'ar', 'p1', 'r1', 'v'];

describe('guardable', () => {
  it('is an AI-held (unclaimed or Echoes) planet, station, anomaly, void or archive', () => {
    const c = campaign();
    expect(c.sectors.filter(guardable).map((s) => s.id).sort()).toEqual(GUARDED);
  });
});

describe('guardianTier', () => {
  it('climbs with threat', () => {
    expect(guardianTier(0)).toBe('Common');
    expect(guardianTier(GUARDIANS.rare - 0.01)).toBe('Common');
    expect(guardianTier(GUARDIANS.rare)).toBe('Rare');
    expect(guardianTier(GUARDIANS.legendary - 0.01)).toBe('Rare');
    expect(guardianTier(GUARDIANS.legendary)).toBe('Legendary');
  });
});

describe('empower', () => {
  it("doubles a unit's Tough, or gives Tough(2) to a unit without it", () => {
    const tough = newUnit({ rules: ['Hero', 'Tough(3)', 'Fearless'] });
    empower(tough);
    expect(tough.rules).toEqual(['Hero', `Tough(${3 * GUARDIANS.toughFactor})`, 'Fearless']);
    expect(tough.tough).toBe(3 * GUARDIANS.toughFactor);
    const plain = newUnit({ rules: ['Hero'] });
    empower(plain);
    expect(plain.rules).toEqual(['Hero', `Tough(${GUARDIANS.toughFactor})`]);
    expect(plain.tough).toBe(GUARDIANS.toughFactor);
  });
});

describe('placeGuardians', () => {
  it('guards every guardable sector, and only those', () => {
    const c = campaign();
    const placed = placeGuardians(c, [book], [], () => 0, ids());
    expect(placed.map((s) => s.id).sort()).toEqual(GUARDED);
    expect(c.sectors.filter((s) => s.guardian).map((s) => s.id).sort()).toEqual(GUARDED);
  });

  it('rolls an empowered Echoes Hero of the sector\'s tier, carrying a relic of that tier', () => {
    const c = campaign();
    placeGuardians(c, [book], [], () => 0, ids());
    for (const id of GUARDED) {
      const s = sector(c, id);
      const g = s.guardian!;
      expect(g.tier).toBe(guardianTier(sectorThreat(c, s)));
      expect(g.unit.name).toBe(g.name);
      expect(g.unit.xp).toBe(GUARDIANS.xp[g.tier]);
      expect(hasRule(g.unit.rules, 'Hero')).toBe(true);
      expect(ruleRating(g.unit.rules, 'Tough')).toBeGreaterThanOrEqual(GUARDIANS.toughFactor);
      expect(g.unit.relics.every((r) => r.tier === g.tier)).toBe(true);
    }
    expect(sector(c, 'ar').guardian!.tier).toBe('Legendary');
    expect(sector(c, 'p1').guardian!.tier).toBe('Rare');
  });

  it('never hands out a relic twice, nor one a force already holds', () => {
    const first = campaign();
    placeGuardians(first, [book], [], () => 0, ids());
    const relics = relicsOf(first.sectors);
    expect(relics.length).toBeGreaterThan(1);
    expect(new Set(relics).size).toBe(relics.length);
    // A force holding the relic the first guardian got: no guardian gets it now.
    const held = relics[0];
    const f: Force = newForce('Alpha Host');
    f.units = [{ ...newUnit({ name: 'Keeper' }), relics: [{ id: 'x', name: held, tier: 'Rare' }] }];
    const c = campaign();
    placeGuardians(c, [book], [f], () => 0, ids());
    expect(relicsOf(c.sectors)).not.toContain(held);
  });

  it('is repeatable with the same dice and ids', () => {
    const view = (c: Campaign) => c.sectors.map((s) => s.guardian && [s.id, s.guardian.name, s.guardian.tier, s.guardian.unit.unitType, s.guardian.unit.relics]);
    const a = campaign();
    const b = campaign();
    placeGuardians(a, [book], [], seq(0.1, 0.7, 0.4), ids());
    placeGuardians(b, [book], [], seq(0.1, 0.7, 0.4), ids());
    expect(view(a)).toEqual(view(b));
  });

  it('leaves sectors that already have a guardian alone', () => {
    const c = campaign();
    placeGuardians(c, [book], [], () => 0, ids());
    const kept = sector(c, 'an').guardian;
    expect(placeGuardians(c, [book], [], () => 0.5, ids())).toEqual([]);
    expect(sector(c, 'an').guardian).toBe(kept);
    delete sector(c, 'v').guardian;
    expect(placeGuardians(c, [book], [], () => 0.5, ids()).map((s) => s.id)).toEqual(['v']);
    expect(sector(c, 'an').guardian).toBe(kept);
  });

  it(`guards a sector only on a ${GUARDIANS.chance * 100}% roll, and never rolls a sector twice`, () => {
    const c = campaign();
    expect(placeGuardians(c, [book], [], () => GUARDIANS.chance, ids())).toEqual([]);
    expect(c.sectors.filter((s) => s.unguarded).map((s) => s.id).sort()).toEqual(GUARDED);
    expect(placeGuardians(c, [book], [], () => 0, ids())).toEqual([]);
    expect(c.sectors.some((s) => s.guardian)).toBe(false);
  });

  it('re-rolls every site, guarded or missed', () => {
    const c = campaign();
    placeGuardians(c, [book], [], () => GUARDIANS.chance, ids());
    expect(rerollGuardians(c, [book], [], () => 0, ids()).map((s) => s.id).sort()).toEqual(GUARDED);
    expect(rerollGuardians(c, [book], [], () => GUARDIANS.chance, ids())).toEqual([]);
    expect(c.sectors.some((s) => s.guardian)).toBe(false);
  });

  it('finds the book by name as well as by uid', () => {
    const c = campaign();
    expect(placeGuardians(c, [{ ...book, uid: 'other' }], [], () => 0, ids())).toHaveLength(GUARDED.length);
  });

  it('falls back to the built-in Void Echoes book when none is imported', () => {
    const other: CatalogBook = { ...book, uid: 'other', name: 'Someone Else' };
    expect(placeGuardians(campaign(), [], [], () => 0, ids())).toHaveLength(GUARDED.length);
    expect(placeGuardians(campaign(), [other], [], () => 0, ids())).toHaveLength(GUARDED.length);
  });

  it('does nothing with a Void Echoes book without heroes', () => {
    const c = campaign();
    const noHeroes: CatalogBook = { ...book, units: book.units.filter((u) => !hasRule(u.rules, 'Hero')) };
    expect(placeGuardians(c, [noHeroes], [], () => 0, ids())).toEqual([]);
    expect(c.sectors.some((s) => s.guardian)).toBe(false);
  });
});
