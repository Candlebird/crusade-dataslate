import type { Unit } from '../../model/types';
import type { Effect } from '../abilities';
import { TRAINING } from '../downtimeData';
import { roleOfUnit } from '../warpath/traits';
import type { SquadRole } from '../warpath/types';
import type { Enemy, TrainingRun, UnitTower } from './types';

// Specialisations: a crafted unit's archetype (Warpath's roleOfUnit, set at its craft) offers two, and once it has
// SPEC.level level-ups (or its cap, if lower) or SPEC.kills kills, the player picks one for good. Free, no credits.
// Defaults and kept Shards have none. Static parts change the tower when picked; the rest is asked in combat
// (specRate in combat.ts, specMul in harm.ts) or rides on a skill pushed at the pick (onHit, aura).

export type RoleId = SquadRole;

/** When a unit may specialise: level-ups (its cap if lower) or kills this run. */
export const SPEC = { level: 3, kills: 60 } as const;

/** What a spec does. Every number is a share or a flat add, never something that grows with kills. */
export interface SpecFx {
  /** Attacks this share faster: always, while holding an enemy, or in a wave's first `openSecs`. */
  rate?: number;
  rateWhen?: 'holding' | 'opening';
  /** Hits this share harder against: elites and bosses, an enemy being held, walkers, or one still at full wounds. */
  dmg?: number;
  vs?: 'big' | 'held' | 'walker' | 'fresh';
  /** Flat adds made at the pick: to hit, AP, spill (blast), reach in cells, Tough, a share longer holds. */
  hit?: number;
  ap?: number;
  blast?: number;
  reach?: number;
  tough?: number;
  hold?: number;
  /** A skill it gains (an onHit status or an aura). */
  skill?: Effect;
}

export interface TrainingSpec extends SpecFx {
  id: string;
  role: RoleId;
  name: string;
  text: string;
}

/** Seconds of a wave Deep Strike's quick start lasts. */
export const OPEN_SECS = 10;

export const SPECS: TrainingSpec[] = [
  { id: 'firingLine', role: 'gunline', name: 'Firing Line', text: 'Attacks 12% faster.', rate: 0.12 },
  { id: 'suppressing', role: 'gunline', name: 'Suppressing Fire', text: 'A shot that wounds has a 25% chance to slow the enemy.', skill: { kind: 'onHit', status: 'slow', chance: 0.25, only: 'shoot' } },
  { id: 'heavyShells', role: 'artillery', name: 'Heavy Shells', text: '+1 AP on every shot.', ap: 1 },
  { id: 'creeping', role: 'artillery', name: 'Creeping Barrage', text: 'Each shot that hits spills onto 1 more enemy close by.', blast: 1 },
  { id: 'overwatch', role: 'fortress', name: 'Overwatch', text: 'Its guns reach 1 cell further.', reach: 1 },
  { id: 'strongpoint', role: 'fortress', name: 'Strongpoint', text: '+2 Tough (holds walkers longer).', tough: 2 },
  { id: 'gunship', role: 'flyer', name: 'Gunship', text: 'Attacks 12% faster.', rate: 0.12 },
  { id: 'bombRun', role: 'flyer', name: 'Bomb Run', text: 'Hits walkers 15% harder.', dmg: 0.15, vs: 'walker' },
  { id: 'momentum', role: 'charger', name: 'Momentum', text: 'Hits an enemy being held 20% harder.', dmg: 0.2, vs: 'held' },
  { id: 'trample', role: 'charger', name: 'Trample', text: 'A wound has a 20% chance to daze the enemy.', skill: { kind: 'onHit', status: 'daze', chance: 0.2 } },
  { id: 'reaper', role: 'phantom', name: 'Reaper', text: 'A wound has a 20% chance to mark the enemy.', skill: { kind: 'onHit', status: 'mark', chance: 0.2 } },
  { id: 'wraith', role: 'phantom', name: 'Wraith', text: '+1 to hit with every attack.', hit: 1 },
  { id: 'deepStrike', role: 'ambusher', name: 'Deep Strike', text: `Attacks 35% faster for the first ${OPEN_SECS} s of a wave.`, rate: 0.35, rateWhen: 'opening' },
  { id: 'alphaStrike', role: 'ambusher', name: 'Alpha Strike', text: 'Hits an enemy still at full wounds 30% harder.', dmg: 0.3, vs: 'fresh' },
  { id: 'adept', role: 'mystic', name: 'Adept', text: '+1 to hit with every attack.', hit: 1 },
  { id: 'massSpell', role: 'mystic', name: 'Mass Spell', text: 'Each shot that hits spills onto 1 more enemy close by.', blast: 1 },
  { id: 'fieldSurgeon', role: 'support', name: 'Field Surgeon', text: 'Towers within 3 cells (itself too) attack 6% faster.', skill: { kind: 'aura', stat: 'rate', n: 0.06, radius: 3 } },
  { id: 'warBanner', role: 'support', name: 'War Banner', text: 'Towers within 3 cells (itself too) reach half a cell further.', skill: { kind: 'aura', stat: 'range', n: 0.5, radius: 3 } },
  { id: 'marksman', role: 'hunter', name: 'Marksman', text: 'Hits elites and bosses 25% harder.', dmg: 0.25, vs: 'big' },
  { id: 'spotter', role: 'hunter', name: 'Spotter', text: 'A shot that wounds has a 25% chance to mark the enemy.', skill: { kind: 'onHit', status: 'mark', chance: 0.25, only: 'shoot' } },
  { id: 'outrider', role: 'skirmisher', name: 'Outrider', text: 'Its guns reach 1 cell further.', reach: 1 },
  { id: 'harrier', role: 'skirmisher', name: 'Harrier', text: 'A wound has a 25% chance to slow the enemy.', skill: { kind: 'onHit', status: 'slow', chance: 0.25 } },
  { id: 'shieldWall', role: 'bulwark', name: 'Shield Wall', text: '+2 Tough (holds walkers longer).', tough: 2 },
  { id: 'retribution', role: 'bulwark', name: 'Retribution', text: 'Attacks 20% faster while it holds an enemy.', rate: 0.2, rateWhen: 'holding' },
  { id: 'bloodbath', role: 'reaver', name: 'Bloodbath', text: 'Hits an enemy being held 20% harder.', dmg: 0.2, vs: 'held' },
  { id: 'frenzy', role: 'reaver', name: 'Frenzy', text: 'Attacks 20% faster while it holds an enemy.', rate: 0.2, rateWhen: 'holding' },
];

