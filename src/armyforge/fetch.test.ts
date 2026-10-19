import { afterEach, describe, expect, it, vi } from 'vitest';
import raw from '../data/spears-of-dothea.raw.json';
import { fetchBook } from './book';

describe('fetching a book through the proxy', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('asks the proxy for the Army Forge API url', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify(raw)));
    vi.stubGlobal('fetch', fetch);
    const book = await fetchBook('ykNPXx5YgsdGWqJi', 'https://proxy.example/');
    expect(book.uid).toBe('ykNPXx5YgsdGWqJi');
    expect(fetch).toHaveBeenCalledWith(
      `https://proxy.example/?url=${encodeURIComponent('https://army-forge.onepagerules.com/api/army-books/ykNPXx5YgsdGWqJi?gameSystem=2')}`,
    );
  });

  it('explains a private book', async () => {
    vi.stubGlobal('fetch', async () => new Response('', { status: 500 }));
    await expect(fetchBook('fwfuP9Npj_eAkYLG', 'https://proxy.example')).rejects.toThrow(/private/);
  });

  it('needs a proxy', async () => {
    await expect(fetchBook('x', '')).rejects.toThrow(/proxy/);
  });
});
