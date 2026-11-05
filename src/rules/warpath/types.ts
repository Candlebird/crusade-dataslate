import type { Effect, Status } from '../abilities';
import type { RelicTier } from '../data';
import type { LordTrick } from '../training/types';
import type { DoctrineId } from './data';

// Every shape a Warpath run holds. A run is plain data (JSON in and out) so it saves to the device and the cloud and
// plays on with the same dice; the flock's bodies (view.ts) are rebuilt from it and never saved.

export type WarpathMode = 'normal' | 'hard';

/** A weapon as Warpath fires it: the datasheet's gun (total attacks for the full squad) with its volley clock. */
export interface WGun {
  name: string;
  melee: boolean;
  /** Inches on the field (range × WARPATH.rangeMul, clamped). Melee: how far models sally. */
  reach: number;
  /** Attacks a volley with every model standing. */
  attacks: number;
  ap: number;
  hitMod: number;
  blast: number;
  deadly: number;
  rending: boolean;
  reliable: boolean;
  /** Indirect: ignores blocking terrain and cover. */
  indirect: boolean;
  /** Picks the toughest enemy in reach instead of the nearest. */
  sniper: boolean;
  cd: number;
  pending: number;
  gap: number;
  next: number;
}

/** How a squad moves with the hero. */
export type SquadKind = 'hero' | 'foot' | 'heavy' | 'artillery' | 'air' | 'fort';

/** A timed rule (heal, shield, barrage, frenzy…) with its clock. */
export interface TimedRule { source: string; effect: Effect; cd: number }

/** A unit on the field: the hero (squads[0]) or one called in. */
export interface Squad {
  unitId: string;
  name: string;
  kind: SquadKind;
  points: number;
  quality: number;
  defense: number;
  tough: number;
  size: number;
  /** Models standing, and wounds on the next one to fall. */
  alive: number;
  wounds: number;
  /** Seconds to the next model back. */
  regen: number;
  /** Level (0 when called in), and the most it can reach (5, +1 a trait, −1 a scar). */
  level: number;
  maxLevel: number;
  guns: WGun[];
  /** Rules: always-on effects (onHit, sixes, leech, thorns, aura, lastStand, field, penalty) and timed ones. */
  skills: Effect[];
  timed: TimedRule[];
  /** Caster(X), and its clock. */
  caster: number;
  castCd: number;
  /** Relics: tier and clock each. */
  relics: { name: string; tier: RelicTier; cd: number }[];
  /** Where the squad centres (its flock forms around it). */
  x: number;
  y: number;
  /** Advance in inches (for speed and charge reach). */
  advance: number;
  /** Rate boosts that wear off: a frenzy, as a multiplier and seconds left. */
  frenzy: number;
  frenzyLeft: number;
  /** Aircraft: where on its loop it is (radians). */
  angle: number;
  /** Fortification: its own HP, seconds until it lands again (dropping or destroyed), and where it stands. */
  fort?: { hp: number; maxHp: number; down: number; fall: number };
  /** Damage dealt this run (the run summary's meter), and kills. */
  dealt: number;
  kills: number;
  /** Rules the run had to guess (the review list). */
  guessed: string[];
}

/** An enemy datasheet as Warpath fields it: one model's stats. */
export interface EnemyKind {
  key: string;
  name: string;
  icon: string;
  quality: number;
  defense: number;
  /** Wounds a model. */
  hp: number;
  speed: number;
  /** Points a model, and its tier (0 cheap … 2 dear). */
  points: number;
  tier: number;
  /** Models that come together. */
  pack: number;
  melee: { attacks: number; ap: number; deadly: number };
  gun?: { reach: number; attacks: number; ap: number; deadly: number; blast: boolean };
  /** Size on screen (inches across). */
  size: number;
  hero: boolean;
}

export interface Enemy {
  id: number;
  kind: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Seconds to its next blow, or its shot's wind-up. */
  cd: number;
  /** Winding up a shot at (tx, ty): seconds left. */
  aim: number;
  tx: number;
  ty: number;
  status: Partial<Record<Status, number>>;
  /** 'captain' | 'lord': a boss. */
  boss?: 'captain' | 'lord';
  /** A real campaign lord's index in run.lords, its trick and the trick's clock. */
  lord?: { i: number; trick?: LordTrick; cd: number; ward: number };
  /** Boss scale, defense bonus. */
  size: number;
  armour: number;
  /** Credited to whoever hurt it last, by squad index (for kills). */
  by: number;
  /** Stops at range and shoots (telegraphed), instead of rushing. */
  shoots: boolean;
  /** An elite: more wounds, harder blows, a gold rim, a richer Shard. */
  elite?: boolean;
  /** A champion holding a site (by site id) until the hero comes near. */
  guard?: number;
  /** A champion: the site it was set to hold (its fall drops a heap of Shards). */
  champ?: number;
}

