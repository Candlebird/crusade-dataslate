import type { Unit } from '../model/types';
import type { Category, RelicTier } from './data';
import { fighter, type Gun } from './autoBattle';
import { levelForXp } from './engine';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from './downtimeData';
import { unitName } from './battle';
import { abilitiesOf, describe, type AuraStat, type Effect, type Status } from './abilities';

// Training sim: a tower-defense run. The squad stands on a grid around a base and holds off endless waves. Units are
// towers made from their profile: their weapons shoot (or strike, in melee) whatever comes in reach, and their category
// gives them a role. Each wave favours a direction shown before it starts; Scouts and Ambushers come from the other
// side. Most enemies shoot on the move as well as fighting in melee. Enemies drop credits for upgrades. Only XP leaves
// the run: +1 every 3 waves cleared to each unit still standing, up to 3 a run.

/** What a level-up gives, all at once. */
export const LEVEL_UP = `+${TRAINING.toughMul} wounds per model (+1 Tough, added to its current wounds too), +1 damage a hit (+${TRAINING.meleeDmgPerLevel} in melee), ${Math.round(TRAINING.ratePerLevel * 100)}% faster attacks and +1 tile of reach for every shooting weapon and aura. Each unit levels on its own: its next level-up costs more, no one else's.`;
export const HEAL_DESC = `Mends ${Math.round(TRAINING.heal.share * 100)}% of its wounds. Wounds don't heal between waves otherwise.`;

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
  /** What its special rules, traits and relics do here, one effect each. */
  skills: TrainingSkill[];
  /** Wounds of shield left: they soak damage before its own. */
  shield: number;
  /** Seconds of frenzy left, and how many times as fast it attacks meanwhile. */
  frenzy: number;
  frenzyMul: number;
  /** What allies' auras give it right now (recomputed every step): to hit, to Defense, share faster, tiles of reach. */
  boost: Record<AuraStat, number>;
  /** It has already got back up once (revive). */
  revived: boolean;
  /** Level-ups bought for it this run: each adds wounds, damage, fire rate and range, and its next costs more. */
  up: number;
  dead: boolean;
  kills: number;
  /** This run's tally: damage it dealt, hits it shrugged off (saved or ignored), and damage it took. */
  dealt: number;
  saved: number;
  taken: number;
  /** XP earned this run. */
  xp: number;
}

/** One effect of one ability, with its own timer. */
export interface TrainingSkill {
  /** The rule, trait or relic it comes from. */
  source: string;
  effect: Effect;
  /** A weapon's rule: only that weapon's hits carry it. */
  gun?: string;
  /** Seconds until a timed effect (heal, shield, barrage, frenzy) can go again; for a field, until it next pulses. */
  cd: number;
  /** Redeploys left this wave. */
  uses: number;
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
  /** Seconds left of each status on it. */
  status: Partial<Record<Status, number>>;
  /** The unit that made it bleed: the bleeding's damage (and a kill) is theirs. */
  bleedBy?: string;
  /** A veteran (a big squad draws them): tougher, and +1 to hit and AP. */
  vet?: boolean;
}

interface Spawn {
  kind: TrainingEnemyKind;
  /** Seconds into the wave. */
  at: number;
  x: number;
  y: number;
  hp: number;
  credits: number;
  vet?: boolean;
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
  /** A miss that cover stopped: it ends on the cover, with a puff of dust. */
  blocked?: boolean;
  /** Hits a unit shrugged off (saved or ignored): drawn as a blue shield ring round it. */
  saved?: number;
  /** An ability: heal (a green line to who it heals), bolt (a barrage's shot) or pulse (a ring of `r` tiles round x1, y1). */
  kind?: 'heal' | 'bolt' | 'pulse';
  r?: number;
}

/** How long a shot, a blow and an ability's flash stay on screen (seconds). */
export const FX_TIME = { shot: 0.15, melee: 0.3, save: 0.45, heal: 0.5, bolt: 0.3, pulse: 0.5 };
export const FX_COLOR = { heal: '#6fdc6f', bolt: '#c08cff', shield: '#5ab0ff', blast: '#ff9a4a', field: '#b98cff' };

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
  towers: TrainingTower[];
  enemies: TrainingEnemy[];
  queue: Spawn[];
  /** Seconds into the current wave. */
  t: number;
  nextId: number;
  fx: TrainingFx[];
  log: string[];
  /** Tiles of cover (raised ground), laid out when the run starts (and by a card). */
  cover: { x: number; y: number }[];
  /** Cards on offer, to pick one before the next wave; and the cards picked so far, oldest first. */
  offer?: TrainingDraw[];
  cards: TrainingDraw[];
  /** Kills pay this many times their credits (a Bounty card raises it). */
  bounty: number;
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
    guns: f.guns.map((g) => ({ ...g, cd: 0, pending: 0, gap: 0, next: 0 })), skills: skillsOf(u), shield: 0, frenzy: 0, frenzyMul: 1,
    boost: { hit: 0, save: 0, rate: 0, range: 0 }, revived: false, up: 0, dead: false, kills: 0, dealt: 0, saved: 0, taken: 0, xp: 0,
  };
}

/** A unit's abilities as skills, one per effect. Scars are already in its numbers (see fighter()). */
const skillsOf = (u: Unit): TrainingSkill[] =>
  abilitiesOf(u).flatMap((a) => a.effects.filter((e) => e.kind !== 'penalty').map((effect) => ({
    source: a.source, effect, ...(a.gun ? { gun: a.gun } : {}), cd: 0, uses: effect.kind === 'redeploy' ? effect.uses : 0,
  })));

/** A tower's skills of one kind, with the effect narrowed. */
const skills = <K extends Effect['kind']>(t: TrainingTower, kind: K) =>
  t.skills.filter((s): s is TrainingSkill & { effect: Extract<Effect, { kind: K }> } => s.effect.kind === kind);

/** Wounds as hit points: the same scale a unit's Tough has here. */
const woundsHp = (n: number) => n * TRAINING.toughMul;

