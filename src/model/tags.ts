/**
 * Custom unit tags ("Commander", "Chaff"…). They are kept on the army book, per datasheet, so every
 * force built from that book — and every player, through the cloud copy — shares them.
 */
import type { AppState, CatalogBook, Unit } from './types';
import { nowIso } from './factory';

const sortTags = (tags: Iterable<string>) => [...tags].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

/** The book a crusade unit's datasheet comes from, if it has been imported. */
export function bookOf(u: Unit, books: CatalogBook[]): CatalogBook | undefined {
  return (
    books.find((b) => b.uid === u.bookUid) ??
    books.find((b) => b.name === u.bookName) ??
    books.find((b) => b.units.some((x) => x.name === u.unitType))
  );
}

export const datasheetTags = (book: CatalogBook | undefined, name: string): string[] => book?.unitTags?.[name] ?? [];

export const unitTags = (u: Unit, books: CatalogBook[]): string[] => datasheetTags(bookOf(u, books), u.unitType);

/** Every tag in use across the given books, alphabetically. */
export function allTags(books: CatalogBook[]): string[] {
  const set = new Set<string>();
  for (const b of books) for (const tags of Object.values(b.unitTags ?? {})) tags.forEach((t) => set.add(t));
  return sortTags(set);
}

/** Tags carried by any of `lists`, alphabetically (for filter chips). */
export const tagsIn = (lists: string[][]): string[] => sortTags(new Set(lists.flat()));

/** Tidy a typed tag, reusing the spelling of an existing tag that differs only in case. */
export function normalizeTag(raw: string, known: string[]): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  return known.find((k) => k.toLowerCase() === t.toLowerCase()) ?? t;
}

/** Set the tags of one datasheet in a book. */
export function setDatasheetTags(d: AppState, bookUid: string, name: string, tags: string[]): void {
  const book = d.books.find((b) => b.uid === bookUid);
  if (!book) return;
  const clean = sortTags(new Set(tags.filter(Boolean)));
  const map = { ...book.unitTags };
  if (clean.length) map[name] = clean;
  else delete map[name];
  book.unitTags = Object.keys(map).length ? map : undefined;
  book.updatedAt = nowIso();
}

/** A unit matches when it carries every selected tag. */
export const matchesTags = (tags: string[], filter: string[]): boolean => filter.every((t) => tags.includes(t));
