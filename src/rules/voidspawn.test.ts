import { describe, expect, it } from 'vitest';
import type { Campaign } from '../model/types';
import { generateMap, defaultCounts } from './hexmap';
import { ECHOES, recordSectorGame, removeSectorGame } from './nexus';
import { pickSpread, spreadInto, spreadTargets } from './voidspawn';

// A row of hexes: the Voidspawn in the middle, with every kind of neighbour around it.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }],
    sectors: [
      { id: 'vs', name: 'Maw', type: 'voidspawn', owner: 'ai', notes: '', q: 1, r: 1 },
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 2, r: 1 },
      { id: 'p1', name: 'Planet 1', type: 'planet', owner: 'A', notes: '', q: 0, r: 1 },
      { id: 'e', name: 'Expanse', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'x', name: 'Hulk', type: 'void', notes: '', q: 1, r: 2 },
      { id: 'far', name: 'Far Rift', type: 'anomaly', notes: '', q: 5, r: 5 },
    ],
    log: [],
  };
}

describe('Void Echoes', () => {
  it('spread only into neighbouring sectors that are neither empty space nor a home', () => {
    expect(spreadTargets(campaign()).map((s) => s.id)).toEqual(['p1', 'x']);
    expect(pickSpread(campaign(), () => 0.99)?.id).toBe('x');
  });

  it('log the spread, and deleting the entry gives the sector back', () => {
    const c = campaign();
    const e = spreadInto(c, 'p1', '2026-10-19')!;
    expect(c.sectors.find((s) => s.id === 'p1')!.owner).toBe(ECHOES.id);
    expect(e).toMatchObject({ sectorId: 'p1', defender: 'A', winner: 'ai', spread: true, undo: { owner: 'A' } });
    // They now border the far side of the planet too.
    expect(spreadTargets(c).map((s) => s.id)).toEqual(['x']);
    expect(spreadInto(c, 'hA')).toBeNull();
    removeSectorGame(c, e.id);
    expect(c.sectors.find((s) => s.id === 'p1')!.owner).toBe('A');
  });

  it('never lose the Voidspawn', () => {
    const c = campaign();
    recordSectorGame(c, { id: 'g', date: '', sectorId: 'vs', attacker: 'A', defender: 'ai', winner: 'A', notes: '' });
    expect(c.sectors.find((s) => s.id === 'vs')!.owner).toBe(ECHOES.id);
  });

  it('get a Voidspawn on generated maps, kept apart like a home', () => {
    const c: Campaign = { ...campaign(), sectors: [{ id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '' }] };
    generateMap(c, { cols: 8, rows: 6, seed: 's', counts: defaultCounts(2), startingSectors: 1, replace: true });
    const spawns = c.sectors.filter((s) => s.type === 'voidspawn');
    expect(spawns).toHaveLength(1);
    expect(spawns[0].owner).toBe(ECHOES.id);
    expect(spawns[0].q).toBeDefined();
    generateMap(c, { cols: 8, rows: 6, seed: 't', counts: defaultCounts(2), startingSectors: 1, replace: true });
    expect(c.sectors.filter((s) => s.type === 'voidspawn').map((s) => s.id)).toEqual([spawns[0].id]);
  });
});
