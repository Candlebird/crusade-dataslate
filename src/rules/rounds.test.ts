import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign } from '../model/types';
import { ECHOES, emptyNexus } from './nexus';
import { HOLD, revealOrders, type PlayerOrders } from './orders';
import { assetsOf, claimableRounds, endRound, leaders, nextThreat, refundAsset, resolveRoundIncome, roundIncomeItems, spendAsset, underdogBonus } from './rounds';

// Alpha's three sectors ring the Voidspawn, with an unclaimed one beside it; Bravo is far away with one.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', benefit: 'largeShardMine', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', benefit: 'shardMine', owner: 'A', notes: '', q: 4, r: 3 },
      { id: 'p2', name: 'Planet 2', type: 'planet', benefit: 'spacePort', owner: 'A', notes: '', q: 2, r: 3 },
      { id: 'an', name: 'Rift', type: 'anomaly', owner: 'A', notes: '', q: 3, r: 4 },
      { id: 'u', name: 'Hulk', type: 'void', notes: '', q: 3, r: 2 },
      { id: 'vs', name: 'Maw', type: 'voidspawn', owner: ECHOES.id, notes: '', q: 3, r: 3 },
      { id: 'b1', name: 'Planet B', type: 'planet', benefit: 'fertileLand', owner: 'B', notes: '', q: 8, r: 8 },
      { id: 'hB', name: 'B Home', type: 'home', benefit: 'biomassPool', owner: 'B', notes: '', q: 9, r: 9 },
    ],
    log: [],
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const win = (sectorId: string, winner: string) => ({ id: sectorId, date: '', sectorId, attacker: winner, defender: ECHOES.id, winner, notes: '' });

