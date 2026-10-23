import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { BattleRecord } from '../model/types';
import { STANDARD_MISSION } from './missions';
import type { FinishedBattle } from './tracker';
import { forceStats, mvp } from './warRoom';

// The War Room (Nexus Wars): a force's record and unit lines from its battle log and the tracked battles behind it.

const rec = (over: Partial<BattleRecord>): BattleRecord =>
  ({ id: 'r', date: '2026-10-01', opponent: 'Bob', result: 'win', vsAi: false, agendas: [], myBp: 0, oppBp: 0, summary: [], notes: '', ...over });

const unit = (id: string, unitId: string | undefined, xp: number, destroyed = false, kills?: number) =>
  ({ id, unitId, name: `${unitId ?? id} then`, maxWounds: 1, wounds: 1, shaken: false, activated: false, destroyed, xp, kills });

const battle = (id: string, mine: ReturnType<typeof unit>[], myVp: number, theirVp: number): FinishedBattle => ({
  id, startedAt: '', finishedAt: '', mission: STANDARD_MISSION, round: 4, objectives: 0, control: [], counters: {},
  sides: [
    { id: 'me', name: 'Me', team: 'A', forceId: 'f', bp: 0, vpAdjust: myVp, agendas: [], manipulations: [], units: mine },
    { id: 'them', name: 'Them', team: 'B', bp: 0, vpAdjust: theirVp, agendas: [], manipulations: [], units: [] },
  ],
} as unknown as FinishedBattle);

describe('forceStats', () => {
  it('tallies the record, VP, opponents, missions and units', () => {
    const f = newForce('Iron Host');
    f.id = 'f';
    f.units.push(newUnit({ id: 'u1', name: 'Warriors' }), newUnit({ id: 'u2', name: 'Tank' }));
    f.battleLog = [
      rec({ id: '1', battleId: 'b1', sideId: 'me' }),
      rec({ id: '2', battleId: 'b2', result: 'loss' }),
      rec({ id: '3', opponent: '', vsAi: true, result: 'draw' }),
      rec({ id: '4', patrol: true, result: 'loss' }),
    ];
    const history = [
      battle('b1', [unit('t1', 'u1', 3), unit('t2', 'u2', 0, true), unit('t3', undefined, 9)], 6, 2),
      battle('b2', [unit('t1', 'u1', 0, true, 2), unit('t2', 'gone', 1)], 2, 8),
    ];
    const s = forceStats(f, history);
    expect(s.record).toEqual({ win: 1, loss: 1, draw: 1 });
    expect(s.games).toBe(3);
    expect(s.winRate).toBeCloseTo(1 / 3);
    expect(s.tracked).toBe(2);
    expect(s.avgVp).toBe(4);
    expect(s.avgOppVp).toBe(5);
    expect(s.byOpponent).toEqual([{ name: 'Bob', record: { win: 1, loss: 1, draw: 0 } }, { name: 'AI', record: { win: 0, loss: 0, draw: 1 } }]);
    expect(s.byMission).toEqual([{ name: STANDARD_MISSION.name, record: { win: 1, loss: 1, draw: 0 } }]);
    expect(s.units).toEqual([
      { unitId: 'u1', name: 'Warriors', games: 2, kills: 5, wiped: 1 },
      { unitId: 'gone', name: 'gone then', games: 1, kills: 1, wiped: 0 },
      { unitId: 'u2', name: 'Tank', games: 1, kills: 0, wiped: 1 },
    ]);
    expect(s.mvp?.unitId).toBe('u1');
  });

  it('copes with an empty log', () => {
    const s = forceStats(newForce('New'));
    expect(s).toMatchObject({ games: 0, winRate: 0, avgVp: undefined, units: [], mvp: undefined });
  });
});

describe('mvp', () => {
  it('breaks ties by fewer wipes, then more games, and needs a kill', () => {
    const a = { unitId: 'a', name: 'A', games: 2, kills: 4, wiped: 1 };
    const b = { unitId: 'b', name: 'B', games: 1, kills: 4, wiped: 0 };
    expect(mvp([a, b])?.unitId).toBe('b');
    expect(mvp([{ ...a, kills: 0 }])).toBeUndefined();
  });
});
