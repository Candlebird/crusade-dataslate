import { deserialize, SAVE_VERSION, serialize } from './save';
import type { SavedRun, TrainingRun } from './types';

// A run in progress, synced (as shared/trainingrun-<forceId>, like zone saves) so it can be picked up on another device.
// The local save (save.ts) stays the one a device plays from; this copy is written at every build-phase change (and a
// few seconds after the last move while building), and the start screen resumes whichever is newer. It goes when the
// run ends. A Firestore document holds at most 1 MiB: the copy keeps only the last CLOUD_LOG_KEEP log lines (display
// only) and is never written over CLOUD_RUN_MAX_BYTES, which leaves a wide margin for the field names and path.

export interface CloudRun {
  forceId: string;
  /** Who is playing it (the signed-in email). */
  owner: string;
  /** The device that wrote it (deviceId), to spot a run that moved on elsewhere. */
  device: string;
  updatedAt: string;
  saved: SavedRun;
}

export const CLOUD_RUN_PREFIX = 'shared/trainingrun-';
/** Most bytes (UTF-8) a synced run's document JSON may take; Firestore's limit is 1,048,576 for the whole document. */
export const CLOUD_RUN_MAX_BYTES = 900_000;
/** Log lines a synced run keeps (the side panel shows the last 20). */
export const CLOUD_LOG_KEEP = 200;

/** The document JSON for a cloud run (docs.ts writes exactly this). */
export const cloudRunJson = (c: CloudRun) => JSON.stringify(c);

/** UTF-8 bytes of a string. */
export const utf8Bytes = (s: string) => new TextEncoder().encode(s).length;

/** The run as synced (log trimmed, shots on screen left behind), or null when it would not fit in a document. */
export function cloudRunOf(run: TrainingRun, owner: string, device: string, at = new Date().toISOString()): CloudRun | null {
  const slim = JSON.parse(serialize(run)) as TrainingRun;
  slim.log = slim.log.slice(-CLOUD_LOG_KEEP);
  const c: CloudRun = { forceId: run.forceId, owner, device, updatedAt: at, saved: { v: SAVE_VERSION, savedAt: at, run: slim } };
  return utf8Bytes(cloudRunJson(c)) <= CLOUD_RUN_MAX_BYTES ? c : null;
}

/** A cloud run's save, if it is one this version can play on (not over, the right force). */
export function cloudSave(c: CloudRun | undefined, forceId: string): SavedRun | null {
  if (!c || c.forceId !== forceId || c.saved?.v !== SAVE_VERSION) return null;
  const run = deserialize(JSON.stringify(c.saved.run));
  if (!run || run.phase === 'over' || run.forceId !== forceId) return null;
  return { v: SAVE_VERSION, savedAt: c.saved.savedAt, run };
}

/** The save to resume: the newer of this device's and the cloud's. */
export function newerSave(local: SavedRun | null, cloud: SavedRun | null): SavedRun | null {
  if (!local || !cloud) return local ?? cloud;
  return cloud.savedAt > local.savedAt ? cloud : local;
}

/** Has the run moved on on another device since `since` (when this device last saved or picked it up)? */
export const movedOn = (c: CloudRun | undefined, device: string, since: string): boolean =>
  !!c && c.device !== device && c.updatedAt > since;
