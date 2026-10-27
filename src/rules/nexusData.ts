import type { BountyKind, SectorType } from '../model/types';
import type { RelicTier } from './data';

// Nexus Wars homebrew values: sector types, benefits, the Anomaly / Void tables, Combat Manipulations
// and the Umbra Shard shop. Tweak them here; the logic in nexus.ts reads everything from this file.
// (Benefit ids are stored on sectors in saved campaigns, so rename a benefit's name, not its id.)

export const SECTOR_TYPES: Record<SectorType, { label: string; desc: string }> = {
  home: { label: 'Home sector', desc: 'Each faction has one. It can be attacked but never controlled.' },
  planet: { label: 'Planet', desc: 'Gives one benefit to whoever controls it.' },
  research: { label: 'Research station', desc: 'Each round, unlock one Nexus Traits table until your next round income.' },
  void: { label: 'Void / Space hulk', desc: 'Defeat an AI opponent here for a one-off D10 reward. Salvage: +25 Supply each round while you hold it.' },
  anomaly: { label: 'Anomaly', desc: 'Roll a D10 on the Anomaly table each round.' },
  empty: { label: 'Empty space', desc: 'No benefit.' },
  archive: { label: 'Lost Archive', desc: "A guarded vault of forgotten designs; there's never more than one. Beat its garrison to take it and an Archive unlock: research any one building, even one whose requirements you don't know. Plundered, it fades from the map when the round ends." },
  voidspawn: { label: 'Voidspawn', desc: "The Void Echoes' home sector. It can be attacked but never controlled. When a round ends the Echoes spread from their territory; beating them here lowers their threat the most." },
};
export const SECTOR_TYPE_KEYS = Object.keys(SECTOR_TYPES) as SectorType[];

/** Sectors that can be attacked but never change hands. */
export const STRONGHOLDS: SectorType[] = ['home', 'voidspawn'];

/** The Void Echoes, the AI force: they hold the Voidspawns and spread from them. Their id is the AI's. */
export const ECHOES = { id: 'ai', name: 'Void Echoes', color: '#7d3cff' };
/** Sector types the Void Echoes never spread into (strongholds are never taken either). */
export const ECHOES_SKIP: SectorType[] = ['empty'];

export interface Benefit {
  id: string;
  type: 'home' | 'planet';
  name: string;
  desc: string;
}

export const BENEFITS: Benefit[] = [
  { id: 'largeShardMine', type: 'home', name: 'Large Shard Mine', desc: '+3 Umbra Shards each round.' },
  { id: 'researchStation', type: 'home', name: 'Research Station', desc: 'Unlock one Nexus Traits table permanently.' },
  { id: 'relicCollector', type: 'home', name: 'Relic Collector', desc: 'On a win, roll a D6: on a 6 gain a Common Relic. Nexus Relics cost 6 Umbra Shards less.' },
  { id: 'biomassPool', type: 'home', name: 'Biomass Pool', desc: '+100 Supply each round.' },
  { id: 'shardMine', type: 'planet', name: 'Shard Mine', desc: 'Each round, roll a D6: on a 3+ gain 3 Umbra Shards.' },
  { id: 'fertileLand', type: 'planet', name: 'Fertile Land', desc: '+50 Supply each round.' },
  { id: 'spacePort', type: 'planet', name: 'Militarized Space Port', desc: '1 free Combat Manipulation each round, for your next match.' },
];

/** The campaign round: income, catch-up and the Void Echoes' threat. */
export const NEXUS_ROUNDS = {
  /** The GM ends a round about twice a week (rounds never wait on table games); after this many days it's overdue. */
  overdueDays: 4,
  /** Umbra Shards for each match a force plays, at most `matchBonusMax` per round. */
  matchBonusUs: 3,
  matchBonusMax: 2,
  /** Catch-up: +`underdogUs` Umbra Shards per this many sectors behind the faction holding the most, up to `underdogMax` times. */
  underdogStep: 2,
  underdogMax: 3,
  underdogUs: 3,
  /** Rounds 1 to this: no home-sector challenges, and the Echoes only spread into unclaimed sectors. */
  graceRounds: 3,
  /** Threat starts here and stays between 0 and `threatMax`. */
  threatStart: 1,
  threatMax: 6,
  /** Each round's end: threat rises by this, and falls for every win against the Echoes that round. */
  threatPerRound: 1,
  threatPerWin: 1,
  threatPerVoidspawnWin: 2,
  /** A skirmish won against the Echoes (a patrol) lowers the threat by this. */
  threatPerPatrolWin: 1,
  /** Strategic Assets: one per skirmish win, at most this many a round. Unspent ones are lost when the round ends. */
  assetsMax: 2,
  /** Sectors the Echoes spread into when a round ends, by threat level (index 0 to threatMax). */
  spreadsByThreat: [0, 1, 1, 2, 2, 3, 3],
  /** The Echoes prefer sectors held by the faction with the most sectors: they weigh this many times more. */
  leaderWeight: 3,
  /** Salvage from a held Void / Space hulk sector, each round. */
  voidSupply: 25,
  /** Shard Mine: roll this or more on a D6 for `shardMineUs` Umbra Shards. */
  shardMineRoll: 3,
  shardMineUs: 3,
  /** Relic Collector: Nexus Relics cost this many fewer Umbra Shards. */
  relicCollectorDiscount: 6,
  /** How many ended rounds the campaign keeps, so players who miss a few can still claim their income. */
  keepRounds: 8,
};

/**
 * Echo marks (rules/voidspawn.ts): when a round begins, the sectors the Echoes will spread into at its end are marked on
 * the map (how many: NEXUS_ROUNDS.spreadsByThreat). A mark falls unless a detachment of the sector's faction stands there
 * when the round ends, or a faction that won a Battle against the Echoes this round breaks it.
 */
export const ECHO_MARKS = {
  /** Marks a faction may break for every Battle it won against the Echoes this round. */
  breaksPerWin: 1,
};

/** Nexus Duels: player-against-player battles for a wager (rules/duels.ts). */
export const NEXUS_DUELS = {
  /** Settled duels the campaign keeps to look back on. */
  keep: 10,
  /** …and how many it keeps whose forces may not have paid or collected their shards and relics yet. */
  keepOwed: 30,
};

/** Detachments: further forces linked to a faction that already has one. Each declares its own attack in the Battle. */
export const NEXUS_DETACHMENTS = {
  /** A detachment's Starting Supply: it gets its Supply from the faction's other forces when they reorganise. */
  startingSupply: 0,
  /** Umbra Shards to reorganise a faction's detachments (move Supply, shards and units between them), at most once a round. */
  reorganiseCost: 3,
};

