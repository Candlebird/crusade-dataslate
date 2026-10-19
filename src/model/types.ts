import type { Category, RelicTier } from '../rules/data';

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
}

export interface Force {
  id: string;
  name: string;
  faction: string;
  player: string;
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
  battleLog?: BattleRecord[];
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
}

export interface AppState {
  version: 1;
  forces: Force[];
  books: CatalogBook[];
  settings: Settings;
}