/** Redeploys it has left this wave. */
export const redeploys = (t: TrainingTower) => skills(t, 'redeploy').reduce((n, s) => n + s.uses, 0);

export function createRun(units: Unit[], seed: number): TrainingRun {
  const run: TrainingRun = {
    rng: seed | 0, phase: 'setup', wave: 0, cleared: 0, dir: 0, baseHp: TRAINING.baseHp, credits: 0,
    towers: units.slice(0, TRAINING.squadMax).map(towerOf), enemies: [], queue: [], t: 0, nextId: 1, fx: [], log: [], cover: [], cards: [], bounty: 1,
  };
  run.dir = Math.floor(rand(run) * 8);
  run.cover = layCover(run);
  return run;
}

/** Short ridges of cover, each running across or along the map, on the ground between the base and the edge. */
function layCover(run: TrainingRun, ridges: number = TRAINING.cover.ridges): { x: number; y: number }[] {
  const { length, near, far } = TRAINING.cover;
  const out: { x: number; y: number }[] = [];
  const ok = (x: number, y: number) =>
    x >= 1 && y >= 1 && x <= TRAINING.mapSize - 2 && y <= TRAINING.mapSize - 2 &&
    !(x === BASE.tile && y === BASE.tile) && !out.some((c) => c.x === x && c.y === y) && !isCover(run, x, y);
  for (let i = 0; i < ridges; i++) {
    const a = rand(run) * Math.PI * 2;
    const d = near + rand(run) * (far - near);
    const x0 = Math.floor(BASE.x + Math.cos(a) * d);
    const y0 = Math.floor(BASE.y + Math.sin(a) * d);
    const n = length[0] + Math.floor(rand(run) * (length[1] - length[0] + 1));
    const across = rand(run) < 0.5;
    for (let k = 0; k < n; k++) {
      const x = across ? x0 + k : x0;
      const y = across ? y0 : y0 + k;
      if (ok(x, y)) out.push({ x, y });
    }
  }
  return out;
}

export const isCover = (run: TrainingRun, x: number, y: number) => run.cover.some((c) => c.x === x && c.y === y);

/** The cover tiles a shot passes over on its way from (x1, y1) to (x2, y2), bar the one it's fired from. */
export function coverCrossed(run: TrainingRun, x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] {
  if (!run.cover.length) return [];
  const own = { x: Math.floor(x1), y: Math.floor(y1) };
  const steps = Math.max(1, Math.ceil(dist(x1, y1, x2, y2) / 0.1));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const x = Math.floor(x1 + ((x2 - x1) * i) / steps);
    const y = Math.floor(y1 + ((y2 - y1) * i) / steps);
    if ((x === own.x && y === own.y) || out.some((c) => c.x === x && c.y === y)) continue;
    if (isCover(run, x, y)) out.push({ x, y });
  }
  return out;
}

/** Where a shot that cover stopped is drawn: somewhere on one of the tiles it passed over, half the time.
 * Only for show, so it doesn't touch the run's dice. */
function blockedAt(crossed: { x: number; y: number }[]): { x: number; y: number } | undefined {
  if (!crossed.length || Math.random() >= 0.5) return undefined;
  const c = crossed[Math.floor(Math.random() * crossed.length)];
  return { x: c.x + 0.15 + Math.random() * 0.7, y: c.y + 0.15 + Math.random() * 0.7 };
}

export const placed = (t: TrainingTower) => t.x >= 0 && !t.dead;
export const DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];

/** Reach of a gun in tiles: level-ups lengthen shooting weapons, not melee ones. */
export const reach = (t: TrainingTower, g: Gun) => (g.melee ? TRAINING.meleeReach : g.range / TRAINING.inchesPerTile + t.up) + t.boost.range;
/** Damage a hit gains from level-ups: more for melee weapons, which get no reach. */
export const levelDmg = (t: TrainingTower, g: Gun) => t.up * (g.melee ? TRAINING.meleeDmgPerLevel : 1);
export const auraOf = (t: TrainingTower) => TRAINING.auraRadius + t.up;
const center = (t: TrainingTower) => ({ x: t.x + 0.5, y: t.y + 0.5 });
const alive = (t: TrainingTower) => Math.min(t.size, Math.ceil(t.hp / t.tough));
/** Infantry that has stood still through a whole wave is dug in. */
export const dugIn = (run: TrainingRun, t: TrainingTower) => t.category === 'Infantry' && t.placedAt < run.wave - (run.phase === 'wave' ? 1 : 0);

/** Why a unit can't go on (or move to) a tile, or null when it can. */
export function placeProblem(run: TrainingRun, unitId: string, x: number, y: number): string | null {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (!t || t.dead) return 'That unit is out of this run.';
  // Mid-wave only a unit that can redeploy moves, and it can go even where a Fortification's lock would stop it.
  const mid = run.phase === 'wave' && skills(t, 'redeploy').length > 0;
  if (run.phase !== 'setup' && !mid) return 'Units can only be placed or moved between waves.';
  if (mid && !redeploys(t)) return 'No redeploys left this wave.';
  if (x < 1 || y < 1 || x > TRAINING.mapSize - 2 || y > TRAINING.mapSize - 2) return 'The outer ring is where the enemy comes in.';
  if (x === BASE.tile && y === BASE.tile) return 'That is the base.';
  if (run.towers.some((o) => o !== t && placed(o) && o.x === x && o.y === y)) return 'Another unit stands there.';
  if (!mid && fixed(run, t)) return 'Fortifications can’t move once a wave has started.';
  return null;
}

/** A Fortification that has been through a wave stays where it is. */
export const fixed = (run: TrainingRun, t: TrainingTower) => t.category === 'Fortification' && placed(t) && t.placedAt < run.wave;