export interface NexusTableEntry {
  text: string;
  us?: number;
  supply?: number;
  /** Materials: banked at the faction's producing sector nearest the battle. */
  materials?: number;
  xp?: number;
  removeScar?: boolean;
  unlockAll?: boolean;
  traitToken?: boolean;
  free?: string;
  nexusRelic?: boolean;
}

/** D10 (the die is the table's length; ROLL_SIDES in nexus.ts). */
export const ANOMALY_TABLE: NexusTableEntry[] = [
  { text: '+3 Umbra Shards', us: 3 },
  { text: '+6 Umbra Shards', us: 6 },
  { text: '+50 Supply and +100 Materials', supply: 50, materials: 100 },
  { text: '+100 Supply', supply: 100 },
  { text: 'Remove 1 battle scar from a unit', removeScar: true },
  { text: 'All Nexus tables unlocked until your next round income', unlockAll: true },
  { text: '+3 Umbra Shards, +50 Supply and +50 Materials', us: 3, supply: 50, materials: 50 },
  { text: 'A Nexus trait token (any Nexus trait when a unit levels up)', traitToken: true },
  { text: '+9 Umbra Shards', us: 9 },
  { text: '+100 Supply and +3 Umbra Shards', supply: 100, us: 3 },
];

export const VOID_TABLE: NexusTableEntry[] = [
  { text: '3 XP to distribute and +150 Materials', xp: 3, materials: 150 },
  { text: '6 XP to distribute and +3 Umbra Shards', xp: 6, us: 3 },
  { text: 'Upgrade one unit with any Nexus Trait when levelling up', traitToken: true },
  { text: '+6 Umbra Shards and +100 Materials', us: 6, materials: 100 },
  { text: 'One free weapon upgrade', free: 'Free weapon upgrade' },
  { text: 'A Common Nexus Relic (Rare if none is available)', nexusRelic: true },
  { text: '+100 Supply and +3 Umbra Shards', supply: 100, us: 3 },
  { text: 'One free upgrade', free: 'Free upgrade' },
  { text: '9 XP to distribute', xp: 9 },
  { text: 'Remove 1 battle scar from a unit and +3 Umbra Shards', removeScar: true, us: 3 },
];

export const COMBAT_MANIPULATIONS = [
  { name: 'Umbral Fog of War', desc: 'Up to 3 units may hold deployment.' },
  { name: 'From the Shadows', desc: 'One unit gains Ambush.' },
  { name: 'Bombardment', desc: 'At the end of round 1, one enemy unit takes 6 hits with AP(1).' },
  { name: 'Dark Shroud', desc: 'The first time one chosen unit takes wounds, ignore up to 3 of them.' },
];
export const MANIPULATION_PREFIX = 'Combat Manipulation';
/** What a faction can spend a Strategic Asset on, in the round's Battle. One Asset each. */
/** Supply Limit a Reinforced sector's defender gets (a Void Echoes stand-in too). */
export const NEXUS_REINFORCE_BONUS = 200;

/**
 * Detachments on the map: each of a faction's forces stands in one sector (its home until it moves) and moves up to
 * `base` hexes a round, through sectors its faction holds and unclaimed empty space. Moving into a sector held by
 * someone else, an unclaimed one worth having or a guarded one is an attack: the detachment ends its move there.
 *  beacon — a Hyperlane Beacon in or next to the sector it starts in;
 *  forcedMarch — the Forced March Strategic Asset, for one detachment and one round;
 *  min — Galactic Events (Ion Storm) never slow a detachment below this.
 */
export const NEXUS_MOVE = {
  base: 2,
  beacon: 1,
  forcedMarch: 1,
  min: 1,
};

export const STRATEGIC_ASSETS: { key: string; name: string; desc: string }[] = [
  { key: 'mission', name: 'Change of plans', desc: 'Re-roll the mission or the deployment of your Battle.' },
  { key: 'manipulation', name: 'Covert support', desc: '+1 Combat Manipulation in your Battle (pick it as if you had bought it).' },
  { key: 'reserve', name: 'Held in reserve', desc: 'One of your units gains Ambush for your Battle.' },
  { key: 'rerolls', name: 'Fortune favours', desc: '+2 re-rolls in your Battle: each re-rolls one die.' },
  { key: 'forcedMarch', name: 'Forced March', desc: `One of your detachments moves ${NEXUS_MOVE.forcedMarch} hex further this round.` },
  { key: 'tie', name: 'Right of way', desc: 'Win the tie when another faction attacks the same sector: you fight for it and their attack lapses. If both spend one, play a multiplayer battle.' },
];

export const ORGANIZED_STRIKE = 'Organized Strike';

/**
 * Nexus Relics by tier, in Umbra Shards on top of the relic's RP. The reward tables trade a Common Nexus relic for
 * 6–9 US, so a Common costs 9; Rare and Legendary climb with their power instead of one flat price for all three.
 */
export const NEXUS_RELIC_US: Record<RelicTier, number> = { Common: 9, Rare: 15, Legendary: 24 };

export type UmbraBuy = 'rp' | 'knowledge' | 'revive' | 'manipulation' | 'strike' | 'reinforce' | 'expansion' | 'relic' | 'evolution';
/**
 * Priced against a faction's income, about 8–14 US a round (2 match bonuses, sectors, reward rolls): small tactical
 * buys cost 3, lasting ones a round's income or more. 9 US is 1 RP, so 1 US is worth about 1 XP or 22 Supply.
 */
export const UMBRA_SHOP: { key: UmbraBuy; name: string; cost: number; desc: string }[] = [
  { key: 'rp', name: 'Requisition', cost: 9, desc: 'Convert into 1 RP.' },
  { key: 'knowledge', name: 'Umbral Knowledge', cost: 3, desc: '+3 XP to one unit.' },
  { key: 'revive', name: 'Umbral Revival', cost: 3, desc: 'Wake a comatose unit: it can fight in your next game instead of sitting it out.' },
  { key: 'manipulation', name: 'Combat Manipulation', cost: 3, desc: 'One tactical advantage for your next match.' },
  { key: 'strike', name: ORGANIZED_STRIKE, cost: 6, desc: '+200 Supply Limit once, when attacking a sector.' },
  { key: 'reinforce', name: 'Reinforce Sector', cost: 9, desc: '+200 Supply Limit when defending that sector. One per sector; lost if the sector changes hands.' },
  { key: 'expansion', name: 'Forced Expansion', cost: 15, desc: 'Take an uncontrolled sector without a match (no match rewards).' },
  { key: 'relic', name: 'Nexus Relic', cost: NEXUS_RELIC_US.Common, desc: `${NEXUS_RELIC_US.Common} / ${NEXUS_RELIC_US.Rare} / ${NEXUS_RELIC_US.Legendary} US for a Common / Rare / Legendary, bought together with the normal Crusade relic requisition (its RP cost too).` },
  { key: 'evolution', name: 'Umbral Evolution', cost: 36, desc: 'A free unique Nexus trait: BP goes up, but it does not use a level.' },
];

