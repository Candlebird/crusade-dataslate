import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign, Sector } from '../model/types';
import { difficultyRange, factionSupply, rateSectors, sectorThreat } from './difficulty';
import { cells, colOf, defaultCounts, defaultMap, generateMap, hexDistance, isConnected, isPlaced, refreshSectors, rng, type Hex } from './hexmap';
import { ECHOES, emptyNexus } from './nexus';
import { NEXUS_DIFFICULTY, NEXUS_MAP, SECTOR_MODIFIERS } from './nexusData';
import { endRound, roundEndText, roundIncomeItems } from './rounds';

function campaign(factions = 2): Campaign {
  const ids = ['A', 'B', 'C', 'D'].slice(0, factions);
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: ids.map((id) => ({ id, name: id, player: '', color: '#f00' })),
    sectors: ids.map((id) => ({ id: `h${id}`, name: `${id} Home`, type: 'home', owner: id, notes: '' })),
    log: [],
  };
}

const generate = (c: Campaign, seed: string) => {
  const m = defaultMap(c.factions.length);
  generateMap(c, { cols: m.cols, rows: m.rows, seed, counts: defaultCounts(c.factions.length), startingSectors: 1, replace: true });
  return c;
};

const force = (factionId: string, supply: number) => {
  const f = newForce(factionId);
  f.nexus = emptyNexus(factionId);
  f.startingSupply = supply;
  return f;
};

describe('map generation for Nexus Wars', () => {
  it('puts homes two in from the edge, at opposite ends, with the Voidspawn between them', () => {
    for (const seed of ['a1', 'b2', 'c3', 'd4']) {
      const c = generate(campaign(), seed);
      const m = c.map!;
      const edge = (h: Hex) => Math.min(colOf(h), m.cols - 1 - colOf(h), h.r, m.rows - 1 - h.r);
      const homes = c.sectors.filter((s) => s.type === 'home') as (Sector & Hex)[];
      expect(homes.map(edge)).toEqual([2, 2]);
      expect(colOf(homes[0]) < m.cols / 2).not.toBe(colOf(homes[1]) < m.cols / 2);
      const spawn = c.sectors.find((s) => s.type === 'voidspawn') as Sector & Hex;
      expect(Math.abs(hexDistance(spawn, homes[0]) - hexDistance(spawn, homes[1]))).toBeLessThanOrEqual(1);
      expect(isConnected(c)).toBe(true);
      expect(cells(m).length).toBeGreaterThanOrEqual(96);
    }
  });

  it('gives each faction a similar spread of sectors to expand into', () => {
    for (const factions of [2, 3, 4]) {
      for (const seed of ['a1', 'b2', 'c3']) {
        const c = generate(campaign(factions), seed);
        const homes = c.sectors.filter((s) => s.type === 'home') as (Sector & Hex)[];
        // The sectors worth taking that sit nearer each home than any rival's (ties are contested ground), and each home's road to the Voidspawn.
        const own = homes.map((h) => c.sectors.filter((s) => !['empty', 'home', 'voidspawn'].includes(s.type) && homes.every((o) => o === h || hexDistance(h, s as Hex) < hexDistance(o, s as Hex))).length);
        expect(Math.max(...own) - Math.min(...own), `${factions} factions, seed ${seed}: ${own}`).toBeLessThanOrEqual(3);
        const spawn = c.sectors.find((s) => s.type === 'voidspawn') as Sector & Hex;
        const road = homes.map((h) => hexDistance(h, spawn));
        expect(Math.max(...road) - Math.min(...road), `${factions} factions, seed ${seed}: ${road}`).toBeLessThanOrEqual(1);
        expect(c.sectors.every(isPlaced)).toBe(true);
      }
    }
  });
});