export function placeTower(run: TrainingRun, unitId: string, x: number, y: number) {
  const p = placeProblem(run, unitId, x, y);
  if (p) throw new Error(p);
  const t = run.towers.find((u) => u.unitId === unitId)!;
  if (t.x === x && t.y === y) return;
  if (run.phase === 'wave') skills(t, 'redeploy').find((s) => s.uses > 0)!.uses -= 1;
  t.placedAt = run.wave;
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

/** Credits for a unit's next level-up, at level n (each unit levels on its own). */
export const upgradeCost = (n: number) => Math.round(TRAINING.upgradeBase * TRAINING.upgradeGrowth ** n);
const levelOf = (run: TrainingRun, unitId: string) => run.towers.find((u) => u.unitId === unitId)?.up ?? 0;
/** Credits for a heal: a share of that unit's next level-up's cost. */
export const healCost = (run: TrainingRun, unitId: string) => Math.max(1, Math.round(upgradeCost(levelOf(run, unitId)) * TRAINING.heal.cost));

function buyProblem(run: TrainingRun, unitId: string, cost: number): string | null {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (run.phase === 'over') return 'The run is over.';
  if (!t || t.dead) return 'That unit is out of this run.';
  if (Math.floor(run.credits) < cost) return `Needs ${cost} credits.`;
  return null;
}

export const upgradeProblem = (run: TrainingRun, unitId: string) => buyProblem(run, unitId, upgradeCost(levelOf(run, unitId)));

export function healProblem(run: TrainingRun, unitId: string): string | null {
  const t = run.towers.find((u) => u.unitId === unitId);
  if (t && !t.dead && t.hp >= t.maxHp) return 'It has all its wounds.';
  return buyProblem(run, unitId, healCost(run, unitId));
}

/** Level a unit up: more wounds, damage, fire rate and range at once. */
export function buyUpgrade(run: TrainingRun, unitId: string) {
  const p = upgradeProblem(run, unitId);
  if (p) throw new Error(p);
  const t = run.towers.find((u) => u.unitId === unitId)!;
  run.credits -= upgradeCost(t.up);
  levelUp(t);
}

/** A level-up, paid for or not. */
function levelUp(t: TrainingTower) {
  t.up += 1;
  t.tough += TRAINING.toughMul;
  t.maxHp += t.size * TRAINING.toughMul;
  t.hp += t.size * TRAINING.toughMul;
}

/** Pay to mend a share of a unit's wounds. */
export function buyHeal(run: TrainingRun, unitId: string) {
  const p = healProblem(run, unitId);
  if (p) throw new Error(p);
  const t = run.towers.find((u) => u.unitId === unitId)!;
  run.credits -= healCost(run, unitId);
  t.hp = Math.min(t.maxHp, t.hp + t.maxHp * TRAINING.heal.share);
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

/**
 * Credits a wave drops if every enemy dies: about `upgradesPerWave` level-ups' worth at this point in a run, priced at
 * the level a squad of `units` would have on average if it spread them evenly.
 */
export function waveCredits(wave: number, units: number): number {
  const n = (TRAINING.upgradesPerWave * (wave - 1)) / Math.max(1, units);
  return TRAINING.upgradesPerWave * TRAINING.upgradeBase * TRAINING.upgradeGrowth ** n;
}

/** How many times over a big squad's power is (see TRAINING.bigSquad): 0 for one that isn't big. */
export const bigBy = (power: number) => Math.max(0, power / TRAINING.bigSquad - 1);

/** The share of a wave's enemies that come as veterans: a few in any squad, more in a big one. */
export const vetShare = (power: number) => Math.min(TRAINING.vetMax, TRAINING.vetBase + bigBy(power) * TRAINING.vetPer);

/** Plan a wave: what comes, from where, and when. */
export function planWave(run: TrainingRun, power: number, wave: number): Spawn[] {
  let budget = waveBudget(power, wave);
  // A big squad lifts the cap on numbers, so more of its budget comes as more enemies rather than tougher ones.
  const cap = TRAINING.maxBudget * Math.min(TRAINING.bigCountMax, 1 + bigBy(power));
  // The upgrades go further in a smaller squad, so its enemies toughen faster.
  const perUnit = TRAINING.squadMax / Math.max(1, run.towers.length);
  const hpMul = Math.max(1, budget / cap) * TRAINING.hpGrowth ** ((wave - 1) * perUnit);
  const bossMul = clamp(power / TRAINING.bossPower, 0.4, 2);
  const vets = vetShare(power);
  budget = Math.min(budget, cap) * TRAINING.enemyCount;
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
  const pool$ = waveCredits(wave, run.towers.length);
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
    const vet = def.spawn !== 'boss' && rand(run) < vets;
    const hp = def.hp * TRAINING.enemyHp * hpMul * (def.spawn === 'boss' ? bossMul : 1) * (vet ? TRAINING.vet.hp : 1);
    return { kind, at, x: p.x, y: p.y, hp, credits: (pool$ * def.cost) / totalCost, ...(vet ? { vet } : {}) };
  }).sort((a, b) => a.at - b.at);
}

/** The next wave as startWave will plan it, without touching the run (it rolls on a copy of the random state). */
export const previewWave = (run: TrainingRun, power: number) => planWave({ ...run }, power, run.wave + 1);

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
  if (run.offer) return 'Pick a card first.';
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
  // Abilities start each wave ready: redeploys refilled, timers at zero, no shield or frenzy left over.
  for (const t of run.towers) {
    t.skills.forEach((s) => { s.cd = 0; if (s.effect.kind === 'redeploy') s.uses = s.effect.uses; });
    t.shield = 0;
    t.frenzy = 0;
  }
  const flank = run.queue.filter((s) => TRAINING_ENEMIES[s.kind].spawn === 'scout' || TRAINING_ENEMIES[s.kind].spawn === 'ambush').length;
  const vets = run.queue.filter((s) => s.vet).length;
  run.log.push(`Wave ${run.wave}: ${run.queue.length} enemies from the ${DIRECTIONS[run.dir]}${flank ? `, ${flank} on the far side` : ''}${vets ? `, ${vets} of them veterans` : ''}.`);
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

