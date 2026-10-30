import type { Effect, Status } from '../abilities';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { centreOf, dist, inTerrain, mapOf, packMates, pieceById } from './board';
import { onEchoDeath } from './affixes';
import { offerCards } from './cards';
import { payKill } from './economy';
import { centre, remaining, upstream, WAYPOINTS } from './map';
import { rand, saveChance } from './rng';
import { lordDmg } from './lords';
import { tallyHarm } from './tally';
import type { ShardType } from '../downtimeData';
import type { Enemy, Grade, Tower, TowerGun, TowerSkill, TrainingRun, UnitTower } from './types';

// The pieces of combat every part of it shares: reach, damage, statuses, dots, and the fx a hit leaves.

/** How damage came: a shot, a blow, or neither (a dot, a blast as something dies, an execute). */
export type Harm = 'shot' | 'melee' | 'other';

/** Seconds each kind of fx stays on screen, and the colours of the ones that aren't shots. */
export const FX_TIME = { shot: 0.15, melee: 0.3, heal: 0.5, bolt: 0.3, pulse: 0.5 };
export const FX_COLOR = { shot: '#9fd3ff', melee: '#ffd27a', bleed: '#c0392b', bolt: '#c08cff', shield: '#5ab0ff', blast: '#ff9a4a', field: '#b98cff', hold: '#ffe08a', relic: '#ffc94a' };

export const isUnit = (t: Tower): t is UnitTower => t.kind === 'unit';
export const enemyDef = (e: Enemy) => TRAINING_ENEMIES[e.kind];
export const isBoss = (e: Enemy) => enemyDef(e).spawn === 'boss';

/** A listed range (inches) as cells on the map: TRAINING.rangeMul of it. */
export const rangeCells = (inches: number) => inches * TRAINING.rangeMul;

/** How far a gun reaches, in cells: its range by TRAINING.rangeMul, + levels (a default's upgrade) and range boosts; melee TRAINING.meleeReach. */
export function reach(t: Tower, g: TowerGun): number {
  if (g.melee) return TRAINING.meleeReach;
  const up = isUnit(t) ? t.up * TRAINING.levels.range : t.kind === 'default' && t.upgraded ? TRAINING.defaults.upgrade.reach : 0;
  return rangeCells(g.range) + up + t.boost.range;
}

/** The Shards a tower that isn't a unit is made of, by type and grade: a Shard itself, a default tower its slots. */
export const partsOf = (t: Tower): [ShardType, Grade][] =>
  t.kind === 'shard' ? [[t.type, t.grade]] : t.kind === 'default' ? t.slots : [];

/** Damage a hit gets from level-ups (0 for Shards). */
export const levelDmg = (t: Tower, g: TowerGun): number =>
  isUnit(t) ? t.up * (g.melee ? TRAINING.levels.meleeDmg : TRAINING.levels.dmg) : 0;

/** A unit's skills of one kind, with the effect narrowed (none for a Shard). */
export const skillsOf = <K extends Effect['kind']>(t: Tower, kind: K) =>
  (isUnit(t) ? t.skills : []).filter((s): s is TowerSkill & { effect: Extract<Effect, { kind: K }> } => s.effect.kind === kind);

/** How far an enemy still has to go to the base. */
export const toGo = (run: TrainingRun, e: Enemy) => remaining(mapOf(run), e.leg, e.x, e.y);

/** Live enemies within `r` cells of a point. */
export const enemiesNear = (run: TrainingRun, x: number, y: number, r: number) =>
  run.enemies.filter((e) => e.hp > 0 && dist(x, y, e.x, e.y) <= r);

/** Can gun `g` aim at enemy `e` at all (a Firepower gun only at flyers, a Blast one only at walkers)? */
export const canAim = (g: TowerGun, e: Enemy): boolean => !g.only || (g.only === 'air') === e.flies;

/** The enemy a gun aims at: the one in reach furthest along the route (least still to go), or the toughest for a Sniper. */
export function targetFor(run: TrainingRun, t: Tower, g: TowerGun): Enemy | undefined {
  // Hot (every gun, every step, with waves of a hundred): no arrays, squared distances, the maze looked up once.
  const c = centreOf(t);
  const r = reach(t, g);
  const r2 = r * r;
  const sniper = g.name.includes('Sniper');
  let m: ReturnType<typeof mapOf> | undefined;
  let best: Enemy | undefined;
  let score = Infinity;
  for (const e of run.enemies) {
    if (e.hp <= 0 || (g.only && (g.only === 'air') !== e.flies)) continue;
    const dx = e.x - c.x;
    const dy = e.y - c.y;
    if (dx * dx + dy * dy > r2) continue;
    const s = sniper ? -e.hp : remaining((m ??= mapOf(run)), e.leg, e.x, e.y);
    if (s < score) { score = s; best = e; }
  }
  return best;
}

/** Is any of a tower's guns aimed at something right now? */
export const busy = (run: TrainingRun, t: Tower) => t.guns.some((g) => targetFor(run, t, g));

/** A unit's region quirk on a shot at an enemy in dangerous terrain (habits.ts): + if native, − if haunted. */
export const terrainHit = (run: TrainingRun, t: Tower, g: TowerGun, e: Enemy): number =>
  !g.melee && isUnit(t) && t.terrainHit && inTerrain(run, e.x, e.y) ? t.terrainHit : 0;

/** Did a hit get through the enemy's save (Defense + AP; a Hardened nemesis and an Armoured Echo save better, a
 *  sundered one worse)? */
export const unsaved = (run: TrainingRun, e: Enemy, ap: number) =>
  rand(run) >= saveChance(enemyDef(e).defense - (e.nem?.hard ?? 0) - (e.hard ?? 0), ap + ((e.sunder ?? 0) > 0 ? TRAINING.relics.sunder.ap : 0));

