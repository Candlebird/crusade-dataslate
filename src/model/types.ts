import type { Category, RelicTier } from '../rules/data';
import type { MissionDef } from '../rules/missions';
import type { FinishedBattle, TrackedBattle } from '../rules/tracker';

export interface WeaponTrait {
  id: string;
  name: string;
  unique: boolean;
  /** Gained for free (e.g. requisition roll) — counts for BP but not against levels. */
  free?: boolean;
}

export interface Weapon {
  id: string;
  name: string;
  count: number;
  /** 0 = melee. */
  range: number;
  attacks: number | string;
  /** Rule labels from the profile, e.g. "AP(2)", "Rending". */
  rules: string[];
  /** Crusade weapon traits gained through levelling. */
  traits: WeaponTrait[];
}

export interface Upgrade {
  id: string;
  name: string;
  unique: boolean;
  nexus?: boolean;
  free?: boolean;
  note?: string;
}

export interface Scar {
  id: string;
  name: string;
  desc?: string;
}

export interface Relic {
  id: string;
  name: string;
  tier: RelicTier;
  profile?: string;
  note?: string;
}

export type UnitStatus = 'active' | 'comatose' | 'removed';

export interface Unit {
  id: string;
  /** Crusade name, e.g. "Magnus". */
  name: string;
  /** Datasheet name, e.g. "Force Commander". */
  unitType: string;
  /** Army book the unit came from, if imported. */
  bookName?: string;
  /** Army Forge uid of that book, for linking back to it. */
  bookUid?: string;
  category: Category;
  categoryOverridden: boolean;
  points: number;
  size: number;
  quality: number;
  defense: number;
  tough: number;
  rules: string[];
  weapons: Weapon[];
  xp: number;
  upgrades: Upgrade[];
  scars: Scar[];
  relics: Relic[];
  /** Manual BP adjustment (e.g. Heroic Rise +1). */
  bpAdjust: number;
  /** Bought Heroic Rise: may carry a relic like a Hero. */
  heroicRise?: boolean;
  status: UnitStatus;
  battles: number;
  kills: number;
  notes: string;
  image?: string;
}

export interface RpEntry {
  id: string;
  date: string;
  label: string;
  rp: number;
  supply: number;
  /** Umbra Shards gained or spent (history only — the force's umbraShards is the balance). */
  us?: number;
}

export type BattleResult = 'win' | 'loss' | 'draw';

export interface BattleRecord {
  id: string;
  date: string;
  opponent: string;
  result: BattleResult;
  vsAi: boolean;
  agendas: string[];
  myBp: number;
  oppBp: number;
  /** Human-readable lines describing what was applied. */
  summary: string[];
  notes: string;
  /** Nexus Wars sector fought over. */
  sectorId?: string;
  sectorName?: string;
  /** The tracked battle and side this record claimed (see rules/tracker claims). */
  battleId?: string;
  sideId?: string;
}

/** A force's Nexus Wars state (only once it is linked to a campaign faction). */
export interface ForceNexus {
  factionId: string;
  /** Tables unlocked for good (home Research Station). */
  permanentTables: Category[];
  /** Tables unlocked until the next match ('all' = Anomaly 6). */
  tempTables: Category[] | 'all';
  /** "Any Nexus trait when levelling up" (Void result 3). */
  traitTokens: number;
  /** Bought or granted for the next match: Combat Manipulations, Organized Strike. */
  pending: string[];
  /** The last campaign round whose income this force claimed. */
  claimedRound?: number;
  /** Match bonuses earned in a round (capped per round). */
  matchBonus?: { round: number; count: number };
}

/** A battle list: a printable selection of the force's units for one game. */
export interface ArmyList {
  id: string;
  name: string;
  /** Game size in points. */
  pointsLimit: number;
  /** Selected unit ids, in print order. */
  unitIds: string[];
  /** Hero unit id -> id of the unit it joins. */
  joins: Record<string, string>;
  notes: string;
  /** Print the special rules glossary and spells. */
  glossary: boolean;
  /** Print two unit cards side by side. */
  compact: boolean;
}

export interface Force {
  id: string;
  name: string;
  faction: string;
  player: string;
  /** Google account of the player who owns it in the cloud; unset = only on this device. */
  owner?: string;
  description: string;
  image?: string;
  /** Army Forge link for the force's army (falls back to its units' book). */
  armyLink?: string;
  startingSupply: number;
  battles: number;
  wins: number;
  ledger: RpEntry[];
  units: Unit[];
  /** Umbra Shards (Nexus Wars). */
  umbraShards: number;
  nexus?: ForceNexus;
  battleLog?: BattleRecord[];
  lists?: ArmyList[];
  /** Version of the trait and relic names it was saved with (see rules/migrate.ts). */
  rulesVersion?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  supplyPerRp: number;
  bp: {
    normal: number;
    unique: number;
    scar: number;
    Common: number;
    Rare: number;
    Legendary: number;
  };
  /** Optional Cloudflare Worker proxy for direct Army Forge fetches. */
  armyForgeProxy: string;
}

