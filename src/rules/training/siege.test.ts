import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import { weekSeed } from '../sortie';
import maze from '../trainingTestMaze.json';
import { playRun } from './bot';
import { rand } from './rng';
import { createRun } from './run';
import { drawDraft } from './shards';
import { draftDice, isSiege, siegeScore } from './siege';
import { planWave } from './waves';
import type { TrainingRun } from './types';

// The Weekly Siege: the week's seed gives everyone the same cover, drafts and waves (scaled by points), however they play.

const bookForce = (file: string): Unit[] => {
  const book = normalizeBook(JSON.parse(readFileSync(file, 'utf8')));
  return book.units.map((cu) => unitFromCatalog(cu, applySelection(cu, {}), book));
};
const VOID = bookForce('armies/void-echoes.gf.json').slice(0, 8);
const STALKERS = bookForce('armies/shadow-stalkers.aof.json').slice(0, 8);
const WEEK = '2026-W43';
const siege = (units: Unit[], week = WEEK) => createRun('f', units, weekSeed(week), undefined, undefined, { siege: week });
/** A plan's shape, without the HP (that scales with points). */
const shape = (run: TrainingRun, w: number) => planWave(run, w).map((s) => [s.kind, s.flies]);

describe('weekly siege', () => {
  it('gives every force the week\'s cover and first draft', () => {
    const a = siege(VOID);
    const b = siege(STALKERS);
    expect(isSiege(a)).toBe(true);
    expect(a.cover).toEqual(b.cover);
    expect(a.draft.hand).toEqual(b.draft.hand);
    expect(siege(VOID, '2026-W44').cover).not.toEqual(a.cover);
  });

  it('draws the same later drafts and plans the same waves however the run has rolled', () => {
    const a = siege(VOID);
    const b = siege(VOID);
    for (let i = 0; i < 37; i++) rand(b);
    a.wave = b.wave = 6;
    drawDraft(a);
    drawDraft(b);
    expect(a.draft.hand).toEqual(b.draft.hand);
    expect(planWave(a, 9)).toEqual(planWave(b, 9));
    expect(draftDice(a)).not.toBe(a);
    // A run that isn't a siege rolls its own dice.
    const own = createRun('f', VOID, weekSeed(WEEK));
    expect(draftDice(own)).toBe(own);
  });

  it('scales the waves by the force\'s points', () => {
    const a = siege(VOID);
    const big = siege(VOID);
    big.power = a.power * 2;
    const hp = (r: TrainingRun) => planWave(r, 8).reduce((n, s) => n + s.hp, 0);
    expect(hp(big)).toBeGreaterThan(hp(a));
    expect(shape(a, 3).length).toBeGreaterThan(0);
  });

  it('has no nemesis, no Nexus and no drill limits; its score is the wave reached', () => {
    const a = siege(VOID);
    expect(a.nemesis).toBeUndefined();
    expect(a.nexus).toBeUndefined();
    expect(a.drill).toBeUndefined();
    const run = playRun(VOID, weekSeed(WEEK), { maze, maxWaves: 4, siege: WEEK });
    const again = playRun(VOID, weekSeed(WEEK), { maze, maxWaves: 4, siege: WEEK, dt: 0.1 });
    expect(again.cover).toEqual(run.cover);
    expect(siegeScore(run)).toBe(Math.max(run.wave, run.cleared));
    expect(siegeScore({ ...run, wave: 9, cleared: 8 })).toBe(9);
  });
});
