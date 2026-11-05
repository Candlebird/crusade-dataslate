import { readSaved } from './save';
import type { SavedWarpath, WarpathRun } from './types';
import { WARPATH_VERSION } from './sim';

// A Warpath run in progress, synced as shared/warpathrun-<forceId> (like Training's) so it can be picked up on another
// device. Written every minute of play, at each level-up and on leaving; dropped when the run ends. A full field is
// about 300 kB; a copy over the document limit stays on the device.

export interface CloudWarpath {
  forceId: string;
  owner: string;
  device: string;
  updatedAt: string;
  saved: SavedWarpath;
}

export const WARPATH_RUN_PREFIX = 'shared/warpathrun-';
const MAX_BYTES = 900_000;
/** Log lines a synced run keeps. */
const LOG_KEEP = 200;

export const cloudWarpathJson = (c: CloudWarpath) => JSON.stringify(c);

export function cloudWarpathOf(run: WarpathRun, owner: string, device: string, at = new Date().toISOString()): CloudWarpath | null {
  const slim = JSON.parse(JSON.stringify({ ...run, fx: [] })) as WarpathRun;
  slim.log = slim.log.slice(-LOG_KEEP);
  const c: CloudWarpath = { forceId: run.forceId, owner, device, updatedAt: at, saved: { v: WARPATH_VERSION, savedAt: at, run: slim } };
  return new TextEncoder().encode(cloudWarpathJson(c)).length <= MAX_BYTES ? c : null;
}

/** The cloud copy's save, if this version can play it on. */
export function cloudWarpathSave(c: CloudWarpath | undefined, forceId: string): SavedWarpath | null {
  if (!c || c.forceId !== forceId) return null;
  const s = readSaved(c.saved);
  return s && s.run.forceId === forceId ? s : null;
}
