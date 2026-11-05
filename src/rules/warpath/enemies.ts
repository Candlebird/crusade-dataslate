import { hitChance, rand, saveChance } from '../training/rng';
import { DOCTRINES, WARPATH } from './data';
import { inCover, terrainAt, unblock, type Grid } from './field';
import { onField } from './combat';
import { enemyMul, minutes, mods, woundsPer } from './mods';
import { clock } from './loot';
import type { Enemy, EnemyKind, Missile, Squad, WarpathRun } from './types';
import { has, TREE_FX } from './meta';

// The horde: packs come in from a ring past the screen edge, tougher every 5 minutes; a share stop at range and shoot
// (telegraphed); a captain every 3 minutes, an Echo Lord every 15 with its trick. Each goes for the nearest body, the hero
// or a squad on the ground: a squad hit rolls its own saves and loses models (they come back in time), the hero loses HP.

const W = WARPATH;
const E = W.enemy;
const B = W.bosses;

/** Tier weights now: the mix steps one tier tougher every shiftEvery seconds. */
function tierWeights(run: WarpathRun): number[] {
  const s = Math.floor(run.t / W.spawn.shiftEvery);
  return [Math.max(0.15, 1 - 0.28 * s), Math.min(1, 0.15 + 0.3 * s), s < 1 ? 0 : Math.min(1, 0.04 + 0.18 * (s - 1))];
}

/** A kind to field: a tier by weight, then a datasheet of that tier (heroes only as bosses). */
function pickKind(run: WarpathRun): number {
  const w = tierWeights(run);
  const pool = run.enemyKinds.map((k, i) => ({ k, i })).filter((x) => !x.k.hero);
  const list = pool.length ? pool : run.enemyKinds.map((k, i) => ({ k, i }));
  // Weight per tier, shared among that tier's datasheets, so a book full of big kinds is not all big kinds.
  const count = [0, 0, 0];
  for (const x of list) count[x.k.tier]++;
  const each = (t: number) => w[t] / Math.max(1, count[t]);
  const total = list.reduce((n, x) => n + each(x.k.tier), 0);
  if (total <= 0) return list[0].i;
  let r = rand(run) * total;
  for (const x of list) if ((r -= each(x.k.tier)) < 0) return x.i;
  return list[list.length - 1].i;
}

/** The share of the swarm that comes as elites now (none before elite.from). */
export const eliteShare = (run: WarpathRun) =>
  run.t < W.elite.from ? 0 : Math.min(W.elite.max, W.elite.share + W.elite.perMin * (run.t - W.elite.from) / 60);

