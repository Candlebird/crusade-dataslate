import type { Campaign, Force } from './types';
import { unitsUsed } from '../rules/nexus';
import { EXPEDITION } from '../rules/downtimeData';
import { expeditionsLeft } from '../rules/downtime';
import { freeUnits } from '../rules/tasks';
import { canTrain } from '../rules/training/recipes';
import { canSortie } from '../rules/sortie';

export type DowntimeMode = 'expedition' | 'task' | 'patrol' | 'training' | 'sortie';

/** Why a unit task can't start for a force that isn't in a faction of the loaded campaign. */
export const NO_FACTION = 'Link this force to a Nexus Wars faction first.';

/**
 * Why each between-games mode can't start for the force now, or undefined when it can. The force page shows the reason
 * next to the greyed-out button so a player isn't left guessing. Expeditions and unit tasks need a faction in the
 * loaded campaign (`c`): without one, Expeditions aren't offered and unit tasks are listed but greyed out. A faction's
 * forces (`forces`) share its Expeditions for the round.
 */
export function downtimeBlocks(f: Force, c: Campaign | undefined, forces: Force[] = [f]): Partial<Record<DowntimeMode, string>> {
  const active = f.units.filter((u) => u.status === 'active').length;
  const none = active ? undefined : 'No active units: comatose and fallen units sit this out.';
  const out: Partial<Record<DowntimeMode, string>> = { patrol: none };
  if (!f.units.some(canTrain)) out.training = none;
  const party = f.units.filter(canSortie).length;
  if (party < 3) out.sortie = `A Sortie takes a party of 3 active units; ${f.name} has ${party}.`;
  if (c) {
    const used = unitsUsed(f, c);
    if (!f.units.some((u) => u.status === 'active' && !used.includes(u.id))) {
      out.expedition = none ?? 'Every unit has fought or been busy this round. They are free again when the GM ends the round.';
    }
    if (!freeUnits(f, c).length) out.task = out.expedition;
    if (!out.expedition && !expeditionsLeft(f, forces, c)) {
      out.expedition = `Your faction has run its ${EXPEDITION.perFaction} Expeditions this round, across all its forces. More when the GM ends the round.`;
    }
  } else out.task = NO_FACTION;
  for (const k of Object.keys(out) as DowntimeMode[]) if (!out[k]) delete out[k];
  return out;
}
