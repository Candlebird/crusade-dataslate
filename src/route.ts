import { useEffect, useState } from 'react';

/** Hash routes: #/ , #/force/:id , #/force/:id/unit/:uid , #/force/:id/battle[/:battleId/:sideId] , #/force/:id/list/:lid , #/battle , #/missions , #/campaign , #/books , #/settings */
export type Route =
  | { page: 'forces' }
  | { page: 'force'; forceId: string }
  | { page: 'unit'; forceId: string; unitId: string }
  | { page: 'battle'; forceId: string; battleId?: string; sideId?: string }
  | { page: 'list'; forceId: string; listId: string }
  | { page: 'tracker' }
  | { page: 'missions' }
  | { page: 'campaign' }
  | { page: 'books' }
  | { page: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'force' && parts[1]) {
    if (parts[2] === 'unit' && parts[3]) return { page: 'unit', forceId: parts[1], unitId: parts[3] };
    if (parts[2] === 'list' && parts[3]) return { page: 'list', forceId: parts[1], listId: parts[3] };
    if (parts[2] === 'battle') return { page: 'battle', forceId: parts[1], battleId: parts[3], sideId: parts[4] };
    return { page: 'force', forceId: parts[1] };
  }
  if (parts[0] === 'battle') return { page: 'tracker' };
  if (parts[0] === 'missions') return { page: 'missions' };
  if (parts[0] === 'campaign') return { page: 'campaign' };
  if (parts[0] === 'books') return { page: 'books' };
  if (parts[0] === 'settings') return { page: 'settings' };
  return { page: 'forces' };
}

export const href = {
  forces: () => '#/',
  force: (id: string) => `#/force/${id}`,
  unit: (forceId: string, unitId: string) => `#/force/${forceId}/unit/${unitId}`,
  /** The record wizard; with a past battle and side, filled in from it to claim that side's rewards. */
  battle: (forceId: string, battleId?: string, sideId?: string) => `#/force/${forceId}/battle${battleId && sideId ? `/${battleId}/${sideId}` : ''}`,
  list: (forceId: string, listId: string) => `#/force/${forceId}/list/${listId}`,
  tracker: () => '#/battle',
  missions: () => '#/missions',
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