/** A shot or blast marker an enemy has loosed: shots fly, blasts wait out a fuse. Either is rolled when it lands. */
export interface Missile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  blast: boolean;
  quality: number;
  ap: number;
  dmg: number;
  attacks: number;
}

export type PickupKind = 'gem' | 'ration' | 'beacon' | 'supply';
export interface Pickup { id: number; kind: PickupKind; x: number; y: number; xp: number; life: number; pulled?: boolean }

/** A site on the map: a shrine to hold, a cache to open, a well to drink from, a champion to slay. */
export type SiteKind = 'shrine' | 'cache' | 'well' | 'champion';
export interface Site { id: number; kind: SiteKind; x: number; y: number; /** Seconds held. */ held: number; /** A cache's ambush has sprung. */ sprung?: boolean }

/** A horde on its way: when it lands, a ring round the hero or a column from angle `a`. */
export interface Horde { at: number; kind: 'ring' | 'column'; a: number }

/** A level-up card. */
export type Card =
  | { kind: 'call'; unitId: string }
  | { kind: 'drill'; unitId: string }
  | { kind: 'doctrine'; id: DoctrineId }
  | { kind: 'score' };

/** Terrain: blocking stops bodies, difficult slows, dangerous hurts, cover makes ranged hits harder. Circles. */
export type TerrainKind = 'block' | 'difficult' | 'dangerous' | 'cover';
export interface Terrain { kind: TerrainKind; x: number; y: number; r: number; icon: number }

/** Floating numbers and flashes (display only; not saved). */
export interface Fx { kind: 'dmg' | 'shot' | 'melee' | 'heal' | 'boom' | 'land' | 'relic' | 'spell'; x: number; y: number; x2?: number; y2?: number; n?: number; t: number; crit?: boolean; hero?: boolean; hurt?: boolean }

/** The run's campaign lords (real Echo Lords take the 15-minute bosses in order; the generic lord after). */
export interface WLord { key: string; name: string; trick: LordTrick; slain?: boolean }

export interface WarpathRun {
  /** The force's Armoury levels when the run began (rules/warpath/meta.ts). */
  meta?: Partial<Record<string, number>>;
  v: number;
  forceId: string;
  mode: WarpathMode;
  /** The week it was started in, and that week's theme book. */
  week: string;
  theme: { uid: string; name: string };
  seed: number;
  rng: number;
  /** Seconds survived (paused time doesn't count). */
  t: number;
  phase: 'play' | 'card' | 'over';
  /** Hero position, facing, HP and its brief untouchable time after a hit. */
  hx: number;
  hy: number;
  face: number;
  hp: number;
  maxHp: number;
  iframes: number;
  /** A shield from Shield rules: soaks damage first; refreshes, doesn't stack. */
  shield?: number;
  /** Squads on the field (squads[0] is the hero). */
  squads: Squad[];
  /** Units that can still be called in, built when the run starts (so a run plays the force as it was then). */
  bench: Squad[];
  points: number;
  enemyKinds: EnemyKind[];
  enemies: Enemy[];
  missiles: Missile[];
  pickups: Pickup[];
  /** Ids handed out, so they never repeat. */
  nextId: number;
  /** Spawn credit (fractional enemies owed). */
  owed: number;
  /** Timers: next ration, next beacon, next captain and lord check. */
  nextRation: number;
  nextBeacon: number;
  bossesDone: number;
  lords: WLord[];
  /** Level-ups opened so far (call-in cards come every WARPATH.cards.callEvery-th). */
  levelUps?: number;
  /** Hordes: when the next is announced, and one on its way. */
  nextHorde?: number;
  horde?: Horde;
  /** Sites on the map, and when the next turns up. */
  sites?: Site[];
  nextSite?: number;
  /** A shrine's Battle Hymn runs until this time. */
  hymnUntil?: number;
  /** A line across the top of the screen (a horde coming, a site taken) and its seconds left. */
  banner?: { text: string; t: number; tone: 'warn' | 'good' };
  /** Level, XP towards the next, level-ups waiting (a supply drop or a quick double), the offer on screen, rerolls left. */
  level: number;
  xp: number;
  queued: number;
  offer: Card[];
  rerolls: number;
  doctrines: Partial<Record<DoctrineId, number>>;
  /** Tallies. */
  kills: number;
  captains: number;
  lordKills: number;
  score: number;
  /** Most points on the field before the second boss fell (Full Muster). */
  musterAtSecond?: number;
  /** Bosses slain with only foot squads beside the hero (Pure Infantry), with the hero alone (Lone Hero), and with the
   *  hero and at most one unit (One True Weapon). */
  pure?: number;
  lone?: number;
  single?: number;
  /** Lines for the run's log (bosses, call-ins). */
  log: string[];
  /** Autoplayed by the bot (sims, debug): banks nothing. */
  auto?: boolean;
  /** Banked to the force already. */
  banked?: boolean;
  fx: Fx[];
}

export interface SavedWarpath { v: number; savedAt: string; run: WarpathRun }