/**
 * The Nexus Wars map: its default size, how full it is, and the points of interest that turn up at the end of every round.
 * Points of interest are every sector type worth fighting over (planets, research stations, void sites and Anomalies);
 * the rest of the sectors are clear (empty) space.
 */
export const NEXUS_MAP = {
  /** A two-faction map is size × size hexes; each extra faction adds this many columns and rows. */
  size: 12,
  perExtraFaction: 2,
  /** Share of the hexes that hold a sector. */
  fill: 0.6,
  /** Share of those sectors that are points of interest; the rest (besides homes and the Voidspawn) are clear space. */
  poiShare: 0.4,
  /** Relative odds of each kind of point of interest, at generation and in the end-of-round refresh. */
  poiWeights: { planet: 3, research: 1, void: 1, anomaly: 1 } as Partial<Record<SectorType, number>>,
  /** New points of interest each round: this many in each faction's half of the map, and this many in the contested middle. */
  refreshPerFaction: 1,
  refreshContested: 1,
  /** When the round ends with no Lost Archive on the map, the odds one turns up in the contested middle. */
  archiveChance: 0.5,
};

/**
 * Sector difficulty: the Supply an AI garrison fields in an unclaimed or Echoes-held sector. It centres on `min` near the
 * homes and climbs to the strongest faction's total Supply × `maxFactor` at the far reaches, so players can punch above
 * their weight. Each sector then rolls up or down by up to `jitter`, so neighbours differ and players can pick their
 * fights. Rated when the map is generated and again at the end of every round.
 */
export const NEXUS_DIFFICULTY = {
  min: 800,
  maxFactor: 1.5,
  /** The top of the scale is always at least this far above `min`, even before any force joins a faction. */
  minSpread: 700,
  /** Each sector's rating rolls up or down by up to this much (in steps), never below `floor` or above the top. */
  jitter: 300,
  floor: 500,
  /** Ratings round to this many points. */
  step: 100,
  /** How much of the rating comes from distance to the nearest home (0–1); the type bonus adds to it. */
  distanceWeight: 0.8,
  typeBonus: { home: 0, planet: 0.05, research: 0.1, void: 0.2, anomaly: 0.15, empty: -0.1, voidspawn: 1, archive: 0.25 } as Record<SectorType, number>,
  /** Sectors rated at least this far up the scale get a second modifier. */
  hardAt: 0.6,
};

/** The GM's campaign difficulty: every sector rating (and the range they roll in) is multiplied by `scale`. */
export const DIFFICULTY_LEVELS: { id: string; name: string; scale: number }[] = [
  { id: 'easy', name: 'Easy', scale: 0.75 },
  { id: 'normal', name: 'Normal', scale: 1 },
  { id: 'hard', name: 'Hard', scale: 1.25 },
  { id: 'brutal', name: 'Brutal', scale: 1.5 },
];

/** Battlefield conditions that favour a sector's defender. Each sector rolls one (two when it's hard). */
export const SECTOR_MODIFIERS: { id: string; name: string; desc: string }[] = [
  { id: 'entrenched', name: 'Entrenched', desc: 'Defending units in their deployment zone get +1 to Defense rolls in round 1.' },
  { id: 'lurkers', name: 'Lurkers', desc: 'Up to two defending units gain Ambush.' },
  { id: 'fanatics', name: 'Fanatical Garrison', desc: 'Defending units get +1 to Morale tests.' },
  { id: 'regrowth', name: 'Echo-Flesh', desc: 'The defender’s toughest non-hero unit gains Regeneration.' },
  { id: 'veterans', name: 'Veteran Garrison', desc: 'Two defending units get +1 to hit in melee.' },
  { id: 'gunline', name: 'Prepared Firing Lines', desc: 'One defending shooting unit gets +1 to hit with shooting in rounds 1 and 2.' },
  { id: 'fog', name: 'Umbral Fog', desc: 'Attackers get −1 to hit when shooting at targets over 18″ away.' },
  { id: 'minefield', name: 'Minefields', desc: 'Place two 6″ areas of Dangerous terrain in no-man’s-land; the defender places them.' },
  { id: 'bastion', name: 'Fortified Objectives', desc: 'Defending units within 3″ of an objective get +1 to Defense rolls.' },
  { id: 'initiative', name: 'Home Ground', desc: 'The defender picks deployment zones and activates first in round 1.' },
  { id: 'tide', name: 'Endless Tide', desc: 'The first defending non-hero unit destroyed comes back once, at full strength, from the defender’s table edge at the start of the next round.' },
];

/**
 * Galactic Events: one is rolled (D12) for each new round when the GM ends the last one; the GM can re-roll it or pick
 * another. An event lasts its round. What each field does:
 *  battle — a rule every battle that round plays with (shown in the tracker);
 *  spread — extra sectors the Echoes spread into when the round ends (negative: fewer);
 *  threat — added to the Echoes' threat when the round ends;
 *  storm — this many random sectors are cut off: they can't be attacked that round;
 *  noHome — no home-sector challenges that round;
 *  income — added to every faction's income for the round;
 *  hulks — extra space hulks that drift into the contested middle when the round ends;
 *  move — added to how far every detachment moves that round (NEXUS_MOVE).
 * (Event ids are stored in saved campaigns, so rename an event's name, not its id.)
 */
export interface GalacticEvent {
  id: string;
  name: string;
  desc: string;
  battle?: string;
  spread?: number;
  threat?: number;
  storm?: number;
  noHome?: boolean;
  income?: { us?: number; supply?: number };
  hulks?: number;
  move?: number;
}

