import { SHARD_TYPES, TRAINING } from '../downtimeData';
import { centreOf, dist, towers } from './board';
import {
  afflict, covered, dmgMul, enemiesNear, enemyDef, FX_COLOR, FX_TIME, hurt, isUnit, levelDmg, reach, targetFor,
  towerById, unsaved,
} from './harm';
import { hitChance, rand } from './rng';
import type { Enemy, Tower, TowerGun, TowerSkill, TrainingRun } from './types';

// Towers at work: volleys and OPR rolls, cover, statuses, dots, and taking the dead off. Holds are in holds.ts, timed
// skills and auras in skills.ts; this module is the one the rest of the run imports.

export { afflict, FX_COLOR, FX_TIME, hurt, levelDmg, reach, targetFor, type Harm } from './harm';
export { holds, holdTime, regrabTime } from './holds';
export { abilities, auras } from './skills';

/** Does this gun's attack carry the skill? A weapon's rule only on that weapon; melee- or shooting-only ones only there. */
function carried(s: TowerSkill, g: TowerGun): boolean {
  if (s.gun && s.gun !== g.name) return false;
  const only = 'only' in s.effect ? s.effect.only : undefined;
  return !only || (only === 'melee') === g.melee;
}

/** How fast a tower attacks: level-ups, a frenzy, rate auras, and a unit's initiative and Jumpy habit. */
export function rateOf(run: TrainingRun, t: Tower): number {
  const base = 1 + t.boost.rate;
  if (!isUnit(t)) return base;
  const H = TRAINING.habits;
  const habit = Math.max(0.5, 1 + H.rate * t.init) * (t.jumpy && run.t < H.jumpySecs ? H.jumpyMul : 1);
  return base * (1 + TRAINING.levels.rate * t.up) * (t.frenzy > 0 ? t.frenzyMul : 1) * habit;
}

/**
 * One attack from one gun at the enemy it's aimed at: false if there's none in reach. Quality to hit (−1 for a shot at
 * an enemy in cover), a save on the enemy's Defense + AP, then damage: Deadly(X), levels and sixes, less armour.
 * Rending (or a rend skill) makes a 6 to hit AP 4 and armour-piercing. `extra`: an attack a 6 gave.
 */
export function fire(run: TrainingRun, t: Tower, g: TowerGun, extra = false): boolean {
  const target = targetFor(run, t, g);
  if (!target) return false;
  const c = centreOf(t);
  const cover = covered(run, g, target) ? TRAINING.cover.hit : 0;
  const far = !g.melee && isUnit(t) && t.myopic && dist(c.x, c.y, target.x, target.y) > reach(t, g) * TRAINING.habits.myopicFrom ? -1 : 0;
  const p = g.reliable ? hitChance(2, cover) : hitChance(t.quality, g.hitMod + (g.melee ? t.hitMelee : t.hitShoot) + t.boost.hit + cover + far);
  const r = rand(run);
  const miss = r >= p;
  // Where a shot lands is only for show, so it doesn't touch the run's dice.
  const a = Math.random() * Math.PI * 2;
  const off = miss ? 0.45 + Math.random() * 0.35 : Math.random() * 0.12;
  run.fx.push({
    x1: c.x + (Math.random() - 0.5) * 0.7, y1: c.y + (Math.random() - 0.5) * 0.7,
    x2: target.x + Math.cos(a) * off, y2: target.y + Math.sin(a) * off,
    t: g.melee ? FX_TIME.melee : FX_TIME.shot, color: g.melee ? FX_COLOR.melee : FX_COLOR.shot,
    melee: g.melee, miss, blocked: miss && cover < 0,
  });
  if (miss) return true;
  const six = r < 1 / 6;
  const live = isUnit(t) ? t.skills.filter((s) => carried(s, g)) : [];
  const sixes = six ? live.flatMap((s) => (s.effect.kind === 'sixes' ? [s.effect] : [])) : [];
  const rend = six && (g.rending || sixes.some((e) => e.rend));
  const ap = rend ? Math.max(g.ap, 4) : g.ap;
  const how = g.melee ? 'melee' : 'shot';
  const raw = Math.max(1, g.deadly) + levelDmg(t, g) + (six && isUnit(t) && t.category === 'Elite' ? 1 : 0) + sixes.reduce((n, e) => n + (e.dmg ?? 0), 0);
  const dmgTo = (e: Enemy) => Math.max(0.5, raw - (rend ? 0 : enemyDef(e).armor)) * dmgMul(t);
  // Blast(X): the hit spills onto up to X−1 others close by, each saving on its own.
  const splash = g.blast > 1 ? enemiesNear(run, target.x, target.y, TRAINING.blastRadius).filter((o) => o !== target).slice(0, g.blast - 1) : [];
  if (unsaved(run, target, ap)) {
    hurt(run, t, target, dmgTo(target), how);
    onWound(run, t, target, live);
  }
  for (const o of splash) if (unsaved(run, o, ap)) hurt(run, t, o, dmgTo(o), how);
  if (!extra && sixes.some((e) => e.again)) fire(run, t, g, true);
  return true;
}

