import { describe, expect, it } from 'vitest';
import { newUnit } from '../model/factory';
import type { Campaign, TurnReport } from '../model/types';
import { NEXUS_ROUNDS } from './nexusData';
import { buildReport, reportFor } from './report';
import type { RoundEnd } from './rounds';

// The turn report (Nexus Wars): who may read each line of a round's news.

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

function roundEnd(over: Partial<Omit<RoundEnd, 'report'>> = {}): Omit<RoundEnd, 'report'> {
  return {
    round: 2, threatBefore: 3, threat: 3, wins: 0, voidspawnWins: 0, patrols: 0,
    spread: [], marks: [], marked: [], cleared: [], fresh: [], production: [], research: [], built: [], guardians: [],
    marauders: { raids: [], spawned: [] },
    ...over,
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const first = () => 0;

describe('reportFor', () => {
  const report: TurnReport = {
    round: 1, date: '2026-10-21',
    lines: [
      { icon: '☠', text: 'everyone' },
      { icon: '⚔', text: 'A and B', factions: ['A', 'B'] },
      { icon: '⚒', text: 'only B', factions: ['B'] },
      { icon: '?', text: 'nobody', factions: [] },
    ],
  };

  it('gives a faction the open lines and the ones addressed to it', () => {
    expect(reportFor(report, 'A').map((l) => l.text)).toEqual(['everyone', 'A and B']);
    expect(reportFor(report, 'B').map((l) => l.text)).toEqual(['everyone', 'A and B', 'only B']);
    expect(reportFor(report, 'C').map((l) => l.text)).toEqual(['everyone']);
  });

  it('gives the GM (no faction) every line', () => {
    expect(reportFor(report, undefined)).toEqual(report.lines);
  });
});

describe('buildReport', () => {
  it('tells a battle to the factions in it and those that could see it, and no one else', () => {
    const c = campaign();
    c.log.push({ id: 'g', date: '', round: 2, sectorId: 'mid', attacker: 'B', defender: 'A', winner: 'A', notes: '' });
    const line = buildReport(c, roundEnd(), {}, '2026-10-21', first).lines.find((l) => l.sectorId === 'mid')!;
    expect(line.icon).toBe('🛡');
    expect(line.text).toContain('Middle');
    expect([...line.factions!].sort()).toEqual(['A', 'B']);
  });

  it('leaves a line open when every faction was in it or saw it', () => {
    const c = campaign();
    c.log.push({ id: 'g', date: '', round: 2, sectorId: 'byC', attacker: 'A', defender: 'B', winner: 'A', notes: '' });
    const line = buildReport(c, roundEnd(), {}, '2026-10-21', first).lines.find((l) => l.sectorId === 'byC')!;
    expect(line.factions).toBeUndefined();
    expect(line.text).toMatch(/Alpha/);
  });

  it('leaves out other rounds, skirmishes and the Echoes spreading from the battle news', () => {
    const c = campaign();
    c.log.push(
      { id: 'old', date: '', round: 1, sectorId: 'mid', attacker: 'B', defender: 'A', winner: 'B', notes: '' },
      { id: 'sk', date: '', round: 2, sectorId: 'mid', attacker: 'B', defender: 'A', winner: 'B', notes: '', skirmish: true },
    );
    const lines = buildReport(c, roundEnd(), {}, '2026-10-21', first).lines;
    expect(lines.some((l) => l.sectorId === 'mid')).toBe(false);
  });

  it('hides a new point of interest from factions that cannot see it', () => {
    const c = campaign();
    const fresh = sector(c, 'deep');
    const line = buildReport(c, roundEnd({ fresh: [fresh] }), {}, '2026-10-21', first).lines.find((l) => l.sectorId === 'deep')!;
    expect(line.factions).toEqual([]);
    expect(reportFor({ round: 2, date: '', lines: [line] }, 'A')).toEqual([]);
    expect(reportFor({ round: 2, date: '', lines: [line] }, undefined)).toEqual([line]);
  });

  it("keeps a faction's production, research, building and hero offers to itself", () => {
    const c = campaign();
    const offer = { id: 'o', factionId: 'C', round: 2, unit: { ...newUnit({ unitType: 'Wanderer' }), relics: [] }, fee: 2 };
    c.factions[1].research = 4;
    const report = buildReport(c, roundEnd(), {
      production: [{ sector: sector(c, 'pA'), gained: 50 }],
      research: [{ factionId: 'B', gained: 1 }],
      built: [{ sector: sector(c, 'hA'), building: 'watchtower' }],
      offers: { fresh: [offer], gone: [] },
    }, '2026-10-21', first);
    const own = (icon: string) => report.lines.filter((l) => l.icon === icon).map((l) => l.factions);
    expect(own('⚒')).toEqual([['A']]);
    expect(own('🔬')).toEqual([['B']]);
    expect(own('🏗')).toEqual([['A']]);
    expect(own('★')).toEqual([['C']]);
    expect(reportFor(report, 'B').some((l) => l.text.includes('+50'))).toBe(false);
    expect(reportFor(report, 'A').some((l) => l.text.includes('+50'))).toBe(true);
    expect(reportFor(report, 'A').some((l) => l.text.includes('Wanderer'))).toBe(false);
  });

  it('tells everyone about the threat and the Marauders', () => {
    const c = campaign();
    const report = buildReport(c, roundEnd({
      threat: 4,
      marauders: {
        raids: [{ band: 'The Rust Jackals', sectorId: 'pA', sector: 'A Planet', owner: 'A', stolen: 30, repelled: false }],
        spawned: [{ id: 'm', name: 'The Rust Jackals', sectorId: 'deep', strength: 600, since: 2 }],
      },
    }), {}, '2026-10-21', first);
    for (const f of ['A', 'B', 'C']) {
      const lines = reportFor(report, f);
      expect(lines.some((l) => l.icon === '☠' && l.text.includes('4'))).toBe(true);
      expect(lines.filter((l) => l.icon === '🏴')).toHaveLength(2);
    }
  });

  it('names a sector that faded this round, and keeps only the last reports', () => {
    const c = campaign();
    const hulk = { id: 'hulk', name: 'The Wreck', type: 'void' as const, notes: '' };
    const report = buildReport(c, roundEnd({ cleared: [hulk] }), {}, '2026-10-21', first);
    expect(report.lines.find((l) => l.sectorId === 'hulk')!.text).toContain('The Wreck');
    expect(c.reports).toEqual([report]);
    for (let i = 0; i < NEXUS_ROUNDS.keepRounds + 2; i++) buildReport(c, roundEnd({ round: 3 + i }), {}, '2026-10-21', first);
    expect(c.reports).toHaveLength(NEXUS_ROUNDS.keepRounds);
    expect(c.reports![c.reports!.length - 1].round).toBe(NEXUS_ROUNDS.keepRounds + 4);
  });
});
