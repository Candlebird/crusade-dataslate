import { useEffect, useState } from 'react';

/** Hash routes: #/ , #/force/:id , #/force/:id/unit/:uid , #/force/:id/battle[/:battleId/:sideId] , #/force/:id/list/:lid , #/force/:id/ledger , #/battle[/sector/:sectorId[/:attacker[/:forceId]]] , #/battle/crisis , #/battle/past , #/battle/sheet/:sideId , #/missions , #/campaign[/gm] , #/campaign/:tab[/:at] , #/books , #/settings , #/rules[/nexus|traits|relics] , #/guide */
export type Route =
  | { page: 'forces' }
  | { page: 'force'; forceId: string }
  | { page: 'unit'; forceId: string; unitId: string }
  | { page: 'battle'; forceId: string; battleId?: string; sideId?: string }
  | { page: 'list'; forceId: string; listId: string }
  | { page: 'ledger'; forceId: string }
  | { page: 'tracker'; sectorId?: string; attacker?: string; forceId?: string; crisis?: boolean; past?: boolean }
  | { page: 'sideSheet'; sideId: string }
  | { page: 'missions' }
  | { page: 'campaign'; gm?: boolean; tab?: string; at?: string }
  | { page: 'books' }
  | { page: 'settings' }
  | { page: 'rules'; sub?: RulesSub }
  | { page: 'guide' };

/** The Rules page's tabs besides the Crusade rules. */
export type RulesSub = 'traits' | 'relics' | 'nexus';
const RULES_SUBS: RulesSub[] = ['traits', 'relics', 'nexus'];

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'force' && parts[1]) {
    if (parts[2] === 'unit' && parts[3]) return { page: 'unit', forceId: parts[1], unitId: parts[3] };
    if (parts[2] === 'list' && parts[3]) return { page: 'list', forceId: parts[1], listId: parts[3] };
    if (parts[2] === 'ledger') return { page: 'ledger', forceId: parts[1] };
    if (parts[2] === 'battle') return { page: 'battle', forceId: parts[1], battleId: parts[3], sideId: parts[4] };
    return { page: 'force', forceId: parts[1] };
  }
  if (parts[0] === 'battle' && parts[1] === 'sheet' && parts[2]) return { page: 'sideSheet', sideId: parts[2] };
  if (parts[0] === 'battle' && parts[1] === 'crisis') return { page: 'tracker', crisis: true };
  if (parts[0] === 'battle' && parts[1] === 'past') return { page: 'tracker', past: true };
  if (parts[0] === 'battle') return parts[1] === 'sector' ? { page: 'tracker', sectorId: parts[2], attacker: parts[3], forceId: parts[4] } : { page: 'tracker' };
  if (parts[0] === 'missions') return { page: 'missions' };
  if (parts[0] === 'campaign') return parts[1] === 'gm' ? { page: 'campaign', gm: true } : { page: 'campaign', tab: parts[1], at: parts[2] };
  if (parts[0] === 'books') return { page: 'books' };
  if (parts[0] === 'settings') return { page: 'settings' };
  if (parts[0] === 'rules') return { page: 'rules', sub: RULES_SUBS.find((x) => x === parts[1]) };
  if (parts[0] === 'guide') return { page: 'guide' };
  return { page: 'forces' };
}

export const href = {
  forces: () => '#/',
  force: (id: string) => `#/force/${id}`,
  unit: (forceId: string, unitId: string) => `#/force/${forceId}/unit/${unitId}`,
  /** The record wizard; with a past battle and side, filled in from it to claim that side's rewards. */
  battle: (forceId: string, battleId?: string, sideId?: string) => `#/force/${forceId}/battle${battleId && sideId ? `/${battleId}/${sideId}` : ''}`,
  list: (forceId: string, listId: string) => `#/force/${forceId}/list/${listId}`,
  /** The force's whole Requisition ledger. */
  ledger: (forceId: string) => `#/force/${forceId}/ledger`,
  /** The battle tracker; with a sector, a new battle is set up to be fought over it (by this attacking faction and detachment). */
  tracker: (sectorId?: string, attacker?: string, forceId?: string) =>
    (sectorId ? `#/battle/sector/${sectorId}${attacker ? `/${attacker}${forceId ? `/${forceId}` : ''}` : ''}` : '#/battle'),
  /** The Battle page scrolled to its Past battles list. */
  pastBattles: () => '#/battle/past',
  /** The battle tracker, setting a new battle up as this round's Nexus Crisis. */
  crisis: () => '#/battle/crisis',
  /** The printable army sheet of a generated side in the current battle. */
  sideSheet: (sideId: string) => `#/battle/sheet/${sideId}`,
  missions: () => '#/missions',
  /** The player's campaign page; with a tab open (and a game, on the log, or a sector, on the map, to show). */
  campaign: (tab?: string, at?: string) => (tab ? `#/campaign/${tab}${at ? `/${at}` : ''}` : '#/campaign'),
  /** The GM's side of the campaign: the whole map, the editors and the round controls. */
  campaignGm: () => '#/campaign/gm',
  books: () => '#/books',
  settings: () => '#/settings',
  /** The campaign rules; a sub-page for traits & weapon upgrades, relics, or Nexus Wars. */
  rules: (sub?: RulesSub) => (sub ? `#/rules/${sub}` : '#/rules'),
  guide: () => '#/guide',
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
