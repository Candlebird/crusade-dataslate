import { describe, expect, it } from 'vitest';
import { newForce, newUnit, uid } from '../model/factory';
import type { Bounty, Campaign, CampaignEvent, Force } from '../model/types';
import {
  bountiesOwed, bountyHit, bountyText, claimBounties, dealBounty, fillBoard, holdBounties, payBounty, refreshBounties,
  regenerate, retarget, rewardWorth, rollRewards, setDifficulty, targets,
} from './bounties';
import { rng } from './hexmap';
import { emptyNexus } from './nexus';
import { STANDARD_MISSION } from './missions';
import { BOUNTY } from './nexusData';
import type { FinishedBattle } from './tracker';

// The GM's Bounty Board (Nexus Wars): bounties dealt from a pool, claimed by games in the log, paid out on their own.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00' },
      { id: 'B', name: 'Bravo', player: '', color: '#0f0' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 0 },
      { id: 'ai', name: 'Echo World', type: 'planet', owner: 'ai', notes: '', q: 5, r: 0 },
      { id: 'deep', name: 'Deep Space', type: 'anomaly', notes: '', q: 6, r: 0 },
      { id: 'void', name: 'The Maw', type: 'voidspawn', owner: 'ai', notes: '', q: 7, r: 0 },
    ],
    marauders: [{ id: 'm1', name: 'Red Fangs', sectorId: 'deep', strength: 100, since: 1 }],
    log: [],
  };
}

function force(factionId: string, hero = false): Force {
  const f = newForce(`${factionId} force`);
  f.nexus = emptyNexus(factionId);
  f.units.push(newUnit({ id: `${factionId}-u`, name: 'Grunts' }));
  if (hero) f.units.push(newUnit({ id: `${factionId}-h`, name: 'Boss', category: 'Hero' }));
  return f;
}

const game = (over: Partial<CampaignEvent>): CampaignEvent =>
  ({ id: 'g', date: '2026-10-21', sectorId: 'ai', attacker: 'A', defender: 'ai', winner: 'A', notes: '', round: 2, ...over });

const bounty = (over: Partial<Bounty>): Bounty => ({ id: 'b', kind: 'take', difficulty: 1, sectorId: 'ai', rewards: [], round: 2, ...over });

describe('rollRewards', () => {
  it('pays about the difficulty budget, in whole steps, with distinct kinds', () => {
    for (let seed = 0; seed < 50; seed++) {
      for (const d of [1, 2, 3]) {
        const rewards = rollRewards(d, rng(`r${seed}`));
        expect(rewards.length).toBeGreaterThan(0);
        expect(rewards.length).toBeLessThanOrEqual(BOUNTY.maxRewards);
        expect(new Set(rewards.map((r) => r.kind)).size).toBe(rewards.length);
        const total = rewards.reduce((s, r) => s + rewardWorth(r), 0);
        expect(total).toBeGreaterThan(BOUNTY.budget[d] * 0.5);
        expect(total).toBeLessThan(BOUNTY.budget[d] * 1.6 + 1);
        for (const r of rewards) if (r.kind === 'materials') expect(r.n % 25).toBe(0);
      }
    }
  });
});

describe('targets', () => {
  it('finds what each kind can aim at', () => {
    const c = campaign();
    expect(targets(c, 'band').map((t) => t.key)).toEqual(['m1']);
    expect(targets(c, 'hold').map((t) => t.key)).toEqual(['ai', 'deep']);
    expect(targets(c, 'take').map((t) => [t.key, t.difficulty])).toEqual([['pA', 2], ['ai', 1]]);
    expect(targets(c, 'void').map((t) => t.key)).toEqual(['void']);
    expect(targets(c, 'guardian')).toEqual([]);
    expect(targets(c, 'topple')[0]).toMatchObject({ key: 'A', difficulty: 3 });
  });
});

