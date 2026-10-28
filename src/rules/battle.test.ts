import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import { href, parseRoute } from '../route';
import { REWARD_TABLES } from './data';
import { emptyUnitBattle, materialsLine, nexusOnlyReward, participationXp, resolveBattle, restartInput, rewardRows, rollReward, type BattleInput } from './battle';
import { emptyNexus } from './nexus';

function setup() {
  const f = newForce('Test');
  const a = newUnit({ id: 'a', name: 'Alpha', xp: 8 });
  const b = newUnit({ id: 'b', name: 'Bravo', xp: 25, upgrades: [{ id: 'up1', name: 'Veteran', unique: false }] });
  const c = newUnit({ id: 'c', name: 'Charlie', status: 'comatose' });
  f.units.push(a, b, c);
  const input: BattleInput = {
    date: '2026-10-18', opponent: 'Orks', result: 'win', vsAi: false, agendas: [], myBp: 10, oppBp: 10, notes: '',
    table: '', agendaRp: 0, units: { a: emptyUnitBattle(a), b: emptyUnitBattle(b), c: emptyUnitBattle(c) }, rewards: {},
  };
  let n = 0;
  return { f, input, id: () => `id${n++}` };
}

describe('battle resolution', () => {
  it('awards participation, marked, kills and table XP; levels up', () => {
    const { f, input, id } = setup();
    input.units.a = { ...input.units.a, marked: true, killXp: 2 };
    input.rewards.main = { roll: 1, alloc: { a: 4, b: 2 }, target: '' }; // winners 1: 6 XP to distribute
    const out = resolveBattle(f, input, id);
    const a = f.units[0];
    expect(a.xp).toBe(8 + 3 + 3 + 2 + 4); // no agendas = 3 participation
    expect(out.units[0].levelsGained).toBe(2); // 8 → 20 crosses 10 and 20
    expect(f.units[1].xp).toBe(25 + 3 + 2);
    expect(f.units[2].xp).toBe(0);
    expect(f.units[2].status).toBe('active'); // comatose sat out and recovers
    expect(f.battles).toBe(1);
    expect(f.wins).toBe(1);
    expect(f.battleLog).toHaveLength(1);
    expect(out.warnings).toEqual([]);
  });

  it('applies scars, undo, and lose-a-trait', () => {
    const { f, input, id } = setup();
    input.units.a = { ...input.units.a, destroyed: true, death: { dice: [1], outcome: 'scar' }, scar: 'scar:Weakened Armor' };
    input.units.b = { ...input.units.b, destroyed: true, death: { dice: [1], outcome: 'scar' }, scar: 'trait:up1' };
    input.result = 'loss';
    input.rewards.main = { roll: 1, alloc: {}, target: 'a:battle' }; // losers 1: undo a scar from this battle
    resolveBattle(f, input, id);
    expect(f.units[0].scars).toEqual([]);
    expect(f.units[1].upgrades).toEqual([]);
    expect(f.units[1].xp).toBe(10 + 3); // dropped to the previous bracket (10), then this battle's XP
    expect(f.wins).toBe(0);
  });

  it('adds RP and supply to the ledger', () => {
    const { f, input, id } = setup();
    input.rewards.main = { roll: 5, alloc: {}, target: '' }; // +1 RP and +50 supply
    input.agendaRp = 1;
    const out = resolveBattle(f, input, id);
    expect(out.rp).toBe(3);
    expect(out.supply).toBe(50);
    expect(f.ledger.reduce((n, l) => n + l.rp, 0)).toBe(3);
  });

  it('counts a reward’s Materials for a Nexus force, for the wizard to bank', () => {
    const { f, input, id } = setup();
    f.nexus = emptyNexus('A');
    input.rewards.main = { roll: 2, alloc: {}, target: '' }; // +100 Supply Limit and +100 Materials
    const out = resolveBattle(f, input, id);
    expect([out.materials, out.supply]).toEqual([100, 100]);
    expect(out.summary).toContain(materialsLine(100));
  });

  it('banks no Materials for a force outside Nexus Wars', () => {
    const { f, input, id } = setup();
    input.rewards.main = { roll: 2, alloc: {}, target: '' };
    const out = resolveBattle(f, input, id);
    expect([out.materials, out.supply]).toEqual([0, 100]);
    expect(out.summary).toContain('Materials only go to a Nexus Wars faction: none banked.');
  });

  it('adds sub-table, suffering and risky gamble rows', () => {
    const { input } = setup();
    input.rewards.main = { roll: 10, alloc: {}, target: '' };
    input.agendas = ['Risky Gamble'];
    expect(rewardRows(input).map((r) => r.key)).toEqual(['main', 'main/sub', 'gamble']);
    input.result = 'loss';
    input.oppBp = 21;
    expect(participationXp(input)).toBe(0);
    expect(rewardRows(input).map((r) => r.key)).toEqual(['main', 'suffer0', 'suffer1']);
  });

  it('warns about unresolved choices', () => {
    const { f, input, id } = setup();
    input.units.a = { ...input.units.a, destroyed: true };
    const out = resolveBattle(f, input, id);
    expect(out.warnings).toContain('Winners table: not rolled yet.');
    expect(out.warnings).toContain('Alpha: death roll not made.');
  });
});

