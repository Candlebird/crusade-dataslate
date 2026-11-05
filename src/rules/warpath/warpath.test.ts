import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeBook } from '../../armyforge/book';
import type { Force } from '../../model/types';
import { FORCES } from '../training/testForces';
import { WARPATH } from './data';
import { choose, reroll, skip, xpNeed } from './levels';
import { autoplay, heroesOf, newRun, step } from './sim';
import { hordeStep, siteStep } from './events';
import { callLevel } from './levels';
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

  it('call-in cards only on every third level-up, and then at least one', () => {
    const run = start(1);
    for (let n = 1; n <= 6; n++) {
      run.queued = 1;
      step(run, { dx: 0, dy: 0 });
      const calls = run.offer.filter((c) => c.kind === 'call').length;
      expect(callLevel(run)).toBe(n % 3 === 0);
      if (n % 3 === 0) expect(calls).toBeGreaterThan(0);
      else expect(calls).toBe(0);
      skip(run);
    }
  });

  it('elites come after the first minute', () => {
    const run = autoplay(start(2, 'el'), 240);
    expect(run.enemies.some((e) => e.elite)).toBe(true);
    const early = autoplay(start(2, 'el'), 50);
    expect(early.enemies.some((e) => e.elite)).toBe(false);
  });

  it('a horde is announced, then lands all at once', () => {
    const run = start(0, 'h');
    run.t = WARPATH.horde.from;
    hordeStep(run);
    expect(run.horde).toBeDefined();
    expect(run.banner?.tone).toBe('warn');
    const before = run.enemies.length;
    run.t = run.horde!.at;
    hordeStep(run);
    expect(run.horde).toBeUndefined();
    expect(run.enemies.length - before).toBeGreaterThanOrEqual(WARPATH.horde.least);
    expect(run.nextHorde).toBeGreaterThan(run.t + WARPATH.horde.min - 1);
  });

  it('sites: a shrine held gives the Battle Hymn, an aid station heals, a cache gives a level-up', () => {
    const run = start(0, 'site');
    run.sites = [
      { id: 900, kind: 'shrine', x: 0, y: 0, held: 0 },
      { id: 901, kind: 'well', x: 0, y: 0, held: 0 },
      { id: 902, kind: 'cache', x: 0, y: 0, held: 0 },
    ];
    run.nextSite = 1e9;
    run.hp = 10;
    siteStep(run, 0.1);
    expect(run.enemies.filter((e) => e.elite)).toHaveLength(WARPATH.sites.ambush);
    expect(run.queued).toBe(0);
    for (let i = 0; i < 120 && (run.sites ?? []).length; i++) siteStep(run, 0.1);
    expect(run.hp).toBeGreaterThan(10);
    expect(run.queued).toBe(1);
    expect(run.hymnUntil).toBeGreaterThan(run.t);
    expect(run.sites).toHaveLength(0);
  });

  it('sites turn up out of sight, and a champion holds its ground', () => {
    const run = start(0, 'champ');
    for (let i = 0; i < 40 && !(run.sites ?? []).some((s) => s.kind === 'champion'); i++) {
      run.t = (run.nextSite ?? 0);
      run.sites = [];
      siteStep(run, 0.1);
    }
    const site = run.sites!.find((s) => s.kind === 'champion')!;
    expect(Math.hypot(site.x, site.y)).toBeGreaterThan(WARPATH.sites.near - 4);
    const champ = run.enemies.find((e) => e.champ === site.id)!;
    expect(champ.guard).toBe(site.id);
    const at = { x: champ.x, y: champ.y };
    for (let i = 0; i < 120; i++) step(run, { dx: 0, dy: 0 });
    expect(champ.x).toBe(at.x);
    expect(champ.y).toBe(at.y);
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
