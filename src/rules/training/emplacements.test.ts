import { describe, expect, it } from 'vitest';
import { SHARD_TYPES, TRAINING } from '../downtimeData';
import { towerDps } from './dps';
import {
  craftDefault, craftDefaultProblem, defaultHidden, defaultsFor, DEFAULTS, freedDefaults, defaultTower, defaultValue, emplacementUses,
  readyDefaults,
} from './emplacements';
import { recipesFor, unitTower } from './recipes';
import { shardPiece, shardValue } from './shards';
import { FORCES } from './testForces';
import { blankRun } from './testRun';
import type { ShardType } from '../downtimeData';
import type { Grade, Recipe } from './types';

// Default towers: the 40 Shard kinds once each, exact grades, hidden by a unit recipe, crafting, and their strength.

const put = (run: ReturnType<typeof blankRun>, type: ShardType, grade: Grade, draft = false) => {
  const p = shardPiece(run.nextId++, { x: 20 + run.nextId * 2, y: 30 }, type, grade, draft);
  run.pieces.push(p);
  return p;
};
const recipe = (slots: [ShardType, Grade][]): Recipe => ({ unitId: 'u', name: 'U', points: 100, slots: slots.map(([type, grade]) => ({ type, grade })) });

describe('default recipes', () => {
  it('use each of the 40 Shard kinds exactly once', () => {
    const seen = DEFAULTS.flatMap((d) => d.slots.map(([t, g]) => `${t}${g}`));
    const all = (Object.keys(SHARD_TYPES) as ShardType[]).flatMap((t) => [1, 2, 3, 4, 5].map((g) => `${t}${g}`));
    expect(all).toHaveLength(40);
    expect([...seen].sort()).toEqual([...all].sort());
    expect(new Set(DEFAULTS.map((d) => d.key)).size).toBe(DEFAULTS.length);
  });

  it('take their exact grades: a higher one does not fit', () => {
    const d = DEFAULTS.find((x) => x.key === 'picket')!;
    const run = blankRun();
    const f = put(run, 'firepower', 1);
    const s = put(run, 'swift', 1);
    const c = put(run, d.slots[2][0], 1);
    expect(emplacementUses(d, [f, s, c])).toEqual([f.id, s.id, c.id]);
    const hi = shardPiece(99, { x: 0, y: 0 }, 'firepower', 2, false);
    expect(emplacementUses(d, [hi, s, c])).toBeNull();
  });

  it('are hidden when a unit recipe fills from their Shards', () => {
    const picket = DEFAULTS.find((x) => x.key === 'picket')!;
    const [t0, g0] = picket.slots[0];
    const [t1, g1] = picket.slots[1];
    expect(defaultHidden({ recipes: [recipe([[t0, g0 as Grade], [t1, g1 as Grade]])] }, picket)).toBe(true);
    expect(defaultHidden({ recipes: [recipe([[t0, (g0 + 1) as Grade]])] }, picket)).toBe(false);
    expect(defaultsFor({ recipes: [] })).toHaveLength(DEFAULTS.length);
  });

  it('are freed once the unit whose recipe hid them is crafted', () => {
    const picket = DEFAULTS.find((x) => x.key === 'picket')!;
    const [t0, g0] = picket.slots[0];
    const [t1, g1] = picket.slots[1];
    const r = { ...recipe([[t0, g0 as Grade], [t1, g1 as Grade]]), unitId: 'hider' };
    expect(defaultHidden({ recipes: [r], crafted: [] }, picket)).toBe(true);
    expect(freedDefaults({ recipes: [r], crafted: [] })).toEqual([]);
    expect(defaultHidden({ recipes: [r], crafted: ['hider'] }, picket)).toBe(false);
    expect(freedDefaults({ recipes: [r], crafted: ['hider'] }).map((d) => d.key)).toContain('picket');
    expect(defaultsFor({ recipes: [r], crafted: ['hider'] })).toHaveLength(DEFAULTS.length);
  });
});

