import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign } from '../model/types';
import { emptyUnitBattle, resolveBattle, rewardRows, type BattleInput } from './battle';
import { REWARD_TABLES } from './data';
import { ECHOES, emptyNexus, homeChallengeBlock, nexusAccess, nexusGeneration, recordSectorGame, removeSectorGame } from './nexus';

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', benefit: 'largeShardMine', owner: 'A', notes: '' },
      { id: 'hB', name: 'B Home', type: 'home', benefit: 'biomassPool', owner: 'B', notes: '' },
      { id: 'p1', name: 'Planet 1', type: 'planet', benefit: 'shardMine', owner: 'A', notes: '' },
      { id: 'p2', name: 'Planet 2', type: 'planet', benefit: 'spacePort', owner: 'B', notes: '' },
      { id: 'an', name: 'Rift', type: 'anomaly', owner: 'A', notes: '' },
      { id: 'v', name: 'Hulk', type: 'void', notes: '' },
    ],
    log: [],
  };
}

const kinds = (ctx: ReturnType<typeof nexusGeneration>) => ctx.items.map((i) => `${i.key}:${i.kind}`);

describe('nexus generation', () => {
  it('pays a match bonus after any match; sector income is paid per round instead', () => {
    expect(kinds(nexusGeneration(campaign(), 'A', '', 'loss', false))).toEqual(['matchBonus:matchBonus']);
    expect(kinds(nexusGeneration(campaign(), undefined, '', 'win', false))).toEqual([]);
  });

  it('notes the Strategic Asset a skirmish win earns, and a patrol against the AI', () => {
    const c = campaign();
    expect(nexusGeneration(c, 'A', '', 'win', true).notes).toEqual([
      expect.stringContaining('+1 Strategic Asset for Alpha'),
      expect.stringContaining('patrol'),
    ]);
    expect(nexusGeneration(c, 'A', '', 'loss', false).notes).toEqual([]);
    for (const id of ['s1', 's2']) recordSectorGame(c, { id, date: '', sectorId: '', attacker: 'A', defender: 'B', winner: 'A', notes: '', skirmish: true });
    expect(nexusGeneration(c, 'A', '', 'win', false).notes).toEqual([expect.stringContaining('already has its 2')]);
  });

  it('gives the void reward for beating the AI there, once', () => {
    const c = campaign();
    expect(kinds(nexusGeneration(c, 'A', 'v', 'win', true))).toContain('void:void');
    expect(kinds(nexusGeneration(c, 'A', 'v', 'loss', true))).not.toContain('void:void');
    c.sectors[5].rewardClaimed = true;
    expect(kinds(nexusGeneration(c, 'A', 'v', 'win', true))).not.toContain('void:void');
  });

  it('forfeits benefits for losing a home challenge and grants the loser\'s benefits once for winning one', () => {
    const lost = nexusGeneration(campaign(), 'A', 'hB', 'loss', false);
    expect(lost.items).toEqual([]);
    expect(lost.notes[0]).toMatch(/forfeited/);
    const won = nexusGeneration(campaign(), 'A', 'hB', 'win', false);
    expect(kinds(won)).toEqual(['conquest:hB:supply', 'conquest:p2:manipulation', 'matchBonus:matchBonus']);
  });

  it('pays the defender of a home sector the challenger\'s income too', () => {
    const c = campaign();
    const held = nexusGeneration(c, 'B', 'hB', 'win', false, 'A');
    expect(kinds(held)).toEqual(['conquest:hA:us', 'conquest:p1:shardRoll', 'conquest:an:anomaly', 'matchBonus:matchBonus']);
    // Without the opponent, the challenger comes from this round's log.
    expect(kinds(nexusGeneration(c, 'B', 'hB', 'win', false))[0]).toBe('matchBonus:matchBonus');
    recordSectorGame(c, { id: 'g', date: '', sectorId: 'hB', attacker: 'A', defender: 'B', winner: 'B', notes: '' });
    expect(kinds(nexusGeneration(c, 'B', 'hB', 'win', false))[0]).toBe('conquest:hA:us');
  });

  it('pays a bounty for retaking a sector from the Echoes', () => {
    const c = campaign();
    c.sectors[3].owner = ECHOES.id;
    expect(nexusGeneration(c, 'A', 'p2', 'win', true).bounty).toBe(true);
    expect(nexusGeneration(c, 'A', 'p2', 'loss', true).bounty).toBeUndefined();
    // Still a bounty once the game is logged (the sector is now theirs).
    recordSectorGame(c, { id: 'g', date: '', sectorId: 'p2', attacker: 'A', defender: ECHOES.id, winner: 'A', notes: '' });
    expect(nexusGeneration(c, 'A', 'p2', 'win', true).bounty).toBe(true);
    expect(nexusGeneration(c, 'A', 'p1', 'win', true).bounty).toBeUndefined();
  });

  it('blocks home challenges in the opening rounds and after one this round', () => {
    const c = campaign();
    const hB = c.sectors[1];
    expect(homeChallengeBlock(c, hB)).toMatch(/until round 4/);
    expect(homeChallengeBlock(c, c.sectors[2])).toBeUndefined();
    c.round = 4;
    expect(homeChallengeBlock(c, hB)).toBeUndefined();
    recordSectorGame(c, { id: 'g', date: '', sectorId: 'hB', attacker: 'A', defender: 'B', winner: 'B', notes: '' });
    expect(homeChallengeBlock(c, hB)).toMatch(/already challenged/);
    c.round = 5;
    expect(homeChallengeBlock(c, hB)).toBeUndefined();
  });
});

