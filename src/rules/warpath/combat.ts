import type { Status } from '../abilities';
import { rawDamage, readShot, runVolley } from '../shots';
import { hitChance, rand, saveChance } from '../training/rng';
import { DOCTRINES, STRATAGEMS, WARPATH } from './data';
import { terrainAt, type Grid } from './field';
import { blastRadius, mods, penalty, type Mods } from './mods';
import { killed } from './loot';
import { has, TREE_FX as T } from './meta';
import { bless, boon, dodgeOf, plateOf, roleOf, shrug } from './traits';
import type { Enemy, Squad, WarpathRun, WGun, WSpell } from './types';

// The force at work: every squad's guns on Training's volley clock (shots.ts), OPR rolls against the enemy's Defense,
// rules on hit, relics and spells on their own clocks. Squads fire from where they stand (the hero's own guns from the hero).

const W = WARPATH;
const R = W.roles;
/** A rule's radius in Training cells, in inches here. */
const TILE = 3;

/** Is the squad on the field and able to fire (a fortification on the ground, a squad with models standing)? */
export const onField = (s: Squad) => s.alive > 0 && !s.reserve && (!s.fort || (s.fort.down <= 0 && s.fort.fall <= 0));

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
  g.melee ? g.reach : (g.reach + (aura?.range ?? 0) * TILE + (boon(s, 'reach') ? R.reachBoon : 0)) * (1 + W.levels.reach * s.level) * m.reach;