describe('starting a filled-in report blank', () => {
  it('keeps the source battle and the patrol flag, and leaves out units that already fought this round', () => {
    const { input } = setup();
    const prev: BattleInput = { ...input, from: { battleId: 'b1', sideId: 's1' }, patrol: true, vsAi: true, units: { ...input.units, a: { ...input.units.a, killXp: 3 } } };
    const next = restartInput(input, prev, ['a']);
    expect(next.from).toEqual(prev.from);
    expect(next.patrol).toBe(true);
    expect(next.vsAi).toBe(true);
    expect(next.units.a.in).toBe(false);
    expect(next.units.a.killXp).toBe(0);
    expect(next.units.b.in).toBe(true);
    expect(input.units.a.in).toBe(true);
  });

  it('is a plain report when the source was not a patrol', () => {
    const { input } = setup();
    const next = restartInput(input, { ...input, vsAi: true }, []);
    expect(next.patrol).toBeUndefined();
    expect(next.vsAi).toBe(false);
  });
});

describe('rolling a reward table', () => {
  // A die that hands out these results in turn.
  const dice = (...rolls: number[]) => () => rolls.shift()!;
  const tokenRoll = REWARD_TABLES.winner.entries.findIndex(nexusOnlyReward) + 1;

  it('rerolls Nexus-only results for a force outside Nexus Wars', () => {
    expect(nexusOnlyReward(REWARD_TABLES.winner.entries[tokenRoll - 1])).toBe(true);
    expect(rollReward('winner', false, dice(tokenRoll, tokenRoll, 3))).toBe(3);
    const manip = REWARD_TABLES.loser.entries.findIndex((e) => e.manipulation) + 1;
    expect(rollReward('loser', false, dice(manip, 2))).toBe(2);
  });

  it('keeps Nexus-only results for a Nexus Wars force', () => {
    expect(rollReward('winner', true, dice(tokenRoll, 3))).toBe(tokenRoll);
  });

  it('never lands on a Nexus-only result outside Nexus Wars', () => {
    for (const k of Object.keys(REWARD_TABLES) as (keyof typeof REWARD_TABLES)[])
      for (let i = 0; i < 200; i++) expect(nexusOnlyReward(REWARD_TABLES[k].entries[rollReward(k, false) - 1])).toBe(false);
  });
});

describe('back to past battles', () => {
  it('opens the Battle page at its Past battles list', () => {
    expect(parseRoute(href.pastBattles())).toEqual({ page: 'tracker', past: true });
    expect(parseRoute(href.tracker())).toEqual({ page: 'tracker' });
  });
});
