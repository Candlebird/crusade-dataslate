import type { SectorType } from '../model/types';

// Nexus Wars homebrew values: sector types, benefits, the Anomaly / Void tables, Combat Manipulations
// and the Umbra Shard shop. Tweak them here; the logic in nexus.ts reads everything from this file.
// (Benefit ids are stored on sectors in saved campaigns, so rename a benefit's name, not its id.)

export const SECTOR_TYPES: Record<SectorType, { label: string; desc: string }> = {
  home: { label: 'Home sector', desc: 'Each faction has one. It can be attacked but never controlled.' },
  planet: { label: 'Planet', desc: 'Gives one benefit to whoever controls it.' },
  research: { label: 'Research station', desc: 'Each round, unlock one Nexus Traits table until your next round income.' },
  void: { label: 'Void / Space hulk', desc: 'Defeat an AI opponent here for a one-off D6 reward. Salvage: +25 Supply each round while you hold it.' },
  anomaly: { label: 'Anomaly', desc: 'Roll a D6 on the Anomaly table each round.' },
  empty: { label: 'Empty space', desc: 'No benefit.' },
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
  { id: 'largeShardMine', type: 'home', name: 'Large Shard Mine', desc: '+1 Umbra Shard each round.' },
  { id: 'researchStation', type: 'home', name: 'Research Station', desc: 'Unlock one Nexus Traits table permanently.' },
  { id: 'relicCollector', type: 'home', name: 'Relic Collector', desc: 'On a win, roll a D6: on a 6 gain a Common Relic. Nexus Relics cost 3 Umbra Shards less.' },
  { id: 'biomassPool', type: 'home', name: 'Biomass Pool', desc: '+100 Supply each round.' },
  { id: 'shardMine', type: 'planet', name: 'Shard Mine', desc: 'Each round, roll a D6: on a 3+ gain 1 Umbra Shard.' },
  { id: 'fertileLand', type: 'planet', name: 'Fertile Land', desc: '+50 Supply each round.' },
  { id: 'spacePort', type: 'planet', name: 'Militarized Space Port', desc: '1 free Combat Manipulation each round, for your next match.' },
];

/** The campaign round: income, catch-up and the Void Echoes' threat. */
export const NEXUS_ROUNDS = {
  /** Umbra Shards for each match a force plays, at most `matchBonusMax` per round. */
  matchBonusUs: 1,
  matchBonusMax: 2,
  /** Catch-up: +1 Umbra Shard per this many sectors behind the faction holding the most, up to `underdogMax`. */
  underdogStep: 2,
  underdogMax: 3,
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
  /** Shard Mine: roll this or more on a D6 for 1 Umbra Shard. */
  shardMineRoll: 3,
  /** Relic Collector: Nexus Relics cost this many fewer Umbra Shards. */
  relicCollectorDiscount: 3,
  /** How many ended rounds the campaign keeps, so players who miss a few can still claim their income. */
  keepRounds: 8,
};

/** Detachments: further forces linked to a faction that already has one. Each declares its own attack in the Battle. */
export const NEXUS_DETACHMENTS = {
  /** A detachment's Starting Supply: it gets its Supply from the faction's other forces when they reorganise. */
  startingSupply: 0,
  /** Umbra Shards to reorganise a faction's detachments (move Supply, shards and units between them), at most once a round. */
  reorganiseCost: 1,
};

export interface NexusTableEntry {
  text: string;
  us?: number;
  supply?: number;
  xp?: number;
  removeScar?: boolean;
  unlockAll?: boolean;
  traitToken?: boolean;
  free?: string;
  nexusRelic?: boolean;
}

export const ANOMALY_TABLE: NexusTableEntry[] = [
  { text: '+1 Umbra Shard', us: 1 },
  { text: '+2 Umbra Shards', us: 2 },
  { text: '+50 Supply', supply: 50 },
  { text: '+100 Supply', supply: 100 },
  { text: 'Remove 1 battle scar from a unit', removeScar: true },
  { text: 'All Nexus tables unlocked until your next round income', unlockAll: true },
];

