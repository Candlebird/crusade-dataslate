import { useEffect } from 'react';
import { useStore } from '../../model/store';
import type { Campaign, SiegeWin } from '../../model/types';
import { localDate } from '../../model/date';
import { nowIso, uid } from '../../model/factory';
import { useCloud } from '../../cloud/CloudSync';
import { weekKey } from '../../rules/sortie';
import { collectSiege, rewardWords, settleSieges, siegeOwed, weeksDue } from '../../rules/training/siegeBoard';
import { modeName } from '../../rules/training/modes';
import { toast } from '../ui';

// Settling the campaign's finished Weekly Siege weeks (Training and the round panel), without the Training engine, and
// collecting this browser's own forces' damage-check rewards (only a force's owner may write it, as with Nexus Duels).

/** This week's key (the Sortie weekly's). */
export const thisWeek = () => weekKey(localDate());

/** A settled week (or one of its damage checks) in a line, for a toast. */
export function siegeWinLine(c: Campaign, w: SiegeWin): string {
  const faction = c.factions.find((f) => f.id === w.factionId)?.name;
  if (w.tier) {
    const assets = faction && w.assets ? `${w.assets} Strategic Asset${w.assets > 1 ? 's' : ''} for ${faction}, ` : '';
    return `Weekly Siege ${w.week}${w.mode ? ` (${modeName(w.mode)})` : ''}, damage check at wave ${w.tier}: ${w.force} won with ${(w.dmg ?? 0).toLocaleString()} damage (${assets}${rewardWords({ us: w.us, rp: w.rp })} for the force)`;
  }
  return `Weekly Siege ${w.week}: ${w.force} won at wave ${w.score}${faction ? `, a Strategic Asset for ${faction}` : ''}`;
}

/** Settle the campaign's Weekly Siege weeks that are over (each winner's faction gets its Strategic Assets), once,
 *  then collect what this browser's forces won at the damage checks. */
export function useSiegeSettle(c?: Campaign) {
  const { state, update, updateForce } = useStore();
  const cloud = useCloud();
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

  const mine = state.forces.filter((f) => !f.owner || f.owner === cloud.email);
  const owed = c ? mine.flatMap((f) => siegeOwed(c, f).map((w) => `${f.id}:${w.week}:${w.mode ?? ''}:${w.tier}`)).join(',') : '';
  useEffect(() => {
    if (!owed || !c) return;
    for (const f of mine) {
      const lines = collectSiege(c, structuredClone(f), localDate(), () => '');
      if (!lines.length) continue;
      updateForce(f.id, (fd) => void collectSiege(c, fd, localDate(), uid));
      toast(`${f.name} — ${lines.join('. ')}.`);
    }
  }, [owed]); // eslint-disable-line react-hooks/exhaustive-deps
}
