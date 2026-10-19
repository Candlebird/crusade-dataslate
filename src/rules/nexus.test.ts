import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign } from '../model/types';
import { emptyUnitBattle, resolveBattle, type BattleInput } from './battle';
import { emptyNexus, nexusAccess, nexusGeneration, recordSectorGame, removeSectorGame } from './nexus';

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
  it('lists owned-sector benefits after any match', () => {
    expect(kinds(nexusGeneration(campaign(), 'A', '', 'loss', false))).toEqual(['hA:us', 'p1:shardRoll', 'an:anomaly']);
    expect(kinds(nexusGeneration(campaign(), undefined, '', 'win', false))).toEqual([]);
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
    expect(kinds(won)).toEqual(['conquest:hB:supply', 'conquest:p2:manipulation', 'hA:us', 'p1:shardRoll', 'an:anomaly']);
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

  it('applies shards, rolls and table results, and expires last match\'s unlocks', () => {
    const { f, input, id } = setup();
    input.nexusPicks = {
      p1: { roll: 5, choice: '', target: '', alloc: {} }, // shard mine 4+ → +1 US
      an: { roll: 5, choice: '', target: 'a:s1', alloc: {} }, // anomaly 5: remove a scar
      void: { roll: 2, choice: '', target: '', alloc: { a: 6 } }, // void 2: 6 XP + 1 US
    };
    const out = resolveBattle(f, input, id);
    expect(out.us).toBe(3); // home mine 1 + shard mine 1 + void 1
    expect(f.umbraShards).toBe(3);
    expect(f.units[0].scars).toEqual([]);
    expect(f.units[0].xp).toBe(3 + 6);
    expect(f.nexus!.tempTables).toEqual([]);
    expect(f.nexus!.pending).toEqual(['Organized Strike']);
    expect(f.ledger.filter((l) => l.us).map((l) => l.us)).toEqual([1, 1, 1]);
    expect(f.battleLog![0].sectorName).toBe('Hulk');
    expect(out.warnings).toEqual([]);
  });

  it('grants unlock-all, trait tokens and relics', () => {
    const { f, input, id } = setup();
    input.nexusPicks = {
      p1: { roll: 1, choice: '', target: '', alloc: {} },
      an: { roll: 6, choice: '', target: '', alloc: {} },
      void: { roll: 6, choice: 'Umbra Claw', target: 'a', alloc: {} },
    };
    resolveBattle(f, input, id);
    expect(f.nexus!.tempTables).toBe('all');
    expect(f.units[0].relics.map((r) => [r.name, r.tier])).toEqual([['Umbra Claw', 'Rare']]);
    input.nexusPicks.void = { roll: 3, choice: '', target: '', alloc: {} };
    resolveBattle(f, input, id);
    expect(f.nexus!.traitTokens).toBe(1);
    expect(nexusAccess(f, 'Elite')).toBe('unlocked'); // anomaly 6 again
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
    expect(out.warnings).toEqual(expect.arrayContaining(['Planet 1: Shard Mine: not rolled yet.', 'Rift: Anomaly: not rolled yet.']));
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
});
