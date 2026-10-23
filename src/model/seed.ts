// Starting data: the Spears of Dothea book. Forces are never seeded; players build their own or sync them from the cloud.
// The Void Echoes book ships with the site: the AI side of patrols, sorties, guardians and auto-battles is built from it,
// so every player has it whether or not they're signed in or have imported it.
import rawDothea from '../data/spears-of-dothea.raw.json';
import rawEchoes from '../../armies/void-echoes.gf.json';
import { normalizeBook } from '../armyforge/book';
import { DEFAULT_SETTINGS, type AppState, type CatalogBook } from './types';

let echoes: CatalogBook | undefined;
/** The Void Echoes book as it ships with the site. */
export const builtinEchoes = (): CatalogBook => (echoes ??= normalizeBook(rawEchoes));

/** The books with the built-in ones added where missing. A player's own (perhaps edited) copy is kept as it is. */
export function withBuiltinBooks(books: CatalogBook[]): CatalogBook[] {
  const e = builtinEchoes();
  return books.some((b) => b.uid === e.uid) ? books : [...books, structuredClone(e)];
}

export function buildSeedState(): AppState {
  return {
    version: 1,
    forces: [],
    books: withBuiltinBooks([normalizeBook(rawDothea)]),
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
