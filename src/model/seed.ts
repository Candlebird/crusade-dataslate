// Starting data: the Spears of Dothea book. Forces are never seeded; players build their own or sync them from the cloud.
import rawDothea from '../data/spears-of-dothea.raw.json';
import { normalizeBook } from '../armyforge/book';
import { DEFAULT_SETTINGS, type AppState } from './types';

export function buildSeedState(): AppState {
  return {
    version: 1,
    forces: [],
    books: [normalizeBook(rawDothea)],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
