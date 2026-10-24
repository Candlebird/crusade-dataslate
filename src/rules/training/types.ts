import type { Category, RelicTier } from '../data';
import type { Gun } from '../autoBattle';
import type { AuraStat, Effect } from '../abilities';
import type { DrillPerk, ShardType } from '../downtimeData';
import type { Tile } from './map';
import type { RunNexus } from './nexusTypes';
import type { Enemy, RunBeast, RunNemesis, SpawnPlan } from './enemyTypes';
import type { ForceTale, TrainingRecord } from '../../model/types';

export type { LordState, LordTrick, NexusAffixId, RunLord, RunNexus } from './nexusTypes';
export type { Dot, Enemy, NemesisState, RunBeast, RunNemesis, SpawnPlan } from './enemyTypes';

// Every shape a Training run holds. A run is plain data all the way down (no classes, functions or Maps), so it saves
// as JSON and loads back as it was; map caches (map.ts mapFor) rebuild from the pieces.

export type { Tile };

/** Shard grade: 1 Cracked … 5 Pristine. A grade's value is 2^(grade-1). */
export type Grade = 1 | 2 | 3 | 4 | 5;

export type Phase = 'build' | 'wave' | 'over';

/** A weapon as a tower fires it, with its volley clock. */
export interface TowerGun extends Gun {
  /** Seconds until it can start another volley. */
  cd: number;
  /** Shots of the current volley still to come, one every `gap` seconds; `next` counts down to the next. */
  pending: number;
  gap: number;
  next: number;
  /** A relic weapon's gun: its shots draw in gold. */
  relic?: boolean;
  /** A Shard's (or a default tower slot's) gun: the Shard type whose rule its hits carry (daze, slow). */
  shard?: ShardType;
  /** Times the damage against flyers (anti-air: SHARD_TYPES `air`; 1 if unset). */
  air?: number;
}

/** One effect of one ability on a crafted unit, with its own timer. */
export interface TowerSkill {
  /** The rule, trait, relic or card it comes from. */
  source: string;
  effect: Effect;
  /** A weapon's rule: only that weapon's hits carry it. */
  gun?: string;
  /** Seconds until a timed effect can go again; for a field, until it next pulses. */
  cd: number;
}

/** What every piece has: an id unique in the run, and its top-left cell (pieces are 2×2). */
export interface PieceBase extends Tile {
  id: number;
}

/** What shoots: kept Shards and crafted units. */
export interface Armed {
  quality: number;
  guns: TowerGun[];
  /** To-hit modifiers, shooting and melee (habits, cards). */
  hitShoot: number;
  hitMelee: number;
  /** Damage multiplier (cards). */
  atkBonus: number;
  /** What allies' auras give it right now (recomputed every step): to hit, (unused) save, share faster, cells of reach. */
  boost: Record<AuraStat, number>;
  /** A shield-skill boost on it: extra damage share and seconds left. */
  dmgBoost: { mul: number; left: number };
  /** A banner relic's rally on it (relics.ts): a share faster and seconds left. */
  rush?: { mul: number; left: number };
  kills: number;
  dealt: number;
}

export interface ShardPiece extends PieceBase, Armed {
  kind: 'shard';
  type: ShardType;
  grade: Grade;
  /** Placed from the current draft and not yet kept: it turns to rubble unless kept (or used in a craft). */
  draft: boolean;
}

/** A default tower (emplacements.ts): a generic emplacement from Shards of exact grades. No XP, levels, traits or relics. */
export interface DefaultTower extends PieceBase, Armed {
  kind: 'default';
  /** Its TRAINING.defaults recipe. */
  key: string;
  name: string;
  /** The Shards it was built from, by type and grade (their rules: auras, bleeds). */
  slots: [ShardType, Grade][];
}

export interface RubblePiece extends PieceBase {
  kind: 'rubble';
}