describe('the board', () => {
  it('fills five slots with different kinds, and regenerates one', () => {
    const c = campaign();
    let n = 0;
    const posted = fillBoard(c, rng('fill'), () => `b${n++}`);
    expect(posted).toHaveLength(BOUNTY.slots);
    expect(new Set(c.bounties!.map((b) => b.kind)).size).toBe(BOUNTY.slots);
    expect(c.bounties!.every((b) => b.round === 2 && b.rewards.length)).toBe(true);
    const hold = c.bounties!.find((b) => b.kind === 'hold');
    if (hold) expect(hold.rounds).toBe(BOUNTY.holdRounds[hold.difficulty]);

    expect(regenerate(c, 0, rng('x'), () => 'new', 'void')).toBe(true);
    expect(c.bounties![0]).toMatchObject({ id: 'new', kind: 'void', sectorId: 'void', difficulty: 3 });
  });

  it('skips games already in the log when posted', () => {
    const c = campaign();
    c.log = [game({ id: 'old' })];
    expect(dealBounty(c, rng('s'), 'b', 'take')!.skip).toEqual(['old']);
  });

  it('lets the GM retarget and change the difficulty', () => {
    const c = campaign();
    c.bounties = [bounty({ kind: 'hold', sectorId: 'deep', rounds: 1 })];
    retarget(c, 0, 'ai');
    expect(c.bounties[0].sectorId).toBe('ai');
    setDifficulty(c, 0, 3, rng('d'));
    expect(c.bounties[0]).toMatchObject({ difficulty: 3, rounds: BOUNTY.holdRounds[3] });
    expect(c.bounties[0].rewards.length).toBeGreaterThan(0);
  });

  it('tells the bounty in words', () => {
    const c = campaign();
    expect(bountyText(c, bounty({ kind: 'hold', sectorId: 'deep', rounds: 2 }))).toBe('Hold Deep Space through 2 round ends.');
    expect(bountyText(c, bounty({ kind: 'band', bandName: 'Red Fangs' }))).toBe('Beat Red Fangs in a Marauder game.');
  });
});

describe('claiming', () => {
  it('claims a take with a won attack on the sector, not a skipped or earlier one', () => {
    const c = campaign();
    const b = bounty({ skip: ['old'] });
    c.bounties = [b];
    c.log = [game({ id: 'old' }), game({ id: 'early', round: 1 }), game({ id: 'lost', winner: 'ai' })];
    expect(bountyHit(c, b)).toBeUndefined();
    c.log.push(game({ id: 'won' }));
    expect(bountyHit(c, b)!.event.id).toBe('won');
  });

  it('claims a band hunt and a topple', () => {
    const c = campaign();
    c.log = [game({ id: 'm', marauder: c.marauders![0], defender: 'marauders', sectorId: 'deep' }), game({ id: 't', attacker: 'B', defender: 'A', winner: 'B', sectorId: 'pA' })];
    expect(bountyHit(c, bounty({ kind: 'band', bandId: 'm1' }))!.event.id).toBe('m');
    expect(bountyHit(c, bounty({ kind: 'topple', factionId: 'A' }))!.event.id).toBe('t');
    expect(bountyHit(c, bounty({ kind: 'topple', factionId: 'B' }))).toBeUndefined();
  });

  it('claims No heroes only for a tracked win without a Hero', () => {
    const c = campaign();
    const plain = force('A');
    const heroic = force('B', true);
    const battle = (id: string, f: Force, units: string[]): FinishedBattle => ({
      id, startedAt: '', finishedAt: '', mission: STANDARD_MISSION, round: 4, control: [], counters: {}, recorded: [],
      sides: [
        { id: 's1', name: f.name, team: 'A', forceId: f.id, bp: 0, vpAdjust: 10, units: units.map((u) => ({ id: u, unitId: u, name: u, destroyed: false, xp: 0 })) },
        { id: 's2', name: 'Echoes', team: 'B', ai: true, bp: 0, vpAdjust: 0, units: [] },
      ],
    } as unknown as FinishedBattle);
    const history = [battle('t1', heroic, ['B-u', 'B-h']), battle('t2', plain, ['A-u'])];
    c.log = [game({ id: 'g1', attacker: 'B', winner: 'B', battleId: 't1' }), game({ id: 'g2', battleId: 't2' })];
    const hit = bountyHit(c, bounty({ kind: 'noHero' }), history, [plain, heroic]);
    expect(hit).toMatchObject({ event: { id: 'g2' }, forceId: plain.id });
  });

  it('pays the faction at once and the force through its owner', () => {
    const c = campaign();
    const f = force('A', true);
    c.bounties = [bounty({ rewards: [{ kind: 'research', n: 2 }, { kind: 'shards', n: 3 }, { kind: 'relic', tier: 'Common' }] })];
    c.log = [game({ id: 'won', forceId: f.id })];
    const lines = claimBounties(c, [], [f], '2026-10-23');
    expect(lines).toHaveLength(1);
    expect(c.factions[0].research).toBe(2);
    expect(c.bounties[0].claimed).toMatchObject({ factionId: 'A', forceId: f.id, eventId: 'won' });
    expect(claimBounties(c, [], [f], '2026-10-23')).toEqual([]);

    expect(bountiesOwed(c, f)).toHaveLength(1);
    const preview = payBounty(c, c.bounties[0], structuredClone(f), '2026-10-23', () => '');
    expect(payBounty(c, c.bounties[0], f, '2026-10-23', () => 'id')).toBe(preview);
    expect(f.umbraShards).toBe(3);
    expect(f.units.find((u) => u.id === 'A-h')!.relics).toHaveLength(1);
    expect(bountiesOwed(c, f)).toEqual([]);
    expect(payBounty(c, c.bounties[0], f, '2026-10-23', () => 'id')).toBeUndefined();
  });
});

