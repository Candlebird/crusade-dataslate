import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import { DEFAULT_SETTINGS, type Campaign } from '../model/types';
import { emptyNexus, recordSectorGame } from './nexus';
import { emptyUnitBattle, resolveBattle, type BattleInput } from './battle';
import { ADVANCED_MISSION_TABLE, BUILTIN_MISSIONS, DEPLOYMENT_STYLES, EXAMPLE_MISSION, STANDARD_MISSION, allMissions, rollAdvancedMission, rollDeployment } from './missions';
import {
  FORMATS,
  addSide,
  atSector,
  sectorGame,
  standInFor,
  cycleHolder,
  leaders,
  loadForce,
  migrateBattle,
  newBattle,
  nextRound,
  prevRound,
  removeSide,
  resultFor,
  score,
  setHolder,
  setObjectives,
  setTeam,
  sideOfForce,
  claims,
  finishBattle,
  resultTitle,
  teamName,
  winner,
  wizardPrefill,
} from './tracker';

describe('battle tracker', () => {
  it('rolls D3+2 markers for the standard mission', () => {
    expect(newBattle(STANDARD_MISSION, 'b', '2026-10-18', () => 0).objectives).toBe(3);
    expect(newBattle(STANDARD_MISSION, 'b', '2026-10-18', () => 0.99).objectives).toBe(5);
    expect(newBattle(EXAMPLE_MISSION, 'b', '2026-10-18').objectives).toBe(3);
  });

  it('carries control into the next round and scores only the last round in the standard mission', () => {
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    setHolder(b, 0, 'A');
    setHolder(b, 1, 'A');
    nextRound(b);
    expect(b.control[1]).toEqual(['A', 'A', '']);
    setHolder(b, 1, 'B');
    setHolder(b, 2, 'x');
    expect(score(b).A!.objectives).toBe(1);
    expect(score(b).B!.objectives).toBe(1);
    expect(winner(b)).toBe('draw');
    b.sides[0].vpAdjust = 1;
    expect(winner(b)).toBe('A');
  });

  it('scores every round, tallies and follows later rounds when an earlier round is corrected', () => {
    const b = newBattle(EXAMPLE_MISSION, 'b', '');
    setHolder(b, 0, 'B');
    nextRound(b);
    nextRound(b);
    prevRound(b);
    prevRound(b);
    setHolder(b, 0, 'A'); // round 1 fix flows into rounds 2 and 3, which still matched
    expect(b.control.map((r) => r[0])).toEqual(['A', 'A', 'A']);
    b.round = 3;
    b.counters.B = { salvage: 2 };
    expect(score(b).A!).toEqual({ objectives: 3, counters: 0, total: 3 });
    expect(score(b).B!.total).toBe(4);
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
    loadForce(b.sides[0], f, undefined, DEFAULT_SETTINGS);
    b.sides[1].name = 'Orks';
    expect(b.sides[0].units.map((u) => u.maxWounds)).toEqual([5, 6]);
    expect(b.sides[0].manipulations).toEqual([{ text: 'Combat Manipulation: Bombardment', used: false }]);
    b.sides[0].units[1].destroyed = true;
    b.sides[0].units[0].kills = 2;
    b.sides[0].agendas.push({ name: 'Survivor', count: 0, done: true });
    setHolder(b, 0, 'A');
    expect(sideOfForce(b, f.id)).toBeUndefined();
    b.ended = true;
    expect(sideOfForce(b, f.id)).toBe('s1');

    const blank: BattleInput = {
      date: '', opponent: '', result: 'draw', vsAi: false, agendas: [], myBp: 0, oppBp: 0, notes: '', table: '', agendaRp: 0,
      units: { a: emptyUnitBattle(a), c: emptyUnitBattle(c), off: emptyUnitBattle(off) }, rewards: {},
    };
    const input = wizardPrefill(b, 's1', blank, f);
    expect(input.opponent).toBe('Orks');
    expect(input.result).toBe('win');
    expect(input.agendas).toEqual(['Survivor']);
    expect(input.units.a).toMatchObject({ in: true, kills: 2, destroyed: false });
    expect(input.units.c).toMatchObject({ in: true, destroyed: true });
    expect(input.units.off.in).toBe(false);
    b.recorded.push('s1');
    expect(sideOfForce(b, f.id)).toBeUndefined();
  });

  it('lets a custom mission replace a built-in with the same id', () => {
    const mine = { ...STANDARD_MISSION, name: 'Our standard' };
    const all = allMissions([mine]);
    expect(all.filter((m) => m.id === STANDARD_MISSION.id).map((m) => m.name)).toEqual(['Our standard']);
  });

  it('rolls D3 markers and scores the most-markers bonus', () => {
    const ambush = BUILTIN_MISSIONS.find((m) => m.id === 'opr-ambush')!;
    expect(newBattle(ambush, 'b', '', () => 0).objectives).toBe(1);
    expect(newBattle(ambush, 'b', '', () => 0.99).objectives).toBe(3);

    const dom = BUILTIN_MISSIONS.find((m) => m.id === 'opr-domination')!; // bonus every round
    const b = newBattle(dom, 'b', '');
    setHolder(b, 0, 'A');
    setHolder(b, 1, 'A');
    setHolder(b, 2, 'B');
    nextRound(b);
    setHolder(b, 0, 'B');
    setHolder(b, 1, 'B');
    expect(score(b).A!.objectives).toBe(2 + 1 + 0); // round 1: 2 markers + most; round 2: none
    expect(score(b).B!.objectives).toBe(1 + 3 + 1);

    const cap = BUILTIN_MISSIONS.find((m) => m.id === 'opr-capture-and-hold')!; // bonus at the end only
    const c = newBattle(cap, 'c', '');
    setHolder(c, 0, 'A');
    nextRound(c);
    setHolder(c, 0, 'B');
    setHolder(c, 1, 'B');
    expect(score(c).A!.objectives).toBe(1);
    expect(score(c).B!.objectives).toBe(2 + 1);
  });

  it('has the 18 OPR advanced missions and rolls on their table', () => {
    const opr = BUILTIN_MISSIONS.filter((m) => m.source === 'OPR');
    expect(opr).toHaveLength(18);
    expect(new Set(opr.map((m) => m.id)).size).toBe(18);
    for (const list of Object.values(ADVANCED_MISSION_TABLE)) expect(list).toHaveLength(6);
    expect(rollAdvancedMission(() => 0).id).toBe(STANDARD_MISSION.id);
    expect(rollAdvancedMission(() => 0.99).group).toBe('Attack & Defend');
    expect(ADVANCED_MISSION_TABLE['Attack & Defend'].every((m) => m.roles)).toBe(true);
    for (const t of DEPLOYMENT_STYLES) expect(t.styles).toContain(rollDeployment(t.group, () => 0.5));
  });

  const blankInput = (): BattleInput => ({
    date: '', opponent: '', result: 'draw', vsAi: false, agendas: [], myBp: 0, oppBp: 0, notes: '', table: '', agendaRp: 0, units: {}, rewards: {},
  });
  const format = (label: string) => FORMATS.find((f) => f.label === label)!;

  it('scores a 1 v 1 v 1 free-for-all, with a draw only between the leaders', () => {
    const b = newBattle(EXAMPLE_MISSION, 'b', '', Math.random, format('1 v 1 v 1'));
    expect(b.sides.map((x) => [x.id, x.name, x.team])).toEqual([['s1', 'Player 1', 'A'], ['s2', 'Player 2', 'B'], ['s3', 'Player 3', 'C']]);
    expect(cycleHolder(b, '')).toBe('A');
    expect(cycleHolder(b, 'C')).toBe('x');
    setObjectives(b, 3);
    setHolder(b, 0, 'A');
    setHolder(b, 1, 'B');
    setHolder(b, 2, 'C');
    expect(winner(b)).toBe('draw');
    b.sides[2].vpAdjust = -1;
    expect(leaders(b)).toEqual(['A', 'B']);
    expect(resultFor(b, 's1')).toBe('draw');
    expect(resultFor(b, 's3')).toBe('loss');
    b.sides[0].vpAdjust = 1;
    expect(winner(b)).toBe('A');
    expect(resultFor(b, 's2')).toBe('loss');
  });

  it('adds up a team in a 2 v 1, and the most-markers bonus needs more than every other team', () => {
    const dom = BUILTIN_MISSIONS.find((m) => m.id === 'opr-domination')!;
    const b = newBattle(dom, 'b', '', Math.random, format('2 v 1'));
    expect(teamName(b, 'A')).toBe('Player 1 & Player 2');
    b.sides[0].vpAdjust = 1;
    b.sides[1].vpAdjust = 2;
    setObjectives(b, 3);
    setHolder(b, 0, 'A');
    setHolder(b, 1, 'A');
    setHolder(b, 2, 'B');
    expect(score(b).A!.total).toBe(2 + 1 + 3);
    expect(resultFor(b, 's2')).toBe('win');
    // A third team ties team A on markers: no one gets the bonus.
    addSide(b, 'C');
    setHolder(b, 2, 'C');
    setHolder(b, 1, 'C');
    expect(score(b).A!.objectives).toBe(1);
    expect(score(b).C!.objectives).toBe(2 + 1);
    // Moving the last player off team C hands its markers back to nobody.
    setTeam(b, 's4', 'A');
    expect(b.control[0]).toEqual(['A', '', '']);
  });

  it('fills the wizard for each player of 3 v AI from the team totals', () => {
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0, format('3 v AI'));
    expect(b.sides.map((x) => [x.name, x.team, !!x.ai])).toEqual([['Player 1', 'A', false], ['Player 2', 'A', false], ['Player 3', 'A', false], ['AI', 'B', true]]);
    const f = newForce('Iron Host');
    b.sides[1].forceId = f.id;
    b.sides.forEach((x, i) => (x.bp = [3, 4, 2, 6][i]));
    setHolder(b, 0, 'A');
    b.ended = true;
    expect(sideOfForce(b, f.id)).toBe('s2');
    const input = wizardPrefill(b, 's2', blankInput(), f);
    expect(input).toMatchObject({ opponent: 'AI', vsAi: true, result: 'win', myBp: 9, oppBp: 6 });
    expect(input.notes).toContain('1–0 VP');
    expect(input.notes).toContain('Allied with Player 1 & Player 3.');
    removeSide(b, 's4');
    expect(teamName(b, 'B')).toBe('Team B');
  });

  it('converts a battle saved with the old two fixed sides', () => {
    const old = {
      id: 'b', startedAt: '', mission: STANDARD_MISSION, round: 1, objectives: 2, control: [['a', 'b']], notes: '', ended: true, recorded: ['a'],
      vsAi: true, attacker: 'b',
      sides: {
        a: { name: 'Me', bp: 0, vpAdjust: 0, counters: { x: 1 }, agendas: [], manipulations: [], units: [] },
        b: { name: 'Bots', bp: 0, vpAdjust: 0, counters: {}, agendas: [], manipulations: [], units: [] },
      },
    };
    const b = migrateBattle(old)!;
    expect(b.sides.map((x) => [x.id, x.name, x.team, !!x.ai])).toEqual([['a', 'Me', 'A', false], ['b', 'Bots', 'B', true]]);
    expect(b.counters).toEqual({ A: { x: 1 }, B: {} });
    expect(b.control).toEqual([['A', 'B']]);
    expect(b.attacker).toBe('B');
    expect(b.recorded).toEqual(['a']);
    expect('vsAi' in b).toBe(false);
    expect(migrateBattle(b)).toBe(b);
    expect(migrateBattle(undefined)).toBeUndefined();
  });

  it('shares a finished battle, and a side is claimed by the battle log entry that records it', () => {
    const b = newBattle(EXAMPLE_MISSION, 'b', '2026-10-19', Math.random, format('2 v 1'));
    const f = newForce('Iron Host');
    const g = newForce('Ash Legion');
    b.sides[0].forceId = f.id;
    setHolder(b, 0, 'B');
    const done = finishBattle(b, '2026-10-20T10:00:00Z');
    expect(done).toMatchObject({ id: 'b', ended: true, finishedAt: '2026-10-20T10:00:00Z' });
    expect(resultTitle(done)).toBe('Player 3 wins');
    expect(claims(done, [f, g])).toEqual({});
    const input = wizardPrefill(done, 's2', blankInput(), g);
    expect(input.from).toEqual({ battleId: 'b', sideId: 's2' });
    resolveBattle(g, input, () => 'r1');
    expect(g.battleLog?.[0]).toMatchObject({ battleId: 'b', sideId: 's2', result: 'loss' });
    expect(claims(done, [f, g])).toEqual({ s2: g });
    done.recorded.push('s1');
    expect(claims(done, [f, g])).toEqual({ s1: f, s2: g });
  });
});

