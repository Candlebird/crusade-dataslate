import type { Unit } from '../model/types';
import type { Category } from './data';
import { fighter, type Gun } from './autoBattle';
import { levelForXp } from './engine';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from './downtimeData';
import { unitName } from './battle';

// Training sim: a tower-defense run. The squad stands on a grid around a base and holds off endless waves. Units are
// towers made from their profile: their weapons shoot (or strike, in melee) whatever comes in reach, and their category
// gives them a role. Each wave favours a direction shown before it starts; Scouts and Ambushers come from the other
// side. Most enemies shoot on the move as well as fighting in melee. Enemies drop credits for upgrades. Only XP leaves
// the run: +1 every 3 waves cleared to each unit still standing, up to 3 a run.

export type UpgradeKind = 'hp' | 'dmg' | 'rate' | 'range';

export const UPGRADES: Record<UpgradeKind, { name: string; desc: string }> = {
  hp: { name: `+${TRAINING.toughMul} wounds`, desc: `${TRAINING.toughMul} more wounds per model (+1 Tough), added to its current wounds too. Wounds don't heal between waves.` },
  dmg: { name: '+1 Damage', desc: 'Every hit deals 1 more damage.' },
  rate: { name: '+Fire rate', desc: `Attacks ${Math.round(TRAINING.ratePerLevel * 100)}% more often.` },
  range: { name: '+1 Range', desc: 'One more tile of reach for every weapon, and for a Hero’s aura.' },
};

export const ROLES: Record<Category, string> = {
  Hero: `Aura: +1 to hit for units within ${TRAINING.auraRadius} tiles, itself included.`,
  Infantry: 'Dug in: +1 Defense once it has stood still through a whole wave.',
  Elite: 'A 6 to hit deals +1 damage.',
  'Vehicle/Monster': 'Crush: hurts every enemy fighting it, more with Impact.',
  Aircraft: 'Flies: nothing can fight it in melee, but enemies can shoot it. It blocks nothing.',
  Fortification: `${TRAINING.fortificationHp}× wounds, but it can't move once a wave has started.`,
};

export interface TrainingGun extends Gun {
  /** Seconds until it can attack again. */
  cd: number;
  /** Shots of the current volley still to come, one every `gap` seconds; `next` counts down to the next. */
  pending: number;
  gap: number;
  next: number;
}

export interface TrainingTower {
  unitId: string;
  name: string;
  category: Category;
  level: number;
  /** Tile; -1 = not on the map. */
  x: number;
  y: number;
  /** Waves started when it was put where it stands. */
  placedAt: number;
  hp: number;
  maxHp: number;
  size: number;
  tough: number;
  quality: number;
  defense: number;
  defMod: number;
  fortified: boolean;
  ignore: number;
  evasive: number;
  impact: number;
  hitShoot: number;
  hitMelee: number;
  atkBonus: number;
  guns: TrainingGun[];
  up: Record<UpgradeKind, number>;
  dead: boolean;
  kills: number;
  /** XP earned this run. */
  xp: number;
}

export interface TrainingEnemy {
  id: number;
  kind: TrainingEnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  cd: number;
  /** Seconds until its gun can fire again. */
  gcd: number;
  credits: number;
}

interface Spawn {
  kind: TrainingEnemyKind;
  /** Seconds into the wave. */
  at: number;
  x: number;
  y: number;
  hp: number;
  credits: number;
}

/** A shot or blow, drawn for a moment. */
export interface TrainingFx {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  color: string;
  /** A blow: drawn as a slash at the target rather than a beam. */
  melee?: boolean;
  /** A shot or blow that missed: drawn off to one side of the target, fainter. */
  miss?: boolean;
  /** Hits a unit shrugged off (saved or ignored): drawn as a blue shield ring round it. */
  saved?: number;
}

/** How long a shot and a blow stay on screen (seconds). */
export const FX_TIME = { shot: 0.15, melee: 0.3, save: 0.45 };