export const GALACTIC_EVENTS: GalacticEvent[] = [
  { id: 'warpCurrents', name: 'Warp Currents', desc: 'Fast currents run through the Nexus: every detachment moves 1 hex further this round.', move: 1 },
  { id: 'warpStorm', name: 'Warp Storm', desc: 'Two random sectors are swallowed by the storm: they can’t be attacked this round.', storm: 2 },
  { id: 'ceasefire', name: 'Ceasefire Accords', desc: 'The factions agree to leave each other’s homeworlds alone: no home-sector challenges this round.', noHome: true },
  { id: 'shardRush', name: 'Shard Rush', desc: 'Umbra seams surface everywhere: +3 Umbra Shards in every faction’s income for this round.', income: { us: 3 } },
  { id: 'convoys', name: 'Supply Convoys', desc: 'Merchant fleets brave the Nexus: +25 Supply in every faction’s income for this round.', income: { supply: 25 } },
  { id: 'echoSurge', name: 'Echo Surge', desc: 'The Echoes swell: they spread into 1 more sector when this round ends.', spread: 1 },
  { id: 'voidLull', name: 'Void Lull', desc: 'The Echoes fall silent: they don’t spread when this round ends (their threat still moves).', spread: -99 },
  { id: 'risingDark', name: 'Rising Dark', desc: 'Something vast stirs in the Voidspawn: the Echoes’ threat rises 1 more when this round ends.', threat: 1 },
  { id: 'glory', name: 'Glory Seekers', desc: 'Warriors fight to be remembered.', battle: 'Every unit that survives the battle earns +1 XP (add it as Bonus XP).' },
  { id: 'ionStorm', name: 'Ion Storm', desc: 'Charged clouds scatter targeting systems and slow the fleets: every detachment moves 1 hex less this round (at least 1).', move: -1, battle: 'Shooting at targets over 18″ away is at −1 to hit.' },
  { id: 'derelicts', name: 'Derelict Fleet', desc: 'A lost fleet drifts into the Nexus: 2 extra space hulks appear in the contested middle when this round ends.', hulks: 2 },
  { id: 'resonance', name: 'Nexus Resonance', desc: 'The Nexus hums with power.', battle: 'Casters get +1 to their casting rolls.' },
];

/**
 * The Nexus Crisis: every few rounds an Echo Lord rises in an Echo-held sector, and every faction must fight it together,
 * in one co-op battle against the AI, before the round ends.
 *  - Win: the Echoes' threat drops by `threatDrop` more, each force that fought gets `winUs` Umbra Shards, and the force
 *    whose units earned the most XP in the battle (the MVP) gets a `mvpTier` relic.
 *  - Lose, or don't fight it by the round's end: the Echoes take each faction's sector nearest the Lord, and their threat
 *    goes to its maximum.
 */
export const NEXUS_CRISIS = {
  /** A Crisis begins every this many rounds (rounds 4, 8, 12…)… */
  everyRounds: 4,
  /** …and can be fought for this many rounds (the round it rises and the next two). */
  window: 3,
  threatDrop: 2,
  winUs: 6,
  mvpTier: 'Legendary' as const,
  /** VP for destroying the Echo Lord (add it with the VP adjustment). */
  lordVp: 3,
};

/** The Echo Lords (D10). The Lord is the Echoes' most expensive unit in the Crisis battle, with these rules on top. (Ids are saved; rename names only.) */
export const ECHO_LORDS: { id: string; name: string; desc: string }[] = [
  { id: 'devourer', name: 'The Devourer', desc: 'Regeneration. Whenever it destroys a unit in melee, it heals D3 wounds.' },
  { id: 'hollowKing', name: 'The Hollow King', desc: 'Fear(2). Enemy units within 12″ get −1 to Morale tests.' },
  { id: 'stormHerald', name: 'The Storm Herald', desc: 'Caster(3). Once per round, one enemy unit within 18″ takes 6 hits with AP(1).' },
  { id: 'broodmother', name: 'The Broodmother', desc: 'At the end of each round, place a new unit of 5 of the Echoes’ cheapest infantry within 6″ of it.' },
  { id: 'umbralTitan', name: 'The Umbral Titan', desc: '+6 Tough, and Defense 2+ against shooting from over 12″ away.' },
  { id: 'whisperer', name: 'The Whisperer', desc: 'Ambush. Once per round, an enemy unit within 12″ that fails a Quality test is Shaken.' },
  { id: 'shardEater', name: 'The Shard Eater', desc: 'Gets +1 to hit for each enemy unit it has destroyed. Whoever destroys it gains +6 Umbra Shards (add them by hand).' },
  { id: 'nexusWarden', name: 'The Nexus Warden', desc: 'Shielded: Defense 2+ in the first round. Friendly Echoes within 6″ get +1 to Defense rolls while it lives.' },
  { id: 'mirrorWraith', name: 'The Mirror Wraith', desc: 'Stealth. Once per round, when an enemy unit shoots it, that unit takes one hit with AP(1) for each of its misses.' },
  { id: 'rift', name: 'The Living Rift', desc: 'Immobile. At the start of each round, one Echoes unit that was destroyed returns at half strength within 6″ of it.' },
];

/**
 * Fog of war: a faction sees its own sectors and every sector within `sight` hexes of them (`homeSight` from its home).
 * Sectors it has seen before stay on its map, but only their type and name: who holds them and how well is fogged.
 */
export const FOG = {
  sight: 1,
  homeSight: 2,
  /** A Watchtower adds this much sight to its sector. */
  watchtower: 1,
  /** …and a Listening Post this much. */
  listeningPost: 2,
  /** A detachment sees this far around the sector it's in. */
  forceSight: 1,
};


/**
 * Planet production: new units aren't bought, they're built. Each round, every planet and home sector a faction holds
 * banks Materials, and new units are produced at one of them, paid from its bank, 1 Material a point (they still need
 * room under the force's Supply Limit). Buildings are paid from the bank too. A bank is lost when the sector changes
 * hands. (Materials are saved as the sector's `bank`; Supply stays the force's population cap.)
 */
