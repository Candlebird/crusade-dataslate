import { hitChance, rand, saveChance } from '../training/rng';
import { DOCTRINES, WARPATH } from './data';
import { terrainAt, unblock, type Grid } from './field';
import { onField } from './combat';
import { enemyMul, minutes, mods } from './mods';
import { clock } from './loot';
import type { Enemy, EnemyKind, Missile, WarpathRun } from './types';

// The horde: packs come in from a ring past the screen edge, tougher every 5 minutes; a share stop at range and shoot
// (telegraphed); a captain every 5 minutes, an Echo Lord every 15 with its trick. Blows on the hero spread model losses
// to the squads around it.

const W = WARPATH;
const E = W.enemy;
const B = W.bosses;

/** Tier weights now: the mix steps one tier tougher every shiftEvery seconds. */
function tierWeights(run: WarpathRun): number[] {
  const s = Math.floor(run.t / W.spawn.shiftEvery);
  return [Math.max(0.15, 1 - 0.28 * s), Math.min(1, 0.15 + 0.3 * s), Math.min(1, 0.04 + 0.18 * Math.max(0, s - 1))];
}

/** A kind to field: a tier by weight, then a datasheet of that tier (heroes only as bosses). */
function pickKind(run: WarpathRun): number {
  const w = tierWeights(run);
  const pool = run.enemyKinds.map((k, i) => ({ k, i })).filter((x) => !x.k.hero);
  const list = pool.length ? pool : run.enemyKinds.map((k, i) => ({ k, i }));
  const total = list.reduce((n, x) => n + w[x.k.tier], 0);
  let r = rand(run) * total;
  for (const x of list) if ((r -= w[x.k.tier]) < 0) return x.i;
  return list[list.length - 1].i;
}

/** A body of `kind` at (x, y). */
export function spawnEnemy(run: WarpathRun, kind: number, x: number, y: number, boss?: Enemy['boss']): Enemy {
  const k = run.enemyKinds[kind];
  const mul = enemyMul(run);
  const hp = k.hp * mul.hp;
  const e: Enemy = {
    id: run.nextId++, kind, x, y, hp, maxHp: hp, cd: E.meleeEvery * rand(run), aim: 0, tx: 0, ty: 0, status: {},
    size: k.size, armour: 0, by: -1, shoots: !!k.gun && !boss && rand(run) < E.shooterShare,
    ...(boss ? { boss } : {}),
  };
  run.enemies.push(e);
  return e;
}

/** Enemies owed this second: a start rate plus more each minute (Hard: faster). */
export const spawnRate = (run: WarpathRun) => (W.spawn.perSec + W.spawn.perMin * minutes(run)) * (run.mode === 'hard' ? W.hard.spawn : 1);

/** Packs come in from the ring around the hero, a little ahead of where it's heading half the time. */
export function spawnStep(run: WarpathRun, dt: number): void {
  if (!run.enemyKinds.length) return;
  run.owed += spawnRate(run) * dt;
  let live = 0;
  for (const e of run.enemies) if (e.hp > 0) live++;
  while (run.owed >= 1 && live < W.spawn.maxField) {
    const kind = pickKind(run);
    const k = run.enemyKinds[kind];
    const n = Math.max(1, Math.min(k.pack, Math.ceil(run.owed), 8));
    const a = rand(run) < 0.5 ? run.face + (rand(run) - 0.5) * 1.6 : rand(run) * Math.PI * 2;
    const cx = run.hx + Math.cos(a) * W.spawn.ring;
    const cy = run.hy + Math.sin(a) * W.spawn.ring;
    for (let i = 0; i < n; i++) {
      const p = { x: cx + (rand(run) - 0.5) * 4, y: cy + (rand(run) - 0.5) * 4 };
      unblock(run.seed, p, k.size / 2);
      spawnEnemy(run, kind, p.x, p.y);
    }
    run.owed -= n;
    live += n;
  }
  if (run.owed > 20) run.owed = 20;
}

/** The boss's datasheet: a hero if the book has one, else its dearest. */
function bossKind(run: WarpathRun): number {
  let best = 0;
  run.enemyKinds.forEach((k, i) => {
    const b = run.enemyKinds[best];
    if ((k.hero ? 1e6 : 0) + k.points * k.hp > (b.hero ? 1e6 : 0) + b.points * b.hp) best = i;
  });
  return best;
}