export interface TrainingRun {
  /** Random state: the same seed and the same moves play out the same. */
  rng: number;
  phase: 'setup' | 'wave' | 'over';
  /** Waves started. */
  wave: number;
  cleared: number;
  /** Direction the next (or current) wave favours: 0 = north, then clockwise in 45° steps. */
  dir: number;
  baseHp: number;
  credits: number;
  /** Upgrades bought this run: each costs more than the last. */
  bought: number;
  towers: TrainingTower[];
  enemies: TrainingEnemy[];
  queue: Spawn[];
  /** Seconds into the current wave. */
  t: number;
  nextId: number;
  fx: TrainingFx[];
  log: string[];
}

const C = TRAINING.mapSize / 2;
export const BASE = { x: C, y: C, tile: Math.floor(C), radius: 0.7 };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const hitChance = (quality: number, mod: number) => clamp((7 - quality + mod) / 6, 1 / 6, 5 / 6);
const saveChance = (defense: number, ap: number, mod: number) => clamp((7 - defense - ap + mod) / 6, 0, 5 / 6);
const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** mulberry32, its state kept on the run. */
function rand(run: TrainingRun): number {
  run.rng = (run.rng + 0x6d2b79f5) | 0;
  let t = run.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const pick = <T,>(run: TrainingRun, xs: T[]) => xs[Math.floor(rand(run) * xs.length)];

/** The squad's power: its points, with each level adding a share. Waves scale with it. */
export function squadPower(units: Unit[]): number {
  return units.reduce((n, u) => n + u.points * (1 + TRAINING.levelPower * levelForXp(u.xp)), 0);
}

/** A unit as a tower. */
export function towerOf(u: Unit): TrainingTower {
  const size = Math.max(1, u.size);
  const tough = Math.max(1, u.tough || 1);
  const f = fighter(u, { id: u.id, name: unitName(u), wounds: size * tough, maxWounds: size * tough, points: u.points }, 'train', 'A');
  const maxHp = Math.max(1, Math.round(size * tough * TRAINING.toughMul * f.defBonus)) * (u.category === 'Fortification' ? TRAINING.fortificationHp : 1);
  return {
    unitId: u.id, name: unitName(u), category: u.category, level: levelForXp(u.xp), x: -1, y: -1, placedAt: 0,
    hp: maxHp, maxHp, size, tough: maxHp / size, quality: f.quality, defense: f.defense, defMod: f.defMod, fortified: f.fortified,
    ignore: f.ignore, evasive: f.evasive, impact: f.impact, hitShoot: f.hitShoot, hitMelee: f.hitMelee, atkBonus: f.atkBonus,
    guns: f.guns.map((g) => ({ ...g, cd: 0, pending: 0, gap: 0, next: 0 })), up: { hp: 0, dmg: 0, rate: 0, range: 0 }, dead: false, kills: 0, xp: 0,
  };
}

export function createRun(units: Unit[], seed: number): TrainingRun {
  const run: TrainingRun = {
    rng: seed | 0, phase: 'setup', wave: 0, cleared: 0, dir: 0, baseHp: TRAINING.baseHp, credits: 0, bought: 0,
    towers: units.slice(0, TRAINING.squadMax).map(towerOf), enemies: [], queue: [], t: 0, nextId: 1, fx: [], log: [],
  };
  run.dir = Math.floor(rand(run) * 8);
  return run;
}

export const placed = (t: TrainingTower) => t.x >= 0 && !t.dead;
export const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Reach of a gun in tiles, with Range upgrades. */
export const reach = (t: TrainingTower, g: Gun) => (g.melee ? TRAINING.meleeReach : g.range / TRAINING.inchesPerTile) + t.up.range;
export const auraOf = (t: TrainingTower) => TRAINING.auraRadius + t.up.range;
const center = (t: TrainingTower) => ({ x: t.x + 0.5, y: t.y + 0.5 });
const alive = (t: TrainingTower) => Math.min(t.size, Math.ceil(t.hp / t.tough));
/** Infantry that has stood still through a whole wave is dug in. */
export const dugIn = (run: TrainingRun, t: TrainingTower) => t.category === 'Infantry' && t.placedAt < run.wave - (run.phase === 'wave' ? 1 : 0);

/** Why a unit can't go on (or move to) a tile, or null when it can. */
export function placeProblem(run: TrainingRun, unitId: string, x: number, y: number): string | null {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (!t || t.dead) return 'That unit is out of this run.';
  if (run.phase !== 'setup') return 'Units can only be placed or moved between waves.';
  if (x < 1 || y < 1 || x > TRAINING.mapSize - 2 || y > TRAINING.mapSize - 2) return 'The outer ring is where the enemy comes in.';
  if (x === BASE.tile && y === BASE.tile) return 'That is the base.';
  if (run.towers.some((o) => o !== t && placed(o) && o.x === x && o.y === y)) return 'Another unit stands there.';
  if (fixed(run, t)) return 'Fortifications can’t move once a wave has started.';
  return null;
}

/** A Fortification that has been through a wave stays where it is. */
export const fixed = (run: TrainingRun, t: TrainingTower) => t.category === 'Fortification' && placed(t) && t.placedAt < run.wave;

export function placeTower(run: TrainingRun, unitId: string, x: number, y: number) {
  const p = placeProblem(run, unitId, x, y);
  if (p) throw new Error(p);
  const t = run.towers.find((u) => u.unitId === unitId)!;
  if (t.x !== x || t.y !== y) t.placedAt = run.wave;
  t.x = x;
  t.y = y;
}

/** Take a unit off the map (between waves). */
export function liftTower(run: TrainingRun, unitId: string) {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (!t || run.phase !== 'setup') throw new Error('Units can only be moved between waves.');
  if (fixed(run, t)) throw new Error('Fortifications can’t move once a wave has started.');
  t.x = -1;
  t.y = -1;
}

/** Credits for the next upgrade bought. */
export const upgradeCost = (n: number) => Math.round(TRAINING.upgradeBase * TRAINING.upgradeGrowth ** n);

export function upgradeProblem(run: TrainingRun, unitId: string): string | null {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (run.phase === 'over') return 'The run is over.';
  if (!t || t.dead) return 'That unit is out of this run.';
  if (Math.floor(run.credits) < upgradeCost(run.bought)) return `Needs ${upgradeCost(run.bought)} credits.`;
  return null;
}

export function buyUpgrade(run: TrainingRun, unitId: string, kind: UpgradeKind) {
  const p = upgradeProblem(run, unitId);
  if (p) throw new Error(p);
  const t = run.towers.find((u) => u.unitId === unitId)!;
  run.credits -= upgradeCost(run.bought);
  run.bought += 1;
  t.up[kind] += 1;
  if (kind === 'hp') {
    t.tough += TRAINING.toughMul;
    t.maxHp += t.size * TRAINING.toughMul;
    t.hp += t.size * TRAINING.toughMul;
  }
}

/** A point on the map's edge, `deg` clockwise from north. */
function edgePoint(deg: number) {
  const a = (deg * Math.PI) / 180;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const k = (C - 0.3) / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: C + dx * k, y: C + dy * k };
}

