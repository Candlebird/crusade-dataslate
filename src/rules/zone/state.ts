import type { AiStyle } from '../aiTrees';
import type { MissionDef } from '../missions';
import type { Hook, SpellDef } from '../oprRules';
import type { TeamKey } from '../tracker';
import type { Board } from './board';
import type { SavedRng } from './dice';
import type { ZProfile } from './profile';

// A zone battle in progress, as plain data: it saves to the cloud after every activation and picks up again
// exactly where it was (the dice generator's state is part of it).

export type SideIx = 0 | 1;
export const other = (s: SideIx): SideIx => (s === 0 ? 1 : 0);

/** A gift or mark on a unit, with how long it lasts. */
export interface Effect {
  give: Hook[];
  /** A mark: the units of this side get `give` when attacking it (not the unit itself). */
  mark?: SideIx;
  /** 'once': until it's next used; 'round': to the end of this round; 'next': to the end of the next round. */
  until: 'once' | 'round' | 'next' | 'game';
  round: number;
  /** Who gave it, for the log. */
  from: string;
  /** A 'once' gift held when an activation began: it goes when that activation ends. */
  spend?: boolean;
}

export interface ZUnit {
  /** The tracker unit id (a joined hero's own id stays on its kit). */
  id: string;
  side: SideIx;
  /** The tracker side (player) it belongs to: a side may have several players. */
  owner: string;
  name: string;
  p: ZProfile;
  /** The square it stands on; -1 off the table (not yet deployed, or waiting in Ambush). */
  sq: number;
  /** Models and wounds at the start of the battle, for half strength and points lost. */
  startModels: number;
  startWounds: number;
  points: number;
  ai: AiStyle;
  /** Deploys after everyone else and may go 2 squares out of its zone (Scout), or waits off the table (Ambush). */
  scout?: boolean;
  ambush?: boolean;
  /** Joined to another unit: its models are in that unit's profile, and this entry only remembers it. */
  joinedTo?: string;
  activated: boolean;
  shaken: boolean;
  routed: boolean;
  destroyed: boolean;
  /** Fought in melee this round: further melee hits only on 6s (Fatigue). */
  fought: boolean;
  /** Its last action was a Hold (for Entrenched, Dug In…). */
  held: boolean;
  /** Charged this activation. */
  charging: boolean;
  /** Was charged this round (for 'charged' hooks). */
  chargedBy?: string;
  /** Spell tokens (Caster). */
  tokens: number;
  spells: SpellDef[];
  /** Uses of once-a-game and once-a-round rules, by key; round keys carry the round number. */
  used: Record<string, number>;
  effects: Effect[];
  /** Kill XP per tracker unit (a joined hero earns its own). */
  xp: Record<string, number>;
  /** Spell, ability or Hold choice picked for this activation (Wreck-Core Reactor and other choices). */
  choice?: 'a' | 'b';
}

export interface LogDice {
  label: string;
  /** What each die needed. */
  need?: number;
  rolls: number[];
  /** How many succeeded. */
  ok: number;
}

export interface LogLine {
  round: number;
  side?: SideIx;
  /** The acting unit, and its target. */
  unit?: string;
  target?: string;
  kind: 'round' | 'deploy' | 'move' | 'shoot' | 'melee' | 'morale' | 'spell' | 'ability' | 'objective' | 'info' | 'end';
  /** One line for the summary. */
  text: string;
  /** The dice behind it, shown on expand. */
  dice?: LogDice[];
  /** Where it moved, for the map: from and to squares. */
  path?: [number, number];
  /** Wounds a shot or blow dealt, for the map. */
  wounds?: number;
}

export type ZHolder = '' | SideIx | 'x';

export interface ZMember { id: string; name: string; side: SideIx; ai: boolean; team: TeamKey }

export interface ZBattle {
  v: 1;
  /** The tracked battle it plays. */
  id: string;
  mission: MissionDef;
  board: Board;
  units: ZUnit[];
  members: ZMember[];
  teams: [TeamKey, TeamKey];
  /** Side 0 attacks on Attack & Defend missions. */
  round: number;
  rounds: number;
  phase: 'join' | 'deploy' | 'battle' | 'ended';
  /** Whose turn it is to deploy or activate. */
  turn: SideIx;
  /** Who goes first: in deployment, then each round (the side that finished activating first last round). */
  first: SideIx;
  finishedFirst?: SideIx;
  rng: SavedRng;
  log: LogLine[];
  /** Who holds each marker now. */
  control: ZHolder[];
  /** Who held each marker at the end of each round. */
  history: ZHolder[][];
  /** The unit carrying each marker (Relic Hunt, Capture & Hold, The Rescue). */
  carried: (string | null)[];
  /** Markers destroyed (Sabotage, Demolition), or removed (Smash & Grab decoys). */
  gone: boolean[];
  /** Smash & Grab: which marker is the relic and which the trap. */
  secret?: { relic: number; trap: number };
  /** Mission tallies per side, by counter id. */
  counters: [Record<string, number>, Record<string, number>];
  /** Last Stand: attackers already sent back to reserve once, and those waiting. */
  reserve?: { used: string[]; waiting: string[] };
  /** How the side's AI plays: Command = smart picks, otherwise the decision trees only. */
  smart: [boolean, boolean];
  result?: { winner: SideIx | 'draw'; vp: [number, number]; lost: [number, number]; share: [number, number]; why: string };
  /** A unit that has moved and has its shooting still to come (the second stage of an Advance, or a Rush that can shoot). */
  pending?: { unit: string; target?: string };
  /** Practice battles don't write anything back. */
  practice?: boolean;
  /** Added to every casting roll (a Nexus Resonance). */
  castBonus?: number;
}

export const unitById = (b: ZBattle, id: string) => b.units.find((u) => u.id === id);
/** Units still fighting on the table (not joined into another, not gone). */
export const onTable = (b: ZBattle) => b.units.filter((u) => !u.joinedTo && !u.destroyed && !u.routed && u.sq >= 0);
export const fighting = (u: ZUnit) => !u.joinedTo && !u.destroyed && !u.routed;
export const enemiesOf = (b: ZBattle, u: ZUnit) => onTable(b).filter((x) => x.side !== u.side);
export const friendsOf = (b: ZBattle, u: ZUnit) => onTable(b).filter((x) => x.side === u.side);

/** A side by its players' names ("Side 1" when it has none). */
export const sideName = (b: ZBattle, s: SideIx) => b.members.filter((m) => m.side === s).map((m) => m.name).join(' & ') || `Side ${s + 1}`;
