import { describe, expect, it } from 'vitest';
import type { Campaign, NexusCrisis } from '../model/types';
import { crisisForfeits, crisisRound, placeCrisis, rollEvent, setEvent, settleCrisis } from './events';
import { ECHOES, NEXUS_CRISIS, NEXUS_ROUNDS, activeCrisis, activeEvent, homeChallengeBlock, nexusGeneration, removeSectorGame } from './nexus';
import { endRound, nextThreat, roundIncomeItems } from './rounds';
import { parseRoute } from '../route';
import { mvpForce, type TrackedBattle } from './tracker';

// Alpha holds two planets near the Maw, Bravo one far off; an Echo-held planet sits next to the Maw.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 4, threat: 2,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', benefit: 'largeShardMine', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', benefit: 'shardMine', owner: 'A', notes: '', q: 4, r: 3 },
      { id: 'p2', name: 'Planet 2', type: 'planet', benefit: 'spacePort', owner: 'A', notes: '', q: 1, r: 1 },
      { id: 'e1', name: 'Dark World', type: 'planet', benefit: 'fertileLand', owner: ECHOES.id, notes: '', q: 3, r: 4 },
      { id: 'vs', name: 'Maw', type: 'voidspawn', owner: ECHOES.id, notes: '', q: 3, r: 3 },
      { id: 'b1', name: 'Planet B', type: 'planet', benefit: 'fertileLand', owner: 'B', notes: '', q: 8, r: 8 },
      { id: 'hB', name: 'B Home', type: 'home', benefit: 'biomassPool', owner: 'B', notes: '', q: 9, r: 9 },
    ],
    log: [],
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const crisisAt = (c: Campaign, sectorId = 'vs'): NexusCrisis => (c.crisis = { round: c.round!, lord: 'stormHerald', sectorId });

describe('Galactic Events', () => {
  it('sets and rolls the round\'s event; a Warp Storm cuts off two sectors that aren\'t homes or strongholds', () => {
    const c = campaign();
    rollEvent(c, () => 0);
    expect(activeEvent(c)).toBeDefined();
    expect(c.event?.round).toBe(4);
    setEvent(c, 'warpStorm', () => 0);
    expect(c.event!.sectorIds).toHaveLength(2);
    for (const id of c.event!.sectorIds!) expect(['p1', 'p2', 'e1', 'b1']).toContain(id);
    expect(homeChallengeBlock(c, sector(c, c.event!.sectorIds![0]))).toMatch(/Warp Storm/);
    setEvent(c, 'ceasefire');
    expect(c.event).toEqual({ id: 'ceasefire', round: 4 });
    expect(homeChallengeBlock(c, sector(c, 'hB'))).toMatch(/Ceasefire/);
    setEvent(c, 'nope');
    expect(c.event?.id).toBe('ceasefire');
    c.round = 5; // an old round's event doesn't count
    expect(activeEvent(c)).toBeUndefined();
  });

  it('changes how the round ends: threat, spread and income', () => {
    const c = campaign();
    setEvent(c, 'risingDark');
    expect(nextThreat(c)).toBe(2 + NEXUS_ROUNDS.threatPerRound + 1);
    const lull = campaign();
    setEvent(lull, 'voidLull');
    expect(endRound(lull, () => 0.5, '2026-10-20').spread).toEqual([]);
    const rush = campaign();
    setEvent(rush, 'shardRush');
    endRound(rush, () => 0.5, '2026-10-20');
    expect(rush.rounds![rush.rounds!.length - 1].event).toBe('shardRush');
    expect(roundIncomeItems(rush, 'A', rush.rounds![rush.rounds!.length - 1]).some((x) => x.source === 'Round 4 — Shard Rush' && x.us === 1)).toBe(true);
  });

  it('rolls the next round\'s event when a round ends', () => {
    const c = campaign();
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(r.nextEvent).toBeDefined();
    expect(activeEvent(c)?.id).toBe(r.nextEvent);
  });
});

