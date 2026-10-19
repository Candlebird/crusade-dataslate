import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, type AppState, type CatalogBook, type Force, type Unit } from './types';
import { buildSeedState } from './seed';
import { nowIso } from './factory';
import { toast } from '../components/ui';

const STORAGE_KEY = 'opr-crusade-tracker:v1';

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      return {
        ...parsed,
        settings: { ...DEFAULT_SETTINGS, ...parsed.settings, bp: { ...DEFAULT_SETTINGS.bp, ...parsed.settings?.bp } },
      };
    }
  } catch {
    // fall through to seed
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

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Could not save to browser storage', e);
      toast('Browser storage is full — this change was not saved. Remove some pictures or export a backup.', 'error');
    }
  }, [state]);

  const update = useCallback((fn: (d: AppState) => void) => {
    setState((s) => {
      const draft = structuredClone(s);
      fn(draft);
      return draft;
    });
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
        d.books = [...d.books.filter((b) => b.uid !== book.uid), book];
      }),
    [update],
  );

  const replaceState = useCallback((s: AppState) => setState(s), []);

  return (
    <Ctx.Provider value={{ state, update, updateForce, updateUnit, addBook, replaceState }}>{children}</Ctx.Provider>
  );
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