/** A ring of `r` cells swelling out from a point. */
export const pulse = (run: TrainingRun, x: number, y: number, r: number, color: string) =>
  run.fx.push({ x1: x, y1: y, x2: x, y2: y, t: FX_TIME.pulse, color, kind: 'pulse', r });

/** Put damage over time on an enemy from piece `by`: the same source's same dot is refreshed, not stacked. */
export function addDot(e: Enemy, by: number, dps: number, secs: number) {
  const d = e.dots.find((o) => o.by === by && o.dps === dps);
  if (d) d.left = Math.max(d.left, secs);
  else e.dots.push({ by, dps, left: secs });
}

/** A unit's share more damage now: a shield boost on it, and lastStand while it holds an enemy. */
export function dmgMul(t: Tower): number {
  const last = isUnit(t) && t.holding !== undefined ? skillsOf(t, 'lastStand').reduce((m, s) => m * s.effect.mul, 1) : 1;
  const up = t.kind === 'default' && t.upgraded ? 1 + TRAINING.defaults.upgrade.dmg : 1;
  return t.atkBonus * (1 + (t.dmgBoost.left > 0 ? t.dmgBoost.mul : 0)) * last * up;
}

/** What a tower's cards add against this enemy: Crossfire on a held one, Pack tactics for units near it, Ace for its
 *  kills. */
export function cardMul(run: TrainingRun, t: Tower, e: Enemy): number {
  let m = t.crossfire && e.heldBy !== undefined ? 1 + t.crossfire : 1;
  if (!isUnit(t)) return m;
  if (t.pack) m *= 1 + t.pack * packMates(run, t);
  if (t.ace) m *= 1 + t.ace * Math.floor(t.kills / TRAINING.cards.ace.per);
  return m;
}

/**
 * Damage to an enemy from tower `by` (undefined: no one). A shot or blow on a marked enemy deals more; some enemies take
 * less from shots or more from blows. A kill credits `by`, pays out, sets off death-blasts, and a boss kill offers cards.
 * The run's tallies (tally.ts) note it all for the Sortie layer. A real lord's ward and hide take their share first
 * (lords.ts); a kill sets off a Vengeful rush (affixes.ts).
 * `chain`: whether this kill may set off a death-blast (a blast's own kills don't).
 */
export function hurt(run: TrainingRun, by: Tower | undefined, e: Enemy, dmg: number, how: Harm, chain = true): void {
  if (e.hp <= 0 || dmg <= 0) return;
  const def = enemyDef(e);
  const mul = how === 'shot' ? def.shotMul ?? 1 : how === 'melee' ? def.meleeMul ?? 1 : 1;
  const mark = how !== 'other' && e.status.mark ? TRAINING.markDmg : 0;
  const before = e.hp;
  e.hp -= lordDmg(run, by, e, (dmg + mark) * mul, how);
  const dealt = before - Math.max(0, e.hp);
  if (by) by.dealt += dealt;
  tallyHarm(run, by, e, dealt, how, e.hp <= 0);
  if (e.hp > 0) return;
  if (by) {
    by.kills += 1;
    if (by.chain) by.chain = { ...by.chain, stacks: Math.min(TRAINING.cards.chain.max, by.chain.stacks + 1), left: TRAINING.cards.chain.secs };
  }
  payKill(run, e);
  onEchoDeath(run, e);
  if (chain) deathBlasts(run, e);
  if (def.spawn === 'boss') offerCards(run);
}

/** Units with a death-blast make an enemy slain near them explode: its dmg to every enemy round the body. */
function deathBlasts(run: TrainingRun, dead: Enemy) {
  for (const p of run.pieces) {
    if (p.kind !== 'unit') continue;
    const c = centreOf(p);
    for (const s of skillsOf(p, 'deathBlast')) {
      if (dist(c.x, c.y, dead.x, dead.y) > s.effect.radius + p.up * TRAINING.levels.range) continue;
      for (const o of enemiesNear(run, dead.x, dead.y, s.effect.radius)) hurt(run, p, o, s.effect.dmg, 'other', false);
      pulse(run, dead.x, dead.y, s.effect.radius, FX_COLOR.blast);
    }
  }
}

/** Leave a status on an enemy. A knock and an execute act at once; a bleed is a dot credited to `t`. */
export function afflict(run: TrainingRun, t: Tower, e: Enemy, status: Status): void {
  if (e.hp <= 0) return;
  if (status === 'knock') {
    // Bosses stand their ground: stacked knocks could hold one back for ever.
    if (e.heldBy !== undefined || isBoss(e)) return;
    if (e.flies) {
      // Straight back toward the pad it left.
      const from = centre(WAYPOINTS[e.leg]);
      const d = dist(e.x, e.y, from.x, from.y);
      const k = d ? Math.min(TRAINING.knock, d) / d : 0;
      e.x += (from.x - e.x) * k;
      e.y += (from.y - e.y) * k;
    } else {
      Object.assign(e, upstream(mapOf(run), e.leg, e.x, e.y, Math.round(TRAINING.knock)));
    }
  } else if (status === 'execute') {
    if (!isBoss(e) && e.hp < e.maxHp * TRAINING.executeAt) hurt(run, t, e, e.hp, 'other');
  } else {
    e.status[status] = Math.max(e.status[status] ?? 0, TRAINING.status[status]);
    if (status === 'bleed') addDot(e, t.id, TRAINING.bleedDps, TRAINING.status.bleed);
  }
}

/** The tower a dot is credited to, if it still stands. */
export const towerById = (run: TrainingRun, id: number): Tower | undefined => {
  const p = pieceById(run, id);
  return p && p.kind !== 'rubble' ? p : undefined;
};