/** What the wave's enemies cost in all, before any toughening. */
export function waveBudget(power: number, wave: number): number {
  return (power / 100) * TRAINING.budgetPer100 * TRAINING.budgetGrowth ** (wave - 1);
}

/** Credits a wave drops if every enemy dies: about `upgradesPerWave` upgrades' worth at this point in a run. */
export function waveCredits(wave: number): number {
  const n = TRAINING.upgradesPerWave * (wave - 1);
  let sum = 0;
  for (let i = 0; i < TRAINING.upgradesPerWave; i++) sum += upgradeCost(n + i);
  return sum;
}

/** Plan a wave: what comes, from where, and when. */
export function planWave(run: TrainingRun, power: number, wave: number): Spawn[] {
  let budget = waveBudget(power, wave);
  // The upgrades go further in a smaller squad, so its enemies toughen faster.
  const perUnit = TRAINING.squadMax / Math.max(1, run.towers.length);
  const hpMul = Math.max(1, budget / TRAINING.maxBudget) * TRAINING.hpGrowth ** ((wave - 1) * perUnit);
  const bossMul = clamp(power / TRAINING.bossPower, 0.4, 2);
  budget = Math.min(budget, TRAINING.maxBudget) * TRAINING.enemyCount;
  const kinds: TrainingEnemyKind[] = [];
  if (wave % TRAINING.bossEvery === 0) {
    kinds.push('lord');
    budget -= TRAINING_ENEMIES.lord.cost;
  }
  const pool = (Object.keys(TRAINING_ENEMIES) as TrainingEnemyKind[]).filter((k) => TRAINING_ENEMIES[k].spawn !== 'boss' && TRAINING_ENEMIES[k].from <= wave);
  for (let guard = 0; guard < 500; guard++) {
    const fits = pool.filter((k) => TRAINING_ENEMIES[k].cost <= budget);
    if (!fits.length) break;
    const k = pick(run, fits);
    // Flankers are rarer: one try in two, they give way to the main wave.
    if (TRAINING_ENEMIES[k].spawn !== 'main' && rand(run) < 0.5) continue;
    kinds.push(k);
    budget -= TRAINING_ENEMIES[k].cost;
  }
  if (!kinds.length) kinds.push('swarm');

  const window = Math.min(30, 6 + kinds.length * 0.5);
  const totalCost = kinds.reduce((n, k) => n + TRAINING_ENEMIES[k].cost, 0);
  const pool$ = waveCredits(wave);
  const main = run.dir * 45;
  const back = main + 180;
  const spread = (lo: number, hi: number) => lo + rand(run) * (hi - lo);
  return kinds.map((kind) => {
    const def = TRAINING_ENEMIES[kind];
    let at: number;
    let p: { x: number; y: number };
    if (def.spawn === 'scout') {
      at = rand(run);
      p = edgePoint(back + spread(-TRAINING.flankArc, TRAINING.flankArc));
    } else if (def.spawn === 'ambush') {
      at = window * spread(0.35, 0.75);
      p = ambushPoint(run, back);
    } else {
      at = def.spawn === 'boss' ? window * 0.5 : rand(run) * window;
      // Most come from the favoured side; the rest from anywhere else.
      const deg = def.spawn === 'boss' || rand(run) < TRAINING.favoured
        ? main + spread(-TRAINING.arc, TRAINING.arc)
        : main + TRAINING.arc + rand(run) * (360 - 2 * TRAINING.arc);
      p = edgePoint(deg);
    }
    return { kind, at, x: p.x, y: p.y, hp: def.hp * hpMul * (def.spawn === 'boss' ? bossMul : 1), credits: (pool$ * def.cost) / totalCost };
  }).sort((a, b) => a.at - b.at);
}

