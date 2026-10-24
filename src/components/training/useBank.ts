import { useCallback, useRef } from 'react';
import { useStore } from '../../model/store';
import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { uid } from '../../model/factory';
import { bankOffTableXp, offTableKey } from '../../rules/downtime';
import { awardFeats, trainingFeats } from '../../rules/feats';
import { bankShared, lordsSlain, mvp, takeXp, type TrainingRun } from '../../rules/training';
import { toast } from '../ui';

// Paying a run out to the force: XP as it lands (within the off-table limit), then at the end the best score, feats,
// who led the defence, and the Sortie layer (shared.ts bankShared).

/** XP a unit earned this session, and what the off-table limit let it bank. */
interface Gain { name: string; earned: number; got: number }

export function useBank(force: Force, c?: Campaign) {
  const { updateForce } = useStore();
  const gains = useRef<Record<string, Gain>>({});
  const done = useRef(false);

  /** Bank whatever XP the run has earned since last time; a toast says who got it. */
  const bankXp = useCallback((run: TrainingRun) => {
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
    bankXp(run);
    const lead = mvp(run);
    let feats: string[] = [];
    let shared: string[] = [];
    updateForce(force.id, (f) => {
      if (run.cleared > (f.trainingBest ?? 0)) f.trainingBest = run.cleared;
      feats = awardFeats(f, trainingFeats(run.cleared, lordsSlain(run)), run.crafted, localDate(), uid);
      // Quirks, the trinket, the bestiary and a slain nemesis go to the Sortie side with the XP.
      shared = bankShared(f, run);
    });
    const got = Object.values(gains.current).filter((g) => g.earned > 0);
    const led = lead && lead.kills > 0 ? `${lead.name} led the defence with ${lead.kills} kill${lead.kills === 1 ? '' : 's'}. ` : '';
    const xp = got.length ? `XP banked: ${got.map((g) => `${g.name} +${g.got}`).join(', ')}.` : 'No XP this time.';
    toast(`${led}${run.cleared} wave${run.cleared === 1 ? '' : 's'} cleared. ${xp}${feats.length ? ` ${feats.join('. ')}.` : ''}${shared.length ? ` ${shared.join('. ')}.` : ''}`);
  }, [force.id, updateForce, bankXp]);

  /** A new run: forget the last one's tally. */
  const reset = useCallback(() => {
    gains.current = {};
    done.current = false;
  }, []);

  return { bankXp, finish, reset };
}
