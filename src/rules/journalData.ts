import type { SectorType } from '../model/types';
import type { RelicTier } from './data';

// Crossroads Journal (Nexus Wars): a short vignette for a faction's Warlord, dealt once a round. Its pieces are drawn
// from the tables below: a Context (where it happens, picked to suit the sector the Warlord's detachment stands in), a
// Catalyst (what happens, with the approaches the Warlord can take and the climax), and a Complication (a dilemma).
// Each check is a Skill tested against the Warlord's Quality or Defense, like any OPR roll. At the end the result is
// tallied and four rewards from the loot tables are offered as choices A–D (one at least gives nothing, or worse).
// The logic is in journal.ts; the panel is components/Journal.tsx.

export const JOURNAL = {
  /** Most a skill's special rules can help a check (+1 each). */
  maxBonus: 2,
  /** A Warlord of this level or higher gets +1 on Command checks. */
  commandLevel: 3,
  /** Umbra Shards to re-roll a check (once per check). */
  rerollCost: 1,
  /** The best reward tier a scenario can earn with no successes (the tier cap is the successes, but at least this). */
  minTier: 1,
  /** How many finished journals the campaign keeps. */
  keep: 24,
} as const;

export type JournalSkillId = 'might' | 'resolve' | 'guile' | 'endurance' | 'speed' | 'lore' | 'command';

export interface JournalSkill {
  id: JournalSkillId;
  name: string;
  /** The stat it's tested against: roll a D6 at or over it. */
  stat: 'quality' | 'defense';
  /** Special rules that give +1 (`min`: only at that rating or higher, e.g. Tough(6)). */
  bonuses: { rule: string; min?: number }[];
  desc: string;
}

export const JOURNAL_SKILLS: JournalSkill[] = [
  { id: 'might', name: 'Might', stat: 'quality', bonuses: [{ rule: 'Tough', min: 3 }, { rule: 'Furious' }, { rule: 'Rending' }], desc: 'Force, strength and violence.' },
  { id: 'resolve', name: 'Resolve', stat: 'quality', bonuses: [{ rule: 'Fearless' }, { rule: 'Hero' }], desc: 'Nerve, faith and will.' },
  { id: 'guile', name: 'Guile', stat: 'quality', bonuses: [{ rule: 'Scout' }, { rule: 'Stealth' }, { rule: 'Ambush' }], desc: 'Cunning, deceit and staying unseen.' },
  { id: 'endurance', name: 'Endurance', stat: 'defense', bonuses: [{ rule: 'Tough', min: 6 }, { rule: 'Regeneration' }], desc: 'Weathering harm, hunger and the void.' },
  { id: 'speed', name: 'Speed', stat: 'quality', bonuses: [{ rule: 'Fast' }, { rule: 'Flying' }, { rule: 'Strider' }], desc: 'Getting there first, or getting away.' },
  { id: 'lore', name: 'Lore', stat: 'quality', bonuses: [{ rule: 'Caster' }], desc: 'Knowledge, tech-craft and the arcane.' },
  { id: 'command', name: 'Command', stat: 'quality', bonuses: [], desc: 'Leading, bargaining and being obeyed.' },
];

export interface JournalContext {
  id: string;
  name: string;
  text: string;
  /** Sector types it suits; none = anywhere. */
  types?: SectorType[];
  tags: string[];
}