/** Ambushers appear close in on the far side, but not right on top of a unit. */
function ambushPoint(run: TrainingRun, back: number) {
  let p = { x: C, y: C };
  for (let i = 0; i < 12; i++) {
    const deg = back + (rand(run) * 2 - 1) * TRAINING.flankArc;
    const r = TRAINING.ambushRange[0] + rand(run) * (TRAINING.ambushRange[1] - TRAINING.ambushRange[0]);
    const a = (deg * Math.PI) / 180;
    p = { x: C + Math.sin(a) * r, y: C - Math.cos(a) * r };
    if (!run.towers.some((t) => placed(t) && dist(p.x, p.y, t.x + 0.5, t.y + 0.5) < 1.5)) break;
  }
  return p;
}

export function startProblem(run: TrainingRun): string | null {
  if (run.phase !== 'setup') return 'A wave is already under way.';
  if (!run.towers.some(placed)) return 'Place at least one unit first.';
  return null;
}

/** Start the next wave. `power` is the squad's (see squadPower). */
export function startWave(run: TrainingRun, power: number) {
  const p = startProblem(run);
  if (p) throw new Error(p);
  run.wave += 1;
  run.phase = 'wave';
  run.t = 0;
  run.queue = planWave(run, power, run.wave);
  run.towers.forEach((t) => t.guns.forEach((g) => { g.cd = 0; g.pending = 0; }));
  const flank = run.queue.filter((s) => TRAINING_ENEMIES[s.kind].spawn === 'scout' || TRAINING_ENEMIES[s.kind].spawn === 'ambush').length;
  run.log.push(`Wave ${run.wave}: ${run.queue.length} enemies from the ${DIRECTIONS[run.dir]}${flank ? `, ${flank} on the far side` : ''}.`);
}

