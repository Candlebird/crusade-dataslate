import type { BattleResult, Force } from '../model/types';
import { unitName } from './battle';
import { score, teamsOf, type FinishedBattle } from './tracker';

// The War Room (Nexus Wars): a force's record from its battle log, with VP and unit lines from the tracked games behind it.

export interface Record3 {
  win: number;
  loss: number;
  draw: number;
}

export interface UnitLine {
  unitId: string;
  name: string;
  games: number;
  /** Kills as the tracker counted them: kill XP in newer battles, kills in older ones. */
  kills: number;
  /** Games it ended destroyed. */
  wiped: number;
}

export interface ForceStats {
  record: Record3;
  games: number;
  /** Wins over games, 0–1 (draws count as games). */
  winRate: number;
  /** Average VP, ours and the best opponent's, over the games with a tracked battle (undefined if none). */
  avgVp?: number;
  avgOppVp?: number;
  tracked: number;
  byOpponent: { name: string; record: Record3 }[];
  byMission: { name: string; record: Record3 }[];
  units: UnitLine[];
  mvp?: UnitLine;
}

const blank = (): Record3 => ({ win: 0, loss: 0, draw: 0 });

const tally = (rows: Map<string, Record3>, key: string, result: BattleResult) => {
  const r = rows.get(key) ?? blank();
  r[result]++;
  rows.set(key, r);
};

const sorted = (rows: Map<string, Record3>) =>
  [...rows].map(([name, record]) => ({ name, record }))
    .sort((a, b) => played(b.record) - played(a.record) || a.name.localeCompare(b.name));

export const played = (r: Record3) => r.win + r.loss + r.draw;

/** The unit with the most kills (fewest wipes, then most games, breaking ties); none until something has a kill. */
export function mvp(units: UnitLine[]): UnitLine | undefined {
  const best = [...units].sort((a, b) => b.kills - a.kills || a.wiped - b.wiped || b.games - a.games)[0];
  return best && best.kills > 0 ? best : undefined;
}

const nameOf = (f: Force, u: UnitLine) => {
  const now = f.units.find((x) => x.id === u.unitId);
  return now ? unitName(now) : u.name || 'Unnamed unit';
};

/** A force's War Room stats: every logged battle but patrols, joined to the tracked battle it claimed where there is one. */
export function forceStats(f: Force, history: FinishedBattle[] = []): ForceStats {
  const record = blank();
  const opponents = new Map<string, Record3>();
  const missions = new Map<string, Record3>();
  const units = new Map<string, UnitLine>();
  let vp = 0, oppVp = 0, tracked = 0;

  for (const r of f.battleLog ?? []) {
    if (r.patrol) continue;
    record[r.result]++;
    tally(opponents, r.opponent?.trim() || (r.vsAi ? 'AI' : 'Unknown'), r.result);

    const b = r.battleId ? history.find((x) => x.id === r.battleId) : undefined;
    const side = b && (b.sides.find((x) => x.id === r.sideId) ?? b.sides.find((x) => x.forceId === f.id));
    if (!b || !side) continue;
    tally(missions, b.mission?.name ?? 'Unknown', r.result);
    if (b.mission?.scoring) {
      const s = score(b);
      vp += s[side.team]?.total ?? 0;
      oppVp += Math.max(0, ...teamsOf(b).filter((t) => t !== side.team).map((t) => s[t]?.total ?? 0));
      tracked++;
    }
    for (const t of side.units) {
      if (!t.unitId) continue;
      const line = units.get(t.unitId) ?? { unitId: t.unitId, name: t.name, games: 0, kills: 0, wiped: 0 };
      line.games++;
      line.kills += t.kills ?? t.xp ?? 0;
      if (t.destroyed) line.wiped++;
      units.set(t.unitId, line);
    }
  }

  // Name units as the force has them now (they may have been renamed); ones it no longer has keep their battle name.
  const lines = [...units.values()].map((u) => ({ ...u, name: nameOf(f, u) }))
    .sort((a, b) => b.kills - a.kills || b.games - a.games || a.name.localeCompare(b.name));
  const games = played(record);
  return {
    record, games, winRate: games ? record.win / games : 0,
    avgVp: tracked ? vp / tracked : undefined, avgOppVp: tracked ? oppVp / tracked : undefined, tracked,
    byOpponent: sorted(opponents), byMission: sorted(missions),
    units: lines, mvp: mvp(lines),
  };
}
