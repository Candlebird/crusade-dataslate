import type { Effect } from '../abilities';
import { SHARD_TYPES, TRAINING } from '../downtimeData';
import { centreOf, dist, towers } from './board';
import { pick, hitChance, rand } from './rng';
import { shardValue } from './shards';
import {
  addDot, busy, covered, dmgMul, enemiesNear, enemyDef, FX_COLOR, FX_TIME, hurt, isUnit, pulse, reach, toGo, unsaved,
} from './harm';
import type { Tower, TowerGun, TowerSkill, TrainingRun, UnitTower } from './types';

// Auras and timed skills, remapped for a run where nothing hurts the towers: a heal is a bleed field, a shield a damage
// boost on another tower. Barrages, frenzies and fields work as they did.

/** Cells a unit's auras and fields grow by with its level-ups. */
export const grown = (t: Tower) => (isUnit(t) ? t.up * TRAINING.levels.range : 0);

/**
 * Recompute every tower's boost: +1 to hit near a Hero or a Command Shard (one or many, it's +1), and aura skills on
 * top. A shield boost wears down here too.
 */
export function auras(run: TrainingRun, dt: number): void {
  const all = towers(run);
  for (const t of all) {
    t.boost = { hit: 0, save: 0, rate: 0, range: 0 };
    if (t.dmgBoost.left > 0) t.dmgBoost.left = Math.max(0, t.dmgBoost.left - dt);
    if (t.dmgBoost.left <= 0) t.dmgBoost.mul = 0;
  }
  const leaders = all.flatMap((src): { src: Tower; r: number }[] => {
    if (isUnit(src)) return src.category === 'Hero' ? [{ src, r: TRAINING.auraRadius + grown(src) }] : [];
    const a = SHARD_TYPES[src.type].aura;
    return a ? [{ src, r: a.radius + a.perGrade * (src.grade - 1) }] : [];
  });
  for (const t of all) {
    const c = centreOf(t);
    if (leaders.some(({ src, r }) => { const s = centreOf(src); return dist(s.x, s.y, c.x, c.y) <= r; })) t.boost.hit += 1;
  }
  for (const src of all) {
    if (!isUnit(src)) continue;
    const s = centreOf(src);
    for (const k of src.skills) {
      if (k.effect.kind !== 'aura') continue;
      const e = k.effect;
      for (const t of all) {
        const c = centreOf(t);
        if (dist(s.x, s.y, c.x, c.y) <= e.radius + grown(src)) t.boost[e.stat] += e.n;
      }
    }
  }
}

/** Does the wave clock cross a multiple of `period` seconds this step (for pulses with no clock of their own)? */
const ticks = (run: TrainingRun, dt: number, period: number) => Math.floor(run.t / period) !== Math.floor((run.t - dt) / period);

/** A bleed field: every enemy within `r` cells of a tower bleeds `total` over bleedField.secs (refreshed while inside). */
export function bleedField(run: TrainingRun, t: Tower, r: number, total: number, show: boolean) {
  const c = centreOf(t);
  const secs = TRAINING.bleedField.secs;
  const near = enemiesNear(run, c.x, c.y, r);
  for (const e of near) addDot(e, t.id, total / secs, secs);
  if (show && near.length) pulse(run, c.x, c.y, r, FX_COLOR.bleed);
}

/** A shield: a random other tower deals n × shieldBoost.perN more for an ability round. */
export function shieldBoost(run: TrainingRun, t: UnitTower, n: number): boolean {
  const to = pick(run, towers(run).filter((o) => o.id !== t.id));
  if (!to) return false;
  to.dmgBoost = { mul: Math.max(to.dmgBoost.left > 0 ? to.dmgBoost.mul : 0, n * TRAINING.shieldBoost.perN), left: TRAINING.abilityRound };
  const a = centreOf(t);
  const b = centreOf(to);
  run.fx.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: FX_TIME.heal, color: FX_COLOR.shield, kind: 'heal' });
  pulse(run, b.x, b.y, 0.8, FX_COLOR.shield);
  return true;
}