export const specById = (id: string | undefined) => SPECS.find((s) => s.id === id);
export const specsOf = (role: RoleId | undefined): TrainingSpec[] => SPECS.filter((s) => s.role === role);

/** A unit's archetype (set at its craft; an old save's unit, none: read from its category). */
export const roleFor = (u: Unit): RoleId => roleOfUnit(u);
export function roleOfTower(t: UnitTower): RoleId {
  if (t.role) return t.role;
  return t.category === 'Aircraft' ? 'flyer' : t.category === 'Fortification' ? 'fortress' : t.category === 'Vehicle/Monster' ? 'bulwark' : 'gunline';
}

/** Has unit `t` earned its pick (whether or not it has made it)? */
export const specReady = (t: UnitTower) => t.up >= Math.min(SPEC.level, t.cap) || t.kills >= SPEC.kills;

/** Units on the field that may pick a spec now. */
export const specDue = (run: TrainingRun): UnitTower[] =>
  run.pieces.filter((p): p is UnitTower => p.kind === 'unit' && !p.spec && specReady(p));

/** How far a unit is from its pick, in words (for the screens). */
export function specProgress(t: UnitTower): string {
  if (t.spec) return specById(t.spec)?.name ?? t.spec;
  if (specReady(t)) return 'Ready to specialise';
  return `Specialises at ${Math.min(SPEC.level, t.cap)} level-up${Math.min(SPEC.level, t.cap) === 1 ? '' : 's'} (${t.up} now) or ${SPEC.kills} kills (${t.kills} now)`;
}

/** Why unit `id` can't take spec `spec`, or null. */
export function specProblem(run: TrainingRun, id: number, spec: string): string | null {
  if (run.phase === 'over') return 'The run is over.';
  const t = run.pieces.find((p) => p.id === id);
  if (!t || t.kind !== 'unit') return 'Only crafted units specialise.';
  if (t.spec) return 'It has already specialised.';
  if (!specReady(t)) return specProgress(t) + '.';
  const s = specById(spec);
  if (!s || s.role !== roleOfTower(t)) return 'Not one of its specialisations.';
  return null;
}

/** Take spec `spec` for unit `id`, for good. Throws on a problem. */
export function pickSpec(run: TrainingRun, id: number, spec: string): void {
  const why = specProblem(run, id, spec);
  if (why) throw new Error(why);
  const t = run.pieces.find((p) => p.id === id) as UnitTower;
  const s = specById(spec)!;
  t.spec = s.id;
  if (s.hit) { t.hitShoot += s.hit; t.hitMelee += s.hit; }
  if (s.ap) t.guns.filter((g) => !g.melee).forEach((g) => { g.ap += s.ap!; });
  if (s.blast) t.guns.filter((g) => !g.melee).forEach((g) => { g.blast = Math.max(1, g.blast) + s.blast!; });
  if (s.reach) t.guns.filter((g) => !g.melee).forEach((g) => { g.range += s.reach! / TRAINING.rangeMul; });
  if (s.tough) t.tough += s.tough;
  if (s.hold) t.grit = (t.grit ?? 1) * (1 + s.hold);
  if (s.skill) t.skills.push({ source: s.name, effect: s.skill, cd: 0 });
  run.log.push(`${t.name} specialises: ${s.name}. ${s.text}`);
}

/** A unit's spec speed-up now (a share; 0 without one). */
export function specRate(run: TrainingRun, t: UnitTower): number {
  const s = specById(t.spec);
  if (!s?.rate) return 0;
  if (s.rateWhen === 'holding') return t.holding !== undefined ? s.rate : 0;
  if (s.rateWhen === 'opening') return run.t < OPEN_SECS ? s.rate : 0;
  return s.rate;
}

/** A unit's spec damage share against enemy `e` (1 without one). */
export function specMul(t: UnitTower, e: Enemy, big: boolean): number {
  const s = specById(t.spec);
  if (!s?.dmg) return 1;
  const on = s.vs === 'big' ? big || !!e.elite : s.vs === 'held' ? e.heldBy !== undefined : s.vs === 'walker' ? !e.flies : s.vs === 'fresh' ? e.hp >= e.maxHp : true;
  return on ? 1 + s.dmg : 1;
}