export const PRODUCTION = {
  /** Materials banked per round. */
  perRound: 300,
  /** …with Barracks. */
  barracks: 450,
  /** A bank holds at most this many rounds of production. */
  bankRounds: 4,
  /** Building slots per sector type. */
  slots: { home: 3, planet: 2 } as Partial<Record<SectorType, number>>,
  /** Slots a Building Expansion (Guardian loot) adds to the one planet it's installed on. One per planet. */
  coreSlots: 1,
  /** XP a unit produced at Training Grounds starts with. */
  trainingXp: 4,
  /** Supply a Supply Depot adds to the round income. */
  depotSupply: 50,
  /** Logistics Hub: the bank holds this many more rounds, and the sector banks this many more Materials a round. */
  logisticsRounds: 2,
  logisticsBonus: 50,
  /** Trade Hub: Materials a round for each other planet or home the faction holds within `range` hexes, up to `max`. */
  tradeHub: { perPlanet: 50, range: 2, max: 150 },
  /** Foundry: units produced here cost this much less. */
  foundryDiscount: 0.2,
  /** Vehicle Bay: units with Tough(`tough`) or more produced here cost `discount` less (stacks with the Foundry). */
  vehicleBay: { tough: 6, discount: 0.35 },
  /** Grand Exchange, once a round: `materials` Materials for `shards` Umbra Shards, or `shards` Umbra Shards for `back` Materials. */
  exchange: { materials: 150, back: 100, shards: 6 },
  /** Warp Gate: its sector attacks anything within this many hexes. */
  warpRange: 3,
  /** Umbral Spire: `us` Umbra Shards a round; the threat drops this much each round (however many Spires there are); the
   *  Echoes weigh its owner's sectors this much more. */
  spire: { us: 3, threat: 1, weight: 2 },
};

export type TechBranch = 'economy' | 'military' | 'fortification' | 'intelligence' | 'umbra';

/** The tech tree's branches, in the order they're shown. */
export const TECH_BRANCHES: { id: TechBranch; name: string; icon: string; desc: string }[] = [
  { id: 'economy', name: 'Economy', icon: '⛁', desc: 'More Materials, cheaper units.' },
  { id: 'military', name: 'Military', icon: '⚔', desc: 'Better units from your planets.' },
  { id: 'fortification', name: 'Fortification', icon: '⛫', desc: 'Make your sectors hard to take.' },
  { id: 'intelligence', name: 'Intelligence', icon: '👁', desc: 'See further, strike further.' },
  { id: 'umbra', name: 'Umbra', icon: '✶', desc: 'Bend the Nexus itself.' },
];

export interface Building {
  /** Saved on sectors and in factions' tech lists; rename `name`, not this. */
  id: string;
  name: string;
  icon: string;
  /** Materials from the sector's bank. */
  cost: number;
  /** Umbra Shards from one of the faction's forces. */
  shards: number;
  desc: string;
  branch: TechBranch;
  /** Tier 1 is known from the start; higher tiers are researched (NEXUS_TECH.cost). */
  tier: 1 | 2 | 3;
  /** Techs researched before this one can be (all of them). */
  requires?: string[];
  /** Only a home sector can build it. */
  homeOnly?: boolean;
  /** A faction can hold only one (counting one going up). */
  onePerFaction?: boolean;
  /** 'table': nothing for the app to do, the players apply it at the table (it's shown on the sector). */
  rule?: 'table';
}

/**
 * Hero offers: when a round ends, each faction without one may get a wandering hero, a random Hero datasheet from the
 * army books its forces use. It waits for the round it turns up and the one after, then leaves. Hiring costs Umbra
 * Shards and the hero joins a force for good, so it needs room under that force's Supply Limit.
 */
export const HERO_OFFERS = {
  /** Chance a faction without an offer gets one when a round ends. */
  chance: 0.5,
  /** Rounds an offer stays: the round it turns up and one more. */
  lasts: 2,
  /** Weights for the hero's starting level, 0 up. It starts with that level's XP. */
  levelWeights: [35, 30, 20, 10, 5],
  /** Chance it brings a relic (of a tier its XP allows). */
  relicChance: 0.5,
  /** Fee in Umbra Shards: base + perLevel × level + the relic's. */
  fee: { base: 3, perLevel: 3, relic: { Common: 3, Rare: 6, Legendary: 9 } },
  /** A Mercenary Hall: an offer every round, for this many Umbra Shards less (the base fee at least). */
  hallDiscount: 5,
};

/**
 * Buildings a faction raises on its planets and home. Each is paid for when it's started: `cost` Materials from the
 * sector's bank, `shards` Umbra Shards from one of the faction's forces. A sector builds one at a time, and it's
 * finished when the round ends (it works from the next round). Ids are saved; rename names only.
 *
 * Each building is a tech in its branch: tier 1 is known from the start, tiers 2 and 3 are researched (NEXUS_TECH).
 *
 * Balance: the cheap, small ones cost Materials only. The strong ones cost Umbra Shards too, priced against the Umbra
 * shop: Walls are a Reinforce Sector (9 US) that lasts, but uses a slot, Materials and a round, and the enemy keeps
 * them; Barracks raise a planet's production by half again; a Refinery mines 3 US on a 3+ (about 2 a round), so its
 * shards pay for themselves in about 3 rounds; Training Grounds give every unit made there what 1⅓ Umbral Knowledge
 * would. Tier 3 buildings are a campaign's late game: 300+ Materials and 6+ US, and the home-only ones compete for the
 * home's 3 slots.
 */
