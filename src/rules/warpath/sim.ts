import type { Campaign, CatalogBook, Force, Unit } from '../../model/types';
import { echoesBook } from '../echoForce';
import { hasRule } from '../engine';
import { weekKey, weekSeed } from '../sortie';
import { nexusOf } from '../training/nexus';
import { rand, seedOf } from '../training/rng';
import { fireAll, hurtEnemy } from './combat';
import { DOCTRINE_IDS, WARPATH } from './data';
import { doctrineStep } from './doctrines';
import { Grid, unblock } from './field';
import { enemyStep, feared, missileStep, spawnStep, bossStep, hurtHero } from './enemies';
import { gainXp, openLevelUp, choose, candidates } from './levels';
import { collect } from './loot';
import { hordeStep, siteStep } from './events';
import { heroMaxHp, mods } from './mods';
import { has, TREE_FX } from './meta';
import { enemyKindsOf, fieldPoints, squadOf } from './roster';
import { heroAct, heroSpeed, squadStep } from './squads';
import type { Card, Enemy, Squad, WarpathMode, WarpathRun } from './types';

// A run from start to death: built from the force and the week's theme, then stepped at a fixed 60 a second.

const W = WARPATH;
export const WARPATH_VERSION = 1;

/** Units that can play: active ones. */
export const playable = (u: Unit) => u.status === 'active';

/** Every unit a run can field. */
export const rosterOf = (force: Force): Unit[] => force.units.filter(playable).filter((u) => fieldPoints(u) <= W.cap);

/** Heroes the force can lead with (any active unit if it has no Hero). */
export function heroesOf(force: Force): Unit[] {
  const units = rosterOf(force);
  const heroes = units.filter((u) => hasRule(u.rules, 'Hero'));
  return heroes.length ? heroes : units;
}

/** The theme books: Void Echoes, then every imported book (in name order so it's the same list on every device). */
export function themeBooks(books: CatalogBook[]): CatalogBook[] {
  const echoes = echoesBook(books);
  return [echoes, ...books.filter((b) => b.uid !== echoes.uid && b.name !== echoes.name).sort((a, b) => a.name.localeCompare(b.name))];
}

/** This week's theme: the same book for everyone. A book too thin to field falls back to Void Echoes. */
export function weekTheme(books: CatalogBook[], week: string): CatalogBook {
  const list = themeBooks(books);
  const pick = list[Math.abs(weekSeed(`warpath:${week}`)) % list.length];
  return enemyKindsOf(pick).length >= 3 ? pick : list[0];
}

export interface NewRun {
  force: Force;
  heroId: string;
  books: CatalogBook[];
  campaign?: Campaign;
  mode: WarpathMode;
  date: string;
  /** For sims: a fixed seed (else the clock). */
  seed?: string;
  /** For sims: field this book instead of the week's. */
  theme?: CatalogBook;
}

/** A save from before archetypes: its squads read their roles and rules from the force. Levels and losses stay. */
export function freshenRun(run: WarpathRun, force: Force, books?: CatalogBook[]): WarpathRun {
  const fill = (s: Squad, hero = false) => {
    const u = !s.role && force.units.find((x) => x.id === s.unitId);
    if (!u) return s;
    const { role, body, traits, spells } = squadOf(u, hero, books);
    return { ...s, role, ...(body ? { body } : {}), ...(traits ? { traits } : {}), ...(spells ? { spells } : {}) };
  };
  return { ...run, squads: run.squads.map((s, i) => fill(s, i === 0)), bench: run.bench.map((s) => fill(s)) };
}

