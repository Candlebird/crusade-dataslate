import { describe, expect, it } from 'vitest';
import type { Campaign, CampaignEvent } from '../model/types';
import { marauderCap, moveMarauders, recordMarauderGame, MARAUDER_ID } from './marauders';
import { removeSectorGame } from './nexus';
import { MARAUDERS, NEXUS_ROUNDS } from './nexusData';
import { accrueProduction } from './production';

// Marauders (Nexus Wars): raider bands that move toward rich worlds, raid them and drop Guardian loot when beaten.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: NEXUS_ROUNDS.graceRounds + 2,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'e0', name: 'Edge', type: 'empty', notes: '', q: 0, r: 0 },
      { id: 'e1', name: 'Drift', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'e2', name: 'Gap', type: 'empty', notes: '', q: 2, r: 0 },
      { id: 'pA', name: 'Rich World', type: 'planet', owner: 'A', bank: 400, notes: '', q: 3, r: 0 },
      { id: 'e4', name: 'Far', type: 'empty', notes: '', q: 4, r: 0 },
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 5, r: 0 },
    ],
    marauders: [{ id: 'm', name: 'The Rust Jackals', sectorId: 'e1', strength: 900, since: 1 }],
    log: [],
  };
}

/** Always high: moves the most, never spawns. */
const high = () => 0.99;
const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const game = (winner: string): CampaignEvent => ({ id: 'g', date: '', sectorId: '', attacker: 'A', defender: MARAUDER_ID, winner, notes: '' });

describe('Marauders', () => {
  it('turn up after the opening rounds, while there are fewer than the threat allows', () => {
    const c = campaign();
    delete c.marauders;
    c.round = NEXUS_ROUNDS.graceRounds;
    expect(moveMarauders(c, 6, () => 0).spawned).toEqual([]);
    c.round = NEXUS_ROUNDS.graceRounds + 1;
    expect(moveMarauders(c, 0, () => 0).spawned).toEqual([]);
    const { spawned } = moveMarauders(c, 6, () => 0);
    expect(spawned).toHaveLength(1);
    expect(spawned[0]).toMatchObject({ strength: MARAUDERS.start, since: c.round });
    expect(sector(c, spawned[0].sectorId).owner).toBeUndefined();
    c.marauders = Array.from({ length: marauderCap(6) }, (_, i) => ({ ...spawned[0], id: `x${i}`, sectorId: 'e0' }));
    expect(moveMarauders(c, 6, () => 0).spawned).toEqual([]);
  });

  it('raid the richest world: half its bank, and it produces nothing that round', () => {
    const c = campaign();
    const { raids } = moveMarauders(c, 0, high);
    expect(raids).toEqual([{ band: 'The Rust Jackals', sectorId: 'pA', sector: 'Rich World', owner: 'A', stolen: 200, repelled: false }]);
    expect(c.marauders![0]).toMatchObject({ sectorId: 'pA', strength: 900 + MARAUDERS.grow });
    expect(sector(c, 'pA').bank).toBe(200);
    expect(accrueProduction(c).map((p) => p.sector.id)).not.toContain('pA');
    expect(sector(c, 'pA').raided).toBeUndefined();
    expect(accrueProduction(c).map((p) => p.sector.id)).toContain('pA');
  });

  it('move only part of the way when the target is far', () => {
    const c = campaign();
    expect(moveMarauders(c, 0, () => 0).raids).toEqual([]);
    expect(c.marauders![0].sectorId).toBe('e2');
  });

  it('are thrown back by Walls or a garrison', () => {
    for (const defend of [(c: Campaign) => void (sector(c, 'pA').buildings = ['walls']), (c: Campaign) => void (c.positions = { f: { sectorId: 'pA', factionId: 'A' } as never })]) {
      const c = campaign();
      defend(c);
      const { raids } = moveMarauders(c, 0, high);
      expect(raids.map((r) => [r.sectorId, r.repelled, r.stolen])).toEqual([['pA', true, 0]]);
      expect(c.marauders![0]).toMatchObject({ sectorId: 'e2', strength: 900 + MARAUDERS.grow - MARAUDERS.repelLoss });
      expect(sector(c, 'pA').bank).toBe(400);
    }
  });

  it('beaten, drop Guardian loot and go; deleting the game brings them back', () => {
    const c = campaign();
    const bank = sector(c, 'hA').bank ?? 0;
    recordMarauderGame(c, game('A'), 'm', () => 0);
    expect(c.marauders).toBeUndefined();
    const e = c.log[0];
    expect(e).toMatchObject({ sectorId: 'e1', defender: MARAUDER_ID, marauder: { id: 'm' } });
    expect(e.loot?.factionId).toBe('A');
    expect(sector(c, 'e1').owner).toBeUndefined();
    removeSectorGame(c, 'g');
    expect(c.marauders).toEqual([{ id: 'm', name: 'The Rust Jackals', sectorId: 'e1', strength: 900, since: 1 }]);
    expect(sector(c, 'hA').bank ?? 0).toBe(bank);
    expect(c.log).toEqual([]);
  });

  it('stay when they win', () => {
    const c = campaign();
    recordMarauderGame(c, game(MARAUDER_ID), 'm');
    expect(c.marauders).toHaveLength(1);
    expect(c.log[0].loot).toBeUndefined();
  });
});
