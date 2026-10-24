import type { Effect, Status } from '../abilities';
import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { centreOf, dist, inCover, mapOf, pieceById } from './board';
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

/** How far a gun reaches, in cells: its range by TRAINING.rangeMul, + levels and range boosts; melee TRAINING.meleeReach. */
export function reach(t: Tower, g: TowerGun): number {
  if (g.melee) return TRAINING.meleeReach;
  return rangeCells(g.range) + (isUnit(t) ? t.up * TRAINING.levels.range : 0) + t.boost.range;
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

/** The enemy a gun aims at: the one in reach furthest along the route (least still to go), or the toughest for a Sniper. */
export function targetFor(run: TrainingRun, t: Tower, g: TowerGun): Enemy | undefined {
  const c = centreOf(t);
  let best: Enemy | undefined;
  let score = Infinity;
  for (const e of enemiesNear(run, c.x, c.y, reach(t, g))) {
    const s = g.name.includes('Sniper') ? -e.hp : toGo(run, e);
    if (s < score) { score = s; best = e; }
  }
  return best;
}

/** Is any of a tower's guns aimed at something right now? */
export const busy = (run: TrainingRun, t: Tower) => t.guns.some((g) => targetFor(run, t, g));

/** Is the enemy at -1 to be hit by this weapon: a shot at one standing in cover. */
export const covered = (run: TrainingRun, g: TowerGun, e: Enemy) => !g.melee && inCover(run, e.x, e.y);

/** Did a hit get through the enemy's save (Defense + AP; a Hardened nemesis and an Armoured Echo save better)? */
export const unsaved = (run: TrainingRun, e: Enemy, ap: number) =>
  rand(run) >= saveChance(enemyDef(e).defense - (e.nem?.hard ?? 0) - (e.hard ?? 0), ap);

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
  return t.atkBonus * (1 + (t.dmgBoost.left > 0 ? t.dmgBoost.mul : 0)) * last;
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
  if (by) by.kills += 1;
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
    if (e.heldBy !== undefined) return;
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
