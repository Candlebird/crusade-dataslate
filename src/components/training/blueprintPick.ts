import { useEffect, useState } from 'react';
import { useCloud } from '../../cloud/CloudSync';
import { nowIso } from '../../model/factory';
import { useStore } from '../../model/store';
import { inRunsId, markInRuns, myBlueprints } from '../../rules/training';

// Which maze blueprint shows as the ghost in the player's runs (marked on the blueprint, so it syncs with the account and
// holds on every device), and whether the ghost is hidden (kept per device).

const PICK_KEY = 'training-blueprint';
const HIDE_KEY = 'training-blueprint-hide';

const read = (k: string): string | null => {
  try { return localStorage.getItem(k); } catch { return null; }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch { /* a private window: not remembered */ }
};

/** The id of the blueprint in use (null: none), and a setter. */
export function useBlueprintPick(): [string | null, (id: string | null) => void] {
  const { state, update } = useStore();
  const cloud = useCloud();
  const mine = myBlueprints(state.blueprints, cloud.email ?? undefined);
  const id = inRunsId(mine, read(PICK_KEY));
  const set = (v: string | null) => {
    write(PICK_KEY, v);
    const change = new Set(markInRuns(mine, v).map((b) => b.id));
    if (!change.size) return;
    const at = nowIso();
    update((d) => {
      for (const b of d.blueprints ?? []) {
        if (!change.has(b.id)) continue;
        if (b.id === v) b.inRuns = true;
        else delete b.inRuns;
        b.updatedAt = at;
      }
    });
  };
  // A pick made on this device before picks synced: mark it on the blueprint, so the player's other devices get it too.
  const unmarked = !!id && !mine.some((b) => b.inRuns);
  useEffect(() => { if (unmarked) set(id); }, [unmarked, id]);
  return [id, set];
}

/** Whether the ghost is hidden in runs, and a setter. */
export function useBlueprintHidden(): [boolean, (v: boolean) => void] {
  const [hidden, setHidden] = useState(() => read(HIDE_KEY) === '1');
  return [hidden, (v) => { setHidden(v); write(HIDE_KEY, v ? '1' : null); }];
}