/** Bosses on the clock: a captain every captainEvery seconds; every lordEvery, an Echo Lord instead. */
export function bossStep(run: WarpathRun): void {
  const next = (run.bossesDone + 1) * W.bosses.captainEvery;
  if (run.t < next || !run.enemyKinds.length) return;
  run.bossesDone += 1;
  const lord = next % W.bosses.lordEvery === 0;
  const a = run.face + (rand(run) - 0.5);
  const e = spawnEnemy(run, bossKind(run), run.hx + Math.cos(a) * W.spawn.ring * 0.8, run.hy + Math.sin(a) * W.spawn.ring * 0.8, lord ? 'lord' : 'captain');
  const hp = (lord ? B.lordHp : B.captainHp) * (1 + B.hpPerMin * (minutes(run) - 5)) * enemyMul(run).hp;
  e.hp = e.maxHp = hp;
  e.size = lord ? B.lordSize : B.size;
  e.armour = lord ? 1 : 0;
  if (lord) {
    const i = Math.floor(run.t / W.bosses.lordEvery) - 1;
    const l = run.lords[i];
    e.lord = { i, ...(l ? { trick: l.trick } : {}), cd: 4, ward: 0 };
    if (l?.trick === 'armour') e.armour += 1;
  }
  const name = e.lord && run.lords[e.lord.i] ? run.lords[e.lord.i].name : `${run.enemyKinds[e.kind].name} (${lord ? 'lord' : 'captain'})`;
  run.log.push(`${clock(run.t)} ${name} takes the field.`);
}

/** The hero's Defense (a scarred save counts). */
const heroDef = (run: WarpathRun) => run.squads[0].defense;

/** Damage onto the hero: Hold the Line, a shield, then HP; a share spreads to squads near it as lost models. */
export function hurtHero(run: WarpathRun, dmg: number): void {
  if (dmg <= 0 || run.hp <= 0) return;
  const m = mods(run);
  dmg *= m.heroDmg;
  run.iframes = W.hero.iframes;
  const spread = dmg * W.losses.share * m.losses;
  if (run.shield && run.shield > 0) {
    const soak = Math.min(run.shield, dmg);
    run.shield -= soak;
    dmg -= soak;
  }
  run.hp -= dmg;
  if (run.fx.length < 700 && dmg > 0) run.fx.push({ kind: 'dmg', x: run.hx, y: run.hy - 1.5, n: dmg, t: 0.8, hurt: true });
  // Squads close by lose models in proportion: wounds pile up on the next model to fall.
  const near = run.squads.filter((s, i) => i > 0 && s.kind !== 'air' && s.kind !== 'fort' && s.alive > 0 && (s.x - run.hx) ** 2 + (s.y - run.hy) ** 2 < W.losses.radius ** 2);
  if (!near.length) return;
  const each = spread / near.length;
  for (const s of near) {
    s.wounds += each;
    while (s.wounds >= s.tough && s.alive > 0) {
      s.wounds -= s.tough;
      s.alive -= 1;
    }
    if (s.alive <= 0) s.wounds = 0;
  }
}

/** One enemy model's blows (or a shot's hits) on the hero: OPR to-hit and saves, Deadly per wound. */
function rollOnHero(run: WarpathRun, attacks: number, quality: number, ap: number, deadly: number, mul: number): number {
  let dmg = 0;
  const whole = Math.floor(attacks) + (rand(run) < attacks % 1 ? 1 : 0);
  for (let i = 0; i < whole; i++) {
    if (rand(run) >= hitChance(quality, 0)) continue;
    if (rand(run) < saveChance(heroDef(run), ap)) continue;
    dmg += deadly * mul * E.dmgPerWound;
  }
  return dmg;
}

/** A missile lands (a shot that reached the hero, or a blast marker's fuse running out). */
function land(run: WarpathRun, m: Missile): void {
  if (run.iframes > 0) return;
  const dmg = rollOnHero(run, m.attacks, m.quality, m.ap, m.dmg, enemyMul(run).dmg);
  if (dmg > 0) hurtHero(run, dmg);
}

