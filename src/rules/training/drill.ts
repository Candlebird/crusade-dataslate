import type { DrillStats, Force, TrainingRecord } from '../../model/types';
import { TRAINING, type DrillGoal, type DrillPerk, type DrillUnlock } from '../downtimeData';
import { heldTitles } from './titles';
import type { RunDrill, TrainingRun } from './types';

// Drill Honours (F5): a force's season-long unlock track, Sortie-boon style. A new force's runs are held to luck
// TRAINING.drill.luckAtStart and the cardsAtStart boss cards; each goal reached opens a luck level, a card group or a
// level of a small perk. drillOf hands a run what is open (run.drill); a run without one has everything (bots, sieges).

const D = TRAINING.drill;

/** The track, in order. */
export const DRILL_GOALS = D.goals;

export const blankDrill = (): DrillStats => ({ runs: 0, kills: 0, bosses: 0, lords: 0, clean: 0, crafted: 0, sieges: 0 });

/**
 * The force's Drill counts. A force that trained before the track (no force.drill) starts from its units' Training
 * records: the most runs any unit stood in, and their kills and lords added up.
 */
export function drillStats(f: Force): DrillStats {
  if (f.drill) return f.drill;
  const recs = f.units.map((u) => u.trainingRecord).filter((r): r is TrainingRecord => !!r);
  return {
    ...blankDrill(),
    runs: Math.max(0, ...recs.map((r) => r.runs)),
    kills: recs.reduce((n, r) => n + r.kills, 0),
    lords: recs.reduce((n, r) => n + r.lords, 0),
    bosses: recs.reduce((n, r) => n + r.lords, 0),
  };
}

/** Bestiary entries whose lore is open (slain in a Sortie, or in Training). */
const loreOf = (f: Force) => Object.values(f.sortie?.bestiary ?? {}).filter((b) => b.slain > 0 || (b.drill ?? 0) > 0).length;

/** How far the force is towards a goal kind. */
export function drillProgress(f: Force, goal: DrillGoal): number {
  const st = drillStats(f);
  switch (goal) {
    case 'best': return f.trainingBest ?? 0;
    case 'titles': return f.units.reduce((n, u) => n + heldTitles(u).length, 0);
    case 'lore': return loreOf(f);
    default: return st[goal];
  }
}

/** Is goal `i` of the track reached? */
export const goalReached = (f: Force, i: number): boolean => {
  const g = DRILL_GOALS[i];
  return !!g && drillProgress(f, g.goal) >= g.n;
};

/** The track's goals reached, by index. */
export const drillEarned = (f: Force): number[] => DRILL_GOALS.map((_, i) => i).filter((i) => goalReached(f, i));

/** What a run may use, for a force that has reached goals `earned`. */
export function drillFrom(earned: number[]): RunDrill {
  let luck = D.luckAtStart;
  const cards = [...D.cardsAtStart];
  const perks: Partial<Record<DrillPerk, number>> = {};
  for (const i of earned) {
    const u = DRILL_GOALS[i]?.unlock;
    if (!u) continue;
    if ('luck' in u) luck = Math.max(luck, u.luck);
    else if ('cards' in u) cards.push(...(D.groups[u.cards]?.cards ?? []).filter((c) => !cards.includes(c)));
    else perks[u.perk] = (perks[u.perk] ?? 0) + 1;
  }
  return { luck, cards, perks };
}

/** What the force's Drill Honours open for its next run (createRun's opts.drill). */
export const drillOf = (f: Force): RunDrill => drillFrom(drillEarned(f));

/** The highest luck level the run may buy. */
export const luckCap = (run: TrainingRun): number => run.drill?.luck ?? TRAINING.shards.luckCost.length;

/** May boss card `id` be drawn this run? */
export const cardOpen = (run: TrainingRun, id: string): boolean => !run.drill || run.drill.cards.includes(id);

/** Levels of a perk the run has. */
export const perkOf = (run: TrainingRun, p: DrillPerk): number => run.drill?.perks[p] ?? 0;

/** Extra starting credits from the purse perk. */
export const purseOf = (run: TrainingRun): number => perkOf(run, 'purse') * D.perks.purse;

/** The luck price after the thrift perk (rounded, at least 1). */
export const thrifty = (run: TrainingRun, cost: number): number =>
  Math.max(1, Math.round(cost * (1 - Math.min(D.thriftMax, perkOf(run, 'thrift') * D.perks.thrift))));

/** Extra HP a base mend gives from the mend perk. */
export const mendPerk = (run: TrainingRun): number => perkOf(run, 'mend') * D.perks.mend;

/** Card offers the run may re-draw (the reroll perk). */
export const rerollsOf = (run: TrainingRun): number => perkOf(run, 'reroll') * D.perks.reroll;

const GOAL_TEXT: Record<DrillGoal, (n: number) => string> = {
  runs: (n) => `Finish ${n} Training run${n === 1 ? '' : 's'}`,
  best: (n) => `Clear ${n} waves in one run`,
  kills: (n) => `Slay ${n} Echoes in Training`,
  bosses: (n) => `Slay ${n} boss${n === 1 ? '' : 'es'} in Training`,
  lords: (n) => `Slay ${n} real Echo Lord${n === 1 ? '' : 's'} or your nemesis in Training`,
  clean: (n) => `Hold the first ${n} waves of a run with nothing getting through`,
  crafted: (n) => `Craft ${n} units in one run`,
  titles: (n) => `Hold ${n} titles across the force`,
  lore: (n) => `Open ${n} bestiary entries`,
  sieges: (n) => `Enter ${n} Weekly Sieges`,
};

/** A goal in words. */
export const drillGoalText = (goal: DrillGoal, n: number): string => GOAL_TEXT[goal](n);

/** What an unlock gives, in words. */
export function unlockText(u: DrillUnlock): { name: string; text: string } {
  if ('luck' in u) return { name: `Luck ${u.luck}`, text: `Luck can be bought up to level ${u.luck}.` };
  if ('cards' in u) {
    const g = D.groups[u.cards];
    return { name: g?.name ?? u.cards, text: `Adds ${(g?.cards ?? []).length} boss cards to the pool.` };
  }
  const P = D.perks;
  const text: Record<DrillPerk, string> = {
    purse: `+${P.purse} starting credits.`,
    mend: `Each base mend restores ${P.mend} more HP.`,
    reroll: `Re-draw a card offer ${P.reroll} more time a run.`,
    thrift: `Luck costs ${Math.round(P.thrift * 100)}% less.`,
    offer: `${P.offer} more card on offer after a boss.`,
  };
  const names: Record<DrillPerk, string> = { purse: 'Purse', mend: 'Field mending', reroll: 'Second thoughts', thrift: 'Thrift', offer: 'Wider choice' };
  return { name: names[u.perk], text: text[u.perk] };
}
