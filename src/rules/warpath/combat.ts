import type { Status } from '../abilities';
import { rawDamage, readShot, runVolley } from '../shots';
import { hitChance, rand, saveChance } from '../training/rng';
import { WARPATH } from './data';
import { terrainAt, type Grid } from './field';
import { blastRadius, mods, penalty, type Mods } from './mods';
import { killed } from './loot';
import { has, TREE_FX as T } from './meta';
import type { Enemy, Squad, WarpathRun, WGun } from './types';

// The force at work: every squad's guns on Training's volley clock (shots.ts), OPR rolls against the enemy's Defense,
// rules on hit, relics and spells on their own clocks. Squads fire from where they stand (the hero's own guns from the hero).

const W = WARPATH;
/** A rule's radius in Training cells, in inches here. */
const TILE = 3;

/** Is the squad on the field and able to fire (a fortification on the ground, a squad with models standing)? */
export const onField = (s: Squad) => s.alive > 0 && (!s.fort || (s.fort.down <= 0 && s.fort.fall <= 0));

/** Where a squad shoots from. */
export const originOf = (run: WarpathRun, s: Squad) => (s.kind === 'hero' ? { x: run.hx, y: run.hy } : { x: s.x, y: s.y });

/** Aura bonuses on each squad this step (from squads near it, itself included). */
export interface Auras { hit: number; save: number; rate: number; range: number }
export function aurasOf(run: WarpathRun): Auras[] {
  const out = run.squads.map(() => ({ hit: 0, save: 0, rate: 0, range: 0 }));
  run.squads.forEach((s, i) => {
    if (!onField(s)) return;
    const a = originOf(run, s);
    for (const e of s.skills) {
      if (e.kind !== 'aura') continue;
      const r = e.radius * TILE + 6;
      run.squads.forEach((o, j) => {
        const b = originOf(run, o);
        if (j === i || (a.x - b.x) ** 2 + (a.y - b.y) ** 2 <= r * r) out[j][e.stat] += e.n;
      });
    }
  });
  return out;
}

/** How far a gun reaches with levels and Veteran Drills. */
export const reachOf = (s: Squad, g: WGun, m: Mods, aura?: Auras) =>
  g.melee ? g.reach : (g.reach + (aura?.range ?? 0) * TILE) * (1 + W.levels.reach * s.level) * m.reach;

/** How fast a squad's gun goes: levels, doctrines, a frenzy, rate auras and scars. */
export function rateOf(s: Squad, g: WGun, m: Mods, aura?: Auras): number {
  return (1 + W.levels.rate * s.level) * (g.melee ? m.meleeRate : m.shootRate) * (s.frenzyLeft > 0 ? s.frenzy : 1)
    * (1 + (aura?.rate ?? 0)) * Math.max(0.3, 1 - penalty(s, 'rate')) * (1 + 0.04 * s.guessed.length);
}

/** Damage an enemy takes: kills are credited to the squad that lands the blow. */
export function hurtEnemy(run: WarpathRun, si: number, e: Enemy, dmg: number, crit = false): void {
  if (e.hp <= 0 || dmg <= 0) return;
  if (e.lord && e.lord.ward > 0) {
    const soak = Math.min(e.lord.ward, dmg);
    e.lord.ward -= soak;
    dmg -= soak;
    if (dmg <= 0) return;
  }
  if (e.status.mark) dmg *= 1.25;
  // Executioner: a hit that leaves a non-boss low finishes it.
  if (!e.boss && e.hp - dmg > 0 && e.hp - dmg < e.maxHp * T.executeBelow && has(run, 'executioner')) {
    dmg = e.hp;
    crit = true;
  }
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  e.by = si;
  const s = run.squads[si];
  if (s) s.dealt += dealt;
  if (run.fx.length < 700) run.fx.push({ kind: 'dmg', x: e.x, y: e.y - e.size * 0.6, n: dmg, t: 0.7, crit, hero: si === 0 });
  if (e.hp <= 0) {
    if (s) s.kills += 1;
    killed(run, e, si);
  }
}

/** A status from a rule, for this many seconds. */
const STATUS_SECS: Record<Status, number> = { slow: 2, stun: 0.8, daze: 2, mark: 3, bleed: 3, knock: 0.2, execute: 0 };

export function afflict(run: WarpathRun, si: number, e: Enemy, st: Status): void {
  if (st === 'execute') {
    if (!e.boss && e.hp < e.maxHp * 0.25) hurtEnemy(run, si, e, e.hp);
    return;
  }
  if (e.boss && (st === 'stun' || st === 'knock')) return;
  if (st === 'knock') {
    const d = Math.hypot(e.x - run.hx, e.y - run.hy) || 1;
    e.x += ((e.x - run.hx) / d) * 1.5;
    e.y += ((e.y - run.hy) / d) * 1.5;
    return;
  }
  e.status[st] = Math.max(e.status[st] ?? 0, STATUS_SECS[st]);
}

