import { WARPATH_VERSION } from './sim';
import type { SavedWarpath, WarpathRun } from './types';

// One saved run per force in localStorage (and the same shape in the cloud), as JSON with its dice state, so it plays on
// as it would have. Floating numbers are left behind.

export const warpathKey = (forceId: string) => `warpathRun:${forceId}`;

function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Is it a run this version reads? */
export function isWarpath(x: unknown): x is WarpathRun {
  const r = x as Partial<WarpathRun> | null;
  return !!r && typeof r === 'object' && r.v === WARPATH_VERSION && typeof r.forceId === 'string' && typeof r.rng === 'number'
    && Array.isArray(r.squads) && Array.isArray(r.enemies) && Array.isArray(r.bench);
}

/** The run ready to save: no fx. */
export const packRun = (run: WarpathRun): SavedWarpath => ({ v: WARPATH_VERSION, savedAt: new Date().toISOString(), run: JSON.parse(JSON.stringify({ ...run, fx: [] })) });

export function saveWarpath(run: WarpathRun): SavedWarpath | null {
  try {
    const saved = packRun(run);
    store()?.setItem(warpathKey(run.forceId), JSON.stringify(saved));
    return saved;
  } catch {
    return null;
  }
}

/** A saved run back, or null (none, unreadable, another version, or over). */
export function readSaved(x: unknown): SavedWarpath | null {
  const s = x as Partial<SavedWarpath> | null;
  if (!s || s.v !== WARPATH_VERSION || !isWarpath(s.run) || s.run.phase === 'over') return null;
  return { v: s.v, savedAt: s.savedAt ?? '', run: { ...s.run, fx: [] } };
}

export function loadWarpath(forceId: string): SavedWarpath | null {
  try {
    const raw = store()?.getItem(warpathKey(forceId));
    return raw ? readSaved(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearWarpath(forceId: string): void {
  try {
    store()?.removeItem(warpathKey(forceId));
  } catch {
    // Nothing to clear.
  }
}

/** The newer of two saves. */
export const newerWarpath = (a: SavedWarpath | null, b: SavedWarpath | null) => (!a ? b : !b ? a : a.savedAt >= b.savedAt ? a : b);
