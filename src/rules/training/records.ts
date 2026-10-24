import type { Force, ForceTale, TrainingRecord, Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { unitTowers } from './board';
import { finalBoss } from './finale';
import { lordWaves } from './lordPick';
import { mvp } from './run';
import { talesOf, type Highlight } from './tales';
import { earnTitles, heldTitles, recordTitles, TITLES, titleInfo, trainingTitles, type TitleId, type TrainDeed } from './titles';
import type { RunHonours, TitleGain, TrainingRun, UnitTower } from './types';

// Training records (F4): what each crafted unit did over every run it stood in (Unit.trainingRecord), the titles a
// run earns, and the tales it tells. runHonours works it out without touching the force (the summary shows it);
// bankHonours hands it over once, beside the XP and the Sortie layer (useBank.finish).

export const blankRecord = (): TrainingRecord => ({ best: 0, kills: 0, lords: 0, runs: 0, mvps: 0 });

/** Battle scars that count (not the ones veterans.notScars leaves out). */
const scarsOf = (u?: Unit) => (u?.scars ?? []).filter((s) => !TRAINING.veterans.notScars.includes(s.name)).length;

/** What a crafted unit did this run, for its record and titles. */
export function deedOf(run: TrainingRun, t: UnitTower, u?: Unit): TrainDeed {
  const lead = mvp(run);
  return {
    cleared: run.cleared,
    kills: t.kills,
    holds: t.tally?.holds ?? 0,
    lords: (run.nexus?.lords ?? []).filter((l) => l.slain && l.by === t.unitId).length,
    nemesis: !!run.nemesis?.slain && run.nemesis.by === t.unitId,
    mvp: lead === t && t.kills > 0,
    scars: scarsOf(u),
    clean: run.clean ?? 0,
  };
}

/** A record with one more run in it (a copy). Lords count the real ones and the nemesis it slew. */
export function recordAfter(rec: TrainingRecord | undefined, d: TrainDeed): TrainingRecord {
  const r = rec ?? blankRecord();
  return {
    best: Math.max(r.best, d.cleared),
    kills: r.kills + d.kills,
    lords: r.lords + d.lords + (d.nemesis ? 1 : 0),
    runs: r.runs + 1,
    mvps: r.mvps + (d.mvp ? 1 : 0),
  };
}

/** Titles a unit would earn from this run: its deeds, and its record after it (list order, none it holds already). */
function newTitles(u: Unit, d: TrainDeed, rec: TrainingRecord): TitleId[] {
  const before = heldTitles(u);
  const ids = [...recordTitles({ ...u, trainingRecord: rec }), ...trainingTitles(d)];
  return TITLES.map((t) => t.id).filter((id) => ids.includes(id) && !before.includes(id));
}

/** A unit's name in the run (its recipe's), else the maze's. */
const nameOf = (run: TrainingRun, id?: string) => (id && run.recipes.find((r) => r.unitId === id)?.name) || 'the maze';

/**
 * What the run hands the force, worked out without changing it: each crafted unit's record after the run, the titles
 * it earns, whether it beat the force's best (`best`, default force.trainingBest), and its tales (tales.ts).
 */
export function runHonours(run: TrainingRun, force: Force, best = force.trainingBest ?? 0): RunHonours {
  const records: Record<string, TrainingRecord> = {};
  const titles: TitleGain[] = [];
  for (const t of unitTowers(run)) {
    const u = force.units.find((x) => x.id === t.unitId);
    if (!u) continue;
    const d = deedOf(run, t, u);
    records[u.id] = recordAfter(u.trainingRecord, d);
    for (const id of newTitles(u, d, records[u.id])) titles.push({ unitId: u.id, name: t.name, title: id });
  }
  const isBest = run.cleared > best && run.cleared > 0;
  const lead = mvp(run);
  const base = { force: force.name, wave: String(run.cleared) };
  const hs: Highlight[] = [];
  const n = run.nemesis;
  if (n?.slain) hs.push({ kind: 'nemesis', units: n.by ? [n.by] : [], vars: { ...base, unit: nameOf(run, n.by), lord: n.name, wave: String(TRAINING.shared.nemesis.wave) } });
  const fin = run.finale;
  if (fin?.slain && fin.victory) {
    hs.push({ kind: 'victory', units: fin.by ? [fin.by] : [], vars: { ...base, unit: nameOf(run, fin.by), lord: finalBoss(run), wave: String(fin.final) } });
  }
  if (isBest) hs.push({ kind: 'best', units: lead ? [lead.unitId] : [], vars: { ...base, unit: lead?.name ?? 'the maze' } });
  const waves = lordWaves(run.nexus, !!run.nemesis, run.finale?.final);
  (run.nexus?.lords ?? []).forEach((l, i) => {
    if (l.slain) hs.push({ kind: 'lord', units: l.by ? [l.by] : [], vars: { ...base, unit: nameOf(run, l.by), lord: l.name, wave: String(waves[i] ?? run.cleared) } });
  });
  for (const g of titles) hs.push({ kind: 'title', units: [g.unitId], vars: { ...base, unit: g.name, title: titleInfo(g.title)?.name ?? g.title } });
  return { records, titles, best: isBest, tales: talesOf(hs, run.seed) };
}

/**
 * Bank the run's honours into the force (mutates both), once (run.honours): records, titles (via titles.earnTitles)
 * and tales (newest first, the last TRAINING.records.keep kept; `round` the campaign round, for the chronicle). Call
 * it before force.trainingBest takes this run. Returns a line for each title earned and the force's new best.
 */
export function bankHonours(f: Force, run: TrainingRun, date: string, newId: () => string, round?: number): string[] {
  if (run.honours) return [];
  const h = runHonours(run, f);
  run.honours = h;
  for (const [id, rec] of Object.entries(h.records)) {
    const u = f.units.find((x) => x.id === id);
    if (!u) continue;
    const before = heldTitles(u);
    u.trainingRecord = rec;
    earnTitles(u, h.titles.filter((g) => g.unitId === id).map((g) => g.title as TitleId), before);
  }
  if (h.tales.length) {
    const told: ForceTale[] = h.tales.map((t) => ({ id: newId(), date, ...(round !== undefined ? { round } : {}), ...t }));
    f.tales = [...told, ...(f.tales ?? [])].slice(0, TRAINING.records.keep);
  }
  return [
    ...(h.best ? [`A new best: ${run.cleared} waves`] : []),
    ...h.titles.map((g) => `${g.name} is now known as ${titleInfo(g.title)?.name ?? g.title}`),
  ];
}

/** A Training record in a line, for the unit card and the run summary. */
export function recordLine(r: TrainingRecord): string {
  const s = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return `best wave ${r.best} · ${s(r.kills, 'kill')} · ${s(r.lords, 'lord')} slain · ${s(r.runs, 'run')} · ${s(r.mvps, 'MVP')}`;
}

/** The force's tales about one unit, newest first. */
export const talesFor = (f: Force, unitId: string): ForceTale[] => (f.tales ?? []).filter((t) => t.units.includes(unitId));
