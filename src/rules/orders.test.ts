import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign } from '../model/types';
import { emptyNexus } from './nexus';
import { HOLD, attackTargets, myFactions, playedFactions, revealOrders } from './orders';

// A row of hexes: A's home and planet, then B's planet and home, with an unclaimed sector under the border.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00' },
      { id: 'B', name: 'Bravo', player: '', color: '#00f' },
      { id: 'C', name: 'Charlie', player: '', color: '#0f0' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', benefit: 'largeShardMine', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', benefit: 'shardMine', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'p2', name: 'Planet 2', type: 'planet', benefit: 'spacePort', owner: 'B', notes: '', q: 2, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', benefit: 'biomassPool', owner: 'B', notes: '', q: 3, r: 0 },
      { id: 'x', name: 'Expanse', type: 'void', notes: '', q: 1, r: 1 },
      { id: 'far', name: 'Far Reach', type: 'anomaly', notes: '', q: 6, r: 6 },
      { id: 'off', name: 'Off map', type: 'anomaly', notes: '' },
    ],
    log: [],
  };
}

const force = (owner: string | undefined, factionId: string) => {
  const f = newForce('F');
  f.owner = owner;
  f.nexus = emptyNexus(factionId);
  return f;
};

describe('sealed orders', () => {
  it('offers only sectors next to the faction', () => {
    expect(attackTargets(campaign(), 'A').map((s) => s.id)).toEqual(['x', 'p2']);
    expect(attackTargets(campaign(), 'B').map((s) => s.id)).toEqual(['x', 'p1']);
    expect(attackTargets(campaign(), 'C')).toEqual([]);
  });

  it("finds each player's factions from their linked forces", () => {
    const forces = [force('me@x', 'A'), force('me@x', 'A'), force('you@x', 'B'), force('me@x', 'gone'), force(undefined, 'C')];
    expect(myFactions(campaign(), forces, 'me@x')).toEqual(['A', 'C']);
    expect(Object.fromEntries(playedFactions(campaign(), forces))).toEqual({ 'me@x': ['A'], 'you@x': ['B'] });
  });

  it('lists attacks and holds from the current round only', () => {
    const r = revealOrders(campaign(), [
      { email: 'me@x', round: 2, picks: { A: 'x' } },
      { email: 'you@x', round: 2, picks: { B: HOLD } },
      { email: 'old@x', round: 1, picks: { C: 'far' } },
    ], 2);
    expect(r.attacks).toEqual([{ email: 'me@x', factionId: 'A', sectorId: 'x', defender: '', flags: [] }]);
    expect(r.holds).toEqual([{ email: 'you@x', factionId: 'B' }]);
  });

  it('flags shared targets, mutual attacks and targets no longer in reach', () => {
    const c = campaign();
    const a = revealOrders(c, [{ email: 'me@x', round: 1, picks: { A: 'x' } }, { email: 'you@x', round: 1, picks: { B: 'x' } }], 1).attacks;
    expect(a.map((x) => x.flags)).toEqual([['Also attacked by Bravo'], ['Also attacked by Alpha']]);

    const m = revealOrders(c, [{ email: 'me@x', round: 1, picks: { A: 'p2' } }, { email: 'you@x', round: 1, picks: { B: 'p1' } }], 1).attacks;
    expect(m.map((x) => [x.defender, x.flags])).toEqual([['B', ['Bravo is attacking them too']], ['A', ['Alpha is attacking them too']]]);

    c.sectors.find((s) => s.id === 'p2')!.owner = 'A';
    const s = revealOrders(c, [{ email: 'me@x', round: 1, picks: { A: 'p2' } }], 1).attacks;
    expect(s[0].flags).toEqual(['No longer next to their territory']);
  });
});