/** The enemy a gun aims at: the one nearest the base, or the toughest for a Sniper. */
function targetFor(run: TrainingRun, t: TrainingTower, g: TrainingGun): TrainingEnemy | undefined {
  const c = center(t);
  const r = reach(t, g);
  let best: TrainingEnemy | undefined;
  let score = Infinity;
  for (const e of run.enemies) {
    if (e.hp <= 0 || dist(c.x, c.y, e.x, e.y) > r) continue;
    const s = g.name.includes('Sniper') ? -e.hp : dist(e.x, e.y, BASE.x, BASE.y);
    if (s < score) { score = s; best = e; }
  }
  return best;
}

function hurt(run: TrainingRun, t: TrainingTower, e: TrainingEnemy, dmg: number) {
  if (e.hp <= 0) return;
  e.hp -= dmg;
  if (e.hp <= 0) {
    t.kills += 1;
    run.credits += e.credits;
  }
}

/** One shot (or blow) from one gun, at the enemy it's aimed at: false if there's none in reach. */
function fire(run: TrainingRun, t: TrainingTower, g: TrainingGun, aura: number): boolean {
  const target = targetFor(run, t, g);
  if (!target) return false;
  const p = g.reliable ? 5 / 6 : hitChance(t.quality, g.hitMod + (g.melee ? t.hitMelee : t.hitShoot) + aura);
  const r = rand(run);
  // Each shot comes from somewhere across the unit's tile, as if from one of its models; a miss lands off to one side
  // of the target. Where is only for show, so it doesn't touch the run's dice.
  const c = center(t);
  const a = Math.random() * Math.PI * 2;
  const off = r >= p ? 0.45 + Math.random() * 0.35 : Math.random() * 0.12;
  const from = t.size > 1 ? 0.35 : 0;
  run.fx.push({
    x1: c.x + (Math.random() - 0.5) * 2 * from, y1: c.y + (Math.random() - 0.5) * 2 * from,
    x2: target.x + Math.cos(a) * off, y2: target.y + Math.sin(a) * off,
    t: g.melee ? FX_TIME.melee : FX_TIME.shot, color: g.melee ? '#ffd27a' : '#9fd3ff', melee: g.melee, miss: r >= p,
  });
  if (r >= p) return true;
  const six = r < 1 / 6;
  // Deadly(X) sets the damage of a hit; AP and upgrades add to it, armour takes off (Rending 6s ignore it).
  const armour = six && g.rending ? 0 : TRAINING_ENEMIES[target.kind].armor;
  const raw = Math.max(1, g.deadly) + g.ap + t.up.dmg - armour + (six && t.category === 'Elite' ? 1 : 0);
  const dmg = Math.max(0.5, raw) * t.atkBonus;
  hurt(run, t, target, dmg);
  // Blast: the hit spills onto others close by.
  if (g.blast > 1) {
    run.enemies
      .filter((o) => o !== target && o.hp > 0 && dist(o.x, o.y, target.x, target.y) <= TRAINING.blastRadius)
      .slice(0, g.blast - 1)
      .forEach((o) => hurt(run, t, o, Math.max(0.5, raw - TRAINING_ENEMIES[o.kind].armor + armour) * t.atkBonus));
  }
  return true;
}

