import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { dist } from './board';
import { eventIs, hasAffix, shroudFrom, threatOf } from './nexus';
import { rand, type Rng } from './rng';
import type { Enemy, SpawnPlan, TowerGun, TrainingRun } from './types';

// Threat affixes at work in the maze (F3): Sortie's affixes and pact marks, remapped and scaling with threat, and the
// Galactic Events that touch a wave (Warp Currents, Ion Storm). nexus.ts says which a run carries.

const X = TRAINING.nexus;

const isBossPlan = (s: SpawnPlan) => TRAINING_ENEMIES[s.kind].spawn === 'boss';

/** A wave's plans with the affixes on them, rolling `r`: Frenzied wounds, Proud elites, Armoured saves; and a Blood Moon's wounds. */
export function affixPlan(r: Rng, run: Pick<TrainingRun, 'nexus'>, plans: SpawnPlan[]): SpawnPlan[] {
  if (eventIs(run, 'bloodMoon')) for (const s of plans) s.hp *= X.events.bloodMoon.hp;
  const t = threatOf(run);
  if (!t || !run.nexus?.affixes.length) return plans;
  const armoured = Math.min(X.armoured.max, X.armoured.share * t);
  for (const s of plans) {
    if (hasAffix(run, 'frenzied')) s.hp *= 1 + X.frenzied.per * t;
    if (hasAffix(run, 'proud') && !isBossPlan(s) && !s.elite && rand(r) < X.proud.per * t) {
      s.elite = true;
      s.hp *= TRAINING.wave.eliteHp;
    }
    if (hasAffix(run, 'armoured') && rand(r) < armoured) s.hard = 1;
  }
  return plans;
}

/** An Echo's walking speed share from the Nexus: Swift, Warp Currents, a Vengeful rush. */
export function affixPace(run: TrainingRun, e: Enemy): number {
  const swift = hasAffix(run, 'swift') ? 1 + X.swift.per * threatOf(run) : 1;
  const currents = eventIs(run, 'warpCurrents') ? X.events.warpCurrents.walk : 1;
  return swift * currents * ((e.surge ?? 0) > 0 ? X.vengeful.mul : 1);
}

/** Every step after the lords: Regenerating mends every Echo but a boss; Vengeful rushes wear off. */
export function affixTick(run: TrainingRun, dt: number): void {
  if (!run.nexus?.affixes.length) return;
  const mend = hasAffix(run, 'regenerating') ? X.regenerating.per * threatOf(run) * dt : 0;
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    if (mend && TRAINING_ENEMIES[e.kind].spawn !== 'boss') e.hp = Math.min(e.maxHp, e.hp + e.maxHp * mend);
    if (e.surge) e.surge = Math.max(0, e.surge - dt);
  }
}

/** An Echo slain: with Vengeful, those within its radius rush. */
export function onEchoDeath(run: TrainingRun, dead: Enemy): void {
  if (!hasAffix(run, 'vengeful')) return;
  const secs = X.vengeful.secs * threatOf(run);
  for (const e of run.enemies) {
    if (e !== dead && e.hp > 0 && dist(e.x, e.y, dead.x, dead.y) <= X.vengeful.radius) e.surge = Math.max(e.surge ?? 0, secs);
  }
}

/** The Nexus's to-hit modifier on a shot `d` cells away from a gun reaching `reach`: Shrouded, Ion Storm. */
export function affixHit(run: TrainingRun, g: TowerGun, d: number, reach: number): number {
  if (g.melee || !run.nexus) return 0;
  const shroud = hasAffix(run, 'shrouded') && d > reach * shroudFrom(threatOf(run)) ? -1 : 0;
  const ion = eventIs(run, 'ionStorm') && d > X.events.ionStorm.from ? -1 : 0;
  return shroud + ion;
}
