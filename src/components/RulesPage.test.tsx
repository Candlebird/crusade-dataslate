import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { StoreProvider } from '../model/store';
import { rulesIndex } from '../model/rulesSearch';
import RulesPage, { RelicRules } from './RulesPage';

// Every search hit scrolls to its exact entry: the page it opens must draw an element with the hit's id.
describe('rules pages and the search index', () => {
  // No saved data: the pages draw from a fresh store.
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  const html = (node: JSX.Element) => renderToString(<StoreProvider>{node}</StoreProvider>);

  it('give every indexed entry the element id its search hit points at', () => {
    const relicTab: Record<string, 'crusade' | 'nexus' | 'sortie' | 'training'> = { 'x-crusade': 'crusade', 'x-nexus': 'nexus', 'x-sortie': 'sortie', 'x-training': 'training' };
    const pages = new Map<string, string>();
    const page = (key: string, draw: () => JSX.Element) => pages.get(key) ?? pages.set(key, html(draw())).get(key)!;
    const missing = rulesIndex().filter((h) => {
      const tab = h.page === 'relics' ? relicTab[h.anchor] : undefined;
      const markup = tab ? page(`relics/${tab}`, () => <RelicRules initial={tab} />) : page(h.page ?? 'crusade', () => <RulesPage sub={h.page} />);
      return !markup.includes(`id="${h.entry}"`);
    });
    expect(missing.map((h) => `${h.section} / ${h.title ?? h.text.slice(0, 60)}`)).toEqual([]);
    // And no page uses an entry id twice, so a hit can't land on the wrong row.
    for (const markup of pages.values()) {
      const ids = [...markup.matchAll(/id="(rule-[^"]+)"/g)].map((m) => m[1]);
      expect(ids.length).toBe(new Set(ids).size);
    }
  });
});
