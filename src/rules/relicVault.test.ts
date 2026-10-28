import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Force } from '../model/types';
import { relicHolders } from './engine';
import { carryProblem, equipRelic, grantRelic, sendRelic, stowRelic, vaultOf } from './relicVault';

function force(): Force {
  const f: Force = { ...newForce('Alpha Host'), id: 'f' };
  f.units = [
    { ...newUnit({ id: 'h1', name: 'Vex', category: 'Hero', quality: 4, defense: 4 }), xp: 15 }, // 1 slot
    { ...newUnit({ id: 'h2', name: 'Kor', category: 'Hero', quality: 4, defense: 4 }), xp: 45 }, // 2 slots
    { ...newUnit({ id: 'g', name: 'Grunts', quality: 5, defense: 5 }), xp: 50 },
  ];
  return f;
}
const relic = (id: string, tier: 'Common' | 'Rare' | 'Legendary' = 'Common') => ({ id, name: `Relic ${id}`, tier });

describe('relic vault', () => {
  it('a won relic goes to the vault when the unit has no room for it', () => {
    const f = force();
    expect(grantRelic(f, f.units[0], relic('a'))).toBe('unit');
    expect(grantRelic(f, f.units[0], relic('b'))).toBe('vault'); // its one slot is full
    expect(grantRelic(f, f.units[2], relic('c'))).toBe('vault'); // not a relic bearer
    expect(grantRelic(f, f.units[1], relic('d', 'Legendary'))).toBe('vault'); // 45 XP is short of Legendary
    expect(f.units[0].relics.map((r) => r.id)).toEqual(['a']);
    expect(vaultOf(f).map((r) => r.id)).toEqual(['b', 'c', 'd']);
  });

  it('relics move freely between units with room and the vault', () => {
    const f = force();
    grantRelic(f, f.units[0], relic('a'));
    f.relicVault = [relic('b', 'Rare')];
    expect(carryProblem(f.units[0], relic('x'))).toMatch(/No free relic slot/);
    expect(equipRelic(f, 'h1', 'b')).toBe(false);
    expect(equipRelic(f, 'g', 'b')).toBe(false);
    expect(stowRelic(f, 'h1', 'a')).toBe(true);
    expect(f.units[0].relics).toEqual([]);
    expect(equipRelic(f, 'h1', 'b')).toBe(false); // Rare needs 41 XP
    expect(equipRelic(f, 'h2', 'b')).toBe(true);
    expect(equipRelic(f, 'h1', 'a')).toBe(true);
    expect(vaultOf(f)).toEqual([]);
    expect(f.units[1].relics.map((r) => r.id)).toEqual(['b']);
  });

  it('a stored relic still counts as held', () => {
    const f = force();
    f.relicVault = [relic('a')];
    expect(relicHolders([f]).get('Relic a')?.[0]).toMatchObject({ forceId: 'f', unitId: '', unit: 'Relic vault' });
  });

  it("a stored relic can be sent to another force's vault, noted in both ledgers", () => {
    const f = force();
    const g: Force = { ...newForce('Beta Host'), id: 'g' };
    f.relicVault = [relic('a'), relic('b')];
    expect(sendRelic(f, g, 'a', '2026-10-28')).toBe(true);
    expect(vaultOf(f).map((r) => r.id)).toEqual(['b']);
    expect(vaultOf(g).map((r) => r.id)).toEqual(['a']);
    expect(f.ledger[f.ledger.length - 1]).toMatchObject({ label: 'Relic sent to Beta Host: Relic a', rp: 0, supply: 0 });
    expect(g.ledger[g.ledger.length - 1]).toMatchObject({ label: 'Relic received from Alpha Host: Relic a', rp: 0, supply: 0 });
    expect(sendRelic(f, g, 'a', '2026-10-28')).toBe(false); // no longer there
    expect(sendRelic(f, f, 'b', '2026-10-28')).toBe(false); // same force
  });
});
