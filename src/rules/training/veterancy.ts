import type { Force, ForceFinale } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { endlessDepth } from './finaleCore';
import type { TrainingRun } from './types';

// The force's Final-wave ladder (TRAINING.finale): its veterancy (every XP its units have held between them, never
// dropping), which Final is open, its Victories and Endless depth. Pure but for noteVeterancy and bankFinale, which
// write force.finale (the store notes veterancy on every change; useBank banks a run once).

const F = TRAINING.finale;

/** XP the force's units hold now, every unit counted (removed ones too). */
export const unitXp = (f: Pick<Force, 'units'>): number => f.units.reduce((n, u) => n + Math.max(0, u.xp || 0), 0);

/** The force's veterancy: the most XP its units have held between them (stored, or more now). */
export const veterancyOf = (f: Pick<Force, 'units' | 'finale'>): number => Math.max(f.finale?.vet ?? 0, unitXp(f));

/** The veterancy Final wave `n` asks for (finale.bars; none for the first). */
export const stepBar = (n: number): number => F.bars[n] ?? 0;

/** The highest Final the force has won (0: none). */
export const finalWon = (f: Pick<Force, 'finale'>): number =>
  Object.keys(f.finale?.wins ?? {}).reduce((n, k) => Math.max(n, Number(k) || 0), 0);

/** The Final wave open to the force: from the stored one up, a step at a time while it has won the Final below and its
 *  veterancy reaches the bar. */
export function finaleOpen(f: Pick<Force, 'units' | 'finale'>): number {
  const vet = veterancyOf(f);
  let n = Math.min(F.to, Math.max(F.from, f.finale?.open ?? F.from));
  while (n < F.to && f.finale?.wins[String(n)] && vet >= stepBar(n + F.step)) n += F.step;
  return n;
}

const blank = (): ForceFinale => ({ vet: 0, open: F.from, wins: {} });

/** Note the force's veterancy and the Final it opens (mutates force.finale, only when either grew). */
export function noteVeterancy(f: Force): void {
  const vet = veterancyOf(f);
  const open = finaleOpen(f);
  if (vet <= (f.finale?.vet ?? 0) && open <= (f.finale?.open ?? F.from)) return;
  f.finale = { ...(f.finale ?? blank()), vet, open };
}

/** Did the run win its Final (the boss slain, the Victory taken one way or another). */
export const runWon = (run: TrainingRun): boolean => !!run.finale?.slain && !!run.finale.victory;

/** The force's ladder with the run in it (a copy): its Victory (the first at each Final dated `date`), Endless depth
 *  and the Final that opens. */
export function finaleAfter(f: Force, run: TrainingRun, date: string): ForceFinale {
  const cur = f.finale ?? blank();
  const out: ForceFinale = { ...cur, wins: { ...cur.wins }, vet: veterancyOf(f) };
  if (runWon(run)) out.wins[String(run.finale!.final)] ??= date;
  const deep = endlessDepth(run);
  if (deep > (out.endless ?? 0)) out.endless = deep;
  out.open = finaleOpen({ units: f.units, finale: out });
  return out;
}

/** Bank the run into force.finale, once (run.finale.banked): lines for a Victory, a deeper Endless and a Final opened. */
export function bankFinale(f: Force, run: TrainingRun, date: string): string[] {
  if (!run.finale || run.finale.banked) return [];
  const before = f.finale ?? blank();
  const after = finaleAfter(f, run, date);
  f.finale = after;
  run.finale.banked = true;
  const out: string[] = [];
  const n = run.finale.final;
  if (runWon(run)) out.push(before.wins[String(n)] ? `Victory at the Final wave ${n}` : `First Victory at the Final wave ${n}`);
  if ((after.endless ?? 0) > (before.endless ?? 0)) out.push(`Endless: ${after.endless} wave${after.endless === 1 ? '' : 's'} past the Final, a new deepest`);
  if (after.open > before.open) out.push(`The Final wave ${after.open} opens`);
  return out;
}

/** One step of the ladder for the start screen: its Final, the veterancy it asks, won or not, open or not. */
export interface FinaleStep {
  n: number;
  bar: number;
  won: boolean;
  open: boolean;
}

/** The ladder from finale.from to finale.to, and the force's veterancy. */
export function finaleTrack(f: Pick<Force, 'units' | 'finale'>): { vet: number; open: number; steps: FinaleStep[] } {
  const open = finaleOpen(f);
  const steps: FinaleStep[] = [];
  for (let n = F.from; n <= F.to; n += F.step) steps.push({ n, bar: stepBar(n), won: !!f.finale?.wins[String(n)], open: n <= open });
  return { vet: veterancyOf(f), open, steps };
}