/** Shots fly and blasts tick down. */
export function missileStep(run: WarpathRun, dt: number): void {
  for (const m of run.missiles) {
    m.life -= dt;
    if (m.blast) {
      if (m.life <= 0) {
        run.fx.push({ kind: 'boom', x: m.x, y: m.y, n: E.blastRadius, t: 0.4 });
        if ((run.hx - m.x) ** 2 + (run.hy - m.y) ** 2 < E.blastRadius ** 2) land(run, m);
      }
      continue;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if ((run.hx - m.x) ** 2 + (run.hy - m.y) ** 2 < E.shotRadius ** 2) {
      land(run, m);
      m.life = -1;
    }
  }
  run.missiles = run.missiles.filter((m) => m.life > 0);
}

/** Loose a shot or blast marker at (tx, ty). */
function loose(run: WarpathRun, e: Enemy, k: EnemyKind): void {
  const g = k.gun!;
  if (g.blast) {
    run.missiles.push({ x: e.tx, y: e.ty, vx: 0, vy: 0, life: E.blastFuse, blast: true, quality: k.quality, ap: g.ap, dmg: g.deadly, attacks: g.attacks * 1.5 });
    return;
  }
  const d = Math.hypot(e.tx - e.x, e.ty - e.y) || 1;
  run.missiles.push({ x: e.x, y: e.y, vx: ((e.tx - e.x) / d) * E.shotSpeed, vy: ((e.ty - e.y) / d) * E.shotSpeed, life: (g.reach * 1.3) / E.shotSpeed, blast: false, quality: k.quality, ap: g.ap, dmg: g.deadly, attacks: g.attacks });
}

/** Statuses wear off; bleed hurts. Returns whether it can act this step. */
function statusStep(e: Enemy, dt: number, hurt: (e: Enemy, n: number) => void): boolean {
  const s = e.status;
  for (const k in s) {
    const key = k as keyof typeof s;
    s[key] = (s[key] ?? 0) - dt;
    if ((s[key] ?? 0) <= 0) delete s[key];
  }
  if (s.bleed) hurt(e, 1 * dt);
  return !s.stun;
}

/** A lord's trick, on its own clock. */
function trickStep(run: WarpathRun, e: Enemy, dt: number): void {
  const L = e.lord;
  if (!L?.trick) return;
  L.cd -= dt;
  if (L.trick === 'regen') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.006 * dt);
  if (L.cd > 0) return;
  const d = Math.hypot(run.hx - e.x, run.hy - e.y);
  switch (L.trick) {
    case 'teleport':
      if (d > 14) {
        const a = rand(run) * Math.PI * 2;
        e.x = run.hx + Math.cos(a) * 9;
        e.y = run.hy + Math.sin(a) * 9;
        run.fx.push({ kind: 'spell', x: e.x, y: e.y, n: 3, t: 0.5 });
      }
      L.cd = 8;
      break;
    case 'shield':
      L.ward = e.maxHp * 0.12;
      L.cd = 12;
      break;
    case 'summon':
      for (let i = 0; i < 6; i++) spawnEnemy(run, pickKind(run), e.x + (rand(run) - 0.5) * 6, e.y + (rand(run) - 0.5) * 6);
      L.cd = 10;
      break;
    case 'burst':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        run.missiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * E.shotSpeed * 0.6, vy: Math.sin(a) * E.shotSpeed * 0.6, life: 2, blast: false, quality: 4, ap: 1, dmg: 1, attacks: 2 });
      }
      L.cd = 6;
      break;
    case 'storm':
      for (let i = 0; i < 3; i++) run.missiles.push({ x: run.hx + (rand(run) - 0.5) * 8, y: run.hy + (rand(run) - 0.5) * 8, vx: 0, vy: 0, life: E.blastFuse, blast: true, quality: 4, ap: 1, dmg: 1, attacks: 3 });
      L.cd = 5;
      break;
    default:
      L.cd = 999;
  }
}

/** Does a lord's Fear slow the hero (within 10")? */
export const feared = (run: WarpathRun) =>
  run.enemies.some((e) => e.hp > 0 && e.lord?.trick === 'fear' && (e.x - run.hx) ** 2 + (e.y - run.hy) ** 2 < 100);

/** Every enemy: statuses, its lord trick, moving in (round blocking terrain, slowed by difficult, hurt by dangerous),
 *  crowding apart, then a blow on the hero or a landed fortification, or a telegraphed shot from range. */
