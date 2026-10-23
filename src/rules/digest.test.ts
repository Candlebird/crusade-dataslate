import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign } from '../model/types';
import { digest } from './digest';

// Since You Last Looked: your faction's news and your forces' feats, each with a key to remember it by.

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
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 30, r: 0 },
    ],
    log: [
      { id: 'g1', date: '', sectorId: 'pA', attacker: 'B', defender: 'A', winner: 'A', notes: '', round: 1 },
      { id: 'g2', date: '', sectorId: 'hB', attacker: 'B', defender: '', winner: 'B', notes: '', round: 1, skirmish: true },
    ],
  };
}

describe('digest', () => {
  it("has only feats when you aren't in the campaign", () => {
    const f = { ...newForce('Iron'), id: 'f', feats: { firstBlood: '2026-10-20' } };
    expect(digest(campaign(), [f]).map((i) => i.key)).toEqual(['feat:f:firstBlood']);
  });

  it('tells of raids on your sectors, the report, games you know of and what waits on you', () => {
    const c = campaign();
    c.reports = [{ round: 1, date: '', lines: [
      { icon: '🏴', text: 'Raiders hit A Planet', sectorId: 'pA' },
      { icon: '🏴', text: 'Raiders hit B Home', sectorId: 'hB' },
    ] }];
    c.gameNight = { round: 2, coming: ['B'] };
    c.duels = [{ id: 'd', date: '', round: 2, status: 'open', challenger: { factionId: 'B', forceId: 'x', wager: {} }, challenged: { factionId: 'A', forceId: 'y', wager: {} } }];
    const items = digest(c, [], 'A');
    expect(items.map((i) => i.key)).toEqual(['report:1', 'raid:1:pA', 'night:2', 'duel:d', 'log:g1']);
    expect(items.find((i) => i.key === 'log:g1')!.href).toBe('#/campaign/log/g1');
    expect(items.find((i) => i.key === 'raid:1:pA')!.href).toBe('#/campaign/map/pA');
  });
});