describe('campaign rounds', () => {
  it('knows who is ahead and who gets a catch-up bonus', () => {
    expect(leaders(campaign())).toEqual(['A']);
    expect(underdogBonus(campaign())).toEqual({ A: 0, B: 6 });
    const c = campaign();
    sector(c, 'b1').owner = 'A';
    sector(c, 'hB').owner = 'B';
    expect(underdogBonus(c)).toEqual({ A: 0, B: 12 });
  });

  it('ends a round: notes holdings, raises the threat and spreads only into unclaimed space early on', () => {
    const c = campaign();
    const r = endRound(c, () => 0, '2026-10-19');
    expect(r).toMatchObject({ round: 1, threatBefore: 1, threat: 2, wins: 0, voidspawnWins: 0 });
    expect(r.spread.map((s) => s.id)).toEqual(['u']);
    expect(c).toMatchObject({ round: 2, threat: 2 });
    expect(c.rounds).toEqual([{
      round: 1, date: '2026-10-19', underdog: { A: 0, B: 6 },
      holdings: { A: ['hA', 'p1', 'p2', 'an'], B: ['b1', 'hB'] },
    }]);
    expect(sector(c, 'u').owner).toBe(ECHOES.id);
  });

  it('lowers the threat for wins against the Echoes, more at a Voidspawn', () => {
    const c = campaign();
    c.threat = 3;
    c.log.push(win('u', 'A'));
    expect(nextThreat(c)).toBe(3);
    c.log.push(win('vs', 'B'));
    expect(nextThreat(c)).toBe(1);
    c.log.push({ ...win('u', 'B'), round: 0 }); // an older round doesn't count
    const r = endRound(c, () => 0);
    expect(r).toMatchObject({ wins: 1, voidspawnWins: 1, threat: 1 });
  });

  it('counts a skirmish won against the Echoes as a patrol', () => {
    const c = campaign();
    c.threat = 3;
    c.log.push({ ...win('', 'A'), id: 's1', skirmish: true });
    c.log.push({ ...win('', 'B'), id: 's2', skirmish: true, defender: 'A', winner: 'B' }); // a skirmish between players isn't
    expect(nextThreat(c)).toBe(3);
    expect(endRound(c, () => 0)).toMatchObject({ wins: 0, voidspawnWins: 0, patrols: 1, threat: 3 });
  });

  it('earns a Strategic Asset per skirmish won, up to the cap, and loses unspent ones at the round end', () => {
    const c = campaign();
    const skirmish = (id: string, winner: string) => c.log.push({ ...win('', winner), id, skirmish: true });
    expect(assetsOf(c, 'A')).toMatchObject({ earned: 0, left: 0 });
    expect(spendAsset(c, 'A', 'rerolls', 'x', '')).toBe(false);
    skirmish('s1', 'A');
    skirmish('s2', 'A');
    skirmish('s3', 'A');
    win('p1', 'A'); // a Battle doesn't earn one
    expect(assetsOf(c, 'A')).toMatchObject({ earned: 2, left: 2 });
    expect(spendAsset(c, 'A', 'rerolls', 'x', '')).toBe(true);
    expect(spendAsset(c, 'A', 'tie', 'y', '')).toBe(true);
    expect(spendAsset(c, 'A', 'mission', 'z', '')).toBe(false);
    expect(assetsOf(c, 'A').spent.map((a) => a.asset)).toEqual(['rerolls', 'tie']);
    refundAsset(c, 'x');
    expect(assetsOf(c, 'A').left).toBe(1);
    expect(assetsOf(c, 'B').earned).toBe(0);
    endRound(c, () => 0);
    expect(c.assetsSpent).toBeUndefined();
    expect(assetsOf(c, 'A')).toMatchObject({ earned: 0, left: 0 });
  });

  it('after the opening rounds, goes for the leader and breaks their reinforcements', () => {
    const c = campaign();
    c.round = 4;
    sector(c, 'p1').reinforced = true;
    // Targets in order: p1, p2, an (Alpha leads: ×3 each), then u (×1); 10 in all.
    expect(endRound(structuredClone(c), () => 0.95).spread.map((s) => s.id)).toEqual(['u']);
    expect(endRound(structuredClone(c), () => 0.85).spread.map((s) => s.id)).toEqual(['an']);
    endRound(c, () => 0);
    expect(sector(c, 'p1')).toMatchObject({ owner: ECHOES.id });
    expect(sector(c, 'p1').reinforced).toBeUndefined();
  });

  it('keeps the latest rounds for late claims; a new force starts from the latest', () => {
    const c = campaign();
    for (let i = 0; i < 10; i++) endRound(c, () => 0);
    expect(c.rounds!.map((r) => r.round)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    const n = emptyNexus('B');
    expect(claimableRounds(c, n).map((r) => r.round)).toEqual([10]);
    n.claimedRound = 7;
    expect(claimableRounds(c, n).map((r) => r.round)).toEqual([8, 9, 10]);
    n.claimedRound = 10;
    expect(claimableRounds(c, n)).toEqual([]);
    expect(claimableRounds(c, emptyNexus('gone'))).toEqual([]);
  });

  it('lists a round\'s income, catch-up bonus included', () => {
    const c = campaign();
    endRound(c, () => 0);
    const snap = c.rounds![0];
    expect(roundIncomeItems(c, 'A', snap).map((i) => `${i.key}:${i.kind}`)).toEqual(['r1:hA:us', 'r1:p1:shardRoll', 'r1:p2:manipulation', 'r1:an:anomaly']);
    const b = roundIncomeItems(c, 'B', snap);
    expect(b.map((i) => [i.kind, i.us ?? i.supply])).toEqual([['supply', 50], ['supply', 100], ['us', 6], ['supply', 100]]);
    expect(b[2].source).toBe('Round 1 — Catch-up bonus');
  });

  it('pays round income, ending the last claim\'s unlocks', () => {
    const c = campaign();
    endRound(c, () => 0);
    endRound(c, () => 0);
    const f = newForce('B');
    f.nexus = { ...emptyNexus('B'), tempTables: ['Hero'], claimedRound: 0 };
    const rounds = claimableRounds(c, f.nexus);
    const items = rounds.flatMap((r) => roundIncomeItems(c, 'B', r));
    let n = 0;
    const out = resolveRoundIncome(f, c, rounds, items, {}, '2026-10-19', () => `id${n++}`);
    expect(out).toMatchObject({ us: 12, supply: 500, warnings: [] });
    expect(out.lines[0]).toBe('Bravo income for rounds 1–2: +12 Umbra Shards, +500 Supply.');
    expect(f.umbraShards).toBe(12);
    expect(f.ledger).toHaveLength(8);
    expect(f.nexus).toMatchObject({ claimedRound: 2, tempTables: [] });
    expect(claimableRounds(c, f.nexus)).toEqual([]);
  });

  it('resolves rolled round income and warns about unrolled items', () => {
    const c = campaign();
    endRound(c, () => 0);
    const f = newForce('A');
    f.nexus = emptyNexus('A');
    const rounds = claimableRounds(c, f.nexus);
    const items = roundIncomeItems(c, 'A', rounds[0]);
    const pick = (roll: number) => ({ roll, choice: '', target: '', alloc: {} });
    const unrolled = resolveRoundIncome(structuredClone(f), c, rounds, items, {}, '', () => 'x');
    expect(unrolled.warnings).toEqual(['Round 1 — Planet 1: Shard Mine: not rolled yet.', 'Round 1 — Rift: Anomaly: not rolled yet.']);
    const out = resolveRoundIncome(f, c, rounds, items, { 'r1:p1': pick(3), 'r1:an': pick(6) }, '', () => 'x');
    expect(out.us).toBe(6); // large mine + shard mine on a 3+
    expect(f.nexus.tempTables).toBe('all');
    expect(f.nexus.pending).toEqual(['Combat Manipulation: any (free)']);
  });
});

describe('home challenges in orders', () => {
  it('flags home attacks in the opening rounds and more than one a round', () => {
    const c = campaign();
    const orders: PlayerOrders[] = [{ email: 'a@x', round: 1, picks: { A: 'hB' } }, { email: 'b@x', round: 1, picks: { B: HOLD } }];
    expect(revealOrders(c, orders, 1).attacks[0].flags).toContain('No home-sector challenges until round 4');
    c.round = 4;
    c.factions.push({ id: 'C', name: 'Charlie', player: '', color: '#0f0' });
    const both = revealOrders(c, [orders[0], { email: 'c@x', round: 1, picks: { C: 'hB' } }], 1).attacks;
    expect(both[0].flags).not.toContain('No home-sector challenges until round 4');
    expect(both[0].flags).toContain('A home sector can only be challenged once per round');
  });
});