describe('sector difficulty', () => {
  it('runs from the minimum to the biggest faction × 1.5, counting every detachment, with a spread from the start', () => {
    const c = campaign();
    expect(difficultyRange(c, [])).toEqual({ min: 500, base: 800, max: 1500 });
    const forces = [force('A', 1000), force('A', 500), force('B', 1200)];
    expect(factionSupply(forces, 'A')).toBe(1500);
    expect(difficultyRange(c, forces)).toEqual({ min: 500, base: 800, max: 2300 });
  });

  it('scales the whole range with the campaign difficulty', () => {
    const c = campaign();
    c.difficulty = 'easy';
    expect(difficultyRange(c, [])).toEqual({ min: 400, base: 600, max: 1100 });
    c.difficulty = 'brutal';
    expect(difficultyRange(c, [])).toEqual({ min: 800, base: 1200, max: 2300 });
    c.difficulty = 'nonsense';
    expect(difficultyRange(c, [])).toEqual({ min: 500, base: 800, max: 1500 });
    c.difficulty = 'hard';
    const g = generate(c, 'a1');
    rateSectors(g, [], rng('h'));
    const rated = g.sectors.filter((s) => s.type !== 'home').map((s) => s.difficulty!);
    expect(rated.every((d) => d % 100 === 0 && d >= 600 && d <= 1900)).toBe(true);
    expect(g.sectors.find((s) => s.type === 'voidspawn')!.difficulty).toBe(1900);
  });

  it('rolls ratings up or down in 100-Supply steps, so the map has a spread of fights from round one', () => {
    for (const seed of ['a1', 'b2', 'c3']) {
      const c = generate(campaign(), seed);
      rateSectors(c, [], rng(seed));
      const rated = c.sectors.filter((s) => s.type !== 'home' && s.type !== 'voidspawn').map((s) => s.difficulty!);
      expect(rated.every((d) => d % 100 === 0 && d >= 500 && d <= 1500)).toBe(true);
      expect(new Set(rated).size, `seed ${seed}: ${[...new Set(rated)].sort()}`).toBeGreaterThanOrEqual(5);
    }
  });

  it('rates sectors further from the homes higher, the Voidspawn highest, and skips homes', () => {
    const c = generate(campaign(), 'a1');
    const forces = [force('A', 1000), force('B', 1000)];
    rateSectors(c, forces, rng('x'));
    const rated = c.sectors.filter((s) => s.type !== 'home');
    expect(rated.every((s) => s.difficulty! >= 500 && s.difficulty! <= 1500 && s.difficulty! % NEXUS_DIFFICULTY.step === 0)).toBe(true);
    expect(c.sectors.filter((s) => s.type === 'home').every((s) => s.difficulty === undefined && !s.modifiers)).toBe(true);
    expect(c.sectors.find((s) => s.type === 'voidspawn')!.difficulty).toBe(1500);
    const planets = rated.filter((s) => s.type === 'planet');
    const home = c.sectors.find((s) => s.id === 'hA') as Sector & Hex;
    const close = planets.reduce((a, b) => (hexDistance(home, a as Hex) < hexDistance(home, b as Hex) ? a : b));
    expect(sectorThreat(c, close)).toBeLessThan(sectorThreat(c, c.sectors.find((s) => s.type === 'voidspawn')!));
    expect(Math.min(...rated.map((s) => s.difficulty!))).toBeLessThan(800);
  });

  it('rolls one modifier, two on hard sectors, all different', () => {
    const c = generate(campaign(), 'b2');
    rateSectors(c, [force('A', 1000)], rng('y'));
    for (const s of c.sectors.filter((x) => x.type !== 'home')) {
      const want = sectorThreat(c, s) >= NEXUS_DIFFICULTY.hardAt ? 2 : 1;
      expect(s.modifiers).toHaveLength(want);
      expect(new Set(s.modifiers).size).toBe(want);
      expect(s.modifiers!.every((id) => SECTOR_MODIFIERS.some((m) => m.id === id))).toBe(true);
    }
  });

  it('rescales at the end of the round, rerolling only AI-held modifiers', () => {
    const c = generate(campaign(), 'c3');
    const forces = [force('A', 1000), force('B', 1000)];
    rateSectors(c, forces, rng('z'));
    const mine = c.sectors.find((s) => s.owner === 'A' && s.type !== 'home')!;
    const theirs = c.sectors.filter((s) => !s.owner || s.owner === ECHOES.id);
    const before = { mine: mine.modifiers, theirs: theirs.map((s) => s.modifiers!.join()) };
    const vs = c.sectors.find((s) => s.type === 'voidspawn')!;
    expect(vs.difficulty).toBe(1500);

    forces[0].startingSupply = 2000;
    const r = endRound(c, rng('round'), '2026-01-01', forces);
    expect(r.difficulty).toEqual({ min: 500, max: 3000 });
    expect(vs.difficulty).toBe(3000);
    expect(mine.modifiers).toBe(before.mine);
    expect(theirs.map((s) => s.modifiers!.join())).not.toEqual(before.theirs);

    // Without the forces (older callers), ratings are left alone.
    expect(endRound(c, rng('again')).difficulty).toBeUndefined();
    expect(vs.difficulty).toBe(3000);
  });
});