/** An enemy's attacks on a unit: wounds they deal. */
function strike(run: TrainingRun, e: TrainingEnemy, t: TrainingTower, w: { attacks: number; ap: number; ranged: boolean }): number {
  const def = TRAINING_ENEMIES[e.kind];
  const ap = Math.max(0, w.ap - (t.fortified ? 1 : 0));
  const save = saveChance(t.defense, ap, t.defMod + (dugIn(run, t) ? 1 : 0));
  let wounds = 0;
  let saved = 0;
  for (let i = 0; i < w.attacks; i++) {
    if (rand(run) >= hitChance(def.quality, -t.evasive * (w.ranged ? 1 : 0.5))) continue;
    if (rand(run) < save || rand(run) < t.ignore) saved += 1;
    else wounds += 1;
  }
  if (saved) {
    const c = center(t);
    run.fx.push({ x1: c.x, y1: c.y, x2: c.x, y2: c.y, t: FX_TIME.save, color: '#5ab0ff', saved });
  }
  return wounds;
}

/** An enemy's attacks on the base: each hit is a point of damage. */
function strikeBase(run: TrainingRun, e: TrainingEnemy): number {
  const def = TRAINING_ENEMIES[e.kind];
  let n = 0;
  for (let i = 0; i < def.attacks; i++) if (rand(run) < hitChance(def.quality, 0)) n += 1;
  return n;
}

/** The unit an enemy is fighting, if any: the nearest it has come up against (Spitters: the nearest in range). */
function engaged(run: TrainingRun, e: TrainingEnemy): TrainingTower | undefined {
  const def = TRAINING_ENEMIES[e.kind];
  const r = def.range || TRAINING.engage;
  let best: TrainingTower | undefined;
  let d = Infinity;
  for (const t of run.towers) {
    if (!placed(t) || (t.category === 'Aircraft' && !def.range)) continue;
    const c = center(t);
    const dd = dist(c.x, c.y, e.x, e.y);
    if (dd <= r && dd < d) { d = dd; best = t; }
  }
  return best;
}

/** The nearest unit within `r` tiles of a point. */
function nearestUnit(run: TrainingRun, x: number, y: number, r: number): TrainingTower | undefined {
  let best: TrainingTower | undefined;
  let d = Infinity;
  for (const t of run.towers) {
    if (!placed(t)) continue;
    const c = center(t);
    const dd = dist(c.x, c.y, x, y);
    if (dd <= r && dd < d) { d = dd; best = t; }
  }
  return best;
}

function wound(run: TrainingRun, t: TrainingTower, n: number) {
  t.hp -= n;
  if (t.hp > 0) return;
  t.dead = true;
  t.hp = 0;
  run.log.push(`${t.name} falls in wave ${run.wave}. It is out of this run.`);
}

