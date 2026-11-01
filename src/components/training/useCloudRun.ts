import { useEffect, useMemo, useRef } from 'react';
import { useCloud } from '../../cloud/CloudSync';
import { uid } from '../../model/factory';
import { useStore } from '../../model/store';
import { cloudRunOf, cloudSave, movedOn, type CloudRun, type SavedRun, type TrainingRun } from '../../rules/training';
import { toast } from '../ui';

// A force's Training run in progress, kept in the cloud (rules/training/cloudRun.ts) for its signed-in player, so it can
// be picked up on another device. The local save still comes first on the device that plays it.

const DEVICE_KEY = 'device-id';
/** How long after the last move in a build phase the cloud copy is written. */
const SOON_MS = 4000;

/** This browser's id (kept in localStorage), to tell its writes from another device's. */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'local';
  }
}

export interface CloudRunApi {
  /** The cloud's save of this force's run, if any (and playable). */
  saved: SavedRun | null;
  /** The run was picked up (or started): from now on, another device's write means it moved on there. */
  adopt: (run: TrainingRun) => void;
  /** Write the run now (between waves only). */
  push: (run: TrainingRun) => void;
  /** Write it a few seconds after the last move. */
  pushSoon: (run: TrainingRun) => void;
  /** The run ended: drop the cloud copy. */
  drop: () => void;
  /** Has the open run moved on on another device since this one last wrote or picked it up? */
  movedOn: boolean;
}

export function useCloudRun(forceId: string): CloudRunApi {
  const { state, update } = useStore();
  const cloud = useCloud();
  const device = useMemo(deviceId, []);
  const entry = state.trainingRuns?.find((r) => r.forceId === forceId);
  const live = useRef<CloudRun | undefined>(entry);
  live.current = entry;
  const since = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const warned = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);

  const gone = () => since.current !== null && movedOn(live.current, device, since.current);
  const push = (run: TrainingRun) => {
    clearTimeout(timer.current);
    if (!cloud.email || run.phase !== 'build' || gone()) return;
    const c = cloudRunOf(run, cloud.email, device);
    if (!c) {
      if (!warned.current) toast('This run has grown too big to sync; it stays saved on this device only.', 'error');
      warned.current = true;
      return;
    }
    since.current = c.updatedAt;
    update((d) => { d.trainingRuns = [...(d.trainingRuns ?? []).filter((r) => r.forceId !== c.forceId), c]; });
  };
  return {
    saved: useMemo(() => cloudSave(entry, forceId), [entry, forceId]),
    adopt: (run) => {
      since.current = live.current?.updatedAt ?? '';
      push(run);
    },
    push,
    pushSoon: (run) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => push(run), SOON_MS);
    },
    drop: () => {
      clearTimeout(timer.current);
      since.current = null;
      update((d) => {
        if (d.trainingRuns?.some((r) => r.forceId === forceId)) d.trainingRuns = d.trainingRuns.filter((r) => r.forceId !== forceId);
      });
    },
    movedOn: gone(),
  };
}
