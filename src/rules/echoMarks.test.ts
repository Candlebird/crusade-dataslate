import { describe, expect, it } from 'vitest';
import type { Campaign } from '../model/types';
import { ECHOES } from './nexus';
import { buildReport, reportFor } from './report';
import { endRound, placeEchoMarks } from './rounds';
import { breakMark, breaksLeft, echoMarks, resolveMarks, spreadTargets } from './voidspawn';

// The Voidspawn is ringed by Alpha's planets and an unclaimed hulk; Bravo is far away. Round 5: past the opening rounds.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 5, threat: 6,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', owner: 'A', notes: '', q: 4, r: 3 },
      { id: 'p2', name: 'Planet 2', type: 'planet', owner: 'A', notes: '', q: 2, r: 3 },
      { id: 'an', name: 'Rift', type: 'anomaly', owner: 'A', notes: '', q: 3, r: 4 },
      { id: 'u', name: 'Hulk', type: 'void', notes: '', q: 3, r: 2 },
      { id: 'vs', name: 'Maw', type: 'voidspawn', owner: ECHOES.id, notes: '', q: 3, r: 3 },
      { id: 'b1', name: 'Planet B', type: 'planet', owner: 'B', notes: '', q: 8, r: 8 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 9 },
    ],
    log: [],
  };
}

const owner = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!.owner;
const mark = (c: Campaign, ...ids: string[]) => (c.echoMarks = { round: c.round ?? 1, marks: ids.map((sectorId) => ({ sectorId })) });
const beatEchoes = (c: Campaign, winner: string) =>
  c.log.push({ id: `w${c.log.length}`, date: '', sectorId: 'vs', attacker: winner, defender: ECHOES.id, winner, notes: '', round: c.round });

describe('Echo marks', () => {
  it('mark as many distinct sectors as the threat says, all on their frontier', () => {
    const c = campaign();
    const marks = placeEchoMarks(c, () => 0);
    expect(marks).toHaveLength(3);
    expect(new Set(marks.map((m) => m.sectorId)).size).toBe(3);
    const front = spreadTargets(c).map((s) => s.id);
    for (const m of marks) expect(front).toContain(m.sectorId);
    expect(echoMarks(c)).toBe(marks);
  });

  it('mark only unclaimed space in the opening rounds', () => {
    const c = { ...campaign(), round: 2 };
    expect(placeEchoMarks(c, () => 0.5).map((m) => m.sectorId)).toEqual(['u']);
  });

  it('take a marked sector nobody holds, and spare one a detachment of its faction stands in', () => {
    const c = campaign();
    mark(c, 'p1', 'p2');
    c.positions = { f1: { sectorId: 'p1', factionId: 'A' } };
    const ends = resolveMarks(c, c.echoMarks!.marks);
    expect(ends.map((m) => [m.sector.id, m.result])).toEqual([['p1', 'held'], ['p2', 'fell']]);
    expect(owner(c, 'p1')).toBe('A');
    expect(owner(c, 'p2')).toBe(ECHOES.id);
  });

  it("don't count another faction's detachment in a held sector, but anyone's in unclaimed space", () => {
    const c = campaign();
    mark(c, 'p1', 'u');
    c.positions = { f1: { sectorId: 'p1', factionId: 'B' }, f2: { sectorId: 'u', factionId: 'B' } };
    const ends = resolveMarks(c, c.echoMarks!.marks);
    expect(ends.map((m) => [m.sector.id, m.result, m.by])).toEqual([['p1', 'fell', []], ['u', 'held', ['B']]]);
  });

  it('let a Battle win against them break one mark anywhere', () => {
    const c = campaign();
    mark(c, 'p1', 'p2');
    expect(breakMark(c, 'p1', 'B')).toBe(false);
    beatEchoes(c, 'B');
    expect(breaksLeft(c, 'B')).toBe(1);
    expect(breakMark(c, 'p1', 'B')).toBe(true);
    expect(breakMark(c, 'p2', 'B')).toBe(false);
    const ends = resolveMarks(c, c.echoMarks!.marks);
    expect(ends.map((m) => [m.sector.id, m.result, m.by])).toEqual([['p1', 'broken', ['B']], ['p2', 'fell', []]]);
  });

  it("spend a faction's unspent break on its own marked sector", () => {
    const c = campaign();
    mark(c, 'u', 'p2');
    beatEchoes(c, 'A');
    const ends = resolveMarks(c, c.echoMarks!.marks);
    expect(ends.find((m) => m.sector.id === 'p2')).toMatchObject({ result: 'broken', by: ['A'], auto: true });
    expect(owner(c, 'u')).toBe(ECHOES.id);
  });

  it('fade when the Echoes no longer border the sector', () => {
    const c = campaign();
    mark(c, 'b1');
    expect(resolveMarks(c, c.echoMarks!.marks)[0].result).toBe('cutOff');
    expect(owner(c, 'b1')).toBe('B');
  });

  it('are resolved when the round ends, and the next round is marked', () => {
    const c = campaign();
    mark(c, 'p1');
    c.positions = { f1: { sectorId: 'p2', factionId: 'A' } };
    const r = endRound(c, () => 0);
    expect(r.spread.map((s) => s.id)).toEqual(['p1']);
    expect(r.marks.map((m) => m.result)).toEqual(['fell']);
    expect(c.echoMarks?.round).toBe(6);
    expect(r.marked.length).toBeGreaterThan(0);
    expect(r.marked.map((s) => s.id)).not.toContain('p1');
  });

  it('tell the owner in the second person, and everyone else in the third', () => {
    const c = campaign();
    mark(c, 'p1', 'p2');
    c.positions = { f1: { sectorId: 'p2', factionId: 'A' } };
    const r = endRound(c, () => 0);
    const report = buildReport(c, r, {}, '', () => 0);
    const alpha = reportFor(report, 'A').map((l) => l.text).join('\n');
    const bravo = reportFor(report, 'B').map((l) => l.text).join('\n');
    expect(alpha).toContain('You let Planet 1 fall');
    expect(alpha).toContain('Your detachment held Planet 2');
    expect(bravo).not.toContain('You let');
    expect(alpha).toMatch(/massing at/);
  });
});
