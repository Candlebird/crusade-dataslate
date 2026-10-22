import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { agreeDuel, cancelDuel, duelReady, duelsOwed, newDuel, payDuel, setWagers, settleDuel, wagerIssues } from './duels';
import { NEXUS_DUELS } from './nexusData';
import { bankCap } from './production';

// Nexus Duels: player-against-player battles for a wager, agreed by both sides and paid out when the result is in.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 4,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00', research: 5, blueprints: 1 },
      { id: 'B', name: 'Bravo', player: '', color: '#00f' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', bank: 30, notes: '' },
      { id: 'pA', name: 'A World', type: 'planet', owner: 'A', bank: 50, notes: '' },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '' },
    ],
    log: [],
  };
}

const nexus = (factionId: string) => ({ factionId, permanentTables: [], tempTables: [], traitTokens: 0, pending: [] });

function forces(): Force[] {
  const a: Force = { ...newForce('Alpha Host'), id: 'fA', umbraShards: 6, nexus: nexus('A') };
  a.units = [newUnit({ id: 'uA', name: 'Hero A', category: 'Hero', relics: [{ id: 'r1', name: 'Blade of Ages', tier: 'Rare' }] })];
  const b: Force = { ...newForce('Bravo Host'), id: 'fB', umbraShards: 2, nexus: nexus('B') };
  b.units = [newUnit({ id: 'trooper', name: 'Trooper', category: 'Infantry' }), newUnit({ id: 'uB', name: 'Hero B', category: 'Hero' })];
  return [a, b];
}

const ids = () => { let n = 0; return () => `id${n++}`; };

function agreed(c: Campaign) {
  const d = newDuel(c, { factionId: 'A', forceId: 'fA' }, { factionId: 'B', forceId: 'fB' }, 'd', '2026-10-21');
  setWagers(d, {
    challenger: { forceId: 'fA', wager: { shards: 3, materials: 60, research: 2, relics: [{ id: 'r1', name: 'Blade of Ages', tier: 'Rare', unitId: 'uA' }] } },
    challenged: { forceId: 'fB', wager: { shards: 2, note: 'Buys the beers' } },
  }, 'A');
  agreeDuel(d, 'B');
  return d;
}

describe('Nexus Duels', () => {
  it('needs both sides to agree, and any change to the wagers asks again', () => {
    const c = campaign();
    const d = newDuel(c, { factionId: 'A', forceId: 'fA' }, { factionId: 'B', forceId: 'fB' }, 'd', '');
    expect(d.round).toBe(4);
    expect(duelReady(d)).toBe(false);
    setWagers(d, { challenger: { forceId: 'fA', wager: { shards: 1 } }, challenged: { forceId: 'fB', wager: { shards: 1 } } }, 'A');
    expect(d.challenger.agreed).toBe(true);
    expect(d.challenged.agreed).toBe(false);
    expect(settleDuel(c, 'd', 'A', '')).toBe(false);
    agreeDuel(d, 'B');
    expect(duelReady(d)).toBe(true);
    setWagers(d, { challenger: { forceId: 'fA', wager: { shards: 2 } }, challenged: { forceId: 'fB', wager: { shards: 1 } } }, 'B');
    expect([d.challenger.agreed, d.challenged.agreed]).toEqual([false, true]);
    cancelDuel(c, 'd');
    expect(c.duels).toBeUndefined();
  });

  it('the challenged side can pick its force later, and must before agreeing', () => {
    const c = campaign();
    const d = newDuel(c, { factionId: 'A', forceId: 'fA' }, { factionId: 'B', forceId: '' }, 'd', '');
    expect(wagerIssues(c, forces(), d.challenged)).toEqual(['No force picked yet.']);
    expect(agreeDuel(d, 'B')).toBe(false);
    setWagers(d, { challenger: { forceId: 'fA', wager: {} }, challenged: { forceId: '', wager: {} } }, 'B');
    expect(d.challenged.agreed).toBe(false);
    setWagers(d, { challenger: { forceId: 'fA', wager: {} }, challenged: { forceId: 'fB', wager: {} } }, 'B');
    expect(d.challenged.agreed).toBe(true);
    agreeDuel(d, 'A');
    expect(duelReady(d)).toBe(true);
  });

  it("flags stakes a side couldn't pay", () => {
    const c = campaign();
    const d = agreed(c);
    expect(wagerIssues(c, forces(), d.challenger)).toEqual([]);
    d.challenger.wager.materials = 100;
    d.challenged.wager.blueprints = 1;
    expect(wagerIssues(c, forces(), d.challenger)).toEqual(['Only 80 Materials are banked.']);
    expect(wagerIssues(c, forces(), d.challenged)).toEqual(['Only 0 Blueprints to give.']);
  });

  it("moves the loser's faction stakes when the result is in", () => {
    const c = campaign();
    agreed(c);
    expect(settleDuel(c, 'd', 'B', '2026-10-22')).toBe(true);
    const [A, B] = c.factions;
    expect(A.research).toBe(3);
    expect(B.research).toBe(2);
    // Taken from the richest bank first; the winner's home banks it, up to its cap.
    expect(c.sectors.map((s) => s.bank)).toEqual([20, undefined, Math.min(60, bankCap(c.sectors[2], c))]);
    const [a, b] = forces();
    expect(duelsOwed(c, a).length).toBe(1);
    expect(duelsOwed(c, b).length).toBe(1);
  });

  it('each force pays or collects its own Umbra Shards and relics', () => {
    const c = campaign();
    const d = agreed(c);
    settleDuel(c, 'd', 'B', '');
    const [a, b] = forces();
    expect(payDuel(d, a, '', ids())).toBe('Nexus Duel lost: −3 Umbra Shards, Blade of Ages handed over.');
    expect(a.umbraShards).toBe(3);
    expect(a.units[0].relics).toEqual([]);
    expect(payDuel(d, b, '', ids())).toBe('Nexus Duel won: +3 Umbra Shards, Blade of Ages to Hero B.');
    expect(b.umbraShards).toBe(5);
    expect(b.units[1].relics.map((r) => r.name)).toEqual(['Blade of Ages']);
    expect(b.ledger[b.ledger.length - 1]?.us).toBe(3);
    expect(payDuel(d, b, '', ids())).toBeUndefined();
    expect(duelsOwed(c, a)).toEqual([]);
    expect(duelsOwed(c, b)).toEqual([]);
  });

  it('a draw moves nothing', () => {
    const c = campaign();
    const d = agreed(c);
    settleDuel(c, 'd', '', '');
    expect(c.factions[0].research).toBe(5);
    expect(duelsOwed(c, forces()[0])).toEqual([]);
    expect(payDuel(d, forces()[0], '', ids())).toBeUndefined();
  });

  it('keeps only the latest settled duels', () => {
    const c = campaign();
    for (let i = 0; i <= NEXUS_DUELS.keep; i++) {
      const d = newDuel(c, { factionId: 'A', forceId: 'fA' }, { factionId: 'B', forceId: 'fB' }, `d${i}`, '');
      agreeDuel(d, 'A');
      agreeDuel(d, 'B');
      settleDuel(c, d.id, '', '');
    }
    expect(c.duels?.length).toBe(NEXUS_DUELS.keep);
    expect(c.duels?.[0].id).toBe('d1');
  });
});
