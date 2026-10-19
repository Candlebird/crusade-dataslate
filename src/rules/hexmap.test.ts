import { describe, expect, it } from 'vitest';
import type { Campaign } from '../model/types';
import { cells, clampToMap, defaultCounts, frontier, generateMap, hexDistance, inBounds, isConnected, isPlaced, neighbors, rng } from './hexmap';

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }, { id: 'C', name: 'Charlie', player: '', color: '#0f0' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '' },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '' },
      { id: 'hC', name: 'C Home', type: 'home', owner: 'C', notes: '' },
      { id: 'p1', name: 'Kept', type: 'planet', notes: 'mine' },
    ],
    log: [],
  };
}

const opts = (seed: string, replace = false) => ({ cols: 10, rows: 8, seed, counts: defaultCounts(3), startingSectors: 2, replace });

describe('hex math', () => {
  it('measures distance and neighbours', () => {
    expect(neighbors({ q: 0, r: 0 }).every((n) => hexDistance(n, { q: 0, r: 0 }) === 1)).toBe(true);
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });

  it('lays out a rectangle of cells', () => {
    const m = { cols: 5, rows: 4, seed: '' };
    const all = cells(m);
    expect(all).toHaveLength(20);
    expect(all.every((h) => inBounds(m, h))).toBe(true);
    expect(inBounds(m, { q: 5, r: 0 })).toBe(false);
    expect(inBounds(m, { q: -2, r: 3 })).toBe(false); // col 1-2 = -1
    expect(inBounds(m, { q: -1, r: 3 })).toBe(true);
  });

  it('seeds deterministically', () => {
    const a = rng('abc'), b = rng('abc'), c = rng('abd');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
  });
});

describe('map generation', () => {
  it('places every sector, connected, with homes spread apart', () => {
    for (const seed of ['one', 'two', 'three', 'four']) {
      const c = campaign();
      generateMap(c, opts(seed));
      expect(c.sectors.every(isPlaced)).toBe(true);
      expect(c.sectors.every((s) => inBounds(c.map!, s as never))).toBe(true);
      const keys = new Set(c.sectors.map((s) => `${s.q},${s.r}`));
      expect(keys.size).toBe(c.sectors.length);
      expect(isConnected(c)).toBe(true);
      const homes = c.sectors.filter((s) => s.type === 'home') as never[];
      for (let i = 0; i < homes.length; i++) for (let j = i + 1; j < homes.length; j++) expect(hexDistance(homes[i], homes[j])).toBeGreaterThanOrEqual(3);
      const counts = defaultCounts(3);
      expect(c.sectors.filter((s) => s.type === 'planet')).toHaveLength(counts.planet);
      expect(c.sectors.filter((s) => s.owner === 'A' && s.type !== 'home')).toHaveLength(2);
    }
  });

  it('is reproducible from the seed and keeps existing sectors', () => {
    const a = campaign(), b = campaign();
    generateMap(a, opts('same'));
    generateMap(b, opts('same'));
    expect(a.sectors.map((s) => [s.type, s.q, s.r, s.owner])).toEqual(b.sectors.map((s) => [s.type, s.q, s.r, s.owner]));
    expect(a.sectors.find((s) => s.id === 'p1')?.notes).toBe('mine');
    expect(a.sectors.find((s) => s.id === 'hA')?.id).toBe('hA');
  });

  it('replace mode drops non-home sectors; fill mode keeps placed ones', () => {
    const c = campaign();
    generateMap(c, opts('x'));
    const p1 = c.sectors.find((s) => s.id === 'p1')!;
    const at = [p1.q, p1.r];
    generateMap(c, { ...opts('y'), startingSectors: 0 });
    expect([p1.q, p1.r]).toEqual(at);
    generateMap(c, opts('z', true));
    expect(c.sectors.find((s) => s.id === 'p1')).toBeUndefined();
    expect(c.sectors.filter((s) => s.type === 'home')).toHaveLength(3);
  });

  it('finds the frontier and unplaces sectors outside a smaller map', () => {
    const c = campaign();
    generateMap(c, opts('f'));
    const f = frontier(c, 'A');
    expect(f.size).toBeGreaterThan(0);
    for (const id of f) expect(c.sectors.find((s) => s.id === id)?.owner).not.toBe('A');
    c.map = { ...c.map!, cols: 2, rows: 2 };
    clampToMap(c);
    expect(c.sectors.filter(isPlaced).length).toBeLessThanOrEqual(4);
  });
});
