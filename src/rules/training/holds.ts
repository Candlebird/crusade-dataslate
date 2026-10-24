import { TRAINING } from '../downtimeData';
import { centreOf, unitTowers } from './board';
import { enemiesNear, enemyDef, FX_COLOR, hurt, isBoss, skillsOf, toGo } from './harm';
import type { Enemy, TrainingRun, UnitTower } from './types';

// Holds: a tough crafted unit grabs a walker in its melee reach and keeps it there a moment while the rest pass.

/** Datasheet Tough (its tough less the level-ups that added to it). */
const sheetTough = (t: UnitTower) => t.tough - t.up;

/** Can it hold walkers at all: not an Aircraft, datasheet Tough above 1. */
export const canHold = (t: UnitTower) => t.category !== 'Aircraft' && sheetTough(t) > 1;

/** How long unit `t` holds enemy `e` (0 if it can't: a flyer, or canHold fails). Bosses and big ones are held `bigMul`
 *  as long; hold cards and the unit's record (grit) lengthen every hold. */
export function holdTime(run: TrainingRun, t: UnitTower, e: Enemy): number {
  const H = TRAINING.holds;
  if (e.flies || !canHold(t)) return 0;
  const big = isBoss(e) || enemyDef(e).big ? H.bigMul : 1;
  return Math.min(H.max, H.perTough * t.tough) * big * run.mods.holdMul * (t.grit ?? 1);
}

/** Seconds before an enemy let go can be grabbed again: `regrab[0]` at Defense 6+, straight down to `regrab[1]` at 2+. */
export function regrabTime(run: TrainingRun, e: Enemy): number {
  const [hi, lo] = TRAINING.holds.regrab;
  const def = Math.max(2, Math.min(6, enemyDef(e).defense));
  return lo + ((hi - lo) * (def - 2)) / 4 + run.mods.regrabAdd;
}

/** Let go of what it holds; the enemy can't be grabbed again for a while. */
function release(run: TrainingRun, t: UnitTower, e: Enemy | undefined) {
  t.holding = undefined;
  t.holdLeft = 0;
  if (!e) return;
  e.heldBy = undefined;
  e.regrab = regrabTime(run, e);
}

/** The walker it would grab: free, off cooldown, in melee reach, the one furthest along. */
function grabbable(run: TrainingRun, t: UnitTower): Enemy | undefined {
  const c = centreOf(t);
  return enemiesNear(run, c.x, c.y, TRAINING.meleeReach)
    .filter((e) => e.heldBy === undefined && e.regrab <= 0 && holdTime(run, t, e) > 0)
    .sort((a, b) => toGo(run, a) - toGo(run, b))[0];
}

/** While holding: thorns hurt the held enemy (n × chance a second), leech drains it (n a second). */
function squeeze(run: TrainingRun, t: UnitTower, e: Enemy, dt: number) {
  const dps = skillsOf(t, 'thorns').reduce((n, s) => n + s.effect.n * s.effect.chance, 0) + skillsOf(t, 'leech').reduce((n, s) => n + s.effect.n, 0);
  if (dps > 0) hurt(run, t, e, dps * dt, 'other');
}

/** Grabs and releases: each unit holds one walker at a time; thorns and leech work on it meanwhile (lastStand is in harm.dmgMul). */
export function holds(run: TrainingRun, dt: number): void {
  for (const t of unitTowers(run)) {
    if (t.holding !== undefined) {
      const e = run.enemies.find((o) => o.id === t.holding && o.hp > 0);
      if (!e) { release(run, t, undefined); continue; }
      squeeze(run, t, e, dt);
      t.holdLeft -= dt;
      if (t.holdLeft <= 0 || e.hp <= 0) release(run, t, e.hp > 0 ? e : undefined);
      continue;
    }
    const e = grabbable(run, t);
    if (!e) continue;
    t.holding = e.id;
    // An armour relic's brace goes on this hold.
    t.holdLeft = holdTime(run, t, e) * (t.brace && t.brace > 0 ? t.brace : 1);
    t.brace = 0;
    e.heldBy = t.id;
    const c = centreOf(t);
    run.fx.push({ x1: c.x, y1: c.y, x2: e.x, y2: e.y, t: t.holdLeft, color: FX_COLOR.hold, kind: 'hold' });
  }
}
