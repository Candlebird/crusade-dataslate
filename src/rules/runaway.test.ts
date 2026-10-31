import { describe, expect, it } from 'vitest';
import type { Campaign } from '../model/types';
import { expansionCost, runaways, supplyRpCost } from './runaway';

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
