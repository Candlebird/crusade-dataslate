import type { ArmyList, BattleResult, Campaign, Force, Settings, Unit } from '../model/types';
import { battlePoints } from './engine';
import { listUnits } from './lists';
import { emptyUnitBattle, unitName, type BattleInput } from './battle';
import { benefitOf, ORGANIZED_STRIKE, ownedSectors } from './nexus';
import type { MissionDef, MissionRule } from './missions';

// The battle tracker: one game in progress, scored from the mission it was started with.
// The mission is copied in, so editing the library mid-game doesn't change a running battle.

export type SideKey = 'a' | 'b';
/** Who holds an objective: nobody, side a, side b, or contested. */
export type Holder = '' | SideKey | 'x';

export const SIDES: SideKey[] = ['a', 'b'];
export const other = (s: SideKey): SideKey => (s === 'a' ? 'b' : 'a');

export interface TrackerUnit {
  id: string;
  /** The force's unit, when the side was loaded from a force. */
  unitId?: string;
  name: string;
  /** Wounds the whole unit can take (models × Tough). */
  maxWounds: number;
  wounds: number;
  shaken: boolean;
  activated: boolean;
  destroyed: boolean;
  kills: number;
}

export interface TrackerAgenda {
  name: string;
  /** Free tally (objectives held, models killed…), as the agenda needs. */
  count: number;
  done: boolean;
}

export interface TrackerSide {
  name: string;
  forceId?: string;
  listId?: string;
  bp: number;
  /** Manual VP adjustment (penalties, house rules…). */
  vpAdjust: number;
  counters: Record<string, number>;
  agendas: TrackerAgenda[];
  /** Combat Manipulations and other one-use effects for this match. */
  manipulations: { text: string; used: boolean }[];
  units: TrackerUnit[];
}

export interface TrackedBattle {
  id: string;
  startedAt: string;
  mission: MissionDef;
  round: number;
  objectives: number;
  /** control[round - 1][marker] = who held it at the end of that round. */
  control: Holder[][];
  sides: Record<SideKey, TrackerSide>;
  vsAi: boolean;
  /** Nexus Wars: the sector fought over, and which side attacks it. */
  sectorId?: string;
  attacker?: SideKey;
  notes: string;
  ended: boolean;
  /** Sides already recorded in their force's crusade log. */
  recorded: SideKey[];
}

export const newSide = (name: string): TrackerSide => ({ name, bp: 0, vpAdjust: 0, counters: {}, agendas: [], manipulations: [], units: [] });

export const rollObjectives = (rng = Math.random) => 3 + Math.floor(rng() * 3);

export function newBattle(mission: MissionDef, id: string, startedAt: string, rng = Math.random): TrackedBattle {
  const objectives = mission.objectives === 'D3+2' ? rollObjectives(rng) : mission.objectives;
  return {
    id, startedAt, mission: structuredClone(mission), round: 1, objectives,
    control: [Array<Holder>(objectives).fill('')],
    sides: { a: newSide('Player 1'), b: newSide('Player 2') },
    vsAi: false, notes: '', ended: false, recorded: [],
  };
}

export function trackerUnit(u: Unit): TrackerUnit {
  const maxWounds = Math.max(1, u.size) * Math.max(1, u.tough || 1);
  return { id: u.id, unitId: u.id, name: unitName(u), maxWounds, wounds: maxWounds, shaken: false, activated: false, destroyed: false, kills: 0 };
}

/** Fill a side from a force (and one of its lists, or every active unit). */
export function loadForce(side: TrackerSide, f: Force, list: ArmyList | undefined, s: Settings) {
  const units = list ? listUnits(f, list) : f.units.filter((u) => u.status === 'active');
  side.name = f.name;
  side.forceId = f.id;
  side.listId = list?.id;
  side.units = units.map(trackerUnit);
  side.bp = units.reduce((n, u) => n + battlePoints(u, s), 0);
  side.manipulations = (f.nexus?.pending ?? []).map((text) => ({ text, used: false }));
}

/** Resize every round's markers, keeping what was already set. */
export function setObjectives(b: TrackedBattle, n: number) {
  b.objectives = Math.max(0, n);
  b.control = b.control.map((row) => Array.from({ length: b.objectives }, (_, i) => row[i] ?? ''));
}

/** Markers stay seized, so a new round starts with the last round's control. */
export function nextRound(b: TrackedBattle) {
  const last = b.control[b.round - 1] ?? [];
  b.round += 1;
  b.control[b.round - 1] ??= [...last];
  for (const k of SIDES) for (const u of b.sides[k].units) u.activated = false;
}

export function prevRound(b: TrackedBattle) {
  if (b.round > 1) b.round -= 1;
}

const CYCLE: Holder[] = ['', 'a', 'b', 'x'];
export const cycleHolder = (h: Holder): Holder => CYCLE[(CYCLE.indexOf(h) + 1) % CYCLE.length];

