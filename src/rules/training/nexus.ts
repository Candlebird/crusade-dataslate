import type { Campaign } from '../../model/types';
import { SORTIE, TRAINING } from '../downtimeData';
import { GALACTIC_EVENTS, NEXUS_ROUNDS } from '../nexusData';
import { campaignLords, GENERIC_LORD, lordLine, lordWaves } from './lordPick';
import { seedOf, shuffle } from './rng';
import type { NexusAffixId, RunNexus, TrainingRun } from './types';

// The campaign in Training (F3): its threat, the affixes threat brings, this round's Galactic Event and the real Echo
// Lords, read once when a run starts. The same campaign round gives every force the same affixes and lords.

const X = TRAINING.nexus;
type Events = typeof X.events;

/** Every threat affix, in Sortie order (affixes, then the pact marks that map). */
export const AFFIX_IDS: NexusAffixId[] = ['armoured', 'swift', 'regenerating', 'vengeful', 'frenzied', 'shrouded', 'proud', 'fierce', 'bleed'];

/** This round's Galactic Event id, if one is drawn for it. */
const eventNow = (c: Campaign) => (c.event && c.event.round === (c.round ?? 1) ? c.event.id : undefined);

/** Does this event change the maze (TRAINING.nexus.events)? */
export const eventMapped = (id: string | undefined): id is keyof Events => !!id && id in X.events;

/** The Nexus a run of a force in campaign `c` meets; undefined outside one (threat 0, no event, the generic lord). */
export function nexusOf(c?: Campaign): RunNexus | undefined {
  if (!c) return undefined;
  const event = eventNow(c);
  const rise = event === 'risingDark' ? X.events.risingDark.threat : 0;
  const threat = Math.max(0, Math.min(X.threatMax, (c.threat ?? NEXUS_ROUNDS.threatStart) + rise));
  const r = { rng: seedOf(`${c.id}:${c.round ?? 1}`) };
  const n = Math.min(X.affixes.max, Math.ceil(threat / X.affixes.per));
  const affixes = shuffle(r, [...AFFIX_IDS]).slice(0, n);
  return { threat, affixes, ...(event ? { event } : {}), lords: campaignLords(c, r) };
}

/** The run's threat (0 outside a campaign). */
export const threatOf = (run: Pick<TrainingRun, 'nexus'>) => run.nexus?.threat ?? 0;

/** Does the run carry this affix? */
export const hasAffix = (run: Pick<TrainingRun, 'nexus'>, id: NexusAffixId) => !!run.nexus?.affixes.includes(id);

/** The run's event, if it maps to the maze. */
export const eventIs = <K extends keyof Events>(run: Pick<TrainingRun, 'nexus'>, id: K) => run.nexus?.event === id;

/** Earned credits are this many times as many: 1 + credit × threat. */
export const creditMul = (run: Pick<TrainingRun, 'nexus'>) => 1 + X.credit * threatOf(run);

/** Waves are this many times as big: Fierce, Echo Surge, Void Lull. */
export function budgetMul(run: Pick<TrainingRun, 'nexus'>): number {
  const fierce = hasAffix(run, 'fierce') ? 1 + X.fierce.per * threatOf(run) : 1;
  const ev = eventIs(run, 'echoSurge') ? X.events.echoSurge.budget : eventIs(run, 'voidLull') ? X.events.voidLull.budget : 1;
  return fierce * ev;
}

/** What a new run starts with, the Nexus counted: credits (Supply Convoys), base HP (Bleed), extra cover patches
 *  (Derelict Fleet), extra Shards a draft (Shard Rush) and XP cap (Glory Seekers). */
