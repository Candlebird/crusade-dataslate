import { describe, expect, it } from 'vitest';
import type { Campaign } from './types';
import { newForce, newUnit } from './factory';
import { markUnitsUsed } from '../rules/nexus';
import { NO_FACTION, downtimeBlocks } from './downtime';

const campaign = () => ({ id: 'c', name: 'C', updatedAt: '', round: 2, threat: 0, factions: [], sectors: [], log: [] }) as unknown as Campaign;

describe('downtimeBlocks', () => {
  it('lets a force of three active units do everything', () => {
    const f = newForce('Spears');
    f.units = ['a', 'b', 'c'].map((id) => newUnit({ id }));
    expect(downtimeBlocks(f, undefined)).toEqual({ task: NO_FACTION });
    f.nexus = { factionId: 'A', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] };
    expect(downtimeBlocks(f, campaign())).toEqual({});
  });

  it('says why a Sortie needs three units and why an empty force can do nothing', () => {
    const f = newForce('Spears');
    f.units = [newUnit({ id: 'a' }), newUnit({ id: 'b', status: 'comatose' })];
    const b = downtimeBlocks(f, undefined);
    expect(b.sortie).toMatch(/party of 3.*has 1/);
    expect(b.patrol).toBeUndefined();
    expect(b.expedition).toBeUndefined();
    f.units[0].status = 'removed';
    const none = downtimeBlocks(f, campaign());
    expect(none.patrol).toMatch(/No active units/);
    expect(none.training).toBe(none.patrol);
    expect(none.expedition).toBe(none.patrol);
    expect(none.task).toBe(none.patrol);
  });

  it('blocks Expeditions and unit tasks once every unit has been used this round', () => {
    const f = newForce('Spears');
    f.units = [newUnit({ id: 'a' }), newUnit({ id: 'b' })];
    f.nexus = { factionId: 'A', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] };
    const c = campaign();
    markUnitsUsed(f, c, ['a']);
    expect(downtimeBlocks(f, c).expedition).toBeUndefined();
    markUnitsUsed(f, c, ['b']);
    const b = downtimeBlocks(f, c);
    expect(b.expedition).toMatch(/GM ends the round/);
    expect(b.task).toBe(b.expedition);
    expect(b.patrol).toBeUndefined();
    c.round = 3;
    expect(downtimeBlocks(f, c).expedition).toBeUndefined();
  });
});