/** How fast a squad's gun goes: levels, doctrines, a frenzy, rate auras and scars. */
export function rateOf(s: Squad, g: WGun, m: Mods, aura?: Auras): number {
  // Stance: a steady aim, a charge's fury, a flyer's short pass, Fear on it.
  const steady = !g.melee && (s.held ?? 0) >= R.holdAfter ? 1 + R.holdRate : 1;
  const charged = g.melee && (s.charged ?? 0) > 0 ? 1 + R.chargeRate : 1;
  const flying = !g.melee && roleOf(s) === 'flyer' && s.kind !== 'hero' ? W.air.rate : 1;
  const shaken = (s.shaken ?? 0) > 0 ? R.shakenRate : 1;
  return (1 + W.levels.rate * s.level) * (g.melee ? m.meleeRate : m.shootRate) * (s.frenzyLeft > 0 ? s.frenzy : 1)
    * (1 + (aura?.rate ?? 0)) * Math.max(0.3, 1 - penalty(s, 'rate')) * (1 + 0.04 * s.guessed.length) * steady * charged * flying * shaken;
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
  // Giant Slayer: the big ones take more.
  const slayer = run.doctrines.giantSlayer ?? 0;
  if (slayer && (e.boss || e.elite || e.champ !== undefined)) dmg *= 1 + DOCTRINES.giantSlayer.dmg * slayer * (run.stratagems?.giantKiller ? STRATAGEMS.giantKiller.mul : 1);
  // Executioner: a hit that leaves a non-boss low finishes it.
  if (!e.boss && e.hp - dmg > 0 && e.hp - dmg < e.maxHp * T.executeBelow && has(run, 'executioner')) {
    dmg = e.hp;
    crit = true;
  }
  const dealt = Math.min(e.hp, dmg);
  e.hp -= dmg;
  e.hitT = run.t;
  e.by = si;
  const s = run.squads[si];
  if (s) s.dealt += dealt;
  if (run.fx.length < 700) run.fx.push({ kind: 'dmg', x: e.x, y: e.y - e.size * 0.6, n: dmg, t: 0.7, crit, hero: si === 0 });
  if (e.hp <= 0) {
    if (s) s.kills += 1;
    killed(run, e, si);
    // Self-Destruct: it goes off where it falls.
    const fuse = run.enemyKinds[e.kind].ways?.fuse;
    if (fuse && !e.boss && run.missiles.length < 300) {
      const k = run.enemyKinds[e.kind];
      run.missiles.push({ x: e.x, y: e.y, vx: 0, vy: 0, life: W.foes.fuseSecs, fuse: W.foes.fuseSecs, blast: true, radius: W.foes.fuseRadius, quality: k.quality, ap: 1, dmg: 1, attacks: fuse, blow: { noCover: true } });
    }
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

/** A knot of bodies that shrugged a hit off shows a tick. */
const wardFx = (run: WarpathRun, e: Enemy) => {
  if (run.fx.length < 700) run.fx.push({ kind: 'ward', x: e.x, y: e.y, t: 0.3 });
};

/** Bodies within `crowdR` of a point, up to `crowdMany`. */
function crowd(grid: Grid, x: number, y: number): number {
  let n = 0;
  grid.near(x, y, R.crowdR, () => ++n >= R.crowdMany);
  return n;
}

/** One attack from a squad's gun at `target`, rolled OPR-style. `relic`: a golden relic shot. `more`: it may yet earn
 *  another attack (off for those extra attacks). */
export function strike(run: WarpathRun, grid: Grid, si: number, g: WGun, target: Enemy, m: Mods, aura: Auras, relic = false, more = true): void {
  const s = run.squads[si];
  const o = originOf(run, s);
  const k0 = run.enemyKinds[target.kind];
  const dist = Math.hypot(target.x - o.x, target.y - o.y);
  const far = !g.melee && dist > W.rules.far;
  const charging = (s.charged ?? 0) > 0;
  const single = (e: Enemy) => !!e.boss || run.enemyKinds[e.kind].pack === 1;
  const cover = !g.melee && !g.indirect && !g.noCover && terrainAt(run.seed, target.x, target.y)?.kind === 'cover' ? -1 : 0;
  const stealth = !g.melee && target.lord?.trick === 'stealth' ? -1 : 0;
  // Unstoppable ignores negative modifiers.
  const pen = g.unstoppable ? 0 : cover + stealth - dodgeOf(k0.body, g.melee, far);
  const bonus = (boon(s, 'hit') ? 1 : 0) + (g.thrust && charging ? 1 : 0) + (g.duelist && single(target) ? 1 : 0);
  const p = g.reliable ? hitChance(2, pen) : hitChance(s.quality, g.hitMod + m.hit + aura.hit - penalty(s, 'hit') + pen + bonus);
  const r = rand(run);
  const live = s.skills;
  const sixHit = r < 1 / 6 && r < p;
  const sixes = sixHit ? live.flatMap((e) => (e.kind === 'sixes' && (!e.only || (e.only === 'melee') === g.melee) ? [e] : [])) : [];
  const shot = readShot(r, p, g.ap + m.ap, g.rending, sixes.some((e) => e.rend));
  if (run.fx.length < 700) run.fx.push({ kind: relic ? 'relic' : g.melee ? 'melee' : 'shot', x: o.x, y: o.y, x2: target.x, y2: target.y, t: g.melee ? 0.25 : 0.12 });
  // Rapid Volley: another attack in half range. Reaping and Reavers: another, the more bodies round them.
  if (more && !relic) {
    if (g.rapid && dist < g.reach / 2 && rand(run) < 0.34) strike(run, grid, si, g, target, m, aura, false, false);
    if (g.reaping || roleOf(s) === 'reaver') {
      const n = crowd(grid, o.x, o.y);
      const odds = n >= R.crowdMany ? R.crowdManyOdds : n >= R.crowdFew ? R.crowdFewOdds : 0;
      if (odds > 0 && rand(run) < odds && target.hp > 0) strike(run, grid, si, g, target, m, aura, false, false);
    }
  }
  if (shot.miss) return;
  const levelDmg = Math.floor(s.level / W.levels.dmgEvery) * 0.5;
  const last = live.find((e) => e.kind === 'lastStand' && s.alive <= s.size / 2);
  const hunted = roleOf(s) === 'hunter' ? R.huntMul : 1;
  const mul = m.dmg * (last && last.kind === 'lastStand' ? last.mul : 1);
  const raw = rawDamage(g.deadly, levelDmg + sixes.reduce((n, e) => n + (e.dmg ?? 0), 0)) * mul;
  const over = has(run, 'overcharge');
  const leap = has(run, 'ricochet');
  // AP against this body: what the weapon's rules add, less its plate.
  const apOn = (e: Enemy) => {
    const k = run.enemyKinds[e.kind];
    const tough = k.hp / W.enemy.hpPerTough;
    let ap = shot.ap - plateOf(k.body, far);
    if (g.thrust && charging) ap += 1;
    if (g.duelist && single(e)) ap += 1;
    if (g.demolish && tough >= 3 && tough <= 9) ap += 2;
    if (g.slayer && charging && tough >= 3) ap += 2;
    if (g.crack && k.defense + e.armour <= g.crack.def) ap += g.crack.ap;
    return Math.max(0, ap);
  };
  const hit = (e: Enemy, first: boolean) => {
    const k = run.enemyKinds[e.kind];
    let u = rand(run);
    // Bane: a defense roll of 6 is rolled again.
    if (g.bane && u < 1 / 6) u = rand(run);
    if (u < saveChance(e.armour + k.defense, apOn(e))) return;
    if (k.body && shrug(run, k.body, g.noRegen || shot.rend)) return wardFx(run, e);
    // Shred: a natural save of 1 (Quake: 1-2) takes one more wound.
    const dmg = (raw + (g.shred && u >= 1 - g.shred / 6 ? mul : 0)) * (hunted > 1 && (e.boss || e.elite) ? hunted : 1);
    // Overcharge: every Nth hit the squad lands is a crit.
    if (over && (s.charge = (s.charge ?? 0) + 1) % T.overchargeEvery === 0) hurtEnemy(run, si, e, dmg * T.overchargeMul, true);
    else hurtEnemy(run, si, e, dmg, shot.six);
    // Ricochet: every Nth hit goes on to the next body.
    if (leap && (s.charge = (s.charge ?? 0) + 1) % T.ricochetEvery === 0) {
      const next: Enemy[] = [];
      grid.near(e.x, e.y, T.ricochetReach, (q) => {
        if (q !== e && q.hp > 0) next.push(q);
        return next.length > 0;
      });
      if (next.length) {
        if (run.fx.length < 700) run.fx.push({ kind: 'shot', x: e.x, y: e.y, x2: next[0].x, y2: next[0].y, t: 0.15 });
        hurtEnemy(run, si, next[0], dmg, true);
      }
    }
    if (first) {
      for (const q of live) if (q.kind === 'onHit' && (!q.only || (q.only === 'melee') === g.melee) && rand(run) < q.chance) afflict(run, si, e, q.status);
      if (g.suppress) afflict(run, si, e, 'daze');
      if (g.slowing) afflict(run, si, e, 'slow');
    }
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
  if (sixes.some((e) => e.again) && target.hp > 0) strike(run, grid, si, { ...g, ap: g.ap }, target, m, { ...aura }, relic, false);
  // Surge, and Furious on the charge: a six hits again.
  if (more && shot.six && (g.surge || boon(s, 'furious') || (charging && s.traits?.furious)) && target.hp > 0) strike(run, grid, si, g, target, m, aura, relic, false);
}

/** What aims where nobody else does: a gun's strikes on the run (a rush, a blink). */
export const NO_AURA: Auras = { hit: 0, save: 0, rate: 0, range: 0 };

/** The squad's best melee weapon (a rush's blows). */
export function bestMelee(s: Squad): WGun | undefined {
  let best: WGun | undefined;
  let score = -1;
  for (const g of s.guns) {
    if (!g.melee) continue;
    const n = g.attacks * Math.max(1, g.deadly) * (1 + 0.3 * g.ap);
    if (n > score) { score = n; best = g; }
  }
  return best;
}

/** A body run down in a charge: a blow from its best melee weapon and its Impact hits (2+ to hit, each on its own save). */
export function rushBlow(run: WarpathRun, grid: Grid, si: number, e: Enemy, m: Mods): void {
  const s = run.squads[si];
  const g = bestMelee(s);
  if (g) strike(run, grid, si, g, e, m, NO_AURA, false, false);
  const n = s.traits?.impact ?? 0;
  const k = run.enemyKinds[e.kind];
  for (let i = 0; i < n && e.hp > 0; i++) {
    if (rand(run) >= hitChance(2, 0)) continue;
    if (rand(run) < saveChance(e.armour + k.defense, (s.traits?.impactAp ?? 0) + m.ap)) continue;
    if (k.body && shrug(run, k.body, false)) { wardFx(run, e); continue; }
    hurtEnemy(run, si, e, m.dmg * (1 + Math.floor(s.level / W.levels.dmgEvery) * 0.5));
  }
}

/** The enemy a gun aims at: the nearest in reach, or the toughest for a Sniper; a Hunter's look for elites and bosses
 *  first. Shadowborn bodies can't be reached from as far. */
const aimOf = (run: WarpathRun, grid: Grid, s: Squad, g: WGun, m: Mods, aura: Auras) => {
  const o = originOf(run, s);
  const reach = reachOf(s, g, m, aura);
  const seen = g.melee ? undefined : (e: Enemy) => {
    const sh = run.enemyKinds[e.kind].body?.shadow;
    return !sh || (e.x - o.x) ** 2 + (e.y - o.y) ** 2 <= Math.max(1, reach - sh) ** 2;
  };
  if (roleOf(s) === 'hunter') {
    const prey = grid.pick(o.x, o.y, reach, true, (e) => (!!e.boss || !!e.elite) && (!seen || seen(e)));
    if (prey) return prey;
  }
  return grid.pick(o.x, o.y, reach, bigGun(g), seen);
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
    s.saveAura = auras[si].save;
    if (!onField(s)) return;
    const aura = auras[si];
    const shelling = roleOf(s) === 'artillery';
    for (let gi = 0; gi < s.guns.length; gi++) {
      const g = s.guns[gi];
      const clock = { cd: g.cd, pending: g.pending, gap: g.gap, next: g.next, melee: g.melee, attacks: attacksOf(s, g) };
      let target: Enemy | undefined;
      runVolley(clock, rateOf(s, g, m, aura), dt, W.pace, () => rand(run), () => !!(target = aimOf(run, grid, s, g, m, aura)), () => {
        if (!target || target.hp <= 0) target = aimOf(run, grid, s, g, m, aura);
        if (!target) return false;
        if (shelling && g.indirect && (run.shells ??= []).length < R.shellCap) {
          const p = knotFor(run, grid, s, reachOf(s, g, m, aura)) ?? target;
          run.shells.push({ x: p.x + (rand(run) - 0.5) * 3, y: p.y + (rand(run) - 0.5) * 3, t: R.shellTime, si, gun: gi });
          return true;
        }
        strike(run, grid, si, g, target, m, aura);
        return true;
      });
      g.cd = clock.cd; g.pending = clock.pending; g.gap = clock.gap; g.next = clock.next;
    }
    timedRules(run, grid, si, dt, m, aura);
    passives(run, grid, si, dt);
    if (s.traits?.buffs?.length) buffStep(run, s, dt, m);
  });
  shellStep(run, grid, dt, m);
  treeClocks(run, grid, dt);
}

/** Where an Artillery squad is dropping shells: the thickest knot in reach, looked for once a second. */
function knotFor(run: WarpathRun, grid: Grid, s: Squad, reach: number): { x: number; y: number } | undefined {
  if (s.knot && s.knot.t > run.t) return s.knot;
  const k = densest(grid, s.x, s.y, reach);
  if (k) s.knot = { x: k.x, y: k.y, t: run.t + 1 };
  return k;
}

/** Shells in the air come down: everything inside takes the gun's hit, each saving on its own. */
function shellStep(run: WarpathRun, grid: Grid, dt: number, m: Mods): void {
  if (!run.shells?.length) return;
  for (const sh of run.shells) {
    sh.t -= dt;
    if (sh.t > 0) continue;
    const s = run.squads[sh.si];
    const g = s?.guns[sh.gun];
    if (!g) continue;
    const blast = Math.max(g.blast, R.shellBlast);
    const target = grid.pick(sh.x, sh.y, blastRadius(blast));
    if (target) strike(run, grid, sh.si, { ...g, blast }, target, m, NO_AURA, false, false);
    else if (run.fx.length < 700) run.fx.push({ kind: 'boom', x: sh.x, y: sh.y, n: blastRadius(blast), t: 0.3 });
  }
  run.shells = run.shells.filter((sh) => sh.t > 0);
}

/** Rules that work on a clock of their own: Fear shaking nearby foes, field effects. */
function passives(run: WarpathRun, grid: Grid, si: number, dt: number): void {
  const s = run.squads[si];
  s.pulse = (s.pulse ?? 0) - dt;
  if (s.pulse > 0) return;
  s.pulse = R.pulseEvery;
  const o = originOf(run, s);
  if (s.traits?.fear) grid.near(o.x, o.y, R.fearR, (e) => { if (!e.boss) afflict(run, si, e, 'daze'); });
  for (const f of s.skills) if (f.kind === 'field') grid.near(o.x, o.y, f.radius * TILE, (e) => { afflict(run, si, e, f.status); });
}

/** A Support's boon, in turn, on everyone near it. */
function buffStep(run: WarpathRun, s: Squad, dt: number, m: Mods): void {
  s.buffCd = (s.buffCd ?? R.buffEvery / 2) - dt;
  if (s.buffCd > 0) return;
  s.buffCd = R.buffEvery * m.cd;
  const list = s.traits!.buffs!;
  const id = list[(s.spell = (s.spell ?? 0) + 1) % list.length];
  const o = originOf(run, s);
  for (const q of run.squads) {
    const p = originOf(run, q);
    if (!onField(q) || (p.x - o.x) ** 2 + (p.y - o.y) ** 2 > R.boonReach ** 2) continue;
    bless(q, id);
    if (run.fx.length < 700) run.fx.push({ kind: 'boon', x: p.x, y: p.y, n: 2, t: 0.6 });
  }
}

/** A model back on the nearest hurt squad (a Mend, a Heal). */
function mendNear(run: WarpathRun, o: { x: number; y: number }): void {
  let best: Squad | undefined;
  let bd = R.mendReach ** 2;
  for (let i = 1; i < run.squads.length; i++) {
    const q = run.squads[i];
    if (q.alive <= 0 || q.reserve || (q.alive >= q.size && !q.wounds && !(q.fort && q.fort.hp < q.fort.maxHp))) continue;
    const d = (q.x - o.x) ** 2 + (q.y - o.y) ** 2;
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) return;
  if (best.fort) best.fort.hp = Math.min(best.fort.maxHp, best.fort.hp + best.fort.maxHp * 0.1);
  else if (best.wounds > 0) best.wounds = 0;
  else best.alive += 1;
  if (run.fx.length < 700) run.fx.push({ kind: 'heal', x: best.x, y: best.y - 2, n: 1, t: 0.8 });
}

/** A caster's next spell (its book's, in turn; a generic blast if it has none). Cost sets the pace. */
function castStep(run: WarpathRun, grid: Grid, si: number, dt: number, m: Mods): void {
  const s = run.squads[si];
  const o = originOf(run, s);
  s.castCd -= dt;
  if (s.castCd > 0) return;
  const reach = W.caster.reach;
  const list = s.spells ?? [];
  const sp: WSpell | undefined = list.length ? list[(s.spell ?? 0) % list.length] : undefined;
  s.spell = (s.spell ?? 0) + 1;
  const pace = (W.caster.every / s.caster) * m.cd;
  if (!sp) {
    const target = grid.pick(o.x, o.y, reach);
    if (!target) { s.castCd = 0.5; return; }
    s.castCd = pace;
    blastAt(run, grid, si, target.x, target.y, W.caster.radius, W.caster.hits * s.caster, W.caster.ap, 4, 'spell');
    return;
  }
  s.castCd = pace * (sp.cost / 2);
  if (sp.boon) {
    const near = run.squads.filter((q) => onField(q)).map((q) => ({ q, p: originOf(run, q) }))
      .sort((a, b) => (a.p.x - o.x) ** 2 + (a.p.y - o.y) ** 2 - ((b.p.x - o.x) ** 2 + (b.p.y - o.y) ** 2)).slice(0, sp.targets + 1);
    for (const { q, p } of near) {
      bless(q, sp.boon);
      if (run.fx.length < 700) run.fx.push({ kind: 'boon', x: p.x, y: p.y, n: 2, t: 0.6 });
    }
    return;
  }
  const knot = densest(grid, o.x, o.y, reach);
  if (!knot) { s.castCd = 0.5; s.spell -= 1; return; }
  if (sp.curse) {
    const radius = sp.radius ?? W.caster.spellRadius;
    run.fx.push({ kind: 'spell', x: knot.x, y: knot.y, n: radius, t: 0.5 });
    grid.near(knot.x, knot.y, radius, (e) => { afflict(run, si, e, sp.curse!); });
    return;
  }
  const radius = sp.radius ?? W.caster.spellRadius;
  const opts = { deadly: sp.deadly, noRegen: sp.noRegen, spell: true };
  blastAt(run, grid, si, knot.x, knot.y, radius, (sp.hits ?? 1) * W.caster.spellHits, sp.ap ?? 0, 3, 'spell', opts);
  // More targets: other bodies in reach, each its own blast.
  for (let i = 1; i < sp.targets; i++) {
    const other = grid.pick(o.x + (rand(run) - 0.5) * reach, o.y + (rand(run) - 0.5) * reach, reach / 2);
    if (other) blastAt(run, grid, si, other.x, other.y, radius, (sp.hits ?? 1) * W.caster.spellHits, sp.ap ?? 0, 3, 'spell', opts);
  }
}

/** The thickest knot of bodies within `R` of a point (at most 12 bodies sampled), with at least `min` round it. */
export function densest(grid: Grid, cx: number, cy: number, radius: number, min = 1): { x: number; y: number; n: number } | undefined {
  const all: Enemy[] = [];
  grid.near(cx, cy, radius, (e) => { all.push(e); });
  if (!all.length) return undefined;
  const stride = Math.max(1, Math.floor(all.length / 12));
  let best: { x: number; y: number; n: number } | undefined;
  for (let i = 0; i < all.length; i += stride) {
    const e = all[i];
    let n = 0;
    grid.near(e.x, e.y, R.knotR, () => ++n >= 40);
    if (n >= min && (!best || n > best.n)) best = { x: e.x, y: e.y, n };
  }
  return best;
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
    if (e.kind === 'heal') {
      healHero(run, e.n * A.hpPer);
      mendNear(run, o);
    }
    else if (e.kind === 'shield') run.shield = Math.max(run.shield ?? 0, e.n * A.hpPer);
    else if (e.kind === 'frenzy') { s.frenzy = e.mul; s.frenzyLeft = e.time * A.round; }
    else if (e.kind === 'barrage') {
      const reach = e.range ? e.range * TILE + 6 : Math.max(8, ...s.guns.map((g) => reachOf(s, g, m, aura)));
      const target = grid.pick(o.x, o.y, reach);
      if (!target) { t.cd = 0.5; continue; }
      blastAt(run, grid, si, target.x, target.y, (e.radius ?? 1) * A.barrageRadius, e.hits * 2, e.ap, s.quality, 'spell');
    }
  }
  if (s.caster > 0) castStep(run, grid, si, dt, m);
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
export function blastAt(run: WarpathRun, grid: Grid, si: number, x: number, y: number, radius: number, hits: number, ap: number, quality: number, fx: 'spell' | 'boom' | 'land', opts?: { deadly?: number; noRegen?: boolean; spell?: boolean }): void {
  run.fx.push({ kind: fx, x, y, n: radius, t: 0.5 });
  const near: Enemy[] = [];
  grid.near(x, y, radius, (e) => { near.push(e); });
  if (!near.length) return;
  const m = mods(run);
  const s = run.squads[si];
  const dmg = rawDamage(opts?.deadly ?? 1, s ? Math.floor(s.level / W.levels.dmgEvery) * 0.5 : 0) * m.dmg;
  for (let i = 0; i < hits; i++) {
    const e = near[i % near.length];
    if (e.hp <= 0) continue;
    const k = run.enemyKinds[e.kind];
    if (rand(run) >= hitChance(quality, 0)) continue;
    if (rand(run) < saveChance(e.armour + k.defense, ap + m.ap)) continue;
    if (k.body && shrug(run, k.body, opts?.noRegen, opts?.spell)) { wardFx(run, e); continue; }
    hurtEnemy(run, si, e, dmg);
  }
}

/** Mend the hero. */
export function healHero(run: WarpathRun, n: number): void {
  if (n <= 0 || run.hp <= 0) return;
  const before = run.hp;
  run.hp = Math.min(run.maxHp, run.hp + n);
  if (run.hp - before >= 1) run.fx.push({ kind: 'heal', x: run.hx, y: run.hy - 2, n: run.hp - before, t: 0.8 });
}
