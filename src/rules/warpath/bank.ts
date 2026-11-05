import type { Force, ForceWarpath, WarpathBest } from '../../model/types';
import type { FeatId } from '../feats';
import { WARPATH } from './data';
import type { WarpathMode, WarpathRun } from './types';

// What a finished run pays the force: XP (the hero 1 a boss; a unit 1 if it did its share of the damage in a run with a
// boss kill, both under the off-table limit), feats, and its records (best run each mode, lifetime kills, the week's
// best for the faction board, each unit's best run). No lasting power: Warpath's honours are records and titles.

/** Bosses slain in the run. */
export const bossesOf = (run: WarpathRun) => run.captains + run.lordKills;

/** XP each unit earned in the run, by unit id. */
export function warpathXp(run: WarpathRun): Record<string, number> {
  const bosses = bossesOf(run);
  if (!bosses) return {};
  const out: Record<string, number> = { [run.squads[0].unitId]: bosses };
  const total = run.squads.reduce((n, s) => n + s.dealt, 0);
  for (const s of run.squads.slice(1)) if (total > 0 && s.dealt / total >= WARPATH.xpShare) out[s.unitId] = 1;
  return out;
}

const KILL_FEATS: [number, FeatId, FeatId][] = [[10000, 'warKills10', 'warHardKills10'], [50000, 'warKills50', 'warHardKills50'], [100000, 'warKills100', 'warHardKills100']];

/** The unique feats the run earns (`lifetime`: the force's kills on this mode, this run counted). */
export function warpathFeats(run: WarpathRun, lifetime: number): FeatId[] {
  const hard = run.mode === 'hard';
  const pick = (n: FeatId, h: FeatId) => (hard ? h : n);
  const out: FeatId[] = [];
  if (run.lordKills > 0) out.push(pick('warLord', 'warHardLord'));
  for (const [n, a, b] of KILL_FEATS) if (lifetime >= n) out.push(pick(a, b));
  if ((run.pure ?? 0) >= 3) out.push(pick('warPure', 'warHardPure'));
  if ((run.lone ?? 0) >= 2) out.push(pick('warLone', 'warHardLone'));
  if ((run.single ?? 0) >= 3) out.push(pick('warSingle', 'warHardSingle'));
  if ((run.musterAtSecond ?? 0) >= WARPATH.cap - 50) out.push(pick('warMuster', 'warHardMuster'));
  return out;
}

/** The repeatable feats the run earns. */
export const warpathRepeats = (run: WarpathRun): FeatId[] => (run.lordKills > 0 ? ['warRepLord'] : []);

/** Is a run better than a record: more bosses, then longer. */
const better = (a: { bosses: number; t: number }, b?: { bosses: number; t: number }) => !b || a.bosses > b.bosses || (a.bosses === b.bosses && a.t > b.t);

/** Has Hard opened for the force? */
export const hardOpen = (f: Force) => !!f.warpath?.hard;

/** Write the run's records into the force; returns lines for what's new (a best, Hard opening). */
export function bankRecords(f: Force, run: WarpathRun, date: string): string[] {
  const w: ForceWarpath = (f.warpath ??= {});
  const lines: string[] = [];
  const mode: WarpathMode = run.mode;
  w.runs = (w.runs ?? 0) + 1;
  (w.kills ??= {})[mode] = (w.kills[mode] ?? 0) + run.kills;
  const rec: WarpathBest = { t: Math.round(run.t), bosses: bossesOf(run), kills: run.kills, score: run.score, level: run.level, hero: run.squads[0].name, date };
  const best = (w.best ??= {});
  if (better(rec, best[mode])) {
    if (best[mode]) lines.push(`New ${mode === 'hard' ? 'Hard ' : ''}best: ${rec.bosses} boss${rec.bosses === 1 ? '' : 'es'}.`);
    best[mode] = rec;
  }
  if (mode === 'normal' && run.lordKills > 0 && !w.hard) {
    w.hard = date;
    lines.push('Hard mode is open.');
  }
  const wk = { key: run.week, theme: run.theme.name, bosses: rec.bosses, t: rec.t, mode };
  if (!w.week || w.week.key !== run.week || better(wk, w.week)) w.week = wk;
  const units = (w.units ??= {});
  for (const s of run.squads) {
    const u = (units[s.unitId] ??= { best: 0, kills: 0 });
    u.best = Math.max(u.best, Math.round(s.dealt));
    u.kills += s.kills;
  }
  return lines;
}

/** The weekly faction board: every force's best this week (on the week's theme), most bosses first. */
export function weekBoard(forces: Force[], week: string): { force: Force; bosses: number; t: number; mode: WarpathMode }[] {
  return forces
    .flatMap((f) => (f.warpath?.week?.key === week ? [{ force: f, ...f.warpath.week }] : []))
    .sort((a, b) => b.bosses - a.bosses || b.t - a.t);
}
