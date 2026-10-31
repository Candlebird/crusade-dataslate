import type { Campaign, Force, SiegeBoardEntry, SiegeWin } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { modeName, MODES, scaleReward } from './modes';
import { checkDmg, hasChecks, siegeDmg, siegeOrder, siegeScore } from './siege';
import type { RunMode, TrainingRun } from './types';

// The Weekly Siege board (F5), kept on the campaign like the Sortie weekly's (downtime.ts postWeekly): each force's
// best siege a week, for the last TRAINING.siege.weeks weeks, ranked by damage to the colossus (siege.ts siegeOrder; an
// entry from before the damage check has none, so ranks by wave below them: kept as it was, not reset). Once a week is over its top force wins its faction one
// Strategic Asset in the round it is settled (rounds.ts assetsOf, within the skirmish cap); repeat wins are fine.
// A damage-check week (siege.ts hasChecks) ranks each check on its own (a force's best there, from any attempt), and
// each check's top force wins TRAINING.siege.rewards for that check's wave: Umbra Shards and RP to the force, and
// Strategic Assets to its faction (the last check's). Hard and Insane (modes.ts) have boards of their own, each check's
// winner there paid its mode's bigger reward. Damage milestones (TRAINING.siege.milestones) pay every force that passes
// one at the last check, once a week a mode, as its run is banked.

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
  const dmg = siegeDmg(run);
  const checks = hasChecks(run.siege) ? checkDmg(run) : [];
  const entry: SiegeBoardEntry = {
    week: run.siege, forceId: force.id, force: force.name, player: force.player,
    ...(force.nexus?.factionId ? { factionId: force.nexus.factionId } : {}), score: siegeScore(run), cleared: run.cleared,
    ...(dmg !== undefined ? { dmg } : {}), ...(checks.length ? { checks } : {}), ...(run.mode ? { mode: run.mode } : {}), date,
  };
  const i = list.findIndex((e) => e.week === entry.week && e.forceId === force.id && e.mode === entry.mode);
  if (i < 0) list.push(entry);
  else {
    const old = list[i];
    const best = siegeOrder(entry, old) < 0 ? entry : old;
    const merged = bestChecks(old.checks, entry.checks);
    list[i] = { ...best, ...(merged.length ? { checks: merged } : {}) };
  }
  const weeks = [...new Set(list.map((e) => e.week))].sort().reverse().slice(0, S.weeks);
  return list.filter((e) => weeks.includes(e.week));
}

/** Each check's best of two lists of check damage (either may be shorter or missing). */
export const bestChecks = (a: number[] = [], b: number[] = []): number[] =>
  Array.from({ length: Math.max(a.length, b.length) }, (_, i) => Math.max(a[i] ?? 0, b[i] ?? 0));

/** A damage-check week's board for check `i` (index into TRAINING.siege.checks) in a mode (none: Normal), best first:
 *  the force's best damage there, then who got there first. Only forces that reached that check are on it. */
export const checkRanking = (board: Campaign['siegeBoard'], week: string, i: number, mode?: RunMode): SiegeBoardEntry[] =>
  (board ?? []).filter((e) => e.week === week && e.mode === mode && e.checks?.[i] !== undefined)
    .sort((a, b) => b.checks![i] - a.checks![i] || a.date.localeCompare(b.date));

/** What winning check wave `tier` pays (TRAINING.siege.rewards) in a mode: its Umbra Shards and RP times the mode's
 *  reward, the Strategic Asset as it is. */
export function checkReward(tier: number, mode?: RunMode) {
  const r = S.rewards[tier] ?? { us: 0, rp: 0, asset: 0 };
  return { ...scaleReward({ us: r.us, rp: r.rp }, mode), asset: r.asset };
}

/** A reward in words, like "1 Strategic Asset, 5 Umbra Shards, 2 RP". */
export function rewardWords(r: { us?: number; rp?: number; asset?: number }): string {
  const bits = [
    r.asset ? `${r.asset} Strategic Asset${r.asset > 1 ? 's' : ''}` : '',
    r.us ? `${r.us} Umbra Shard${r.us > 1 ? 's' : ''}` : '',
    r.rp ? `${r.rp} RP` : '',
  ].filter(Boolean);
  return bits.join(', ') || 'nothing';
}

/** A week's board, best first: damage to the colossus, else the wave reached and waves cleared, then who got there first. */
export const siegeRanking = (board: Campaign['siegeBoard'], week: string, mode?: RunMode): SiegeBoardEntry[] =>
  (board ?? []).filter((e) => e.week === week && e.mode === mode).sort((a, b) => siegeOrder(a, b) || a.date.localeCompare(b.date));

/** Weeks on the board that are over (before `nowWeek`) and not yet settled, oldest first. */
export const weeksDue = (c: Pick<Campaign, 'siegeBoard' | 'siegeWins'>, nowWeek: string): string[] =>
  [...new Set((c.siegeBoard ?? []).map((e) => e.week))].filter((w) => w < nowWeek && !weekSettled(c, w)).sort();

/** A check win's key on the force that collected it (Force.siegePaid). */
const winKey = (w: SiegeWin) => (w.mode ? `${w.week}:${w.mode}:${w.tier}` : `${w.week}:${w.tier}`);

/** How many Force.siegePaid keys a force keeps (a few weeks of wins and milestones in every mode). */
const PAID_KEEP = 160;

/** Check wins of force `f` whose Umbra Shards and RP it has yet to collect. */
export const siegeOwed = (c: Pick<Campaign, 'siegeWins'>, f: Pick<Force, 'id' | 'siegePaid'>): SiegeWin[] =>
  (c.siegeWins ?? []).filter((w) => w.tier && w.forceId === f.id && (w.us || w.rp) && !f.siegePaid?.includes(winKey(w)));

