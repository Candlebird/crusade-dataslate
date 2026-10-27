import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign } from '../model/types';
import { emptyNexus } from './nexus';
import { revealOrders } from './orders';
import { SIEGE, activeSieges, endSieges, openSieges, siegeOf } from './sieges';
import { roundAge } from './rounds';
import { attackTableOnly, tableOnly } from './zone/eligible';
import { newBattle } from './tracker';
import { STANDARD_MISSION } from './missions';

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00' },
      { id: 'B', name: 'Bravo', player: '', color: '#00f' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', benefit: 'largeShardMine', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', benefit: 'shardMine', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'p2', name: 'Planet 2', type: 'planet', benefit: 'spacePort', owner: 'B', notes: '', q: 2, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', benefit: 'biomassPool', owner: 'B', notes: '', q: 3, r: 0 },
    ],
    log: [],
  };
}
const force = (owner: string, factionId: string, name = 'F') => {
  const f = newForce(name);
  f.owner = owner;
  f.nexus = emptyNexus(factionId);
  return f;
};

describe('sieges', () => {
  it('opens one for an attack for the table, pins the detachment and lapses after its rounds', () => {
    const c = campaign();
    const a = force('me@x', 'A', 'Home raiders');
    const b = force('me@x', 'A', 'Planet raiders');
    const orders = [{ email: 'me@x', round: 1, picks: { [a.id]: 'hB', [b.id]: 'p2' } }];
    const { attacks } = revealOrders(c, orders, 1, [a, b]);
    // Only the home challenge is for the table: the planet can be fought as a zone battle.
    expect(openSieges(c, attacks, [a, b]).map((s) => s.sectorId)).toEqual(['hB']);
    expect(openSieges(c, attacks, [a, b])).toEqual([]);
    expect(siegeOf(c, a.id)).toMatchObject({ since: 2, until: 2 + SIEGE.rounds - 1 });

    // Next round it attacks again, whatever it was ordered to do.
    endSieges(c, [a, b]);
    c.round = 3;
    const next = revealOrders(c, [{ email: 'me@x', round: 2, picks: { [a.id]: 'p1' } }], 2, [a, b]);
    expect(next.attacks.map((x) => [x.forceId, x.sectorId])).toEqual([[a.id, 'hB']]);
    expect(next.attacks[0].flags.join(' ')).toMatch(/Pinned by the siege/);

    c.round = 2 + SIEGE.rounds - 1;
    expect(endSieges(c, [a, b]).map((s) => s.forceId)).toEqual([a.id]);
    expect(activeSieges(c)).toEqual([]);
  });

  it('ends once the battle is fought', () => {
    const c = campaign();
    const a = force('me@x', 'A');
    openSieges(c, revealOrders(c, [{ email: 'me@x', round: 1, picks: { [a.id]: 'hB' } }], 1, [a]).attacks, [a]);
    c.log.push({ id: 'e', date: '', sectorId: 'hB', attacker: 'A', defender: 'B', winner: 'B', notes: '', round: 2 });
    expect(endSieges(c, [a])).toEqual([]);
    expect(c.sieges).toBeUndefined();
  });
});

describe('what goes to the table', () => {
  it('sends homes and battles between players to the table, and AI-held sectors to zone battles', () => {
    const c = campaign();
    c.sectors.push({ id: 'n1', name: 'Neutral', type: 'planet', benefit: 'shardMine', notes: '', q: 1, r: 1 });
    const a = force('me@x', 'A');
    const d = force('you@x', 'B');
    const atk = (sectorId: string) => ({ email: 'me@x', factionId: 'A', forceId: a.id, sectorId, flags: [] }) as never;
    expect(attackTableOnly(c, atk('hB'), [a, d])).toMatch(/Home/);
    expect(attackTableOnly(c, atk('n1'), [a, d])).toBeUndefined();
    expect(attackTableOnly(c, atk('gone'), [a, d])).toMatch(/gone/);
  });
  it('reads the same from a tracked battle', () => {
    const b = newBattle(STANDARD_MISSION, 't', '2026-10-26', () => 0.5);
    b.sides[0].units = [{ id: 'u' } as never];
    b.sides[1].units = [{ id: 'v' } as never];
    b.sides[1].ai = true;
    expect(tableOnly(b)).toBeUndefined();
    b.sides[1].ai = false;
    expect(tableOnly(b)).toMatch(/between players/);
    b.crisis = 4;
    expect(tableOnly(b)).toMatch(/Echo Lord/);
  });
});

describe('round cadence', () => {
  it('counts the days since the last round ended', () => {
    const c = campaign();
    expect(roundAge(c, '2026-10-26')).toBeUndefined();
    c.rounds = [{ round: 1, date: '2026-10-21' } as never];
    expect(roundAge(c, '2026-10-26')).toBe(5);
    expect(roundAge(c, '2026-10-21')).toBe(0);
  });
});