export const BUILDINGS: Building[] = [
  // Economy
  { id: 'depot', name: 'Supply Depot', icon: '⛁', cost: 200, shards: 0, branch: 'economy', tier: 1, desc: `+${PRODUCTION.depotSupply} Supply in the round income.` },
  { id: 'refinery', name: 'Shard Refinery', icon: '◆', cost: 250, shards: 6, branch: 'economy', tier: 1, desc: `A shard-mine roll in the round income (${NEXUS_ROUNDS.shardMineRoll}+: ${NEXUS_ROUNDS.shardMineUs} Umbra Shards).` },
  { id: 'logistics', name: 'Logistics Hub', icon: '⛟', cost: 200, shards: 0, branch: 'economy', tier: 1, desc: `+${PRODUCTION.logisticsBonus} Materials a round, and the bank holds ${PRODUCTION.logisticsRounds} more rounds of them.` },
  { id: 'tradeHub', name: 'Trade Hub', icon: '⚖', cost: 300, shards: 0, branch: 'economy', tier: 2, requires: ['depot'], desc: `+${PRODUCTION.tradeHub.perPlanet} Materials a round for each other planet or home you hold within ${PRODUCTION.tradeHub.range} hexes (up to +${PRODUCTION.tradeHub.max}).` },
  { id: 'beacon', name: 'Hyperlane Beacon', icon: '✧', cost: 200, shards: 3, branch: 'economy', tier: 2, requires: ['logistics'], desc: `Your detachments that start a round's move here or next to it move ${NEXUS_MOVE.beacon} hex further.` },
  { id: 'foundry', name: 'Foundry', icon: '⚙', cost: 250, shards: 3, branch: 'economy', tier: 2, requires: ['logistics'], desc: `Units produced here cost ${PRODUCTION.foundryDiscount * 100}% fewer Materials.` },
  { id: 'exchange', name: 'Grand Exchange', icon: '⇄', cost: 400, shards: 9, branch: 'economy', tier: 3, requires: ['tradeHub', 'foundry'], homeOnly: true, desc: `Once a round: trade ${PRODUCTION.exchange.materials} Materials for ${PRODUCTION.exchange.shards} Umbra Shards, or ${PRODUCTION.exchange.shards} Umbra Shards for ${PRODUCTION.exchange.back} Materials.` },
  // Military
  { id: 'barracks', name: 'Barracks', icon: '⚒', cost: 250, shards: 6, branch: 'military', tier: 1, desc: `Production rises to ${PRODUCTION.barracks} Materials a round.` },
  { id: 'training', name: 'Training Grounds', icon: '⚔', cost: 200, shards: 3, branch: 'military', tier: 1, desc: `Units produced here start with ${PRODUCTION.trainingXp} XP.` },
  { id: 'armoury', name: 'Armoury', icon: '🗡', cost: 250, shards: 6, branch: 'military', tier: 2, requires: ['barracks'], desc: 'Units produced here get one free weapon upgrade.' },
  { id: 'vehicleBay', name: 'Vehicle Bay', icon: '⛭', cost: 250, shards: 3, branch: 'military', tier: 2, requires: ['barracks'], desc: `Units with Tough(${PRODUCTION.vehicleBay.tough}) or more produced here cost ${PRODUCTION.vehicleBay.discount * 100}% fewer Materials.` },
  { id: 'medicae', name: 'Medicae Ward', icon: '✚', cost: 250, shards: 3, branch: 'military', tier: 2, requires: ['training'], desc: 'Remove one Battle Scar from a unit in the round income.' },
  { id: 'academy', name: 'War Academy', icon: '🎖', cost: 350, shards: 6, branch: 'military', tier: 3, requires: ['armoury', 'medicae'], homeOnly: true, desc: 'Units produced here also get one free trait (noted on the unit: take it on its unit sheet).' },
  // Fortification
  { id: 'walls', name: 'Walls', icon: '⛫', cost: 200, shards: 6, branch: 'fortification', tier: 1, desc: `The sector is permanently Reinforced: +${NEXUS_REINFORCE_BONUS} Supply Limit when defending it, and Marauders that raid it are thrown back.` },
  { id: 'militia', name: 'Militia Muster', icon: '⚑', cost: 150, shards: 0, branch: 'fortification', tier: 1, desc: 'Marauders that raid the sector are thrown back: they stop a hex short and take nothing.' },
  { id: 'artillery', name: 'Artillery Battery', icon: '☄', cost: 200, shards: 0, branch: 'fortification', tier: 2, requires: ['walls'], rule: 'table', desc: 'The defender here gets a free Bombardment: once per game, before round 1, one enemy unit takes 6 hits with AP(1).' },
  { id: 'bunker', name: 'Bunker Network', icon: '⛰', cost: 200, shards: 0, branch: 'fortification', tier: 2, requires: ['militia'], rule: 'table', desc: "The defender's units here start the game in cover, and one of them may Ambush." },
  { id: 'voidShield', name: 'Void Shield', icon: '◎', cost: 300, shards: 6, branch: 'fortification', tier: 3, requires: ['artillery', 'bunker'], rule: 'table', desc: 'Attackers here get −1 to hit when shooting in rounds 1 and 2.' },
  // Intelligence
  { id: 'watchtower', name: 'Watchtower', icon: '👁', cost: 100, shards: 0, branch: 'intelligence', tier: 1, desc: `Sight +${FOG.watchtower}: see further through the fog of war.` },
  { id: 'listeningPost', name: 'Listening Post', icon: '📡', cost: 150, shards: 0, branch: 'intelligence', tier: 2, requires: ['watchtower'], desc: `Sight +${FOG.listeningPost} (stacks with a Watchtower).` },
  { id: 'jammer', name: 'Signal Jammer', icon: '⌁', cost: 250, shards: 3, branch: 'intelligence', tier: 2, requires: ['watchtower'], rule: 'table', desc: "Attackers can't use Combat Manipulations against this sector or the sectors next to it." },
  { id: 'strategium', name: 'Strategium', icon: '♜', cost: 300, shards: 6, branch: 'intelligence', tier: 2, requires: ['watchtower'], homeOnly: true, desc: 'One more Strategic Asset every round, won skirmish or not.' },
  { id: 'warpGate', name: 'Warp Gate', icon: '⌬', cost: 400, shards: 9, branch: 'intelligence', tier: 3, requires: ['listeningPost', 'jammer'], onePerFaction: true, desc: `Your detachments can move or attack anywhere within ${PRODUCTION.warpRange} hexes of this one, from wherever they are. One per faction.` },
  // Umbra
  { id: 'observatory', name: 'Nexus Observatory', icon: '🔭', cost: 150, shards: 0, branch: 'umbra', tier: 1, desc: '+1 Research every round.' },
  { id: 'echoWard', name: 'Echo Ward', icon: '☉', cost: 300, shards: 6, branch: 'umbra', tier: 2, requires: ['observatory'], desc: `The ${ECHOES.name} can't spread into this sector or the sectors next to it.` },
  { id: 'mercHall', name: 'Mercenary Hall', icon: '⚜', cost: 250, shards: 3, branch: 'umbra', tier: 2, requires: ['observatory'], desc: `A wandering hero offer every round, and hiring costs ${HERO_OFFERS.hallDiscount} Umbra Shards less (${HERO_OFFERS.fee.base} at least).` },
  { id: 'spire', name: 'Umbral Spire', icon: '♆', cost: 500, shards: 12, branch: 'umbra', tier: 3, requires: ['echoWard', 'mercHall'], homeOnly: true, desc: `+${PRODUCTION.spire.us} Umbra Shards a round and the threat drops by ${PRODUCTION.spire.threat} every round (however many Spires there are), but the ${ECHOES.name} are ${PRODUCTION.spire.weight}× as likely to spread into your sectors.` },
];

/**
 * The tech tree. Every faction earns Research when a round ends: `perRound`, plus `perStation` for each research
 * station it holds, plus `perObservatory` for each Nexus Observatory. Tier 1 buildings are known from the start; a
 * tier 2 or 3 building is researched for `cost[tier]` Research once the techs it `requires` are, and then any of the
 * faction's planets can build it. A Blueprint (Guardian loot) researches one for free.
 */
