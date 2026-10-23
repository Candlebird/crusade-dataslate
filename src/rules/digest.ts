import type { Campaign, Force } from '../model/types';
import { href } from '../route';
import { gameLine, logFor } from './chronicle';
import { featInfo } from './feats';
import { comingTonight } from './gameNight';
import { journalStatus } from './journal';
import { currentRound, eventById, factionName } from './nexus';
import { reportFor } from './report';

// Since You Last Looked (the home page): what changed in the war and on your forces. Each item has a key that stays
// the same while it's news, so the page can remember which ones you've seen.

export interface DigestItem {
  key: string;
  icon: string;
  text: string;
  href: string;
}

/** Your faction's news (`me`: its id, none if you aren't in the campaign) and your forces' feats, newest first. */
export function digest(c: Campaign | undefined, myForces: Force[], me?: string): DigestItem[] {
  const out: DigestItem[] = [];
  for (const f of myForces)
    for (const id of Object.keys(f.feats ?? {}))
      out.push({ key: `feat:${f.id}:${id}`, icon: '★', text: `${f.name} earned the feat ${featInfo(id)?.name ?? id}.`, href: href.force(f.id) });
  if (!c || !me) return out;

  const round = currentRound(c);
  if (c.event?.round === round) {
    const e = eventById(c.event.id);
    out.push({ key: `event:${c.event.id}:${round}`, icon: '✺', text: `Galactic event this round: ${e?.name ?? c.event.id}.`, href: href.campaign() });
  }
  if (c.crisis?.round === round && !c.crisis.result)
    out.push({ key: `crisis:${round}`, icon: '☄', text: 'A Nexus Crisis must be fought this round: every faction against an Echo Lord.', href: href.campaign('map', c.crisis.sectorId) });

  const report = c.reports?.[c.reports.length - 1];
  if (report) {
    out.push({ key: `report:${report.round}`, icon: '📰', text: `Round ${report.round}'s turn report is in.`, href: href.campaign('map') });
    for (const l of reportFor(report, me)) {
      const s = c.sectors.find((x) => x.id === l.sectorId);
      if (l.icon === '🏴' && s?.owner === me) out.push({ key: `raid:${report.round}:${s.id}`, icon: '🏴', text: l.text, href: href.campaign('map', s.id) });
    }
  }

  if (c.gameNight?.round === round && !comingTonight(c).includes(me))
    out.push({ key: `night:${round}`, icon: '🎲', text: 'Game night is being planned: say whether you are coming.', href: href.campaign('night') });

  for (const j of c.journals ?? []) {
    if (j.factionId !== me) continue;
    const status = journalStatus(j);
    if (status !== 'done') out.push({ key: `journal:${j.id}:${status}`, icon: '📜', href: href.campaign('duels'),
      text: status === 'offer' ? `${j.warlord}'s Crossroads Journal: pick an ending.` : `${j.warlord} has a new Crossroads Journal to play.` });
  }
  for (const d of c.duels ?? []) {
    if (d.status !== 'open' || d.challenged.factionId !== me || d.challenged.agreed) continue;
    out.push({ key: `duel:${d.id}`, icon: '⚔', text: `${factionName(c, d.challenger.factionId)} challenged you to a Nexus Duel.`, href: href.campaign('duels') });
  }

  for (const e of [...logFor(c, me)].reverse().slice(0, 20)) {
    const { icon, text } = gameLine(c, e);
    out.push({ key: `log:${e.id}`, icon, text: `Round ${e.round ?? 1}: ${text}`, href: href.campaign('log', e.id) });
  }
  return out;
}

const SEEN_KEY = 'opr-digest-seen';

/** The keys you've seen, or null on a first visit (or with storage blocked). */
export function loadSeen(): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

/** Remembers these keys as seen (only these: news that's gone needn't be remembered). */
export function saveSeen(keys: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keys));
  } catch {
    // Blocked storage: the digest just shows everything again next time.
  }
}
