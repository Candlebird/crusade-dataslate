import { DOCTRINES, WARPATH, type DoctrineId } from './data';
import { has, HONOURS, honoursOf, metaLv, TREE_FX as T } from './meta';
import type { Squad, WarpathRun } from './types';

// What doctrines, levels and the clock add up to, read wherever combat needs them.

/** A doctrine's level (0 when not taken). */
export const doc = (run: WarpathRun, id: DoctrineId) => run.doctrines[id] ?? 0;

/** Doctrine totals, per stat. */
export function mods(run: WarpathRun) {
  const D = DOCTRINES;
  const l = (id: DoctrineId) => doc(run, id);
  // A shrine's Battle Hymn.
  const hymn = (run.hymnUntil ?? 0) > run.t ? 1 + (has(run, 'pilgrim') ? T.pilgrimHymn : WARPATH.sites.hymn) : 1;
  // The War Council: Drill and Hail of Fire speed every gun; Last Stand, when the hero is low.
  const tree = (1 + T.drill * metaLv(run, 'drill')) * (has(run, 'hail') ? 1 + T.hailRate : 1)
    * (has(run, 'lastStand') && run.hp > 0 && run.hp < run.maxHp * T.lastStandBelow ? 1 + T.lastStand : 1);
  return {
    shootRate: (1 + D.relentless.rate * l('relentless')) * hymn * tree,
    meleeRate: (1 + D.furious.rate * l('furious')) * hymn * tree,
    hit: D.goodShot.hit * l('goodShot'),
    heroDmg: (1 - D.holdLine.dmg * l('holdLine')) * (1 - T.warded * metaLv(run, 'warded')),
    losses: 1 - D.holdLine.losses * l('holdLine'),
    speed: (1 + D.rapidAdvance.speed * l('rapidAdvance')) * (1 + T.march * metaLv(run, 'march')),
    regen: D.fieldMedics.regen * l('fieldMedics'),
    modelRegen: 1 / (1 + D.reinforcements.regen * l('reinforcements')),
    splash: D.shrapnel.splash * l('shrapnel'),
    ap: D.armourPiercing.ap * l('armourPiercing') + (has(run, 'bigGuns') ? 1 : 0),
    dmg: (1 + D.deadlyStrikes.dmg * l('deadlyStrikes')) * (1 + T.edge * metaLv(run, 'edge')) * (has(run, 'hail') ? 1 - T.hailDmg : 1)
      * (1 + HONOURS.dmg * honoursOf(run)),
    pull: (1 + D.shardLure.pull * l('shardLure')) * (1 + T.lodestone * metaLv(run, 'lodestone')),
    xp: (1 + D.shardLure.xp * l('shardLure')) * (1 + T.lore * metaLv(run, 'lore')),
    reach: 1 + D.veteranDrills.reach * l('veteranDrills'),
    fear: D.fearTactics.slow * l('fearTactics'),
    cd: 1 - D.arcaneFocus.cd * l('arcaneFocus'),
  };
}
export type Mods = ReturnType<typeof mods>;

/** Minutes survived. */
export const minutes = (run: WarpathRun) => run.t / 60;

/** Enemy wounds and damage multipliers: Hard mode, growth every minute, and more past lateFrom minutes. */
export function enemyMul(run: WarpathRun): { hp: number; dmg: number } {
  const S = WARPATH.spawn;
  const late = Math.max(0, minutes(run) - S.lateFrom);
  const hard = run.mode === 'hard' ? WARPATH.hard : { hp: 1, dmg: 1 };
  const m = minutes(run);
  return { hp: hard.hp * (1 + S.hpPerMin * m) * (1 + S.lateHp * late), dmg: hard.dmg * (1 + S.dmgPerMin * m) * (1 + S.lateDmg * late) };
}

/** The hero's most HP: hpMin + Tough × hpPerTough, + a share a level. */
export function heroMaxHp(run: WarpathRun): number {
  const h = run.squads[0];
  const H = WARPATH.hero;
  return Math.round((H.hpMin + h.tough * H.hpPerTough) * (1 + WARPATH.levels.hp * h.level) * (1 + T.vigour * metaLv(run, 'vigour')) * (1 + HONOURS.hp * honoursOf(run)));
}

/** Penalty skills (scars) on a stat, summed. */
export const penalty = (s: Squad, stat: 'hit' | 'save' | 'rate' | 'hp') =>
  s.skills.reduce((n, e) => n + (e.kind === 'penalty' && e.stat === stat ? e.n : 0), 0);
