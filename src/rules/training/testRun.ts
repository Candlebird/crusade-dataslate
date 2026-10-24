import { TRAINING } from '../downtimeData';
import type { Enemy, TowerGun, TrainingRun, UnitTower } from './types';

// Test-only: an empty run in the build phase (no recipes, no cover, no draft), for module tests that need a run
// without createRun. Not in index.ts.

export function blankRun(seed = 1): TrainingRun {
  return {
    v: 8, forceId: 'f', seed, rng: seed, phase: 'build', wave: 0, cleared: 0, t: 0, power: 800, baseHp: TRAINING.baseHp,
    credits: 0, luck: 0, mends: 0, leaked: 0, nextId: 1, pieces: [], draft: { step: 'done', hand: [], placed: [] },
    recipes: [], crafted: [], enemies: [], queue: [], cover: [], cards: [], mods: { bounty: 1, holdMul: 1, regrabAdd: 0 },
    banked: {}, fx: [], log: [],
  };
}

const gun0: TowerGun = {
  name: 'Rifle', melee: false, range: 12, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, bane: false,
  cd: 0, pending: 0, gap: 0, next: 0,
};

let ids = 500;
/** A crafted unit at (20, 30) with one 12-cell rifle. */
export function testUnit(o: Partial<UnitTower> = {}): UnitTower {
  return {
    id: ids++, x: 20, y: 30, kind: 'unit', unitId: 'u', name: 'Squad', category: 'Infantry', points: 100, rank: 0, tough: 1, size: 5,
    impact: 0, quality: 4, guns: [{ ...gun0 }], hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 },
    dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0, skills: [], up: 0, cap: 3, holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0,
    xp: 0, init: 0, jumpy: false, myopic: false, ...o,
  };
}

/** An enemy near (21.5, 31.5): a Drone of 100 wounds unless told otherwise. */
export function testEnemy(o: Partial<Enemy> = {}): Enemy {
  return { id: ids++, kind: 'drone', x: 21.5, y: 31.5, leg: 0, hp: 100, maxHp: 100, flies: false, status: {}, dots: [], regrab: 0, ...o };
}
