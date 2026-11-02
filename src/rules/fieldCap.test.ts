import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { supplyLimit } from './detachments';
import {
  raidCut,
  capFor, claimGrants, cutGarrison, fieldCap, foundFromBank, foundProblem, grantFromBank, grantProblem, isLean, pendingGrants,
  raidOffered, regrowCuts, roomFor, sweepCap, transferCost, transferProblem, transferUnit, uncutGarrison, underdogXp,
} from './fieldCap';
import { emptyNexus, recordSectorGame, removeSectorGame, unitsUsed } from './nexus';
import { FIELD_CAP } from './nexusData';

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'A', player: '', color: '#f00' }, { id: 'B', name: 'B', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'P1', type: 'planet', notes: '', q: 1, r: 0, difficulty: 1000 },
      { id: 'p2', name: 'P2', type: 'planet', notes: '', q: 2, r: 0, difficulty: 1000 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 6, r: 0 },
    ],
    log: [],
  };
}

const force = (id: string, factionId: string, supply: number): Force => {
  const f = newForce(id);
  f.id = id;
  f.nexus = emptyNexus(factionId);
  f.startingSupply = supply;
  return f;
};

let n = 0;
const id = () => `id${n++}`;

describe('the field cap', () => {
  it('grows 100 a round from 1500 up to 4000, and the GM can set their own', () => {
    const c = campaign();
    expect(fieldCap(c)).toBe(1600);
    c.round = 10;
    expect(fieldCap(c)).toBe(2500);
    c.round = 99;
    expect(fieldCap(c)).toBe(FIELD_CAP.max);
    c.fieldCap = { base: 1000, perRound: 50, max: 1200 };
    c.round = 2;
    expect(fieldCap(c)).toBe(1100);
    c.round = 20;
    expect(fieldCap(c)).toBe(1200);
    expect(fieldCap(undefined)).toBe(1600);
  });

  it('grandfathers a detachment already over the cap, then banks what it earns past it', () => {
    const c = campaign();
    const big = force('big', 'A', 3000);
    expect(sweepCap(c, big, 'd', id)).toBe(0);
    expect(big.nexus!.capSeen).toBe(true);
    expect(big.nexus!.capHold).toBe(3000);
    expect(capFor(c, big)).toBe(3000);
    expect(roomFor(c, big)).toBe(0);

    // It earns 200 more: the 200 goes to the bank.
    big.ledger.push({ id: 'x', date: 'd', label: 'Feat', rp: 0, supply: 200 });
    expect(sweepCap(c, big, 'd', id)).toBe(200);
    expect(supplyLimit(big)).toBe(3000);
    expect(c.factions[0].bank).toBe(200);
    expect(big.ledger.slice(-1)[0].label).toMatch(/faction bank/);

    // It spends 500: the hold shrinks, it can't grow back.
    big.ledger.push({ id: 'y', date: 'd', label: 'Spent', rp: 0, supply: -500 });
    sweepCap(c, big, 'd', id);
    expect(big.nexus!.capHold).toBe(2500);

    // The cap passes it: the hold is dropped.
    c.round = 20;
    sweepCap(c, big, 'd', id);
    expect(big.nexus!.capHold).toBeUndefined();
    expect(capFor(c, big)).toBe(3500);
  });

  it('banks overflow from a detachment under the cap when it first came in', () => {
    const c = campaign();
    const f = force('f', 'A', 1500);
    sweepCap(c, f, 'd', id);
    expect(f.nexus!.capHold).toBeUndefined();
    f.ledger.push({ id: 'x', date: 'd', label: 'Buy', rp: 0, supply: 300 });
    expect(sweepCap(c, f, 'd', id)).toBe(200);
    expect(supplyLimit(f)).toBe(1600);
    expect(c.factions[0].bank).toBe(200);
  });

  it('leaves forces outside the campaign alone', () => {
    const f = force('f', 'Z', 9000);
    expect(sweepCap(campaign(), f, 'd', id)).toBe(0);
    expect(f.nexus!.capSeen).toBeUndefined();
    expect(sweepCap(undefined, f, 'd', id)).toBe(0);
  });
});