/** One attack from a squad's gun at `target`, rolled OPR-style. `relic`: a golden relic shot. */
export function strike(run: WarpathRun, grid: Grid, si: number, g: WGun, target: Enemy, m: Mods, aura: Auras, relic = false): void {
  const s = run.squads[si];
  const o = originOf(run, s);
  const cover = !g.melee && !g.indirect && terrainAt(run.seed, target.x, target.y)?.kind === 'cover' ? -1 : 0;
  const stealth = !g.melee && target.lord?.trick === 'stealth' ? -1 : 0;
  const p = g.reliable ? hitChance(2, cover + stealth) : hitChance(s.quality, g.hitMod + m.hit + aura.hit - penalty(s, 'hit') + cover + stealth);
  const r = rand(run);
  const live = s.skills;
  const sixHit = r < 1 / 6 && r < p;
  const sixes = sixHit ? live.flatMap((e) => (e.kind === 'sixes' && (!e.only || (e.only === 'melee') === g.melee) ? [e] : [])) : [];
  const shot = readShot(r, p, g.ap + m.ap, g.rending, sixes.some((e) => e.rend));
  if (run.fx.length < 700) run.fx.push({ kind: relic ? 'relic' : g.melee ? 'melee' : 'shot', x: o.x, y: o.y, x2: target.x, y2: target.y, t: g.melee ? 0.25 : 0.12 });
  if (shot.miss) return;
  const levelDmg = Math.floor(s.level / W.levels.dmgEvery) * 0.5;
  const last = live.find((e) => e.kind === 'lastStand' && s.alive <= s.size / 2);
  const mul = m.dmg * (last && last.kind === 'lastStand' ? last.mul : 1);
  const raw = rawDamage(g.deadly, levelDmg + sixes.reduce((n, e) => n + (e.dmg ?? 0), 0)) * mul;
  const over = has(run, 'overcharge');
  const saveOf = (e: Enemy) => saveChance(e.armour + run.enemyKinds[e.kind].defense, shot.ap);
  const hit = (e: Enemy, first: boolean) => {
    if (rand(run) < saveOf(e)) return;
    // Overcharge: every Nth hit the squad lands is a crit.
    if (over && (s.charge = (s.charge ?? 0) + 1) % T.overchargeEvery === 0) hurtEnemy(run, si, e, raw * T.overchargeMul, true);
    else hurtEnemy(run, si, e, raw, shot.six);
    if (first) for (const k of live) if (k.kind === 'onHit' && (!k.only || (k.only === 'melee') === g.melee) && rand(run) < k.chance) afflict(run, si, e, k.status);
  };
  hit(target, true);
  // Blast(X): lands on everything within its radius, each saving on its own.
  if (g.blast > 1) {
    const radius = blastRadius(g.blast);
    if (run.fx.length < 700) run.fx.push({ kind: 'boom', x: target.x, y: target.y, n: radius, t: 0.3 });
    grid.near(target.x, target.y, radius, (e) => {
      if (e !== target) hit(e, false);
    });
  }
  // Shrapnel sometimes splashes one more.
  if (m.splash > 0 && rand(run) < m.splash) {
    grid.near(target.x, target.y, W.blast.splash, (e) => {
      if (e === target) return;
      hit(e, false);
      return true;
    });
  }
  if (sixes.some((e) => e.again) && target.hp > 0) strike(run, grid, si, { ...g, ap: g.ap }, target, m, { ...aura }, relic);
}

/** The enemy a gun aims at: the nearest in reach, or the toughest for a Sniper. */
const aimOf = (run: WarpathRun, grid: Grid, s: Squad, g: WGun, m: Mods, aura: Auras) => {
  const o = originOf(run, s);
  return grid.pick(o.x, o.y, reachOf(s, g, m, aura), bigGun(g));
};

/** Snipers and anti-tank guns (AP 2+, Deadly, Blast) pick the toughest enemy in reach, so bosses get shot at. */
export const bigGun = (g: WGun) => g.sniper || g.ap >= 2 || g.deadly > 1 || g.blast > 1;

/** Attacks a volley with the models standing (the hero's guns are the hero's). */
const attacksOf = (s: Squad, g: WGun) => (s.kind === 'hero' ? g.attacks : (g.attacks * s.alive) / s.size);

/** Every squad's guns, timed rules, spells and relics. */
export function fireAll(run: WarpathRun, grid: Grid, dt: number): void {
  const m = mods(run);
  const auras = aurasOf(run);
  run.squads.forEach((s, si) => {
    if (s.frenzyLeft > 0) s.frenzyLeft -= dt;
    if (!onField(s)) return;
    const aura = auras[si];
    for (const g of s.guns) {
      const clock = { cd: g.cd, pending: g.pending, gap: g.gap, next: g.next, melee: g.melee, attacks: attacksOf(s, g) };
      let target: Enemy | undefined;
      runVolley(clock, rateOf(s, g, m, aura), dt, W.pace, () => rand(run), () => !!(target = aimOf(run, grid, s, g, m, aura)), () => {
        if (!target || target.hp <= 0) target = aimOf(run, grid, s, g, m, aura);
        if (!target) return false;
        strike(run, grid, si, g, target, m, aura);
        return true;
      });
      g.cd = clock.cd; g.pending = clock.pending; g.gap = clock.gap; g.next = clock.next;
    }
    timedRules(run, grid, si, dt, m, aura);
  });
  treeClocks(run, grid, dt);
}

