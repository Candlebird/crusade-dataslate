import { describe, expect, it } from 'vitest';
import { REQUISITIONS } from './data';
import { relicHolders } from './engine';
import { requisitionProblem } from './requisition';
import type { Force, Unit } from '../model/types';

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'u', name: 'Test', unitType: 'Test', category: 'Infantry', categoryOverridden: false,
  points: 100, size: 5, quality: 4, defense: 4, tough: 1, rules: [], weapons: [], xp: 40,
  upgrades: [], scars: [], relics: [], bpAdjust: 0, status: 'active', battles: 0, kills: 0, notes: '',
  ...over,
});
const req = (name: string) => REQUISITIONS.find((r) => r.name === name)!;
const heldBy = (u: Unit) => relicHolders([{ id: 'f', name: 'F', units: [u] } as unknown as Force]);

describe('requisitionProblem', () => {
  it('allows a valid scar removal, but not again once the scar is gone', () => {
    const u = unit({ scars: [{ id: 's1', name: 'Shaken' }] });
    expect(requisitionProblem(req('Remove a Scar'), 10, u, 's1', heldBy(u))).toBeNull();
    const after = unit({ scars: [] });
    expect(requisitionProblem(req('Remove a Scar'), 10, after, 's1', heldBy(after))).not.toBeNull();
  });

  it('refuses a relic that is already held, including by the buyer after a purchase', () => {
    const name = 'Rare Relic';
    const u = unit();
    expect(requisitionProblem(req(name), 10, u, 'Some Relic', heldBy(u))).toBeNull();
    const after = unit({ relics: [{ id: 'r', name: 'Some Relic', tier: 'Rare' }] });
    expect(requisitionProblem(req(name), 10, after, 'Some Relic', heldBy(after))).toMatch(/Held by/);
  });

  it('refuses Heroic Rise for a unit that has already risen', () => {
    const u = unit();
    expect(requisitionProblem(req('Heroic Rise'), 10, u, '', heldBy(u))).toBeNull();
    const after = unit({ heroicRise: true });
    expect(requisitionProblem(req('Heroic Rise'), 10, after, '', heldBy(after))).not.toBeNull();
  });
});