/** How damage came: a shot, a blow, or neither (bleeding, a blast as it dies, an execute). */
type Harm = 'shot' | 'melee' | 'other';

/**
 * Damage from a unit to an enemy. A hit (not bleeding or crushing) on a marked enemy deals more; some enemies take less
 * from shots or more from blows. A kill pays out and feeds a leecher.
 */
function hurt(run: TrainingRun, t: TrainingTower, e: TrainingEnemy, dmg: number, how: Harm, hit = true) {
  if (e.hp <= 0) return;
  const def = TRAINING_ENEMIES[e.kind];
  const mul = how === 'shot' ? def.shotMul ?? 1 : how === 'melee' ? def.meleeMul ?? 1 : 1;
  const before = e.hp;
  e.hp -= (dmg + (hit && e.status.mark ? TRAINING.markDmg : 0)) * mul;
  t.dealt += before - Math.max(0, e.hp);
  if (e.hp <= 0) {
    t.kills += 1;
    run.credits += e.credits * run.bounty;
    for (const s of skills(t, 'leech')) mend(run, t, t, woundsHp(s.effect.n));
  }
}

/** Heal `n` on a unit, with a green line from the healer. */
function mend(run: TrainingRun, from: TrainingTower, to: TrainingTower, n: number) {
  if (to.dead || to.hp >= to.maxHp) return;
  to.hp = Math.min(to.maxHp, to.hp + n);
  const a = center(from);
  const b = center(to);
  run.fx.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, t: FX_TIME.heal, color: FX_COLOR.heal, kind: 'heal' });
}

/** A ring of `r` tiles swelling out from a point. */
const pulse = (run: TrainingRun, x: number, y: number, r: number, color: string) =>
  run.fx.push({ x1: x, y1: y, x2: x, y2: y, t: FX_TIME.pulse, color, kind: 'pulse', r });

/** Leave a status on an enemy. A knock and an execute act at once; a bleed is credited to `t`. */
function afflict(run: TrainingRun, t: TrainingTower, e: TrainingEnemy, status: Status) {
  if (e.hp <= 0) return;
  if (status === 'knock') {
    const d = dist(e.x, e.y, BASE.x, BASE.y) || 1;
    e.x = clamp(e.x + ((e.x - BASE.x) / d) * TRAINING.knock, 0.3, TRAINING.mapSize - 0.3);
    e.y = clamp(e.y + ((e.y - BASE.y) / d) * TRAINING.knock, 0.3, TRAINING.mapSize - 0.3);
  } else if (status === 'execute') {
    if (TRAINING_ENEMIES[e.kind].spawn !== 'boss' && e.hp < e.maxHp * TRAINING.executeAt) hurt(run, t, e, e.hp, 'other', false);
  } else {
    e.status[status] = Math.max(e.status[status] ?? 0, TRAINING.status[status]);
    if (status === 'bleed') e.bleedBy = t.unitId;
  }
}

/** Skills of one kind from a list, with the effect narrowed. */
const ofKind = <K extends Effect['kind']>(xs: TrainingSkill[], kind: K) =>
  xs.filter((s): s is TrainingSkill & { effect: Extract<Effect, { kind: K }> } => s.effect.kind === kind);

/** Does this gun's attack carry the skill? A weapon's rule only on that weapon; melee- or shooting-only ones only there. */
function carried(s: TrainingSkill, g: Gun): boolean {
  if (s.gun && s.gun !== g.name) return false;
  const only = 'only' in s.effect ? s.effect.only : undefined;
  return !only || (only === 'melee') === g.melee;
}

/** One shot (or blow) from one gun, at the enemy it's aimed at: false if there's none in reach. `extra`: an attack a 6 gave. */
function fire(run: TrainingRun, t: TrainingTower, g: TrainingGun, aura: number, extra = false): boolean {
  const target = targetFor(run, t, g);
  if (!target) return false;
  const c = center(t);
  // A shot over cover is at -2 to hit (Reliable or not); a blow in melee isn't.
  const crossed = g.melee ? [] : coverCrossed(run, c.x, c.y, target.x, target.y);
  const cover = crossed.length ? TRAINING.cover.hit : 0;
  const p = g.reliable ? hitChance(2, cover) : hitChance(t.quality, g.hitMod + (g.melee ? t.hitMelee : t.hitShoot) + aura + t.boost.hit + cover);
  const r = rand(run);
  // Each shot comes from somewhere across the unit's tile, as if from one of its models; a miss lands off to one side
  // of the target, or now and then on the cover that stopped it. Where is only for show, so it doesn't touch the run's dice.
  const a = Math.random() * Math.PI * 2;
  const off = r >= p ? 0.45 + Math.random() * 0.35 : Math.random() * 0.12;
  const from = t.size > 1 ? 0.35 : 0;
  const blocked = r >= p ? blockedAt(crossed) : undefined;
  run.fx.push({
    x1: c.x + (Math.random() - 0.5) * 2 * from, y1: c.y + (Math.random() - 0.5) * 2 * from,
    x2: blocked?.x ?? target.x + Math.cos(a) * off, y2: blocked?.y ?? target.y + Math.sin(a) * off,
    t: g.melee ? FX_TIME.melee : FX_TIME.shot, color: g.melee ? '#ffd27a' : '#9fd3ff', melee: g.melee, miss: r >= p, blocked: !!blocked,
  });
  if (r >= p) return true;
  const six = r < 1 / 6;
  const live = t.skills.length ? t.skills.filter((s) => carried(s, g)) : [];
  const sixes = six ? ofKind(live, 'sixes').map((s) => s.effect) : [];
  // Deadly(X) sets the damage of a hit; AP and upgrades add to it, armour takes off (Rending 6s ignore it).
  const armour = six && (g.rending || sixes.some((e) => e.rend)) ? 0 : TRAINING_ENEMIES[target.kind].armor;
  const raw = Math.max(1, g.deadly) + g.ap + levelDmg(t, g) - armour + (six && t.category === 'Elite' ? 1 : 0) + sixes.reduce((n, e) => n + (e.dmg ?? 0), 0);
  const dmg = Math.max(0.5, raw) * t.atkBonus;
  const how = g.melee ? 'melee' : 'shot';
  hurt(run, t, target, dmg, how);
  // Blast: the hit spills onto others close by.
  if (g.blast > 1) {
    run.enemies
      .filter((o) => o !== target && o.hp > 0 && dist(o.x, o.y, target.x, target.y) <= TRAINING.blastRadius)
      .slice(0, g.blast - 1)
      .forEach((o) => hurt(run, t, o, Math.max(0.5, raw - TRAINING_ENEMIES[o.kind].armor + armour) * t.atkBonus, how));
  }
  for (const s of ofKind(live, 'onHit')) if (rand(run) < s.effect.chance) afflict(run, t, target, s.effect.status);
  if (!extra && sixes.some((e) => e.again)) fire(run, t, g, aura, true);
  return true;
}

