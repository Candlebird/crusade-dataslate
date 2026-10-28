import { useCallback, useRef } from 'react';
import { useStore } from '../../model/store';
import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { nowIso, uid } from '../../model/factory';
import { bankOffTableXp, offTableKey } from '../../rules/downtime';
import { awardFeats, trainingFeats } from '../../rules/feats';
import { weekKey } from '../../rules/sortie';
import {
  bankDrill, bankFinale, bankHonours, bankShared, drillNews, featFacts, lordsSlain, mvp, postSiege, settleSieges, siegeDmg, siegeScore, takeXp, type TrainingRun,
} from '../../rules/training';
import { toast } from '../ui';
import { siegeWinLine } from './useSiegeSettle';

// Paying a run out to the force: XP as it lands (within the off-table limit), then at the end the best score, feats,
// who led the defence, records, titles and tales (records.ts bankHonours), the Final-wave ladder (veterancy.ts bankFinale) and the feats it earns (featFacts.ts), the Sortie layer (shared.ts bankShared), the
// Drill Honours (drillBank.ts) and, for a Weekly Siege in a campaign, its board (siegeBoard.ts postSiege). A run the
// Auto (debug) button played (run.auto) banks nothing more.

/** XP a unit earned this session, and what the off-table limit let it bank. */
interface Gain { name: string; earned: number; got: number }

export function useBank(force: Force, c?: Campaign) {
  const { update, updateForce } = useStore();
  const gains = useRef<Record<string, Gain>>({});
  const done = useRef(false);

  /** Bank whatever XP the run has earned since last time; a toast says who got it. */
  const bankXp = useCallback((run: TrainingRun) => {
    if (run.auto) return;
    const xp = takeXp(run);
    const ids = Object.keys(xp);
    if (!ids.length) return;
    const key = offTableKey(c, localDate());
    const lines: string[] = [];
    updateForce(force.id, (f) => {
      for (const id of ids) {
        const u = f.units.find((x) => x.id === id);
        if (!u) continue;
        const got = bankOffTableXp(u, xp[id], key);
        const name = run.recipes.find((r) => r.unitId === id)?.name ?? u.name;
        const g = (gains.current[id] ??= { name, earned: 0, got: 0 });
        g.earned += xp[id];
        g.got += got;
        lines.push(`${name} +${got} XP${got < xp[id] ? ' (off-table limit)' : ''}`);
      }
    });
    if (lines.length) toast(`Training: ${lines.join(', ')}.`);
  }, [force.id, c, updateForce]);

  /** Pay the end of the run once: the last XP, the best score, feats, and an MVP toast. */
  const finish = useCallback((run: TrainingRun) => {
    if (done.current || run.wave === 0) return;
    done.current = true;
    if (run.auto) {
      toast(`${run.cleared} wave${run.cleared === 1 ? '' : 's'} cleared. Auto was used: nothing banked.`);
      return;
    }
    bankXp(run);
    const lead = mvp(run);
    let feats: string[] = [];
    let shared: string[] = [];
    let honours: string[] = [];
    let drill: string[] = [];
    let finale: string[] = [];
    updateForce(force.id, (f) => {
      // The Drill counts first: an old force's start from its units' records, before this run joins them.
      const before = bankDrill(f, run);
      // Before the best moves: a new best is a highlight. Tales carry the campaign round, for the chronicle.
      const round = f.nexus?.factionId && c ? c.round ?? 1 : undefined;
      honours = bankHonours(f, run, localDate(), uid, round);
      if (run.cleared > (f.trainingBest ?? 0)) f.trainingBest = run.cleared;
      // Quirks, the bestiary and a slain nemesis go to the Sortie side with the XP.
      shared = bankShared(f, run);
      // The Victory, Endless depth and the Final it opens, before the Drill's news (Win at N goals read it).
      if (!run.siege) finale = bankFinale(f, run, localDate());
      // Feats after the ladder: opening a Final or winning every one counts this run.
      feats = awardFeats(f, trainingFeats(run.cleared, lordsSlain(run), featFacts(f, run)), run.crafted, localDate(), uid);
      drill = [...finale, ...drillNews(f, run, before)];
    });
    const dmg = siegeDmg(run);
    if (run.siege) drill = [`Weekly Siege ${run.siege}: ${dmg !== undefined ? `${dmg.toLocaleString()} damage to the colossus` : `wave ${siegeScore(run)}`}`, ...drill];
    if (c && run.siege) {
      update((s) => {
        const cc = s.campaign;
        const f = s.forces.find((x) => x.id === force.id);
        if (!cc || !f) return;
        cc.siegeBoard = postSiege(cc, f, run, localDate());
        drill.push(...settleSieges(cc, weekKey(localDate()), localDate()).map((w) => siegeWinLine(cc, w)));
        cc.updatedAt = nowIso();
      });
    }
    const got = Object.values(gains.current).filter((g) => g.earned > 0);
    const led = lead && lead.kills > 0 ? `${lead.name} led the defence with ${lead.kills} kill${lead.kills === 1 ? '' : 's'}. ` : '';
    const xp = got.length ? `XP banked: ${got.map((g) => `${g.name} +${g.got}`).join(', ')}.` : 'No XP this time.';
    toast(`${led}${run.cleared} wave${run.cleared === 1 ? '' : 's'} cleared. ${xp}${feats.length ? ` ${feats.join('. ')}.` : ''}${honours.length ? ` ${honours.join('. ')}.` : ''}${shared.length ? ` ${shared.join('. ')}.` : ''}${drill.length ? ` ${drill.join('. ')}.` : ''}`);
  }, [force.id, c, update, updateForce, bankXp]);

  /** A new run: forget the last one's tally. */
  const reset = useCallback(() => {
    gains.current = {};
    done.current = false;
  }, []);

  return { bankXp, finish, reset };
}
