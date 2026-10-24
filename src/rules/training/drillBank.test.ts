import { describe, expect, it } from 'vitest';
import type { Force } from '../../model/types';
import { newUnit } from '../../model/factory';
import { DRILL_GOALS, blankDrill, drillEarned } from './drill';
import { bankDrill, drillNews, drillPreview, statsAfter } from './drillBank';
import { blankRun, testUnit } from './testRun';
import type { TrainingRun } from './types';

// Drill Honours banked: a run's counts once, the goals it reached, and the preview that leaves the force alone.

const force = (o: Partial<Force> = {}): Force =>
  ({ id: 'f', name: 'Iron Hand', ledger: [], units: [newUnit({ id: 'a', name: 'Alpha' })], ...o }) as unknown as Force;

function ended(o: Partial<TrainingRun> = {}): TrainingRun {
  const run = blankRun(5);
  run.phase = 'over';
  run.wave = 7;
  run.cleared = 6;
  run.clean = 3;
  run.crafted = ['a'];
  run.recipes = [{ unitId: 'a', name: 'Alpha' }] as TrainingRun['recipes'];
  run.pieces.push(testUnit({ unitId: 'a', name: 'Alpha', kills: 120 }), testUnit({ unitId: 'b', kind: 'unit', kills: 30 }));
  run.beasts = { lord: { met: 1, slain: 1 }, drone: { met: 9, slain: 9 }, 'real:0': { met: 1, slain: 1 } };
  run.nexus = { threat: 1, affixes: [], lords: [{ key: 'g', name: 'Vex', tier: 'Rare', trick: 'ward', from: 'guardian', slain: true, by: 'a' }] } as unknown as TrainingRun['nexus'];
  return Object.assign(run, o);
}

describe('drill bank', () => {
  it('adds a run to the counts', () => {
    expect(statsAfter(blankDrill(), ended())).toEqual({ runs: 1, kills: 150, bosses: 2, lords: 1, clean: 3, crafted: 1, sieges: 0 });
    const more = statsAfter({ ...blankDrill(), clean: 9, crafted: 4 }, ended());
    expect(more).toMatchObject({ clean: 9, crafted: 4 });
  });

  it('counts a siege once a week, keeping the week\'s best', () => {
    const a = statsAfter(blankDrill(), ended({ siege: '2026-W43' }));
    expect(a).toMatchObject({ sieges: 1, siege: { week: '2026-W43', best: 7 } });
    const b = statsAfter(a, ended({ siege: '2026-W43', wave: 4, cleared: 3 }));
    expect(b).toMatchObject({ sieges: 1, siege: { week: '2026-W43', best: 7 } });
    const c = statsAfter(b, ended({ siege: '2026-W44', wave: 3, cleared: 2 }));
    expect(c).toMatchObject({ sieges: 2, siege: { week: '2026-W44', best: 3 } });
  });

  it('banks once, and names the goals reached', () => {
    const f = force({ drill: blankDrill() });
    const run = ended();
    const preview = drillPreview(f, run);
    expect(preview).toContain(0);
    expect(f.drill).toEqual(blankDrill());
    const before = bankDrill(f, run);
    expect(before).toEqual([]);
    f.trainingBest = run.cleared;
    const lines = drillNews(f, run, before);
    expect(run.drilled!.earned).toEqual(drillEarned(f));
    expect(run.drilled!.earned).toEqual(preview);
    expect(lines[0]).toMatch(/^Drill Honour: /);
    expect(bankDrill(f, run)).toBeNull();
    expect(f.drill!.runs).toBe(1);
    expect(drillPreview(f, run)).toEqual(run.drilled!.earned);
  });

  it('the preview counts lore this run learns', () => {
    const lore = DRILL_GOALS.findIndex((g) => g.goal === 'lore');
    const n = DRILL_GOALS[lore].n;
    const known = ['Spectres', 'Shadow Hounds', 'Reapers', 'Phantoms', 'Fiends', 'Butchers'].slice(0, n - 1);
    const bestiary = Object.fromEntries(known.map((k) => [k, { met: 1, slain: 1 }]));
    const f = force({ drill: blankDrill(), sortie: { bestiary } });
    expect(drillEarned(f)).not.toContain(lore);
    expect(drillPreview(f, ended({ beasts: { swarm: { met: 3, slain: 3 } } }))).toContain(lore);
    expect(Object.keys(f.sortie!.bestiary!)).toHaveLength(n - 1);
  });

  it('an old force starts from its records, without counting this run twice', () => {
    const a = newUnit({ id: 'a', name: 'Alpha' });
    a.trainingRecord = { best: 5, kills: 100, lords: 0, runs: 3, mvps: 0 };
    const f = force({ units: [a] });
    bankDrill(f, ended());
    expect(f.drill).toMatchObject({ runs: 4, kills: 250 });
  });
});
