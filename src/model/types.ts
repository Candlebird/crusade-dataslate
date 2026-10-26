import type { Category, RelicTier } from '../rules/data';
import type { MissionDef } from '../rules/missions';
import type { FinishedBattle, TrackedBattle } from '../rules/tracker';
import type { SymbolShape } from './emblemSymbols';

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
  /** Three stacked shapes that stand for the unit in the downtime games; unset = a default from its id (model/emblem.ts). */
  portrait?: EmblemLayer[];
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
  /** Habits picked up on Sorties, good and bad (rules/sortie.ts quirkInfo); they count on a Sortie and in Training. */
  quirks?: string[];
  /** The Sortie trinket it carries (SORTIE_TRINKETS, downtimeData.ts); it counts on a Sortie and in Training. */
  trinket?: string;
  /** Its Sortie record: runs it came back from standing, and Echo lords slain (rules/training/titles.ts). */
  sortieRecord?: { runs: number; lords: number };
  /** Its Training record (rules/training/records.ts): best wave, kills, real lords and nemeses it slew, runs, MVPs. */
  trainingRecord?: TrainingRecord;
  /** Titles it has earned, oldest first (TRAINING.titles ids, rules/training/titles.ts), shared by Sorties and Training. */
  titles?: string[];
  /** The title it shows: one it holds, '-' for none; unset = the latest earned. */
  title?: string;
  /** Off-table XP banked from free Sorties and Training, and the round (or week) it was banked in (OFF_TABLE_XP). */
  offTableXp?: { key: string; n: number };
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
  /** A solo patrol (downtime), not a full battle. */
  patrol?: boolean;
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
  /** The campaign round this force's faction last reorganised its detachments in. */
  reorganisedRound?: number;
  /** The campaign round this force last recorded a solo patrol in. */
  patrolRound?: number;
  /** Units that went on a Solo patrol or Expedition (or a task) this round: each unit gets one a round. Games at the table don't count. */
  usedUnits?: { round: number; ids: string[] };
  /** Settled Nexus Duels whose Umbra Shards and relics this force has paid or collected. */
  duelsPaid?: string[];
  /** Crossroads Journals whose Warlord rewards (or costs) this force has taken. */
  journalsPaid?: string[];
  /** Claimed bounties whose Umbra Shards, relic or trait tokens this force has taken. */
  bountiesPaid?: string[];
  /** Units on a downtime task this round (rules/tasks.ts): busy, they fight in no battle, the round's main Battle included. */
  tasks?: { round: number; units: Record<string, UnitTaskKind> };
  /** Relics forged by a Project, not taken yet: each makes one relic of its tier free in the Requisition shop. */
  forged?: ('Common' | 'Rare')[];
  /** Garrisons (`sectorId@round`) whose raid XP this force has taken. */
  garrisonsPaid?: string[];
}

/** A unit's downtime task for a round. */
export type UnitTaskKind = 'project' | 'mentor' | 'recon' | 'garrison' | 'sortie';

/** A Project under way on a world (rules/tasks.ts): one at a time, lost if the world changes hands. */
export interface SectorProject {
  /** PROJECTS id (downtimeData.ts). */
  id: string;
  factionId: string;
  progress: number;
  /** Who has worked on it, newest last: `round: unit name (+n)`. */
  log: string[];
}