export function enemyStep(run: WarpathRun, grid: Grid, dt: number, hurt: (e: Enemy, n: number) => void): void {
  const mul = enemyMul(run);
  const fear = mods(run).fear;
  const fearR2 = DOCTRINES.fearTactics.radius ** 2;
  const forts = run.squads.filter((s) => s.kind === 'fort' && onField(s));
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    const k = run.enemyKinds[e.kind];
    if (!statusStep(e, dt, hurt) || e.hp <= 0) continue;
    trickStep(run, e, dt);
    // Its mark: a landed fortification closer than the hero and within 8", else the hero.
    let tx = run.hx;
    let ty = run.hy;
    let fort = -1;
    let best = (run.hx - e.x) ** 2 + (run.hy - e.y) ** 2;
    const dh = best;
    for (const s of forts) {
      const d = (s.x - e.x) ** 2 + (s.y - e.y) ** 2;
      if (d < best && d < 64) { best = d; tx = s.x; ty = s.y; fort = run.squads.indexOf(s); }
    }
    const d = Math.sqrt(best);
    const reach = (e.size + (fort >= 0 ? 2.4 : 0.8)) / 2 + E.touch * 0.5;
    // Shooters stop at range and wind up.
    if (e.shoots && k.gun && fort < 0 && d < k.gun.reach * 0.85 && d > reach) {
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) { loose(run, e, k); e.cd = 3 + rand(run) * 2; }
      } else {
        e.cd -= dt;
        if (e.cd <= 0) { e.aim = E.windUp; e.tx = run.hx; e.ty = run.hy; }
      }
      continue;
    }
    e.aim = 0;
    if (d > reach) {
      let v = k.speed * (e.boss ? 0.85 : 1);
      if (e.status.slow) v *= 0.5;
      if (e.status.daze) v *= 0.75;
      if (fear && dh < fearR2) v *= 1 - fear;
      const t = terrainAt(run.seed, e.x, e.y);
      if (t?.kind === 'difficult') v *= 0.6;
      else if (t?.kind === 'dangerous' && rand(run) < dt * 0.5) hurt(e, 1);
      const step = Math.min(d - reach * 0.9, v * dt);
      e.x += ((tx - e.x) / d) * step;
      e.y += ((ty - e.y) / d) * step;
      unblock(run.seed, e, e.size / 2);
    }
    // Crowding: push apart from close neighbours (a few, to keep it cheap).
    let n = 0;
    grid.near(e.x, e.y, e.size, (o, d2) => {
      if (o === e || d2 < 1e-6) return;
      const dd = Math.sqrt(d2);
      const min = (e.size + o.size) / 2;
      if (dd < min) {
        const push = ((min - dd) / dd) * 0.25;
        e.x += (e.x - o.x) * push;
        e.y += (e.y - o.y) * push;
      }
      return ++n >= 6;
    });
    if (d > reach + 0.4) continue;
    e.cd -= dt;
    if (e.cd > 0) continue;
    e.cd = E.meleeEvery * (e.boss ? B.every : 1) * (e.status.daze ? 1.4 : 1);
    const attacks = k.melee.attacks * (e.boss === 'lord' ? B.lordBlows : e.boss ? B.blows : 1);
    if (fort >= 0) {
      const s = run.squads[fort];
      let dmg = 0;
      const whole = Math.round(attacks);
      for (let i = 0; i < whole; i++) if (rand(run) < hitChance(k.quality, 0) && rand(run) >= saveChance(s.defense, k.melee.ap)) dmg += k.melee.deadly * mul.dmg * E.dmgPerWound;
      if (s.fort && dmg > 0) {
        s.fort.hp -= dmg;
        if (s.fort.hp <= 0) {
          s.fort.hp = 0;
          s.fort.down = W.fort.respawn + W.fort.perPts * s.points;
          run.fx.push({ kind: 'boom', x: s.x, y: s.y, n: 3, t: 0.6 });
          run.log.push(`${clock(run.t)} ${s.name} destroyed; back in ${Math.round(s.fort.down)}s.`);
        }
      }
      continue;
    }
    if (run.iframes > 0) continue;
    const dmg = rollOnHero(run, attacks, k.quality, k.melee.ap, k.melee.deadly, mul.dmg);
    if (dmg > 0) hurtHero(run, dmg);
  }
}