/** A barrage: `hits` extra hits at AP `ap` at the enemy furthest along in range, spilling `radius`. */
export function barrage(run: TrainingRun, t: UnitTower, e: Extract<Effect, { kind: 'barrage' }>): boolean {
  const c = centreOf(t);
  const r = e.range ?? Math.max(0, ...t.guns.map((g) => reach(t, g)));
  const target = enemiesNear(run, c.x, c.y, r).sort((a, b) => toGo(run, a) - toGo(run, b))[0];
  if (!target) return false;
  const shot = { melee: false } as TowerGun;
  const p = hitChance(t.quality, t.boost.hit + (covered(run, shot, target) ? TRAINING.cover.hit : 0));
  let landed = 0;
  for (let i = 0; i < e.hits; i++) {
    if (rand(run) >= p) continue;
    landed += 1;
    const struck = [target, ...(e.radius ? enemiesNear(run, target.x, target.y, e.radius).filter((o) => o !== target) : [])];
    for (const o of struck) {
      if (unsaved(run, o, e.ap)) hurt(run, t, o, Math.max(0.5, 1 + t.up * TRAINING.levels.dmg - enemyDef(o).armor) * dmgMul(t), 'shot');
    }
  }
  run.fx.push({ x1: c.x, y1: c.y, x2: target.x, y2: target.y, t: FX_TIME.bolt, color: FX_COLOR.bolt, kind: 'bolt', miss: !landed });
  if (e.radius) pulse(run, target.x, target.y, e.radius, FX_COLOR.bolt);
  return true;
}

/** One timed skill whose clock has run out: true if it went (its clock restarts), false to try again next step. */
function useSkill(run: TrainingRun, t: UnitTower, s: TowerSkill): boolean {
  const e = s.effect;
  if (e.kind === 'shield') return shieldBoost(run, t, e.n);
  if (e.kind === 'barrage') return barrage(run, t, e);
  if (e.kind === 'frenzy') {
    if (!busy(run, t)) return false;
    t.frenzy = e.time * TRAINING.abilityRound;
    t.frenzyMul = e.mul;
    return true;
  }
  return true;
}

/** A unit's skills on their clocks. Heals are bleed fields (always on; their pulse shown each field tick), fields
 *  slow or daze what's in them. Revive, redeploy and the rest do nothing here. */
function unitSkills(run: TrainingRun, t: UnitTower, dt: number) {
  const c = centreOf(t);
  t.frenzy = Math.max(0, t.frenzy - dt);
  for (const s of t.skills) {
    const e = s.effect;
    s.cd -= dt;
    if (e.kind === 'heal') {
      const show = s.cd <= 0;
      if (show) s.cd = TRAINING.abilityRound / 4;
      bleedField(run, t, TRAINING.bleedField.radius + grown(t), (e.n * TRAINING.bleedField.dmg) / Math.max(1, e.every), show);
      continue;
    }
    if (s.cd > 0) continue;
    if (e.kind === 'field') {
      s.cd = TRAINING.abilityRound / 4;
      const r = e.radius + grown(t);
      for (const o of enemiesNear(run, c.x, c.y, r)) o.status[e.status] = Math.max(o.status[e.status] ?? 0, TRAINING.fieldLinger + s.cd);
      pulse(run, c.x, c.y, r, FX_COLOR.field);
      continue;
    }
    if (!('every' in e)) continue;
    s.cd = useSkill(run, t, s) ? e.every * TRAINING.abilityRound : 0;
  }
}

/** Timed skills: bleed fields (heal), damage boosts (shield), barrages, frenzies, fields; Vigor Shards' bleed. */
export function abilities(run: TrainingRun, dt: number): void {
  const show = ticks(run, dt, TRAINING.abilityRound / 4);
  for (const t of towers(run)) {
    if (isUnit(t)) { unitSkills(run, t, dt); continue; }
    const bleed = SHARD_TYPES[t.type].bleed;
    if (bleed) bleedField(run, t, TRAINING.bleedField.radius, bleed * shardValue(t.grade), show);
  }
}