describe('the Nexus Crisis', () => {
  it('comes every few rounds, in an Echo-held sector', () => {
    const every = NEXUS_CRISIS.everyRounds;
    expect([0, 1, every, every + 1, every * 2].map(crisisRound)).toEqual([false, false, true, false, true]);
    const c = campaign();
    expect(placeCrisis(c, () => 0)).toBe(true);
    expect(['e1', 'vs']).toContain(c.crisis!.sectorId);
    expect(activeCrisis(c)).toBe(c.crisis);
    const none = campaign();
    none.sectors = none.sectors.filter((s) => s.owner !== ECHOES.id && s.type !== 'voidspawn');
    expect(placeCrisis(none)).toBe(false);
  });

  it('takes each faction\'s nearest sector, never a home, when it isn\'t won', () => {
    const c = campaign();
    crisisAt(c);
    expect(crisisForfeits(c).map((s) => s.id)).toEqual(['p1', 'b1']);
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(r.crisis).toMatchObject({ result: 'lost', lost: [{ id: 'p1' }, { id: 'b1' }] });
    expect(r.threat).toBe(NEXUS_ROUNDS.threatMax);
    expect(sector(c, 'p1').owner).toBe(ECHOES.id);
    expect(sector(c, 'hA').owner).toBe('A');
  });

  it('pushes the Echoes back when won', () => {
    const c = campaign();
    const without = nextThreat(c);
    crisisAt(c).result = 'won';
    const expected = Math.max(0, without - NEXUS_CRISIS.threatDrop);
    expect(nextThreat(c)).toBe(expected); // the round panel's preview counts the win
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(r.crisis).toMatchObject({ result: 'won', lost: [] });
    expect(r.threat).toBe(expected);
    expect(settleCrisis(c, '')).toBeUndefined(); // the next round has none
  });

  it('rises when a Crisis round begins', () => {
    const c = campaign();
    c.round = NEXUS_CRISIS.everyRounds - 1;
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(r.newCrisis).toBeDefined();
    expect(activeCrisis(c)?.round).toBe(NEXUS_CRISIS.everyRounds);
  });

  it('pays its rewards to every side, and a relic to the MVP', () => {
    const c = campaign();
    crisisAt(c).result = 'won';
    const mvp = nexusGeneration(c, 'A', 'vs', 'win', true, undefined, { crisis: 4, forceId: 'f1', mvp: 'f1' });
    const keys = (x: { items: { key: string }[] }) => x.items.map((i) => i.key).filter((k) => k.startsWith('crisis'));
    expect(keys(mvp)).toEqual(['crisis', 'crisisMvp']);
    expect(mvp.items.find((x) => x.key === 'crisis')!.us).toBe(NEXUS_CRISIS.winUs);
    const other = nexusGeneration(c, 'B', 'vs', 'win', true, undefined, { crisis: 4, forceId: 'f2', mvp: 'f1' });
    expect(keys(other)).toEqual(['crisis']);
    const lost = nexusGeneration(c, 'B', 'vs', 'loss', true, undefined, { crisis: 4, forceId: 'f2' });
    expect(keys(lost)).toEqual([]);
    expect(lost.notes[0]).toMatch(/Nexus Crisis was lost/);
  });

  it('can be fought again when its log entry is deleted', () => {
    const c = campaign();
    Object.assign(crisisAt(c), { result: 'won', mvp: 'f1', battleId: 'b' });
    c.log.push({ id: 'x', date: '', sectorId: 'vs', attacker: 'A', defender: ECHOES.id, winner: 'A', notes: '', battleId: 'b', crisis: true, round: 4 });
    removeSectorGame(c, 'x');
    expect(c.crisis).toEqual({ round: 4, lord: 'stormHerald', sectorId: 'vs' });
    expect(c.log).toEqual([]);
  });

  it('has its own tracker link', () => {
    expect(parseRoute('#/battle/crisis')).toMatchObject({ page: 'tracker', crisis: true });
  });
});

describe('Crisis MVP', () => {
  const battle = (...xp: number[][]) => ({
    sides: xp.map((units, i) => ({ id: `s${i}`, forceId: `f${i}`, ai: false, units: units.map((n) => ({ xp: n })) })),
  }) as unknown as TrackedBattle;

  it('goes to the force whose units earned the most XP', () => {
    expect(mvpForce(battle([1, 1], [3]))).toBe('f1');
  });

  it('goes to no one when no unit earned XP', () => {
    expect(mvpForce(battle([0], []))).toBeUndefined();
  });
});