/** Units standing guard on a world through a round, against the Marauders. */
export interface SectorGarrison {
  /** The round they stand guard in (raids come at its end). */
  round: number;
  factionId: string;
  units: { forceId: string; unitId: string; name: string; points: number }[];
  /** A band came: whether the garrison threw it back. Its units can take their XP. */
  raid?: { band: string; repelled: boolean };
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

export type EmblemShape =
  | 'circle' | 'ring' | 'square' | 'diamond' | 'shield' | 'hexagon' | 'triangle' | 'star'
  | 'burst' | 'cross' | 'chevron' | 'crescent' | 'bolt' | 'wings' | 'skull'
  | SymbolShape;

/** One layer of a force emblem; 'none' leaves the layer empty. */
export interface EmblemLayer {
  shape: EmblemShape | 'none';
  /** '#rrggbb' */
  color: string;
}

/** A force's Sortie history: lords with a grudge, regions it can go deep into, and relics it brought home. */
export interface ForceSortie {
  /** Echo lords that beat a party, by id, and how many times (a nemesis grows tougher each time). */
  nemesis?: Record<string, number>;
  /** Regions whose story thread the force finished, unlocking their deep version. */
  deep?: string[];
  /** Regions whose relic the force has brought home (once each); any unit that can carry one takes it for free. */
  relics?: string[];
  /** The hardest difficulty tier unlocked (0 = none yet): winning a run at it unlocks the next. */
  tier?: number;
  /** Trinkets brought home and not carried by a unit (SORTIE_TRINKETS ids). */
  trinkets?: string[];
  /** The last few runs, newest first. */
  recaps?: SortieRecap[];
  /** The highest Ascension level unlocked past the top tier (0 = none yet). */
  ascension?: number;
  /** Echoes and lords the force's parties have met, by Echo datasheet name (or 'lord:<id>'). */
  bestiary?: Record<string, SortieBeast>;
  /** Counts across every run, for boon unlocks (seeded from the recaps when first needed). */
  stats?: { runs: number; wins: number; flawless: number; deepest: number };
  /** Lords (nemeses) slain in Training since the force last met them on a Sortie, by lord id: each time, it starts that
   *  meeting hurt and a trick (or omen) short. */
  bled?: Record<string, number>;
}

/** A bestiary entry: fights it was met in, and squads of it slain (the first slain unlocks its lore). */
export interface SortieBeast {
  met: number;
  slain: number;
  /** For a lord: the most pact-mark heat it was slain under. */
  mark?: number;
  /** For a lord: times it was slain in Training (as the force's nemesis). It unlocks the lore, but adds no rematch trick. */
  drill?: number;
}

/** A unit's Training record, over every run it was crafted in. */
export interface TrainingRecord {
  /** Most waves cleared in a run it stood in. */
  best: number;
  kills: number;
  /** Real Echo Lords and the force's nemesis it landed the killing blow on. */
  lords: number;
  runs: number;
  /** Runs it led the defence in. */
  mvps: number;
}

/** A story from Training (rules/training/tales.ts): only highlights. Told in the campaign chronicle when `round` is set. */
export interface ForceTale {
  id: string;
  date: string;
  /** The campaign round it happened in (a force in a campaign). */
  round?: number;
  kind: 'best' | 'lord' | 'nemesis' | 'title' | 'victory';
  text: string;
  /** The units it tells of. */
  units: string[];
}

/** A run looked back on: where it went, how it ended and what it brought home. */
export interface SortieRecap {
  id: string;
  date: string;
  region: string;
  lord: string;
  over: 'won' | 'fell' | 'broke' | 'home' | 'quit';
  mode: 'free' | 'shard';
  length: 'short' | 'long';
  tier?: number;
  ascension?: number;
  depth: number;
  won: number;
  party: string[];
  /** The run's journal, oldest first. */
  lines: string[];
  /** What came home (XP, haul, quirks, trinkets, unlocks). */
  gained: string;
  /** The weekly challenge it was (an ISO week like '2026-W43'), and its score. */
  weekly?: string;
  score?: number;
}

/** A force's best weekly challenge run, on the campaign's board. */
export interface SortieBoardEntry {
  week: string;
  forceId: string;
  force: string;
  player: string;
  depth: number;
  score: number;
  over: SortieRecap['over'];
  date: string;
}

/** A force's Drill Honour counts over every Training run (rules/training/drillBank.ts bankDrill). */
export interface DrillStats {
  runs: number;
  kills: number;
  /** Bosses slain: generic lords, real Echo Lords and the nemesis. */
  bosses: number;
  /** Real Echo Lords and the nemesis slain. */
  lords: number;
  /** The longest clean start (waves with nothing through). */
  clean: number;
  /** The most units crafted in one run. */
  crafted: number;
  /** Weekly Sieges entered (weeks), and this week's best (the wave reached; `dmg`, damage to the colossus if it got there). */
  sieges: number;
  siege?: { week: string; best: number; dmg?: number };
}

/** A force's best Weekly Siege of a week, on the campaign's board (rules/training/siegeBoard.ts postSiege). */
export interface SiegeBoardEntry {
  week: string;
  forceId: string;
  force: string;
  player: string;
  factionId?: string;
  /** The wave reached, and waves cleared. */
  score: number;
  cleared: number;
  /** Damage dealt to the wave-25 colossus (it reached the boss); entries without it rank below every one with it. */
  dmg?: number;
  date: string;
}

/** A settled week's Weekly Siege winner: one Strategic Asset for its faction in `round` (siegeBoard.ts settleSieges). */
export interface SiegeWin {
  week: string;
  forceId: string;
  force: string;
  player: string;
  factionId?: string;
  score: number;
  /** Damage dealt to the colossus, if it reached it. */
  dmg?: number;
  round: number;
  date: string;
}

/** A force's Final-wave ladder in Training (rules/training/veterancy.ts): its veterancy (the most XP its units have
 *  ever held between them; it never drops), the highest Final wave open, the first Victory at each Final (wave → date)
 *  and the deepest Endless (waves cleared past the Final). */
export interface ForceFinale {
  vet: number;
  open: number;
  wins: Record<string, string>;
  endless?: number;
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
  /** Three stacked shapes, background first, that stand for the force on the Nexus Map (model/emblem.ts). */
  emblem?: EmblemLayer[];
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
  /** Most waves cleared in one training run (rules/training.ts). */
  trainingBest?: number;
  /** Training highlights, newest first (rules/training/tales.ts; TRAINING.records.keep). */
  tales?: ForceTale[];
  /** Drill Honour counts (rules/training/drillBank.ts): what unlocks luck, cards and perks in Training. */
  drill?: DrillStats;
  /** The Final-wave ladder in Training: veterancy, the Final open, Victories, Endless depth. */
  finale?: ForceFinale;
  /** Feats earned, by id, with the date (rules/feats.ts): each pays once. */
  feats?: Record<string, string>;
  /** Which feat rewards the force's feats were paid at (rules/feats.ts FEATS_VERSION; unset: the first). */
  featsV?: number;
  /** Relics no unit carries, ready to give to one with room (rules/relicVault.ts). */
  relicVault?: Relic[];
  /** Training-only relics (RelicDef.training) the force's feats have won, by name: any unit may take one for free. */
  trainingRelics?: string[];
  /** Furthest any unit got on one Sortie: nodes cleared (rules/sortie.ts). */
  sortieBest?: number;
  /** What the force's Sorties are remembered for (rules/sortie.ts). */
  sortie?: ForceSortie;
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

export type SectorType = 'home' | 'planet' | 'research' | 'void' | 'anomaly' | 'empty' | 'voidspawn' | 'archive';

/** A building under construction at a sector, and what was paid for it (so cancelling it refunds exactly that). */
export interface Construction {
  /** BUILDINGS id. */
  id: string;
  /** The round it was started in. */
  round: number;
  /** Materials paid (saved as `supply`). */
  supply: number;
  /** Umbra Shards paid, and the force that paid them. */
  shards: number;
  forceId?: string;
}

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
  /** Nexus Wars difficulty: the Supply of the AI garrison holding it, recalculated each round (rules/difficulty). On the
   *  biggest faction's scale; each faction faces its own rating (`ratings`). */
  difficulty?: number;
  /** The rating each faction faces here, scaled to its own total Supply (rules/difficulty ratingFor). */
  ratings?: Record<string, number>;
  /** Sector modifier ids (SECTOR_MODIFIERS) that favour its defender. */
  modifiers?: string[];
  /** Axial hex coordinates on the campaign map; unset = not placed. */
  q?: number;
  r?: number;
  /** Lore / description, shown on the map. */
  notes: string;
  /** Sector art as a downscaled data URL. */
  image?: string;
  /** BUILDINGS ids (nexusData.ts) raised here. They stay when the sector changes hands. */
  buildings?: string[];
  /** Materials banked here (planets and homes), spent on new units and buildings; lost when the sector changes hands. */
  bank?: number;
  /** A Building Expansion is installed here (Guardian loot): one more building slot. It stays when the sector changes hands. */
  core?: boolean;
  /** The round this sector's Grand Exchange was last used (once a round). */
  exchanged?: number;
  /** The building going up here: one at a time, finished when the round ends. Lost if the sector changes hands. */
  construction?: Construction;
  /** The Void Echoes hero guarding an AI-held point of interest (rules/guardians.ts). */
  guardian?: SectorGuardian;
  /** It rolled for a guardian and got none: it isn't rolled again. */
  unguarded?: boolean;
  /** Marauders raided it: it produces nothing in this round. */
  raided?: number;
  /** A downtime Project under way here (one per world). */
  project?: SectorProject;
  /** Units that garrisoned it lately, newest last (a few rounds are kept, so raid XP waits to be taken). */
  garrisons?: SectorGarrison[];
}

/** A Marauder band (rules/marauders.ts): raiders belonging to no one, always on the map. */
export interface Marauder {
  id: string;
  name: string;
  sectorId: string;
  /** The band's Supply: what the GM fields against a faction fighting it. It grows every round. */
  strength: number;
  /** The round it turned up in. */
  since: number;
  /** The faction world it's heading for, picked when the last round ended so everyone can see it coming. */
  target?: string;
  /** Barred from its road at the end of `round`: these factions' detachments at `sectorId` must fight it or pay its toll before the next round ends. */
  barred?: { sectorId: string; by: string[]; round: number };
}

export interface SectorGuardian {
  name: string;
  tier: RelicTier;
  unit: Unit;
}

export interface CampaignFaction {
  id: string;
  name: string;
  player: string;
  color: string;
  /** Research points not spent yet (the tech tree, rules/tech.ts). */
  research?: number;
  /** BUILDINGS ids researched (tier 1 is known without being listed). */
  techs?: string[];
  /** Guardian loot not used yet: Blueprints (a free tech) and Building Expansions (a planet's extra slot). */
  blueprints?: number;
  cores?: number;
  /** Archive unlocks not used yet (from a Lost Archive): research any one building, ignoring its requirements. */
  archives?: number;
  /** The faction's Warlord (rules/warlords.ts): a Hero in one of its forces. `level` is kept up to date from the unit's XP. */
  warlord?: Warlord;
  /** The Warlord's Path: chosen with the first Warlord, kept for good. */
  path?: string;
  /** The round its Warlord was lost: a new one can be named a round later. */
  warlordLost?: number;
  /** The Warlord it lost, so the GM can bring it back (a mistaken step-down). */
  fallenWarlord?: Warlord;
  /** Lasting marks its Crossroads Journals left: battle omens, sector effects, order changes, Warlord quirks. */
  marks?: JournalMark[];
  /** The journal pieces it has drawn lately (`ctx:`, `cat:`, `comp:`, `rew:`, `thr:` ids), newest last, so they don't come round again soon. */
  journalSeen?: string[];
  /** A story thread its journals are following (rules/journalData.ts JOURNAL_THREADS). */
  thread?: JournalThreadState;
  /** Sectors scouted by Recon units: seen in the round they were scouted and the next. */
  recon?: { round: number; sectorIds: string[] }[];
}

/** A story thread a faction's journals follow over several rounds: the step it's at, and the rival it names, if any. */
export interface JournalThreadState {
  id: string;
  step: number;
  since: number;
  factionId?: string;
}

/**
 * What a Crossroads Journal ending left behind. `battle`: an omen for the Warlord's next battle; `sector`: an effect on a
 * sector; `order`: a change to the Warlord's detachment's move; `quirk`: a habit or trait of the Warlord's own. Each holds
 * from round `from` to round `until` (a quirk with no `until` lasts as long as its Warlord).
 */
export interface JournalMark {
  id: string;
  journalId: string;
  kind: 'battle' | 'sector' | 'order' | 'quirk';
  name: string;
  text: string;
  good: boolean;
  from: number;
  until?: number;
  sectorId?: string;
  forceId?: string;
  unitId?: string;
  /** An order mark: hexes added to (or taken from) the detachment's move. */
  move?: number;
}

export interface Warlord {
  forceId: string;
  unitId: string;
  name: string;
  level: number;
  /** The round it was named. */
  since: number;  /** The unit's XP when the faction last changed Path: the Warlord's level counts only XP gained since. */
  xpBase?: number;
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
  /** An auto-battle's war stories: its most notable moments, a line each (rules/autoBattle.ts warStories). */
  stories?: string[];
  /** Not a game: the Void Echoes spread into the sector at the end of a round. */
  spread?: boolean;
  /** The campaign round it happened in. */
  round?: number;
  /** A skirmish: a game away from the map (no sector). Only wins are logged: they earn Strategic Assets, and against the Echoes count as patrols. */
  skirmish?: boolean;
  /** The Nexus Crisis battle (every faction against an Echo Lord): not a sector game, `sectorId` is where the Lord rose. */
  crisis?: boolean;
  /** What the game changed, so deleting the entry can put the sector back. */
  undo?: { owner?: string; rewardClaimed?: boolean; reinforced?: boolean; bank?: number; construction?: Construction; guardian?: SectorGuardian;
    /** The winner took a Lost Archive's Archive unlock. */
    archive?: boolean;
    /** Where detachments the game moved stood before (null: they had no position yet). */
    positions?: Record<string, ForcePosition | null> };
  /** The detachment that attacked: it moves into the sector when it takes or holds it. */
  forceId?: string;
  /** The slain guardian's loot (GUARDIAN_LOOT): what it gave, and to whom, so deleting the entry can take it back. */
  loot?: {
    roll: number; id: string; name: string; factionId: string; amount?: number;
    /** The bank Materials went to (the first, if they spilled into more: `banks` then holds each bank's share). */
    sectorId?: string; banks?: Record<string, number>;
  };
  /** A game against a Marauder band (not for the sector): the band as it was, so deleting a win brings it back. */
  marauder?: Marauder;
  /** Materials a band took off the faction for barring its road (lost the fight), so deleting the entry gives them back. */
  toll?: number;
}

/** A sector the Void Echoes are massing against: it falls when the round ends unless the line is held. */
export interface EchoMark {
  sectorId: string;
  /** The faction that broke it with a Battle won against the Echoes. */
  brokenBy?: string;
}

/** What each faction held when a round ended: round income is paid from this. */
export interface RoundSnapshot {
  round: number;
  date: string;
  /** Faction id → sector ids it held. */
  holdings: Record<string, string[]>;
  /** Faction id → catch-up Umbra Shards. */
  underdog: Record<string, number>;
  /** Held sectors as they were when the round ended, for any the map refresh changed (a space hulk that drifted off). */
  was?: Sector[];
  /** The Galactic Event that was active in the round (its income counts toward the round's income). */
  event?: string;
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
  /** Strategic Assets spent this round (cleared when the round ends, with any left unspent). */
  assetsSpent?: AssetUse[];
  /** Where the Void Echoes are massing: the sectors they take when `round` ends (rules/voidspawn.ts). */
  echoMarks?: { round: number; marks: EchoMark[] };
  /** The Galactic Event for a round (GALACTIC_EVENTS, nexusData.ts); it only counts while `round` is the current round. */
  event?: GalacticEventState;
  /** The Nexus Crisis: an Echo Lord every faction must fight together before the round ends. */
  crisis?: NexusCrisis;
  /** DIFFICULTY_LEVELS id (nexusData.ts): scales every sector rating; 'normal' when unset. */
  difficulty?: string;
  /** Fog of war: faction id → the sectors it has ever seen (rules/fog.ts). */
  explored?: Record<string, string[]>;
  /** Heroes offering to join a faction (rules/heroes.ts). */
  offers?: HeroOffer[];
  /** What happened each ended round, newest last (rules/report.ts). */
  reports?: TurnReport[];
  /** Where each detachment stands, by force id (rules/movement.ts). A force with none stands at its faction's home. */
  positions?: Record<string, ForcePosition>;
  /** Marauder bands on the map (rules/marauders.ts). */
  marauders?: Marauder[];
  /** The last round whose revealed moves the GM has applied. */
  movedOrders?: number;
  /** Meeting engagements for one orders round (rules/meetings.ts): each side's call and each fight's winner ('' a draw), by meeting key. */
  meetings?: { round: number; calls: Record<string, Record<string, MeetingCall>>; results: Record<string, string>;
    /** Auto-battled fights' war stories, by meeting key. */
    stories?: Record<string, string[]> };
  /** Nexus Duels: battles two players agreed to fight for a wager (rules/duels.ts). */
  duels?: NexusDuel[];
  /** Crossroads Journals: a short vignette for each faction's Warlord, once a round (rules/journal.ts). */
  journals?: CrossroadsJournal[];
  /** The weekly Sortie challenge: each force's best run of the last few weeks (rules/downtime.ts postWeekly). */
  sortieBoard?: SortieBoardEntry[];
  /** The Weekly Siege: each force's best Training siege of the last few weeks, and the settled winners (rules/training/siegeBoard.ts). */
  siegeBoard?: SiegeBoardEntry[];
  siegeWins?: SiegeWin[];
  /** Who's coming to the next game night (rules/gameNight.ts). */
  gameNight?: GameNight;
  /** The GM's Bounty Board: BOUNTY.slots bounties any faction can claim (rules/bounties.ts). */
  bounties?: Bounty[];
  /** Claimed bounties taken off the board, kept until their forces have been paid (the last BOUNTY.keepClaimed). */
  claimedBounties?: Bounty[];
}

export type BountyKind = 'band' | 'hold' | 'take' | 'topple' | 'guardian' | 'noHero' | 'void';

/** What a bounty pays. Materials to Blueprints go to the faction; Umbra Shards, relics and trait tokens to a force. */
export type BountyReward =
  | { kind: 'materials' | 'research' | 'blueprints' | 'cores' | 'archives' | 'shards' | 'traitToken'; n: number }
  | { kind: 'relic'; tier: RelicTier };

export interface Bounty {
  id: string;
  kind: BountyKind;
  /** 1–3: sets what it pays. */
  difficulty: number;
  /** The target, by kind: a sector, a Marauder band (named, so the board can still say who it was) or a faction. */
  sectorId?: string;
  bandId?: string;
  bandName?: string;
  factionId?: string;
  /** hold: the round ends to hold the sector through, and who holds it now and through how many. */
  rounds?: number;
  holder?: { factionId: string; ends: number };
  rewards: BountyReward[];
  /** The round it was posted in; games logged before it was posted (`skip`) don't count. */
  round: number;
  skip?: string[];
  claimed?: { factionId: string; forceId?: string; round: number; date: string; eventId?: string };
}

/** The evening's roll call: the factions whose players said they're coming, for a campaign round. */
export interface GameNight {
  round: number;
  coming: string[];
}

/** A check rolled in a Crossroads Journal: a D6 at or over `target`. `rolls` holds the first roll and any re-roll (the last one stands). */
export interface JournalRoll {
  skill: string;
  target: number;
  rolls: number[];
  pass: boolean;
}

/** One of the four endings offered (A–D). What it gives is fixed by its reward; a relic or scar it carries is drawn when it's offered. */
export interface JournalOption {
  rewardId: string;
  title: string;
  text: string;
  relic?: Relic;
  scar?: Scar;
}

/** A faction's Warlord's vignette for a round: a Context, a Catalyst and a Complication from the tables (journalData.ts). */
export interface CrossroadsJournal {
  id: string;
  factionId: string;
  round: number;
  date: string;
  forceId: string;
  unitId: string;
  warlord: string;
  context: string;
  catalyst: string;
  complication: string;
  /** The sector the Warlord stood in when it was dealt. */
  sectorId?: string;
  /** The GM's framing: a line of their own to set the scene. */
  note?: string;
  /** A hidden fourth beat (JOURNAL_TWISTS), revealed once the climax is rolled. */
  twist?: { id: string; roll?: JournalRoll };
  /** A rival Warlord who walks through the scene (flavour only). */
  rival?: { factionId: string; name: string };
  /** The faction's story thread, at the step this journal plays (`last`: this one ends it). */
  thread?: { id: string; step: number; last: boolean; factionId?: string };
  approach?: { id: string; roll: JournalRoll };
  /** The complication's choice; a risky one is rolled. */
  choice?: { id: string; roll?: JournalRoll };
  climax?: JournalRoll;
  /** The endings offered, once the checks are done. */
  options?: JournalOption[];
  /** Who wrote them: Claude, or the tables when it couldn't be reached. */
  source?: 'claude' | 'tables';
  /** The ending picked (an index into `options`). */
  picked?: number;
  pickedOn?: string;
}

/** What one side of a Nexus Duel puts up. Each count is taken from the side's faction (or force, for Umbra Shards). */
export interface DuelWager {
  shards?: number;
  materials?: number;
  research?: number;
  blueprints?: number;
  cores?: number;
  archives?: number;
  /** Relics carried by the side's force: a copy, so the winner gets it as it was. */
  relics?: (Relic & { unitId: string })[];
  /** Anything else agreed that the app doesn't move (a favour, a sector, a promise). */
  note?: string;
}

export interface DuelSide {
  factionId: string;
  forceId: string;
  wager: DuelWager;
  /** Happy with both wagers as they stand. Any change to either wager clears it. */
  agreed?: boolean;
}

/** A battle between two players for a wager. Open while they haggle; settled when the result is in. */
export interface NexusDuel {
  id: string;
  date: string;
  round: number;
  challenger: DuelSide;
  challenged: DuelSide;
  status: 'open' | 'settled';
  /** Once settled: the winning faction, or '' for a draw. */
  winner?: string;
  settledOn?: string;
}

/** Where a detachment stands on the Nexus map. */
export interface ForcePosition {
  sectorId: string;
  /** The faction it moved for: if the force has changed faction since, the position doesn't count. */
  factionId: string;
}

/** A wandering hero a faction can hire with Umbra Shards; it joins one of its forces for good. */
export interface HeroOffer {
  id: string;
  factionId: string;
  /** The round it turned up; it waits one more round, then leaves. */
  round: number;
  unit: Unit;
  /** Umbra Shards to hire it. */
  fee: number;
}

export interface TurnReportLine {
  icon: string;
  text: string;
  /** Only these factions are told about it (everyone when unset). */
  factions?: string[];
  /** Where it happened: players only read it when they can see the sector. */
  sectorId?: string;
  /** The logged game it tells of (a battle line). */
  eventId?: string;
}

export interface TurnReport {
  round: number;
  date: string;
  lines: TurnReportLine[];
}

export interface GalacticEventState {
  id: string;
  round: number;
  /** Warp Storm: the sectors that can't be attacked. */
  sectorIds?: string[];
}

export interface NexusCrisis {
  /** The round it must be fought in. */
  round: number;
  /** ECHO_LORDS id. */
  lord: string;
  /** Where the Lord rose (an Echo-held sector). */
  sectorId: string;
  result?: 'won' | 'lost';
  /** The force whose units earned the most XP in the battle. */
  mvp?: string;
  /** The tracked battle it was fought in. */
  battleId?: string;
}

/** A Strategic Asset a faction spent on the round's Battle. */
export interface AssetUse {
  id: string;
  round: number;
  factionId: string;
  /** StrategicAsset key (nexusData.ts). */
  asset: string;
  date: string;
  /** The detachment it was spent on (Forced March). */
  forceId?: string;
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

/** A side's pick when its detachment runs into another faction's on the map. */
export type MeetingCall = 'fight' | 'pass';
