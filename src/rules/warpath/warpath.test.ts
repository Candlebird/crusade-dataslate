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
import { hurtSquad, spawnEnemy } from './enemies';
import { woundsPer } from './mods';
import { chunkTerrain, inCover } from './field';
import { bankRenown, cantTake, laurelsFor, metaOf, nodeCost, nodeState, HONOURS, prestige, PRESTIGE, renownOf, resetTree, takeNode, TREE_FX } from './meta';
import { hurtEnemy } from './combat';
import { mods } from './mods';

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

  it('meta: runs earn Renown, Renown buys tree nodes down a branch, the run starts with them', () => {
    const force = forceOf(2);
    const base = start(2);
    base.t = 600; base.kills = 3000; base.captains = 3;
    const n = bankRenown(force, base);
    expect(n).toBe(renownOf(base, 0));
    expect(metaOf(force).renown).toBe(n);
    base.auto = true;
    expect(bankRenown(force, base)).toBe(0);
    force.warpath!.meta!.renown = 10_000;
    // Tier 2 needs tier 1; keystones need prestige.
    expect(cantTake(metaOf(force), 'drill')).toMatch(/tier above/);
    expect(takeNode(force, 'edge')).toBe(true);
    expect(takeNode(force, 'drill')).toBe(true);
    expect(takeNode(force, 'vigour')).toBe(true);
    expect(metaOf(force).renown).toBe(10_000 - nodeCost('edge', 0) - nodeCost('drill', 0) - nodeCost('vigour', 0));
    expect(nodeState(metaOf(force), 'overcharge')).toBe('sealed');
    expect(takeNode(force, 'overcharge')).toBe(false);
    // A choice shuts its rival.
    expect(takeNode(force, 'hail')).toBe(true);
    expect(nodeState(metaOf(force), 'bigGuns')).toBe('shut');
    expect(takeNode(force, 'bigGuns')).toBe(false);
    const run = newRun({ force, heroId: heroesOf(force)[0].id, books: [echoes], mode: 'normal', date: '2026-11-04', seed: 's1', theme: echoes });
    const plain = start(2);
    expect(run.maxHp).toBeGreaterThan(plain.maxHp);
    expect(mods(run).shootRate).toBeGreaterThan(mods(plain).shootRate * 1.2);
    expect(mods(run).dmg).toBeLessThan(mods(plain).dmg);
    // A reset gives most of it back and opens both sides again.
    const before = metaOf(force).renown;
    const back = resetTree(force);
    expect(back).toBe(Math.floor((nodeCost('edge', 0) + nodeCost('drill', 0) + nodeCost('vigour', 0) + nodeCost('hail', 0)) * PRESTIGE.refund));
    expect(metaOf(force).renown).toBe(before + back);
    expect(nodeState(metaOf(force), 'bigGuns')).toBe('locked');
  });

  it('meta: the old Armoury comes back as Renown; prestige wipes the tree for Laurels and opens keystones', () => {
    const force = forceOf(2);
    force.warpath = { meta: { renown: 900, cycle: PRESTIGE.min - 1, total: 5000, prestige: 0, laurels: 0, levels: { vigour: 2 } } };
    expect(metaOf(force).renown).toBe(900 + 20 + 27);
    expect(prestige(force)).toBe(0);
    expect(force.warpath.meta!.levels).toBeUndefined();
    force.warpath.meta!.cycle = 4500;
    expect(laurelsFor(4500)).toBe(3);
    expect(prestige(force)).toBe(3);
    expect(metaOf(force)).toMatchObject({ renown: 0, cycle: 0, prestige: 1, laurels: 3, nodes: {} });
    force.warpath.meta!.renown = 5000;
    for (const id of ['lore', 'lodestone', 'orders', 'muster'] as const) expect(takeNode(force, id)).toBe(true);
    expect(cantTake(metaOf(force), 'veterans')).toMatch(/prestige 2/);
    const run = newRun({ force, heroId: heroesOf(force)[0].id, books: [echoes], mode: 'normal', date: '2026-11-04', seed: 's1', theme: echoes });
    expect(run.queued).toBe(TREE_FX.orders);
    // Muster: call-in cards every 2nd level-up.
    run.levelUps = 2;
    expect(callLevel(run)).toBe(true);
    run.t = 600;
    expect(renownOf(run, 3)).toBeGreaterThan(renownOf(run, 0));
  });

  it('meta: each prestige adds Honours (damage and hero HP) to every run, up to a cap', () => {
    const force = forceOf(2);
    const opts = { force, heroId: heroesOf(force)[0].id, books: [echoes], mode: 'normal' as const, date: '2026-11-04', seed: 's1', theme: echoes };
    const plain = newRun(opts);
    force.warpath = { meta: { renown: 0, cycle: 0, total: 0, prestige: 4, laurels: 6, nodes: {} } };
    const vet = newRun(opts);
    expect(vet.maxHp).toBeCloseTo(plain.maxHp * (1 + HONOURS.hp * 4), -1);
    expect(mods(vet).dmg).toBeCloseTo(mods(plain).dmg * (1 + HONOURS.dmg * 4));
    force.warpath.meta!.prestige = 50;
    expect(mods(newRun(opts)).dmg).toBeCloseTo(mods(plain).dmg * (1 + HONOURS.dmg * HONOURS.max));
  });

  it('the swarm goes for the nearest body: a squad loses its own models, the hero loses nothing for it', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    expect(s).toBeTruthy();
    run.enemies = [];
    run.queued = 0;
    run.phase = 'play';
    run.hp = run.maxHp;
    s.alive = s.size;
    s.wounds = 0;
    s.x = run.hx + 30;
    s.y = run.hy;
    const pack = new Set<unknown>();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const e = spawnEnemy(run, 0, s.x + Math.cos(a) * 3, s.y + Math.sin(a) * 3);
      e.hp = e.maxHp = 1e6;
      e.shoots = false;
      pack.add(e);
    }
    const before = run.hp;
    for (let i = 0; i < 120 && run.phase === 'play'; i++) {
      run.enemies = run.enemies.filter((e) => pack.has(e));
      step(run, { dx: 0, dy: 0 });
    }
    expect(s.alive * s.tough - s.wounds).toBeLessThan(s.size * s.tough);
    expect(run.hp).toBeGreaterThanOrEqual(before - 1e-9);
  });

  it('a big horde lands a batch a step, not all at once', () => {
    const run = start(0, 'horde');
    run.t = 1200;
    run.enemies = [];
    run.horde = { at: run.t, kind: 'ring', a: 0 };
    hordeStep(run);
    expect(run.landing).toBeTruthy();
    const n = run.landing!.n;
    expect(n).toBeGreaterThan(WARPATH.horde.batch);
    expect(run.enemies.length).toBe(WARPATH.horde.batch);
    for (let i = 0; i < 20 && run.landing; i++) hordeStep(run);
    expect(run.landing).toBeUndefined();
    expect(run.enemies.length).toBe(n);
  });

  it('each drill level doubles the wounds a model takes to fall', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    s.alive = s.size;
    s.wounds = 0;
    s.level = 0;
    expect(woundsPer(s)).toBe(s.tough);
    s.level = 2;
    expect(woundsPer(s)).toBe(s.tough * 4);
    const k = 1 / mods(run).losses;
    hurtSquad(run, s, s.tough * 3.9 * k);
    expect(s.alive).toBe(s.size);
    hurtSquad(run, s, s.tough * 0.2 * k);
    expect(s.alive).toBe(s.size - 1);
  });

  it('infantry take cover near the hero and leave it when the hero moves on', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    let t;
    for (let c = 1; c < 40 && !t; c++) t = chunkTerrain(run.seed, c, 0).find((x) => x.kind === 'cover');
    expect(t).toBeTruthy();
    run.hx = t!.x;
    run.hy = t!.y + t!.r + 4;
    run.enemies = [];
    run.queued = 0;
    run.phase = 'play';
    run.hp = run.maxHp;
    for (const q of run.squads) { delete q.cover; delete q.wander; q.x = run.hx; q.y = run.hy; }
    for (let i = 0; i < 60 * 8; i++) { run.enemies = []; step(run, { dx: 0, dy: 0 }); }
    expect(s.cover).toBeTruthy();
    expect(inCover(run.seed, s.x, s.y)).toBe(true);
    run.hx += 40;
    step(run, { dx: 0, dy: 0 });
    expect(s.cover).toBeUndefined();
  });

  it('keystones change the run: Second Wind, Executioner, Plunder', () => {
    const run = start(0, 'ks');
    run.meta = { secondWind: 1, executioner: 1, plunder: 1 };
    run.hp = -5;
    step(run, { dx: 0, dy: 0 });
    expect(run.phase).toBe('play');
    expect(run.hp).toBeCloseTo(run.maxHp * TREE_FX.secondWind, 0);
    run.hp = -5;
    step(run, { dx: 0, dy: 0 });
    expect(run.phase).toBe('over');
    // Executioner: a hit that leaves a non-boss under 15% of its HP kills it.
    const r2 = start(0, 'ex');
    r2.meta = { executioner: 1 };
    for (let i = 0; i < 300 && !r2.enemies.length; i++) step(r2, { dx: 0, dy: 0 });
    const e = r2.enemies[0];
    e.hp = e.maxHp = 100;
    hurtEnemy(r2, 0, e, 90);
    expect(e.hp).toBeLessThanOrEqual(0);
    // Plunder: a cache gives two level-ups.
    const r3 = start(0, 'pl');
    r3.meta = { plunder: 1 };
    r3.sites = [{ id: 900, kind: 'cache', x: 0, y: 0, held: 0 }];
    r3.nextSite = 1e9;
    for (let i = 0; i < 80 && (r3.sites ?? []).length; i++) siteStep(r3, 0.1);
    expect(r3.queued).toBe(TREE_FX.plunder);
  });
});
