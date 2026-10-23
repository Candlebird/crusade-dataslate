import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign } from '../model/types';
import {
  detachmentName, factionClaimedRound, matchBonusesEarned, plannedPoints, reorganise, reorganisePlan, reorganiseProblems,
  reorganisedThisRound, supplyLimit,
} from './detachments';
import { emptyNexus } from './nexus';
import { claimableRounds, endRound } from './rounds';

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [],
    log: [],
  };
}

const force = (name: string, factionId: string, supply: number, us: number) => {
  const f = newForce(name);
  f.nexus = emptyNexus(factionId);
  f.startingSupply = supply;
  f.umbraShards = us;
  return f;
};

let n = 0;
const id = () => `id${n++}`;

describe('detachments', () => {
  it('names a detachment by its faction, and its force once there are several', () => {
    const c = campaign();
    const main = force('Main', 'A', 1000, 0);
    expect(detachmentName(c, [main], main)).toBe('Alpha');
    const second = force('Vanguard', 'A', 0, 0);
    expect(detachmentName(c, [main, second], second)).toBe('Alpha — Vanguard');
  });

  it('moves Supply, shards and units between forces for the cost, conserving the totals', () => {
    const main = force('Main', 'A', 1000, 5);
    const det = force('Vanguard', 'A', 0, 0);
    const u = newUnit({ name: 'Tank', points: 200 });
    const hero = newUnit({ name: 'Hero', points: 100 });
    main.units.push(u, hero);
    main.lists = [{ id: 'l', name: 'L', unitIds: [u.id, hero.id], joins: { [hero.id]: u.id } } as never];
    const plan = reorganisePlan([main, det]);
    expect(reorganiseProblems([main, det], plan)).toEqual(['Umbra Shards add up to 5; they must add up to 2.']);
    plan.supply = { [main.id]: 600, [det.id]: 400 };
    plan.us = { [main.id]: 1, [det.id]: 1 };
    plan.units = { [u.id]: det.id };
    expect(plannedPoints([main, det], plan)).toEqual({ [main.id]: 100, [det.id]: 200 });

    expect(reorganise([main, det], plan, 2, 'd', id)).toEqual([]);
    expect([supplyLimit(main), supplyLimit(det)]).toEqual([600, 400]);
    expect([main.umbraShards, det.umbraShards]).toEqual([1, 1]);
    expect(main.units.map((x) => x.name)).toEqual(['Hero']);
    expect(det.units.map((x) => x.name)).toEqual(['Tank']);
    expect(main.lists![0]).toMatchObject({ unitIds: [hero.id], joins: {} });
    expect([main.nexus!.reorganisedRound, det.nexus!.reorganisedRound]).toEqual([2, 2]);
    expect(main.ledger[main.ledger.length - 1]).toMatchObject({ label: 'Nexus — Detachments reorganised', supply: -400, us: -4 });
  });

  it("refuses a plan that doesn't add up, or a faction that can't pay", () => {
    const main = force('Main', 'A', 1000, 0);
    const det = force('Vanguard', 'A', 0, 0);
    const plan = reorganisePlan([main, det]);
    expect(reorganise([main, det], plan, 1, 'd', id)).toEqual([expect.stringContaining('costs 3 Umbra Shards; the faction has 0')]);
    main.umbraShards = 3;
    plan.us = { [main.id]: 0, [det.id]: 0 };
    plan.supply = { [main.id]: 1000, [det.id]: 100 };
    expect(reorganiseProblems([main, det], plan)).toEqual(['Supply adds up to 1100; it must add up to 1000.']);
    expect(reorganiseProblems([main], reorganisePlan([main]))).toContain('Reorganising needs at least two forces in the faction.');
  });

  it('is once a round for the whole faction', () => {
    const c = campaign();
    const main = force('Main', 'A', 1000, 3);
    const det = force('Vanguard', 'A', 0, 0);
    const other = force('Other', 'B', 1000, 0);
    expect(reorganisedThisRound(c, [main, det, other], 'A')).toBe(false);
    det.nexus!.reorganisedRound = 1;
    expect(reorganisedThisRound(c, [main, det, other], 'A')).toBe(true);
    expect(reorganisedThisRound(c, [main, det, other], 'B')).toBe(false);
    endRound(c, () => 0);
    expect(reorganisedThisRound(c, [main, det, other], 'A')).toBe(false);
  });

  it('pays round income and the match bonus once per faction, not per detachment', () => {
    const c = campaign();
    endRound(c, () => 0);
    endRound(c, () => 0);
    const main = force('Main', 'A', 1000, 0);
    const det = force('Vanguard', 'A', 0, 0);
    main.nexus!.claimedRound = 2;
    expect(factionClaimedRound([main, det], 'A')).toBe(2);
    expect(claimableRounds(c, det.nexus!, [main, det])).toEqual([]);
    expect(claimableRounds(c, det.nexus!).map((r) => r.round)).toEqual([2]);

    main.nexus!.matchBonus = { round: 3, count: 1 };
    det.nexus!.matchBonus = { round: 2, count: 2 };
    expect(matchBonusesEarned([main, det], 'A', 3)).toBe(1);
    expect(matchBonusesEarned([main, det], 'A', 3, main.id)).toBe(0);
  });
});
