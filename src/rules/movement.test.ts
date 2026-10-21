import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign, CampaignEvent } from '../model/types';
import { visibleTo } from './fog';
import { moveOf, moveTargets, positionOf, reach, regroup, setPosition } from './movement';
import { emptyNexus, recordSectorGame, removeSectorGame } from './nexus';
import { NEXUS_MOVE } from './nexusData';
import { applyMoves, revealOrders } from './orders';

// A row of hexes: A's home, two empty hexes, an unclaimed planet, then B's planet and home.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'e1', name: 'Empty 1', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'e2', name: 'Empty 2', type: 'empty', notes: '', q: 2, r: 0 },
      { id: 'p', name: 'Planet', type: 'planet', notes: '', q: 3, r: 0 },
      { id: 'pB', name: 'B Planet', type: 'planet', owner: 'B', notes: '', q: 4, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 5, r: 0 },
    ],
    log: [],
  };
}

const force = (factionId: string, name = 'F') => {
  const f = newForce(name);
  f.owner = 'me@x';
  f.nexus = emptyNexus(factionId);
  return f;
};
const kinds = (c: Campaign, f: ReturnType<typeof force>) => Object.fromEntries([...reach(c, f)].map(([id, r]) => [id, r.kind]));

describe('detachments on the map', () => {
  it('start at home and move through open space, attacking what is held or claimable', () => {
    const c = campaign();
    const f = force('A');
    expect(positionOf(c, f)?.id).toBe('hA');
    expect(moveOf(c, f).move).toBe(NEXUS_MOVE.base);
    expect(kinds(c, f)).toEqual({ e1: 'move', e2: 'move' });
    setPosition(c, f.id, { sectorId: 'e2', factionId: 'A' });
    // An attack ends the move: it can't pass through the planet to B's.
    expect(kinds(c, f)).toEqual({ e1: 'move', hA: 'move', p: 'attack' });
    expect(moveTargets(c, f).attacks.map((s) => s.id)).toEqual(['p']);
  });

  it('moves further with a Beacon, a Forced March or Warp Currents, and less in an Ion Storm', () => {
    const c = campaign();
    const f = force('A');
    c.sectors[0].buildings = ['beacon'];
    c.assetsSpent = [{ id: 'a', round: 1, factionId: 'A', asset: 'forcedMarch', forceId: f.id, date: '' }];
    c.event = { id: 'warpCurrents', round: 1 };
    expect(moveOf(c, f).move).toBe(NEXUS_MOVE.base + NEXUS_MOVE.beacon + NEXUS_MOVE.forcedMarch + 1);
    expect(reach(c, f).get('p')).toEqual({ kind: 'attack', steps: 3 });
    c.sectors[0].buildings = [];
    c.assetsSpent = [];
    c.event = { id: 'ionStorm', round: 1 };
    expect(moveOf(c, f).move).toBe(NEXUS_MOVE.base - 1);
    expect(kinds(c, f)).toEqual({ e1: 'move' });
  });

  it('sees around itself', () => {
    const c = campaign();
    const f = force('A');
    expect(visibleTo(c, 'A').has('pB')).toBe(false);
    setPosition(c, f.id, { sectorId: 'p', factionId: 'A' });
    expect(visibleTo(c, 'A').has('pB')).toBe(true);
  });

  it('turns revealed orders into moves and attacks, flagging those out of reach', () => {
    const c = campaign();
    const a = force('A', 'One');
    const b = force('A', 'Two');
    const r = revealOrders(c, [{ email: 'me@x', round: 1, picks: { [a.id]: 'e2', [b.id]: 'p' } }], 1, [a, b]);
    expect(r.moves.map((m) => [m.sectorId, m.flags])).toEqual([['e2', []]]);
    expect(r.attacks.map((x) => [x.sectorId, x.flags])).toEqual([['p', ['Out of reach']]]);
    expect(applyMoves(c, r.moves, [a, b])).toBe(1);
    expect(positionOf(c, a)?.id).toBe('e2');
  });

  it('moves into a sector it wins, falls back from one it loses, and goes back when the game is deleted', () => {
    const c = campaign();
    const a = force('A');
    const b = force('B');
    setPosition(c, a.id, { sectorId: 'e2', factionId: 'A' });
    setPosition(c, b.id, { sectorId: 'pB', factionId: 'B' });
    const e: CampaignEvent = { id: 'g', date: '', round: 1, sectorId: 'pB', attacker: 'A', defender: 'B', winner: 'A', notes: '', forceId: a.id };
    recordSectorGame(c, e);
    expect([positionOf(c, a)?.id, positionOf(c, b)?.id]).toEqual(['pB', 'hB']);
    removeSectorGame(c, 'g');
    expect([positionOf(c, a)?.id, positionOf(c, b)?.id]).toEqual(['e2', 'pB']);
    // A lost attack leaves it where it started.
    recordSectorGame(c, { ...e, id: 'l', winner: 'B' });
    expect(positionOf(c, a)?.id).toBe('e2');
  });

  it('falls back home when its sector is gone', () => {
    const c = campaign();
    const a = force('A');
    setPosition(c, a.id, { sectorId: 'e1', factionId: 'A' });
    c.sectors = c.sectors.filter((s) => s.id !== 'e1');
    regroup(c);
    expect(c.positions?.[a.id]).toEqual({ sectorId: 'hA', factionId: 'A' });
  });
});
