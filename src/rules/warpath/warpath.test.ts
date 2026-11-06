import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeBook } from '../../armyforge/book';
import type { Force } from '../../model/types';
import { FORCES } from '../training/testForces';
import { DOCTRINE_IDS, DOCTRINES, ROLES, STRATAGEM_IDS, STRATAGEM_LEVEL, STRATAGEMS, WARPATH } from './data';
import { bladesOf, doctrineStep } from './doctrines';
import { candidates, cardText, choose, drawOffer, reroll, skip, xpNeed } from './levels';
import { autoplay, freshenRun, heroesOf, newRun, step } from './sim';
import { hordeStep, siteStep } from './events';
import { callIn, callLevel } from './levels';
import { enemyKindsOf } from './roster';
import { hurtHero, hurtSquad, missileStep, spawnEnemy, strikeSquad } from './enemies';
import { atWill, blastRadius, guardianMul, softDeadly, woundsPer } from './mods';
import { chunkTerrain, Grid, inCover } from './field';
import { heroCooldown, squadStep } from './squads';
import { roleFrom, roleOf } from './traits';
import { bankRenown, cantTake, laurelsFor, metaOf, NODE_IDS, nodeCost, nodeState, HONOURS, prestige, PRESTIGE, renownOf, resetTree, takeNode, TREE, TREE_FX } from './meta';
import { hurtEnemy, strike } from './combat';
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
    s.role = 'gunline';
    delete s.reserve; delete s.body; delete s.rush; delete s.saveAura;
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
    for (let i = 0; i < 300 && run.phase === 'play'; i++) {
      run.enemies = run.enemies.filter((e) => pack.has(e));
      s.x = run.hx + 30; // held out there: a squad this far off would run back to the hero
      s.y = run.hy;
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
    const base = s.tough * WARPATH.losses.squadHp;
    expect(woundsPer(s)).toBe(base);
    s.level = 2;
    expect(woundsPer(s)).toBe(base * 4);
    const k = 1 / mods(run).losses;
    hurtSquad(run, s, base * 3.9 * k);
    expect(s.alive).toBe(s.size);
    hurtSquad(run, s, base * 0.2 * k);
    expect(s.alive).toBe(s.size - 1);
  });

  it('one strike fells at most one model, however big, and the overkill is lost', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot' && q.size > 1); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot' && q.size > 1)!;
    s.alive = s.size;
    s.wounds = 0;
    s.level = 0;
    s.tough = 1;
    hurtSquad(run, s, 500);
    expect(s.alive).toBe(s.size - 1);
    expect(s.wounds).toBe(0);
    // The next model is whole, so a 1-wound hit leaves it standing.
    hurtSquad(run, s, 1 / mods(run).losses);
    expect(s.alive).toBe(s.size - 1);
  });

  it('late-game and elite damage on squads is more hits, never a bigger hit', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    s.tough = 1;
    s.level = 1;
    s.defense = 6;
    for (let i = 0; i < 300; i++) {
      s.alive = s.size;
      s.wounds = 0;
      // At x4 damage, a quarter of an attack is one attack: one 1-wound hit, which a 2-wound model always survives.
      strikeSquad(run, s, 0.25 / WARPATH.losses.squadDmg, 2, 4, 1, 4);
      expect(s.alive).toBe(s.size);
    }
  });

  it('a squad in cover is hit far less often, and a wiped squad regroups at the hero', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    let t;
    for (let c = 1; c < 40 && !t; c++) t = chunkTerrain(run.seed, c, 0).find((x) => x.kind === 'cover');
    const lost = (x: number, y: number) => {
      s.x = x;
      s.y = y;
      s.tough = 1;
      s.level = 0;
      s.defense = 6;
      s.size = 5;
      s.role = 'gunline';
      delete s.reserve;
      delete s.body;
      delete s.rush;
      delete s.saveAura;
      // 400 single attacks, each on a model one wound from falling: how many land.
      let n = 0;
      for (let i = 0; i < 400; i++) {
        s.alive = 5;
        s.wounds = woundsPer(s) - 0.5;
        strikeSquad(run, s, 1 / WARPATH.losses.squadDmg, 3, 0, 1, 1);
        n += 5 - s.alive;
      }
      return n;
    };
    const open = lost(t!.x + 500, t!.y + 500);
    const covered = lost(t!.x, t!.y);
    expect(covered).toBeLessThan(open * 0.35);
    // Wiped far from the hero: the first model back comes in at the hero's side.
    s.size = 5;
    s.alive = 0;
    s.x = run.hx + 30;
    s.regen = 0.001;
    squadStep(run, new Grid(), 0.01);
    expect(s.alive).toBe(1);
    expect(Math.hypot(s.x - run.hx, s.y - run.hy)).toBeLessThan(WARPATH.follow.ring + 2);
  });

  it('infantry take cover near the hero and leave it when the hero moves on', () => {
    let run = start(0);
    for (let i = 0; i < 6 && !run.squads.some((q) => q.kind === 'foot'); i++) autoplay((run = start(i)), 180);
    const s = run.squads.find((q) => q.kind === 'foot')!;
    s.role = 'gunline';
    delete s.reserve;
    let t;
    for (let c = 1; c < 40 && !t; c++) for (let r = -3; r <= 3 && !t; r++) t = chunkTerrain(run.seed, c, r).find((x) => x.kind === 'cover');
    expect(t).toBeTruthy();
    run.hx = t!.x;
    run.hy = t!.y + t!.r + 4;
    run.enemies = [];
    run.queued = 0;
    run.phase = 'play';
    run.hp = run.maxHp;
    s.alive = s.size; // autoplay may have wiped it
    s.wounds = 0;
    run.pickups = []; // a level-up would stop the clock here
    run.xp = 0;
    delete s.body;
    delete s.rush;
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

  it('a Blast gun hits everything inside a radius set by its value, and nothing past it', () => {
    const shoot = (blast: number) => {
      const run = start(0, 'bl');
      run.enemies = [];
      run.squads[0].quality = 2;
      const at = [0, 2.5, 5.5, 8];
      const es = at.map((x) => { const e = spawnEnemy(run, 0, 100 + x, 100); e.hp = e.maxHp = 1000; return e; });
      run.enemyKinds[0].defense = 7; // Never saves.
      const grid = new Grid(4);
      grid.build(run.enemies);
      const g = { ...run.squads[0].guns[0], melee: false, blast, reliable: true, hitMod: 0 };
      // Hits are rolled: shoot until one lands.
      for (let i = 0; i < 40 && es[0].hp === 1000; i++) strike(run, grid, 0, g, es[0], mods(run), { hit: 0, reach: 0, rate: 0 } as never, false);
      return es.map((e) => e.hp < 1000);
    };
    expect(blastRadius(3)).toBe(3);
    expect(blastRadius(6)).toBe(6);
    expect(shoot(3)).toEqual([true, true, false, false]);
    expect(shoot(6)).toEqual([true, true, true, false]);
  });

  it('an enemy blast marker reaches as far as its radius', () => {
    const landed = (radius: number) => {
      const run = start(0, 'bm');
      run.squads[0].defense = 7;
      run.hx = run.hy = 0;
      run.iframes = 0;
      run.missiles = [{ x: 5, y: 0, vx: 0, vy: 0, life: 0.001, blast: true, radius, quality: 2, ap: 0, dmg: 1, attacks: 40 }];
      const hp = run.hp;
      missileStep(run, 0.1);
      return run.hp < hp;
    };
    expect(landed(3)).toBe(false);
    expect(landed(6)).toBe(true);
  });

  it('champions and captains grow into their blows; lords and the swarm hit in full', () => {
    const run = start(0, 'gd');
    const champ = spawnEnemy(run, 0, 0, 0, undefined, true);
    champ.champ = 1;
    const captain = spawnEnemy(run, 0, 0, 0, 'captain');
    const lord = spawnEnemy(run, 0, 0, 0, 'lord');
    const common = spawnEnemy(run, 0, 0, 0);
    run.t = 0;
    expect(guardianMul(run, champ)).toBe(WARPATH.guardian.from);
    expect(guardianMul(run, captain)).toBe(WARPATH.guardian.from);
    expect(guardianMul(run, lord)).toBe(1);
    expect(guardianMul(run, common)).toBe(1);
    run.t = WARPATH.guardian.fullAt * 60;
    expect(guardianMul(run, champ)).toBe(1);
    expect(softDeadly(6, 0.25)).toBe(2);
    expect(softDeadly(1, 0.25)).toBe(1);
    expect(softDeadly(6, 1)).toBe(6);
  });

  it('archetypes: the first group of rules a unit matches sets how it plays', () => {
    const foot = { category: 'Infantry', tough: 1 } as never;
    expect(roleFrom(['Immobile', 'Impact(3)'], foot)).toBe('fortress');
    expect(roleFrom(['Flying', 'Impact(3)'], foot)).toBe('flyer');
    expect(roleFrom(['Impact(3)', 'Ambush'], foot)).toBe('charger');
    expect(roleFrom(['Ambush', 'Sniper'], foot)).toBe('ambusher');
    expect(roleFrom(['Sniper'], foot)).toBe('hunter');
    expect(roleFrom(['Rending'], foot)).toBe('reaver');
    expect(roleFrom([], foot)).toBe('gunline');
    for (const r of Object.values(ROLES)) expect(r.text.length).toBeGreaterThan(0);
  });

  it('nothing touches a body mid-charge', () => {
    const run = start(1);
    autoplay(run, 120);
    const s = run.squads[1] ?? run.bench[0];
    s.alive = s.size;
    s.wounds = 0;
    s.rush = { x: s.x + 5, y: s.y, t: 1, hit: [] };
    hurtSquad(run, s, 50);
    strikeSquad(run, s, 50, 2, 4, 3, 1);
    expect(s.alive).toBe(s.size);
    expect(s.wounds).toBe(0);
  });

  it('a Charger hero has a charge on the button: untouchable through it, then a cooldown', () => {
    const run = start(0);
    run.squads[0].role = 'charger';
    run.phase = 'play';
    const from = run.hx;
    step(run, { dx: 1, dy: 0, act: true });
    expect(run.squads[0].rush).toBeDefined();
    const hp = run.hp;
    for (let i = 0; i < 10; i++) step(run, { dx: 0, dy: 0 });
    expect(run.hx).toBeGreaterThan(from + 1);
    expect(run.hp).toBe(hp);
    for (let i = 0; i < 120 && run.squads[0].rush; i++) step(run, { dx: 0, dy: 0 });
    expect(run.squads[0].rush).toBeUndefined();
    expect(heroCooldown(run)?.left).toBeGreaterThan(0);
  });

  it('a Phantom hero blinks on the button; a Gunline hero has no button', () => {
    const run = start(0);
    run.squads[0].role = 'phantom';
    const from = run.hx;
    step(run, { dx: 1, dy: 0, act: true });
    expect(run.hx - from).toBeGreaterThan(WARPATH.roles.heroBlink / 2);
    expect(heroCooldown(run)?.power).toBe('blink');
    const plain = start(0);
    plain.squads[0].role = 'gunline';
    expect(heroCooldown(plain)).toBeUndefined();
  });

  it('an Ambusher comes in off the field; a save from before archetypes reads them from the force', () => {
    const force = forceOf(2);
    const run = start(2);
    const s = run.bench[0];
    s.role = 'ambusher';
    const called = callIn(run, s.unitId);
    expect(called?.reserve).toBeGreaterThan(0);

    const old = start(2);
    const want = old.squads[0].role;
    delete old.squads[0].role;
    delete old.bench[0].role;
    const kept = old.bench[0].level = 3;
    const fresh = freshenRun(old, force, [echoes]);
    expect(roleOf(fresh.squads[0])).toBe(want);
    expect(fresh.bench[0].role).toBeDefined();
    expect(fresh.bench[0].level).toBe(kept);
  });

  /** A run with one tough dummy at each point and a grid over them. */
  const dummies = (seed: string, at: [number, number][], hp = 1000) => {
    const run = start(0, seed);
    run.enemies = [];
    const es = at.map(([x, y]) => { const e = spawnEnemy(run, 0, x, y); e.hp = e.maxHp = hp; e.emerge = 0; return e; });
    run.enemyKinds[0].defense = 7; // Never saves.
    run.enemyKinds[0].body = undefined;
    const grid = new Grid(4);
    grid.build(run.enemies);
    return { run, es, grid };
  };

  it('Whirling Blades: one blade a level, cutting what they touch and nothing else', () => {
    const { run, es, grid } = dummies('wb', [[0, 0], [0, 0]]);
    run.doctrines.whirlingBlades = 3;
    expect(bladesOf(run)).toHaveLength(3);
    const [b] = bladesOf(run);
    es[0].x = b.x;
    es[0].y = b.y;
    es[1].x = run.hx + 40;
    es[1].y = run.hy;
    grid.build(run.enemies);
    doctrineStep(run, grid, 0.05);
    expect(es[0].hp).toBeLessThan(1000);
    expect(es[1].hp).toBe(1000);
    // Storm of Steel takes them wider.
    const r = Math.hypot(b.x - run.hx, b.y - run.hy);
    run.stratagems = { stormOfSteel: true };
    const [w] = bladesOf(run);
    expect(Math.hypot(w.x - run.hx, w.y - run.hy)).toBeCloseTo(r + STRATAGEMS.stormOfSteel.reach);
  });

  it("Blood Tithe pays on the hero's kills; Blood Frenzy on anyone's, for a share; the dead stay dead", () => {
    const { run, es } = dummies('bt', [[0, 0], [1, 0], [2, 0]], 1);
    run.doctrines.bloodTithe = 2;
    const heal = DOCTRINES.bloodTithe.heal * 2;
    run.squads.push({ ...run.squads[0], kind: 'foot', unitId: 'x' });
    run.hp = 10;
    hurtEnemy(run, 1, es[0], 5);
    expect(run.hp).toBe(10);
    hurtEnemy(run, 0, es[1], 5);
    expect(run.hp).toBeCloseTo(10 + heal);
    run.stratagems = { bloodFrenzy: true };
    hurtEnemy(run, 1, es[2], 5);
    expect(run.hp).toBeCloseTo(10 + heal + heal * STRATAGEMS.bloodFrenzy.share);
    const dead = dummies('bt2', [[0, 0]], 1);
    dead.run.doctrines.bloodTithe = 5;
    dead.run.hp = -1;
    hurtEnemy(dead.run, 0, dead.es[0], 5);
    expect(dead.run.hp).toBe(-1);
  });

  it('Killing Spree builds with kills, stops at its cap and goes cold', () => {
    const at = Array.from({ length: 30 }, (_, i): [number, number] => [i, 0]);
    const { run, es } = dummies('ks2', at, 1);
    const plain = mods(run).shootRate;
    run.doctrines.killingSpree = 1;
    for (const e of es) hurtEnemy(run, 0, e, 5);
    const S = DOCTRINES.killingSpree;
    expect(run.spree).toBe(S.stacks);
    expect(mods(run).shootRate).toBeCloseTo(plain * (1 + S.rate * S.stacks));
    run.t += S.secs + 0.1;
    expect(mods(run).shootRate).toBeCloseTo(plain);
  });

  it('Fire Mission lands on the clock; Danger Close lands each shell twice', () => {
    const shells = (plan: boolean) => {
      const run = start(0, 'fm');
      run.enemies = [];
      const e = spawnEnemy(run, 0, run.hx + 3, run.hy);
      e.hp = e.maxHp = 1e6;
      e.emerge = 0;
      run.doctrines.fireMission = 2;
      if (plan) run.stratagems = { dangerClose: true };
      const grid = new Grid(4);
      grid.build(run.enemies);
      run.fx = [];
      doctrineStep(run, grid, DOCTRINES.fireMission.every - 1);
      const early = run.fx.length;
      doctrineStep(run, grid, 1.01);
      return [early, run.fx.filter((f) => f.kind === 'boom').length];
    };
    expect(shells(false)).toEqual([0, 2]);
    expect(shells(true)[1]).toBe(4);
  });

  it('Volatile Shards go off on every 30th Shard; Martyrdom on a model lost', () => {
    const { run, es, grid } = dummies('vs', [[0, 0]]);
    es[0].x = run.hx + 1;
    es[0].y = run.hy;
    grid.build(run.enemies);
    run.doctrines.volatileShards = 3;
    run.shardCharge = DOCTRINES.volatileShards.every - 1;
    doctrineStep(run, grid, 0.05);
    expect(run.shardCharge).toBe(DOCTRINES.volatileShards.every - 1);
    run.pickups = [{ id: 1, kind: 'gem', x: run.hx, y: run.hy, xp: 1, life: 10 }];
    step(run, { dx: 0, dy: 0 });
    step(run, { dx: 0, dy: 0 });
    expect(run.shardCharge).toBe(0);
    const m = dummies('md', [[0, 0]]);
    m.run.doctrines.martyrdom = 2;
    const s = { ...m.run.squads[0], kind: 'foot' as const, unitId: 'y', x: 50, y: 50, size: 5, alive: 5, wounds: 0, tough: 1, level: 0 };
    m.run.squads.push(s);
    m.es[0].x = 50;
    m.es[0].y = 50;
    m.grid.build(m.run.enemies);
    hurtSquad(m.run, s, 1e6);
    expect(m.run.martyrs).toEqual([{ x: 50, y: 50 }]);
    doctrineStep(m.run, m.grid, 0.05);
    expect(m.run.martyrs).toHaveLength(0);
    expect(m.run.fx.some((f) => f.kind === 'boom' && f.x === 50)).toBe(true);
  });

  it('Fire and Manoeuvre: moving speeds attacks, standing guards the hero, Hit and Run does both', () => {
    const run = start(0, 'mv');
    run.doctrines.manoeuvre = 2;
    const { shootRate, heroDmg } = mods(run);
    const D = DOCTRINES.manoeuvre;
    for (let i = 0; i < 120; i++) step(run, { dx: 1, dy: 0 });
    expect(run.stance).toBeGreaterThan(D.after);
    expect(mods(run).shootRate).toBeGreaterThan(shootRate);
    expect(mods(run).heroDmg).toBeCloseTo(heroDmg);
    run.stance = -D.after;
    expect(mods(run).heroDmg).toBeCloseTo(heroDmg * (1 - D.guard * 2));
    run.stance = 0;
    run.stratagems = { hitAndRun: true };
    expect(mods(run).heroDmg).toBeLessThan(heroDmg);
    expect(mods(run).shootRate).toBeGreaterThan(shootRate);
  });

  it('Giant Slayer bites the big ones only; Giant Killer doubles it', () => {
    const { run, es } = dummies('gs', [[0, 0], [1, 0]]);
    run.doctrines.giantSlayer = 1;
    es[0].elite = true;
    hurtEnemy(run, 0, es[0], 10);
    hurtEnemy(run, 0, es[1], 10);
    expect(1000 - es[0].hp).toBeCloseTo(10 * (1 + DOCTRINES.giantSlayer.dmg));
    expect(1000 - es[1].hp).toBeCloseTo(10);
    run.stratagems = { giantKiller: true };
    es[0].hp = 1000;
    hurtEnemy(run, 0, es[0], 10);
    expect(1000 - es[0].hp).toBeCloseTo(10 * (1 + DOCTRINES.giantSlayer.dmg * 2));
  });

  it('Rallying Cry throws the crowd back and mends on a level-up; The Last Line shields too', () => {
    const { run, es } = dummies('rc', [[0, 0], [0, 0]]);
    es[0].x = run.hx + 5;
    es[0].y = run.hy;
    es[1].x = run.hx + 5;
    es[1].y = run.hy;
    es[1].boss = 'captain';
    run.doctrines.rallyingCry = 2;
    run.stratagems = { lastLine: true };
    run.hp = 10;
    run.offer = [{ kind: 'score' }];
    run.phase = 'card';
    choose(run, 0);
    expect(es[0].x).toBeCloseTo(run.hx + 5 + DOCTRINES.rallyingCry.push * 2);
    expect(es[1].x).toBeCloseTo(run.hx + 5);
    expect(run.hp).toBeGreaterThan(10);
    expect(run.shield).toBeCloseTo(run.maxHp * STRATAGEMS.lastLine.shield);
  });

  it('a stratagem turns up once both its doctrines are at level 3, and only once', () => {
    const run = start(0, 'st');
    const id = STRATAGEM_IDS[0];
    const [a, b] = STRATAGEMS[id].needs;
    const open = () => candidates(run).some((c) => c.kind === 'stratagem' && c.id === id);
    run.doctrines[a] = STRATAGEM_LEVEL;
    run.doctrines[b] = STRATAGEM_LEVEL - 1;
    expect(open()).toBe(false);
    expect(cardText(run, { kind: 'doctrine', id: b }).text).toContain(STRATAGEMS[id].name);
    run.doctrines[b] = STRATAGEM_LEVEL;
    expect(open()).toBe(true);
    run.offer = [{ kind: 'stratagem', id }];
    run.phase = 'card';
    choose(run, 0);
    expect(run.stratagems?.[id]).toBe(true);
    expect(open()).toBe(false);
    for (const k of STRATAGEM_IDS) for (const d of STRATAGEMS[k].needs) expect(DOCTRINE_IDS).toContain(d);
  });

  it('new keystones: Ricochet leaps, Shockwave throws back on a cooldown, Field Promotion drills, Forager drops Shards', () => {
    // Ricochet: the fifth hit also lands on a neighbour.
    const a = dummies('ri', [[100, 100], [102, 100]]);
    a.run.meta = { ricochet: 1 };
    a.run.squads[0].charge = TREE_FX.ricochetEvery - 1;
    const g = { ...a.run.squads[0].guns[0], melee: false, blast: 1, reliable: true, hitMod: 0 };
    for (let i = 0; i < 60 && a.es[1].hp === 1000; i++) strike(a.run, a.grid, 0, g, a.es[0], mods(a.run), { hit: 0, reach: 0, rate: 0 } as never, false, false);
    expect(a.es[1].hp).toBeLessThan(1000);
    // Shockwave.
    const b = dummies('sw', [[0, 0]]);
    b.run.meta = { shockwave: 1 };
    b.es[0].x = b.run.hx + 3;
    b.es[0].y = b.run.hy;
    hurtHero(b.run, 1);
    expect(b.es[0].x).toBeCloseTo(b.run.hx + 3);
    hurtHero(b.run, b.run.maxHp * 0.2);
    expect(b.es[0].x).toBeCloseTo(b.run.hx + 3 + TREE_FX.wavePush);
    expect(b.es[0].status.stun).toBe(TREE_FX.waveStun);
    const x = b.es[0].x;
    hurtHero(b.run, b.run.maxHp * 0.2);
    expect(b.es[0].x).toBe(x);
    // Field Promotion.
    const c = dummies('fp', [[0, 0]], 1);
    c.run.meta = { promotion: 1 };
    c.es[0].boss = 'captain';
    const lv = c.run.squads[0].level;
    hurtEnemy(c.run, 0, c.es[0], 5);
    expect(c.run.squads[0].level).toBe(lv + 1);
    // Forager.
    const d = start(0, 'fo');
    d.meta = { forager: 1 };
    d.sites = [{ id: 901, kind: 'well', x: d.hx, y: d.hy, held: 1e6 }];
    d.pickups = [];
    siteStep(d, 0.1);
    const gems = d.pickups.filter((p) => p.kind === 'gem');
    expect(gems).toHaveLength(TREE_FX.foragerGems);
    expect(gems.reduce((n, p) => n + p.xp, 0)).toBeCloseTo(xpNeed(d.level) * TREE_FX.foragerShare);
  });

  it('legends: Fire at Will on a clock, Iron Legion, Grand Strategy, Advance Party', () => {
    const run = start(0, 'lg');
    const plain = mods(run);
    run.meta = { barrage: 1, legion: 1, grandStrategy: 1 };
    run.t = TREE_FX.barrageEvery * 2 + 1;
    expect(atWill(run)).toBe(true);
    expect(mods(run).shootRate).toBeCloseTo(plain.shootRate * (1 + TREE_FX.barrageRate));
    run.t += TREE_FX.barrageSecs;
    expect(atWill(run)).toBe(false);
    expect(mods(run).shootRate).toBeCloseTo(plain.shootRate);
    expect(mods(run).losses).toBeCloseTo(plain.losses * (1 - TREE_FX.legion));
    expect(mods(run).modelRegen).toBeCloseTo(plain.modelRegen * TREE_FX.legionRegen);
    expect(drawOffer(run)).toHaveLength(WARPATH.cards.offer + 1);
    const force = forceOf(0);
    force.warpath = { meta: { renown: 0, cycle: 0, total: 0, prestige: 3, laurels: 0, nodes: { advance: 1 } } };
    const r = newRun({ force, heroId: heroesOf(force)[0].id, books: [echoes], mode: 'normal', date: '2026-11-04', seed: 'ap', theme: echoes });
    expect(Object.values(r.doctrines)).toEqual([1, 1]);
  });

  it('the tree: every choice is mutual, every tier has a node a tier above it, tier 6 needs prestige 3', () => {
    for (const id of NODE_IDS) {
      const t = TREE[id];
      if (t.rival) expect(TREE[t.rival].rival).toBe(id);
      if (t.tier > 1) expect(NODE_IDS.some((o) => TREE[o].branch === t.branch && TREE[o].tier === t.tier - 1)).toBe(true);
      if (t.tier === 6) expect(t.prestige).toBe(3);
    }
  });

  it('a run with the new doctrines survives a save round trip and stays deterministic', () => {
    const go = () => {
      const run = start(1, 'rt');
      for (const id of ['whirlingBlades', 'fireMission', 'martyrdom', 'killingSpree', 'volatileShards', 'manoeuvre'] as const) run.doctrines[id] = 3;
      return autoplay(run, 120);
    };
    const a = go();
    const b = go();
    expect(a.kills).toBe(b.kills);
    expect(JSON.parse(JSON.stringify(a)).doctrines).toEqual(a.doctrines);
  });
});
