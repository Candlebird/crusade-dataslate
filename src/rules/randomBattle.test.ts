import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import { allMissions } from './missions';
import { FORMATS, newBattle } from './tracker';
import { formatLabel, formatSlots, randomForces, randomFormat } from './randomBattle';

const seq = (...xs: number[]) => () => xs.shift() ?? 0;

describe('random battles', () => {
  it('puts every player on one team against the AI', () => {
    const f = randomFormat(3, true);
    expect(f.label).toBe('3 v AI');
    expect(f.teams).toEqual([['player', 'player', 'player'], ['ai']]);
    expect(randomFormat(1, true).label).toBe('1 v AI');
  });

  it('splits players into at least two teams, every player placed', () => {
    for (let i = 0; i < 200; i++) {
      const n = 2 + (i % 5);
      const f = randomFormat(n, false);
      expect(f.teams.length).toBeGreaterThanOrEqual(2);
      expect(f.teams.flat()).toEqual(Array(n).fill('player'));
      expect(f.teams.every((t) => t.length > 0)).toBe(true);
    }
    expect(randomFormat(4, false, seq(0)).label).toBe('3 v 1');
    expect(randomFormat(4, false, seq(0.99)).label).toBe('1 v 1 v 1 v 1');
  });

  it('needs two players without the AI and caps at six', () => {
    expect(randomFormat(1, false).label).toBe('1 v 1');
    expect(randomFormat(9, false).teams.flat()).toHaveLength(6);
    expect(formatLabel([['player', 'player'], ['ai']])).toBe('2 v AI');
  });

  it('picks different forces that have units to field', () => {
    const ready = ['A', 'B', 'C'].map((n) => {
      const f = newForce(n);
      f.units = [{ status: 'active' } as never];
      return f;
    });
    const picked = randomForces([...ready, newForce('Empty')], 5);
    expect(picked).toHaveLength(3);
    expect(new Set(picked.map((f) => f.name))).toEqual(new Set(['A', 'B', 'C']));
  });

  it('lists the slots to fill with forces players first, in the order a new battle fills its sides', () => {
    const f = FORMATS.find((x) => x.label === '2 v AI')!;
    expect(formatSlots(f)).toEqual([{ team: 'A', ai: false }, { team: 'A', ai: false }, { team: 'B', ai: true }]);
    const b = newBattle(allMissions()[0], 'b', '', () => 0, f);
    const open = [...b.sides.filter((x) => !x.ai), ...b.sides.filter((x) => x.ai)];
    expect(open.map((x) => ({ team: x.team, ai: !!x.ai }))).toEqual(formatSlots(f));
  });
});
