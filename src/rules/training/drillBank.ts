import type { DrillStats, Force } from '../../model/types';
import { bankBeasts } from './bestiary';
import { DRILL_GOALS, drillEarned, drillStats, unlockText } from './drill';
import { runHonours } from './records';
import { siegeDmg, siegeScore } from './siege';
import type { TrainingRun } from './types';
import { finaleAfter } from './veterancy';

// Drill Honours banked (F5): a finished run's counts go into force.drill once (bankDrill, before the records move),
// and once the rest is banked drillNews names the goals it reached. drillPreview works them out without touching it.

/** Kills by every tower still on the field. */
const killsOf = (run: TrainingRun) => run.pieces.reduce((n, p) => n + ('kills' in p ? p.kills : 0), 0);

/** Bosses slain this run: generic lords, real lords and the nemesis (the run's bestiary tally). */
const bossesOf = (run: TrainingRun) =>
  Object.entries(run.beasts ?? {}).filter(([k]) => k === 'lord' || k === 'nemesis' || k.startsWith('real:')).reduce((n, [, b]) => n + b.slain, 0);

/** Real lords and the nemesis slain this run. */
const lordsOf = (run: TrainingRun) => (run.nexus?.lords ?? []).filter((l) => l.slain).length + (run.nemesis?.slain ? 1 : 0);

/** The counts with one more run in them (a copy). A siege counts once a week, and keeps the week's best. */
export function statsAfter(st: DrillStats, run: TrainingRun): DrillStats {
  const out: DrillStats = {
    ...st,
    runs: st.runs + 1,
    kills: st.kills + killsOf(run),
    bosses: st.bosses + bossesOf(run),
    lords: st.lords + lordsOf(run),
    clean: Math.max(st.clean, run.clean ?? 0),
    crafted: Math.max(st.crafted, run.crafted.length),
  };
  if (run.siege) {
    const fresh = st.siege?.week !== run.siege;
    out.sieges = st.sieges + (fresh ? 1 : 0);
    const dmg = Math.max(fresh ? -1 : st.siege!.dmg ?? -1, siegeDmg(run) ?? -1);
    out.siege = { week: run.siege, best: Math.max(fresh ? 0 : st.siege!.best, siegeScore(run)), ...(dmg >= 0 ? { dmg } : {}) };
  }
  return out;
}

/** The goals this run would reach, worked out without changing the force (its counts, best, records, titles and lore). */
export function drillPreview(f: Force, run: TrainingRun): number[] {
  if (run.drilled) return run.drilled.earned;
  const h = runHonours(run, f);
  const units = f.units.map((u) => ({
    ...u,
    trainingRecord: h.records[u.id] ?? u.trainingRecord,
    titles: [...new Set([...(u.titles ?? []), ...h.titles.filter((g) => g.unitId === u.id).map((g) => g.title)])],
  }));
  // The bestiary as bankShared will leave it (on a copy), so lore learned this run counts.
  const sortie = structuredClone(f.sortie ?? {});
  bankBeasts(sortie, run);
  const after: Force = {
    ...f, units, sortie, drill: statsAfter(drillStats(f), run), trainingBest: Math.max(f.trainingBest ?? 0, run.cleared),
    finale: finaleAfter(f, run, ''),
  };
  const before = drillEarned(f);
  return drillEarned(after).filter((i) => !before.includes(i));
}

/**
 * Bank the run's counts into force.drill (mutates both), once (run.drilled). Call it before records.bankHonours, so an
 * old force's counts start from its units' records without this run. Returns the goals reached before it, for drillNews.
 */
export function bankDrill(f: Force, run: TrainingRun): number[] | null {
  if (run.drilled) return null;
  const before = drillEarned(f);
  f.drill = statsAfter(drillStats(f), run);
  run.drilled = { earned: [] };
  return before;
}

/** Once the run's best, records and bestiary are banked too: the goals it reached (kept on run.drilled), a line each. */
export function drillNews(f: Force, run: TrainingRun, before: number[] | null): string[] {
  if (!before || !run.drilled) return [];
  const now = drillEarned(f).filter((i) => !before.includes(i));
  run.drilled.earned = now;
  return now.map((i) => `Drill Honour: ${unlockText(DRILL_GOALS[i].unlock).name}`);
}
