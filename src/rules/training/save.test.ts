import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import maze from '../trainingTestMaze.json';
import { botBuild, playRun } from './bot';
import { rand } from './rng';
import { startWave, step } from './run';
import type { TrainingRun } from './types';
import { ackStale, clearSave, deserialize, loadRun, SAVE_VERSION, saveKey, saveRun, serialize, staleSave } from './save';
import { blankRun } from './testRun';

// Saving and resuming a run.

/** A localStorage stand-in. */
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    m,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('serialize', () => {
  it('round-trips a run, dice and all, without the fx', () => {
    const run = blankRun(11);
    rand(run);
    run.fx.push({ x1: 0, y1: 0, x2: 1, y2: 1, t: 1, color: '#fff' });
    run.cover.push({ x: 10, y: 10 });
    const back = deserialize(serialize(run))!;
    expect(back).toEqual({ ...run, fx: [] });
    expect(rand(back)).toBe(rand(run));
  });

  it('a run saved mid-way (crafted units, rubble, cards) plays on exactly as the original', () => {
    const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
    const units = book.units.slice(0, 4).map((cu, i) => ({ ...unitFromCatalog(cu, applySelection(cu, {}), book), id: `u${i}` }));
    const run = playRun(units, 5, { maze, maxWaves: 12 });
    expect(run.phase).toBe('build');
    expect(run.crafted.length).toBeGreaterThan(0);
    const back = deserialize(serialize(run))!;
    expect(back).toEqual({ ...run, fx: [] });
    const wave = (r: TrainingRun, at: number) => {
      at = botBuild(r, units, maze, at);
      startWave(r);
      while (r.phase === 'wave') step(r, 0.05);
      return at;
    };
    let a = 0;
    let b = 0;
    for (let i = 0; i < 3 && run.phase === 'build'; i++) { a = wave(run, a); b = wave(back, b); }
    // Equal field by field (key order may differ: a field first set on the copy lands later in its JSON).
    expect(JSON.parse(serialize(back))).toEqual(JSON.parse(serialize(run)));
  });

  it('refuses what isn\'t a run', () => {
    expect(deserialize('nope')).toBeNull();
    expect(deserialize('{"v":2}')).toBeNull();
    expect(deserialize(JSON.stringify({ ...blankRun(), v: 0 }))).toBeNull();
  });
});

describe('localStorage', () => {
  it('saves under the force, loads it back, and clears it', () => {
    const s = fakeStorage();
    vi.stubGlobal('localStorage', s);
    const run = blankRun();
    run.wave = 4;
    saveRun(run);
    expect(s.m.has(saveKey('f'))).toBe(true);
    const got = loadRun('f')!;
    expect(got.run.wave).toBe(4);
    expect(got.savedAt).not.toBe('');
    expect(loadRun('other')).toBeNull();
    clearSave('f');
    expect(loadRun('f')).toBeNull();
  });

  it('never loads a run that is over', () => {
    vi.stubGlobal('localStorage', fakeStorage());
    saveRun({ ...blankRun(), phase: 'over' });
    expect(loadRun('f')).toBeNull();
  });

  it('drops a save from an older version, saying so (staleSave) until the note is shown (ackStale), and never loads it', () => {
    const s = fakeStorage();
    vi.stubGlobal('localStorage', s);
    s.setItem(saveKey('f'), JSON.stringify({ v: SAVE_VERSION - 1, savedAt: 'x', run: { ...blankRun(), v: SAVE_VERSION - 1 } }));
    expect(loadRun('f')).toBeNull();
    expect(staleSave('f')).toBe(true);
    expect(s.m.has(saveKey('f'))).toBe(false);
    // A second render before the note is shown still says so; after it, never again.
    expect(staleSave('f')).toBe(true);
    ackStale('f');
    expect(staleSave('f')).toBe(false);
    s.setItem(saveKey('f'), 'not json');
    expect(staleSave('f')).toBe(true);
    saveRun(blankRun());
    expect(staleSave('f')).toBe(false);
    expect(loadRun('f')).not.toBeNull();
  });

  it('shrugs off storage that throws or is missing', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    vi.stubGlobal('localStorage', bad);
    expect(() => saveRun(blankRun())).not.toThrow();
    expect(loadRun('f')).toBeNull();
    expect(() => clearSave('f')).not.toThrow();
    expect(staleSave('f')).toBe(false);
    vi.stubGlobal('localStorage', undefined);
    expect(() => saveRun(blankRun())).not.toThrow();
    expect(loadRun('f')).toBeNull();
  });
});