/** The War Council's clocks: Wrath's burst round the hero, Bastion's shield. */
function treeClocks(run: WarpathRun, grid: Grid, dt: number): void {
  if (!has(run, 'wrath') && !has(run, 'bastion')) return;
  const c = (run.tree ??= {});
  if (has(run, 'wrath')) {
    c.wrath = (c.wrath ?? T.wrathEvery) - dt;
    if (c.wrath <= 0) {
      c.wrath = T.wrathEvery;
      blastAt(run, grid, 0, run.hx, run.hy, T.wrathRadius, T.wrathHits, T.wrathAp, Math.min(4, run.squads[0].quality), 'boom');
    }
  }
  if (has(run, 'bastion')) {
    c.bastion = (c.bastion ?? 0) - dt;
    if (c.bastion <= 0) {
      c.bastion = T.bastionEvery;
      run.shield = Math.max(run.shield ?? 0, run.maxHp * T.bastion);
    }
  }
}

/** Heal, Shield, Barrage and Frenzy on their clocks; Caster(X) spells; relic volleys. Heals and shields land on the hero. */
function timedRules(run: WarpathRun, grid: Grid, si: number, dt: number, m: Mods, aura: Auras): void {
  const s = run.squads[si];
  const A = W.ability;
  const o = originOf(run, s);
  for (const t of s.timed) {
    t.cd -= dt;
    if (t.cd > 0) continue;
    const e = t.effect;
    if (!('every' in e)) continue;
    t.cd = e.every * A.round * m.cd;
    if (e.kind === 'heal') healHero(run, e.n * A.hpPer);
    else if (e.kind === 'shield') run.shield = Math.max(run.shield ?? 0, e.n * A.hpPer);
    else if (e.kind === 'frenzy') { s.frenzy = e.mul; s.frenzyLeft = e.time * A.round; }
    else if (e.kind === 'barrage') {
      const reach = e.range ? e.range * TILE + 6 : Math.max(8, ...s.guns.map((g) => reachOf(s, g, m, aura)));
      const target = grid.pick(o.x, o.y, reach);
      if (!target) { t.cd = 0.5; continue; }
      blastAt(run, grid, si, target.x, target.y, (e.radius ?? 1) * A.barrageRadius, e.hits * 2, e.ap, s.quality, 'spell');
    }
  }
  if (s.caster > 0) {
    s.castCd -= dt;
    if (s.castCd <= 0) {
      const target = grid.pick(o.x, o.y, 20);
      if (target) {
        s.castCd = (W.caster.every / s.caster) * m.cd;
        blastAt(run, grid, si, target.x, target.y, W.caster.radius, W.caster.hits * s.caster, W.caster.ap, 4, 'spell');
      } else s.castCd = 0.5;
    }
  }
  for (const r of s.relics) {
    r.cd -= dt;
    if (r.cd > 0) continue;
    const g = [...s.guns].sort((a, b) => b.deadly + b.ap - (a.deadly + a.ap))[0];
    const target = g && grid.pick(o.x, o.y, Math.max(10, reachOf(s, g, m, aura)));
    if (!g || !target) { r.cd = 0.5; continue; }
    r.cd = W.relics[r.tier] * m.cd;
    for (let i = 0; i < W.relics.attacks; i++) {
      const t = target.hp > 0 ? target : grid.pick(o.x, o.y, Math.max(10, reachOf(s, g, m, aura)));
      if (!t) break;
      strike(run, grid, si, g, t, m, aura, true);
    }
  }
}

/** A blast of `hits` hits shared out over the enemies within `radius` of a point (a spell, a barrage, a landing). */
export function blastAt(run: WarpathRun, grid: Grid, si: number, x: number, y: number, radius: number, hits: number, ap: number, quality: number, fx: 'spell' | 'boom' | 'land'): void {
  run.fx.push({ kind: fx, x, y, n: radius, t: 0.5 });
  const near: Enemy[] = [];
  grid.near(x, y, radius, (e) => { near.push(e); });
  if (!near.length) return;
  const m = mods(run);
  for (let i = 0; i < hits; i++) {
    const e = near[i % near.length];
    if (e.hp <= 0) continue;
    if (rand(run) >= hitChance(quality, 0)) continue;
    if (rand(run) < saveChance(e.armour + run.enemyKinds[e.kind].defense, ap + m.ap)) continue;
    hurtEnemy(run, si, e, m.dmg);
  }
}

/** Mend the hero. */
export function healHero(run: WarpathRun, n: number): void {
  if (n <= 0 || run.hp <= 0) return;
  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + n);
  if (run.hp - before >= 1) run.fx.push({ kind: 'heal', x: run.hx, y: run.hy - 2, n: run.hp - before, t: 0.8 });
}
