import type { SavedRun, TrainingRun } from './types';

// One saved run per force in localStorage, as JSON (the dice state with it, so it plays on as it would have).

export const saveKey = (forceId: string) => `trainingRun:${forceId}`;

/** The run as JSON; shots and blows on screen are left behind. */
export function serialize(run: TrainingRun): string {
  return JSON.stringify({ ...run, fx: [] });
}

/** Is it shaped like a run this version reads (the fields everything else leans on)? */
function isRun(x: unknown): x is TrainingRun {
  const r = x as Partial<TrainingRun> | null;
  return !!r && typeof r === 'object' && r.v === 1 && typeof r.forceId === 'string' && typeof r.rng === 'number'
    && typeof r.wave === 'number' && Array.isArray(r.pieces) && Array.isArray(r.enemies) && Array.isArray(r.queue)
    && !!r.draft && !!r.mods;
}

/** A run back from JSON, or null if it isn't one this version reads. */
export function deserialize(s: string): TrainingRun | null {
  try {
    const x = JSON.parse(s);
    if (!isRun(x)) return null;
    return { ...x, fx: [], cover: x.cover ?? [], cards: x.cards ?? [], banked: x.banked ?? {}, log: x.log ?? [] };
  } catch {
    return null;
  }
}

/** localStorage, or undefined where it is missing or locked away. */
function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Save it under its force (localStorage may throw or be missing: then it quietly doesn't). */
export function saveRun(run: TrainingRun): void {
  try {
    const saved = { v: 1, savedAt: new Date().toISOString(), run: JSON.parse(serialize(run)) };
    store()?.setItem(saveKey(run.forceId), JSON.stringify(saved));
  } catch {
    // Full or blocked: the run just isn't saved.
  }
}

/** The force's saved run, or null (none, unreadable, or already over). */
export function loadRun(forceId: string): SavedRun | null {
  try {
    const raw = store()?.getItem(saveKey(forceId));
    if (!raw) return null;
    const x = JSON.parse(raw) as Partial<SavedRun>;
    if (x?.v !== 1) return null;
    const run = deserialize(JSON.stringify(x.run));
    if (!run || run.phase === 'over' || run.forceId !== forceId) return null;
    return { v: 1, savedAt: typeof x.savedAt === 'string' ? x.savedAt : '', run };
  } catch {
    return null;
  }
}

export function clearSave(forceId: string): void {
  try {
    store()?.removeItem(saveKey(forceId));
  } catch {
    // Nothing to do.
  }
}