describe('round end', () => {
  it('counts a hold, starts over when the owner changes, and claims when done', () => {
    const c = campaign();
    const b = bounty({ kind: 'hold', sectorId: 'deep', rounds: 2, rewards: [{ kind: 'cores', n: 1 }] });
    c.bounties = [b];
    expect(holdBounties(c, { A: ['deep'] }, 2, [], 'd')).toEqual([]);
    expect(b.holder).toEqual({ factionId: 'A', ends: 1 });
    holdBounties(c, { B: ['deep'] }, 3, [], 'd');
    expect(b.holder).toEqual({ factionId: 'B', ends: 1 });
    expect(holdBounties(c, { B: ['deep'] }, 4, [], 'd')).toHaveLength(1);
    expect(b.claimed?.factionId).toBe('B');
    expect(c.factions[1].cores).toBe(1);
  });

  it('replaces claimed bounties and ones whose target is gone', () => {
    const c = campaign();
    c.bounties = [
      bounty({ id: 'done', claimed: { factionId: 'A', round: 2, date: 'd' } }),
      bounty({ id: 'gone', kind: 'band', bandId: 'nope' }),
      bounty({ id: 'keep', kind: 'void', sectorId: 'void' }),
    ];
    let n = 0;
    refreshBounties(c, rng('f'), () => `n${n++}`);
    expect(c.bounties).toHaveLength(BOUNTY.slots);
    expect(c.bounties[0].id).toBe('keep');
    expect(c.bounties.map((b) => b.id)).not.toContain('done');
  });
});

describe('claimed bounties off the board', () => {
  it('are still paid to their force', () => {
    const c = campaign();
    const f = force('A');
    c.bounties = [bounty({ id: 'done', rewards: [{ kind: 'shards', n: 2 }], claimed: { factionId: 'A', forceId: f.id, round: 2, date: 'd' } })];
    refreshBounties(c, rng('f'), () => uid());
    expect(c.claimedBounties!.map((b) => b.id)).toEqual(['done']);
    expect(bountiesOwed(c, f).map((b) => b.id)).toEqual(['done']);
  });
});
