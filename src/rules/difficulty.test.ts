import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign, Sector } from '../model/types';
import { difficultyRange, factionSupply, rateGuardians, rateSectors, ratingFor, sectorThreat, setPiece } from './difficulty';
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
  it("rates on bands of the field cap, not on anyone's Supply: near 0.4×, far 1.5×, set pieces 2×", () => {
    const c = campaign();
    // Round 1: the cap is 1600.
    expect(difficultyRange(c)).toEqual({ min: 500, base: 600, far: 2400, max: 3200 });
    const forces = [force('A', 1000), force('A', 500), force('B', 1200)];
    expect(factionSupply(forces, 'A')).toBe(1500);
    expect(difficultyRange(c, forces)).toEqual(difficultyRange(c));
    c.round = 6;
    expect(difficultyRange(c)).toEqual({ min: 600, base: 800, far: 3200, max: 4200 });
    c.round = 40;
    expect(difficultyRange(c).max).toBe(8000);
    c.fieldCap = { base: 1000, perRound: 0, max: 1000 };
    expect(difficultyRange(c)).toEqual({ min: 300, base: 400, far: 1500, max: 2000 });
  });

  it('scales the whole range with the campaign difficulty', () => {
    const c = campaign();
    c.difficulty = 'easy';
    expect(difficultyRange(c)).toEqual({ min: 400, base: 500, far: 1800, max: 2400 });
    c.difficulty = 'brutal';
    expect(difficultyRange(c)).toEqual({ min: 700, base: 1000, far: 3600, max: 4800 });
    c.difficulty = 'nonsense';
    expect(difficultyRange(c).base).toBe(600);
    c.difficulty = 'hard';
    const g = generate(c, 'a1');
    rateSectors(g, [], rng('h'));
    const rated = g.sectors.filter((s) => s.type !== 'home').map((s) => s.difficulty!);
    expect(rated.every((d) => d % 100 === 0 && d >= 600 && d <= 4000)).toBe(true);
    expect(g.sectors.find((s) => s.type === 'voidspawn')!.difficulty).toBe(4000);
  });

  it('rolls ratings up or down in 100-Supply steps, so the map has a spread of fights from round one', () => {
    for (const seed of ['a1', 'b2', 'c3']) {
      const c = generate(campaign(), seed);
      rateSectors(c, [], rng(seed));
      const rated = c.sectors.filter((s) => s.type !== 'home' && !setPiece(s)).map((s) => s.difficulty!);
      expect(rated.every((d) => d % 100 === 0 && d >= 500 && d <= 2600)).toBe(true);
      expect(new Set(rated).size, `seed ${seed}: ${[...new Set(rated)].sort()}`).toBeGreaterThanOrEqual(8);
    }
  });

  it('rates sectors further from the homes higher, set pieces highest, and skips homes', () => {
    const c = generate(campaign(), 'a1');
    const forces = [force('A', 1000), force('B', 1000)];
    rateSectors(c, forces, rng('x'));
    const rated = c.sectors.filter((s) => s.type !== 'home');
    expect(rated.every((s) => s.difficulty! >= 500 && s.difficulty! <= 3200 && s.difficulty! % NEXUS_DIFFICULTY.step === 0)).toBe(true);
    expect(c.sectors.filter((s) => s.type === 'home').every((s) => s.difficulty === undefined && !s.modifiers)).toBe(true);
    expect(c.sectors.find((s) => s.type === 'voidspawn')!.difficulty).toBe(3200);
    const archive = c.sectors.find((s) => s.type === 'archive');
    if (archive) expect(archive.difficulty).toBe(3200);
    const homes = c.sectors.filter((s) => s.type === 'home') as (Sector & Hex)[];
    const plain = rated.filter((s) => !setPiece(s));
    const away = (s: Sector) => Math.min(...homes.map((h) => hexDistance(h, s as Hex)));
    const near = plain.filter((s) => away(s) <= 2);
    const far = plain.filter((s) => away(s) >= 5);
    const avg = (xs: Sector[]) => xs.reduce((n, s) => n + s.difficulty!, 0) / xs.length;
    expect(avg(near)).toBeLessThan(1100);
    expect(avg(far)).toBeGreaterThan(avg(near) + 500);
  });

  it('gives every faction the same garrison, less any raid cut', () => {
    const c = generate(campaign(), 'a1');
    rateSectors(c, [force('A', 4000), force('B', 1000)], rng('x'));
    const s = c.sectors.find((x) => x.type === 'planet' && !x.owner)!;
    expect(ratingFor(s, 'A')).toBe(ratingFor(s, 'B'));
    expect(s.ratings).toBeUndefined();
    s.difficulty = 1000;
    s.cut = 0.2;
    expect(ratingFor(s)).toBe(800);
    s.cut = 1.5;
    expect(ratingFor(s)).toBe(0);
  });

  it('rates a sector a guardian holds as a set piece', () => {
    const c = generate(campaign(), 'b2');
    rateSectors(c, [], rng('g'));
    const s = c.sectors.find((x) => x.type === 'planet' && !x.owner)!;
    expect(s.difficulty).toBeLessThan(3200);
    s.guardian = { name: 'G', tier: 'Common', unit: {} as never };
    rateGuardians(c);
    expect(s.difficulty).toBe(3200);
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

  it('rescales at the end of the round as the cap grows, rerolling only AI-held modifiers', () => {
    const c = generate(campaign(), 'c3');
    const forces = [force('A', 1000), force('B', 1000)];
    rateSectors(c, forces, rng('z'));
    const mine = c.sectors.find((s) => s.owner === 'A' && s.type !== 'home')!;
    const theirs = c.sectors.filter((s) => !s.owner || s.owner === ECHOES.id);
    const before = { mine: mine.modifiers, theirs: theirs.map((s) => s.modifiers!.join()) };
    const vs = c.sectors.find((s) => s.type === 'voidspawn')!;
    expect(vs.difficulty).toBe(3200);

    // A faction's growth doesn't move the ratings; the round's cap does.
    forces[0].startingSupply = 9000;
    const r = endRound(c, rng('round'), '2026-01-01', forces);
    expect(r.difficulty).toEqual({ min: 500, max: 3400 });
    expect(vs.difficulty).toBe(3400);
    expect(mine.modifiers).toBe(before.mine);
    expect(theirs.map((s) => s.modifiers!.join())).not.toEqual(before.theirs);

    // Without the forces (older callers), ratings are left alone.
    expect(endRound(c, rng('again')).difficulty).toBeUndefined();
    expect(vs.difficulty).toBe(3400);
  });

  it('grows raided garrisons back when a round ends with no attack on them', () => {
    const c = generate(campaign(), 'c3');
    const [a, b] = c.sectors.filter((s) => s.type === 'planet' && !s.owner);
    a.cut = 0.3;
    b.cut = 0.05;
    const hit = c.sectors.find((s) => s.type === 'research' && !s.owner)!;
    hit.cut = 0.2;
    c.log.push({ id: 'e', date: '', sectorId: hit.id, attacker: 'A', defender: '', winner: 'A', notes: '', round: 1 });
    endRound(c, rng('r'));
    expect(a.cut).toBe(0.2);
    expect(b.cut).toBeUndefined();
    expect(hit.cut).toBe(0.2);
  });
});

describe('the default map and the round refresh', () => {
  const POI = ['planet', 'research', 'void', 'anomaly'];

  it('is 12×12 for two factions, about 60% full, with about 40% of the sectors points of interest', () => {
    expect(defaultMap(2)).toMatchObject({ cols: 12, rows: 12 });
    expect(defaultMap(3)).toMatchObject({ cols: 14, rows: 14 });
    const counts = defaultCounts(2);
    // The Lost Archive takes over clear space, so it doesn't add a sector.
    const all = 2 + Object.values(counts).reduce((a, b) => a + b, 0) - counts.archive;
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
      // A seed whose Lost Archive leaves clear space in the middle (otherwise its new point of interest grows the board).
      const c = generate(campaign(factions), 'c6');
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