/** What a wound leaves behind: a unit's onHit statuses, a Bulwark Shard's daze, a Swift Shard's slow. */
function onWound(run: TrainingRun, t: Tower, e: Enemy, live: TowerSkill[]) {
  if (isUnit(t)) {
    for (const s of live) if (s.effect.kind === 'onHit' && rand(run) < s.effect.chance) afflict(run, t, e, s.effect.status);
    return;
  }
  const rule = SHARD_TYPES[t.type];
  if (rule.daze && rand(run) < rule.daze) afflict(run, t, e, 'daze');
  if (rule.slow && rand(run) < rule.slow) afflict(run, t, e, 'slow');
}

/** Attacks in a volley: whole ones, and a fraction as a chance of one more (Shards have half attacks). */
function volleySize(run: TrainingRun, attacks: number): number {
  const whole = Math.floor(attacks);
  return whole + (attacks > whole && rand(run) < attacks - whole ? 1 : 0);
}

/** One gun's clocks: start a volley when it's ready and something is in reach; its shots go one after another over
 *  the first part of the wait before the next. */
function runGun(run: TrainingRun, t: Tower, g: TowerGun, rate: number, dt: number) {
  g.cd -= dt;
  if (g.cd <= 0 && g.pending <= 0 && targetFor(run, t, g)) {
    g.cd = (g.melee ? TRAINING.meleeEvery : TRAINING.shootEvery) / rate;
    g.pending = volleySize(run, g.attacks);
    g.gap = g.pending ? (g.cd * TRAINING.volleySpread) / g.pending : 0;
    g.next = 0;
  }
  if (g.pending <= 0) return;
  g.next -= dt;
  while (g.pending > 0 && g.next <= 0) {
    g.pending -= 1;
    g.next += g.gap;
    if (!fire(run, t, g)) g.pending = 0;
  }
}

/** Every tower's guns: volley clocks and shots. */
export function fireAll(run: TrainingRun, dt: number): void {
  for (const t of towers(run)) {
    const rate = rateOf(run, t);
    for (const g of t.guns) runGun(run, t, g, rate, dt);
  }
}

/** Wear statuses, dots and re-grab cooldowns down; a dot hurts as it goes, credited to the piece that left it. */
export function tickEnemies(run: TrainingRun, dt: number): void {
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    for (const d of e.dots) {
      hurt(run, towerById(run, d.by), e, d.dps * Math.min(dt, d.left), 'other');
      d.left -= dt;
    }
    e.dots = e.dots.filter((d) => d.left > 0);
    for (const k of Object.keys(e.status) as (keyof Enemy['status'])[]) {
      const left = e.status[k]! - dt;
      if (left > 0) e.status[k] = left;
      else delete e.status[k];
    }
    if (e.heldBy === undefined) e.regrab = Math.max(0, e.regrab - dt);
  }
}

/** Take the dead off the map, releasing any hold on them (or on enemies already gone, such as leaks). */
export function reap(run: TrainingRun): void {
  run.enemies = run.enemies.filter((e) => e.hp > 0);
  const ids = new Set(run.enemies.map((e) => e.id));
  for (const p of run.pieces) {
    if (p.kind === 'unit' && p.holding !== undefined && !ids.has(p.holding)) {
      p.holding = undefined;
      p.holdLeft = 0;
    }
  }
  for (const e of run.enemies) {
    if (e.heldBy === undefined) continue;
    const by = towerById(run, e.heldBy);
    if (!by || !isUnit(by) || by.holding !== e.id) e.heldBy = undefined;
  }
}