describe('crafting a default', () => {
  it('stands on a used Shard, turns the rest to rubble, and can be built again', () => {
    const d = DEFAULTS.find((x) => x.key === 'picket')!;
    const run = blankRun();
    for (let n = 0; n < 2; n++) {
      const ps = d.slots.map(([t, g]) => put(run, t, g as Grade));
      const ready = readyDefaults(run).find((r) => r.key === 'picket')!;
      expect(ready.uses).toEqual(ps.map((p) => p.id));
      expect(craftDefaultProblem(run, 'picket', ready.uses, 12345)).toMatch(/stand on/);
      craftDefault(run, 'picket', ready.uses, ps[1].id);
      const t = run.pieces.find((p) => p.id === ps[1].id)!;
      expect(t.kind).toBe('default');
      expect(run.pieces.filter((p) => ready.uses.includes(p.id) && p.kind === 'rubble')).toHaveLength(2);
    }
    expect(run.crafted).toEqual([]);
    expect(run.pieces.filter((p) => p.kind === 'default')).toHaveLength(2);
  });

  it('with the draft stands in for the keep', () => {
    const d = DEFAULTS.find((x) => x.key === 'barricade')!;
    const run = blankRun();
    const ps = d.slots.map(([t, g]) => put(run, t, g as Grade, true));
    const extra = put(run, 'blast', 3, true);
    run.draft = { step: 'place', hand: [], placed: [...ps, extra].map((p) => p.id) };
    expect(craftDefaultProblem(run, 'barricade', ps.map((p) => p.id), ps[0].id)).toMatch(/whole draft/);
    run.draft.step = 'keep';
    craftDefault(run, 'barricade', ps.map((p) => p.id), ps[0].id);
    expect(run.draft.step).toBe('done');
    expect(run.pieces.find((p) => p.id === extra.id)!.kind).toBe('rubble');
  });

  it('is only between waves, and not for a hidden default', () => {
    const run = blankRun();
    run.phase = 'wave';
    expect(craftDefaultProblem(run, 'picket', [1, 2, 3], 1)).toMatch(/between waves/);
    run.phase = 'build';
    const [t0, g0] = DEFAULTS[0].slots[0];
    run.recipes = [recipe([[t0, g0 as Grade]])];
    expect(craftDefaultProblem(run, DEFAULTS[0].key, [1, 2, 3], 1)).toMatch(/No such/);
  });
});

describe('default strength', () => {
  /** A crafted unit's damage a second per point of recipe value, over the sample forces. */
  const unitPer = (() => {
    const per = FORCES.flatMap((f) => recipesFor(f.units).map((r) => {
      const u = f.units.find((x) => x.id === r.unitId)!;
      const v = r.slots.reduce((n, s) => n + shardValue(s.grade), 0);
      return towerDps(unitTower(u, 1, { x: 10, y: 10 }, 0), TRAINING.defaults.dpsDefense) / v;
    }));
    return per.reduce((a, b) => a + b, 0) / per.length;
  })();

  it('the measured unit figure in TRAINING.defaults still holds (within 10%)', () => {
    expect(Math.abs(unitPer / TRAINING.defaults.unitDps - 1)).toBeLessThan(0.1);
  });

  it.each(DEFAULTS.map((d) => [d.key, d] as const))('%s is 20-30%% weaker than a unit of the same Shards', (_k, d) => {
    const t = defaultTower(d, 1, { x: 10, y: 10 });
    const ratio = towerDps(t, TRAINING.defaults.dpsDefense) / defaultValue(d) / unitPer;
    expect(ratio).toBeGreaterThanOrEqual(0.7);
    expect(ratio).toBeLessThanOrEqual(0.8);
  });

  it('takes no XP, levels, traits or relics', () => {
    const t = defaultTower(DEFAULTS[0], 1, { x: 10, y: 10 });
    for (const k of ['xp', 'up', 'cap', 'relics', 'quirks', 'skills', 'unitId']) expect(t).not.toHaveProperty(k);
    expect(t.guns.every((g) => g.shard)).toBe(true);
  });
});