describe('the faction bank', () => {
  it('hands Supply to a detachment with room; its owner takes it in', () => {
    const c = campaign();
    c.factions[0].bank = 500;
    const f = force('f', 'A', 1300);
    expect(grantProblem(c, f, 400)).toMatch(/room for 300/);
    expect(grantProblem(c, f, 600)).toMatch(/bank holds 500/);
    expect(grantProblem(c, f, 0)).toMatch(/whole number/);
    expect(grantFromBank(c, f, 200, id)).toBeUndefined();
    expect(c.factions[0].bank).toBe(300);
    expect(pendingGrants(c, f)).toBe(200);
    // Pending grants count against its room.
    expect(grantProblem(c, f, 200)).toMatch(/room for 100/);
    expect(claimGrants(c, f, 'd', id)).toBe(200);
    expect(supplyLimit(f)).toBe(1500);
    expect(c.factions[0].grants).toBeUndefined();
    expect(claimGrants(c, f, 'd', id)).toBe(0);
  });

  it('founds a new detachment with at least 500 bank Supply, up to the cap', () => {
    const c = campaign();
    c.factions[0].bank = 400;
    expect(foundProblem(c, 'A', 400)).toMatch(/at least 500/);
    c.factions[0].bank = 2000;
    expect(foundProblem(c, 'A', 300)).toMatch(/at least 500/);
    expect(foundProblem(c, 'A', 1800)).toMatch(/field cap/);
    const f = force('new', 'A', 0);
    expect(foundFromBank(c, f, 700, 'd', id)).toBeUndefined();
    expect(supplyLimit(f)).toBe(700);
    expect(c.factions[0].bank).toBe(1300);
    expect(f.nexus!.capSeen).toBe(true);
  });
});

