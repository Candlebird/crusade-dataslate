import { describe, expect, it } from 'vitest';
import type { Campaign } from '../model/types';
import { explore, rememberedBy, sightMap, sightOf, visibleTo } from './fog';
import { FOG, WARLORDS } from './nexusData';

// Fog of war (Nexus Wars): what each faction can see of the map, and what it remembers.

// A line of hexes along r = 0, so the distance between two sectors is just the gap in q.
// Alpha holds its home (q0) and a planet (q1); Bravo's home is at q9. One sector of Alpha's is off the map.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 's2', name: 'Two', type: 'empty', notes: '', q: 2, r: 0 },
      { id: 's3', name: 'Three', type: 'planet', notes: '', q: 3, r: 0 },
      { id: 's4', name: 'Four', type: 'research', notes: '', q: 4, r: 0 },
      { id: 's5', name: 'Five', type: 'anomaly', notes: '', q: 5, r: 0 },
      { id: 's6', name: 'Six', type: 'empty', notes: '', q: 6, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 0 },
      { id: 'offA', name: 'Off the map', type: 'planet', owner: 'A', notes: '' },
      { id: 'off', name: 'Lost', type: 'void', notes: '' },
    ],
    log: [],
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const sorted = (s: Set<string>) => [...s].sort();

describe('sight range', () => {
  it('is further from a home, and grows with a Watchtower and a Listening Post', () => {
    const c = campaign();
    expect(sightOf(sector(c, 'hA'))).toBe(FOG.homeSight);
    expect(sightOf(sector(c, 'pA'))).toBe(FOG.sight);
    sector(c, 'pA').buildings = ['watchtower'];
    expect(sightOf(sector(c, 'pA'))).toBe(FOG.sight + FOG.watchtower);
    sector(c, 'pA').buildings = ['watchtower', 'listeningPost'];
    expect(sightOf(sector(c, 'pA'))).toBe(FOG.sight + FOG.watchtower + FOG.listeningPost);
  });
});

describe('visibleTo', () => {
  it('sees every sector it holds (placed or not) and the placed sectors within sight', () => {
    const c = campaign();
    // Home sees 2, the planet 1: q0..q2. Its off-map sector is held, so seen; the other off-map sector is not.
    expect(sorted(visibleTo(c, 'A'))).toEqual(['hA', 'offA', 'pA', 's2']);
    expect(sorted(visibleTo(c, 'B'))).toEqual(['hB']);
  });

  it('does not see the other side of the map, nor sectors nobody has placed', () => {
    const seen = visibleTo(campaign(), 'A');
    for (const id of ['s3', 's4', 's5', 's6', 'hB', 'off']) expect(seen.has(id)).toBe(false);
  });

  it('sees further from a sector with a Listening Post', () => {
    const c = campaign();
    sector(c, 'pA').buildings = ['listeningPost'];
    expect(sorted(visibleTo(c, 'A'))).toEqual(['hA', 'offA', 'pA', 's2', 's3', 's4']);
  });

  it('sees around its own detachments, but not around a detachment that moved for another faction', () => {
    const c = campaign();
    c.positions = { f1: { sectorId: 's5', factionId: 'A' } };
    const seen = visibleTo(c, 'A');
    expect(['s4', 's5', 's6'].every((id) => seen.has(id))).toBe(true);
    expect(seen.has('s3')).toBe(false);
    c.positions = { f1: { sectorId: 's5', factionId: 'B' } };
    expect(visibleTo(c, 'A').has('s5')).toBe(false);
    expect(visibleTo(c, 'B').has('s5')).toBe(true);
  });

  it('a detachment off the map, or in a sector that is gone, sees nothing', () => {
    const c = campaign();
    c.positions = { f1: { sectorId: 'off', factionId: 'A' }, f2: { sectorId: 'deleted', factionId: 'A' } };
    expect(sorted(visibleTo(c, 'A'))).toEqual(sorted(visibleTo(campaign(), 'A')));
  });

  it('a Shadow Warlord sees further: Pathfinders around detachments, Spymaster around held sectors', () => {
    const c = campaign();
    c.positions = { f1: { sectorId: 's5', factionId: 'A' } };
    c.factions[0].path = 'shadow';
    c.factions[0].warlord = { forceId: 'f1', unitId: 'w', name: 'Vex', level: WARLORDS.levels[0], since: 1 };
    // Pathfinders: the detachment at q5 sees 2 now, out to q3 and q7 (nothing at q7).
    expect(visibleTo(c, 'A').has('s3')).toBe(true);
    // Spymaster (level 5): the home sees 3, so q3 even without the detachment.
    c.positions = {};
    expect(visibleTo(c, 'A').has('s3')).toBe(false);
    c.factions[0].warlord.level = WARLORDS.levels[2];
    expect(sorted(visibleTo(c, 'A'))).toEqual(['hA', 'offA', 'pA', 's2', 's3']);
  });
});

describe('rememberedBy and explore', () => {
  it('remembers sectors seen before but out of sight now, and nothing it can still see', () => {
    const c = campaign();
    expect(rememberedBy(c, 'A').size).toBe(0);
    explore(c);
    expect(sorted(new Set(c.explored!.A))).toEqual(['hA', 'offA', 'pA', 's2']);
    expect(c.explored!.B).toEqual(['hB']);
    // Alpha loses its planet: the sector it sat on stays remembered, but q2 is still within the home's sight.
    sector(c, 'pA').owner = 'B';
    sector(c, 'pA').q = 8;
    expect(sorted(rememberedBy(c, 'A'))).toEqual(['pA']);
  });

  it('forgets sectors that no longer exist', () => {
    const c = campaign();
    c.explored = { A: ['s6', 'gone'] };
    expect(sorted(rememberedBy(c, 'A'))).toEqual(['s6']);
    explore(c);
    expect(c.explored!.A).not.toContain('gone');
    expect(c.explored!.A).toContain('s6');
  });

  it('keeps what it explored even when it can no longer see it', () => {
    const c = campaign();
    c.positions = { f1: { sectorId: 's5', factionId: 'A' } };
    explore(c);
    c.positions = {};
    explore(c);
    expect(c.explored!.A).toEqual(expect.arrayContaining(['s4', 's5', 's6']));
  });
});

describe('sightMap', () => {
  it('sorts sectors into visible, remembered and hidden for a faction', () => {
    const c = campaign();
    c.explored = { A: ['s5'] };
    const sight = sightMap(c, 'A');
    expect(['hA', 's2', 's5', 's6', 'hB', 'off'].map((id) => sight(sector(c, id)))).toEqual(['visible', 'visible', 'remembered', 'hidden', 'hidden', 'hidden']);
  });

  it('shows the GM (no faction) everything', () => {
    const c = campaign();
    const sight = sightMap(c, undefined);
    expect(c.sectors.every((s) => sight(s) === 'visible')).toBe(true);
    expect(sightMap(c, '')(sector(c, 'off'))).toBe('visible');
  });
});
