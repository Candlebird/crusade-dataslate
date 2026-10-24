import type { Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';

// Unit titles (F4): one list for Sorties and Training. A unit keeps every title it earns (Unit.titles) and shows the
// one its player picks (Unit.title). Record titles come from Unit.sortieRecord / trainingRecord, so a unit whose record
// already meets one holds it even before it is stored; deed titles are earned by what it did in one run.
// Pure: no engine imports, so sortie.ts and downtime.ts can lean on it.

export type TitleId = keyof typeof TRAINING.titles;

export interface TitleDef {
  id: TitleId;
  name: string;
  where: 'sortie' | 'training' | 'both';
  /** How it is earned, in words. */
  text: string;
}

/** What a crafted unit did in one Training run (records.ts deedOf). */
export interface TrainDeed {
  cleared: number;
  kills: number;
  holds: number;
  /** Real Echo Lords it landed the killing blow on. */
  lords: number;
  nemesis: boolean;
  mvp: boolean;
  scars: number;
  /** Waves cleared from the first with nothing getting through. */
  clean: number;
}

/** What a party member did on one Sortie (downtime.applySortie). */
export interface SortieDeed {
  /** Still standing at the end. */
  up: boolean;
  won: boolean;
  deep: boolean;
  top: boolean;
  ascension: number;
  /** Pact heat the lord was slain under (0: not slain). */
  heat: number;
  /** The lord slain held a grudge against the force. */
  nemesis: boolean;
  /** The only unit standing at the end. */
  alone: boolean;
}

const T = TRAINING.titles;
const n = (id: TitleId) => T[id].n;

const TEXT: Record<TitleId, [TitleDef['where'], string]> = {
  roadWorn: ['sortie', `Come home standing from ${n('roadWorn')} Sorties.`],
  ashWalker: ['sortie', `Come home standing from ${n('ashWalker')} Sorties.`],
  hollowSworn: ['sortie', `Come home standing from ${n('hollowSworn')} Sorties.`],
  lordbane: ['both', `Slay ${n('lordbane')} Echo lords, on Sorties (the party) and in Training (the killing blow) together.`],
  grudgebreaker: ['both', 'Slay the force’s nemesis: in the party that slays a lord holding a grudge, or with the killing blow in Training.'],
  deepstrider: ['sortie', 'Win a Sortie in a region’s deep version, still standing.'],
  lastStanding: ['sortie', 'Be the only unit still standing when a Sortie is won.'],
  peakwalker: ['sortie', 'Win a Sortie at the top tier, still standing.'],
  curseborn: ['sortie', `Win a Sortie at Ascension ${n('curseborn')} or higher, still standing.`],
  pyreWalker: ['sortie', `Be in the party that slays an Echo lord under ${n('pyreWalker')} or more pact heat.`],
  echoReaper: ['training', `Make ${n('echoReaper')} kills in one Training run.`],
  unmoved: ['training', `Hold ${n('unmoved')} enemies in one Training run.`],
  lordslayer: ['training', 'Land the killing blow on one of the campaign’s own Echo Lords in Training.'],
  wallWarden: ['training', `Stand in a Training run that clears ${n('wallWarden')} waves.`],
  gatekeeper: ['training', `Stand in a Training run whose first ${n('gatekeeper')} waves are cleared with nothing getting through.`],
  unbowed: ['training', `Lead the defence of a Training run of ${n('unbowed')} waves with ${T.unbowed.scars} or more battle scars.`],
  drillmaster: ['training', `Lead the defence in ${n('drillmaster')} Training runs.`],
  legionBane: ['training', `Make ${n('legionBane')} kills over every Training run.`],
  mazeHardened: ['training', `Be crafted in ${n('mazeHardened')} Training runs.`],
  twiceTested: ['both', `Come home standing from ${n('twiceTested')} Sorties and be crafted in ${n('twiceTested')} Training runs.`],
};

/** Every title, in list order. */
export const TITLES: TitleDef[] = (Object.keys(T) as TitleId[]).map((id) => ({ id, name: T[id].name, where: TEXT[id][0], text: TEXT[id][1] }));

export const titleInfo = (id: string | undefined): TitleDef | undefined => TITLES.find((t) => t.id === id);

/** Titles the unit's records meet now (Sortie and Training records). */
export function recordTitles(u: Unit): TitleId[] {
  const s = u.sortieRecord ?? { runs: 0, lords: 0 };
  const r = u.trainingRecord ?? { best: 0, kills: 0, lords: 0, runs: 0, mvps: 0 };
  const met: [TitleId, boolean][] = [
    ['roadWorn', s.runs >= n('roadWorn')],
    ['ashWalker', s.runs >= n('ashWalker')],
    ['hollowSworn', s.runs >= n('hollowSworn')],
    ['lordbane', s.lords + r.lords >= n('lordbane')],
    ['drillmaster', r.mvps >= n('drillmaster')],
    ['legionBane', r.kills >= n('legionBane')],
    ['mazeHardened', r.runs >= n('mazeHardened')],
    ['twiceTested', s.runs >= n('twiceTested') && r.runs >= n('twiceTested')],
  ];
  return met.filter(([, ok]) => ok).map(([id]) => id);
}

/** Titles one Training run's deeds earn a unit. */
export function trainingTitles(d: TrainDeed): TitleId[] {
  const met: [TitleId, boolean][] = [
    ['grudgebreaker', d.nemesis],
    ['echoReaper', d.kills >= n('echoReaper')],
    ['unmoved', d.holds >= n('unmoved')],
    ['lordslayer', d.lords > 0],
    ['wallWarden', d.cleared >= n('wallWarden')],
    ['gatekeeper', d.clean >= n('gatekeeper')],
    ['unbowed', d.mvp && d.cleared >= n('unbowed') && d.scars >= (T.unbowed.scars ?? 0)],
  ];
  return met.filter(([, ok]) => ok).map(([id]) => id);
}

/** Titles one Sortie's deeds earn a party member. */
export function sortieTitles(d: SortieDeed): TitleId[] {
  const won = d.won && d.up;
  const met: [TitleId, boolean][] = [
    ['grudgebreaker', d.nemesis],
    ['deepstrider', won && d.deep],
    ['lastStanding', won && d.alone],
    ['peakwalker', won && d.top],
    ['curseborn', won && d.ascension >= n('curseborn')],
    ['pyreWalker', d.heat >= n('pyreWalker')],
  ];
  return met.filter(([, ok]) => ok).map(([id]) => id);
}

/** Every title id the unit holds: stored ones (oldest first), then any its records meet that aren't stored yet. */
export function heldTitles(u: Unit): TitleId[] {
  const stored = (u.titles ?? []).filter((id): id is TitleId => id in T);
  return [...stored, ...recordTitles(u).filter((id) => !stored.includes(id))];
}

export const titlesOf = (u: Unit): TitleDef[] => heldTitles(u).map((id) => titleInfo(id)!);

/**
 * Store titles on the unit (mutates it): `ids` and whatever its records meet now. Returns the ones it did not hold in
 * `before` (heldTitles taken before its records changed), in list order: the new titles worth a line.
 */
export function earnTitles(u: Unit, ids: TitleId[], before: TitleId[]): TitleId[] {
  const all = [...new Set([...recordTitles(u), ...ids])];
  const fresh = TITLES.map((t) => t.id).filter((id) => all.includes(id) && !before.includes(id));
  const stored = u.titles ?? [];
  const add = [...before.filter((id) => !stored.includes(id)), ...fresh].filter((id, i, xs) => xs.indexOf(id) === i);
  if (add.length) u.titles = [...stored, ...add];
  return fresh;
}

/** The title the unit shows: the one picked, none for '-', else the latest earned. */
export function shownTitle(u: Unit): TitleDef | undefined {
  if (u.title === '-') return undefined;
  const held = heldTitles(u);
  const pick = u.title && held.includes(u.title as TitleId) ? (u.title as TitleId) : held[held.length - 1];
  return titleInfo(pick);
}

/** Why the unit can't show `id` ('-' for none), or null. */
export function pickTitleProblem(u: Unit, id: string): string | null {
  if (id === '-' || heldTitles(u).includes(id as TitleId)) return null;
  return titleInfo(id) ? 'It hasn’t earned that title.' : 'No such title.';
}

/** Show title `id` ('-' for none); throws on a problem. */
export function pickTitle(u: Unit, id: string): void {
  const why = pickTitleProblem(u, id);
  if (why) throw new Error(why);
  u.title = id;
}
