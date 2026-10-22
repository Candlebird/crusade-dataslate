import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import {
  canReroll, checkTarget, chooseComplication, dealJournal, eligibleRewards, journalBlock, journalOf, journalStatus, journalsOwed, localOffer, makeOffer,
  payJournal, pickOption, reframeJournal, rerollCheck, rewardById, rollApproach, rollClimax, successes, tierCap, validOffer,
} from './journal';
import { JOURNAL_REWARDS } from './journalData';

// Crossroads Journal: a Warlord's vignette, its checks, the endings offered and what picking one pays out.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2, threat: 3,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00', research: 1, warlord: { forceId: 'fA', unitId: 'w', name: 'Vex', level: 1, since: 1 } },
      { id: 'B', name: 'Bravo', player: '', color: '#00f' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', bank: 10, notes: '', q: 0, r: 0 },
      { id: 'near', name: 'Near', type: 'empty', notes: '', q: 9, r: 0 },
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

/** A plain journal: no twist, rival or story thread (with rand() 0 they'd always come). */
const deal = (...a: Parameters<typeof dealJournal>) => {
  const j = dealJournal(...a);
  if (j) { delete j.twist; delete j.thread; delete j.rival; }
  return j;
};

const ids = () => { let n = 0; return () => `id${n++}`; };
const seq = (...xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
/** A rand() that rolls this face on a D6. */
const face = (n: number) => (n - 1) / 6 + 0.01;

describe('crossroads journal', () => {
  it('deals one journal a round, to a faction with a Warlord', () => {
    const c = campaign();
    const fs = forces();
    expect(journalBlock(c, 'B')).toMatch(/no Warlord/);
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    expect(j).toMatchObject({ factionId: 'A', round: 2, forceId: 'fA', unitId: 'w', warlord: 'Vex' });
    expect(journalStatus(j)).toBe('play');
    expect(deal(c, 'A', fs, () => 0, 'j2', '2026-10-21')).toBeUndefined();
  });

  it('checks a skill against the stat, with special rules helping', () => {
    const u = forces()[0].units[0];
    expect(checkTarget(u, 'resolve', 1)).toBe(2); // Q4, Fearless + Hero
    expect(checkTarget(u, 'might', 1)).toBe(3); // Tough(3)
    expect(checkTarget(u, 'endurance', 1)).toBe(4); // Tough(3) is not Tough(6)
    expect(checkTarget(u, 'command', 1)).toBe(4);
    expect(checkTarget(u, 'command', 3)).toBe(3);
    expect(checkTarget(u, 'lore', 1, 1)).toBe(5);
  });

  it('lets the GM reframe it only before the first roll', () => {
    const c = campaign();
    const fs = forces();
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    expect(reframeJournal(j, { catalyst: 'derelictSignal', note: 'The beacon calls your name.' })).toBe(true);
    expect(reframeJournal(j, { catalyst: 'nope' })).toBe(false);
    rollApproach(j, 'decode', fs[0].units[0], 1, () => face(6));
    expect(reframeJournal(j, { note: 'Too late' })).toBe(false);
    expect(j.note).toBe('The beacon calls your name.');
  });

  it('runs the checks in order; a failed risky choice makes the climax harder', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    reframeJournal(j, { catalyst: 'derelictSignal', complication: 'clock' });
    expect(rollClimax(j, 'might', u, 1, () => face(6))).toBe(false);
    expect(rollApproach(j, 'board', u, 1, () => face(5))).toBe(true);
    expect(j.approach!.roll).toMatchObject({ skill: 'might', target: 3, pass: true });
    expect(chooseComplication(j, 'push', u, 1, () => face(1))).toBe(true);
    expect(j.choice!.roll!.pass).toBe(false);
    expect(rollClimax(j, 'resolve', u, 1, () => face(6))).toBe(false); // not one of its climax skills
    expect(rollClimax(j, 'might', u, 1, () => face(3))).toBe(true);
    expect(j.climax).toMatchObject({ target: 4, pass: false });
    expect(canReroll(j, 'climax')).toBe(true);
    expect(rerollCheck(j, 'climax', () => face(4))).toBe(true);
    expect(j.climax).toMatchObject({ rolls: [3, 4], pass: true });
    expect(canReroll(j, 'climax')).toBe(false);
    expect(successes(j)).toBe(2);
    expect(tierCap(j)).toBe(2);
  });

  it('offers four rewards up to the cap, with at least one bad one', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    reframeJournal(j, { catalyst: 'derelictSignal', complication: 'clock' });
    rollApproach(j, 'board', u, 1, () => face(1));
    chooseComplication(j, 'cut', u, 1, () => face(1));
    rollClimax(j, 'might', u, 1, () => face(1));
    expect(tierCap(j)).toBe(1);
    expect(eligibleRewards(j, u, fs).every((r) => r.tier <= 1)).toBe(true);
    const offer = localOffer(j, u, fs, seq(0.3, 0.7));
    expect(new Set(offer).size).toBe(4);
    expect(offer.filter((id) => rewardById(id)!.tier <= 0).length).toBeGreaterThanOrEqual(2); // a total failure
    expect(validOffer(j, u, fs, offer)).toBe(true);
    expect(validOffer(j, u, fs, ['foundryCore', ...offer.slice(1)])).toBe(false); // over the cap
    expect(validOffer(j, u, fs, ['scrapHaul', 'fieldNotes', 'splinters', 'renown'])).toBe(false); // nothing bad
  });

  it('never offers a scar to a Warlord one scar from death', () => {
    const fs = forces();
    const u = fs[0].units[0];
    u.scars = [{ id: 's1', name: 'a' }, { id: 's2', name: 'b' }, { id: 's3', name: 'c' }];
    const c = campaign();
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.approach = { id: 'board', roll: { skill: 'might', target: 3, rolls: [6], pass: true } };
    j.climax = { skill: 'might', target: 3, rolls: [6], pass: true };
    expect(eligibleRewards(j, u, fs).some((r) => r.effects.some((e) => e.kind === 'scar'))).toBe(false);
  });

  it('applies the campaign effects on pick and the Warlord ones to its force', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.approach = { id: 'board', roll: { skill: 'might', target: 3, rolls: [6], pass: true } };
    j.choice = { id: 'push', roll: { skill: 'speed', target: 4, rolls: [6], pass: true } };
    j.climax = { skill: 'might', target: 3, rolls: [6], pass: true };
    const picks = ['spyNetwork', 'voidBargain', 'heirloom', 'openWound'].map((rewardId) => ({ rewardId, title: `T ${rewardId}`, text: 'x' }));
    expect(makeOffer(j, picks, 'claude', u, fs, () => 0, ids())).toBe(true);
    expect(journalStatus(j)).toBe('offer');
    expect(j.options![2].relic?.tier).toBe('Rare');
    expect(j.options![3].scar?.name).toBeTruthy();

    // A spy network: Research now, and the nearest unseen sectors.
    const line = pickOption(c, 'j1', 0, fs, '2026-10-22');
    expect(line).toMatch(/\+2 Research/);
    expect(c.factions[0].research).toBe(3);
    expect(c.explored!.A).toEqual(expect.arrayContaining(['near', 'far']));
    expect(journalStatus(j)).toBe('done');
    expect(pickOption(c, 'j1', 1, fs, '2026-10-22')).toBeUndefined();
    expect(journalsOwed(c, fs[0])).toEqual([]); // nothing for the force

    // A bargain with the void: threat now, Umbra Shards on the force.
    const k = { ...j, id: 'j2', picked: undefined, pickedOn: undefined };
    c.journals!.push(k);
    pickOption(c, 'j2', 1, fs, '2026-10-22');
    expect(c.threat).toBe(4);
    expect(journalsOwed(c, fs[0]).map((x) => x.id)).toEqual(['j2']);
    expect(payJournal(k, fs[0], '2026-10-22', ids())).toMatch(/\+5 Umbra Shards/);
    expect(fs[0].umbraShards).toBe(8);
    expect(payJournal(k, fs[0], '2026-10-22', ids())).toBeUndefined();

    // A wound: the scar drawn when offered.
    const w = { ...j, id: 'j3', picked: undefined, pickedOn: undefined };
    c.journals!.push(w);
    pickOption(c, 'j3', 3, fs, '2026-10-22');
    payJournal(w, fs[0], '2026-10-22', ids());
    expect(u.scars.map((s) => s.name)).toEqual([j.options![3].scar!.name]);
  });

  it('takes lost Materials and Umbra Shards only as far as there are any', () => {
    const c = campaign();
    const fs = forces();
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.options = [{ rewardId: 'raided', title: 'Raided', text: '' }, { rewardId: 'shardDrain', title: 'Drained', text: '' }];
    expect(pickOption(c, 'j1', 0, fs, '2026-10-22')).toMatch(/−10 Materials/);
    expect(c.sectors[0].bank).toBeUndefined();
    const k = { ...j, id: 'j2', picked: undefined };
    c.journals!.push(k);
    pickOption(c, 'j2', 1, fs, '2026-10-22');
    fs[0].umbraShards = 1;
    expect(payJournal(k, fs[0], '2026-10-22', ids())).toMatch(/−1 Umbra Shards/);
    expect(fs[0].umbraShards).toBe(0);
  });

  it("keeps an unfinished journal from an earlier round in play, and no new one is dealt until it's done", () => {
    const c = campaign();
    const fs = forces();
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    c.round = 3;
    expect(journalOf(c, 'A')).toBe(j);
    expect(journalBlock(c, 'A')).toMatch(/finish/);
    j.options = [{ rewardId: 'renown', title: 'R', text: '' }];
    pickOption(c, 'j1', 0, fs, '2026-10-22');
    expect(journalOf(c, 'A')).toBeUndefined();
    expect(journalBlock(c, 'A')).toBeUndefined();
  });

  it("won't re-roll the complication once the climax it made harder is rolled", () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    reframeJournal(j, { catalyst: 'derelictSignal', complication: 'clock' });
    rollApproach(j, 'board', u, 1, () => face(5));
    chooseComplication(j, 'push', u, 1, () => face(1));
    expect(canReroll(j, 'choice')).toBe(true);
    rollClimax(j, 'might', u, 1, () => face(1));
    expect(canReroll(j, 'choice')).toBe(false);
    expect(canReroll(j, 'climax')).toBe(true);
  });

  it('never gives shards back to a force that is somehow below zero', () => {
    const c = campaign();
    const fs = forces();
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.options = [{ rewardId: 'shardDrain', title: 'Drained', text: '' }];
    pickOption(c, 'j1', 0, fs, '2026-10-22');
    fs[0].umbraShards = -2;
    payJournal(j, fs[0], '2026-10-22', ids());
    expect(fs[0].umbraShards).toBe(-2);
  });

  it('keeps finished journals the force may still have to collect for longer', () => {
    const c = campaign();
    const fs = forces();
    c.journals = [];
    for (let i = 0; i < 30; i++) {
      c.journals.push({ id: `o${i}`, factionId: 'A', round: 1, date: '', forceId: 'fA', unitId: 'w', warlord: 'Vex', context: 'x', catalyst: 'x', complication: 'x', options: [{ rewardId: 'voidBargain', title: '', text: '' }], picked: 0 });
      c.journals.push({ id: `n${i}`, factionId: 'A', round: 1, date: '', forceId: 'fA', unitId: 'w', warlord: 'Vex', context: 'x', catalyst: 'x', complication: 'x', options: [{ rewardId: 'spyNetwork', title: '', text: '' }], picked: 0 });
    }
    const j = deal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
    j.options = [{ rewardId: 'renown', title: 'R', text: '' }];
    pickOption(c, 'j1', 0, fs, '2026-10-22');
    expect(c.journals.filter((x) => x.id.startsWith('o')).length).toBe(30); // owed: all kept (under keepOwed)
    expect(c.journals.filter((x) => !x.id.startsWith('o')).length).toBe(13); // the newest 24: j1 and 12 of the others
    expect(c.journals.some((x) => x.id === 'j1')).toBe(true);
  });

  it('has reward ids that are unique', () => {
    expect(new Set(JOURNAL_REWARDS.map((r) => r.id)).size).toBe(JOURNAL_REWARDS.length);
  });
});