describe('moving units between detachments', () => {
  const setup = () => {
    const c = campaign();
    const a = force('a', 'A', 1000);
    const b = force('b', 'A', 1000);
    const x = force('x', 'B', 1000);
    const u = newUnit({ id: 'u', name: 'Unit', points: 200 });
    const h = newUnit({ id: 'h', name: 'Hero', points: 100 });
    a.units.push(u, h);
    a.lists = [{ id: 'l', name: 'L', unitIds: ['u', 'h'], joins: { h: 'u' } } as never];
    a.umbraShards = 5;
    return { c, a, b, x, forces: [a, b, x] };
  };

  it('is free in a shared sector, 3 shards otherwise', () => {
    const { c, a, b } = setup();
    c.positions = { a: { sectorId: 'p1', factionId: 'A' }, b: { sectorId: 'p1', factionId: 'A' } };
    c.sectors[1].owner = 'A';
    expect(transferCost(c, a, b)).toBe(0);
    c.positions.b = { sectorId: 'hA', factionId: 'A' };
    expect(transferCost(c, a, b)).toBe(FIELD_CAP.transferUs);
  });

  it('moves the unit out of its lists and leaves it Battle-Worn for the round', () => {
    const { c, a, b, forces } = setup();
    c.sectors[1].owner = 'A';
    c.positions = { a: { sectorId: 'p1', factionId: 'A' }, b: { sectorId: 'hA', factionId: 'A' } };
    expect(transferUnit(c, forces, a, b, 'u', 'd', id)).toBeUndefined();
    expect(a.units.map((u) => u.id)).toEqual(['h']);
    expect(b.units.map((u) => u.id)).toEqual(['u']);
    expect(a.lists![0].unitIds).toEqual(['h']);
    expect(a.lists![0].joins).toEqual({});
    expect(a.umbraShards).toBe(2);
    expect(a.ledger.slice(-1)[0].us).toBe(-3);
    expect(unitsUsed(b, c)).toContain('u');
  });

  it('only between one faction\'s detachments, and only with the shards', () => {
    const { c, a, b, x, forces } = setup();
    expect(transferProblem(c, forces, a, x, 'u')).toMatch(/one faction/);
    expect(transferProblem(c, forces, a, a, 'u')).toMatch(/another/);
    expect(transferProblem(c, forces, a, b, 'zz')).toMatch(/isn't in/);
    a.umbraShards = 1;
    expect(transferProblem(c, forces, a, b, 'u')).toBeUndefined(); // both at home: free
    c.sectors[1].owner = 'A';
    c.positions = { a: { sectorId: 'p1', factionId: 'A' } };
    expect(transferProblem(c, forces, a, b, 'u')).toMatch(/costs 3/);
  });
});

describe('lean detachments, underdogs and raids', () => {
  it('a detachment is lean with active units worth 1000 points or less', () => {
    const f = force('f', 'A', 3000);
    expect(isLean(f)).toBe(false);
    f.units.push(newUnit({ id: 'u', points: 600 }), newUnit({ id: 'v', points: 400 }));
    expect(isLean(f)).toBe(true);
    f.units.push(newUnit({ id: 'w', points: 300, status: 'removed' }));
    expect(isLean(f)).toBe(true);
    f.units.push(newUnit({ id: 'z', points: 10 }));
    expect(isLean(f)).toBe(false);
  });

  it('underdog XP is +1 per 25% the garrison was over, at most +4', () => {
    expect(underdogXp(1000, 1000)).toBe(0);
    expect(underdogXp(1240, 1000)).toBe(0);
    expect(underdogXp(1250, 1000)).toBe(1);
    expect(underdogXp(1600, 1000)).toBe(2);
    expect(underdogXp(9000, 1000)).toBe(4);
    expect(underdogXp(undefined, 1000)).toBe(0);
    expect(underdogXp(1000, 0)).toBe(0);
  });

  it('offers a raid past 1.1× the attackers\' Supply', () => {
    expect(raidOffered(1100, 1000)).toBe(false);
    expect(raidOffered(1110, 1000)).toBe(true);
    expect(raidOffered(undefined, 1000)).toBe(false);
  });

  it('cuts stack 10% at a time; deleting a raid gives its cut back', () => {
    const c = campaign();
    const s = c.sectors[1];
    expect(cutGarrison(s)).toBeCloseTo(0.1);
    expect(cutGarrison(s)).toBeCloseTo(0.1);
    expect(s.cut).toBe(0.2);
    uncutGarrison(s, 0.1);
    expect(s.cut).toBe(0.1);
    uncutGarrison(s, 0.1);
    expect(s.cut).toBeUndefined();
  });

  it('a won raid takes nothing but cuts the garrison and scouts around it', () => {
    const c = campaign();
    recordSectorGame(c, { id: 'e', date: 'd', sectorId: 'p1', attacker: 'A', defender: 'ai', winner: 'A', notes: '', raid: { cut: 0 } });
    const s = c.sectors[1];
    expect(s.owner).toBeUndefined();
    expect(s.cut).toBe(0.1);
    expect(c.factions[0].recon![0].sectorIds).toEqual(expect.arrayContaining(['p1', 'hA', 'p2']));
    removeSectorGame(c, 'e');
    expect(s.cut).toBeUndefined();

    recordSectorGame(c, { id: 'l', date: 'd', sectorId: 'p1', attacker: 'A', defender: 'ai', winner: 'ai', notes: '', raid: { cut: 0 } });
    expect(s.cut).toBeUndefined();
  });

  it("sizes a raid's cut to the raiders and cuts a sector once a round", () => {
    const c = campaign();
    const cap = FIELD_CAP.base + FIELD_CAP.perRound; // round 1
    expect(raidCut(c, cap)).toBe(0.1);
    expect(raidCut(c, cap * 2)).toBe(0.1);
    expect(raidCut(c, cap / 4)).toBe(0.03);
    expect(raidCut(c)).toBe(0.1);
    const win = (id: string, supply: number) =>
      recordSectorGame(c, { id, date: 'd', sectorId: 'p1', attacker: 'A', defender: 'ai', winner: 'A', notes: '', round: 1, raid: { cut: 0, supply } });
    win('a', cap / 4);
    const s = c.sectors[1];
    expect(s.cut).toBe(0.03);
    // A second won raid this round scouts and pays, but cuts no more.
    win('b', cap);
    expect(s.cut).toBe(0.03);
    expect(c.log.find((e) => e.id === 'b')!.raid!.cut).toBe(0);
    removeSectorGame(c, 'a');
    expect(s.cut).toBeUndefined();
  });

  it('regrows 10% a round on sectors nobody attacked', () => {
    const c = campaign();
    c.sectors[1].cut = 0.3;
    c.sectors[2].cut = 0.3;
    c.log.push({ id: 'e', date: '', sectorId: 'p2', attacker: 'A', defender: 'ai', winner: 'A', notes: '', round: 1 });
    regrowCuts(c, 1);
    expect(c.sectors[1].cut).toBe(0.2);
    expect(c.sectors[2].cut).toBe(0.3);
  });
});

describe('musters', () => {
  it('move every mustered detachment in on a win', () => {
    const c = campaign();
    recordSectorGame(c, { id: 'e', date: 'd', sectorId: 'p1', attacker: 'A', defender: 'ai', winner: 'A', notes: '', forceId: 'a', forceIds: ['a', 'b'] });
    expect(c.sectors[1].owner).toBe('A');
    expect(c.positions?.a?.sectorId).toBe('p1');
    expect(c.positions?.b?.sectorId).toBe('p1');
  });
});