export function nexusStart(run: Pick<TrainingRun, 'nexus'>) {
  const E = X.events;
  return {
    credits: eventIs(run, 'convoys') ? E.convoys.credits : 0,
    baseHp: hasAffix(run, 'bleed') ? -X.bleed.per * threatOf(run) : 0,
    cover: eventIs(run, 'derelicts') ? E.derelicts.cover : 0,
    draw: eventIs(run, 'shardRush') ? E.shardRush.draw : 0,
    xp: eventIs(run, 'glory') ? E.glory.xp : 0,
  };
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

/** An affix's name (Sortie's) and what it does at threat `threat`. */
export function affixInfo(id: NexusAffixId, threat: number): { name: string; text: string } {
  const mark = (m: string) => SORTIE.marks.list.find((x) => x.id === m)?.name ?? m;
  const name = id in SORTIE.affixes ? SORTIE.affixes[id as keyof typeof SORTIE.affixes].name : mark(id);
  const t = threat;
  switch (id) {
    case 'armoured': return { name, text: `${pc(Math.min(X.armoured.max, X.armoured.share * t))} of the Echoes save at +1.` };
    case 'swift': return { name, text: `Echoes walk ${pc(X.swift.per * t)} faster.` };
    case 'regenerating': return { name, text: `Echoes (not lords) mend ${pc(X.regenerating.per * t)} of their wounds a second.` };
    case 'vengeful': return { name, text: `An Echo slain makes those within ${X.vengeful.radius} cells rush (${X.vengeful.mul}× as fast) for ${(X.vengeful.secs * t).toFixed(1)} s.` };
    case 'frenzied': return { name, text: `Echoes have ${pc(X.frenzied.per * t)} more wounds.` };
    case 'shrouded': return { name, text: `Shots at Echoes beyond ${pc(shroudFrom(t))} of the gun's reach are at -1 to hit.` };
    case 'proud': return { name, text: `${pc(X.proud.per * t)} more of the Echoes come as veterans, from wave 1.` };
    case 'fierce': return { name, text: `Waves are ${pc(X.fierce.per * t)} bigger.` };
    case 'bleed': return { name, text: `The base starts ${X.bleed.per * t} HP down.` };
  }
}

/** Shrouded: the share of a gun's reach past which shots are at -1. */
export const shroudFrom = (threat: number) => Math.max(X.shrouded.min, X.shrouded.from - X.shrouded.per * threat);

/** What an event does in Training ('' if it is only flavour here). */
export function eventEffect(id: string): string {
  const E = X.events;
  switch (id) {
    case 'warpCurrents': return `Echoes walk ${pc(E.warpCurrents.walk - 1)} faster.`;
    case 'ionStorm': return `Shots at targets over ${E.ionStorm.from} cells away are at -1 to hit.`;
    case 'shardRush': return `+${E.shardRush.draw} Shard in every draft.`;
    case 'convoys': return `+${E.convoys.credits} credits to start.`;
    case 'echoSurge': return `Waves are ${pc(E.echoSurge.budget - 1)} bigger.`;
    case 'voidLull': return `Waves are ${pc(1 - E.voidLull.budget)} smaller.`;
    case 'risingDark': return `+${E.risingDark.threat} threat (counted above).`;
    case 'derelicts': return `+${E.derelicts.cover} cover patches.`;
    case 'glory': return `Each unit can earn +${E.glory.xp} XP this run.`;
    default: return '';
  }
}

/** The run's event as the start screen and HUD show it: its name, the campaign text and what it does here (none:
 *  flavour only). */
export function eventInfo(id: string | undefined): { name: string; desc: string; effect: string } | undefined {
  const e = GALACTIC_EVENTS.find((x) => x.id === id);
  return e && { name: e.name, desc: e.desc, effect: eventEffect(e.id) };
}

/** The Nexus as the start screen lists it: threat and credits, each affix, the event, and the lords by wave (`nemesis`:
 *  the force's nemesis takes its wave). */
export function nexusLines(nx: RunNexus | undefined, nemesis = false): { threat: string; affixes: string[]; event: string; lords: string[] } {
  if (!nx) return { threat: 'Threat 0: not in a campaign.', affixes: [], event: 'No Galactic Event.', lords: [`Every boss: ${GENERIC_LORD}.`] };
  const ev = eventInfo(nx.event);
  const waves = lordWaves(nx, nemesis);
  return {
    threat: `Threat ${nx.threat}: earned credits +${Math.round(X.credit * nx.threat * 100)}%.`,
    affixes: nx.affixes.map((a) => { const i = affixInfo(a, nx.threat); return `${i.name}: ${i.text}`; }),
    event: !ev ? 'No Galactic Event this round.' : `${ev.name}: ${ev.effect || `${ev.desc} (flavour only in Training)`}`,
    lords: [...nx.lords.map((l, i) => lordLine(l, waves[i])), nx.lords.length ? `Every other boss: ${GENERIC_LORD}.` : `Every boss: ${GENERIC_LORD} (no Echo Lords in the Nexus yet).`],
  };
}
