import { useEffect, useState } from 'react';

/** Hash routes: #/ , #/force/:id , #/force/:id/unit/:uid , #/force/:id/battle , #/campaign , #/books , #/settings */
export type Route =
  | { page: 'forces' }
  | { page: 'force'; forceId: string }
  | { page: 'unit'; forceId: string; unitId: string }
  | { page: 'battle'; forceId: string }
  | { page: 'campaign' }
  | { page: 'books' }
  | { page: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'force' && parts[1]) {
    if (parts[2] === 'unit' && parts[3]) return { page: 'unit', forceId: parts[1], unitId: parts[3] };
    if (parts[2] === 'battle') return { page: 'battle', forceId: parts[1] };
    return { page: 'force', forceId: parts[1] };
  }
  if (parts[0] === 'campaign') return { page: 'campaign' };
  if (parts[0] === 'books') return { page: 'books' };
  if (parts[0] === 'settings') return { page: 'settings' };
  return { page: 'forces' };
}

export const href = {
  forces: () => '#/',
  force: (id: string) => `#/force/${id}`,
  unit: (forceId: string, unitId: string) => `#/force/${forceId}/unit/${unitId}`,
  battle: (forceId: string) => `#/force/${forceId}/battle`,
  campaign: () => '#/campaign',
  books: () => '#/books',
  settings: () => '#/settings',
};

export function go(h: string) {
  window.location.hash = h;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
