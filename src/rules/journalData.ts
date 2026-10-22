import type { SectorType } from '../model/types';
import type { RelicTier } from './data';
import { CONTEXTS_TABLE } from './journalTables/contexts';
import { CATALYSTS_TABLE } from './journalTables/catalysts';
import { COMPLICATIONS_TABLE } from './journalTables/complications';
import { REWARDS_TABLE } from './journalTables/rewards';
import { TWISTS_TABLE } from './journalTables/twists';

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
  keep: 24, keepOwed: 48,
  /** Chance a journal gets a twist (one more check after the climax). */
  twistChance: 0.15,
  /** Chance a rival Warlord (another faction's) walks through the scene, when there is one. */
  rivalChance: 0.12,
  /** Chance a faction with no story thread starts one; and that an open thread comes back in a journal. */
  threadStart: 0.08, threadResume: 0.5,
  /** How many of the faction's last contexts, catalysts, complications and endings it won't see again soon. */
  avoid: { ctx: 8, cat: 12, comp: 8, rew: 10 },
  /** How many pieces the faction's journal memory keeps. */
  seenKeep: 60,
  /** Most quirks a Warlord carries; a new one pushes out the oldest. */
  maxQuirks: 3,
  /** How many rounds a sector mark lasts unless the reward says. */
  sectorRounds: 2,
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
  /** The Warlord's special rules it suits: a Warlord with one of them sees it more often. */
  rules?: string[];
}

export const JOURNAL_CONTEXTS: JournalContext[] = CONTEXTS_TABLE;

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

export const JOURNAL_CATALYSTS: JournalCatalyst[] = CATALYSTS_TABLE;

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
  /** A rival Warlord's beat: `{rival}` in the texts stands for their name. Only dealt when there's a rival. */
  rival?: boolean;
}

export const JOURNAL_COMPLICATIONS: JournalComplication[] = COMPLICATIONS_TABLE;

/** A twist: after the climax the scene turns once more, and the player picks one of `skills` for one more check. */
export interface JournalTwist {
  id: string;
  name: string;
  text: string;
  skills: JournalSkillId[];
}

export const JOURNAL_TWISTS: JournalTwist[] = TWISTS_TABLE;

/** A story thread: a few beats that come back over a faction's journals, and the reward the last one always offers. */
export interface JournalThread {
  id: string;
  name: string;
  /** The beat each journal on the thread plays, in order (`{rival}`: the rival Warlord's name). */
  steps: string[];
  /** The reward (JOURNAL_REWARDS, with `thread` set) the last beat offers. */
  payoff: string;
  /** Needs a rival Warlord. */
  rival?: boolean;
}

export const JOURNAL_THREADS: JournalThread[] = [
  {
    id: 'rival', name: 'A grudge', rival: true, payoff: 'threadRival',
    steps: [
      '{rival} has heard of you, and sent a gift: the helmet of one of your sergeants.',
      'Your scouts find {rival}’s mark burned into every waystation you pass.',
      'At last word comes of where {rival} will be. This ends now, one way or another.',
    ],
  },
  {
    id: 'debt', name: 'A debt', payoff: 'threadDebt',
    steps: [
      'A shuttle broker offers passage, supplies, anything — all on credit. You signed.',
      'The broker’s agents have started asking, politely, about the interest.',
      'The broker comes in person. The debt can be settled today, in coin or in kind.',
    ],
  },
  {
    id: 'map', name: 'The star-chart', payoff: 'threadMap',
    steps: [
      'Among the loot, a fragment of an ancient star-chart, marked with routes nobody uses.',
      'A second fragment, from a dead navigator’s hand. The routes begin to make sense.',
      'The last fragment. Laid together, the chart shows the hidden lanes of the whole sector.',
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
  | { kind: 'traitToken'; n: number }
  /** A lasting mark on the Warlord: `battle` (their next battle, text only), `order` (their next Nexus order: `move` added
   * to its hexes), `sector` (the sector they stand in, for `rounds` rounds) or `quirk` (on the Warlord for good). */
  | { kind: 'mark'; mark: 'battle' | 'order' | 'sector' | 'quirk'; name: string; text: string; good: boolean; move?: number; rounds?: number };

export interface JournalReward {
  id: string;
  name: string;
  desc: string;
  /** How good it is: 1–3, and 0 or less for nothing or worse. A scenario can only offer rewards up to its tier cap. */
  tier: number;
  table: JournalTableId;
  tags: string[];
  effects: JournalEffect[];
  /** The Warlord's special rules it suits: scored up for a Warlord with one of them. */
  rules?: string[];
  /** A thread's payoff: only offered on that thread's last step (and always offered then). */
  thread?: string;
}

export const JOURNAL_REWARDS: JournalReward[] = REWARDS_TABLE;

/** What an effect is worth, in Umbra Shards: the yardstick that keeps every reward inside its tier's band. */
export function effectValue(e: JournalEffect): number {
  switch (e.kind) {
    case 'materials': return e.n / 25;
    case 'research': return e.n / 2;
    case 'blueprints': return e.n * 3;
    case 'cores': return e.n * 5;
    case 'archives': return e.n * 5;
    case 'threat': return -1.5 * e.n;
    case 'reveal': return e.n / 3;
    case 'shards': return e.n;
    case 'xp': return e.n / 2;
    case 'relic': return { Common: 2.5, Rare: 4, Legendary: 7 }[e.tier] ?? 0;
    case 'scar': return -2.5;
    case 'traitToken': return e.n * 3;
    case 'mark': {
      const v = e.mark === 'battle' ? 1.5 : e.mark === 'order' ? Math.abs(e.move ?? 1) * 1.5 : e.mark === 'sector' ? 0.75 * (e.rounds ?? JOURNAL.sectorRounds) : 2;
      return e.good ? v : -v;
    }
  }
}

export const rewardValue = (r: JournalReward) => r.effects.reduce((n, e) => n + effectValue(e), 0);

/** The value band each tier's rewards must fall in (tier −1 and lower share the first). */
export function tierBand(tier: number): [number, number] {
  if (tier <= -1) return [-3, -1];
  return ([[-2, 0.5], [0.5, 2], [1.5, 4], [3.5, 6]] as [number, number][])[Math.min(tier, 3)];
}
