import { describe, expect, it } from 'vitest';
import type { Campaign, NexusCrisis } from '../model/types';
import { crisisForfeits, crisisRound, placeCrisis, rollEvent, setEvent, settleCrisis } from './events';
import { ECHOES, NEXUS_CRISIS, NEXUS_ROUNDS, activeCrisis, activeEvent, homeChallengeBlock, nexusGeneration, removeSectorGame } from './nexus';
import { endRound, nextThreat, placeEchoMarks, roundIncomeItems } from './rounds';
import { resolveMarks } from './voidspawn';
import { accrueProduction } from './production';
import { researchRate } from './tech';
import { visibleTo } from './fog';
import { ratingFor } from './difficulty';
import { FOG, GALACTIC_EVENTS } from './nexusData';
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
    expect(roundIncomeItems(rush, 'A', rush.rounds![rush.rounds!.length - 1]).some((x) => x.source === 'Round 4 — Shard Rush' && x.us === 3)).toBe(true);
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

  it('stays up for its window, and falls on its last round if nobody beats it', () => {
    const c = campaign();
    expect(placeCrisis(c, () => 0)).toBe(true);
    expect(c.crisis!.until).toBe(c.round! + NEXUS_CRISIS.window - 1);
    const plain = nextThreat(c);
    // Not its last round: nothing is settled, and the threat climbs as usual.
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(r.crisis).toBeUndefined();
    expect(r.threat).toBe(plain);
    expect(activeCrisis(c)).toBe(c.crisis);
    for (let i = 1; i < NEXUS_CRISIS.window - 1; i++) endRound(c, () => 0.5, '2026-10-21');
    expect(nextThreat(c)).toBe(NEXUS_ROUNDS.threatMax);
    const last = endRound(c, () => 0.5, '2026-10-22');
    expect(last.crisis?.result).toBe('lost');
    expect(activeCrisis(c)).toBeUndefined();
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
    expect(lost.notes[0]).toMatch(/still stands/);
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

describe('Galactic Events: the D16', () => {
  it('has 16 events, all ids distinct', () => {
    expect(GALACTIC_EVENTS).toHaveLength(16);
    expect(new Set(GALACTIC_EVENTS.map((e) => e.id)).size).toBe(16);
  });

  it('a Warp Storm keeps the Echoes out too: no marks there, and a marked sector there is cut off', () => {
    const c = campaign();
    setEvent(c, 'warpStorm', () => 0);
    const storm = c.event!.sectorIds!;
    for (let i = 0; i < 20; i++) for (const m of placeEchoMarks(c, Math.random, 10)) expect(storm).not.toContain(m.sectorId);
    const ends = resolveMarks(c, storm.filter((id) => sector(c, id).owner !== ECHOES.id).map((sectorId) => ({ sectorId })), '2026-10-20');
    for (const e of ends) expect(e.result).toBe('cutOff');
  });

  it('a Void Lull spreads into 2 fewer sectors, not none', () => {
    expect(GALACTIC_EVENTS.find((e) => e.id === 'voidLull')!.spread).toBe(-2);
  });

  it('Hunting Season: every win against the Echoes drops threat one more', () => {
    const win = (c: Campaign) => c.log.push({ id: 'w', date: '', round: 4, sectorId: 'e1', attacker: 'A', defender: ECHOES.id, winner: 'A' } as Campaign['log'][number]);
    const base = campaign();
    win(base);
    const hunt = campaign();
    win(hunt);
    setEvent(hunt, 'huntingSeason');
    expect(nextThreat(hunt)).toBe(nextThreat(base) - 1);
  });

  it('Blood Moon swells AI garrisons ×1.1 (to the nearest 10) and pays 3 Shards a win against them', () => {
    const c = campaign();
    sector(c, 'e1').difficulty = 1000;
    sector(c, 'b1').difficulty = 1000;
    expect(ratingFor(sector(c, 'e1'), 'A', c)).toBe(1000);
    setEvent(c, 'bloodMoon');
    expect(ratingFor(sector(c, 'e1'), 'A', c)).toBe(1100);
    expect(ratingFor(sector(c, 'b1'), 'A', c)).toBe(1000); // a player's sector isn't swollen
    expect(ratingFor(sector(c, 'e1'))).toBe(1000); // without the campaign, the base rating
    const won = nexusGeneration(c, 'A', 'e1', 'win', true).items.find((x) => x.key === 'eventWin');
    expect(won?.us).toBe(3);
    expect(nexusGeneration(c, 'A', 'e1', 'loss', true).items.some((x) => x.key === 'eventWin')).toBe(false);
    expect(nexusGeneration(c, 'A', 'b1', 'win', true).items.some((x) => x.key === 'eventWin')).toBe(false);
  });

  it('Forge Surge banks +100 Materials a producing sector; Breakthrough +1 Research; Ceasefire +1 sight', () => {
    const plain = campaign();
    const surge = campaign();
    setEvent(surge, 'forgeSurge');
    const gained = (c: Campaign) => accrueProduction(c).reduce((n, x) => n + x.gained, 0);
    const a = gained(plain);
    const b = gained(surge);
    expect(b).toBeGreaterThan(a);
    const r = researchRate(plain, 'A');
    setEvent(plain, 'breakthrough');
    expect(researchRate(plain, 'A')).toBe(r + 1);
    const fog = campaign();
    // One hex past what B's home sees, and further still from B's planet.
    fog.sectors.push({ id: 'edge', name: 'Edge', type: 'planet', benefit: 'fertileLand', notes: '', q: 9 + FOG.homeSight + 1, r: 9 });
    expect(visibleTo(fog, 'B').has('edge')).toBe(false);
    const seen = visibleTo(fog, 'B').size;
    setEvent(fog, 'ceasefire');
    expect(visibleTo(fog, 'B').size).toBeGreaterThan(seen);
    expect(visibleTo(fog, 'B').has('edge')).toBe(true);
    expect(GALACTIC_EVENTS.find((e) => e.id === 'ceasefire')!.sight).toBe(1);
  });

  it('Glory Seekers hands the battle report its +1 XP', () => {
    const c = campaign();
    setEvent(c, 'glory');
    expect(nexusGeneration(c, 'A', 'e1', 'win', true).glory).toBe(1);
  });
});
