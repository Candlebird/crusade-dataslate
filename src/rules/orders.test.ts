import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign } from '../model/types';
import { emptyNexus } from './nexus';
import { HOLD, applyMoves, attackTargets, foughtFor, myDetachments, playedDetachments, revealOrders } from './orders';
import { callMeeting, meetingState, meetings, settleMeeting } from './meetings';

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

const force = (owner: string | undefined, factionId: string, name = 'F') => {
  const f = newForce(name);
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

  it("finds each player's detachments from their linked forces", () => {
    const forces = [force('me@x', 'C', 'Z'), force('me@x', 'A', 'Second'), force('me@x', 'A', 'First'), force('you@x', 'B'), force('me@x', 'gone'), force(undefined, 'C', 'Local')];
    expect(myDetachments(campaign(), forces, 'me@x').map((f) => f.name)).toEqual(['First', 'Second', 'Local', 'Z']);
    expect(playedDetachments(campaign(), forces).map((f) => f.name)).toEqual(['Z', 'Second', 'First', 'F']);
  });

  it('takes one pick per detachment, and still reads picks keyed by faction', () => {
    const a1 = force('me@x', 'A', 'One');
    const a2 = force('me@x', 'A', 'Two');
    const r = revealOrders(campaign(), [
      { email: 'me@x', round: 1, picks: { [a1.id]: 'x', [a2.id]: 'p2' } },
      { email: 'you@x', round: 1, picks: { B: HOLD } },
    ], 1, [a1, a2]);
    expect(r.attacks.map((a) => [a.factionId, a.forceId, a.sectorId])).toEqual([['A', a1.id, 'x'], ['A', a2.id, 'p2']]);
    expect(r.holds).toEqual([{ email: 'you@x', factionId: 'B' }]);
  });

  it('has a detachment holding on its own sector dig in, and defend it if it is attacked', () => {
    const c = campaign();
    const a = force('me@x', 'A', 'Raiders');
    const b = force('you@x', 'B', 'Wall');
    const far = force('you@x', 'B', 'Elsewhere');
    c.positions = { [b.id]: { sectorId: 'p2', factionId: 'B' }, [far.id]: { sectorId: 'hB', factionId: 'B' } };
    const orders = (pick: string) => [{ email: 'me@x', round: 1, picks: { [a.id]: 'p2' } }, { email: 'you@x', round: 1, picks: { [b.id]: pick, [far.id]: HOLD } }];
    const r = revealOrders(c, orders(HOLD), 1, [a, b, far]);
    expect(r.attacks[0]).toMatchObject({ sectorId: 'p2', dugIn: b.id, flags: ['Dug in: Wall defends it and picks the deployment'] });
    expect(revealOrders(c, orders('hB'), 1, [a, b, far]).attacks[0].dugIn).toBeUndefined();
    c.positions[b.id] = { sectorId: 'x', factionId: 'B' };
    expect(revealOrders(c, orders(HOLD), 1, [a, b, far]).attacks[0].dugIn).toBeUndefined();
  });

  it('turns moves of two factions into the same hex, past each other or onto each other into meeting engagements', () => {
    const c = campaign();
    // Two stretches of empty space above the border: e1 next to both planets, e2 next to A's.
    c.sectors.push({ id: 'e1', name: 'Gap', type: 'empty', notes: '', q: 2, r: -1 }, { id: 'e2', name: 'Drift', type: 'empty', notes: '', q: 1, r: -1 });
    const a = force('me@x', 'A', 'Raiders');
    const a2 = force('me@x', 'A', 'Friends');
    const b = force('you@x', 'B', 'Wall');
    const forces = [a, a2, b];
    const at = (f: { id: string }) => c.positions?.[f.id]?.sectorId;
    const play = (aPick: string, bPick?: string) => revealOrders(c, [
      { email: 'me@x', round: 1, picks: { [a.id]: aPick } },
      ...(bPick ? [{ email: 'you@x', round: 1, picks: { [b.id]: bPick } }] : []),
    ], 1, forces);

    // Both into e1: they meet there. A's own detachments never meet each other.
    c.positions = { [a.id]: { sectorId: 'e2', factionId: 'A' }, [a2.id]: { sectorId: 'e2', factionId: 'A' }, [b.id]: { sectorId: 'p2', factionId: 'B' } };
    let r = play('e1', 'e1');
    let [m] = meetings(c, r, forces);
    expect(meetings(c, r, forces)).toHaveLength(1);
    expect(m).toMatchObject({ sectorId: 'e1', how: 'same' });
    expect(meetingState(c, m, 1)).toBe('open');
    callMeeting(c, 1, m.key, a.id, 'pass');
    callMeeting(c, 1, m.key, b.id, 'pass');
    expect(meetingState(c, m, 1)).toBe('passed');
    callMeeting(c, 1, m.key, b.id, 'fight');
    expect(meetingState(c, m, 1)).toBe('fight');
    settleMeeting(c, 1, m.key, b.id);
    expect(meetingState(c, m, 1)).toBe('settled');
    applyMoves(c, r.moves, forces, 1);
    expect([at(a), at(b)]).toEqual(['p1', 'e1']);

    // Swapping hexes: a draw leaves both where they were.
    c.positions = { [a.id]: { sectorId: 'e1', factionId: 'A' }, [b.id]: { sectorId: 'e2', factionId: 'B' } };
    r = play('e2', 'e1');
    [m] = meetings(c, r, forces);
    expect(m.how).toBe('swap');
    settleMeeting(c, 2, m.key, '');
    expect(meetingState(c, m, 1)).toBe('open'); // a new orders round starts over
    applyMoves(c, r.moves, forces, 2);
    expect([at(a), at(b)]).toEqual(['e1', 'e2']);

    // Moving onto a detachment that stays put: A wins, B falls back to its nearest sector.
    c.positions = { [a.id]: { sectorId: 'e2', factionId: 'A' }, [b.id]: { sectorId: 'e1', factionId: 'B' } };
    r = play('e1');
    [m] = meetings(c, r, forces);
    expect(m).toMatchObject({ sectorId: 'e1', how: 'onto' });
    settleMeeting(c, 3, m.key, a.id);
    applyMoves(c, r.moves, forces, 3);
    expect([at(a), at(b)]).toEqual(['e1', 'p2']);
  });

  it('flags two detachments of one faction on the same sector, not as a rival', () => {
    const a1 = force('me@x', 'A', 'One');
    const a2 = force('me@x', 'A', 'Two');
    const r = revealOrders(campaign(), [{ email: 'me@x', round: 1, picks: { [a1.id]: 'x', [a2.id]: 'x' } }], 1, [a1, a2]);
    expect(r.attacks[0].flags).toEqual(['Another detachment of Alpha attacks it too: pick one, or fight together']);
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

describe('fought attacks', () => {
  it('finds the game recorded for a revealed attack this round', () => {
    const c = campaign();
    const a = { factionId: 'A', sectorId: 'p2' };
    expect(foughtFor(c, a, 1)).toBeUndefined();
    c.log.push({ id: 'old', date: '', round: 0, sectorId: 'p2', attacker: 'A', defender: 'B', winner: 'B', notes: '' });
    c.log.push({ id: 'sp', date: '', round: 1, sectorId: 'p2', attacker: 'A', defender: 'B', winner: 'A', notes: '', spread: true });
    c.log.push({ id: 'other', date: '', round: 1, sectorId: 'p2', attacker: 'C', defender: 'B', winner: 'C', notes: '' });
    expect(foughtFor(c, a, 1)).toBeUndefined();
    c.log.push({ id: 'g', date: '', round: 1, sectorId: 'p2', attacker: 'A', defender: 'B', winner: 'A', notes: '' });
    expect(foughtFor(c, a, 1)?.id).toBe('g');
  });
});