describe('nexus resolution', () => {
  function setup() {
    const f = newForce('Test');
    f.nexus = { ...emptyNexus('A'), tempTables: ['Hero'], pending: ['Combat Manipulation: Dark Shroud', 'Organized Strike'] };
    const a = newUnit({ id: 'a', name: 'Alpha', scars: [{ id: 's1', name: 'Weakened Armor' }] });
    f.units.push(a);
    const input: BattleInput = {
      date: '2026-10-18', opponent: 'AI', result: 'win', vsAi: true, agendas: [], myBp: 0, oppBp: 0, notes: '',
      table: '', agendaRp: 0, units: { a: emptyUnitBattle(a) }, rewards: { main: { roll: 5, alloc: {}, target: '' } }, // +50 supply
      sectorId: 'v', sectorName: 'Hulk', nexus: nexusGeneration(campaign(), 'A', 'v', 'win', true), nexusPicks: {},
    };
    let n = 0;
    return { f, input, id: () => `id${n++}` };
  }

  it('applies the match bonus and table results, and spends last match\'s manipulations', () => {
    const { f, input, id } = setup();
    input.nexusPicks = { void: { roll: 2, choice: '', target: '', alloc: { a: 6 } } }; // void 2: 6 XP + 1 US
    const out = resolveBattle(f, input, id);
    expect(out.us).toBe(6); // match bonus 3 + void 3
    expect(f.umbraShards).toBe(6);
    expect(f.units[0].xp).toBe(3 + 6);
    expect(f.nexus!.tempTables).toEqual(['Hero']); // round unlocks last until the next round income
    expect(f.nexus!.pending).toEqual(['Organized Strike']);
    expect(f.ledger.filter((l) => l.us).map((l) => l.us)).toEqual([3, 3]);
    expect(f.battleLog![0].sectorName).toBe('Hulk');
    expect(out.warnings).toEqual([]);
  });

  it('caps the match bonus per round', () => {
    const { f, input, id } = setup();
    input.nexus = nexusGeneration(campaign(), 'A', '', 'win', false);
    for (let i = 0; i < 3; i++) resolveBattle(f, input, id);
    expect(f.umbraShards).toBe(6);
    input.nexus = { ...input.nexus, round: 2 };
    resolveBattle(f, input, id);
    expect(f.umbraShards).toBe(9);
  });

  it('adds an AI special table roll for an Echo bounty', () => {
    const { input } = setup();
    expect(rewardRows(input).map((r) => r.key)).not.toContain('bounty');
    input.nexus = { ...input.nexus!, bounty: true };
    input.rewards.bounty = { roll: 3, alloc: {}, target: '' };
    expect(rewardRows(input).find((r) => r.key === 'bounty')).toMatchObject({ table: 'aiSpecial', source: 'Echo bounty', entry: REWARD_TABLES.aiSpecial.entries[2] });
  });

  it('grants trait tokens and relics', () => {
    const { f, input, id } = setup();
    input.nexusPicks = { void: { roll: 6, choice: 'Umbra Claw', target: 'a', alloc: {} } };
    resolveBattle(f, input, id);
    expect(f.units[0].relics.map((r) => [r.name, r.tier])).toEqual([['Umbra Claw', 'Rare']]);
    input.nexusPicks.void = { roll: 3, choice: '', target: '', alloc: {} };
    resolveBattle(f, input, id);
    expect(f.nexus!.traitTokens).toBe(1);
  });

  it('gates Nexus traits by unlocked table or token', () => {
    const f = newForce();
    expect(nexusAccess(f, 'Hero')).toBe('unlocked'); // not in a campaign
    f.nexus = { ...emptyNexus('A'), permanentTables: ['Infantry'] };
    expect(nexusAccess(f, 'Infantry')).toBe('unlocked');
    expect(nexusAccess(f, 'Hero')).toBeNull();
    f.nexus.traitTokens = 1;
    expect(nexusAccess(f, 'Hero')).toBe('token');
  });

  it('warns about unrolled nexus items', () => {
    const { f, input, id } = setup();
    const out = resolveBattle(f, input, id);
    expect(out.warnings).toEqual(['Hulk: Void / Space hulk: not rolled yet.']);
  });
});

