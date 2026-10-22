import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import {
  activeMarks, checksDone, dealJournal, dropMark, eligibleRewards, journalText, localOffer, makeOffer, minNothing, pickOption, reframeJournal,
  requiredReward,
  rollTwist, successes, tierCap, validOffer,
} from './journal';
import {
  JOURNAL, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_CONTEXTS, JOURNAL_REWARDS, JOURNAL_SKILLS, JOURNAL_TABLES, JOURNAL_THREADS,
  JOURNAL_TWISTS, rewardValue, tierBand,
} from './journalData';
import { journalRequest } from './journalAi';
import { moveOf } from './movement';

// Crossroads Journal variety: the tables stay inside their balance bands, and the twists, rivals, story threads, marks
// and the faction's memory work.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2, threat: 3,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00', research: 1, warlord: { forceId: 'fA', unitId: 'w', name: 'Vex', level: 1, since: 1 } },
      { id: 'B', name: 'Bravo', player: '', color: '#00f', warlord: { forceId: 'fB', unitId: 'x', name: 'Kor', level: 1, since: 1 } },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', bank: 10, notes: '', q: 0, r: 0 },
      { id: 'near', name: 'Near', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'far', name: 'Far', type: 'empty', notes: '', q: 12, r: 0 },
    ],
    log: [],
  };
}

function forces(): Force[] {
  const a: Force = { ...newForce('Alpha Host'), id: 'fA', umbraShards: 3, nexus: { factionId: 'A', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] } };
  a.units = [newUnit({ id: 'w', name: 'Vex', category: 'Hero', quality: 4, defense: 4, rules: ['Hero', 'Fearless', 'Tough(3)'] })];
  return [a];
}

const ids = () => { let n = 0; return () => `id${n++}`; };
/** A rand() that never rolls a twist, rival or thread (0.99), then picks the first of everything. */
const calm = () => { let n = 0; return () => (n++ % 2 ? 0.99 : 0); };
const pass = { skill: 'might' as const, target: 3, rolls: [6], pass: true };
const fail = { skill: 'might' as const, target: 3, rolls: [1], pass: false };

describe('journal tables', () => {
  it('keep every reward inside its tier’s value band', () => {
    const out = JOURNAL_REWARDS.filter((r) => {
      const [lo, hi] = tierBand(r.tier);
      const v = rewardValue(r);
      return v < lo - 1e-9 || v > hi + 1e-9;
    }).map((r) => `${r.id} (tier ${r.tier}): ${rewardValue(r)}`);
    expect(out).toEqual([]);
  });

  it('have unique ids and only known skills and tables', () => {
    for (const t of [JOURNAL_CONTEXTS, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_REWARDS, JOURNAL_TWISTS, JOURNAL_THREADS]) {
      const xs = t.map((x) => x.id);
      expect(new Set(xs).size).toBe(xs.length);
    }
    const skills = new Set(JOURNAL_SKILLS.map((s) => s.id));
    const tables = new Set(JOURNAL_TABLES.map((t) => t.id));
    for (const c of JOURNAL_CATALYSTS) {
      expect(c.approaches.every((a) => skills.has(a.skill)) && c.climax.skills.every((s) => skills.has(s))).toBe(true);
      expect(c.tables.every((t) => tables.has(t))).toBe(true);
    }
    for (const c of JOURNAL_COMPLICATIONS) expect(c.choices.filter((x) => x.skill && skills.has(x.skill)).length).toBe(1);
    for (const t of JOURNAL_TWISTS) expect(t.skills.every((s) => skills.has(s))).toBe(true);
    expect(JOURNAL_REWARDS.every((r) => tables.has(r.table))).toBe(true);
  });

  it('are big, with bad endings on every table and a payoff for every thread', () => {
    expect(JOURNAL_CONTEXTS.length).toBeGreaterThanOrEqual(40);
    expect(JOURNAL_CATALYSTS.length).toBeGreaterThanOrEqual(36);
    expect(JOURNAL_COMPLICATIONS.length).toBeGreaterThanOrEqual(30);
    expect(JOURNAL_REWARDS.length).toBeGreaterThanOrEqual(80);
    for (const t of JOURNAL_TABLES) expect(JOURNAL_REWARDS.filter((r) => r.table === t.id && r.tier <= 0 && !r.thread).length).toBeGreaterThanOrEqual(3);
    for (const t of JOURNAL_THREADS) expect(JOURNAL_REWARDS.find((r) => r.id === t.payoff)?.thread).toBe(t.id);
    for (const c of JOURNAL_COMPLICATIONS.filter((x) => x.rival)) expect(c.text).toContain('{rival}');
  });
});

