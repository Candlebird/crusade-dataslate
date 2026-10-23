import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import { DEFAULT_SETTINGS, type Campaign, type Force } from '../model/types';
import { emptyNexus } from './nexus';
import type { Attack } from './orders';
import { attackBattle, overrunBlock, overrunMax } from './overrun';
import { sectorGame } from './tracker';

// Overrun (Nexus Wars): a detachment settles an attack on a small AI garrison by auto-battle instead of at the table.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'p', name: 'Weak World', type: 'planet', notes: '', difficulty: 900, ratings: { A: 700, B: 900 } },
      { id: 'q', name: 'Strong World', type: 'planet', notes: '', difficulty: 800, ratings: { A: 800 } },
      { id: 'g', name: 'Guarded', type: 'planet', notes: '', difficulty: 500, guardian: { name: 'The Warden' } as never },
      { id: 'v', name: 'Voidspawn', type: 'voidspawn', notes: '', difficulty: 300 },
      { id: 'b', name: 'Bravo World', type: 'planet', owner: 'B', notes: '', difficulty: 300 },
    ],
    log: [],
  };
}

const force = (factionId: string, supply: number): Force => {
  const f = newForce(`${factionId} ${supply}`);
  f.nexus = emptyNexus(factionId);
  f.startingSupply = supply;
  return f;
};
const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const attack = (f: Force, sectorId: string, defender = ''): Attack => ({ email: '', factionId: f.nexus!.factionId, forceId: f.id, sectorId, defender, flags: [] });

describe('Overrun', () => {
  it('reaches 70% of the Supply Limit up to 2000 and 80% past it', () => {
    expect([1000, 2000, 4000, 1450, 500].map(overrunMax)).toEqual([700, 1400, 3000, 1000, 300]);
  });

  it("goes by the attacker's own rating, and leaves set pieces and players' sectors to the table", () => {
    const c = campaign();
    const a = force('A', 1000);
    expect(overrunBlock(sector(c, 'p'), a)).toBe('');
    expect(overrunBlock(sector(c, 'p'), force('B', 1000))).toMatch(/900 Supply/);
    expect(overrunBlock(sector(c, 'q'), a)).toMatch(/over the 700/);
    for (const id of ['g', 'v', 'b']) expect(overrunBlock(sector(c, id), force('A', 9000))).not.toBe('');
    expect(overrunBlock(sector(c, 'p'), undefined)).not.toBe('');
  });

  it('sets the attack up against a garrison at its rating, and logs like any battle', () => {
    const c = campaign();
    const a = force('A', 1000);
    const b = attackBattle(c, attack(a, 'p'), [a], [], DEFAULT_SETTINGS, () => 0.5);
    expect(b).toMatchObject({ sectorId: 'p', attacker: 'A' });
    expect(b.sides[0].forceId).toBe(a.id);
    const garrison = b.sides.find((x) => x.ai)!.units;
    expect(garrison.length).toBeGreaterThan(0);
    expect(garrison.reduce((n, u) => n + (u.points ?? 0), 0)).toBeLessThanOrEqual(700);
    b.auto = { winner: 'A', dealt: { A: 500, B: 100 } };
    b.ended = true;
    expect(sectorGame(b, c, [a])).toEqual({ event: expect.objectContaining({ sectorId: 'p', attacker: 'A', winner: 'A', forceId: a.id, notes: expect.stringMatching(/^Auto-battle/) }) });
  });

  it("falls back on the defender's dug-in detachment for a player-held sector", () => {
    const c = campaign();
    const a = force('A', 1000);
    const [b1, b2] = [force('B', 800), force('B', 600)];
    const b = attackBattle(c, { ...attack(a, 'b', 'B'), dugIn: b2.id }, [a, b1, b2], [], DEFAULT_SETTINGS);
    expect(b.sides.map((x) => [x.forceId, !!x.ai])).toEqual([[a.id, false], [b2.id, false]]);
  });
});
