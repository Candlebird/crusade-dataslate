import { describe, expect, it } from 'vitest';
import type { Campaign, CampaignEvent } from '../model/types';
import { bandHeading, marauderCap, moveMarauders, owesBand, payToll, recordMarauderGame, MARAUDER_ID } from './marauders';
import { removeSectorGame } from './nexus';
import { MARAUDERS, NEXUS_ROUNDS } from './nexusData';
import { accrueProduction } from './production';
import { standingEffects } from './standing';

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
const banked = (c: Campaign, f: string) => c.sectors.filter((s) => s.owner === f).reduce((n, s) => n + (s.bank ?? 0), 0);
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

  it('move two hexes a round, so a far target takes longer', () => {
    const c = campaign();
    c.marauders![0].sectorId = 'e0';
    expect(moveMarauders(c, 0, high).raids).toEqual([]);
    expect(c.marauders![0].sectorId).toBe('e2');
  });

  it('pick their next target when the round ends, and show the road and when they get there', () => {
    const c = campaign();
    c.marauders![0].sectorId = 'e0';
    moveMarauders(c, 0, high);
    const m = c.marauders![0];
    expect(m.target).toBe('pA');
    expect(bandHeading(c, m)).toMatchObject({ target: { id: 'pA' }, rounds: 1 });
    m.sectorId = 'e0';
    expect(bandHeading(c, m)?.road.map((s) => s.id)).toEqual(['e1', 'e2', 'pA']);
    expect(bandHeading(c, m)?.rounds).toBe(2);
  });

  it('go for the target they picked, not whatever looks best now', () => {
    const c = campaign();
    c.marauders![0].target = 'hA';
    sector(c, 'hA').bank = 1;
    c.marauders![0].sectorId = 'e4';
    const { raids } = moveMarauders(c, 0, high);
    expect(raids.map((r) => r.sectorId)).toEqual(['hA']);
  });

  it("are barred by any faction's detachment on their road, and raid nothing", () => {
    const c = campaign();
    c.marauders![0].target = 'pA';
    c.positions = { f: { sectorId: 'e2', factionId: 'B' } as never };
    const { raids } = moveMarauders(c, 0, high);
    expect(raids).toEqual([{ band: 'The Rust Jackals', sectorId: 'pA', sector: 'Rich World', owner: 'A', stolen: 0, repelled: false, barred: { sectorId: 'e2', sector: 'Gap', by: ['B'] } }]);
    expect(c.marauders![0].sectorId).toBe('e1');
    expect(sector(c, 'pA').bank).toBe(400);
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

  it('turn on whoever barred them, and take the toll at the next round end if nobody answers', () => {
    const c = campaign();
    c.marauders![0].target = 'pA';
    c.positions = { f: { sectorId: 'e2', factionId: 'A' } as never };
    moveMarauders(c, 0, high);
    const m = c.marauders![0];
    expect(m.barred).toEqual({ sectorId: 'e2', by: ['A'], round: c.round });
    expect(owesBand(m, 'A')).toBe(true);
    delete c.positions;
    c.round! += 1;
    const { tolls } = moveMarauders(c, 0, high);
    expect(tolls).toEqual([{ band: 'The Rust Jackals', factionId: 'A', paid: MARAUDERS.toll }]);
    // The toll comes out first, then the raid carries off half of what's left.
    expect(banked(c, 'A')).toBe((400 - MARAUDERS.toll) / 2);
    expect(m.barred).toBeUndefined();
  });

  it('can be paid off', () => {
    const c = campaign();
    c.marauders![0].barred = { sectorId: 'e2', by: ['A'], round: c.round! };
    expect(payToll(c, 'm', 'A')).toBe(MARAUDERS.toll);
    expect(banked(c, 'A')).toBe(400 - MARAUDERS.toll);
    expect(c.marauders![0].barred).toBeUndefined();
  });

  it('take the bigger toll off a blocker that fights and loses; deleting the game refunds it and the debt is back', () => {
    const c = campaign();
    c.marauders![0].barred = { sectorId: 'e2', by: ['A', 'B'], round: c.round! };
    recordMarauderGame(c, game(MARAUDER_ID), 'm');
    expect(c.log[0].toll).toBe(MARAUDERS.lostToll);
    expect(banked(c, 'A')).toBe(400 - MARAUDERS.lostToll);
    expect(c.marauders![0].barred?.by).toEqual(['B']);
    removeSectorGame(c, 'g');
    expect(banked(c, 'A')).toBe(400);
    expect(owesBand(c.marauders![0], 'A')).toBe(true);
  });

  it('let a blocker off on a draw, and are broken by a win', () => {
    const c = campaign();
    c.marauders![0].barred = { sectorId: 'e2', by: ['A'], round: c.round! };
    recordMarauderGame(c, game(''), 'm');
    expect(c.marauders![0].barred).toBeUndefined();
    expect(banked(c, 'A')).toBe(400);
    c.marauders![0].barred = { sectorId: 'e2', by: ['A'], round: c.round! };
    recordMarauderGame(c, { ...game('A'), id: 'w' }, 'm', () => 0);
    expect(c.marauders).toBeUndefined();
    removeSectorGame(c, 'w');
    expect(owesBand(c.marauders![0], 'A')).toBe(true);
  });

  it('show on the orders what standing in a sector does', () => {
    const c = campaign();
    c.marauders![0].target = 'pA';
    expect(standingEffects(c, 'e2', 'B')).toEqual(["🏴 bars The Rust Jackals' road to Rich World"]);
    expect(standingEffects(c, 'pA', 'A')).toEqual(['⛨ guards Rich World from The Rust Jackals']);
    expect(standingEffects(c, 'pA', 'B')).toEqual([]);
    c.marauders![0].sectorId = 'e0';
    expect(standingEffects(c, 'e2', 'B')).toEqual(["🏴 bars The Rust Jackals' road to Rich World"]);
    c.marauders![0].sectorId = 'hA';
    c.marauders![0].target = 'pA';
    expect(standingEffects(c, 'e0', 'B')).toEqual([]);
  });
});
