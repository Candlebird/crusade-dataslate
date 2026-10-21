import { describe, expect, it } from 'vitest';
import type { Campaign, CampaignEvent } from '../model/types';
import { refreshSectors, rng } from './hexmap';
import { nexusGeneration, recordSectorGame, removeSectorGame } from './nexus';
import { research, researchBlock, techStatus } from './tech';
import { BUILDINGS } from './nexusData';

// The Lost Archive (Nexus Wars): a guarded hex whose first conqueror takes an Archive unlock, then fades.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'arc', name: 'The Codex Vault', type: 'archive', notes: '', q: 1, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 4, r: 0 },
    ],
    log: [],
  };
}

const faction = (c: Campaign, id: string) => c.factions.find((f) => f.id === id)!;
const game = (winner: string, id = 'g'): CampaignEvent =>
  ({ id, date: '', round: 1, sectorId: 'arc', attacker: winner, defender: 'ai', winner, notes: '' });
const locked = BUILDINGS.find((b) => b.tier === 3)!;

describe('the Lost Archive', () => {
  it('gives its first conqueror an Archive unlock, and takes it back when the game is deleted', () => {
    const c = campaign();
    expect(nexusGeneration(c, 'A', 'arc', 'win', true).notes.join(' ')).toMatch(/Archive unlock/);
    recordSectorGame(c, game('A'));
    expect([faction(c, 'A').archives, c.sectors[1].owner, c.sectors[1].rewardClaimed]).toEqual([1, 'A', true]);
    expect(nexusGeneration(c, 'B', 'arc', 'win', true).notes.join(' ')).toMatch(/already been plundered/);
    removeSectorGame(c, 'g');
    expect([faction(c, 'A').archives, c.sectors[1].owner, c.sectors[1].rewardClaimed]).toEqual([undefined, undefined, undefined]);
  });

  it('researches any tech, ignoring its requirements', () => {
    const c = campaign();
    const f = faction(c, 'A');
    expect(techStatus(f, locked)).toBe('locked');
    expect(researchBlock(f, locked.id, 'archive')).toMatch(/Archive unlock/);
    f.archives = 1;
    expect(researchBlock(f, locked.id, 'archive')).toBeUndefined();
    expect(research(c, 'A', locked.id, 'archive')).toBe(true);
    expect([f.archives, f.techs]).toEqual([undefined, [locked.id]]);
  });

  it('fades once plundered', () => {
    const c = campaign();
    recordSectorGame(c, game('A'));
    const r = refreshSectors(c, rng('x'));
    expect(r.cleared.map((s) => s.type)).toEqual(['archive']);
    expect(c.sectors[1]).toMatchObject({ type: 'empty', owner: 'A' });
    expect(c.sectors[1].notes).toMatch(/secrets/);
  });
});
