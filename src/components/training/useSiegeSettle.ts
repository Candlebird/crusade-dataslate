import { useEffect } from 'react';
import { useStore } from '../../model/store';
import type { Campaign, SiegeWin } from '../../model/types';
import { localDate } from '../../model/date';
import { nowIso } from '../../model/factory';
import { weekKey } from '../../rules/sortie';
import { settleSieges, weeksDue } from '../../rules/training/siegeBoard';
import { toast } from '../ui';

// Settling the campaign's finished Weekly Siege weeks (Training and the round panel), without the Training engine.

/** This week's key (the Sortie weekly's). */
export const thisWeek = () => weekKey(localDate());

/** A settled week in a line, for a toast. */
export function siegeWinLine(c: Campaign, w: SiegeWin): string {
  const faction = c.factions.find((f) => f.id === w.factionId)?.name;
  return `Weekly Siege ${w.week}: ${w.force} won at wave ${w.score}${faction ? `, a Strategic Asset for ${faction}` : ''}`;
}

/** Settle the campaign's Weekly Siege weeks that are over (each winner's faction gets its Strategic Asset), once. */
export function useSiegeSettle(c?: Campaign) {
  const { update } = useStore();
  const due = c ? weeksDue(c, thisWeek()).join(',') : '';
  useEffect(() => {
    if (!due) return;
    const lines: string[] = [];
    update((s) => {
      const cc = s.campaign;
      if (!cc) return;
      const won = settleSieges(cc, thisWeek(), localDate());
      if (!won.length) return;
      cc.updatedAt = nowIso();
      lines.push(...won.map((w) => siegeWinLine(cc, w)));
    });
    if (lines.length) toast(`${lines.join('. ')}.`);
  }, [due, update]);
}
