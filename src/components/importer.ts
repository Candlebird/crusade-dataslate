import { useCallback } from 'react';
import { useStore } from '../model/store';
import { asCopy, readJsonFile } from '../model/io';
import { DEFAULT_SETTINGS, type CatalogBook } from '../model/types';
import { fetchBook, normalizeBook, proxyOf } from '../armyforge/book';
import { listBookUids, listToForce } from '../armyforge/list';
import rawDothea from '../data/spears-of-dothea.raw.json';
import { confirmAction, toast } from './ui';
import { localDate } from '../model/date';

const BUNDLED_UID = 'ykNPXx5YgsdGWqJi';

/** Fetch army books a list needs that aren't imported yet: the bundled one, else Army Forge via the proxy. */
async function missingBooks(raw: any, have: CatalogBook[], proxy: string): Promise<CatalogBook[]> {
  const out: CatalogBook[] = [];
  for (const id of listBookUids(raw).filter((id) => !have.some((b) => b.uid === id))) {
    if (id === BUNDLED_UID) out.push(normalizeBook(rawDothea));
    else if (proxy) {
      const book = await fetchBook(id, proxy).catch(() => undefined);
      if (book) out.push(book);
    }
  }
  return out;
}

/** Handle dropped JSON files: forces, campaigns, full backups, raw Army Forge books, or Army Forge lists. */
export function useImporter() {
  const { state, update, addBook, replaceState } = useStore();

  return useCallback(
    async (files: File[]) => {
      // What this drop has added so far: `state` is the render-time copy, so a book or force from an earlier file in the
      // same drop isn't in it yet.
      let books = state.books;
      let forces = state.forces;
      for (const file of files) {
        try {
          const got = await readJsonFile(file);
          if (got.kind === 'book') {
            const old = books.find((b) => b.uid === got.book.uid);
            if (old?.edited && !confirmAction(`"${old.name}" has datasheets edited in the app. Importing it again replaces them with the file's. Continue?`)) continue;
            addBook(got.book);
            books = [...books.filter((b) => b.uid !== got.book.uid), got.book];
            toast(`Army book "${got.book.name}" imported (${got.book.units.length} datasheets).`);
          } else if (got.kind === 'armyList') {
            const fetched = await missingBooks(got.raw, books, proxyOf(state.settings));
            const force = listToForce(got.raw, [...books, ...fetched]);
            fetched.forEach(addBook);
            books = [...books, ...fetched];
            update((d) => void d.forces.push(force));
            forces = [...forces, force];
            toast(`Force "${force.name}" created from the Army Forge list (${force.units.length} units, ${force.units.reduce((n, u) => n + u.points, 0)} pts).`);
          } else if (got.kind === 'coreRules') {
            update((d) => void (d.coreRules = got.rules));
            toast(`Core rules imported (${got.rules.length} rules). List glossaries will now include them.`);
          } else if (got.kind === 'force') {
            const existing = forces.find((f) => f.id === got.force.id);
            if (existing) {
              const replace = window.confirm(
                `"${existing.name}" already exists. OK = replace it with the file's version, Cancel = keep both.`,
              );
              const copy = asCopy(got.force);
              update((d) => {
                if (replace) d.forces = d.forces.map((f) => (f.id === got.force.id ? got.force : f));
                else d.forces.push(copy);
              });
              forces = replace ? forces.map((f) => (f.id === got.force.id ? got.force : f)) : [...forces, copy];
            } else {
              update((d) => void d.forces.push(got.force));
              forces = [...forces, got.force];
            }
            toast(`Force "${got.force.name}" imported.`);
          } else if (got.kind === 'campaign') {
            const cur = state.campaign;
            if (cur && !window.confirm(
              cur.id === got.campaign.id
                ? `Replace your copy of "${cur.name}" with this file (updated ${localDate(got.campaign.updatedAt)})?`
                : `Replace the campaign "${cur.name}" with "${got.campaign.name}"? Forces linked to the old campaign's factions will need re-linking.`,
            )) continue;
            update((d) => void (d.campaign = got.campaign));
            toast(`Campaign "${got.campaign.name}" loaded (${got.campaign.sectors.length} sectors).`);
          } else {
            if (!window.confirm('Restore this backup? It replaces ALL forces, books and settings in this browser.')) continue;
            replaceState({
              ...got.state,
              settings: { ...DEFAULT_SETTINGS, ...got.state.settings, bp: { ...DEFAULT_SETTINGS.bp, ...got.state.settings?.bp } },
            });
            toast('Backup restored.');
          }
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), 'error');
        }
      }
    },
    [state.forces, state.campaign, state.books, state.settings.armyForgeProxy, update, addBook, replaceState],
  );
}