/** A body of `kind` at (x, y): an elite has more wounds and a bigger body. */
export function spawnEnemy(run: WarpathRun, kind: number, x: number, y: number, boss?: Enemy['boss'], elite = false): Enemy {
  const k = run.enemyKinds[kind];
  const mul = enemyMul(run);
  const hp = k.hp * mul.hp * (elite ? W.elite.hp : 1);
  const e: Enemy = {
    id: run.nextId++, kind, x, y, hp, maxHp: hp, cd: E.meleeEvery * rand(run), aim: 0, tx: 0, ty: 0, status: {},
    size: k.size * (elite ? W.elite.size : 1), armour: 0, by: -1, shoots: !!k.gun && !boss && rand(run) < E.shooterShare,
    ...(boss ? { boss } : {}), ...(elite ? { elite } : {}),
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
      // Bodies owed while the field was full come in folded into elites (each worth `elite.hp` bodies of wounds).
      let elite = rand(run) < eliteShare(run);
      if (!elite && (run.surplus ?? 0) >= W.elite.hp - 1) {
        elite = true;
        run.surplus! -= W.elite.hp - 1;
      }
      spawnEnemy(run, kind, p.x, p.y, undefined, elite);
    }
    run.owed -= n;
    live += n;
  }
  // The field is full: what's owed builds up as surplus, to come in as elites once there's room.
  if (live >= W.spawn.maxField && run.owed > 1) {
    run.surplus = Math.min(W.spawn.maxField, (run.surplus ?? 0) + run.owed - 1);
    run.owed = 1;
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

/** A kind to field (by the clock's tier weights). */
export { pickKind };

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

/** How far a squad's models stand from its anchor (as drawn), so how big a body it is to hit. */
export const bodyOf = (s: Squad) =>
  s.kind === 'fort' ? 1.6 : s.kind === 'heavy' || s.kind === 'artillery' ? 1.2 + s.size * 0.5 : 0.9 + Math.sqrt(s.size) * 0.75;

/** Squads the swarm can hit: on the field and on the ground (not aircraft). */
const groundSquads = (run: WarpathRun) => run.squads.filter((s, i) => i > 0 && s.kind !== 'air' && onField(s));

/** Wounds onto a squad: a fortification loses HP; anything else loses models by Tough (Hold the Line shrugs some off). */
export function hurtSquad(run: WarpathRun, s: Squad, wounds: number): void {
  if (wounds <= 0 || !onField(s)) return;
  if (s.fort) {
    s.fort.hp -= wounds * E.dmgPerWound;
    if (s.fort.hp <= 0) {
      s.fort.hp = 0;
      s.fort.down = W.fort.respawn + W.fort.perPts * s.points;
      run.fx.push({ kind: 'boom', x: s.x, y: s.y, n: 3, t: 0.6 });
      run.log.push(`${clock(run.t)} ${s.name} destroyed; back in ${Math.round(s.fort.down)}s.`);
    }
    return;
  }
  s.wounds += wounds * mods(run).losses;
  let lost = 0;
  const per = woundsPer(s);
  while (s.wounds >= per && s.alive > 0) {
    s.wounds -= per;
    s.alive -= 1;
    lost += 1;
  }
  if (!lost) return;
  if (run.fx.length < 700) run.fx.push({ kind: 'dmg', x: s.x, y: s.y - bodyOf(s), n: lost, t: 0.8, hurt: true });
  if (s.alive <= 0) {
    s.wounds = 0;
    run.log.push(`${clock(run.t)} ${s.name} is cut down; it regroups.`);
  }
}

/** Damage onto the hero: Hold the Line, a shield, then HP. */
export function hurtHero(run: WarpathRun, dmg: number): void {
  if (dmg <= 0 || run.hp <= 0) return;
  const m = mods(run);
  // No one blow (a lord's swing, a big blast) takes more than a share of the hero's HP: it can be dodged, not one-shot.
  dmg = Math.min(dmg * m.heroDmg, run.maxHp * (has(run, 'unbreakable') ? TREE_FX.unbreakable : E.heroBlowCap));
  run.iframes = W.hero.iframes;
  if (run.shield && run.shield > 0) {
    const soak = Math.min(run.shield, dmg);
    run.shield -= soak;
    dmg -= soak;
  }
  run.hp -= dmg;
  if (run.fx.length < 700 && dmg > 0) run.fx.push({ kind: 'dmg', x: run.hx, y: run.hy - 1.5, n: dmg, t: 0.8, hurt: true });
}

/** Wounds from attacks: OPR to-hit and saves against `def` (+`mod`: cover); Deadly per wound, up to `cap` (it doesn't
 *  carry over). */
function rollWounds(run: WarpathRun, def: number, mod: number, attacks: number, quality: number, ap: number, deadly: number, cap: number): number {
  let w = 0;
  const whole = Math.floor(attacks) + (rand(run) < attacks % 1 ? 1 : 0);
  for (let i = 0; i < whole; i++) {
    if (rand(run) >= hitChance(quality, 0)) continue;
    if (rand(run) < saveChance(def, ap, mod)) continue;
    w += Math.min(deadly, cap);
  }
  return w;
}

/** Cover's Defense bonus for a body standing at (x, y). */
const coverMod = (run: WarpathRun, x: number, y: number) => (inCover(run.seed, x, y) ? W.follow.coverDef : 0);

/** Attacks on the hero: wounds as HP (`mul`: the clock's damage growth, an elite's blows). */
const rollOnHero = (run: WarpathRun, attacks: number, quality: number, ap: number, deadly: number, mul: number) =>
  rollWounds(run, heroDef(run), coverMod(run, run.hx, run.hy), attacks, quality, ap, deadly, E.heroDeadlyCap) * mul * E.dmgPerWound;

/** Attacks on a squad: wounds on its models (a fortification takes them as HP). */
function strikeSquad(run: WarpathRun, s: Squad, attacks: number, quality: number, ap: number, deadly: number, mul: number): void {
  const w = rollWounds(run, s.defense, coverMod(run, s.x, s.y), attacks, quality, ap, deadly, s.fort ? deadly : woundsPer(s));
  if (w > 0) hurtSquad(run, s, w * mul * W.losses.squadDmg);
}

/** A missile lands on the hero (unless it's untouchable). */
function land(run: WarpathRun, m: Missile): void {
  if (run.iframes > 0) return;
  const dmg = rollOnHero(run, m.attacks, m.quality, m.ap, m.dmg, enemyMul(run).dmg);
  if (dmg > 0) hurtHero(run, dmg);
}

/** A missile lands on a squad. */
const landOn = (run: WarpathRun, s: Squad, m: Missile) => strikeSquad(run, s, m.attacks, m.quality, m.ap, m.dmg, enemyMul(run).dmg);

/** Shots fly and blasts tick down. */
export function missileStep(run: WarpathRun, dt: number): void {
  const ground = groundSquads(run);
  for (const m of run.missiles) {
    m.life -= dt;
    if (m.blast) {
      if (m.life <= 0) {
        run.fx.push({ kind: 'boom', x: m.x, y: m.y, n: E.blastRadius, t: 0.4 });
        if ((run.hx - m.x) ** 2 + (run.hy - m.y) ** 2 < E.blastRadius ** 2) land(run, m);
        for (const s of ground) if ((s.x - m.x) ** 2 + (s.y - m.y) ** 2 < (E.blastRadius + bodyOf(s) * 0.5) ** 2) landOn(run, s, m);
      }
      continue;
    }
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    // A shot stops in the first body it reaches: the hero or a squad.
    if ((run.hx - m.x) ** 2 + (run.hy - m.y) ** 2 < E.shotRadius ** 2) {
      land(run, m);
      m.life = -1;
      continue;
    }
    const s = ground.find((q) => (q.x - m.x) ** 2 + (q.y - m.y) ** 2 < (bodyOf(q) * 0.8 + E.shotRadius) ** 2);
    if (s) {
      landOn(run, s, m);
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
  const ground = groundSquads(run);
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    const k = run.enemyKinds[e.kind];
    if (!statusStep(e, dt, hurt) || e.hp <= 0) continue;
    trickStep(run, e, dt);
    // A champion holds its site until the hero comes close.
    if (e.guard !== undefined) {
      if ((run.hx - e.x) ** 2 + (run.hy - e.y) ** 2 > W.sites.wake ** 2) continue;
      delete e.guard;
    }
    // Its mark: the nearest body. A squad (its edge) closer than the hero and within `aggro`, else the hero.
    let tx = run.hx;
    let ty = run.hy;
    let mark: Squad | undefined;
    const dh2 = (run.hx - e.x) ** 2 + (run.hy - e.y) ** 2;
    let d = Math.sqrt(dh2);
    let body = 0.4;
    for (const s of ground) {
      const r = bodyOf(s);
      const ds = Math.hypot(s.x - e.x, s.y - e.y);
      if (ds - r < d - body && ds - r < W.losses.aggro) { d = ds; body = r; tx = s.x; ty = s.y; mark = s; }
    }
    const reach = e.size / 2 + body + E.touch * 0.5;
    // Shooters stop at range and wind up.
    if (e.shoots && k.gun && d < k.gun.reach * 0.85 && d > reach) {
      if (e.aim > 0) {
        e.aim -= dt;
        if (e.aim <= 0) { loose(run, e, k); e.cd = 3 + rand(run) * 2; }
      } else {
        e.cd -= dt;
        if (e.cd <= 0) { e.aim = E.windUp; e.tx = tx; e.ty = ty; }
      }
      continue;
    }
    e.aim = 0;
    if (d > reach) {
      let v = k.speed * (e.boss ? 0.85 : 1);
      if (e.status.slow) v *= 0.5;
      if (e.status.daze) v *= 0.75;
      if (fear && dh2 < fearR2) v *= 1 - fear;
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
    if (mark) {
      strikeSquad(run, mark, attacks, k.quality, k.melee.ap, k.melee.deadly, mul.dmg * (e.elite ? W.elite.dmg : 1));
      continue;
    }
    if (run.iframes > 0) continue;
    const dmg = rollOnHero(run, attacks, k.quality, k.melee.ap, k.melee.deadly, mul.dmg * (e.elite ? W.elite.dmg : 1));
    if (dmg > 0) {
      hurtHero(run, dmg);
      // Thorns: what wounds the hero in melee pays for it.
      if (has(run, 'thorns')) hurt(e, e.maxHp * (e.boss ? TREE_FX.thornsBoss : TREE_FX.thorns));
    }
  }
}
