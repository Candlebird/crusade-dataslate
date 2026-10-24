import { describe, expect, it } from 'vitest';
import type { Campaign, CampaignEvent, Force } from '../model/types';
import { chronicle, chronicleOf, gameLine, logFor } from './chronicle';

// The Campaign Chronicle (Nexus Wars): the war's history, round by round, through a faction's eyes.

// Three factions on a line (r = 0): Alpha's home at q0, Bravo's at q9, Charlie's at q20.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2,
    factions: [
      { id: 'A', name: 'Alpha', player: '', color: '#f00' },
      { id: 'B', name: 'Bravo', player: '', color: '#0f0' },
      { id: 'C', name: 'Charlie', player: '', color: '#00f' },
    ],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'mid', name: 'Middle', type: 'planet', owner: 'A', notes: '', q: 5, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 0 },
      { id: 'byC', name: 'By Charlie', type: 'planet', owner: 'B', notes: '', q: 19, r: 0 },
      { id: 'hC', name: 'C Home', type: 'home', owner: 'C', notes: '', q: 20, r: 0 },
      { id: 'deep', name: 'Deep Space', type: 'anomaly', notes: '', q: 14, r: 0 },
    ],
    log: [],
  };
}

const game = (over: Partial<CampaignEvent>): CampaignEvent =>
  ({ id: 'g', date: '2026-10-21', sectorId: 'mid', attacker: 'B', defender: 'A', winner: 'B', notes: '', round: 1, ...over });

describe('gameLine', () => {
  it('tells a capture, a hold and a draw', () => {
    const c = campaign();
    expect(gameLine(c, game({})).text).toBe('Bravo took Middle from Alpha.');
    expect(gameLine(c, game({ winner: 'A' })).text).toBe('Alpha held Middle against Bravo.');
    expect(gameLine(c, game({ winner: '' })).icon).toBe('⚖');
  });
});

describe('logFor', () => {
  it('hides games at sectors the faction never saw', () => {
    const c = campaign();
    c.log = [game({ id: 'g1' }), game({ id: 'g2', crisis: true })];
    expect(logFor(c).map((e) => e.id)).toEqual(['g1', 'g2']);
    expect(logFor(c, 'A').map((e) => e.id)).toEqual(['g1', 'g2']);
    expect(logFor(c, 'C').map((e) => e.id)).toEqual(['g2']);
    expect(logFor(c, '-')).toEqual([]);
  });
});

describe('chronicle', () => {
  it('weaves games, events and Warlords into rounds, newest first', () => {
    const c = campaign();
    c.rounds = [{ round: 1, date: '2026-10-14', holdings: {}, underdog: {}, event: 'nope' }];
    c.factions[0].warlord = { forceId: 'f', unitId: 'u', name: 'Vex', level: 1, since: 2 };
    c.log = [game({ id: 'g1' })];
    const rounds = chronicle(c);
    expect(rounds.map((r) => r.round)).toEqual([2, 1]);
    expect(rounds[0].entries[0]).toMatchObject({ icon: '♚', kind: 'warlord', factions: ['A'] });
    expect(rounds[1].date).toBe('2026-10-14');
    expect(rounds[1].entries.map((e) => e.kind)).toEqual(['event', 'game']);
    expect(rounds[1].entries[1]).toMatchObject({ eventId: 'g1', sectorId: 'mid', factions: ['B', 'A'] });
  });

  it('tells a game once, though the report has it too', () => {
    const c = campaign();
    c.log = [game({ id: 'g1' })];
    c.reports = [{ round: 1, date: '', lines: [
      { icon: '⚔', text: 'new style', factions: ['A', 'B'], sectorId: 'mid', eventId: 'g1' },
      { icon: '⚔', text: 'old style', factions: ['A', 'B'], sectorId: 'mid' },
      { icon: '🏴', text: 'Raiders hit Middle', sectorId: 'mid' },
    ] }];
    const entries = chronicle(c)[0].entries;
    expect(entries.map((e) => e.text)).toEqual(['Bravo took Middle from Alpha.', 'Raiders hit Middle']);
    expect(entries[1]).toMatchObject({ kind: 'raid', factions: ['A'] });
  });

  it("keeps a faction's journals and duels to itself", () => {
    const c = campaign();
    c.journals = [{ id: 'j', factionId: 'A', round: 1, date: '', forceId: 'f', unitId: 'u', warlord: 'Vex', context: '', catalyst: '', complication: '',
      options: [{ title: 'Mercy' } as never], picked: 0 }];
    c.duels = [{ id: 'd', date: '', round: 1, status: 'settled', winner: 'A',
      challenger: { factionId: 'A', forceId: 'f', wager: {} }, challenged: { factionId: 'B', forceId: 'g', wager: {} } }];
    expect(chronicle(c, 'A')[0].entries.map((e) => e.icon)).toEqual(['📜', '⚔']);
    expect(chronicle(c, 'A')[0].entries[0].text).toContain('chose: Mercy');
    expect(chronicle(c, 'B')[0].entries.map((e) => e.icon)).toEqual(['⚔']);
    expect(chronicle(c, 'C')).toEqual([]);
  });

  it('filters to the entries a faction is in', () => {
    const c = campaign();
    c.rounds = [{ round: 1, date: '', holdings: {}, underdog: {}, event: 'x' }];
    c.log = [game({ id: 'g1' })];
    expect(chronicleOf(chronicle(c), 'A')[0].entries.map((e) => e.eventId)).toEqual(['g1']);
    expect(chronicleOf(chronicle(c), 'C')).toEqual([]);
    expect(chronicleOf(chronicle(c))[0].entries).toHaveLength(2);
  });

  it('tells the Training tales of linked forces in their round, a faction’s own only under fog', () => {
    const c = campaign();
    const tale = (round?: number) => ({ id: `t${round}`, date: '2026-10-24', round, kind: 'lord' as const, text: 'Vex fell.', units: ['u'] });
    const forces = [
      { id: 'f', name: 'Iron Hand', nexus: { factionId: 'A' }, tales: [tale(2), tale()] },
      { id: 'g', name: 'Loose', tales: [tale(2)] },
    ] as unknown as Force[];
    const all = chronicle(c, undefined, forces);
    expect(all[0].entries).toEqual([{ round: 2, icon: '🎖', kind: 'training', factions: ['A'], text: 'Iron Hand in Training: Vex fell.' }]);
    expect(chronicle(c, 'A', forces)[0].entries).toHaveLength(1);
    expect(chronicle(c, 'B', forces)).toEqual([]);
    expect(chronicle(c)).toEqual([]);
  });
});