/** An enemy's attacks on a unit: wounds they deal. */
function strike(run: TrainingRun, e: TrainingEnemy, t: TrainingTower, w: { attacks: number; ap: number; ranged: boolean; cover?: boolean }): number {
  const def = TRAINING_ENEMIES[e.kind];
  const ap = Math.max(0, w.ap + vetBy(e, 'ap') - (t.fortified ? 1 : 0));
  const save = saveChance(t.defense, ap, t.defMod + (dugIn(run, t) ? 1 : 0) + t.boost.save);
  let wounds = 0;
  let saved = 0;
  for (let i = 0; i < w.attacks; i++) {
    if (rand(run) >= hitChance(def.quality, vetBy(e, 'hit') - t.evasive * (w.ranged ? 1 : 0.5) - dazed(e) + (w.cover ? TRAINING.cover.hit : 0))) continue;
    if (rand(run) < save || rand(run) < t.ignore) saved += 1;
    else wounds += 1;
  }
  t.saved += saved;
  if (saved) {
    const c = center(t);
    run.fx.push({ x1: c.x, y1: c.y, x2: c.x, y2: c.y, t: FX_TIME.save, color: '#5ab0ff', saved });
  }
  // Thorns: struck in melee, it may deal some back.
  if (!w.ranged) {
    for (const s of skills(t, 'thorns')) {
      if (rand(run) >= s.effect.chance) continue;
      hurt(run, t, e, s.effect.n, 'melee');
      const c = center(t);
      run.fx.push({ x1: c.x, y1: c.y, x2: e.x, y2: e.y, t: FX_TIME.melee, color: '#ffd27a', melee: true });
    }
  }
  return wounds;
}

/** What being a veteran adds to an enemy's attacks. */
const vetBy = (e: TrainingEnemy, k: 'hit' | 'ap') => (e.vet ? TRAINING.vet[k] : 0);

/** A dazed enemy's -1 to hit. */
const dazed = (e: TrainingEnemy) => (e.status.daze ? 1 : 0);

/** An enemy's attacks on the base: each hit is a point of damage. */
function strikeBase(run: TrainingRun, e: TrainingEnemy): number {
  const def = TRAINING_ENEMIES[e.kind];
  let n = 0;
  for (let i = 0; i < def.attacks; i++) if (rand(run) < hitChance(def.quality, vetBy(e, 'hit') - dazed(e))) n += 1;
  return n;
}