export const JOURNAL_CONTEXTS: JournalContext[] = [
  { id: 'throneHall', name: 'The cold throne hall', text: 'Deep in the home citadel, during the night watch, while petitioners wait in the dark.', types: ['home'], tags: ['court', 'politics', 'home'] },
  { id: 'musterField', name: 'The muster fields', text: 'On the parade grounds below the citadel, the morning a fresh levy is sworn in.', types: ['home', 'planet'], tags: ['military', 'home'] },
  { id: 'hiveUnderworks', name: 'The hive underworks', text: 'Kilometres below a crowded hive-spire, where the lights fail and the gangs rule.', types: ['planet'], tags: ['urban', 'crime', 'salvage'] },
  { id: 'harvestWorld', name: 'A drowned harvest world', text: 'On a farming world flooded by a broken weather engine, as the last crops rot.', types: ['planet'], tags: ['people', 'supply', 'nature'] },
  { id: 'cogitatorVault', name: 'A sealed cogitator vault', text: 'Inside a research station, behind blast doors that have not opened in a century.', types: ['research', 'archive'], tags: ['tech', 'knowledge'] },
  { id: 'dustArchive', name: 'The dust archive', text: 'Among endless shelves of data-slates, where the archivists speak only in whispers.', types: ['archive', 'research'], tags: ['knowledge', 'lore'] },
  { id: 'driftingHulk', name: 'A drifting hulk', text: 'Aboard a dead warship tumbling through the void, its reactor still faintly warm.', types: ['void', 'empty'], tags: ['void', 'salvage', 'tech'] },
  { id: 'starlessReach', name: 'The starless reach', text: 'In the empty dark between sectors, a day from any help, as the drive stutters.', types: ['empty', 'void'], tags: ['void', 'isolation'] },
  { id: 'anomalyEdge', name: 'The edge of the anomaly', text: 'Where space folds wrong, and every chronometer aboard disagrees.', types: ['anomaly'], tags: ['warp', 'strange', 'void'] },
  { id: 'echoScar', name: 'An Echo-scarred moon', text: 'On a moon the Void Echoes passed over, its people gone and its shadows long.', types: ['voidspawn', 'anomaly'], tags: ['echoes', 'horror', 'void'] },
  { id: 'warCamp', name: 'The war camp', text: 'In the detachment’s forward camp, the night before it moves on.', tags: ['military', 'camp'] },
  { id: 'feastHall', name: 'A victory feast', text: 'At the feast after the last battle, as the wine runs and tongues loosen.', tags: ['court', 'people', 'celebration'] },
  { id: 'stormLanding', name: 'A storm-wracked landing', text: 'On a landing field lashed by ion storms, with half the auspex blind.', tags: ['danger', 'military', 'nature'] },
  { id: 'shrineRuin', name: 'A ruined shrine', text: 'In the shell of an old temple, where the faithful of a dead creed still gather.', tags: ['faith', 'lore', 'people'] },
];

export interface JournalApproach {
  id: string;
  label: string;
  skill: JournalSkillId;
  text: string;
  tags: string[];
}

export interface JournalCatalyst {
  id: string;
  name: string;
  text: string;
  tags: string[];
  /** The loot tables it fits best. */
  tables: JournalTableId[];
  /** How the Warlord can take it on: the first check. */
  approaches: JournalApproach[];
  /** The final check: the player picks one of the skills. */
  climax: { text: string; skills: JournalSkillId[] };
}