export const NEXUS_TECH = {
  perRound: 2,
  perStation: 1,
  perObservatory: 1,
  cost: { 1: 0, 2: 3, 3: 6 } as Record<1 | 2 | 3, number>,
};

export interface GuardianLoot {
  /** Saved on the log entry; rename `name`, not this. */
  id: 'materials' | 'research' | 'blueprint' | 'core';
  name: string;
  desc: string;
  /** Materials into the bank / Research points. */
  amount?: number;
}

/**
 * Guardian loot: on top of the chance at its relic, a slain guardian drops one roll on this table, D10 plus its tier's bonus (10 at
 * most). Materials go to the faction's bank nearest the sector it guarded (spilling to the next when full). The
 * Building Expansion is the only way to give a planet a third building slot.
 */
/**
 * Marauders (rules/marauders.ts): raider bands that turn up at a round's end, after the opening rounds, while there are
 * fewer than `capByThreat[threat]`. Strengths are Supply, scaled by the campaign's difficulty level.
 */
export const MARAUDERS = {
  capByThreat: [0, 1, 1, 2, 2, 3, 3],
  spawnChance: 0.5,
  /** A new band comes out of the Voidspawn this often, otherwise from an unclaimed sector at the map's edge. */
  voidspawnChance: 0.3,
  /** A new band's Supply; it gains `grow` every round, up to `max`, and loses `repelLoss` (not below `min`) when thrown back. */
  start: 600,
  grow: 100,
  max: 2000,
  min: 400,
  repelLoss: 200,
  /** Hexes a band moves each round (always the same, so everyone can count when it arrives). */
  move: 2,
  /** A band barred from its road turns on whoever barred it: they fight it before the next round ends, or pay `toll` Materials (taken at that round's end if they've done neither). Losing the fight costs `lostToll`. */
  toll: 150,
  lostToll: 250,
  /** Most squads in a band an auto-battle fields. */
  squads: 5,
  /** The share of a world's bank a raid carries off. */
  steal: 0.5,
  /** How much less a defended world (Walls, Reinforce or a garrison) draws a band. */
  defendedWeight: 0.4,
  /** Beaten, a band rolls Guardian loot as Rare from this Supply, Legendary from that. */
  rareAt: 1000,
  legendaryAt: 1500,
  names: {
    adjective: ['Crimson', 'Ashen', 'Howling', 'Iron', 'Black', 'Rust', 'Grinning', 'Bleeding', 'Starving', 'Hollow', 'Gilded', 'Feral'],
    noun: ['Corsairs', 'Reavers', 'Jackals', 'Wreckers', 'Raiders', 'Butchers', 'Scavengers', 'Vultures', 'Brigands', 'Freebooters'],
  },
};

export const GUARDIAN_LOOT = {
  bonus: { Common: 0, Rare: 2, Legendary: 3 } as Record<'Common' | 'Rare' | 'Legendary', number>,
  table: [
    { id: 'materials', name: 'Salvaged Materials', amount: 100, desc: '+100 Materials to a bank.' },
    { id: 'materials', name: 'Cached Materials', amount: 150, desc: '+150 Materials to a bank.' },
    { id: 'research', name: 'Echo Archive', amount: 2, desc: '+2 Research.' },
    { id: 'research', name: 'Lost Schematics', amount: 3, desc: '+3 Research.' },
    { id: 'materials', name: 'Void Salvage', amount: 200, desc: '+200 Materials to a bank.' },
    { id: 'research', name: 'Echo Codex', amount: 4, desc: '+4 Research.' },
    { id: 'blueprint', name: 'Blueprint', desc: 'Research any one building whose requirements you have, for free.' },
    { id: 'materials', name: 'Echo Hoard', amount: 250, desc: '+250 Materials to a bank.' },
    { id: 'research', name: 'Nexus Archive', amount: 6, desc: '+6 Research.' },
    { id: 'core', name: 'Building Expansion', desc: `Install it on one of your planets: +${PRODUCTION.coreSlots} building slot there, for good. One per planet.` },
  ] as GuardianLoot[],
};

/**
 * Guardians: every AI-held planet, research station, anomaly, void sector and Lost Archive is guarded by a Void Echoes hero with a
 * relic and twice its Tough. Its tier follows the sector's threat (sectorThreat, 0–1): under `rare` Common, under
 * `legendary` Rare, Legendary above. Beat the garrison for a roll on GUARDIAN_LOOT; the guardian's relic is only taken
 * by a Hero (or Heroic Rise unit) that slays it and rolls `stealRoll`+ (players roll it; the app just records it).
 */
export const GUARDIANS = {
  types: ['planet', 'research', 'anomaly', 'void', 'archive'] as SectorType[],
  /** The chance a sector of those types gets a guardian. Each sector rolls once, the first time it's checked. */
  chance: 0.6,
  rare: 0.4,
  legendary: 0.75,
  /** The guardian's Tough is multiplied by this (a hero without Tough gets Tough(2)). */
  toughFactor: 2,
  /** XP the guardian has, so its relic tier is legal. */
  xp: { Common: 20, Rare: 60, Legendary: 90 },
  /** D6 a Hero (or a unit with Heroic Rise) that slays the guardian needs to take its relic: the Stealing Relics rule. */
  stealRoll: 3,
  titles: ['the Hollow', 'the Unbound', 'of the Last Light', 'the Shard-Eater', 'the Whispering', 'the Starless', 'of the Ninth Echo', 'the Undying', 'the Pale', 'Who Was Once'],
  names: ['Vaelrith', 'Orsk', 'Myrrhena', 'Calvaxis', 'Thul', 'Ezhrael', 'Nocturn', 'Isk-Arreth', 'Seraphon', 'Ghaul'],
};

export type WarlordPathId = 'architect' | 'conqueror' | 'warmaster' | 'shadow' | 'reaver';
export type WarlordPerkId =
  | 'cheapBuild' | 'research' | 'homeSlot'
  | 'march' | 'onslaught' | 'blitz'
  | 'drilled' | 'strategist' | 'veterans'
  | 'scouts' | 'unseen' | 'spymaster'
  | 'plunder' | 'bounty' | 'warlust';