describe('sector games', () => {
  const ev = (sectorId: string, attacker: string, defender: string, winner: string) => ({ id: 'e', date: '', sectorId, attacker, defender, winner, notes: '' });
  it('transfers control, keeps home sectors and claims void rewards', () => {
    const c = campaign();
    recordSectorGame(c, ev('p2', 'A', 'B', 'A'));
    expect(c.sectors[3].owner).toBe('A');
    recordSectorGame(c, ev('hB', 'A', 'B', 'A'));
    expect(c.sectors[1].owner).toBe('B');
    recordSectorGame(c, ev('v', 'B', 'ai', 'B'));
    expect(c.sectors[5]).toMatchObject({ owner: 'B', rewardClaimed: true });
    recordSectorGame(c, ev('an', 'B', 'A', ''));
    expect(c.sectors[4].owner).toBe('A');
    expect(c.log).toHaveLength(4);
  });

  it('puts the sector back when its latest game is deleted', () => {
    const c = campaign();
    recordSectorGame(c, { ...ev('p2', 'A', 'B', 'A'), id: 'e1' });
    recordSectorGame(c, { ...ev('v', 'B', 'ai', 'B'), id: 'e2' });
    recordSectorGame(c, { ...ev('p2', 'B', 'A', 'B'), id: 'e3' });
    removeSectorGame(c, 'e1'); // a later game changed p2, so it stays
    expect(c.sectors[3].owner).toBe('B');
    removeSectorGame(c, 'e3');
    expect(c.sectors[3].owner).toBe('A');
    removeSectorGame(c, 'e2');
    expect(c.sectors[5].owner).toBeUndefined();
    expect(c.sectors[5].rewardClaimed).toBeUndefined();
    expect(c.log).toHaveLength(0);
  });

  it('loses a Reinforce when the sector changes hands, and gets it back on undo', () => {
    const c = campaign();
    c.sectors[3].reinforced = true;
    recordSectorGame(c, { ...ev('p2', 'B', 'A', 'B'), id: 'e0' }); // held: stays reinforced
    expect(c.sectors[3].reinforced).toBe(true);
    recordSectorGame(c, { ...ev('p2', 'A', 'B', 'A'), id: 'e1' });
    expect(c.sectors[3].reinforced).toBeUndefined();
    removeSectorGame(c, 'e1');
    expect(c.sectors[3]).toMatchObject({ owner: 'B', reinforced: true });
  });

  it('gives an unclaimed sector its guardian back when the game that slew it is deleted', () => {
    const c = campaign();
    const guardian = { name: 'Vex the Hollow', tier: 'Common' as const, unit: newUnit() };
    c.sectors[5].guardian = guardian;
    recordSectorGame(c, { ...ev('v', 'A', 'ai', 'A'), id: 'g1' }, () => 0);
    expect(c.sectors[5]).toMatchObject({ owner: 'A' });
    expect(c.sectors[5].guardian).toBeUndefined();
    removeSectorGame(c, 'g1');
    expect(c.sectors[5].owner).toBeUndefined();
    expect(c.sectors[5].guardian).toEqual(guardian);
  });
});
