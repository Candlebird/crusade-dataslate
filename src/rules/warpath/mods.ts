import { DOCTRINES, WARPATH, type DoctrineId } from './data';
import { metaFx } from './meta';
import type { Squad, WarpathRun } from './types';

// What doctrines, levels and the clock add up to, read wherever combat needs them.

/** A doctrine's level (0 when not taken). */
export const doc = (run: WarpathRun, id: DoctrineId) => run.doctrines[id] ?? 0;

/** Doctrine totals, per stat. */
export function mods(run: WarpathRun) {
  const D = DOCTRINES;
  const l = (id: DoctrineId) => doc(run, id);
  // A shrine's Battle Hymn.
  const hymn = (run.hymnUntil ?? 0) > run.t ? 1 + WARPATH.sites.hymn : 1;
  return {
    shootRate: (1 + D.relentless.rate * l('relentless')) * hymn * (1 + metaFx(run, 'drill')),
    meleeRate: (1 + D.furious.rate * l('furious')) * hymn * (1 + metaFx(run, 'drill')),
    hit: D.goodShot.hit * l('goodShot'),
    heroDmg: (1 - D.holdLine.dmg * l('holdLine')) * (1 - metaFx(run, 'warded')),
    losses: 1 - D.holdLine.losses * l('holdLine'),
    speed: (1 + D.rapidAdvance.speed * l('rapidAdvance')) * (1 + metaFx(run, 'stride')),
    regen: D.fieldMedics.regen * l('fieldMedics'),
    modelRegen: 1 / (1 + D.reinforcements.regen * l('reinforcements')),
    splash: D.shrapnel.splash * l('shrapnel'),
    ap: D.armourPiercing.ap * l('armourPiercing'),
    dmg: (1 + D.deadlyStrikes.dmg * l('deadlyStrikes')) * (1 + metaFx(run, 'edge')),
    pull: (1 + D.shardLure.pull * l('shardLure')) * (1 + metaFx(run, 'lure')),
    xp: (1 + D.shardLure.xp * l('shardLure')) * (1 + metaFx(run, 'scholar')),
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
  return Math.round((H.hpMin + h.tough * H.hpPerTough) * (1 + WARPATH.levels.hp * h.level) * (1 + metaFx(run, 'vigour')));
}

/** Penalty skills (scars) on a stat, summed. */
export const penalty = (s: Squad, stat: 'hit' | 'save' | 'rate' | 'hp') =>
  s.skills.reduce((n, e) => n + (e.kind === 'penalty' && e.stat === stat ? e.n : 0), 0);
