import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppState, CatalogBook } from './types';
import { DEFAULT_SETTINGS } from './types';
import { newForce, newUnit } from './factory';
import { RULES_VERSION } from '../rules/migrate';

/**
 * A tiny stand-in for React's hooks, so StoreProvider can run as a plain function in node: state and refs live in
 * slots that survive "re-renders", callbacks keep their first identity (their deps never change here), and effects
 * run after a render when their deps changed.
 */
const h = vi.hoisted(() => {
  let slots: any[] = [];
  let i = 0;
  let effects: (() => void)[] = [];
  return {
    reset() {
      slots = [];
    },
    begin() {
      i = 0;
      effects = [];
    },
    flush() {
      effects.forEach((f) => f());
    },
    useState(init: unknown) {
      const k = i++;
      if (!(k in slots)) slots[k] = typeof init === 'function' ? (init as () => unknown)() : init;
      return [slots[k], (v: unknown) => void (slots[k] = typeof v === 'function' ? (v as (p: unknown) => unknown)(slots[k]) : v)];
    },
    useRef(init: unknown) {
      const k = i++;
      if (!(k in slots)) slots[k] = { current: init };
      return slots[k];
    },
    useCallback(fn: unknown) {
      const k = i++;
      if (!(k in slots)) slots[k] = fn;
      return slots[k];
    },
    useEffect(fn: () => void, deps: unknown[]) {
      const k = i++;
      const prev = slots[k] as unknown[] | undefined;
      if (!prev || deps.some((d, j) => !Object.is(d, prev[j]))) {
        slots[k] = deps;
        effects.push(fn);
      }
    },
  };
});

const toast = vi.hoisted(() => vi.fn());

vi.mock('react', async (orig) => ({
  ...(await orig<typeof import('react')>()),
  useState: h.useState,
  useRef: h.useRef,
  useCallback: h.useCallback,
  useEffect: h.useEffect,
  useContext: () => null,
}));
vi.mock('../components/ui', () => ({ toast }));

const { StoreProvider, useStore } = await import('./store');

const KEY = 'opr-crusade-tracker:v1';
let storage: Map<string, string>;
let full = false;

beforeEach(() => {
  h.reset();
  toast.mockReset();
  storage = new Map();
  full = false;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (full) throw new Error('QuotaExceededError');
      storage.set(k, v);
    },
  });
});

type Store = ReturnType<typeof useStore>;

/** Run the provider once (plus its effects) and hand back what it puts in the context. */
function render(): Store {
  h.begin();
  const el = StoreProvider({ children: null }) as unknown as { props: { value: Store } };
  h.flush();
  return el.props.value;
}

const saved = (): AppState => JSON.parse(storage.get(KEY)!);

function baseState(): AppState {
  return { version: 1, forces: [], books: [], settings: structuredClone(DEFAULT_SETTINGS) };
}

describe('loading saved data', () => {
  it('starts from the seed when nothing is saved, and saves it', () => {
    const { state } = render();
    expect(state.forces).toEqual([]);
    expect(state.books.length).toBe(1);
    expect(saved().books[0].uid).toBe(state.books[0].uid);
  });

  it('starts from the seed when the saved data is not JSON', () => {
    storage.set(KEY, '{broken');
    expect(render().state.books.length).toBe(1);
  });

  it('brings old saved data up to date: forces, the tracked battle and missing settings', () => {
    const f = newForce('Old');
    f.rulesVersion = 1;
    const old = {
      version: 1,
      forces: [f],
      books: [],
      settings: { supplyPerRp: 150, bp: { normal: 3 } },
      campaign: { id: 'c', name: 'Kept', sectors: [] },
      battle: { id: 'b', attacker: 'b', control: [], sides: { a: { name: 'A' }, b: { name: 'B' } } },
    };
    storage.set(KEY, JSON.stringify(old));
    const { state } = render();
    expect(state.forces[0].rulesVersion).toBe(RULES_VERSION);
    expect(state.settings).toEqual({ ...DEFAULT_SETTINGS, supplyPerRp: 150, bp: { ...DEFAULT_SETTINGS.bp, normal: 3 } });
    expect((state.battle as any).sides.map((s: any) => s.team)).toEqual(['A', 'B']);
    expect(state.battle!.attacker).toBe('B');
    expect(state.campaign?.name).toBe('Kept');
    expect(state.books).toEqual([]);
  });

  it('loads data saved before settings existed', () => {
    storage.set(KEY, JSON.stringify({ version: 1, forces: [], books: [] }));
    expect(render().state.settings).toEqual(DEFAULT_SETTINGS);
  });

  it.todo(
    'keeps unreadable saved data instead of replacing it with the seed (judgment call: today any error while loading — ' +
      'e.g. a save with no forces array, or a force migrateForce chokes on — silently falls back to the seed, and the ' +
      'save effect then overwrites the stored data with it)',
  );
});

