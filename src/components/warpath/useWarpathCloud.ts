import { useMemo, useRef } from 'react';
import { useCloud } from '../../cloud/CloudSync';
import { useStore } from '../../model/store';
import { cloudWarpathOf, cloudWarpathSave, type CloudWarpath } from '../../rules/warpath/cloud';
import type { SavedWarpath, WarpathRun } from '../../rules/warpath';
import { toast } from '../ui';
import { deviceId } from '../training/useCloudRun';

// A force's Warpath run in progress, kept in the cloud for its signed-in player (rules/warpath/cloud.ts), as Training's is.

export interface WarpathCloud {
  saved: SavedWarpath | null;
  adopt: (run: WarpathRun) => void;
  push: (run: WarpathRun) => void;
  drop: () => void;
  movedOn: boolean;
}

export function useWarpathCloud(forceId: string): WarpathCloud {
  const { state, update } = useStore();
  const cloud = useCloud();
  const device = useMemo(deviceId, []);
  const entry = state.warpathRuns?.find((r) => r.forceId === forceId);
  const live = useRef<CloudWarpath | undefined>(entry);
  live.current = entry;
  const since = useRef<string | null>(null);
  const warned = useRef(false);
  const gone = () => since.current !== null && !!live.current && live.current.device !== device && live.current.updatedAt > since.current;

  const push = (run: WarpathRun) => {
    if (!cloud.email || run.auto || run.phase === 'over' || gone()) return;
    const c = cloudWarpathOf(run, cloud.email, device);
    if (!c) {
      if (!warned.current) toast('This run has grown too big to sync; it stays saved on this device only.', 'error');
      warned.current = true;
      return;
    }
    since.current = c.updatedAt;
    update((d) => { d.warpathRuns = [...(d.warpathRuns ?? []).filter((r) => r.forceId !== c.forceId), c]; });
  };
  return {
    saved: useMemo(() => cloudWarpathSave(entry, forceId), [entry, forceId]),
    adopt: (run) => {
      since.current = live.current?.updatedAt ?? '';
      push(run);
    },
    push,
    drop: () => {
      since.current = null;
      update((d) => {
        if (d.warpathRuns?.some((r) => r.forceId === forceId)) d.warpathRuns = d.warpathRuns.filter((r) => r.forceId !== forceId);
      });
    },
    movedOn: gone(),
  };
}