export function newRun(o: NewRun): WarpathRun {
  const week = weekKey(o.date);
  const theme = o.theme ?? weekTheme(o.books, week);
  const seed = seedOf(o.seed ?? `${o.force.id}:${Date.now()}:${Math.random()}`);
  const heroUnit = o.force.units.find((u) => u.id === o.heroId) ?? heroesOf(o.force)[0];
  const hero = squadOf(heroUnit, true, o.books);
  hero.points = fieldPoints(heroUnit);
  const bench = o.force.units
    .filter((u) => u.id !== heroUnit.id && playable(u))
    .map((u) => ({ ...squadOf(u, false, o.books), points: fieldPoints(u) }))
    .filter((s) => s.points + hero.points <= W.cap);
  const lords = (nexusOf(o.campaign)?.lords ?? []).map((l) => ({ key: l.key, name: l.name, trick: l.trick }));
  const run: WarpathRun = {
    v: WARPATH_VERSION, forceId: o.force.id, mode: o.mode, week, theme: { uid: theme.uid, name: theme.name }, seed, rng: seed,
    t: 0, phase: 'play', hx: 0, hy: 0, face: 0, hp: 0, maxHp: 0, iframes: 0,
    squads: [hero], bench, points: hero.points, enemyKinds: enemyKindsOf(theme), enemies: [], missiles: [], pickups: [],
    nextId: 1, owed: 3, nextRation: W.pickups.rationEvery, nextBeacon: W.pickups.beaconEvery, bossesDone: 0, lords,
    level: 1, xp: 0, queued: 0, offer: [], rerolls: W.cards.rerolls, doctrines: {}, kills: 0, captains: 0, lordKills: 0, score: 0,
    log: [`0:00 ${hero.name} leads ${o.force.name} against ${theme.name}${o.mode === 'hard' ? ' (Hard)' : ''}.`], fx: [],
  };
  run.meta = { ...(o.force.warpath?.meta?.nodes ?? {}), honours: o.force.warpath?.meta?.prestige ?? 0 };
  if (has(run, 'reserves')) run.rerolls += TREE_FX.reserves;
  if (has(run, 'orders')) run.queued += TREE_FX.orders;
  // Advance Party: doctrines from the run's own dice.
  if (has(run, 'advance')) {
    const pool = [...DOCTRINE_IDS];
    for (let i = 0; i < TREE_FX.advance; i++) run.doctrines[pool.splice(Math.floor(rand(run) * pool.length), 1)[0]] = 1;
  }
  run.maxHp = run.hp = heroMaxHp(run);
  return run;
}

/** The input for one step: a direction (any length; it's normalised), and the hero's button (a charge, a blink). */
export interface Input { dx: number; dy: number; act?: boolean }

const grid = new Grid(4);

/** One fixed step (WARPATH.step) of play. */
export function step(run: WarpathRun, input: Input, dt = W.step): void {
  if (run.phase !== 'play') return;
  run.t += dt;
  if (run.iframes > 0) run.iframes -= dt;
  const m = mods(run);
  // The hero moves.
  const len = Math.hypot(input.dx, input.dy);
  const hero = run.squads[0];
  const stance = run.stance ?? 0;
  run.stance = len > 0.05 ? Math.max(0, stance) + dt : Math.min(0, stance) - dt;
  if (len > 0.05 && !hero.rush) {
    const k = Math.min(1, len) / len;
    const v = heroSpeed(run, feared(run));
    run.hx += input.dx * k * v * dt;
    run.hy += input.dy * k * v * dt;
    run.face = Math.atan2(input.dy, input.dx);
    // Flyers go over what blocks everyone else.
    if (!hero.body?.flying) {
      const p = { x: run.hx, y: run.hy };
      unblock(run.seed, p, 0.8);
      run.hx = p.x;
      run.hy = p.y;
    }
  }
  if (m.regen > 0) run.hp = Math.min(run.maxHp, run.hp + m.regen * dt);
  spawnStep(run, dt);
  bossStep(run);
  hordeStep(run);
  siteStep(run, dt);
  if (run.banner && (run.banner.t -= dt) <= 0) run.banner = undefined;
  grid.build(run.enemies);
  heroAct(run, grid, input, dt);
  squadStep(run, grid, dt);
  fireAll(run, grid, dt);
  doctrineStep(run, grid, dt);
  enemyStep(run, grid, dt, (e, n) => hurtEnemy(run, Math.max(0, e.by), e, n));
  missileStep(run, dt);
  collect(run, dt);
  // Stragglers left far behind come round again ahead of the hero (a boss a little closer, so it can't be outrun).
  const far = (W.spawn.ring * 1.6) ** 2;
  for (const e of run.enemies) {
    if (e.hp <= 0 || e.guard !== undefined || (e.x - run.hx) ** 2 + (e.y - run.hy) ** 2 < (e.boss ? far / 2.56 : far)) continue;
    const a = run.face + (rand(run) - 0.5) * 1.8;
    const r = e.boss ? W.spawn.ring * 0.7 : W.spawn.ring;
    e.x = run.hx + Math.cos(a) * r;
    e.y = run.hy + Math.sin(a) * r;
  }
  run.enemies = run.enemies.filter((e) => e.hp > 0);
  for (const f of run.fx) f.t -= dt;
  run.fx = run.fx.filter((f) => f.t > 0);
  // Second Wind: once a run, the killing blow leaves the hero standing.
  if (run.hp <= 0 && has(run, 'secondWind') && !run.tree?.wind) {
    (run.tree ??= {}).wind = true;
    run.hp = run.maxHp * TREE_FX.secondWind;
    run.iframes = TREE_FX.windIframes;
    run.banner = { text: 'Second Wind! The hero rises', t: 3, tone: 'good' };
    run.fx.push({ kind: 'heal', x: run.hx, y: run.hy - 2, n: run.hp, t: 1 });
    run.log.push(`${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')} Second Wind.`);
  }
  if (run.hp <= 0) {
    run.hp = 0;
    run.phase = 'over';
    run.log.push(`${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')} ${run.squads[0].name} falls.`);
    return;
  }
  openLevelUp(run);
}