/** Set a marker for the current round. Later rounds that still matched the old value follow along. */
export function setHolder(b: TrackedBattle, marker: number, h: Holder) {
  const r = b.round - 1;
  const old = b.control[r][marker];
  b.control[r][marker] = h;
  for (let i = r + 1; i < b.control.length && b.control[i][marker] === old; i++) b.control[i][marker] = h;
}

export const held = (row: Holder[] | undefined, k: SideKey) => (row ?? []).filter((h) => h === k).length;

export interface SideScore {
  objectives: number;
  counters: number;
  total: number;
}

/** VP so far. With 'last' scoring, objectives count the most recent round only. */
export function score(b: TrackedBattle): Record<SideKey, SideScore> {
  const { objectiveVp, when } = b.mission.scoring;
  const rounds = b.control.slice(0, b.round);
  const out = {} as Record<SideKey, SideScore>;
  for (const k of SIDES) {
    const side = b.sides[k];
    const objectives = (when === 'every' ? rounds : rounds.slice(-1)).reduce((n, row) => n + held(row, k), 0) * objectiveVp;
    const counters = (b.mission.counters ?? []).reduce((n, c) => n + (side.counters[c.id] ?? 0) * c.vp, 0);
    out[k] = { objectives, counters, total: objectives + counters + side.vpAdjust };
  }
  return out;
}

export function winner(b: TrackedBattle): SideKey | 'draw' {
  const s = score(b);
  return s.a.total === s.b.total ? 'draw' : s.a.total > s.b.total ? 'a' : 'b';
}

export function resultFor(b: TrackedBattle, k: SideKey): BattleResult {
  const w = winner(b);
  return w === 'draw' ? 'draw' : w === k ? 'win' : 'loss';
}

/** The mission rules to show this round. */
export function roundRules(b: TrackedBattle): MissionRule[] {
  return (b.mission.rules ?? []).filter((r) => r.round === undefined || r.round === b.round);
}

/** Nexus Wars context for the sector fought over: supply bonuses and free manipulations. */
export function nexusNotes(b: TrackedBattle, c: Campaign | undefined, forces: Force[]): string[] {
  const notes: string[] = [];
  const sector = c?.sectors.find((s) => s.id === b.sectorId);
  if (sector && b.attacker) {
    const def = other(b.attacker);
    if (sector.reinforced) notes.push(`${b.sides[def].name} defends a Reinforced sector: +200 Supply Limit.`);
    if (b.sides[b.attacker].manipulations.some((m) => m.text.startsWith(ORGANIZED_STRIKE)))
      notes.push(`${b.sides[b.attacker].name} attacks with an Organized Strike: +200 Supply Limit.`);
  }
  if (c) {
    for (const k of SIDES) {
      const factionId = forces.find((f) => f.id === b.sides[k].forceId)?.nexus?.factionId;
      if (!factionId) continue;
      const ports = ownedSectors(c, factionId).filter((s) => benefitOf(s)?.id === 'spacePort').length;
      if (ports) notes.push(`${b.sides[k].name} gets ${ports} free Combat Manipulation${ports > 1 ? 's' : ''} (Militarized Space Port).`);
    }
  }
  return notes;
}

/** What the post-battle wizard can fill in for one side of a tracked battle. */
export function wizardPrefill(b: TrackedBattle, k: SideKey, input: BattleInput, f: Force, c?: Campaign): BattleInput {
  const side = b.sides[k];
  const opp = b.sides[other(k)];
  const units = { ...input.units };
  const tracked = new Map(side.units.filter((t) => t.unitId).map((t) => [t.unitId!, t]));
  for (const u of f.units) {
    if (!units[u.id]) continue;
    const t = tracked.get(u.id);
    units[u.id] = t
      ? { ...emptyUnitBattle(u), in: true, destroyed: t.destroyed, kills: t.kills }
      : { ...units[u.id], in: tracked.size === 0 ? units[u.id].in : false };
  }
  const s = score(b);
  const sector = c?.sectors.find((x) => x.id === b.sectorId);
  return {
    ...input,
    opponent: opp.name,
    result: resultFor(b, k),
    vsAi: b.vsAi,
    agendas: side.agendas.map((a) => a.name),
    myBp: side.bp || input.myBp,
    oppBp: opp.bp || input.oppBp,
    sectorId: sector?.id ?? input.sectorId,
    sectorName: sector?.name ?? input.sectorName,
    notes: [`${b.mission.name}, ${s[k].total}–${s[other(k)].total} VP after round ${b.round}.`, b.notes].filter(Boolean).join(' '),
    units,
  };
}

/** Which side of the tracked battle a force played, if it still needs recording. */
export function sideOfForce(b: TrackedBattle | undefined, forceId: string): SideKey | undefined {
  if (!b?.ended) return undefined;
  return SIDES.find((k) => b.sides[k].forceId === forceId && !b.recorded.includes(k));
}
