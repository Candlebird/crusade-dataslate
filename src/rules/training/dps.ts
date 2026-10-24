import { TRAINING } from '../downtimeData';
import { hitChance, saveChance } from './rng';
import type { Armed, TowerGun } from './types';

// Expected damage a second, for tuning and tests: default towers are scaled by it (emplacements.ts).

/** One gun's expected damage a second from a tower against Defense `defense`: its attacks over its wait, to hit on the
 *  tower's Quality, through the save, Deadly and Blast(X) as whole hits. No armour, cover, auras, levels or skills. */
export function gunDps(t: Pick<Armed, 'quality' | 'hitShoot' | 'hitMelee' | 'atkBonus'>, g: TowerGun, defense = 5): number {
  const every = g.melee ? TRAINING.meleeEvery : TRAINING.shootEvery;
  const hit = g.reliable ? hitChance(2, 0) : hitChance(t.quality, g.hitMod + (g.melee ? t.hitMelee : t.hitShoot));
  const through = 1 - saveChance(defense, g.ap);
  return (g.attacks * hit * through * Math.max(1, g.deadly) * Math.max(1, g.blast) * t.atkBonus) / every;
}

/** A tower's expected damage a second against Defense `defense`: every gun's gunDps. */
export const towerDps = (t: Pick<Armed, 'quality' | 'hitShoot' | 'hitMelee' | 'atkBonus' | 'guns'>, defense = 5): number =>
  t.guns.reduce((n, g) => n + gunDps(t, g, defense), 0);