describe('battles over a Nexus sector', () => {
  const campaign = (): Campaign => ({
    id: 'c', name: 'Test', updatedAt: '',
    factions: [{ id: 'red', name: 'Red', player: '', color: '#f00' }, { id: 'blue', name: 'Blue', player: '', color: '#00f' }],
    sectors: [
      { id: 'p', name: 'Planet', type: 'planet', benefit: 'shardMine', owner: 'blue', notes: '' },
      { id: 'v', name: 'Hulk', type: 'void', notes: '' },
    ],
    log: [],
  });
  const forces = () => {
    const red = newForce('Red Host');
    red.nexus = emptyNexus('red');
    red.units.push(newUnit({ name: 'Warriors', status: 'active' }));
    const blue = newForce('Blue Host');
    blue.nexus = emptyNexus('blue');
    return [red, blue];
  };

  it("sets a battle up at a sector with each faction's only force loaded", () => {
    const c = campaign();
    const [red, blue] = forces();
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    atSector(b, c, [red, blue], DEFAULT_SETTINGS, 'p', 'red');
    expect(b).toMatchObject({ sectorId: 'p', attacker: 'A' });
    expect(b.sides.map((x) => x.forceId)).toEqual([red.id, blue.id]);
    expect(b.sides[0].units).toHaveLength(1);
  });

  it('turns the result into a campaign log entry that moves the sector', () => {
    const c = campaign();
    const fs = forces();
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    atSector(b, c, fs, DEFAULT_SETTINGS, 'p', 'red');
    setHolder(b, 0, 'A');
    const game = sectorGame(b, c, fs);
    expect(game).toEqual({ event: expect.objectContaining({ sectorId: 'p', attacker: 'red', defender: 'blue', winner: 'red', battleId: 'b' }) });
    recordSectorGame(c, { id: 'e', date: '', ...(game as { event: any }).event });
    expect(c.sectors[0].owner).toBe('red');

    setHolder(b, 0, 'B');
    setHolder(b, 1, 'B');
    expect(sectorGame(b, c, fs)).toMatchObject({ event: { winner: 'blue' } });
    setHolder(b, 1, 'A');
    expect(sectorGame(b, c, fs)).toMatchObject({ event: { winner: '' } });
  });

  it('counts an AI team as the AI, and an AI win changes nothing', () => {
    const c = campaign();
    const fs = forces();
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0, FORMATS.find((f) => f.label === '1 v AI'));
    atSector(b, c, fs, DEFAULT_SETTINGS, 'v', 'red');
    setHolder(b, 0, 'B');
    expect(sectorGame(b, c, fs)).toMatchObject({ event: { attacker: 'red', defender: 'ai', winner: 'ai' } });
  });

  it("lets the Void Echoes stand in for a defender who can't make it", () => {
    const c = campaign();
    const fs = forces();
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0, FORMATS.find((f) => f.label === '1 v AI'));
    atSector(b, c, fs, DEFAULT_SETTINGS, 'p', 'red');
    expect(standInFor(b, c, fs)).toBe('blue');
    setHolder(b, 0, 'B');
    expect(sectorGame(b, c, fs)).toMatchObject({ event: { attacker: 'red', defender: 'blue', winner: 'blue', notes: expect.stringContaining('stood in for Blue') } });
    setHolder(b, 0, 'A');
    const game = sectorGame(b, c, fs) as { event: any };
    expect(game.event).toMatchObject({ defender: 'blue', winner: 'red' });
    recordSectorGame(c, { id: 'e', date: '', ...game.event });
    expect(c.sectors[0].owner).toBe('red');
    // An unclaimed sector has no one to stand in for.
    b.sectorId = 'v';
    expect(standInFor(b, c, fs)).toBe('');
  });

  it("explains when the result can't be mapped onto the campaign", () => {
    const c = campaign();
    const fs = forces();
    const b = newBattle(STANDARD_MISSION, 'b', '', () => 0);
    expect(sectorGame(b, c, fs)).toBeUndefined();
    b.sectorId = 'p';
    expect(sectorGame(b, c, fs)).toMatchObject({ problem: expect.stringContaining('attacking team') });
    b.attacker = 'A';
    expect(sectorGame(b, c, fs)).toMatchObject({ problem: expect.stringContaining("isn't playing for a Nexus faction") });
    loadForce(b.sides[0], fs[0], undefined, DEFAULT_SETTINGS);
    setHolder(b, 0, 'B');
    expect(sectorGame(b, c, fs)).toMatchObject({ problem: expect.stringContaining('won but') });
    setHolder(b, 0, 'A');
    // An unlinked defender: the sector's owner defends it.
    expect(sectorGame(b, c, fs)).toMatchObject({ event: { attacker: 'red', defender: 'blue', winner: 'red' } });
  });
});