export const JOURNAL_CATALYSTS: JournalCatalyst[] = [
  {
    id: 'derelictSignal', name: 'A derelict’s signal', tags: ['salvage', 'tech', 'void'], tables: ['salvage', 'knowledge'],
    text: 'An old distress beacon starts up again, repeating a code no one has used since before the Nexus opened.',
    approaches: [
      { id: 'board', label: 'Board it and take what’s there', skill: 'might', tags: ['bold', 'salvage'], text: 'Cut through the hull and clear it deck by deck.' },
      { id: 'decode', label: 'Decode the signal first', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Spend the hours to learn what the beacon is really saying.' },
      { id: 'shadow', label: 'Watch who else comes for it', skill: 'guile', tags: ['cunning', 'intel'], text: 'Hide nearby and let rivals spring any traps.' },
    ],
    climax: { text: 'Something in the hulk wakes as you reach its core.', skills: ['might', 'endurance', 'lore'] },
  },
  {
    id: 'rivalEnvoy', name: 'A rival’s envoy', tags: ['politics', 'court', 'intel'], tables: ['knowledge', 'glory'],
    text: 'An envoy from another faction arrives under a flag of truce, asking to speak to the Warlord alone.',
    approaches: [
      { id: 'parley', label: 'Hear them out', skill: 'command', tags: ['diplomacy', 'honour'], text: 'Receive the envoy with every courtesy and bargain hard.' },
      { id: 'spy', label: 'Have them watched', skill: 'guile', tags: ['cunning', 'intel'], text: 'Smile, and set your agents on every one of their retinue.' },
      { id: 'test', label: 'Test their nerve', skill: 'resolve', tags: ['pride', 'intimidation'], text: 'Make them wait, then meet them armed in the trophy hall.' },
    ],
    climax: { text: 'The envoy’s true offer — or threat — comes out at last.', skills: ['command', 'guile', 'resolve'] },
  },
  {
    id: 'shardFall', name: 'A shard-fall', tags: ['void', 'umbra', 'race'], tables: ['void', 'relics'],
    text: 'A streak of black fire crosses the sky and comes down nearby: a raw lump of Umbra crystal, still singing.',
    approaches: [
      { id: 'race', label: 'Race to the crater', skill: 'speed', tags: ['bold', 'race'], text: 'Take the fastest troops and get there before anyone else.' },
      { id: 'secure', label: 'Seal the area first', skill: 'command', tags: ['military', 'careful'], text: 'Throw a cordon round it and move in methodically.' },
      { id: 'attune', label: 'Listen to its song', skill: 'lore', tags: ['arcane', 'warp'], text: 'Approach alone, and try to understand what it wants.' },
    ],
    climax: { text: 'The crystal reacts to your touch.', skills: ['endurance', 'lore', 'resolve'] },
  },
  {
    id: 'mutiny', name: 'Whispers of mutiny', tags: ['military', 'loyalty', 'people'], tables: ['glory', 'salvage'],
    text: 'Officers in the detachment are muttering; the last orders cost too many lives, and someone is stoking it.',
    approaches: [
      { id: 'address', label: 'Address the troops', skill: 'command', tags: ['honour', 'leadership'], text: 'Stand before the whole detachment and answer them.' },
      { id: 'rootOut', label: 'Find the ringleader', skill: 'guile', tags: ['cunning', 'intel'], text: 'Work quietly through informants and old favours.' },
      { id: 'example', label: 'Make an example', skill: 'might', tags: ['ruthless', 'fear'], text: 'Discipline must be seen to be done.' },
    ],
    climax: { text: 'The ringleader moves before you are ready.', skills: ['might', 'command', 'resolve'] },
  },
  {
    id: 'lostArchive', name: 'A forbidden index', tags: ['knowledge', 'lore', 'tech'], tables: ['knowledge', 'relics'],
    text: 'A scholar brings a cracked index-slate listing a vault that, officially, never existed.',
    approaches: [
      { id: 'study', label: 'Study the index', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Cross-reference every entry before moving.' },
      { id: 'force', label: 'Break the vault open', skill: 'might', tags: ['bold', 'salvage'], text: 'Melta-charges are a kind of key.' },
      { id: 'bribe', label: 'Buy the keeper', skill: 'command', tags: ['diplomacy', 'trade'], text: 'Every guardian has a price.' },
    ],
    climax: { text: 'The vault’s last ward stirs.', skills: ['lore', 'endurance', 'guile'] },
  },
  {
    id: 'echoWhisper', name: 'A voice from the Echoes', tags: ['echoes', 'warp', 'horror'], tables: ['void', 'peril'],
    text: 'The Warlord begins to hear a voice in the static, offering knowledge of where the Void Echoes will strike next.',
    approaches: [
      { id: 'listen', label: 'Listen, carefully', skill: 'resolve', tags: ['risk', 'warp'], text: 'Hear what it has to say without giving it anything.' },
      { id: 'trace', label: 'Trace the voice', skill: 'lore', tags: ['knowledge', 'intel'], text: 'Find where it is truly coming from.' },
      { id: 'silence', label: 'Silence it', skill: 'endurance', tags: ['faith', 'denial'], text: 'Shut it out, whatever it costs.' },
    ],
    climax: { text: 'The voice makes its bargain plain.', skills: ['resolve', 'endurance', 'guile'] },
  },
  {
    id: 'refugees', name: 'A column of refugees', tags: ['people', 'supply', 'honour'], tables: ['salvage', 'glory'],
    text: 'Thousands of refugees reach the detachment’s lines, fleeing something they will not name.',
    approaches: [
      { id: 'shelter', label: 'Take them in', skill: 'command', tags: ['honour', 'mercy'], text: 'Organise food, shelter and order.' },
      { id: 'question', label: 'Find out what they fled', skill: 'guile', tags: ['intel', 'careful'], text: 'Listen at the campfires.' },
      { id: 'press', label: 'Press the able into service', skill: 'might', tags: ['ruthless', 'military'], text: 'Every hand can hold a lasgun.' },
    ],
    climax: { text: 'What they fled catches up with them.', skills: ['might', 'speed', 'command'] },
  },
  {
    id: 'duelChallenge', name: 'A champion’s challenge', tags: ['honour', 'glory', 'military'], tables: ['glory', 'relics'],
    text: 'A famed champion of a broken warband calls out the Warlord by name, for single combat.',
    approaches: [
      { id: 'accept', label: 'Accept, openly', skill: 'might', tags: ['honour', 'bold'], text: 'Meet them before both hosts.' },
      { id: 'study', label: 'Study their style', skill: 'lore', tags: ['careful', 'knowledge'], text: 'Watch their old bouts first.' },
      { id: 'cheat', label: 'Stack the odds', skill: 'guile', tags: ['cunning', 'ruthless'], text: 'A drugged cup, a weakened blade.' },
    ],
    climax: { text: 'The duel itself.', skills: ['might', 'speed', 'endurance'] },
  },
  {
    id: 'saboteur', name: 'Sabotage in the works', tags: ['tech', 'industry', 'intel'], tables: ['salvage', 'knowledge'],
    text: 'A forge-line explodes, then another. Someone is sabotaging the faction’s industry.',
    approaches: [
      { id: 'repair', label: 'Save the forges', skill: 'lore', tags: ['tech', 'careful'], text: 'Get the lines running before the damage spreads.' },
      { id: 'hunt', label: 'Hunt the saboteur', skill: 'speed', tags: ['bold', 'intel'], text: 'Chase down every lead before the trail goes cold.' },
      { id: 'lockdown', label: 'Lock everything down', skill: 'command', tags: ['military', 'order'], text: 'No one moves without your seal.' },
    ],
    climax: { text: 'The saboteur is cornered — and armed.', skills: ['might', 'guile', 'speed'] },
  },
  {
    id: 'oracle', name: 'The blind oracle', tags: ['faith', 'warp', 'lore'], tables: ['knowledge', 'void'],
    text: 'A blind oracle has foretold the Warlord’s death, and the troops have heard.',
    approaches: [
      { id: 'consult', label: 'Seek the oracle out', skill: 'resolve', tags: ['faith', 'risk'], text: 'Face the prophecy in person.' },
      { id: 'discredit', label: 'Discredit the prophecy', skill: 'guile', tags: ['cunning', 'politics'], text: 'Show the troops that it is a fraud.' },
      { id: 'decipher', label: 'Read the omen yourself', skill: 'lore', tags: ['knowledge', 'arcane'], text: 'Old texts may say what the oracle really saw.' },
    ],
    climax: { text: 'The foretold hour arrives.', skills: ['resolve', 'endurance', 'lore'] },
  },
  {
    id: 'beastHunt', name: 'A void-beast loose', tags: ['danger', 'nature', 'void'], tables: ['relics', 'glory'],
    text: 'Something has got loose from a cargo hold: a void-beast, and it is feeding.',
    approaches: [
      { id: 'hunt', label: 'Hunt it yourself', skill: 'might', tags: ['bold', 'glory'], text: 'Lead the hunt from the front.' },
      { id: 'trap', label: 'Set a trap', skill: 'guile', tags: ['cunning', 'careful'], text: 'Bait it somewhere you choose.' },
      { id: 'track', label: 'Track it to its lair', skill: 'speed', tags: ['careful', 'nature'], text: 'Follow the trail before it goes cold.' },
    ],
    climax: { text: 'The beast turns at bay.', skills: ['might', 'endurance', 'speed'] },
  },
  {
    id: 'smugglers', name: 'Smugglers’ offer', tags: ['crime', 'trade', 'salvage'], tables: ['salvage', 'void'],
    text: 'A smuggler captain offers a hold full of contraband — weapons, Umbra, and stranger things — for the right price.',
    approaches: [
      { id: 'haggle', label: 'Haggle', skill: 'command', tags: ['trade', 'diplomacy'], text: 'Drive the price down.' },
      { id: 'seize', label: 'Seize the ship', skill: 'might', tags: ['ruthless', 'bold'], text: 'Why pay at all?' },
      { id: 'inspect', label: 'Inspect the cargo', skill: 'lore', tags: ['careful', 'tech'], text: 'Make sure it’s what they claim.' },
    ],
    climax: { text: 'The smugglers try something.', skills: ['guile', 'speed', 'might'] },
  },
];

export interface JournalChoice {
  id: string;
  label: string;
  text: string;
  tags: string[];
  /** A risky choice: roll this skill. Pass and it counts as a success; fail and the climax is harder. A choice without
   * a skill is the safe one: no roll, no success, no penalty. */
  skill?: JournalSkillId;
}

export interface JournalComplication {
  id: string;
  name: string;
  text: string;
  choices: [JournalChoice, JournalChoice];
}

export const JOURNAL_COMPLICATIONS: JournalComplication[] = [
  {
    id: 'clock', name: 'The clock is running', text: 'An enemy fleet is inbound. You have hours, not days.',
    choices: [
      { id: 'push', label: 'Push on regardless', skill: 'speed', tags: ['bold', 'risk'], text: 'Finish it before they arrive.' },
      { id: 'cut', label: 'Take what you can and go', tags: ['careful', 'retreat'], text: 'Leave the rest behind.' },
    ],
  },
  {
    id: 'hostage', name: 'A hostage', text: 'One of your officers has been taken, and is being used as a shield.',
    choices: [
      { id: 'rescue', label: 'Get them out', skill: 'guile', tags: ['honour', 'mercy'], text: 'No one is left behind.' },
      { id: 'abandon', label: 'They knew the risks', tags: ['ruthless', 'sacrifice'], text: 'The mission comes first.' },
    ],
  },
  {
    id: 'betrayal', name: 'A trusted aide turns', text: 'Someone close to the Warlord has been feeding information to the enemy.',
    choices: [
      { id: 'confront', label: 'Confront them now', skill: 'resolve', tags: ['honour', 'loyalty'], text: 'Look them in the eye.' },
      { id: 'feed', label: 'Feed them lies', tags: ['cunning', 'intel'], text: 'Let them keep talking — and listen.' },
    ],
  },
  {
    id: 'wounded', name: 'Wounded', text: 'The Warlord is hurt early — a shard of shrapnel, a poisoned blade.',
    choices: [
      { id: 'endure', label: 'Fight through it', skill: 'endurance', tags: ['bold', 'pain'], text: 'There is no time to bleed.' },
      { id: 'rest', label: 'Fall back and recover', tags: ['careful', 'retreat'], text: 'Let a lieutenant carry on.' },
    ],
  },
  {
    id: 'rivalArrives', name: 'A rival arrives', text: 'Another faction’s detachment arrives with the same goal.',
    choices: [
      { id: 'outpace', label: 'Beat them to it', skill: 'speed', tags: ['race', 'bold'], text: 'Whoever gets there first wins.' },
      { id: 'share', label: 'Strike a truce', tags: ['diplomacy', 'trade'], text: 'Split the prize and part ways.' },
    ],
  },
  {
    id: 'voidStorm', name: 'A void storm', text: 'Warp-lightning cracks across the sky; machines fail and minds wander.',
    choices: [
      { id: 'brave', label: 'Brave the storm', skill: 'endurance', tags: ['risk', 'warp'], text: 'Keep moving through it.' },
      { id: 'shelter', label: 'Shelter and wait', tags: ['careful', 'patience'], text: 'Lose time, keep lives.' },
    ],
  },
  {
    id: 'oldDebt', name: 'An old debt', text: 'Someone from the Warlord’s past turns up, owed a favour that can’t wait.',
    choices: [
      { id: 'honour', label: 'Honour the debt', skill: 'command', tags: ['honour', 'loyalty'], text: 'Split your attention, keep your word.' },
      { id: 'refuse', label: 'Refuse them', tags: ['ruthless', 'pride'], text: 'The past stays in the past.' },
    ],
  },
  {
    id: 'collapse', name: 'The ground gives way', text: 'The structure groans; it is coming down, with you in it.',
    choices: [
      { id: 'dash', label: 'Run for it', skill: 'speed', tags: ['bold', 'escape'], text: 'Through the falling rubble.' },
      { id: 'dig', label: 'Brace and dig out later', tags: ['careful', 'patience'], text: 'Lose a day, but live.' },
    ],
  },
  {
    id: 'temptation', name: 'A temptation', text: 'Along the way, something precious is left unguarded. Taking it would cost nothing — now.',
    choices: [
      { id: 'resist', label: 'Leave it be', skill: 'resolve', tags: ['faith', 'honour'], text: 'Some prizes are bait.' },
      { id: 'take', label: 'Take it', tags: ['greed', 'risk'], text: 'Fortune favours the bold.' },
    ],
  },
];

export type JournalTableId = 'salvage' | 'knowledge' | 'void' | 'glory' | 'relics' | 'peril';

export const JOURNAL_TABLES: { id: JournalTableId; name: string }[] = [
  { id: 'salvage', name: 'Salvage & supply' },
  { id: 'knowledge', name: 'Knowledge & secrets' },
  { id: 'void', name: 'The void & Umbra' },
  { id: 'glory', name: 'Glory & renown' },
  { id: 'relics', name: 'Relics' },
  { id: 'peril', name: 'Peril & loss' },
];

/** What a reward does. Materials, Research, Blueprints, Building Expansions, Archive unlocks, threat and revealed
 * sectors change the campaign; Umbra Shards, XP, relics, scars and trait tokens change the Warlord's force. */
export type JournalEffect =
  | { kind: 'materials'; n: number }
  | { kind: 'research'; n: number }
  | { kind: 'blueprints'; n: number }
  | { kind: 'cores'; n: number }
  | { kind: 'archives'; n: number }
  | { kind: 'threat'; n: number }
  | { kind: 'reveal'; n: number }
  | { kind: 'shards'; n: number }
  | { kind: 'xp'; n: number }
  | { kind: 'relic'; tier: RelicTier }
  | { kind: 'scar' }
  | { kind: 'traitToken'; n: number };

export interface JournalReward {
  id: string;
  name: string;
  desc: string;
  /** How good it is: 1–3, and 0 or less for nothing or worse. A scenario can only offer rewards up to its tier cap. */
  tier: number;
  table: JournalTableId;
  tags: string[];
  effects: JournalEffect[];
}

export const JOURNAL_REWARDS: JournalReward[] = [
  // Peril & loss: nothing at all, or a price paid.
  { id: 'nothing', name: 'Nothing but the tale', desc: 'No reward — only a story to tell.', tier: 0, table: 'peril', tags: ['retreat', 'careful', 'patience'], effects: [] },
  { id: 'hardLesson', name: 'A hard lesson', desc: 'The Warlord gains 2 XP but takes a battle scar.', tier: 0, table: 'peril', tags: ['pain', 'bold', 'risk'], effects: [{ kind: 'xp', n: 2 }, { kind: 'scar' }] },
  { id: 'shardDrain', name: 'Shards spent', desc: 'Lose 2 Umbra Shards.', tier: -1, table: 'peril', tags: ['umbra', 'trade', 'greed'], effects: [{ kind: 'shards', n: -2 }] },
  { id: 'openWound', name: 'A wound that won’t close', desc: 'The Warlord takes a battle scar.', tier: -1, table: 'peril', tags: ['pain', 'danger', 'horror'], effects: [{ kind: 'scar' }] },
  { id: 'followed', name: 'Something followed you back', desc: 'Void Echoes threat +1.', tier: -1, table: 'peril', tags: ['echoes', 'warp', 'horror', 'void'], effects: [{ kind: 'threat', n: 1 }] },
  { id: 'raided', name: 'Stores raided', desc: 'Lose 30 banked Materials.', tier: -1, table: 'peril', tags: ['crime', 'betrayal', 'supply'], effects: [{ kind: 'materials', n: -30 }] },
  // Salvage & supply.
  { id: 'scrapHaul', name: 'Scrap haul', desc: '+25 Materials.', tier: 1, table: 'salvage', tags: ['salvage', 'tech', 'supply'], effects: [{ kind: 'materials', n: 25 }] },
  { id: 'taintedCache', name: 'A tainted cache', desc: '+60 Materials, but Void Echoes threat +1.', tier: 1, table: 'salvage', tags: ['salvage', 'greed', 'echoes', 'risk'], effects: [{ kind: 'materials', n: 60 }, { kind: 'threat', n: 1 }] },
  { id: 'supplyCache', name: 'Hidden supply cache', desc: '+50 Materials.', tier: 2, table: 'salvage', tags: ['supply', 'people', 'trade'], effects: [{ kind: 'materials', n: 50 }] },
  { id: 'foundryCore', name: 'An intact foundry core', desc: '+1 Building Expansion.', tier: 3, table: 'salvage', tags: ['industry', 'tech', 'salvage'], effects: [{ kind: 'cores', n: 1 }] },
  // Knowledge & secrets.
  { id: 'starCharts', name: 'Star charts', desc: 'Reveal the 3 nearest sectors the faction hasn’t seen.', tier: 1, table: 'knowledge', tags: ['intel', 'void', 'careful'], effects: [{ kind: 'reveal', n: 3 }] },
  { id: 'fieldNotes', name: 'Field notes', desc: '+2 Research.', tier: 1, table: 'knowledge', tags: ['knowledge', 'careful', 'lore'], effects: [{ kind: 'research', n: 2 }] },
  { id: 'datacore', name: 'A recovered datacore', desc: '+4 Research.', tier: 2, table: 'knowledge', tags: ['knowledge', 'tech'], effects: [{ kind: 'research', n: 4 }] },
  { id: 'blueprint', name: 'Stolen schematics', desc: '+1 Blueprint (a free tech).', tier: 2, table: 'knowledge', tags: ['tech', 'intel', 'cunning'], effects: [{ kind: 'blueprints', n: 1 }] },
  { id: 'spyNetwork', name: 'A spy network', desc: 'Reveal the 6 nearest unseen sectors and +2 Research.', tier: 2, table: 'knowledge', tags: ['intel', 'cunning', 'politics'], effects: [{ kind: 'reveal', n: 6 }, { kind: 'research', n: 2 }] },
  { id: 'archiveKey', name: 'An archive key', desc: '+1 Archive unlock (research any building, ignoring requirements).', tier: 3, table: 'knowledge', tags: ['knowledge', 'lore', 'arcane'], effects: [{ kind: 'archives', n: 1 }] },
  // The void & Umbra.
  { id: 'splinters', name: 'Umbra splinters', desc: '+1 Umbra Shard.', tier: 1, table: 'void', tags: ['umbra', 'void'], effects: [{ kind: 'shards', n: 1 }] },
  { id: 'shardVein', name: 'A shard vein', desc: '+3 Umbra Shards.', tier: 2, table: 'void', tags: ['umbra', 'void', 'salvage'], effects: [{ kind: 'shards', n: 3 }] },
  { id: 'voidBargain', name: 'A bargain with the void', desc: '+5 Umbra Shards, but Void Echoes threat +1.', tier: 2, table: 'void', tags: ['warp', 'echoes', 'greed', 'risk'], effects: [{ kind: 'shards', n: 5 }, { kind: 'threat', n: 1 }] },
  { id: 'sealedRift', name: 'A rift sealed', desc: 'Void Echoes threat −1.', tier: 2, table: 'void', tags: ['echoes', 'faith', 'honour', 'denial'], effects: [{ kind: 'threat', n: -1 }] },
  { id: 'echoBane', name: 'The Echoes driven back', desc: 'Void Echoes threat −1 and +2 Umbra Shards.', tier: 3, table: 'void', tags: ['echoes', 'glory', 'faith'], effects: [{ kind: 'threat', n: -1 }, { kind: 'shards', n: 2 }] },
  // Glory & renown.
  { id: 'renown', name: 'Renown', desc: 'The Warlord gains 2 XP.', tier: 1, table: 'glory', tags: ['glory', 'honour', 'leadership'], effects: [{ kind: 'xp', n: 2 }] },
  { id: 'legend', name: 'A legend grows', desc: 'The Warlord gains 4 XP.', tier: 2, table: 'glory', tags: ['glory', 'bold', 'military'], effects: [{ kind: 'xp', n: 4 }] },
  { id: 'nexusInsight', name: 'Nexus insight', desc: '+1 trait token (any Nexus trait when a unit levels up).', tier: 2, table: 'glory', tags: ['warp', 'arcane', 'knowledge'], effects: [{ kind: 'traitToken', n: 1 }] },
  { id: 'loyalty', name: 'Unshakeable loyalty', desc: 'The Warlord gains 3 XP and +20 Materials from grateful followers.', tier: 2, table: 'glory', tags: ['loyalty', 'people', 'mercy'], effects: [{ kind: 'xp', n: 3 }, { kind: 'materials', n: 20 }] },
  // Relics.
  { id: 'trinket', name: 'A curious trinket', desc: 'A random Common relic for the Warlord.', tier: 2, table: 'relics', tags: ['salvage', 'arcane', 'tech'], effects: [{ kind: 'relic', tier: 'Common' }] },
  { id: 'bloodPrice', name: 'Paid in blood', desc: 'A random Rare relic for the Warlord, but it takes a battle scar.', tier: 2, table: 'relics', tags: ['pain', 'risk', 'ruthless', 'glory'], effects: [{ kind: 'relic', tier: 'Rare' }, { kind: 'scar' }] },
  { id: 'heirloom', name: 'A lost heirloom', desc: 'A random Rare relic for the Warlord.', tier: 3, table: 'relics', tags: ['honour', 'glory', 'lore'], effects: [{ kind: 'relic', tier: 'Rare' }] },
  { id: 'cursedArtefact', name: 'A cursed artefact', desc: 'A random Legendary relic for the Warlord, but Void Echoes threat +2.', tier: 3, table: 'relics', tags: ['warp', 'horror', 'greed', 'arcane'], effects: [{ kind: 'relic', tier: 'Legendary' }, { kind: 'threat', n: 2 }] },
];
