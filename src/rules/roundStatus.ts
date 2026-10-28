import type { Campaign, Force } from '../model/types';
import { href } from '../route';
import { factionForces } from './detachments';
import { duelReady } from './duels';
import { comingTonight } from './gameNight';
import { openOffers } from './heroes';
import { journalBlock, journalOf, journalStatus } from './journal';
import { ECHOES, activeCrisis, activeEvent, crisisUntil, currentRound, lordById } from './nexus';
import { assetsOf, claimableRounds } from './rounds';
import { breaksLeft, echoMarks, holders } from './voidspawn';
import { warlordBlock, warlordCandidates } from './warlords';

// The campaign page's "this round" lists: what a player could still do before the round ends, and the GM's view of
// where each faction stands. Read-only: nothing here changes the campaign. Sealed orders live in the cloud, so the
// page adds those itself.

export interface RoundTodo {
  key: string;
  /** A glyph (Icon.tsx GLYPHS). */
  icon: string;
  text: string;
  href: string;
  /** Lost, or goes against you, if it's still waiting when the round ends. */
  urgent?: boolean;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The marked sectors the faction holds that nobody stands on yet: they fall when the round ends. */
function openMarks(c: Campaign, forces: Force[], factionId: string) {
  return echoMarks(c).flatMap((m) => {
    const s = c.sectors.find((x) => x.id === m.sectorId);
    return s && s.owner === factionId && !m.brokenBy && !holders(c, s, forces).length ? [s] : [];
  });
}

/** What faction `me` could still do this round, the things lost at round end first. `forces`: every force on this device. */
export function roundTodos(c: Campaign, forces: Force[], me: string): RoundTodo[] {
  const f = c.factions.find((x) => x.id === me);
  if (!f) return [];
  const round = currentRound(c);
  const out: RoundTodo[] = [];
  const own = factionForces(forces, me);

  for (const s of openMarks(c, forces, me))
    out.push({ key: `mark:${s.id}`, icon: '⚠', urgent: true, href: href.campaign('map', s.id),
      text: `The ${ECHOES.name} take ${s.name} when the round ends, unless one of your detachments stands there.` });
  const breaks = breaksLeft(c, me);
  if (breaks > 0)
    out.push({ key: 'breaks', icon: '⚠', urgent: true, href: href.campaign('map'),
      text: `You can break ${plural(breaks, 'Echo mark')}: open a marked sector on the map. One left unused goes to your own marked sector.` });
  const assets = assetsOf(c, me).left;
  if (assets > 0)
    out.push({ key: 'assets', icon: '✦', urgent: true, href: href.campaign('map'),
      text: `Spend ${plural(assets, 'Strategic Asset')} (in the Round panel below). Unspent ones are lost at round end.` });
  const crisis = activeCrisis(c);
  if (crisis && crisis.result !== 'won')
    out.push({ key: 'crisis', icon: '☄', urgent: round >= crisisUntil(crisis), href: href.crisis(),
      text: `Nexus Crisis: every faction fights ${lordById(crisis.lord)?.name ?? 'the Echo Lord'} together by the end of round ${crisisUntil(crisis)}.` });

  // Income is the faction's: one claim on any of its detachments covers them all.
  const claimer = own.find((x) => claimableRounds(c, x.nexus!, forces).length);
  if (claimer) {
    const n = claimableRounds(c, claimer.nexus!, forces).length;
    out.push({ key: 'income', icon: '⛁', href: href.force(claimer.id),
      text: `Claim ${n === 1 ? "last round's" : `${n} rounds'`} sector income on ${claimer.name}'s page.` });
  }

  const j = journalOf(c, me);
  if (j && journalStatus(j) !== 'done')
    out.push({ key: `journal:${j.id}`, icon: '📜', href: href.campaign('duels'),
      text: journalStatus(j) === 'offer' ? `${j.warlord}'s Crossroads Journal: pick an ending.` : `${j.warlord} has a Crossroads Journal to play.` });
  else if (!j && f.warlord && !journalBlock(c, me))
    out.push({ key: 'journal:deal', icon: '📜', href: href.campaign('duels'), text: `${f.warlord.name} can take a Crossroads Journal this round.` });
  if (!f.warlord && !warlordBlock(c, me) && warlordCandidates(c, forces, me).length)
    out.push({ key: 'warlord', icon: '♛', href: href.campaign('warlord'), text: 'Name a Hero your Warlord to unlock its Path perks.' });

  for (const d of c.duels ?? []) {
    if (d.status !== 'open') continue;
    if (d.challenged.factionId === me && !d.challenged.agreed)
      out.push({ key: `duel:${d.id}`, icon: '⚔', href: href.campaign('duels'), text: 'You have been challenged to a Nexus Duel: agree to the stakes or decline.' });
    else if (duelReady(d) && (d.challenger.factionId === me || d.challenged.factionId === me))
      out.push({ key: `duel:${d.id}`, icon: '⚔', href: href.campaign('duels'), text: 'Your Nexus Duel is agreed: play it, then tell the GM who won.' });
  }
  const offers = openOffers(c, me).length;
  if (offers)
    out.push({ key: 'offers', icon: '♚', href: own[0] ? href.force(own[0].id) : href.campaign(),
      text: `${plural(offers, 'wandering Hero is', 'wandering Heroes are')} offering to join you: see your force page.` });
  if (c.gameNight?.round === round && !comingTonight(c).includes(me))
    out.push({ key: 'night', icon: '🎲', href: href.campaign('night'), text: 'Game night is being planned: say if you are coming.' });
  return out;
}

/** Where one faction stands this round, for the GM. */
export interface FactionStatus {
  id: string;
  name: string;
  player: string;
  /** Its forces on this device. */
  forces: number;
  /** Ended rounds it hasn't claimed income for; undefined when none of its forces are on this device. */
  unclaimed?: number;
  assetsLeft: number;
  openMarks: string[];
  breaks: number;
  journal: 'none' | 'deal' | 'play' | 'offer' | 'done';
  warlord?: string;
  coming: boolean;
}

/** Each faction's round, for the GM's checklist. `forces`: every force on this device. */
export function factionStatus(c: Campaign, forces: Force[]): FactionStatus[] {
  const ended = c.rounds?.length ? c.rounds[c.rounds.length - 1].round : undefined;
  return c.factions.map((f) => {
    const own = factionForces(forces, f.id);
    const j = journalOf(c, f.id);
    return {
      id: f.id,
      name: f.name,
      player: f.player,
      forces: own.length,
      unclaimed: !own.length ? undefined : ended === undefined ? 0 : claimableRounds(c, own[0].nexus!, forces).length,
      assetsLeft: assetsOf(c, f.id).left,
      openMarks: openMarks(c, forces, f.id).map((s) => s.name),
      breaks: breaksLeft(c, f.id),
      journal: j ? journalStatus(j) : f.warlord && !journalBlock(c, f.id) ? 'deal' : 'none',
      warlord: f.warlord?.name,
      coming: comingTonight(c).includes(f.id),
    };
  });
}

/** The GM's round steps that are still open, in about the order a round runs. Orders (in the cloud) aren't here. */
export function gmTodos(c: Campaign): RoundTodo[] {
  const round = currentRound(c);
  const out: RoundTodo[] = [];
  if (!activeEvent(c))
    out.push({ key: 'event', icon: '✦', href: href.campaignGm(), text: 'No Galactic Event this round: roll one in the Round panel, or leave it.' });
  if (c.echoMarks?.round !== round)
    out.push({ key: 'marks', icon: '⚠', href: href.campaignGm(), text: `Mark where the ${ECHOES.name} will spread, so players can hold the line (Round panel).` });
  const crisis = activeCrisis(c);
  if (crisis && crisis.result !== 'won' && !crisis.battleId)
    out.push({ key: 'crisis', icon: '☄', href: href.crisis(), urgent: round >= crisisUntil(crisis),
      text: `The Nexus Crisis battle hasn't been fought yet (until the end of round ${crisisUntil(crisis)}).` });
  const ready = (c.duels ?? []).filter(duelReady).length;
  if (ready) out.push({ key: 'duels', icon: '⚔', href: href.campaign('duels'), text: `${plural(ready, 'Nexus Duel')} agreed and waiting for a result.` });
  return out;
}
