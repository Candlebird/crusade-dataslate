import { describe, expect, it } from 'vitest';
import type { Force } from '../../model/types';
import { newUnit } from '../../model/factory';
import { applySortie } from '../downtime';
import { SORTIE, TRAINING } from '../downtimeData';
import { createRun as createSortie } from '../sortie';
import { bankShared, sharedPreview } from './shared';
import { blankRun } from './testRun';
import type { TrainingRun } from './types';

// The end of a run handed to the Sortie side, and a slain nemesis met hurt on the next Sortie.

function force(): Force {
  return { id: 'f', name: 'F', ledger: [], units: [newUnit({ id: 'a', name: 'Alpha', quirks: ['eagle'] }), newUnit({ id: 'b', name: 'Bravo', trinket: 'charm' })] } as unknown as Force;
}

function ended(o: Partial<TrainingRun> = {}): TrainingRun {
  const run = blankRun();
  run.phase = 'over';
  run.recipes = [{ unitId: 'a', name: 'Alpha' }, { unitId: 'b', name: 'Bravo' }] as TrainingRun['recipes'];
  return Object.assign(run, o);
}

describe('shared bank', () => {
  it('puts quirks on, equips or spares the trinket, feeds the bestiary and bleeds the nemesis, once', () => {
    const f = force();
    const run = ended({
      gains: [{ unitId: 'a', name: 'Alpha', quirk: 'brute', good: true }, { unitId: 'b', name: 'Bravo', quirk: 'frail', good: false }],
      trinket: { offered: true, id: 'lens', unitId: 'a' },
      beasts: { swarm: { met: 1, slain: 4 } },
      nemesis: { id: 'butcher', name: 'Gorrhul', grudge: 1, rematch: 0, sig: 'rage', sigName: 'Mounting Rage', slain: true },
    });
    expect(sharedPreview(run).length).toBe(5);
    const lines = bankShared(f, run);
    expect(f.units[0].quirks).toEqual(['eagle', 'brute']);
    expect(f.units[1].quirks).toEqual(['frail']);
    expect(f.units[0].trinket).toBe('lens');
    expect(f.sortie?.bestiary?.['Fang Swarms']).toEqual({ met: 1, slain: 4 });
    expect(f.sortie?.bled).toEqual({ butcher: 1 });
    expect(lines.length).toBeGreaterThan(3);
    expect(bankShared(f, run)).toEqual([]);
    expect(f.sortie?.bled).toEqual({ butcher: 1 });

    const g = force();
    bankShared(g, ended({ trinket: { offered: true, id: 'lens', unitId: 'b' } }));
    expect(g.units[1].trinket).toBe('charm');
    expect(g.sortie?.trinkets).toEqual(['lens']);
  });

  it('a nemesis slain in Training meets the next Sortie hurt and a trick short; the meeting spends it', () => {
    const units = [newUnit({ id: 'a', name: 'Alpha' })];
    let seed = 1;
    // A seed whose lord is the butcher (with a grudge it often waits; find one where it does).
    let run = createSortie(units, seed, 'free', 'short', { nemesis: { butcher: 1 }, slain: { butcher: 2 }, bled: { butcher: 1 } });
    while (run.boss !== 'butcher') run = createSortie(units, ++seed, 'free', 'short', { nemesis: { butcher: 1 }, slain: { butcher: 2 }, bled: { butcher: 1 } });
    const plain = createSortie(units, seed, 'free', 'short', { nemesis: { butcher: 1 }, slain: { butcher: 2 } });
    expect(plain.rematch).toBe(2);
    expect(run.rematch).toBe(1);
    expect(run.weaken).toBeCloseTo(TRAINING.shared.nemesis.bled);
    expect(run.journal.some((j) => /wounds your force gave it in Training/.test(j.text))).toBe(true);

    const none = createSortie(units, seed, 'free', 'short', { nemesis: { butcher: 1 }, bled: { butcher: 2 } });
    expect(none.rematch).toBeUndefined();
    expect(none.omens).toBe(Math.min(2, SORTIE.omens.need - 1));
    expect(none.weaken).toBeCloseTo(Math.min(SORTIE.maxWeaken, 2 * TRAINING.shared.nemesis.bled));

    const f = force();
    f.sortie = { bled: { butcher: 1 } };
    run.met = { 'lord:butcher': { met: 1, slain: 0 } };
    run.over = 'fell';
    // The weekly never brings the wound, so meeting the lord there keeps it.
    const w = force();
    w.sortie = { bled: { butcher: 1 } };
    applySortie(w, { ...structuredClone(run), weekly: '2026-W43' }, '2026-10-24', () => 'x', () => 0.99);
    expect(w.sortie?.bled).toEqual({ butcher: 1 });
    applySortie(f, run, '2026-10-24', () => 'x', () => 0.99);
    expect(f.sortie?.bled).toBeUndefined();
  });

  it('says so when the spares are full', () => {
    const f = force();
    f.sortie = { trinkets: Array(SORTIE.trinkets.spares).fill('charm') };
    const lines = bankShared(f, ended({ trinket: { offered: true, id: 'lens', unitId: 'b' } }));
    expect(f.sortie.trinkets?.length).toBe(SORTIE.trinkets.spares);
    expect(lines.some((l) => /spares are full/.test(l))).toBe(true);
  });
});