export const VOID_TABLE: NexusTableEntry[] = [
  { text: '3 XP to distribute', xp: 3 },
  { text: '6 XP to distribute and +1 Umbra Shard', xp: 6, us: 1 },
  { text: 'Upgrade one unit with any Nexus Trait when levelling up', traitToken: true },
  { text: '+2 Umbra Shards', us: 2 },
  { text: 'One free weapon upgrade', free: 'Free weapon upgrade' },
  { text: 'A Common Nexus Relic (Rare if none is available)', nexusRelic: true },
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

export const STRATEGIC_ASSETS: { key: string; name: string; desc: string }[] = [
  { key: 'mission', name: 'Change of plans', desc: 'Re-roll the mission or the deployment of your Battle.' },
  { key: 'manipulation', name: 'Covert support', desc: '+1 Combat Manipulation in your Battle (pick it as if you had bought it).' },
  { key: 'reserve', name: 'Held in reserve', desc: 'One of your units gains Ambush for your Battle.' },
  { key: 'rerolls', name: 'Fortune favours', desc: '+2 re-rolls in your Battle: each re-rolls one die.' },
  { key: 'tie', name: 'Right of way', desc: 'Win the tie when another faction attacks the same sector: you fight for it and their attack lapses. If both spend one, play a multiplayer battle.' },
];

export const ORGANIZED_STRIKE = 'Organized Strike';

export type UmbraBuy = 'rp' | 'knowledge' | 'manipulation' | 'strike' | 'reinforce' | 'expansion' | 'relic' | 'evolution';
export const UMBRA_SHOP: { key: UmbraBuy; name: string; cost: number; desc: string }[] = [
  { key: 'rp', name: 'Requisition', cost: 3, desc: 'Convert into 1 RP.' },
  { key: 'knowledge', name: 'Umbral Knowledge', cost: 1, desc: '+3 XP to one unit.' },
  { key: 'manipulation', name: 'Combat Manipulation', cost: 1, desc: 'One tactical advantage for your next match.' },
  { key: 'strike', name: ORGANIZED_STRIKE, cost: 2, desc: '+200 Supply Limit once, when attacking a sector.' },
  { key: 'reinforce', name: 'Reinforce Sector', cost: 3, desc: '+200 Supply Limit when defending that sector. One per sector; lost if the sector changes hands.' },
  { key: 'expansion', name: 'Forced Expansion', cost: 5, desc: 'Take an uncontrolled sector without a match (no match rewards).' },
  { key: 'relic', name: 'Nexus Relic', cost: 6, desc: 'Bought together with the normal Crusade relic requisition (its RP cost too).' },
  { key: 'evolution', name: 'Umbral Evolution', cost: 12, desc: 'A free unique Nexus trait: BP goes up, but it does not use a level.' },
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
};

/**
 * Sector difficulty: the Supply an AI garrison fields in an unclaimed or Echoes-held sector. It runs from `min` near the
 * homes up to the strongest faction's total Supply × `maxFactor` at the far reaches, so players can punch above their
 * weight. Rated when the map is generated and again at the end of every round.
 */
export const NEXUS_DIFFICULTY = {
  min: 800,
  maxFactor: 1.5,
  /** Ratings round to this many points. */
  step: 50,
  /** How much of the rating comes from distance to the nearest home (0–1); the type bonus adds to it. */
  distanceWeight: 0.8,
  typeBonus: { home: 0, planet: 0.05, research: 0.1, void: 0.2, anomaly: 0.15, empty: -0.1, voidspawn: 1 } as Record<SectorType, number>,
  /** Sectors rated at least this far up the scale get a second modifier. */
  hardAt: 0.6,
};

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
 *  hulks — extra space hulks that drift into the contested middle when the round ends.
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
}

export const GALACTIC_EVENTS: GalacticEvent[] = [
  { id: 'quiet', name: 'Quiet Stars', desc: 'Nothing stirs between the stars. No effect this round.' },
  { id: 'warpStorm', name: 'Warp Storm', desc: 'Two random sectors are swallowed by the storm: they can’t be attacked this round.', storm: 2 },
  { id: 'ceasefire', name: 'Ceasefire Accords', desc: 'The factions agree to leave each other’s homeworlds alone: no home-sector challenges this round.', noHome: true },
  { id: 'shardRush', name: 'Shard Rush', desc: 'Umbra seams surface everywhere: +1 Umbra Shard in every faction’s income for this round.', income: { us: 1 } },
  { id: 'convoys', name: 'Supply Convoys', desc: 'Merchant fleets brave the Nexus: +25 Supply in every faction’s income for this round.', income: { supply: 25 } },
  { id: 'echoSurge', name: 'Echo Surge', desc: 'The Echoes swell: they spread into 1 more sector when this round ends.', spread: 1 },
  { id: 'voidLull', name: 'Void Lull', desc: 'The Echoes fall silent: they don’t spread when this round ends (their threat still moves).', spread: -99 },
  { id: 'risingDark', name: 'Rising Dark', desc: 'Something vast stirs in the Voidspawn: the Echoes’ threat rises 1 more when this round ends.', threat: 1 },
  { id: 'glory', name: 'Glory Seekers', desc: 'Warriors fight to be remembered.', battle: 'Every unit that survives the battle earns +1 XP (add it as Bonus XP).' },
  { id: 'ionStorm', name: 'Ion Storm', desc: 'Charged clouds scatter targeting systems.', battle: 'Shooting at targets over 18″ away is at −1 to hit.' },
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
  /** A Crisis begins every this many rounds (rounds 3, 6, 9…). */
  everyRounds: 3,
  threatDrop: 2,
  winUs: 2,
  mvpTier: 'Legendary' as const,
  /** VP for destroying the Echo Lord (add it with the VP adjustment). */
  lordVp: 3,
};

/** The Echo Lords (D6). The Lord is the Echoes' most expensive unit in the Crisis battle, with these rules on top. (Ids are saved; rename names only.) */
export const ECHO_LORDS: { id: string; name: string; desc: string }[] = [
  { id: 'devourer', name: 'The Devourer', desc: 'Regeneration. Whenever it destroys a unit in melee, it heals D3 wounds.' },
  { id: 'hollowKing', name: 'The Hollow King', desc: 'Fear(2). Enemy units within 12″ get −1 to Morale tests.' },
  { id: 'stormHerald', name: 'The Storm Herald', desc: 'Caster(3). Once per round, one enemy unit within 18″ takes 6 hits with AP(1).' },
  { id: 'broodmother', name: 'The Broodmother', desc: 'At the end of each round, place a new unit of 5 of the Echoes’ cheapest infantry within 6″ of it.' },
  { id: 'umbralTitan', name: 'The Umbral Titan', desc: '+6 Tough, and Defense 2+ against shooting from over 12″ away.' },
  { id: 'whisperer', name: 'The Whisperer', desc: 'Ambush. Once per round, an enemy unit within 12″ that fails a Quality test is Shaken.' },
];