/** The unit an enemy is fighting, if any: the nearest it has come up against. */
function engaged(run: TrainingRun, e: TrainingEnemy): TrainingTower | undefined {
  let best: TrainingTower | undefined;
  let d = Infinity;
  for (const t of run.towers) {
    if (!placed(t) || t.category === 'Aircraft') continue;
    const c = center(t);
    const dd = dist(c.x, c.y, e.x, e.y);
    if (dd <= TRAINING.engage && dd < d) { d = dd; best = t; }
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

/** Wounds on a unit: its shield soaks them first. Falling, it may get back up once, or go out with a blast. */
function wound(run: TrainingRun, t: TrainingTower, n: number) {
  if (t.dead || !n) return;
  const soak = Math.min(t.shield, n);
  t.shield -= soak;
  t.taken += Math.min(t.hp, n - soak);
  t.hp -= n - soak;
  if (t.hp > 0) return;
  const back = skills(t, 'revive')[0];
  if (back && !t.revived) {
    t.revived = true;
    t.hp = Math.max(1, t.maxHp * back.effect.n);
    pulse(run, center(t).x, center(t).y, 1, FX_COLOR.heal);
    run.log.push(`${t.name} falls in wave ${run.wave}, but gets back up (${back.source}).`);
    return;
  }
  t.dead = true;
  t.hp = 0;
  t.shield = 0;
  run.log.push(`${t.name} falls in wave ${run.wave}. It is out of this run.`);
  const c = center(t);
  for (const s of skills(t, 'deathBlast')) {
    run.enemies.filter((e) => e.hp > 0 && dist(c.x, c.y, e.x, e.y) <= s.effect.radius).forEach((e) => hurt(run, t, e, s.effect.dmg, 'other', false));
    pulse(run, c.x, c.y, s.effect.radius, FX_COLOR.blast);
  }
}

/** Ability boosts from allies' auras (its own included), worked out fresh each step. */
function boosts(towers: TrainingTower[]) {
  for (const t of towers) t.boost = { hit: 0, save: 0, rate: 0, range: 0 };
  for (const src of towers) {
    for (const s of skills(src, 'aura')) {
      for (const t of towers) if (dist(src.x, src.y, t.x, t.y) <= s.effect.radius + src.up) t.boost[s.effect.stat] += s.effect.n;
    }
  }
}

/** Is any of its guns aimed at something right now? */
const busy = (run: TrainingRun, t: TrainingTower) => t.guns.some((g) => targetFor(run, t, g));

/** Timed abilities: heals, shields, barrages and frenzies, each on its own clock. Fields work all the time. */
function abilities(run: TrainingRun, t: TrainingTower, towers: TrainingTower[], aura: number, dt: number) {
  const c = center(t);
  t.frenzy = Math.max(0, t.frenzy - dt);
  for (const s of t.skills) {
    const e = s.effect;
    s.cd -= dt;
    if (s.cd > 0) continue;
    if (e.kind === 'field') {
      s.cd = TRAINING.abilityRound / 4;
      const r = e.radius + t.up;
      for (const o of run.enemies) if (o.hp > 0 && dist(c.x, c.y, o.x, o.y) <= r) o.status[e.status] = Math.max(o.status[e.status] ?? 0, TRAINING.fieldLinger + s.cd);
      pulse(run, c.x, c.y, r, FX_COLOR.field);
      continue;
    }
    if (!('every' in e)) continue;
    const every = e.every * TRAINING.abilityRound;
    if (e.kind === 'heal') {
      const hurtOf = (o: TrainingTower) => 1 - o.hp / o.maxHp;
      const pool = e.ally ? towers.filter((o) => dist(o.x, o.y, t.x, t.y) <= e.ally! + t.up) : [t];
      const who = pool.filter((o) => o.hp < o.maxHp).sort((a, b) => hurtOf(b) - hurtOf(a))[0];
      if (!who) { s.cd = 0; continue; }
      mend(run, t, who, woundsHp(e.n));
      s.cd = every;
    } else if (e.kind === 'shield') {
      t.shield = Math.max(t.shield, woundsHp(e.n));
      pulse(run, c.x, c.y, 0.8, FX_COLOR.shield);
      s.cd = every;
    } else if (e.kind === 'barrage') {
      const r = e.range ?? Math.max(0, ...t.guns.map((g) => reach(t, g)));
      const inRange = run.enemies.filter((o) => o.hp > 0 && dist(c.x, c.y, o.x, o.y) <= r);
      const target = inRange.sort((a, b) => dist(a.x, a.y, BASE.x, BASE.y) - dist(b.x, b.y, BASE.x, BASE.y))[0];
      if (!target) { s.cd = 0; continue; }
      const crossed = coverCrossed(run, c.x, c.y, target.x, target.y);
      const p = hitChance(t.quality, aura + t.boost.hit + (crossed.length ? TRAINING.cover.hit : 0));
      let landed = 0;
      for (let i = 0; i < e.hits; i++) {
        if (rand(run) >= p) continue;
        landed += 1;
        const hit = (o: TrainingEnemy) => hurt(run, t, o, Math.max(0.5, 1 + e.ap + t.up - TRAINING_ENEMIES[o.kind].armor) * t.atkBonus, 'shot');
        hit(target);
        if (e.radius) run.enemies.filter((o) => o !== target && o.hp > 0 && dist(o.x, o.y, target.x, target.y) <= e.radius!).forEach(hit);
      }
      const blocked = landed ? undefined : blockedAt(crossed);
      const to = blocked ?? target;
      run.fx.push({ x1: c.x, y1: c.y, x2: to.x, y2: to.y, t: FX_TIME.bolt, color: FX_COLOR.bolt, kind: 'bolt', miss: !!blocked, blocked: !!blocked });
      if (e.radius) pulse(run, to.x, to.y, e.radius, FX_COLOR.bolt);
      s.cd = every;
    } else if (e.kind === 'frenzy') {
      if (!busy(run, t)) { s.cd = 0; continue; }
      t.frenzy = e.time * TRAINING.abilityRound;
      t.frenzyMul = e.mul;
      s.cd = every;
    }
  }
}

/** How fast a unit attacks: upgrades, a frenzy, a last stand at half strength and allies' rate auras. */
function speedOf(t: TrainingTower): number {
  const last = t.hp <= t.maxHp / 2 ? skills(t, 'lastStand').reduce((m, s) => m * s.effect.mul, 1) : 1;
  return (1 + TRAINING.ratePerLevel * t.up) * (t.frenzy > 0 ? t.frenzyMul : 1) * last * (1 + t.boost.rate);
}

/** Wear statuses down; a bleed hurts as it goes, credited to whoever caused it. */
function tick(run: TrainingRun, e: TrainingEnemy, dt: number) {
  if (e.status.bleed) {
    const by = run.towers.find((t) => t.unitId === e.bleedBy);
    if (by) hurt(run, by, e, TRAINING.bleedDps * Math.min(dt, e.status.bleed), 'other', false);
  }
  for (const k of Object.keys(e.status) as Status[]) {
    const left = e.status[k]! - dt;
    if (left > 0) e.status[k] = left;
    else delete e.status[k];
  }
}

/** Advance the run by `dt` seconds. */
export function step(run: TrainingRun, dt: number) {
  run.fx = run.fx.filter((f) => (f.t -= dt) > 0);
  if (run.phase !== 'wave') return;
  run.t += dt;

  while (run.queue.length && run.queue[0].at <= run.t) {
    const s = run.queue.shift()!;
    run.enemies.push({ id: run.nextId++, kind: s.kind, x: s.x, y: s.y, hp: s.hp, maxHp: s.hp, cd: TRAINING.enemyEvery * 0.5, gcd: TRAINING.enemyShootEvery * rand(run), credits: s.credits, status: {}, ...(s.vet ? { vet: true } : {}) });
  }

  const towers = run.towers.filter(placed);
  const heroes = towers.filter((t) => t.category === 'Hero');
  boosts(towers);
  for (const t of towers) {
    const aura = heroes.some((h) => dist(h.x, h.y, t.x, t.y) <= auraOf(h)) ? 1 : 0;
    if (t.skills.length) abilities(run, t, towers, aura, dt);
    const speed = speedOf(t);
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
    tick(run, e, dt);
    // Stunned: it does nothing at all, its clocks included.
    if (e.hp <= 0 || e.status.stun) continue;
    const def = TRAINING_ENEMIES[e.kind];
    const foe = engaged(run, e);
    const toBase = dist(e.x, e.y, BASE.x, BASE.y);
    const atBase = toBase <= BASE.radius + def.size + 0.15;
    e.cd -= dt;
    e.gcd -= dt;
    // A gun fires on the move, at whatever unit is nearest, even one it is fighting.
    if (def.gun && e.gcd <= 0) {
      const t = nearestUnit(run, e.x, e.y, def.gun.range);
      if (t) {
        e.gcd = TRAINING.enemyShootEvery;
        const c = center(t);
        const crossed = coverCrossed(run, e.x, e.y, c.x, c.y);
        const n = strike(run, e, t, { ...def.gun, ranged: true, cover: crossed.length > 0 });
        wound(run, t, n);
        const blocked = n ? undefined : blockedAt(crossed);
        run.fx.push({ x1: e.x, y1: e.y, x2: blocked?.x ?? c.x, y2: blocked?.y ?? c.y, t: FX_TIME.shot, color: '#ff6b6b', miss: !!blocked, blocked: !!blocked });
      }
    }
    if (foe?.dead || e.hp <= 0) continue;
    if (foe) {
      if (foe.category === 'Vehicle/Monster') hurt(run, foe, e, (TRAINING.crushDps + foe.impact / 3) * dt, 'melee', false);
      if (e.hp <= 0) continue;
      if (e.cd <= 0) {
        e.cd = TRAINING.enemyEvery;
        wound(run, foe, strike(run, e, foe, { attacks: def.attacks, ap: def.ap, ranged: false }));
        const c = center(foe);
        run.fx.push({ x1: e.x, y1: e.y, x2: c.x, y2: c.y, t: FX_TIME.melee, color: '#ff6b6b', melee: true });
      }
    } else if (atBase) {
      if (e.cd <= 0) {
        e.cd = TRAINING.enemyEvery;
        run.baseHp = Math.max(0, run.baseHp - strikeBase(run, e));
        run.fx.push({ x1: e.x, y1: e.y, x2: BASE.x, y2: BASE.y, t: FX_TIME.melee, color: '#ff6b6b', melee: true });
      }
    } else {
      const k = Math.min(def.speed * (e.status.slow ? TRAINING.slowMul : 1) * dt, toBase) / toBase;
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
  if (run.wave % TRAINING.cards.every === 0) run.offer = drawCards(run);
  run.log.push(`Wave ${run.wave} cleared${earners.length ? `: +${TRAINING.xpPerWave} XP to ${earners.map((t) => t.name).join(', ')}` : ''}. The next comes from the ${DIRECTIONS[run.dir]}.`);
}

/** A boon card, offered between waves. `{unit}` in its text is the unit it falls to; a card with a `unit` test needs one. */
export interface TrainingCard {
  id: string;
  name: string;
  rarity: RelicTier;
  text: string;
  /** Only units this allows can draw it (it goes to one at random); without it, the card is for the whole squad. */
  unit?: (t: TrainingTower) => boolean;
  apply: (run: TrainingRun, t?: TrainingTower) => void;
}

/** A card as drawn: which card, and the unit it would go to. */
export interface TrainingDraw {
  id: string;
  unitId?: string;
  rarity: RelicTier;
}

const standing = (t: TrainingTower) => !t.dead;
const shooter = (t: TrainingTower) => !t.dead && t.guns.some((g) => !g.melee);
/** A card that teaches one unit an ability; its text is the ability's. */
const skillCard = (id: string, name: string, rarity: RelicTier, effect: Effect, unit: (t: TrainingTower) => boolean = standing): TrainingCard => ({
  id, name, rarity, text: `{unit}: ${describe(effect)}.`, unit,
  apply: (_, t) => { t!.skills.push({ source: name, effect, cd: 0, uses: 0 }); },
});

export const CARDS: TrainingCard[] = [
  { id: 'aim', name: 'Target practice', rarity: 'Common', text: '{unit}: +1 to hit when shooting.', unit: shooter, apply: (_, t) => { t!.hitShoot += 1; } },
  { id: 'whet', name: 'Whetstones', rarity: 'Common', text: '{unit}: hits 20% harder.', unit: standing, apply: (_, t) => { t!.atkBonus *= 1.2; } },
  { id: 'plates', name: 'Armour plates', rarity: 'Common', text: '{unit}: +1 to Defense.', unit: standing, apply: (_, t) => { t!.defMod += 1; } },
  {
    id: 'rations', name: 'Field rations', rarity: 'Common', text: `Every unit still standing mends ${Math.round(TRAINING.cards.rations * 100)}% of its wounds.`,
    apply: (run) => run.towers.filter(standing).forEach((t) => (t.hp = Math.min(t.maxHp, t.hp + t.maxHp * TRAINING.cards.rations))),
  },
  { id: 'sandbags', name: 'Sandbags', rarity: 'Common', text: `${TRAINING.cards.ridges} more ridges of cover.`, apply: (run) => { run.cover.push(...layCover(run, TRAINING.cards.ridges)); } },
  { id: 'walls', name: 'Patch the walls', rarity: 'Common', text: `+${TRAINING.cards.walls} to the base.`, apply: (run) => { run.baseHp += TRAINING.cards.walls; } },
  {
    id: 'supply', name: 'Supply drop', rarity: 'Common', text: 'Credits for the cheapest level-up in the squad.',
    apply: (run) => { run.credits += Math.min(...run.towers.filter(standing).map((t) => upgradeCost(t.up))); },
  },
  skillCard('spotter', 'Spotter', 'Rare', { kind: 'onHit', status: 'mark', chance: 0.4, only: 'shoot' }, shooter),
  skillCard('medic', 'Field medic', 'Rare', { kind: 'heal', n: 1, every: 1, ally: 2 }),
  skillCard('drill', 'Shield drill', 'Rare', { kind: 'shield', n: 2, every: 2 }),
  skillCard('thirst', 'Bloodthirst', 'Rare', { kind: 'leech', n: 1 }),
  skillCard('rapid', 'Rapid fire', 'Rare', { kind: 'sixes', again: true }),
  { id: 'promote', name: 'Field promotion', rarity: 'Rare', text: '{unit}: a free level-up.', unit: standing, apply: (_, t) => levelUp(t!) },
  { id: 'bounty', name: 'Bounty', rarity: 'Rare', text: `Kills pay ${Math.round(TRAINING.cards.bounty * 100)}% more credits.`, apply: (run) => { run.bounty += TRAINING.cards.bounty; } },
  { id: 'ramparts', name: 'Ramparts', rarity: 'Rare', text: `+${TRAINING.cards.ramparts} to the base.`, apply: (run) => { run.baseHp += TRAINING.cards.ramparts; } },
  skillCard('trance', 'Battle trance', 'Legendary', { kind: 'frenzy', mul: 2, every: 2, time: 1 }),
  skillCard('uplink', 'Orbital uplink', 'Legendary', { kind: 'barrage', hits: 4, ap: 1, every: 2, radius: 1.5 }),
  skillCard('banner', 'Banner of glory', 'Legendary', { kind: 'aura', stat: 'hit', n: 1, radius: 2 }),
  { id: 'heroes', name: 'Heroes of the hour', rarity: 'Legendary', text: 'Every unit still standing levels up for free.', apply: (run) => run.towers.filter(standing).forEach(levelUp) },
  {
    id: 'wind', name: 'Second wind', rarity: 'Legendary', text: 'Every unit still standing can get back up once more, with half its wounds.',
    apply: (run) => run.towers.filter(standing).forEach((t) => {
      t.revived = false;
      t.skills.unshift({ source: 'Second wind', effect: { kind: 'revive', n: 0.5 }, cd: 0, uses: 0 });
    }),
  },
  {
    id: 'reinforce', name: 'Reinforcements', rarity: 'Legendary', text: '{unit} is back in the run, with half its wounds. Place it.',
    unit: (t) => t.dead,
    apply: (_, t) => { Object.assign(t!, { dead: false, hp: t!.maxHp / 2, shield: 0, x: -1, y: -1 }); },
  },
];

const card = (id: string) => CARDS.find((c) => c.id === id)!;
const RANK: Record<RelicTier, number> = { Common: 0, Rare: 1, Legendary: 2 };

/** Draw the cards to offer: each one's rarity by the odds, no card twice, each unit card to a unit it fits. */
function drawCards(run: TrainingRun): TrainingDraw[] {
  const { offer, odds } = TRAINING.cards;
  const out: TrainingDraw[] = [];
  const fits = (c: TrainingCard) => !out.some((d) => d.id === c.id) && (!c.unit || run.towers.some(c.unit));
  for (let i = 0; i < offer; i++) {
    const r = rand(run);
    const want: RelicTier = r < odds.Legendary ? 'Legendary' : r < odds.Legendary + odds.Rare ? 'Rare' : 'Common';
    // A rarity with nothing left that fits falls back a step.
    const tiers = (['Legendary', 'Rare', 'Common'] as RelicTier[]).filter((x) => RANK[x] <= RANK[want]);
    const pool = tiers.map((x) => CARDS.filter((c) => c.rarity === x && fits(c))).find((p) => p.length);
    if (!pool) break;
    const c = pick(run, pool);
    out.push({ id: c.id, rarity: c.rarity, ...(c.unit ? { unitId: pick(run, run.towers.filter(c.unit)).unitId } : {}) });
  }
  return out;
}

/** A drawn card's name and text, with its unit named. */
export function cardText(run: TrainingRun, d: TrainingDraw): { name: string; text: string } {
  const c = card(d.id);
  const t = run.towers.find((u) => u.unitId === d.unitId);
  return { name: c.name, text: c.text.replace('{unit}', t?.name ?? '') };
}

/** Take one of the cards on offer. */
export function pickCard(run: TrainingRun, i: number) {
  const d = run.offer?.[i];
  if (!d) throw new Error('No such card on offer.');
  card(d.id).apply(run, run.towers.find((u) => u.unitId === d.unitId));
  run.cards.push(d);
  run.offer = undefined;
  const { name, text } = cardText(run, d);
  run.log.push(`Card: ${name}. ${text}`);
}

/** The card auto mode takes: the rarest on offer, the first of those. */
export const autoCardIndex = (run: TrainingRun) =>
  (run.offer ?? []).reduce((best, d, i, xs) => (RANK[d.rarity] > RANK[xs[best].rarity] ? i : best), 0);

/** Put every unit that is off the map on a free tile toward where the next wave comes from. */
export function autoPlace(run: TrainingRun) {
  const a = (run.dir * 45 * Math.PI) / 180;
  const fx = Math.sin(a), fy = -Math.cos(a);
  const spots = [[2, 0], [2, 1], [2, -1], [1, 1], [1, -1], [2, 2], [2, -2], [3, 0], [-1, 0], [0, 2], [0, -2], [3, 1], [3, -1], [-2, 0], [-1, 1], [-1, -1]]
    .map(([out, side]) => [Math.round(BASE.tile + fx * out - fy * side * 1.2), Math.round(BASE.tile + fy * out + fx * side * 1.2)]);
  for (const t of run.towers) {
    if (t.dead || placed(t)) continue;
    const at = spots.find(([x, y]) => !placeProblem(run, t.unitId, x, y));
    if (at) placeTower(run, t.unitId, at[0], at[1]);
  }
}

/** Spend credits the way auto mode does: mend a badly hurt unit first, else level up whoever is lowest. */
export function autoSpend(run: TrainingRun) {
  for (;;) {
    const up = run.towers.filter(standing);
    const low = up.find((t) => t.hp < t.maxHp * 0.4 && !healProblem(run, t.unitId));
    if (low) { buyHeal(run, low.unitId); continue; }
    const next = [...up].sort((a, b) => a.up - b.up)[0];
    if (!next || upgradeProblem(run, next.unitId)) return;
    buyUpgrade(run, next.unitId);
  }
}

/** The run's standout: most kills, then most damage. */
export const mvp = (run: TrainingRun): TrainingTower | undefined =>
  [...run.towers].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt)[0];

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