describe('update', () => {
  it('changes a copy, never the state it started from', () => {
    storage.set(KEY, JSON.stringify(baseState()));
    const store = render();
    const before = store.state;
    store.update((d) => void d.forces.push(newForce('New')));
    expect(before.forces).toEqual([]);
    expect(render().state.forces.map((f) => f.name)).toEqual(['New']);
  });

  it('lets two changes in the same tick both land, each seeing the one before', () => {
    storage.set(KEY, JSON.stringify(baseState()));
    const store = render();
    store.update((d) => void d.forces.push(newForce('First')));
    let seen: string[] = [];
    store.update((d) => {
      seen = d.forces.map((f) => f.name);
      d.forces.push(newForce('Second'));
    });
    expect(seen).toEqual(['First']);
    expect(render().state.forces.map((f) => f.name)).toEqual(['First', 'Second']);
  });

  it('saves every change to browser storage', () => {
    storage.set(KEY, JSON.stringify(baseState()));
    const store = render();
    store.update((d) => void (d.settings.supplyPerRp = 999));
    render();
    expect(saved().settings.supplyPerRp).toBe(999);
  });

  it('warns, without throwing, when browser storage is full', () => {
    storage.set(KEY, JSON.stringify(baseState()));
    const store = render();
    full = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    store.update((d) => void (d.settings.supplyPerRp = 1));
    expect(() => render()).not.toThrow();
    expect(toast).toHaveBeenCalledWith(expect.stringMatching(/storage is full/), 'error');
    expect(render().state.settings.supplyPerRp).toBe(1);
  });

  it('builds on a replaced state', () => {
    storage.set(KEY, JSON.stringify(baseState()));
    const store = render();
    store.update((d) => void d.forces.push(newForce('Gone')));
    store.replaceState({ ...baseState(), forces: [newForce('Restored')] });
    store.update((d) => void d.forces.push(newForce('After')));
    expect(render().state.forces.map((f) => f.name)).toEqual(['Restored', 'After']);
    expect(saved().forces.map((f) => f.name)).toEqual(['Restored', 'After']);
  });
});

describe('updateForce and updateUnit', () => {
  it('change one force and stamp it as updated', () => {
    const f = { ...newForce('A'), updatedAt: '2000-01-01T00:00:00.000Z', units: [newUnit({ name: 'U' })] };
    const other = { ...newForce('B'), updatedAt: '2000-01-01T00:00:00.000Z' };
    storage.set(KEY, JSON.stringify({ ...baseState(), forces: [f, other] }));
    const store = render();
    store.updateUnit(f.id, f.units[0].id, (u) => void (u.xp = 5));
    store.updateForce(f.id, (x) => void (x.wins = 1));
    const [a, b] = render().state.forces;
    expect(a.units[0].xp).toBe(5);
    expect(a.wins).toBe(1);
    expect(a.updatedAt > '2000').toBe(true);
    expect(a.updatedAt).not.toBe(f.updatedAt);
    expect(b.updatedAt).toBe(other.updatedAt);
  });

  it('do nothing for a force or unit that is not there', () => {
    const f = { ...newForce('A'), updatedAt: '2000-01-01T00:00:00.000Z' };
    storage.set(KEY, JSON.stringify({ ...baseState(), forces: [f] }));
    const store = render();
    const fn = vi.fn();
    store.updateForce('nope', fn);
    store.updateUnit(f.id, 'nope', fn);
    expect(fn).not.toHaveBeenCalled();
    expect(render().state.forces[0].name).toBe('A');
  });
});

describe('addBook', () => {
  const book = (over: Partial<CatalogBook> = {}) => ({ uid: 'bk', name: 'Book', units: [], ...over }) as unknown as CatalogBook;

  it('replaces a book with the same uid, keeping the unit tags given in the app', () => {
    storage.set(KEY, JSON.stringify({ ...baseState(), books: [book({ name: 'Old', unitTags: { u1: ['Elite'] } })] }));
    const store = render();
    store.addBook(book({ name: 'Fresh' }));
    const books = render().state.books;
    expect(books.length).toBe(1);
    expect(books[0].name).toBe('Fresh');
    expect(books[0].unitTags).toEqual({ u1: ['Elite'] });
    expect(books[0].updatedAt).toBeTruthy();
  });

  it("uses the new book's own tags when it has some", () => {
    storage.set(KEY, JSON.stringify({ ...baseState(), books: [book({ unitTags: { u1: ['Old'] } })] }));
    const store = render();
    store.addBook(book({ unitTags: { u2: ['New'] } }));
    expect(render().state.books[0].unitTags).toEqual({ u2: ['New'] });
  });
});

describe('useStore', () => {
  it('refuses to work outside the provider', () => {
    expect(() => useStore()).toThrow('useStore outside StoreProvider');
  });
});