// --- The bot (balance sims and the debug autoplay) ------------------------------------------------------------------

/** Steer away from the crowd (inverse-square), towards Shards and, when hurt, rations; drift round in a wide circle. */
export function botInput(run: WarpathRun): Input {
  let dx = 0;
  let dy = 0;
  for (const e of run.enemies) {
    const ex = run.hx - e.x;
    const ey = run.hy - e.y;
    const d2 = ex * ex + ey * ey;
    if (d2 > 225) continue;
    const w = (e.boss ? 6 : 1) / Math.max(1, d2);
    dx += ex * w;
    dy += ey * w;
  }
  for (const m of run.missiles) {
    if (!m.blast) continue;
    const ex = run.hx - m.x;
    const ey = run.hy - m.y;
    const d2 = ex * ex + ey * ey;
    if (d2 < ((m.radius ?? WARPATH.enemy.blastRadius) + 1) ** 2) { dx += ex * 2; dy += ey * 2; }
  }
  const press = Math.hypot(dx, dy);
  let goal: { x: number; y: number } | undefined;
  let best = 400;
  for (const p of run.pickups) {
    const d2 = (p.x - run.hx) ** 2 + (p.y - run.hy) ** 2;
    const want = p.kind === 'ration' ? (run.hp < run.maxHp * 0.6 ? 0.2 : 9) : p.kind === 'gem' ? 1 : 0.5;
    if (d2 * want < best) { best = d2 * want; goal = p; }
  }
  // Nothing close to pick up and nothing pressing: go out to a site (an aid station only when hurt; champions are left).
  if (!goal && press < 0.15) {
    let bd = Infinity;
    for (const s of run.sites ?? []) {
      if (s.kind === 'champion' || (s.kind === 'well' && run.hp > run.maxHp * 0.7)) continue;
      const d2 = (s.x - run.hx) ** 2 + (s.y - run.hy) ** 2;
      if (d2 < bd) { bd = d2; goal = s; }
    }
  }
  if (goal && press < 0.25) {
    const gx = goal.x - run.hx;
    const gy = goal.y - run.hy;
    const g = Math.hypot(gx, gy) || 1;
    dx += (gx / g) * 0.3;
    dy += (gy / g) * 0.3;
  }
  // A slow circle, so the hero keeps moving and the crowd trails.
  const a = run.t * 0.08;
  dx += Math.cos(a) * 0.12;
  dy += Math.sin(a) * 0.12;
  return { dx, dy, act: press > 0.3 };
}

/** The bot's card: call in the dearest unit that fits, else drill the hero then whoever dealt most, else a doctrine. */
export function botPick(run: WarpathRun): number {
  const score = (c: Card): number => {
    if (c.kind === 'call') return 100 + (run.bench.find((s) => s.unitId === c.unitId)?.points ?? 0) / 10;
    if (c.kind === 'drill') {
      const s = run.squads.find((x) => x.unitId === c.unitId);
      return s?.kind === 'hero' ? 60 : 40 + (s ? s.dealt / Math.max(1, run.squads.reduce((n, x) => n + x.dealt, 0)) * 30 : 0);
    }
    if (c.kind === 'stratagem') return 70;
    if (c.kind === 'doctrine') return 45 + (run.doctrines[c.id] ?? 0) * 3 + (['relentless', 'deadlyStrikes', 'holdLine', 'fieldMedics'].includes(c.id) ? 8 : 0);
    return 0;
  };
  let bi = 0;
  run.offer.forEach((c, i) => { if (score(c) > score(run.offer[bi])) bi = i; });
  return bi;
}

/** Play a run with the bot until the hero falls or `maxSecs` pass. */
export function autoplay(run: WarpathRun, maxSecs: number): WarpathRun {
  run.auto = true;
  while (run.phase !== 'over' && run.t < maxSecs) {
    if (run.phase === 'card') { choose(run, botPick(run)); continue; }
    step(run, botInput(run));
  }
  return run;
}

export { gainXp, hurtHero, candidates };
export type { Enemy };