export const DEFAULT_SETTINGS: Settings = {
  supplyPerRp: 200,
  bp: { normal: 1, unique: 2, scar: -1, Common: 1, Rare: 2, Legendary: 4 },
  armyForgeProxy: '',
};

// ---- Army Forge catalog (normalized army book) ----

export type Gain =
  | { kind: 'weapon'; weapon: Omit<Weapon, 'id' | 'traits'> }
  | { kind: 'rule'; label: string }
  | { kind: 'item'; name: string; label: string; rules: string[] };

export interface CatalogOption {
  id: string;
  label: string;
  cost: number;
  gains: Gain[];
}

export interface CatalogSection {
  id: string;
  label: string;
  variant: 'replace' | 'upgrade';
  targets: string[];
  affectsAll: boolean;
  /** Pick at most one option in this section. */
  pickOne: boolean;
  /** Each model may take this option. */
  perModel: boolean;
  options: CatalogOption[];
}

export interface CatalogUnit {
  id: string;
  name: string;
  cost: number;
  size: number;
  quality: number;
  defense: number;
  rules: string[];
  weapons: Omit<Weapon, 'id' | 'traits'>[];
  sections: CatalogSection[];
}

export interface CatalogBook {
  uid: string;
  name: string;
  faction: string;
  version: string;
  importedAt: string;
  units: CatalogUnit[];
  rules: { name: string; desc: string }[];
  spells: { name: string; threshold: number; effect: string }[];
  /** Custom tags per datasheet name (see model/tags.ts); kept when the book is imported again. */
  unitTags?: Record<string, string[]>;
  /** When the tags or datasheets were last changed. */
  updatedAt?: string;
  /** Datasheets were changed by hand in the app; importing the book again would undo that. */
  edited?: boolean;
}

// ---- Nexus Wars campaign (kept by the GM, imported by players) ----

export type SectorType = 'home' | 'planet' | 'research' | 'void' | 'anomaly' | 'empty' | 'voidspawn';

export interface Sector {
  id: string;
  name: string;
  type: SectorType;
  /** Home / planet benefit id (see rules/nexus BENEFITS). */
  benefit?: string;
  /** Controlling faction id; a home sector's owner never changes. */
  owner?: string;
  /** Reinforce Sector: +200 supply when defending it. Lost when the sector changes hands. */
  reinforced?: boolean;
  /** Void one-off reward already taken. */
  rewardClaimed?: boolean;
  /** Axial hex coordinates on the campaign map; unset = not placed. */
  q?: number;
  r?: number;
  /** Lore / description, shown on the map. */
  notes: string;
  /** Sector art as a downscaled data URL. */
  image?: string;
}

export interface CampaignFaction {
  id: string;
  name: string;
  player: string;
  color: string;
}

export interface CampaignEvent {
  id: string;
  date: string;
  sectorId: string;
  /** Faction id or 'ai'. */
  attacker: string;
  /** Faction id, 'ai', or '' for an unclaimed sector. */
  defender: string;
  /** Faction id, 'ai', or '' for a draw. */
  winner: string;
  notes: string;
  /** The tracked battle this game was recorded from, if any. */
  battleId?: string;
  /** Not a game: the Void Echoes spread into the sector at the end of a round. */
  spread?: boolean;
  /** The campaign round it happened in. */
  round?: number;
  /** What the game changed, so deleting the entry can put the sector back. */
  undo?: { owner?: string; rewardClaimed?: boolean; reinforced?: boolean };
}

/** What each faction held when a round ended: round income is paid from this. */
export interface RoundSnapshot {
  round: number;
  date: string;
  /** Faction id → sector ids it held. */
  holdings: Record<string, string[]>;
  /** Faction id → catch-up Umbra Shards. */
  underdog: Record<string, number>;
}

export interface CampaignMap {
  cols: number;
  rows: number;
  /** Seed used for the starfield (and the last generation). */
  seed: string;
}

export interface Campaign {
  id: string;
  name: string;
  updatedAt: string;
  factions: CampaignFaction[];
  sectors: Sector[];
  log: CampaignEvent[];
  map?: CampaignMap;
  /** The round being played (1 when unset). */
  round?: number;
  /** Void Echoes threat level: how many sectors they spread into when a round ends. */
  threat?: number;
  /** The rounds that have ended, oldest first (only the last few are kept). */
  rounds?: RoundSnapshot[];
}

export interface RuleText {
  name: string;
  desc: string;
}

export interface AppState {
  version: 1;
  forces: Force[];
  books: CatalogBook[];
  settings: Settings;
  campaign?: Campaign;
  /** OPR core rule descriptions (AP, Tough, Hero…), imported from Army Forge for list glossaries. */
  coreRules?: RuleText[];
  /** Missions the group made in the Mission Library (shared with every player). */
  customMissions?: MissionDef[];
  /** The game being played right now, on this device. */
  battle?: TrackedBattle;
  /** Finished battles, shared with the group, so players can look back and claim their rewards. */
  battleHistory?: FinishedBattle[];
}
