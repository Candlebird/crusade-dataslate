import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import { DEFAULT_SETTINGS } from '../model/types';
import { emptyUnitBattle, type BattleInput } from './battle';
import { EXAMPLE_MISSION, STANDARD_MISSION, allMissions } from './missions';
import { loadForce, newBattle, nextRound, prevRound, score, setHolder, setObjectives, sideOfForce, winner, wizardPrefill } from './tracker';

describe('battle tracker', () => {
  it('rolls D3+2 markers for the standard mission', () => {
    expect(newBattle(STANDARD_MISSION, 'b', '2026-10-18', () => 0).objectives).toBe(3);
    expect(newBattle(STANDARD_MISSION, 'b', '2026-10-18', () => 0.99).objectives).toBe(5);
    expect(newBattle(EXAMPLE_MISSION, 'b', '2026-10-18').objectives).toBe(3);
  });

  it('carries control into the next round and scores only the last round in the standard mission', () => {
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    setHolder(b, 0, 'a');
    setHolder(b, 1, 'a');
    nextRound(b);
    expect(b.control[1]).toEqual(['a', 'a', '']);
    setHolder(b, 1, 'b');
    setHolder(b, 2, 'x');
    expect(score(b).a.objectives).toBe(1);
    expect(score(b).b.objectives).toBe(1);
    expect(winner(b)).toBe('draw');
    b.sides.a.vpAdjust = 1;
    expect(winner(b)).toBe('a');
  });

  it('scores every round, tallies and follows later rounds when an earlier round is corrected', () => {
    const b = newBattle(EXAMPLE_MISSION, 'b', '');
    setHolder(b, 0, 'b');
    nextRound(b);
    nextRound(b);
    prevRound(b);
    prevRound(b);
    setHolder(b, 0, 'a'); // round 1 fix flows into rounds 2 and 3, which still matched
    expect(b.control.map((r) => r[0])).toEqual(['a', 'a', 'a']);
    b.round = 3;
    b.sides.b.counters.salvage = 2;
    expect(score(b).a).toEqual({ objectives: 3, counters: 0, total: 3 });
    expect(score(b).b.total).toBe(4);
    setObjectives(b, 1);
    expect(b.control.every((r) => r.length === 1)).toBe(true);
  });

  it('loads a force and fills in the post-battle report', () => {
    const f = newForce('Iron Host');
    const a = newUnit({ id: 'a', name: 'Alpha', size: 5, tough: 1 });
    const c = newUnit({ id: 'c', name: 'Charlie', size: 1, tough: 6 });
    const off = newUnit({ id: 'off', name: 'Benched', status: 'comatose' });
    f.units.push(a, c, off);
    f.nexus = { factionId: 'x', permanentTables: [], tempTables: [], traitTokens: 0, pending: ['Combat Manipulation: Bombardment'] };
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    loadForce(b.sides.a, f, undefined, DEFAULT_SETTINGS);
    b.sides.b.name = 'Orks';
    expect(b.sides.a.units.map((u) => u.maxWounds)).toEqual([5, 6]);
    expect(b.sides.a.manipulations).toEqual([{ text: 'Combat Manipulation: Bombardment', used: false }]);
    b.sides.a.units[1].destroyed = true;
    b.sides.a.units[0].kills = 2;
    b.sides.a.agendas.push({ name: 'Survivor', count: 0, done: true });
    setHolder(b, 0, 'a');
    expect(sideOfForce(b, f.id)).toBeUndefined();
    b.ended = true;
    expect(sideOfForce(b, f.id)).toBe('a');

    const blank: BattleInput = {
      date: '', opponent: '', result: 'draw', vsAi: false, agendas: [], myBp: 0, oppBp: 0, notes: '', table: '', agendaRp: 0,
      units: { a: emptyUnitBattle(a), c: emptyUnitBattle(c), off: emptyUnitBattle(off) }, rewards: {},
    };
    const input = wizardPrefill(b, 'a', blank, f);
    expect(input.opponent).toBe('Orks');
    expect(input.result).toBe('win');
    expect(input.agendas).toEqual(['Survivor']);
    expect(input.units.a).toMatchObject({ in: true, kills: 2, destroyed: false });
    expect(input.units.c).toMatchObject({ in: true, destroyed: true });
    expect(input.units.off.in).toBe(false);
    b.recorded.push('a');
    expect(sideOfForce(b, f.id)).toBeUndefined();
  });

  it('lets a custom mission replace a built-in with the same id', () => {
    const mine = { ...STANDARD_MISSION, name: 'Our standard' };
    const all = allMissions([mine]);
    expect(all.filter((m) => m.id === STANDARD_MISSION.id).map((m) => m.name)).toEqual(['Our standard']);
  });
});