/** Advance the run by `dt` seconds. */
export function step(run: TrainingRun, dt: number) {
  run.fx = run.fx.filter((f) => (f.t -= dt) > 0);
  if (run.phase !== 'wave') return;
  run.t += dt;

  while (run.queue.length && run.queue[0].at <= run.t) {
    const s = run.queue.shift()!;
    run.enemies.push({ id: run.nextId++, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.hp, cd: TRAINING.enemyEvery * 0.5, gcd: TRAINING.enemyShootEvery * rand(run), credits: s.credits });
  }

  const towers = run.towers.filter(placed);
  const heroes = towers.filter((t) => t.category === 'Hero');
  for (const t of towers) {
    const aura = heroes.some((h) => dist(h.x, h.y, t.x, t.y) <= auraOf(h)) ? 1 : 0;
    const speed = 1 + TRAINING.ratePerLevel * t.up.rate;
    for (const g of t.guns) {
      g.cd -= dt;
      // A volley's shots go one after another over the first part of the wait before the next.
      if (g.cd <= 0 && targetFor(run, t, g)) {
        g.cd = (g.melee ? TRAINING.meleeEvery : TRAINING.shootEvery) / speed;
        g.pending = Math.max(1, Math.round((g.attacks * alive(t)) / t.size));
        g.gap = (g.cd * TRAINING.volleySpread) / g.pending;
        g.next = 0;
      }
      g.next -= dt;
      while (g.pending > 0 && g.next <= 0) {
        g.pending -= 1;
        g.next += g.gap;
        if (!fire(run, t, g, aura)) g.pending = 0;
      }
    }
  }

  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    const def = TRAINING_ENEMIES[e.kind];
    const foe = engaged(run, e);
    const toBase = dist(e.x, e.y, BASE.x, BASE.y);
    const atBase = toBase <= BASE.radius + (def.range || def.size + 0.15);
    e.cd -= dt;
    e.gcd -= dt;
    // A gun fires on the move, at whatever unit is nearest, even one it is fighting.
    if (def.gun && e.gcd <= 0) {
      const t = nearestUnit(run, e.x, e.y, def.gun.range);
      if (t) {
        e.gcd = TRAINING.enemyShootEvery;
        wound(run, t, strike(run, e, t, { ...def.gun, ranged: true }));
        const c = center(t);
        run.fx.push({ x1: e.x, y1: e.y, x2: c.x, y2: c.y, t: FX_TIME.shot, color: '#ff6b6b' });
      }
    }
    if (foe?.dead) continue;
    if (foe) {
      if (foe.category === 'Vehicle/Monster' && !def.range) e.hp -= (TRAINING.crushDps + foe.impact / 3) * dt;
      if (e.hp <= 0) { foe.kills += 1; run.credits += e.credits; continue; }
      if (e.cd <= 0) {
        e.cd = TRAINING.enemyEvery;
        wound(run, foe, strike(run, e, foe, { attacks: def.attacks, ap: def.ap, ranged: !!def.range }));
        const c = center(foe);
        run.fx.push({ x1: e.x, y1: e.y, x2: c.x, y2: c.y, t: def.range ? FX_TIME.shot : FX_TIME.melee, color: '#ff6b6b', melee: !def.range });
      }
    } else if (atBase) {
      if (e.cd <= 0) {
        e.cd = TRAINING.enemyEvery;
        run.baseHp = Math.max(0, run.baseHp - strikeBase(run, e));
        run.fx.push({ x1: e.x, y1: e.y, x2: BASE.x, y2: BASE.y, t: def.range ? FX_TIME.shot : FX_TIME.melee, color: '#ff6b6b', melee: !def.range });
      }
    } else {
      const k = Math.min(def.speed * dt, toBase) / toBase;
      e.x += (BASE.x - e.x) * k;
      e.y += (BASE.y - e.y) * k;
    }
  }
  run.enemies = run.enemies.filter((e) => e.hp > 0);

  if (run.baseHp <= 0) return end(run, `The base falls in wave ${run.wave}.`);
  if (!run.towers.some(placed)) return end(run, `The last unit falls in wave ${run.wave}.`);
  if (!run.queue.length && !run.enemies.length) clear(run);
}

function clear(run: TrainingRun) {
  run.cleared = run.wave;
  run.phase = 'setup';
  run.fx = [];
  const earners = run.wave % TRAINING.xpEvery ? [] : run.towers.filter((t) => placed(t) && t.xp < TRAINING.xpCap);
  earners.forEach((t) => (t.xp = Math.min(TRAINING.xpCap, t.xp + TRAINING.xpPerWave)));
  run.dir = Math.floor(rand(run) * 8);
  run.log.push(`Wave ${run.wave} cleared${earners.length ? `: +${TRAINING.xpPerWave} XP to ${earners.map((t) => t.name).join(', ')}` : ''}. The next comes from the ${DIRECTIONS[run.dir]}.`);
}

function end(run: TrainingRun, why: string) {
  run.phase = 'over';
  run.queue = [];
  run.log.push(`${why} Waves cleared: ${run.cleared}.`);
}

/** Give up the run where it stands (closing the game mid-wave). */
export function quitRun(run: TrainingRun) {
  if (run.phase !== 'over') end(run, 'Training called off.');
}

/** XP earned so far, by unit. */
export const runXp = (run: TrainingRun) => Object.fromEntries(run.towers.filter((t) => t.xp > 0).map((t) => [t.unitId, t.xp]));

/** Can this unit train? Any active unit can, even one busy on a task: training is only drill. */
export const canTrain = (u: Unit) => u.status === 'active';
