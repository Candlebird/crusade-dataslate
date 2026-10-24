import type { Campaign, Force, SiegeBoardEntry, SiegeWin } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { siegeScore } from './siege';
import type { TrainingRun } from './types';

// The Weekly Siege board (F5), kept on the campaign like the Sortie weekly's (downtime.ts postWeekly): each force's
// best siege a week, for the last TRAINING.siege.weeks weeks. Once a week is over its top force wins its faction one
// Strategic Asset in the round it is settled (rounds.ts assetsOf, within the skirmish cap); repeat wins are fine.

const S = TRAINING.siege;

/** The campaign round (nexus.ts currentRound, without the import). */
const roundOf = (c: Pick<Campaign, 'round'>) => c.round ?? 1;

/** Has week `week` been settled already? */
export const weekSettled = (c: Pick<Campaign, 'siegeWins'>, week: string) => (c.siegeWins ?? []).some((w) => w.week === week);

/**
 * Post a siege run to the board: a force keeps only its best each week, a settled week takes no more, and the board
 * keeps only the last few weeks. Returns the new board.
 */
export function postSiege(c: Pick<Campaign, 'siegeBoard' | 'siegeWins'>, force: Force, run: TrainingRun, date: string): SiegeBoardEntry[] {
  const list = [...(c.siegeBoard ?? [])];
  if (!run.siege || weekSettled(c, run.siege)) return list;
  const entry: SiegeBoardEntry = {
    week: run.siege, forceId: force.id, force: force.name, player: force.player,
    ...(force.nexus?.factionId ? { factionId: force.nexus.factionId } : {}), score: siegeScore(run), cleared: run.cleared, date,
  };
  const i = list.findIndex((e) => e.week === entry.week && e.forceId === force.id);
  if (i < 0) list.push(entry);
  else if (entry.score > list[i].score || (entry.score === list[i].score && entry.cleared > list[i].cleared)) list[i] = entry;
  const weeks = [...new Set(list.map((e) => e.week))].sort().reverse().slice(0, S.weeks);
  return list.filter((e) => weeks.includes(e.week));
}

/** A week's board, best first: the wave reached, then waves cleared, then who got there first. */
export const siegeRanking = (board: Campaign['siegeBoard'], week: string): SiegeBoardEntry[] =>
  (board ?? []).filter((e) => e.week === week)
    .sort((a, b) => b.score - a.score || b.cleared - a.cleared || a.date.localeCompare(b.date));

/** Weeks on the board that are over (before `nowWeek`) and not yet settled, oldest first. */
export const weeksDue = (c: Pick<Campaign, 'siegeBoard' | 'siegeWins'>, nowWeek: string): string[] =>
  [...new Set((c.siegeBoard ?? []).map((e) => e.week))].filter((w) => w < nowWeek && !weekSettled(c, w)).sort();

/**
 * Settle every week that is over (mutates the campaign): its top force wins, for its faction, one Strategic Asset this
 * round. The last TRAINING.siege.keep winners are kept. Returns the wins just settled.
 */
export function settleSieges(c: Campaign, nowWeek: string, date: string): SiegeWin[] {
  const won: SiegeWin[] = [];
  for (const week of weeksDue(c, nowWeek)) {
    const top = siegeRanking(c.siegeBoard, week)[0];
    if (!top) continue;
    won.push({
      week, forceId: top.forceId, force: top.force, player: top.player, ...(top.factionId ? { factionId: top.factionId } : {}),
      score: top.score, round: roundOf(c), date,
    });
  }
  if (won.length) c.siegeWins = [...(c.siegeWins ?? []), ...won].slice(-S.keep);
  return won;
}

/** Strategic Assets a faction has won from sieges this round (rounds.ts assetsOf adds them within the cap). */
export const siegeAssets = (c: Pick<Campaign, 'siegeWins' | 'round'>, factionId: string): number =>
  (c.siegeWins ?? []).filter((w) => w.factionId === factionId && w.round === roundOf(c)).length;

/** The last settled winner, if any. */
export const lastSiegeWin = (c?: Pick<Campaign, 'siegeWins'>): SiegeWin | undefined => c?.siegeWins?.[c.siegeWins.length - 1];
