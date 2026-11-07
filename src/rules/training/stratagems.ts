import { TRAINING } from '../downtimeData';
import type { Tower, TrainingRun } from './types';

// Stratagems: two boss cards that belong together. Once the run holds both (on any towers: the requirement is
// run-wide), the next boss offer puts the stratagem in place of one of its three cards, until it is taken. Each comes
// once a run. Some change the towers holding either card (as they stand when it is taken); some change the run.
// Pure: cards.ts puts them on offer and applies them.

export interface Stratagem {
  id: string;
  name: string;
  /** The two cards (cards.ts CARDS ids). */
  needs: [string, string];
  text: string;
  /** What it does to each tower holding either card (none: it is a whole-run rule). */
  tower?: (t: Tower) => void;
  /** What it does to the run when taken. */
  run?: (run: TrainingRun) => void;
}

/** Numbers for the stratagems the combat asks about. */
export const STRAT = {
  /** Hunting Pack: Pack tactics counts this many more units. */
  packMore: 2,
  /** Chain Reaction: Kill chain stacks this many more times. */
  chainMore: 2,
  /** Spoils of War: kills pay this share more. */
  spoils: 0.1,
  /** Death Grip: holds last this share longer. */
  grip: 0.2,
} as const;

const shooting = (t: Tower) => t.guns.filter((g) => !g.melee);
const skillsOf = (t: Tower) => (t.kind === 'unit' ? t.skills : []);

export const STRATAGEMS: Stratagem[] = [
  { id: 'overkill', name: 'Overkill', needs: ['whet', 'deadly'], text: 'Towers holding either card get +1 AP on every attack.',
    tower: (t) => t.guns.forEach((g) => { g.ap += 1; }) },
  { id: 'marksmen', name: 'Marksmen', needs: ['aim', 'barrels'], text: "Towers holding either card: their guns reach 1 cell further.",
    tower: (t) => shooting(t).forEach((g) => { g.range += 1 / TRAINING.rangeMul; }) },
  { id: 'shatter', name: 'Shatter Rounds', needs: ['ap', 'blast'], text: 'Towers holding either card: each shot that hits spills onto 1 more enemy.',
    tower: (t) => shooting(t).forEach((g) => { g.blast = Math.max(1, g.blast) + 1; }) },
  { id: 'deathGrip', name: 'Death Grip', needs: ['grip', 'thirst'], text: `Every hold lasts ${STRAT.grip * 100}% longer.`,
    run: (run) => { run.mods.holdMul *= 1 + STRAT.grip; } },
  { id: 'killingGround', name: 'Killing Ground', needs: ['snare', 'crossfire'], text: 'Crossfire also counts against a slowed enemy.' },
  { id: 'huntingPack', name: 'Hunting Pack', needs: ['pack', 'ace'], text: `Pack tactics counts up to ${STRAT.packMore} more units.` },
  { id: 'chainReaction', name: 'Chain Reaction', needs: ['chain', 'rapid'], text: `Kill chain stacks ${STRAT.chainMore} more times.` },
  { id: 'rallyPoint', name: 'Rally Point', needs: ['banner', 'drill'], text: "Towers holding either card: their Banner of glory reaches 1 cell further.",
    tower: (t) => skillsOf(t).forEach((s) => { if (s.effect.kind === 'aura' && s.source === 'Banner of glory') s.effect = { ...s.effect, radius: s.effect.radius + 1 }; }) },
  { id: 'orbitalLance', name: 'Orbital Lance', needs: ['uplink', 'trance'], text: 'Towers holding either card: each Orbital uplink calls down 2 more hits.',
    tower: (t) => skillsOf(t).forEach((s) => { if (s.effect.kind === 'barrage' && s.source === 'Orbital uplink') s.effect = { ...s.effect, hits: s.effect.hits + 2 }; }) },
  { id: 'spoils', name: 'Spoils of War', needs: ['bounty', 'promote'], text: `Kills pay ${STRAT.spoils * 100}% more credits.`,
    run: (run) => { run.mods.bounty += STRAT.spoils; } },
];

export const STRAT_PREFIX = 'strat:';
export const stratById = (id: string) => STRATAGEMS.find((s) => s.id === id);
/** Does the run hold stratagem `id`? */
export const hasStrat = (run: Pick<TrainingRun, 'stratagems'>, id: string) => !!run.stratagems?.includes(id);

/** Boss cards of id `card` the run holds. */
export const heldCount = (run: Pick<TrainingRun, 'cards'>, card: string) => run.cards.filter((d) => d.id === card).length;

/** Where a stratagem stands: taken; ready (both cards held, it comes on the next boss offer); building (one or none). */
export type StratStatus = 'active' | 'ready' | 'building';
export function stratStatus(run: Pick<TrainingRun, 'cards' | 'stratagems'>, s: Stratagem): StratStatus {
  if (hasStrat(run, s.id)) return 'active';
  return s.needs.every((c) => heldCount(run, c) > 0) ? 'ready' : 'building';
}

/** Stratagems ready to be offered, in list order. */
export const readyStrats = (run: Pick<TrainingRun, 'cards' | 'stratagems'>) => STRATAGEMS.filter((s) => stratStatus(run, s) === 'ready');

/** The stratagem card `card` pairs with, the other card's id and how many of it the run holds (none if it pairs with none). */
export function pairOf(run: Pick<TrainingRun, 'cards' | 'stratagems'>, card: string): { strat: Stratagem; other: string; held: number; status: StratStatus } | undefined {
  const s = STRATAGEMS.find((x) => x.needs.includes(card));
  if (!s) return undefined;
  const other = s.needs[0] === card ? s.needs[1] : s.needs[0];
  return { strat: s, other, held: heldCount(run, other), status: stratStatus(run, s) };
}