/** A crafted unit: a real tower from its datasheet. Fixed where it was crafted. */
export interface UnitTower extends PieceBase, Armed {
  kind: 'unit';
  unitId: string;
  name: string;
  category: Category;
  points: number;
  /** Its campaign level (from XP), for show. */
  rank: number;
  /** Datasheet Tough (at least 1), plus level-ups: how long it holds. */
  tough: number;
  size: number;
  impact: number;
  skills: TowerSkill[];
  /** Level-ups bought this run, and the most it may have (by its points). */
  up: number;
  cap: number;
  /** The enemy it is holding (id), and seconds of the hold left. */
  holding?: number;
  holdLeft: number;
  /** Seconds of frenzy left, and how many times as fast it attacks meanwhile. */
  frenzy: number;
  frenzyMul: number;
  /** run.cleared when it was crafted: it earns XP as waves cleared since reach xpEvery, 2 × xpEvery, … */
  craftedAt: number;
  /** XP earned this run (never above TRAINING.xpCap). */
  xp: number;
  /** Sortie habits: initiative as attack speed, Jumpy and Short-sighted. */
  init: number;
  jumpy: boolean;
  myopic: boolean;
  /** Its crusade record's share on every hold (veterans.ts gritOf; 1 if unset). */
  grit?: number;
  /** An armour relic's brace: the next hold lasts this many times as long (0 or unset: none). */
  brace?: number;
  /** Its relics, each going off by itself on its own clock during waves (relics.ts). */
  relics?: RelicSocket[];
  /** Its Sortie quirks and trinket as crafted (habits.ts), and a trinket taken this run (trinkets.ts). */
  quirks?: string[];
  trinket?: string;
  /** Times the cover penalty on its shots (region quirks; 1 if unset). */
  coverMul?: number;
  /** What it did this run, for the quirk it may pick up (tally.ts): damage by shots and blows, and holds. */
  tally?: Tally;
}

export interface Tally {
  shot: number;
  melee: number;
  holds: number;
}

/** What a relic does when it goes off (relics.ts). */
export type RelicAct = 'shot' | 'pulse' | 'brace' | 'mark' | 'rally' | 'barrage' | 'shield' | 'frenzy' | 'field' | 'bleed' | 'status';

/** A relic on a crafted unit: what it does, every how many seconds, and its clock. */
export interface RelicSocket {
  name: string;
  tier: RelicTier;
  act: RelicAct;
  /** Seconds between goes, and until the next. */
  every: number;
  cd: number;
  /** The mapped effect it uses, if any. */
  effect?: Effect;
  /** A weapon relic's gun (its name). */
  gun?: string;
}

export type Piece = ShardPiece | RubblePiece | UnitTower | DefaultTower;
export type Tower = ShardPiece | UnitTower | DefaultTower;

/** A Shard drawn but not yet placed. */
export interface DrawnShard {
  type: ShardType;
  grade: Grade;
}

/**
 * The build phase's draft. 'place': Shards in `hand` still to set down. 'keep': all placed, one to keep (or a craft).
 * 'done': kept; the wave can start.
 */
export interface DraftState {
  step: 'place' | 'keep' | 'done';
  hand: DrawnShard[];
  /** Ids of the pieces placed from this draft (ShardPiece with draft: true). */
  placed: number[];
}

/** A way to keep a draft piece: plain, or as a merge of `with` (alike draft pieces) into one `grade` up. */
export interface KeepOption {
  pieceId: number;
  /** The grade it ends at. */
  grade: Grade;
  /** The other draft pieces the merge uses up (empty for a plain keep). */
  with: number[];
}

/** One Shard a recipe needs: its type, at this grade or better. */
export interface RecipeSlot {
  type: ShardType;
  grade: Grade;
}

/** A unit's recipe: the Shards that craft it. Deterministic from the force. */
export interface Recipe {
  unitId: string;
  name: string;
  points: number;
  slots: RecipeSlot[];
}

/** A quirk a unit picks up from the run, applied when it is banked. */
export interface QuirkGain {
  unitId: string;
  name: string;
  quirk: string;
  good: boolean;
}

/** A shot, blow or effect, drawn for a moment. */
export interface Fx {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Seconds left on screen. */
  t: number;
  color: string;
  melee?: boolean;
  miss?: boolean;
  /** A miss that cover stopped. */
  blocked?: boolean;
  /** heal: a line (bleed-field / boost link); bolt: a barrage shot; pulse: a ring of `r` cells; hold: a grab line. */
  kind?: 'heal' | 'bolt' | 'pulse' | 'hold';
  r?: number;
}

/** A card as drawn: which card (cards.ts CARDS), and the unit it would go to. */
export interface CardDraw {
  id: string;
  rarity: RelicTier;
  unitId?: string;
  /** A trinket card (trinkets.ts, id 'trinket'): the Sortie trinket it gives. */
  trinket?: string;
}

