import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeBook } from '../../armyforge/book';
import type { Force } from '../../model/types';
import { FORCES } from '../training/testForces';
import { WARPATH } from './data';
import { choose, reroll, skip, xpNeed } from './levels';
import { autoplay, heroesOf, newRun, step } from './sim';
import { enemyKindsOf } from './roster';

const echoes = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
const forceOf = (i: number): Force => ({ id: `f${i}`, name: FORCES[i].name, units: FORCES[i].units } as unknown as Force);
const start = (i: number, seed = 's1') => {
  const force = forceOf(i);
  return newRun({ force, heroId: heroesOf(force)[0].id, books: [echoes], mode: 'normal', date: '2026-11-04', seed, theme: echoes });
};

describe('Warpath', () => {
  it('fields the theme book as enemy datasheets in three tiers', () => {
    const kinds = enemyKindsOf(echoes);
    expect(kinds.length).toBeGreaterThan(3);
    expect(new Set(kinds.map((k) => k.tier)).size).toBe(3);
    for (const k of kinds) expect(k.hp).toBeGreaterThan(0);
  });

  it('starts with the hero alone and the rest on the bench, under the cap', () => {
    const run = start(2);
    expect(run.squads).toHaveLength(1);
    expect(run.points).toBeLessThanOrEqual(WARPATH.cap);
    expect(run.bench.length).toBeGreaterThan(0);
    expect(run.hp).toBe(run.maxHp);
  });

  it('is deterministic for a seed', () => {
    const a = autoplay(start(0, 'x'), 90);
    const b = autoplay(start(0, 'x'), 90);
    expect(a.kills).toBe(b.kills);
    expect(a.hp).toBe(b.hp);
    expect(a.kills).toBeGreaterThan(10);
  });

  it('levels up, offers three cards, and calls units in', () => {
    const run = start(1);
    autoplay(run, 180);
    expect(run.level).toBeGreaterThan(3);
    expect(run.squads.length).toBeGreaterThan(1);
    expect(xpNeed(10)).toBeGreaterThan(xpNeed(1));
  });

  it('cards: reroll spends one, skip heals', () => {
    const run = start(3);
    run.queued = 1;
    run.hp = run.maxHp / 2;
    step(run, { dx: 0, dy: 0 });
    expect(run.phase).toBe('card');
    expect(run.offer).toHaveLength(3);
    reroll(run);
    expect(run.rerolls).toBe(WARPATH.cards.rerolls - 1);
    skip(run);
    expect(run.hp).toBeGreaterThan(run.maxHp / 2);
    expect(run.phase).toBe('play');
    run.queued = 1;
    step(run, { dx: 0, dy: 0 });
    choose(run, 0);
    expect(run.phase).toBe('play');
  });

  it('saves as plain JSON and plays on the same', () => {
    const a = autoplay(start(4, 'j'), 60);
    const b = JSON.parse(JSON.stringify(a));
    autoplay(a, 75);
    autoplay(b, 75);
    expect(b.kills).toBe(a.kills);
  });

  it('a standing hero dies', () => {
    const run = start(5);
    for (let i = 0; i < 60 * 60 * 12 && run.phase !== 'over'; i++) {
      if (run.phase === 'card') { choose(run, 0); continue; }
      step(run, { dx: 0, dy: 0 });
    }
    expect(run.phase).toBe('over');
  });
});
