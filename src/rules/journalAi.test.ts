import { afterEach, describe, expect, it, vi } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, CrossroadsJournal, Force } from '../model/types';
import { dealJournal, eligibleRewards, localOffer, recentRewards, validOffer } from './journal';
import { fetchOffer, journalEndings, journalRequest, type JournalPick } from './journalAi';

// Crossroads Journal endings by Claude: what the app tells the proxy, and how it checks and trims the reply.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2, threat: 3,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00', warlord: { forceId: 'fA', unitId: 'w', name: 'Vex', level: 1, since: 1 } },
      { id: 'B', name: 'Bravo', player: '', color: '#00f', research: 7, warlord: { forceId: 'fB', unitId: 'wb', name: 'Morgrath', level: 3, since: 1 } },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'hB', name: 'Bravo Citadel', type: 'home', owner: 'B', notes: 'Hidden vault under the citadel', q: 12, r: 0 },
    ],
    log: [],
  };
}

function forces(): Force[] {
  const a: Force = { ...newForce('Alpha Host'), id: 'fA', nexus: { factionId: 'A', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] } };
  a.units = [newUnit({ id: 'w', name: 'Vex', category: 'Hero', quality: 4, defense: 4, rules: ['Hero', 'Fearless', 'Tough(3)'] })];
  const b: Force = { ...newForce('Bravo Secret Host'), id: 'fB', nexus: { factionId: 'B', permanentTables: [], tempTables: [], traitTokens: 0, pending: [] } };
  b.units = [{ ...newUnit({ id: 'wb', name: 'Morgrath', category: 'Hero', rules: ['Hero', 'Ambush'] }), relics: [{ id: 'r', name: 'Crown of Whispers', tier: 'Rare' }] }];
  return [a, b];
}

const pass = { skill: 'might', target: 3, rolls: [6], pass: true };

/** A played-out journal for Alpha with no twist, rival or thread. */
function journal(c: Campaign, fs: Force[]): CrossroadsJournal {
  const j = dealJournal(c, 'A', fs, () => 0, 'j1', '2026-10-21')!;
  delete j.twist; delete j.thread; delete j.rival;
  j.approach = { id: 'a', roll: pass };
  j.climax = pass;
  return j;
}

function reply(options: unknown, ok = true) {
  return vi.fn(async (_url: string, _init?: RequestInit) => ({ ok, json: async () => ({ options }) }) as unknown as Response);
}

afterEach(() => vi.unstubAllGlobals());

describe('journalRequest', () => {
  it('carries the scene, the checks, the limits and the rewards the rules allow', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    const r = journalRequest(c, j, u, fs);
    expect(r.faction).toBe('Alpha');
    expect(r.warlord).toBe('Vex');
    expect(r.warlordRules).toEqual(['Hero', 'Fearless', 'Tough(3)']);
    expect(r.sector).toBe('A Home (home)');
    expect(r.scene.context).toBeTruthy();
    expect(r.scene.catalyst).toBeTruthy();
    expect(r.scene).not.toHaveProperty('twist');
    expect(r.scene).not.toHaveProperty('rival');
    expect(r.scene).not.toHaveProperty('thread');
    expect(r.steps.map((s) => s.label.split(':')[0])).toEqual(['Approach', 'Complication', 'Climax']);
    expect(r.steps[2]).toMatchObject({ target: 3, rolls: [6], pass: true });
    expect(typeof r.successes).toBe('number');
    expect(typeof r.tierCap).toBe('number');
    expect(typeof r.minNothing).toBe('number');
    expect(r.rewards.map((x) => x.id)).toEqual(eligibleRewards(j, u, fs).map((x) => x.id));
    expect(r.rewards.every((x) => x.name && x.desc && typeof x.tier === 'number')).toBe(true);
    expect(r).not.toHaveProperty('required');
  });

  it("tells nothing of another faction's Warlord, forces, relics or sectors", () => {
    const c = campaign();
    const fs = forces();
    const json = JSON.stringify(journalRequest(c, journal(c, fs), fs[0].units[0], fs));
    for (const secret of ['Morgrath', 'Bravo', 'Secret Host', 'Crown of Whispers', 'Citadel', 'Hidden vault', 'Ambush']) expect(json).not.toContain(secret);
  });

  it("names the unit when it differs from the Warlord's name, and caps the rules sent", () => {
    const c = campaign();
    const fs = forces();
    const u = { ...fs[0].units[0], name: 'Vex the Grey', rules: Array.from({ length: 30 }, (_, i) => `Rule${i}`) };
    const r = journalRequest(c, journal(c, fs), u, fs);
    expect(r.warlord).toBe('Vex (Vex the Grey)');
    expect(r.warlordRules).toHaveLength(20);
    expect(r.warlordRules[19]).toBe('Rule19');
  });

  it('leaves out a sector that is gone, and marks the endings the faction had lately', () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    j.sectorId = 'gone';
    const id = eligibleRewards(j, u, fs)[0].id;
    c.factions[0].journalSeen = [`rew:${id}`];
    const r = journalRequest(c, j, u, fs);
    expect(r).not.toHaveProperty('sector');
    expect(recentRewards(c, 'A').has(id)).toBe(true);
    expect(r.rewards.find((x) => x.id === id)!.recent).toBe(true);
    expect(r.rewards.filter((x) => x.recent).map((x) => x.id)).toEqual([id]);
  });
});

