import type { Force } from '../../model/types';
import { addQuirk, quirkInfo } from '../sortie';
import { bankBeasts } from './bestiary';
import type { TrainingRun } from './types';

// What an ended run hands the force's Sortie side, at bank (useBank.finish, beside the XP): quirks gained, the bestiary
// and a nemesis slain. Once a run (run.shared).

/**
 * Bank a run's Sortie layer into the force (mutates it). Quirks go on through Sortie's addQuirk; a nemesis slain is noted in
 * ForceSortie.bled for its next Sortie meeting. Returns a line for each thing that changed.
 */
export function bankShared(f: Force, run: TrainingRun): string[] {
  if (run.shared) return [];
  run.shared = true;
  const out: string[] = [];
  for (const g of run.gains ?? []) {
    const u = f.units.find((x) => x.id === g.unitId);
    if (u && addQuirk(u, g.quirk)) out.push(`${g.name} is now ${quirkInfo(g.quirk)?.name ?? g.quirk}`);
  }
  const story = (f.sortie ??= {});
  out.push(...bankBeasts(story, run).map((s) => s.replace(/\.$/, '')));
  const n = run.nemesis;
  if (n?.slain) {
    (story.bled ??= {})[n.id] = (story.bled[n.id] ?? 0) + 1;
    out.push(`${n.name} will meet your next Sortie hurt`);
  }
  return out;
}

/** What the run will hand the Sortie side, for the summary: quirks, the nemesis, Echoes slain. */
export function sharedPreview(run: TrainingRun): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  for (const g of run.gains ?? []) {
    const q = quirkInfo(g.quirk);
    out.push({ text: `${g.name} comes away ${q?.name ?? g.quirk}${q ? `: ${q.text}` : ''}`, good: g.good });
  }
  if (run.nemesis?.slain) out.push({ text: `${run.nemesis.name} slain: it meets your next Sortie hurt and a trick short`, good: true });
  for (const l of run.nexus?.lords ?? []) if (l.slain) out.push({ text: `${l.name} (${l.tier}) slain: marked slain in the bestiary`, good: true });
  const slain = Object.entries(run.beasts ?? {}).reduce((n, [, b]) => n + b.slain, 0);
  if (slain) out.push({ text: `${slain} Echo${slain === 1 ? '' : 'es'} slain for the bestiary`, good: true });
  return out;
}