/** Run-wide modifiers cards give. */
export interface RunMods {
  /** Kills pay this many times their credits. */
  bounty: number;
  /** Holds last this many times as long; re-grab waits this many seconds more. */
  holdMul: number;
  regrabAdd: number;
}

/** A title a crafted unit earned this run (records.ts). */
export interface TitleGain {
  unitId: string;
  name: string;
  title: string;
}

/** What a run hands the force's records (records.ts runHonours): each crafted unit's Training record after it, the
 *  titles earned, the tales told (at most TRAINING.records.tales), and whether it was the force's new best. */
export interface RunHonours {
  records: Record<string, TrainingRecord>;
  titles: TitleGain[];
  tales: Omit<ForceTale, 'id' | 'date' | 'round'>[];
  best: boolean;
}

/** What the force's Drill Honours open for a run (drill.ts drillOf): the luck cap, the boss cards that can be drawn,
 *  and perk levels. A run without one (bots, the Weekly Siege) has everything open and no perks. */
export interface RunDrill {
  luck: number;
  cards: string[];
  perks: Partial<Record<DrillPerk, number>>;
}

export interface TrainingRun {
  /** Save format version (save.ts SAVE_VERSION). */
  v: 8;
  forceId: string;
  seed: number;
  /** mulberry32 state: the same seed and the same moves play out the same. */
  rng: number;
  phase: Phase;
  /** Waves started, and waves cleared. */
  wave: number;
  cleared: number;
  /** Seconds into the current wave. */
  t: number;
  /** The force's total points when the run began: waves scale with it. */
  power: number;
  baseHp: number;
  credits: number;
  /** Luck level 0..4: the draft's grade odds. */
  luck: number;
  /** Base mends bought this run (each dearer). */
  mends: number;
  /** Enemies that reached the base this wave. */
  leaked: number;
  nextId: number;
  pieces: Piece[];
  draft: DraftState;
  recipes: Recipe[];
  /** Units crafted this run (each only once). */
  crafted: string[];
  enemies: Enemy[];
  queue: SpawnPlan[];
  /** Cover patches, each by its top-left cell (TRAINING.cover.size square). */
  cover: Tile[];
  /** Cards on offer (after a boss kill), to pick one before the next wave; and those picked, oldest first. */
  offer?: CardDraw[];
  cards: CardDraw[];
  mods: RunMods;
  /** XP already handed to the app to bank, by unit id (run.ts takeXp). */
  banked: Record<string, number>;
  fx: Fx[];
  log: string[];
  /** The Sortie layer (F2): the nemesis waiting at its wave; Echoes met and slain for the bestiary; the units each boss
   *  walked past in reach and those that hit it (by enemy id); the trinket card offered (and to whom, if taken); and
   *  the quirks the run gives, rolled once at its end. */
  nemesis?: RunNemesis;
  beasts?: Record<string, RunBeast>;
  watch?: Record<string, { passed: string[]; hit: string[] }>;
  trinket?: { offered: boolean; id?: string; unitId?: string };
  gains?: QuirkGain[];
  /** The Sortie layer has been banked into the force (shared.ts bankShared). */
  shared?: boolean;
  /** The Nexus (F3, nexus.ts): the campaign's threat, affixes, event and real lords; none outside a campaign. */
  nexus?: RunNexus;
  /** Waves cleared in a row from the first with nothing getting through (run.ts), for the Gatekeeper title. */
  clean?: number;
  /** Records, titles and tales the run handed the force (F4, records.ts bankHonours), once. */
  honours?: RunHonours;
  /** Drill Honours (F5, drill.ts): what this run may use; none = everything, no perks. */
  drill?: RunDrill;
  /** The Weekly Siege it is (an ISO week, siege.ts): the week's seeded cover, drafts and waves. */
  siege?: string;
  /** Card offers re-drawn this run (cards.ts rerollCards). */
  rerolls?: number;
  /** The Drill Honours this run earned, banked into the force once (drillBank.ts bankDrill). */
  drilled?: { earned: number[] };
}

/** What a saved run looks like on disk (save.ts). */
export interface SavedRun {
  v: 8;
  savedAt: string;
  run: TrainingRun;
}