describe('the default map and the round refresh', () => {
  const POI = ['planet', 'research', 'void', 'anomaly'];

  it('is 12×12 for two factions, about 60% full, with about 40% of the sectors points of interest', () => {
    expect(defaultMap(2)).toMatchObject({ cols: 12, rows: 12 });
    expect(defaultMap(3)).toMatchObject({ cols: 14, rows: 14 });
    const counts = defaultCounts(2);
    const all = 2 + Object.values(counts).reduce((a, b) => a + b, 0);
    expect(all).toBe(Math.round(144 * NEXUS_MAP.fill));
    expect(counts.planet + counts.research + counts.void + counts.anomaly).toBe(Math.round(all * NEXUS_MAP.poiShare));
    expect(counts.planet).toBeGreaterThan(counts.research);
    for (const seed of ['a1', 'b2']) {
      const c = generate(campaign(), seed);
      const filled = c.sectors.length / 144;
      expect(filled).toBeGreaterThan(0.55);
      expect(filled).toBeLessThan(0.66);
      const poi = c.sectors.filter((s) => POI.includes(s.type)).length / c.sectors.length;
      expect(poi).toBeGreaterThan(0.35);
      expect(poi).toBeLessThan(0.45);
    }
  });

  it('turns claimed space hulks into clear space their holder keeps', () => {
    const c = generate(campaign(), 'a1');
    const hulks = c.sectors.filter((s) => s.type === 'void');
    hulks[0].owner = 'A';
    hulks[0].rewardClaimed = true;
    hulks[0].modifiers = ['fog'];
    const name = hulks[0].name;
    const r = refreshSectors(c, rng('r'));
    expect(r.cleared.map((s) => s.name)).toEqual([name]);
    expect(hulks[0]).toMatchObject({ type: 'empty', owner: 'A' });
    expect(hulks[0].rewardClaimed).toBeUndefined();
    expect(hulks[0].modifiers).toBeUndefined();
    expect(hulks[1].type).toBe('void');
  });

  it("adds new points of interest in each faction's half and the middle, away from the homes", () => {
    for (const factions of [2, 3]) {
      const c = generate(campaign(factions), 'c3');
      const before = c.sectors.length;
      const r = refreshSectors(c, rng('fresh'));
      expect(r.fresh).toHaveLength(factions * NEXUS_MAP.refreshPerFaction + NEXUS_MAP.refreshContested);
      expect(new Set(r.fresh).size).toBe(r.fresh.length);
      const homes = c.sectors.filter((s) => s.type === 'home') as (Sector & Hex)[];
      for (const s of r.fresh) {
        expect(POI).toContain(s.type);
        expect(s.owner).toBeUndefined();
        expect(isPlaced(s)).toBe(true);
        expect(homes.every((h) => hexDistance(h, s as Hex) >= 2)).toBe(true);
      }
      // One per faction lands nearer that faction's home than any rival's.
      for (const h of homes) expect(r.fresh.some((s) => homes.every((o) => o === h || hexDistance(h, s as Hex) < hexDistance(o, s as Hex)))).toBe(true);
      // Clear space is used first, so the board doesn't grow.
      expect(c.sectors.length).toBe(before);
      expect(new Set(c.sectors.filter(isPlaced).map((s) => `${s.q},${s.r}`)).size).toBe(c.sectors.length);
    }
  });

  it('grows the board when there is no clear space left', () => {
    const c = generate(campaign(), 'b2');
    c.sectors = c.sectors.filter((s) => s.type !== 'empty' || s.owner);
    const before = c.sectors.length;
    const r = refreshSectors(c, rng('grow'));
    expect(r.fresh.length).toBeGreaterThan(0);
    expect(c.sectors.length).toBe(before + r.fresh.length);
    expect(new Set(c.sectors.map((s) => `${s.q},${s.r}`)).size).toBe(c.sectors.length);
  });

  it("happens at the end of every round, and the round's income still counts the hulk", () => {
    const c = generate(campaign(), 'd4');
    const hulk = c.sectors.find((s) => s.type === 'void')!;
    hulk.owner = 'A';
    hulk.rewardClaimed = true;
    const forces = [force('A', 1000), force('B', 1000)];
    const r = endRound(c, rng('end'), '2026-01-01', forces);
    expect(r.cleared.map((s) => s.id)).toEqual([hulk.id]);
    expect(r.fresh).toHaveLength(3);
    expect(r.fresh.every((s) => s.difficulty! >= 500 && s.modifiers?.length)).toBe(true);
    expect(hulk.type).toBe('empty');
    const text = roundEndText(c, r);
    expect(text).toContain('drifted off');
    expect(text).toContain(r.fresh[0].name);
    const income = roundIncomeItems(c, 'A', c.rounds![0]);
    expect(income.some((i) => i.source.includes('Salvage'))).toBe(true);
  });
});
