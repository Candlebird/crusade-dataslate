import { useCallback } from 'react';
import { useStore } from '../model/store';
import { asCopy, readJsonFile } from '../model/io';
import { DEFAULT_SETTINGS } from '../model/types';
import { toast } from './ui';

/** Handle dropped JSON files: forces, campaigns, full backups, or raw Army Forge books. */
export function useImporter() {
  const { state, update, addBook, replaceState } = useStore();

  return useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const got = await readJsonFile(file);
          if (got.kind === 'book') {
            addBook(got.book);
            toast(`Army book "${got.book.name}" imported (${got.book.units.length} datasheets).`);
          } else if (got.kind === 'force') {
            const existing = state.forces.find((f) => f.id === got.force.id);
            if (existing) {
              const replace = window.confirm(
                `"${existing.name}" already exists. OK = replace it with the file's version, Cancel = keep both.`,
              );
              update((d) => {
                if (replace) d.forces = d.forces.map((f) => (f.id === got.force.id ? got.force : f));
                else d.forces.push(asCopy(got.force));
              });
            } else update((d) => void d.forces.push(got.force));
            toast(`Force "${got.force.name}" imported.`);
          } else if (got.kind === 'campaign') {
            const cur = state.campaign;
            if (cur && !window.confirm(
              cur.id === got.campaign.id
                ? `Replace your copy of "${cur.name}" with this file (updated ${got.campaign.updatedAt.slice(0, 10)})?`
                : `Replace the campaign "${cur.name}" with "${got.campaign.name}"? Forces linked to the old campaign's factions will need re-linking.`,
            )) continue;
            update((d) => void (d.campaign = got.campaign));
            toast(`Campaign "${got.campaign.name}" loaded (${got.campaign.sectors.length} sectors).`);
          } else {
            if (!window.confirm('Restore this backup? It replaces ALL forces, books and settings in this browser.')) continue;
            replaceState({ ...got.state, settings: { ...DEFAULT_SETTINGS, ...got.state.settings } });
            toast('Backup restored.');
          }
        } catch (e) {
          toast(e instanceof Error ? e.message : String(e), 'error');
        }
      }
    },
    [state.forces, state.campaign, update, addBook, replaceState],
  );
}
