import { describe, expect, it } from 'vitest';
import type { Campaign, Force, RpEntry } from '../model/types';
import { expansionCost, runaways, supplyBuysThisRound, supplyGain, supplyRpCost } from './runaway';

// A faction far ahead on sectors pays more for Supply and Forced Expansion.

const campaign = (aSectors: number): Campaign => ({
  id: 'c', name: 'C', updatedAt: '', round: 4, threat: 1, log: [],
  factions: [{ id: 'A', name: 'Alpha', color: '' }, { id: 'B', name: 'Bravo', color: '' }],
  sectors: [
    { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '' },
    { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '' },
    ...Array.from({ length: aSectors }, (_, i) => ({ id: `a${i}`, name: `A${i}`, type: 'empty' as const, owner: 'A', notes: '' })),
  ],
}) as unknown as Campaign;

describe('runaway leaders', () => {
  it('only counts a faction far ahead, homes aside', () => {
    expect(runaways(campaign(2))).toEqual([]);
    expect(runaways(campaign(3))).toEqual(['A']);
    expect(runaways(undefined)).toEqual([]);
  });

  it('charges a faction far ahead more for Supply and Forced Expansion', () => {
    const c = campaign(3);
    expect(supplyRpCost(c, 'A', 1)).toBe(2);
    expect(supplyRpCost(c, 'B', 1)).toBe(1);
    expect(expansionCost(c, 'A', 'planet')).toBe(27);
    expect(expansionCost(c, 'B', 'planet')).toBe(18);
    expect(expansionCost(c, 'A', 'home')).toBeUndefined();
  });
});

describe('Increase Supply diminishing returns', () => {
  it('gives 200, 175, 150, 125, then 100 at least', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map((n) => supplyGain(200, n))).toEqual([200, 175, 150, 125, 100, 100, 100]);
    expect(supplyGain(50, 3)).toBe(50);
  });

  it('counts the faction’s buys this round only, across its detachments', () => {
    const buy = (round?: number): RpEntry => ({ id: '', date: '', label: 'Increase Supply', rp: -1, supply: 200, round });
    const f = (id: string, faction: string, ledger: RpEntry[]) => ({ id, nexus: { factionId: faction }, ledger }) as unknown as Force;
    const a1 = f('a1', 'A', [buy(3), buy(4), { id: '', date: '', label: 'Feat — X', rp: 1, supply: 100, round: 4 }]);
    const a2 = f('a2', 'A', [buy(4), buy()]);
    const b = f('b', 'B', [buy(4)]);
    const c = campaign(0);
    expect(supplyBuysThisRound(c, [a1, a2, b], a1)).toBe(2);
    expect(supplyBuysThisRound(undefined, [a1], a1)).toBe(0);
  });
});
