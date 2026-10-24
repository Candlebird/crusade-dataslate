import type { ForceSortie, SortieBeast } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { beastInfo } from '../sortie';
import type { TrainingRun } from './types';

// The bestiary Sortie keeps (ForceSortie.bestiary, by Echo datasheet name or 'lord:<id>'), fed from Training: each
// enemy kind counts as the Echo it stands for (TRAINING.shared.beasts), the nemesis as its lord, and a campaign's real
// lord under its own key ('nexus:<ECHO_LORDS id>' or 'nexus:g:<guardian name>'), slain for real.

/** The bestiary key a run tally counts under (none for a kind with no Echo). */
export function beastKey(run: TrainingRun, k: string): string | undefined {
  if (k === 'nemesis') return run.nemesis ? `lord:${run.nemesis.id}` : undefined;
  if (k.startsWith('real:')) return run.nexus?.lords[Number(k.slice(5))]?.key;
  return (TRAINING.shared.beasts as Record<string, string>)[k];
}

/** Has this entry's lore been learned (a kill, on a Sortie or, for a lord, in Training)? */
export const loreKnown = (b?: SortieBeast) => !!b && (b.slain > 0 || (b.drill ?? 0) > 0);

/**
 * Add a run's meetings and kills to a force's bestiary. A lord slain in Training counts as `drill`, not `slain`, so it
 * gives the nemesis no rematch trick. Returns a line for each Echo met for the first time or whose lore it learned.
 */
export function bankBeasts(story: ForceSortie, run: TrainingRun): string[] {
  const out: string[] = [];
  for (const [k, n] of Object.entries(run.beasts ?? {})) {
    const key = beastKey(run, k);
    if (!key || (!n.met && !n.slain)) continue;
    const book = (story.bestiary ??= {});
    const was = book[key];
    const knew = loreKnown(was);
    const b: SortieBeast = { ...(was ?? { met: 0, slain: 0 }) };
    b.met += n.met;
    if (key.startsWith('lord:')) { if (n.slain) b.drill = (b.drill ?? 0) + n.slain; }
    else b.slain += n.slain;
    book[key] = b;
    const name = beastInfo(key).name;
    if (!was) out.push(`Bestiary: ${name} met for the first time.`);
    if (!knew && loreKnown(b)) out.push(`Bestiary: ${name}'s lore learned.`);
  }
  return out;
}