describe('fetchOffer', () => {
  it("posts the request to the proxy's /journal route and returns its options", async () => {
    const options = [{ rewardId: 'x' }];
    const f = reply(options);
    vi.stubGlobal('fetch', f);
    const req = journalRequest(campaign(), journal(campaign(), forces()), forces()[0].units[0], forces());
    expect(await fetchOffer('https://proxy.example/', req)).toEqual(options);
    expect(f.mock.calls[0][0]).toBe('https://proxy.example/journal');
    expect(f.mock.calls[0][1]).toMatchObject({ method: 'POST' });
    expect(JSON.parse(f.mock.calls[0][1]!.body as string)).toEqual(req);
  });

  it('gives up on an error status, a reply without options, or no connection', async () => {
    const req = journalRequest(campaign(), journal(campaign(), forces()), forces()[0].units[0], forces());
    vi.stubGlobal('fetch', reply([{ rewardId: 'x' }], false));
    expect(await fetchOffer('p', req)).toBeUndefined();
    vi.stubGlobal('fetch', reply('nope'));
    expect(await fetchOffer('p', req)).toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect(await fetchOffer('p', req)).toBeUndefined();
  });
});

describe('journalEndings', () => {
  it("uses Claude's endings when they hold up, trimming long titles and texts", async () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    const offer = localOffer(j, u, fs, () => 0.5);
    expect(validOffer(j, u, fs, offer)).toBe(true);
    const picks: unknown[] = offer.map((rewardId, i) => ({ rewardId, title: 'T'.repeat(200), text: i === 0 ? 'x'.repeat(2000) : 'short', extra: 'drop me' }));
    picks[1] = { rewardId: offer[1], title: 42 };
    vi.stubGlobal('fetch', reply(picks));
    const out = await journalEndings('p', c, j, u, fs, () => 0.5);
    expect(out.source).toBe('claude');
    expect(out.picks.map((p) => p.rewardId)).toEqual(offer);
    expect(out.picks[0].title).toHaveLength(80);
    expect(out.picks[0].text).toHaveLength(600);
    expect(out.picks[2].text).toBe('short');
    expect(out.picks[1]).toEqual({ rewardId: offer[1], title: undefined, text: undefined });
    expect(out.picks[0]).not.toHaveProperty('extra');
  });

  it("falls back to the tables when Claude picks a reward the rules don't allow", async () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    const offer = localOffer(j, u, fs, () => 0.5);
    const bad: JournalPick[] = [{ rewardId: 'notAReward', title: 'Nope' }, ...offer.slice(1).map((rewardId) => ({ rewardId }))];
    vi.stubGlobal('fetch', reply(bad));
    const out = await journalEndings('p', c, j, u, fs, () => 0.5);
    expect(out.source).toBe('tables');
    expect(out.picks.map((p) => p.rewardId)).toEqual(localOffer(j, u, fs, () => 0.5, recentRewards(c, 'A')));
    expect(out.picks.every((p) => p.title === undefined && p.text === undefined)).toBe(true);
    expect(validOffer(j, u, fs, out.picks.map((p) => p.rewardId))).toBe(true);
  });

  it('falls back to the tables when the reply is malformed, rather than failing', async () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    const offer = localOffer(j, u, fs, () => 0.5);
    vi.stubGlobal('fetch', reply([null, ...offer.slice(1).map((rewardId) => ({ rewardId }))]));
    const out = await journalEndings('p', c, j, u, fs, () => 0.5);
    expect(out.source).toBe('tables');
    expect(out.picks).toHaveLength(4);
  });

  it('falls back to the tables when the proxy cannot be reached', async () => {
    const c = campaign();
    const fs = forces();
    const u = fs[0].units[0];
    const j = journal(c, fs);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const out = await journalEndings('p', c, j, u, fs, () => 0.5);
    expect(out.source).toBe('tables');
    expect(out.picks).toHaveLength(4);
  });
});
