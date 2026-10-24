import { describe, expect, it } from 'vitest';
import type { Force } from '../../model/types';
import { newUnit } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { bankHonours, blankRecord, deedOf, recordAfter, recordLine, runHonours, talesFor } from './records';
import { blankRun, testUnit } from './testRun';
import type { TrainingRun } from './types';

// Each crafted unit's Training record, the titles a run earns and the tales it tells, banked once.

function force(): Force {
  return { id: 'f', name: 'Iron Hand', ledger: [], trainingBest: 10, units: [newUnit({ id: 'a', name: 'Alpha' }), newUnit({ id: 'b', name: 'Bravo' }), newUnit({ id: 'c', name: 'Idle' })] } as unknown as Force;
}

function ended(o: Partial<TrainingRun> = {}): TrainingRun {
  const run = blankRun(7);
  run.phase = 'over';
  run.cleared = 12;
  run.recipes = [{ unitId: 'a', name: 'Alpha' }, { unitId: 'b', name: 'Bravo' }] as TrainingRun['recipes'];
  run.pieces.push(testUnit({ unitId: 'a', name: 'Alpha', kills: 90, tally: { shot: 1, melee: 0, holds: 4 } }), testUnit({ unitId: 'b', name: 'Bravo', kills: 20 }));
  return Object.assign(run, o);
}

describe('training records', () => {
  it('reads what a unit did, and adds it to its record', () => {
    const run = ended({ clean: 2 });
    run.nexus = { threat: 1, affixes: [], lords: [{ key: 'g', name: 'Vex', tier: 'Rare', trick: 'ward', from: 'guardian', slain: true, by: 'a' }] } as unknown as TrainingRun['nexus'];
    run.nemesis = { id: 'butcher', name: 'Gorrhul', grudge: 1, rematch: 0, sig: 'rage', sigName: 'Mounting Rage', slain: true, by: 'b' };
    const [a, b] = run.pieces as Parameters<typeof deedOf>[1][];
    expect(deedOf(run, a)).toEqual({ cleared: 12, kills: 90, holds: 4, lords: 1, nemesis: false, mvp: true, scars: 0, clean: 2 });
    expect(deedOf(run, b)).toMatchObject({ lords: 0, nemesis: true, mvp: false });
    const r = recordAfter({ best: 20, kills: 5, lords: 1, runs: 2, mvps: 0 }, deedOf(run, b));
    expect(r).toEqual({ best: 20, kills: 25, lords: 2, runs: 3, mvps: 0 });
    expect(recordAfter(undefined, deedOf(run, a))).toEqual({ best: 12, kills: 90, lords: 1, runs: 1, mvps: 1 });
    expect(recordLine(blankRecord())).toBe('best wave 0 · 0 kills · 0 lords slain · 0 runs · 0 MVPs');
  });

  it('works the honours out without touching the force', () => {
    const f = force();
    const run = ended({ cleared: TRAINING.titles.wallWarden.n, clean: TRAINING.titles.gatekeeper.n });
    const h = runHonours(run, f);
    expect(Object.keys(h.records)).toEqual(['a', 'b']);
    expect(h.best).toBe(true);
    expect(h.titles.map((g) => `${g.unitId}:${g.title}`)).toEqual(['a:wallWarden', 'a:gatekeeper', 'b:wallWarden', 'b:gatekeeper']);
    expect(h.tales.length).toBe(TRAINING.records.tales);
    expect(h.tales[0].kind).toBe('best');
    expect(h.tales[0].units).toEqual(['a']);
    expect(f.units[0].trainingRecord).toBeUndefined();
    expect(runHonours(ended(), f, 12).best).toBe(false);
  });

  it('banks records, titles and tales once, with the campaign round', () => {
    const f = force();
    let n = 0;
    const run = ended();
    run.nexus = { threat: 1, affixes: [], lords: [{ key: 'g', name: 'Vex', tier: 'Rare', trick: 'ward', from: 'guardian', slain: true, by: 'a' }] } as unknown as TrainingRun['nexus'];
    const lines = bankHonours(f, run, '2026-10-24', () => `t${n++}`, 3);
    expect(lines).toEqual(['A new best: 12 waves', 'Alpha is now known as Lordslayer']);
    expect(f.units[0].trainingRecord).toEqual({ best: 12, kills: 90, lords: 1, runs: 1, mvps: 1 });
    expect(f.units[0].titles).toEqual(['lordslayer']);
    expect(f.units[2].trainingRecord).toBeUndefined();
    expect(f.tales!.map((t) => t.kind)).toEqual(['best', 'lord', 'title']);
    expect(f.tales!.every((t) => t.round === 3 && t.date === '2026-10-24')).toBe(true);
    expect(f.tales![1].text).toContain('Vex');
    expect(bankHonours(f, run, '2026-10-24', () => 'x')).toEqual([]);
    expect(f.units[0].trainingRecord!.runs).toBe(1);
    expect(talesFor(f, 'a')).toHaveLength(3);
    expect(talesFor(f, 'b')).toHaveLength(0);
  });

  it('tells no tale for a plain run, and keeps only the latest tales', () => {
    const f = force();
    const plain = ended({ cleared: 3 });
    bankHonours(f, plain, '2026-10-24', () => 'x');
    expect(f.tales ?? []).toEqual([]);
    expect(f.units[0].trainingRecord!.runs).toBe(1);
    for (let i = 0; i < TRAINING.records.keep; i++) {
      f.trainingBest = 0;
      bankHonours(f, ended(), String(i), () => `t${i}`);
    }
    expect(f.tales).toHaveLength(TRAINING.records.keep);
    expect(f.tales![0].date).toBe(String(TRAINING.records.keep - 1));
  });
});
