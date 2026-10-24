import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppState, type CatalogBook, type Force, type Unit } from './types';
import { buildSeedState, withBuiltinBooks } from './seed';
import { migrateForce } from '../rules/migrate';
import { migrateBattle } from '../rules/tracker';
import { noteVeterancy } from '../rules/training/veterancy';
import { nowIso } from './factory';
import { toast } from '../components/ui';

const STORAGE_KEY = 'opr-crusade-tracker:v1';
/** Where a save that failed to load is kept, so starting fresh never destroys it. */
export const UNREADABLE_KEY = 'opr-crusade-tracker:unreadable';

function load(): AppState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      return {
        ...parsed,
        books: withBuiltinBooks(parsed.books ?? []),
        forces: parsed.forces.map(migrateForce),
        battle: migrateBattle(parsed.battle),
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings, bp: { ...DEFAULT_SETTINGS.bp, ...parsed.settings?.bp } },
      };
    }
  } catch (e) {
    // The starter data replaces it on the next save, so keep the unreadable save under its own key first.
    console.error('Could not read saved data; starting fresh', e);
    if (raw) {
      try {
        localStorage.setItem(UNREADABLE_KEY, raw);
      } catch {
        // Nowhere to keep it.
      }
    }
  }
  return buildSeedState();
}

interface Store {
  state: AppState;
  /** Mutate a deep copy of the state; the copy becomes the new state. */
  update: (fn: (draft: AppState) => void) => void;
  updateForce: (forceId: string, fn: (f: Force) => void) => void;
  updateUnit: (forceId: string, unitId: string, fn: (u: Unit) => void) => void;
  addBook: (book: CatalogBook) => void;
  replaceState: (s: AppState) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  // The latest state, so update() can apply a change right away: a handler can read what it just wrote, and two
  // changes in the same tick both land.
  const latest = useRef(state);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save to browser storage', e);
      toast('Browser storage is full — this change was not saved. Remove some pictures or export a backup.', 'error');
    }
  }, [state]);

  const update = useCallback((fn: (d: AppState) => void) => {
    const draft = structuredClone(latest.current);
    // Veterancy never drops: noted before a change (a unit removed keeps its XP in it) and after (XP just earned).
    draft.forces.forEach(noteVeterancy);
    fn(draft);
    draft.forces.forEach(noteVeterancy);
    latest.current = draft;
    setState(draft);
  }, []);

  const updateForce = useCallback(
    (forceId: string, fn: (f: Force) => void) =>
      update((d) => {
        const f = d.forces.find((x) => x.id === forceId);
        if (!f) return;
        fn(f);
        f.updatedAt = nowIso();
      }),
    [update],
  );

  const updateUnit = useCallback(
    (forceId: string, unitId: string, fn: (u: Unit) => void) =>
      updateForce(forceId, (f) => {
        const u = f.units.find((x) => x.id === unitId);
        if (u) fn(u);
      }),
    [updateForce],
  );

  const addBook = useCallback(
    (book: CatalogBook) =>
      update((d) => {
        const old = d.books.find((b) => b.uid === book.uid);
        // A fresh copy from Army Forge has no tags: keep the ones already given.
        const keep = !book.unitTags && old?.unitTags ? { unitTags: old.unitTags } : {};
        d.books = [...d.books.filter((b) => b.uid !== book.uid), { ...book, ...keep, updatedAt: new Date().toISOString() }];
      }),
    [update],
  );

  const replaceState = useCallback((next: AppState) => {
    const s = { ...next, books: withBuiltinBooks(next.books ?? []) };
    latest.current = s;
    setState(s);
  }, []);

  return (
    <Ctx.Provider value={{ state, update, updateForce, updateUnit, addBook, replaceState }}>{children}</Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