/**
 * Warlords (rules/warlords.ts): each faction names one Hero from its forces its Warlord, on a Path it keeps for good.
 * The Path's perks unlock as the Warlord levels up (at `levels`). Lose the Warlord (killed for good, or its force leaves
 * the faction) and the perks go with it; a new one can be named `replaceAfter` rounds later. (Path and perk ids are
 * saved in campaigns: rename names, not ids.)
 */
export const WARLORDS = {
  levels: [1, 3, 5],
  replaceAfter: 1,
  /** Architect: buildings cost this share less. */
  buildDiscount: 0.25,
  research: 1,
  homeSlots: 1,
  /** Conqueror: extra move. */
  march: 1,
  blitz: 1,
  /** Warmaster: XP produced units start with. */
  drilledXp: 3,
  veteransXp: 7,
  assets: 1,
  /** Shadow: extra sight; how much less a Shadow faction's worlds draw marauders. */
  scouts: 1,
  spymaster: 1,
  unseenWeight: 0.5,
  /** Reaver: Umbra Shards on top of a win by the Warlord's force. */
  plunder: 3,
  warlust: 3,
  paths: [
    { id: 'architect', name: 'Architect', icon: '🏗', desc: 'A builder: cheaper buildings, faster research, a bigger home.', perks: [
      { id: 'cheapBuild', name: 'Master Builder', desc: 'Buildings cost 25% fewer Materials.' },
      { id: 'research', name: 'Visionary', desc: '+1 Research a round.' },
      { id: 'homeSlot', name: 'Grand Design', desc: '+1 building slot at the home sector.' },
    ] },
    { id: 'conqueror', name: 'Conqueror', icon: '⚔', desc: 'Leads from the front: faster detachments, harder fighting.', perks: [
      { id: 'march', name: 'Spearhead', desc: "+1 move for the Warlord's detachment." },
      { id: 'onslaught', name: 'Onslaught', desc: "In auto-battles, the Warlord gets +1 to hit and its force +1 to Morale tests." },
      { id: 'blitz', name: 'Blitzkrieg', desc: "+1 move for every detachment of the faction (the Warlord's too)." },
    ] },
    { id: 'warmaster', name: 'Warmaster', icon: '🎖', desc: 'Raises armies: produced units come trained, and plans are sharper.', perks: [
      { id: 'drilled', name: 'Drill Sergeant', desc: 'Units produced start with +3 XP.' },
      { id: 'strategist', name: 'Strategist', desc: '+1 Strategic Asset every round.' },
      { id: 'veterans', name: 'Veteran Cadre', desc: 'Units produced start with +7 more XP (+10 in all: a level).' },
    ] },
    { id: 'shadow', name: 'Shadow', icon: '👁', desc: 'Sees all, is seen little: wider sight, and raiders look elsewhere.', perks: [
      { id: 'scouts', name: 'Pathfinders', desc: 'Detachments see 1 hex further.' },
      { id: 'unseen', name: 'Unseen', desc: "Marauders are half as drawn to the faction's worlds." },
      { id: 'spymaster', name: 'Spymaster', desc: 'Every held sector sees 1 hex further.' },
    ] },
    { id: 'reaver', name: 'Reaver', icon: '💀', desc: 'Lives for plunder: more Umbra Shards, richer spoils.', perks: [
      { id: 'plunder', name: 'Plunder', desc: "+3 Umbra Shards when the Warlord's force wins a game." },
      { id: 'bounty', name: 'Headhunter', desc: 'A beaten marauder band rolls its loot one tier higher.' },
      { id: 'warlust', name: 'Warlust', desc: "+3 more Umbra Shards when the Warlord's force wins (+6 in all)." },
    ] },
  ] as { id: WarlordPathId; name: string; icon: string; desc: string; perks: { id: WarlordPerkId; name: string; desc: string }[] }[],
};

/** Game Night Planner (rules/gameNight.ts): how the evening's tables are set. */
export const GAME_NIGHT = {
  /** Points for a table with nothing to go by (a player with no detachment linked). */
  fallbackPoints: 1000,
  /** Table points round down to this. */
  step: 50,
};

/**
 * The GM's Bounty Board (rules/bounties.ts). Bounties are dealt from BOUNTY_KINDS; what one pays is worth `budget` (by
 * difficulty, in Umbra Shards, the Crossroads Journal yardstick journalData effectValue), in up to `maxRewards` rewards.
 */
export const BOUNTY = {
  /** Off for now: the tab, its rules and round-end bounties are hidden until the board is reworked. */
  enabled: false,
  slots: 5,
  budget: [0, 3, 6, 10],
  maxRewards: 2,
  /** What a bounty can pay, and the step amounts come in. */
  rewards: [
    { kind: 'materials', step: 25 },
    { kind: 'research', step: 1 },
    { kind: 'blueprints', step: 1 },
    { kind: 'cores', step: 1 },
    { kind: 'archives', step: 1 },
    { kind: 'shards', step: 1 },
    { kind: 'traitToken', step: 1 },
    { kind: 'relic', step: 1 },
  ] as const,
  /** hold: the round ends to hold through, by difficulty. */
  holdRounds: [0, 1, 2, 3],
  /** Claimed bounties kept off the board, so a force not yet paid still is. */
  keepClaimed: 30,
};

export const BOUNTY_KINDS: { id: BountyKind; name: string; desc: string; difficulty?: number }[] = [
  { id: 'band', name: 'Break the band', desc: 'Beat {band} in a Marauder game.' },
  { id: 'hold', name: 'Take and hold', desc: 'Hold {sector} through {rounds}.' },
  { id: 'take', name: 'Seize the sector', desc: 'Win an attack on {sector}.' },
  { id: 'topple', name: 'Topple the leader', desc: 'Beat {faction} in any game.', difficulty: 2 },
  { id: 'guardian', name: 'Slay the guardian', desc: 'Beat {guardian}, the guardian of {sector}.' },
  { id: 'noHero', name: 'No heroes', desc: 'Win a game tracked in the battle tracker with no Hero in your army.', difficulty: 2 },
  { id: 'void', name: 'Into the Void', desc: 'Beat the Void Echoes at their Voidspawn, {sector}.', difficulty: 3 },
];

/**
 * Overrun (rules/overrun.ts): a detachment may settle an attack on a weak AI garrison by auto-battle instead of at
 * the table. It reaches garrisons up to `share` of its Supply Limit, and `upper` of what it has past `knee`, so
 * 1000 → 700, 2000 → 1400, 4000 → 3000. Rounded down to `step`.
 */
export const OVERRUN = { share: 0.7, upper: 0.8, knee: 2000, step: 100 };
