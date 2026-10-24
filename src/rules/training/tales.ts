import type { ForceTale } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { TALE_TEXT } from './taleText';
import type { RunHonours } from './types';

// Training tales (F4): a story only for a highlight (the nemesis slain, a new best, a real lord slain, a title
// earned), one each, at most TRAINING.records.tales a run. The words come from taleText.ts, picked by the run's seed.

export type TaleKind = ForceTale['kind'];
export type Tale = RunHonours['tales'][number];

/** One highlight to tell: its kind, the units it is about, and the words to fill in. */
export interface Highlight {
  kind: TaleKind;
  units: string[];
  vars: Partial<Record<'force' | 'unit' | 'wave' | 'lord' | 'title', string>>;
}

/** Which of `n` lines to tell: from the seed and the tale's place, so a run always tells the same. */
function lineOf(seed: number, i: number, n: number): number {
  let h = 2166136261;
  for (const ch of `tale:${seed}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0) % n;
}

/** The words of a tale: a line for its kind, filled in. */
export function taleText(h: Highlight, seed: number, i: number): string {
  const pool = TALE_TEXT[h.kind];
  return pool[lineOf(seed, i, pool.length)].replace(/\{(\w+)\}/g, (_, k: string) => h.vars[k as keyof Highlight['vars']] ?? '');
}

/** The run's tales: highlights in priority order (nemesis, best, lords, titles), one each, at most records.tales. */
export function talesOf(highlights: Highlight[], seed: number): Tale[] {
  const order: TaleKind[] = ['nemesis', 'best', 'lord', 'title'];
  return [...highlights]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, TRAINING.records.tales)
    .map((h, i) => ({ kind: h.kind, units: h.units, text: taleText(h, seed, i) }));
}