describe('journal variety', () => {
  it('won’t deal a faction a context, catalyst or complication it saw lately', () => {
    const c = campaign();
    const fs = forces();
    const seen: string[][] = [];
    for (let round = 2; round < 2 + JOURNAL.avoid.ctx; round++) {
      c.round = round;
      const j = dealJournal(c, 'A', fs, Math.random, `j${round}`, '2026-10-21')!;
      seen.push([j.context, j.catalyst]);
      j.picked = 0; // finished, so the next round deals again
    }
    expect(new Set(seen.map((x) => x[0])).size).toBe(seen.length);
    expect(new Set(seen.map((x) => x[1])).size).toBe(seen.length);
    expect(c.factions[0].journalSeen!.length).toBeLessThanOrEqual(JOURNAL.seenKeep);
  });

  it('suits the context to the sector the detachment stands in', () => {
    const c = campaign();
    const homes = JOURNAL_CONTEXTS.filter((x) => x.types?.includes('home'));
    expect(homes.length).toBeGreaterThan(0);
    let hits = 0;
    for (let i = 0; i < 40; i++) {
      const cc = { ...c, journals: [], factions: c.factions.map((f) => ({ ...f, journalSeen: [] })) };
      const j = dealJournal(cc, 'A', forces(), Math.random, `j${i}`, '2026-10-21')!;
      const ctx = JOURNAL_CONTEXTS.find((x) => x.id === j.context)!;
      if (!ctx.types || ctx.types.includes('home') || ctx.types.includes('empty')) hits++;
    }
    expect(hits).toBe(40);
  });

  it('a twist is one more check after the climax, and a failed one costs an ending', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = dealJournal(c, 'A', fs, calm(), 'j1', '2026-10-21')!;
    j.twist = { id: JOURNAL_TWISTS[0].id };
    j.approach = { id: 'a', roll: pass };
    j.choice = { id: 'b', roll: pass };
    expect(rollTwist(j, JOURNAL_TWISTS[0].skills[0], u, 1, () => 0)).toBe(false); // not before the climax
    j.climax = pass;
    expect(checksDone(j)).toBe(false);
    expect(rollTwist(j, 'command', u, 1, () => 0.99)).toBe(JOURNAL_TWISTS[0].skills.includes('command'));
    delete j.twist.roll;
    expect(rollTwist(j, JOURNAL_TWISTS[0].skills[0], u, 1, () => 0)).toBe(true); // rolls a 1
    expect(checksDone(j)).toBe(true);
    expect(successes(j)).toBe(3);
    expect(minNothing(j)).toBe(2);
    j.twist.roll = pass;
    expect(successes(j)).toBe(4);
    expect(tierCap(j)).toBe(3);
    expect(minNothing(j)).toBe(1);
  });

  it('a rival Warlord gets their name in the scene', () => {
    const c = campaign();
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      c.journals = [];
      const j = dealJournal(c, 'A', forces(), Math.random, `j${i}`, '2026-10-21')!;
      if (j.rival) {
        expect(j.rival).toEqual({ factionId: 'B', name: 'Kor' });
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it('the GM can only frame a rival beat when there is a rival', () => {
    const c = campaign();
    const j = dealJournal(c, 'A', forces(), calm(), 'j1', '2026-10-21')!;
    delete j.rival;
    const rival = JOURNAL_COMPLICATIONS.find((x) => x.rival)!;
    expect(reframeJournal(j, { complication: rival.id })).toBe(false);
    expect(journalText(j, '{rival} waits')).toBe('a rival Warlord waits');
    j.rival = { factionId: 'B', name: 'Kor' };
    expect(reframeJournal(j, { complication: rival.id })).toBe(true);
    expect(journalText(j, '{rival} waits')).toBe('Kor waits');
  });

  it('a story thread comes back, and its last beat always offers the payoff', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    c.factions[0].thread = { id: 'map', step: 1, since: 1 };
    const j = dealJournal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!; // rand 0: the thread comes back
    expect(j.thread).toMatchObject({ id: 'map', step: 2, last: true });
    expect(requiredReward(j)).toBe('threadMap');
    delete j.twist;
    j.approach = { id: 'a', roll: fail };
    j.climax = fail;
    expect(eligibleRewards(j, u, fs).some((r) => r.id === 'threadMap')).toBe(true); // over the cap, but due
    expect(eligibleRewards(j, u, fs).some((r) => r.thread && r.id !== 'threadMap')).toBe(false);
    const offer = localOffer(j, u, fs, () => 0.5);
    expect(offer).toContain('threadMap');
    expect(validOffer(j, u, fs, offer)).toBe(true);
    expect(validOffer(j, u, fs, [...offer.filter((x) => x !== 'threadMap'), eligibleRewards(j, u, fs).find((r) => !offer.includes(r.id))!.id])).toBe(false);
    expect(makeOffer(j, offer.map((rewardId) => ({ rewardId })), 'tables', u, fs, () => 0, ids())).toBe(true);
    pickOption(c, 'j1', offer.indexOf('threadMap'), fs, '2026-10-21');
    expect(c.factions[0].thread).toBeUndefined();
    expect(c.factions[0].journalSeen).toContain('rew:threadMap');
  });

  it('tells Claude about the twist, rival, thread, sector and recent endings', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    c.factions[0].thread = { id: 'map', step: 1, since: 1 };
    c.factions[0].journalSeen = ['rew:salvage1'];
    const j = dealJournal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.twist = { id: JOURNAL_TWISTS[0].id, roll: pass };
    j.rival = { factionId: 'B', name: 'Kor' };
    j.approach = { id: 'a', roll: pass };
    j.climax = pass;
    const r = journalRequest(c, j, u, fs);
    expect(r.warlordRules).toEqual(['Hero', 'Fearless', 'Tough(3)']);
    expect(r.sector).toBe('A Home (home)');
    expect(r.steps).toHaveLength(4);
    expect(r.steps[3].label).toContain(JOURNAL_TWISTS[0].name);
    expect(r.scene.rival).toBe('Kor, Warlord of Bravo');
    expect(r.scene.thread).toContain('The star-chart');
    expect(r.required).toBe('threadMap');
    expect(r.rewards.some((x) => x.id === 'threadMap')).toBe(true);
    expect(JSON.stringify(r)).not.toContain('{rival}');
  });

  it('marks: an order mark changes the next move, a quirk stays, and the GM can strike one off', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const base = moveOf(c, fs[0]).move;
    const j = dealJournal(c, 'A', fs, calm(), 'j1', '2026-10-21')!;
    delete j.twist; delete j.thread; delete j.rival;
    j.approach = { id: 'a', roll: pass };
    j.choice = { id: 'b', roll: pass };
    j.climax = pass;
    const picks = ['deepCurrent', 'cursedGround', 'livingLegend', 'paranoia'];
    expect(makeOffer(j, picks.map((rewardId) => ({ rewardId })), 'tables', u, fs, () => 0, ids())).toBe(true);
    pickOption(c, 'j1', 0, fs, '2026-10-21');
    const marks = activeMarks(c, 'A', 2);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ kind: 'order', move: 2, forceId: 'fA', until: 3 });
    expect(moveOf(c, fs[0]).move).toBe(base + 2);
    expect(activeMarks(c, 'A', 4)).toHaveLength(0);
    expect(dropMark(c, 'A', marks[0].id)).toBe(true);
    expect(moveOf(c, fs[0]).move).toBe(base);
  });

  it('a Warlord carries three quirks at most', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    for (let i = 0; i < 4; i++) {
      c.round = 2 + i;
      const j = dealJournal(c, 'A', fs, calm(), `j${i}`, '2026-10-21')!;
      delete j.twist; delete j.thread; delete j.rival;
      j.approach = { id: 'a', roll: pass };
      j.choice = { id: 'b', roll: pass };
      j.climax = pass;
      expect(makeOffer(j, ['livingLegend', 'paranoia', 'cursedGround', 'deepCurrent'].map((rewardId) => ({ rewardId })), 'tables', u, fs, () => 0, ids())).toBe(true);
      pickOption(c, `j${i}`, 0, fs, '2026-10-21');
    }
    expect(c.factions[0].marks!.filter((m) => m.kind === 'quirk')).toHaveLength(3);
  });
});