/**
 * Collect force `f`'s check wins (mutates it; only its owner's browser may write it, as with Nexus Duels): Umbra
 * Shards, RP on the ledger with the Shards noted, each once. Returns a line for each.
 */
export function collectSiege(c: Pick<Campaign, 'siegeWins'>, f: Force, date: string, newId: () => string): string[] {
  const out: string[] = [];
  for (const w of siegeOwed(c, f)) {
    const label = `Weekly Siege ${w.week}${w.mode ? ` (${modeName(w.mode)})` : ''}: most damage at damage check ${S.checks.indexOf(w.tier!) + 1} (wave ${w.tier}), ${(w.dmg ?? 0).toLocaleString()}`;
    f.umbraShards = (f.umbraShards ?? 0) + (w.us ?? 0);
    f.ledger.push({ id: newId(), date, label, rp: w.rp ?? 0, supply: 0, ...(w.us ? { us: w.us } : {}) });
    f.siegePaid = [...(f.siegePaid ?? []), winKey(w)].slice(-PAID_KEEP);
    out.push(`${label}: +${rewardWords({ us: w.us, rp: w.rp })}`);
  }
  return out;
}

/**
 * Settle every week that is over (mutates the campaign): its top force wins, for its faction, one Strategic Asset this
 * round. A damage-check week has a winner for each check, given that check's rewards (its faction's Strategic Assets
 * here; the force collects its Umbra Shards and RP, collectSiege). The last TRAINING.siege.keep winners are kept. Returns the wins just settled.
 */
export function settleSieges(c: Campaign, nowWeek: string, date: string): SiegeWin[] {
  const won: SiegeWin[] = [];
  for (const week of weeksDue(c, nowWeek)) {
    if (hasChecks(week)) {
      for (const mode of [undefined, ...MODES]) S.checks.forEach((tier, i) => {
        const top = checkRanking(c.siegeBoard, week, i, mode)[0];
        if (!top) return;
        const r = checkReward(tier, mode);
        const w: SiegeWin = {
          week, tier, ...(mode ? { mode } : {}), forceId: top.forceId, force: top.force, player: top.player, ...(top.factionId ? { factionId: top.factionId } : {}),
          score: top.score, dmg: top.checks![i], assets: top.factionId ? r.asset : 0, us: r.us, rp: r.rp, round: roundOf(c), date,
        };
        won.push(w);
      });
      continue;
    }
    const top = siegeRanking(c.siegeBoard, week)[0];
    if (!top) continue;
    won.push({
      week, forceId: top.forceId, force: top.force, player: top.player, ...(top.factionId ? { factionId: top.factionId } : {}),
      score: top.score, ...(top.dmg !== undefined ? { dmg: top.dmg } : {}), round: roundOf(c), date,
    });
  }
  if (won.length) c.siegeWins = [...(c.siegeWins ?? []), ...won].slice(-S.keep);
  return won;
}

/** Strategic Assets a faction has won from sieges this round (rounds.ts assetsOf adds them within the cap). */
export const siegeAssets = (c: Pick<Campaign, 'siegeWins' | 'round'>, factionId: string): number =>
  (c.siegeWins ?? []).filter((w) => w.factionId === factionId && w.round === roundOf(c)).reduce((n, w) => n + (w.assets ?? 1), 0);

/** The last settled winner, if any. */
export const lastSiegeWin = (c?: Pick<Campaign, 'siegeWins'>): SiegeWin | undefined => c?.siegeWins?.[c.siegeWins.length - 1];

/** A damage milestone's key on the force that was paid it (Force.siegePaid). */
const mileKey = (week: string, mode: RunMode | undefined, dmg: number) => `${week}:${mode ?? 'normal'}:m${dmg}`;

/** The damage milestones a finished siege run passes at its last check that its force has not been paid this week in
 *  its mode, each with its reward (times the mode's). */
export function siegeMilestones(f: Pick<Force, 'siegePaid'>, run: TrainingRun) {
  if (!run.siege || !hasChecks(run.siege)) return [];
  const dmg = checkDmg(run)[S.checks.length - 1];
  if (dmg === undefined) return [];
  return S.milestones
    .filter((m) => dmg >= m.dmg && !f.siegePaid?.includes(mileKey(run.siege!, run.mode, m.dmg)))
    .map((m) => ({ dmg: m.dmg, ...scaleReward({ us: m.us, rp: m.rp }, run.mode) }));
}

/** Pay a finished siege run's new damage milestones to its force (mutates it): Umbra Shards, RP on the ledger, each once
 *  a week a mode. Returns a line for each. */
export function payMilestones(f: Force, run: TrainingRun, date: string, newId: () => string): string[] {
  const out: string[] = [];
  for (const m of siegeMilestones(f, run)) {
    const label = `Weekly Siege ${run.siege}${run.mode ? ` (${modeName(run.mode)})` : ''}: ${m.dmg.toLocaleString()} damage at the last check`;
    f.umbraShards = (f.umbraShards ?? 0) + (m.us ?? 0);
    f.ledger.push({ id: newId(), date, label, rp: m.rp ?? 0, supply: 0, ...(m.us ? { us: m.us } : {}) });
    f.siegePaid = [...(f.siegePaid ?? []), mileKey(run.siege!, run.mode, m.dmg)].slice(-PAID_KEEP);
    out.push(`${label}: +${rewardWords(m)}`);
  }
  return out;
}
