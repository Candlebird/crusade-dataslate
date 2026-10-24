import type { Force } from '../../model/types';
import { SORTIE } from '../downtimeData';
import { addQuirk, quirkInfo, trinketInfo } from '../sortie';
import { bankBeasts } from './bestiary';
import type { TrainingRun } from './types';

// What an ended run hands the force's Sortie side, at bank (useBank.finish, beside the XP): quirks gained, the trinket
// taken, the bestiary, and a nemesis slain. Once a run (run.shared).

/**
 * Bank a run's Sortie layer into the force (mutates it). Quirks go on through Sortie's addQuirk; a trinket is equipped
 * if its unit has none, else it goes to the spares (up to SORTIE.trinkets.spares); a nemesis slain is noted in
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
  const k = run.trinket?.id ? trinketInfo(run.trinket.id) : undefined;
  if (k && run.trinket?.id) {
    const u = run.trinket.unitId ? f.units.find((x) => x.id === run.trinket!.unitId) : undefined;
    if (u && !u.trinket) {
      u.trinket = run.trinket.id;
      out.push(`${u.name} carries the ${k.name}`);
    } else if ((story.trinkets?.length ?? 0) < SORTIE.trinkets.spares) {
      (story.trinkets ??= []).push(run.trinket.id);
      out.push(`The ${k.name} goes to the spares`);
    } else out.push(`The ${k.name} is left behind: the spares are full`);
  }
  out.push(...bankBeasts(story, run).map((s) => s.replace(/\.$/, '')));
  const n = run.nemesis;
  if (n?.slain) {
    (story.bled ??= {})[n.id] = (story.bled[n.id] ?? 0) + 1;
    out.push(`${n.name} will meet your next Sortie hurt`);
  }
  return out;
}

/** What the run will hand the Sortie side, for the summary: quirks, the trinket, the nemesis, Echoes slain. */
export function sharedPreview(run: TrainingRun): { text: string; good: boolean }[] {
  const out: { text: string; good: boolean }[] = [];
  for (const g of run.gains ?? []) {
    const q = quirkInfo(g.quirk);
    out.push({ text: `${g.name} comes away ${q?.name ?? g.quirk}${q ? `: ${q.text}` : ''}`, good: g.good });
  }
  const k = trinketInfo(run.trinket?.id);
  if (k) {
    const who = run.recipes.find((r) => r.unitId === run.trinket?.unitId)?.name;
    out.push({ text: `${k.name} ${who ? `for ${who} (to the spares if it already carries one)` : 'for the spares'}`, good: true });
  }
  if (run.nemesis?.slain) out.push({ text: `${run.nemesis.name} slain: it meets your next Sortie hurt and a trick short`, good: true });
  const slain = Object.entries(run.beasts ?? {}).reduce((n, [, b]) => n + b.slain, 0);
  if (slain) out.push({ text: `${slain} Echo${slain === 1 ? '' : 'es'} slain for the bestiary`, good: true });
  return out;
}
