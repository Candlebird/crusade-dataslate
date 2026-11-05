import { SHARD_TYPES, TRAINING } from '../downtimeData';
import { affixHit } from './affixes';
import { centreOf, dist, towers } from './board';
import {
  afflict, canAim, cardMul, dmgMul, enemiesNear, enemyDef, FX_COLOR, FX_TIME, hurt, isUnit, levelDmg, reach, targetFor,
  terrainHit, towerById, unsaved,
} from './harm';
import { lordHit } from './lords';
import { hitChance, rand } from './rng';
import { rawDamage, readShot, runVolley, throughArmour } from '../shots';
import type { Enemy, Tower, TowerGun, TowerSkill, TrainingRun } from './types';

// Towers at work: volleys and OPR rolls, statuses, dots, and taking the dead off. Holds are in holds.ts, timed
// skills and auras in skills.ts; this module is the one the rest of the run imports.

export { afflict, FX_COLOR, FX_TIME, hurt, levelDmg, partsOf, rangeCells, reach, targetFor, type Harm } from './harm';
export { canHold, holds, holdTime, regrabTime } from './holds';
export { abilities, auras } from './skills';

/** Does this gun's attack carry the skill? A weapon's rule only on that weapon; melee- or shooting-only ones only there. */
function carried(s: TowerSkill, g: TowerGun): boolean {
  if (s.gun && s.gun !== g.name) return false;
  const only = 'only' in s.effect ? s.effect.only : undefined;
  return !only || (only === 'melee') === g.melee;
}

/** How fast a tower attacks: level-ups, a frenzy, rate auras, a banner relic's rally, a Kill chain, and a unit's
 *  initiative and Jumpy habit. */
export function rateOf(run: TrainingRun, t: Tower): number {
  const chain = t.chain && t.chain.left > 0 ? t.chain.per * t.chain.stacks : 0;
  const base = (1 + t.boost.rate) * (1 + (t.rush && t.rush.left > 0 ? t.rush.mul : 0)) * (1 + chain);
  if (!isUnit(t)) return base;
  const H = TRAINING.habits;
  const habit = Math.max(0.5, 1 + H.rate * t.init) * (t.jumpy && run.t < H.jumpySecs ? H.jumpyMul : 1);
  return base * (1 + TRAINING.levels.rate * t.up) * (t.frenzy > 0 ? t.frenzyMul : 1) * habit;
}

/**
 * One attack from one gun at the enemy it's aimed at: false if there's none in reach. Quality to hit (a region quirk
 * on a shot at an enemy in dangerous terrain), a save on the enemy's Defense + AP, then damage: Deadly(X), levels and sixes, less armour.
 * Rending (or a rend skill) makes a 6 to hit AP 4 and armour-piercing. `extra`: an attack a 6 gave.
 */
export function fire(run: TrainingRun, t: Tower, g: TowerGun, extra = false): boolean {
  const target = targetFor(run, t, g);
  if (!target) return false;
  const c = centreOf(t);
  // A region quirk changes a unit's shots at an Echo in dangerous terrain (habits.ts).
  const ground = terrainHit(run, t, g, target);
  const d = dist(c.x, c.y, target.x, target.y);
  const far = !g.melee && isUnit(t) && t.myopic && d > reach(t, g) * TRAINING.habits.myopicFrom ? -1 : 0;
  // The Nexus: Shrouded, Ion Storm and a lord's Mirror Veil (affixes.ts, lords.ts).
  const nexus = affixHit(run, g, d, reach(t, g)) + lordHit(run, g, target);
  const p = g.reliable ? hitChance(2, ground + nexus) : hitChance(t.quality, g.hitMod + (g.melee ? t.hitMelee : t.hitShoot) + t.boost.hit + ground + far + nexus);
  const r = rand(run);
  const live = isUnit(t) ? t.skills.filter((s) => carried(s, g)) : [];
  const sixes = r < 1 / 6 && r < p ? live.flatMap((s) => (s.effect.kind === 'sixes' ? [s.effect] : [])) : [];
  const { miss, six, rend, ap } = readShot(r, p, g.ap, g.rending, sixes.some((e) => e.rend));
  // Where a shot lands is only for show, so it doesn't touch the run's dice.
  const a = Math.random() * Math.PI * 2;
  const off = miss ? 0.45 + Math.random() * 0.35 : Math.random() * 0.12;
  run.fx.push({
    x1: c.x + (Math.random() - 0.5) * 0.7, y1: c.y + (Math.random() - 0.5) * 0.7,
    x2: target.x + Math.cos(a) * off, y2: target.y + Math.sin(a) * off,
    t: g.melee ? FX_TIME.melee : FX_TIME.shot, color: g.relic ? FX_COLOR.relic : g.melee ? FX_COLOR.melee : FX_COLOR.shot,
    melee: g.melee, miss,
  });
  if (miss) return true;
  const how = g.melee ? 'melee' : 'shot';
  const raw = rawDamage(g.deadly, levelDmg(t, g) + (six && isUnit(t) && t.category === 'Elite' ? 1 : 0) + sixes.reduce((n, e) => n + (e.dmg ?? 0), 0));
  const dmgTo = (e: Enemy) => throughArmour(raw, enemyDef(e).armor, rend) * dmgMul(t) * cardMul(run, t, e) * (e.flies ? g.air ?? 1 : 1);
  // Blast(X): the hit spills onto up to X−1 others close by, each saving on its own.
  const splash = g.blast > 1 ? enemiesNear(run, target.x, target.y, TRAINING.blastRadius).filter((o) => o !== target && canAim(g, o)).slice(0, g.blast - 1) : [];
  if (unsaved(run, target, ap)) {
    hurt(run, t, target, dmgTo(target), how);
    onWound(run, t, g, target, live);
  }
  for (const o of splash) if (unsaved(run, o, ap)) hurt(run, t, o, dmgTo(o), how);
  if (!extra && sixes.some((e) => e.again)) fire(run, t, g, true);
  return true;
}

/** What a wound leaves behind: a unit's onHit statuses; a Bulwark gun's daze, a Swift gun's slow (Shards, defaults). */
function onWound(run: TrainingRun, t: Tower, g: TowerGun, e: Enemy, live: TowerSkill[]) {
  if (isUnit(t)) {
    for (const s of live) if (s.effect.kind === 'onHit' && rand(run) < s.effect.chance) afflict(run, t, e, s.effect.status);
    return;
  }
  // A default tower's one gun carries every one of its Shards' rules (each type once).
  const types = t.kind === 'default' ? [...new Set(t.slots.map(([k]) => k))] : [g.shard ?? (t.kind === 'shard' ? t.type : undefined)];
  for (const type of types) {
    if (!type) continue;
    const rule = SHARD_TYPES[type];
    if (rule.daze && rand(run) < rule.daze) afflict(run, t, e, 'daze');
    if (rule.slow && rand(run) < rule.slow) afflict(run, t, e, 'slow');
  }
}

/** One gun's clocks (shots.ts runVolley, at Training's pace). */
const runGun = (run: TrainingRun, t: Tower, g: TowerGun, rate: number, dt: number) =>
  runVolley(g, rate, dt, TRAINING, () => rand(run), () => !!targetFor(run, t, g), () => fire(run, t, g));

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
