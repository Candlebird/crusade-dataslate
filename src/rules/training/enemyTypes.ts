import type { Status } from '../abilities';
import type { TrainingEnemyKind } from '../downtimeData';
import type { LordState } from './nexusTypes';

// The Echoes in a run: wave plans, enemies on the field, the nemesis and the bestiary tally. Plain JSON, like the rest
// of the run (types.ts re-exports these).

/** A planned spawn of the current wave. */
export interface SpawnPlan {
  kind: TrainingEnemyKind;
  /** Seconds into the wave. */
  at: number;
  /** The leg it starts on (0 = spawn; a scout starts on the scout pad's leg). */
  leg: number;
  x: number;
  y: number;
  hp: number;
  flies: boolean;
  /** An elite (TRAINING.wave.eliteEvery): more wounds, a gold rim, leaks dearer. */
  elite?: boolean;
  /** The force's Sortie nemesis (nemesis.ts): the wave's boss is it. */
  nemesis?: boolean;
  /** A real lord (lords.ts): the wave's boss is RunNexus.lords[lord] (-1: the run's Final lord, RunFinale.lord). */
  lord?: number;
  /** Saves at +this (the Armoured affix). */
  hard?: number;
  /** The Final wave's boss (finale.ts). */
  final?: true;
}

/** Damage over time on an enemy, credited to piece `by`. */
export interface Dot {
  by: number;
  dps: number;
  left: number;
}

export interface Enemy {
  id: number;
  kind: TrainingEnemyKind;
  x: number;
  y: number;
  /** The leg of the route it is on: it is making for WAYPOINTS[leg + 1]. */
  leg: number;
  /** Facing (radians), for drawing. */
  face?: number;
  hp: number;
  maxHp: number;
  flies: boolean;
  elite?: boolean;
  /** An Ambusher that has made its jump. */
  jumped?: boolean;
  /** Seconds left of each status on it (knock and execute act at once and are never stored). */
  status: Partial<Record<Status, number>>;
  dots: Dot[];
  /** The unit holding it (piece id), and seconds before anyone can grab it again once let go. */
  heldBy?: number;
  regrab: number;
  /** The nemesis's tricks at work (nemesis.ts). */
  nem?: NemesisState;
  /** A real lord's trick at work (lords.ts). */
  lord?: LordState;
  /** Saves at +this (the Armoured affix); seconds left of a Vengeful rush (affixes.ts). */
  hard?: number;
  surge?: number;
  /** The Final wave's boss (finale.ts): its damage counts to RunFinale.dealt. */
  final?: true;
  /** Seconds left of a sundering relic's mark (relics.ts, the Crown of the Last Lord): every hit on it has AP(+sunder.ap). */
  sunder?: number;
}

/** A nemesis on the field: when it came, its walking speed share (rage, Vengeful), better saves (Hardened), whether
 *  anything can hold it (Dread), and the clocks of its timed tricks. */
export interface NemesisState {
  born: number;
  speed: number;
  hard: number;
  free?: boolean;
  next: number;
  regen: number;
  /** Its clocks are set (on its first tick). */
  armed?: boolean;
}

/** The force's Sortie nemesis, waiting for wave TRAINING.shared.nemesis.wave: which lord, its name, its grudge, the
 *  rematch tricks it brings (times the force has slain it on a Sortie), its signature, and whether it fell here. */
export interface RunNemesis {
  id: string;
  name: string;
  grudge: number;
  rematch: number;
  sig: string;
  sigName: string;
  slain?: boolean;
  /** The crafted unit (id) that landed the killing blow, if one did (tally.ts; records.ts). */
  by?: string;
}

/** Echoes met (waves met in; `at` the last wave counted) and slain this run, by Training kind or 'nemesis'. */
export interface RunBeast {
  met: number;
  slain: number;
  at?: number;
}
