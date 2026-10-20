import type { ArmyList, BattleResult, Campaign, CampaignEvent, Force, Settings, Unit } from '../model/types';
import { battlePoints } from './engine';
import { listUnits } from './lists';
import { emptyUnitBattle, unitName, type BattleInput } from './battle';
import { benefitOf, ECHOES, factionName, ORGANIZED_STRIKE, ownedSectors } from './nexus';
import type { MissionDef, MissionRule, ObjectiveRoll } from './missions';
import { aiStyleFor, type AiStyle } from './aiTrees';
import { aiDefended, modifierOf } from './difficulty';

// The battle tracker: one game in progress, scored from the mission it was started with.
// The mission is copied in, so editing the library mid-game doesn't change a running battle.

// Any number of players split into teams: 1v1, 1v1v1, 2v1, 3 players vs the AI… Objectives and mission VP
// belong to a team; a free-for-all is just one player per team.

export const TEAMS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export type TeamKey = (typeof TEAMS)[number];
/** Who holds an objective: nobody, a team, or contested. */
export type Holder = '' | TeamKey | 'x';

/** Quick set-ups for the start screen. Each inner list is a team; 'ai' is a side run by the OPR solo/co-op AI rules. */
export const FORMATS: { label: string; teams: ('player' | 'ai')[][] }[] = [
  { label: '1 v 1', teams: [['player'], ['player']] },
  { label: '1 v 1 v 1', teams: [['player'], ['player'], ['player']] },
  { label: '2 v 1', teams: [['player', 'player'], ['player']] },
  { label: '2 v 2', teams: [['player', 'player'], ['player', 'player']] },
  { label: '1 v 1 v 1 v 1', teams: [['player'], ['player'], ['player'], ['player']] },
  { label: '1 v AI', teams: [['player'], ['ai']] },
  { label: '2 v AI', teams: [['player', 'player'], ['ai']] },
  { label: '3 v AI', teams: [['player', 'player', 'player'], ['ai']] },
];

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
  /** The unit's points cost, when it came from a force or the army book. */
  points?: number;
  /** Which AI decision tree the unit follows when its side is run by the AI (hybrid if unset). */
  aiStyle?: AiStyle;
}

export interface TrackerAgenda {
  name: string;
  /** Free tally (objectives held, models killed…), as the agenda needs. */
  count: number;
  done: boolean;
}

export interface TrackerSide {
  id: string;
  name: string;
  team: TeamKey;
  /** Played by the AI rather than a person. */
  ai?: boolean;
  forceId?: string;
  listId?: string;
  bp: number;
  /** Manual VP adjustment (penalties, house rules…). */
  vpAdjust: number;
  agendas: TrackerAgenda[];
  /** Combat Manipulations and other one-use effects for this match. */
  manipulations: { text: string; used: boolean }[];
  units: TrackerUnit[];
  /** A generated army's full units (no crusade force to look them up in), for its printable sheet. */
  roster?: Unit[];
}

export interface TrackedBattle {
  id: string;
  startedAt: string;
  mission: MissionDef;
  round: number;
  objectives: number;
  /** control[round - 1][marker] = who held it at the end of that round. */
  control: Holder[][];
  sides: TrackerSide[];
  /** Mission tallies, per team: counters[team][counter id]. */
  counters: Partial<Record<TeamKey, Record<string, number>>>;
  /** Nexus Wars: the sector fought over, and which team attacks it (every other team defends). */
  sectorId?: string;
  attacker?: TeamKey;
  /** OPR Advanced deployment style, if one was picked or rolled. */
  deploymentStyle?: string;
  notes: string;
  ended: boolean;
  /** Ids of the sides already recorded in their force's crusade log. */
  recorded: string[];
}

export const newSide = (id: string, name: string, team: TeamKey, ai = false): TrackerSide => ({
  id, name, team, ...(ai ? { ai } : {}), bp: 0, vpAdjust: 0, agendas: [], manipulations: [], units: [],
});

/** Add a player (or the AI) to a team, with the next free id. */
export function addSide(b: TrackedBattle, team: TeamKey, ai = false): TrackerSide {
  let n = b.sides.length + 1;
  while (b.sides.some((x) => x.id === `s${n}`)) n++;
  const side = newSide(`s${n}`, ai ? 'AI' : `Player ${b.sides.filter((x) => !x.ai).length + 1}`, team, ai);
  b.sides.push(side);
  return side;
}

/** Drop a side. Markers held by a team that no longer has anyone go back to nobody. */
export function removeSide(b: TrackedBattle, id: string) {
  b.sides = b.sides.filter((x) => x.id !== id);
  b.recorded = b.recorded.filter((x) => x !== id);
  cleanTeams(b);
}

export function setTeam(b: TrackedBattle, id: string, team: TeamKey) {
  const side = b.sides.find((x) => x.id === id);
  if (side) side.team = team;
  cleanTeams(b);
}

function cleanTeams(b: TrackedBattle) {
  const live = new Set<Holder>(teamsOf(b));
  b.control = b.control.map((row) => row.map((h) => (h === '' || h === 'x' || live.has(h) ? h : '')));
  if (b.attacker && !live.has(b.attacker)) b.attacker = undefined;
}

/** The teams in play, in A, B, C order. */
/** The side's points: every unit it started with. */
export const sidePoints = (side: TrackerSide) => side.units.reduce((n, u) => n + (u.points ?? 0), 0);

/** Load a generated army (no crusade force) into a side. */
export function loadUnits(side: TrackerSide, name: string, units: Unit[]) {
  Object.assign(side, { name, forceId: undefined, listId: undefined, units: units.map(trackerUnit), roster: structuredClone(units), bp: 0, manipulations: [] });
}

export const teamsOf = (b: TrackedBattle): TeamKey[] => TEAMS.filter((t) => b.sides.some((x) => x.team === t));
export const membersOf = (b: TrackedBattle, t: TeamKey) => b.sides.filter((x) => x.team === t);
export const teamName = (b: TrackedBattle, t: TeamKey) => membersOf(b, t).map((x) => x.name).join(' & ') || `Team ${t}`;

const d3 = (rng: () => number) => 1 + Math.floor(rng() * 3);
export const rollObjectives = (roll: ObjectiveRoll = 'D3+2', rng = Math.random) => d3(rng) + (roll === 'D3+2' ? 2 : 0);

export function newBattle(mission: MissionDef, id: string, startedAt: string, rng = Math.random, format = FORMATS[0]): TrackedBattle {
  const objectives = typeof mission.objectives === 'number' ? mission.objectives : rollObjectives(mission.objectives, rng);
  const b: TrackedBattle = {
    id, startedAt, mission: structuredClone(mission), round: 1, objectives,
    control: [Array<Holder>(objectives).fill('')],
    sides: [], counters: {}, notes: '', ended: false, recorded: [],
  };
  format.teams.forEach((team, i) => team.forEach((kind) => addSide(b, TEAMS[i], kind === 'ai')));
  return b;
}

/** Battles saved before multiplayer had two fixed sides, a and b. */
export function migrateBattle(b: any): TrackedBattle | undefined {
  if (!b || Array.isArray(b.sides)) return b;
  const team = (k: unknown): any => (k === 'a' ? 'A' : k === 'b' ? 'B' : k);
  const side = (k: 'a' | 'b'): TrackerSide => {
    const { counters: _c, ...rest } = b.sides[k];
    return { ...rest, id: k, team: team(k), ...(k === 'b' && b.vsAi ? { ai: true } : {}) };
  };
  const { vsAi: _v, ...rest } = b;
  return {
    ...rest,
    sides: [side('a'), side('b')],
    counters: { A: b.sides.a.counters ?? {}, B: b.sides.b.counters ?? {} },
    control: b.control.map((row: Holder[]) => row.map(team)),
    attacker: team(b.attacker),
  };
}

export function trackerUnit(u: Unit): TrackerUnit {
  const maxWounds = Math.max(1, u.size) * Math.max(1, u.tough || 1);
  return { id: u.id, unitId: u.id, name: unitName(u), maxWounds, wounds: maxWounds, shaken: false, activated: false, destroyed: false, kills: 0, points: u.points, aiStyle: aiStyleFor(u) };
}

/** Fill a side from a force (and one of its lists, or every active unit). */
export function loadForce(side: TrackerSide, f: Force, list: ArmyList | undefined, s: Settings) {
  const units = list ? listUnits(f, list) : f.units.filter((u) => u.status === 'active');
  side.name = f.name;
  side.forceId = f.id;
  side.listId = list?.id;
  side.roster = undefined;
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
  for (const side of b.sides) for (const u of side.units) u.activated = false;
}

export function prevRound(b: TrackedBattle) {
  if (b.round > 1) b.round -= 1;
}

/** Tapping a marker steps through nobody, each team, then contested. */
export function cycleHolder(b: TrackedBattle, h: Holder): Holder {
  const cycle: Holder[] = ['', ...teamsOf(b), 'x'];
  return cycle[(cycle.indexOf(h) + 1) % cycle.length];
}

/** Set a marker for the current round. Later rounds that still matched the old value follow along. */
export function setHolder(b: TrackedBattle, marker: number, h: Holder) {
  const r = b.round - 1;
  const old = b.control[r][marker];
  b.control[r][marker] = h;
  for (let i = r + 1; i < b.control.length && b.control[i][marker] === old; i++) b.control[i][marker] = h;
}

export const held = (row: Holder[] | undefined, t: TeamKey) => (row ?? []).filter((h) => h === t).length;

export interface TeamScore {
  objectives: number;
  counters: number;
  total: number;
}

/** VP so far, per team. With 'last' scoring, objectives (and the bonus for holding the most) count the most recent round only. */
export function score(b: TrackedBattle): Partial<Record<TeamKey, TeamScore>> {
  const { objectiveVp, when, mostBonus } = b.mission.scoring;
  const teams = teamsOf(b);
  const rounds = b.control.slice(0, b.round);
  const scored = (w: 'every' | 'last') => (w === 'every' ? rounds : rounds.slice(-1));
  const out: Partial<Record<TeamKey, TeamScore>> = {};
  for (const t of teams) {
    let objectives = scored(when).reduce((n, row) => n + held(row, t), 0) * objectiveVp;
    if (mostBonus) objectives += scored(mostBonus.when).filter((row) => teams.every((o) => o === t || held(row, t) > held(row, o))).length * mostBonus.vp;
    const counters = (b.mission.counters ?? []).reduce((n, c) => n + (b.counters[t]?.[c.id] ?? 0) * c.vp, 0);
    const adjust = membersOf(b, t).reduce((n, x) => n + x.vpAdjust, 0);
    out[t] = { objectives, counters, total: objectives + counters + adjust };
  }
  return out;
}

/** The teams on the most VP: one is a win, several a draw between them. */
export function leaders(b: TrackedBattle): TeamKey[] {
  const s = score(b);
  const teams = teamsOf(b);
  const top = Math.max(...teams.map((t) => s[t]!.total));
  return teams.filter((t) => s[t]!.total === top);
}

export function winner(b: TrackedBattle): TeamKey | 'draw' {
  const l = leaders(b);
  return l.length === 1 ? l[0] : 'draw';
}

/** A side's result: its team won, drew for first, or lost (in a free-for-all, everyone but the leader loses). */
export function resultFor(b: TrackedBattle, sideId: string): BattleResult {
  const t = b.sides.find((x) => x.id === sideId)?.team;
  const l = leaders(b);
  return !t || !l.includes(t) ? 'loss' : l.length === 1 ? 'win' : 'draw';
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
    const defenders = b.sides.filter((x) => x.team !== b.attacker);
    if (sector.reinforced && defenders.length)
      notes.push(`${defenders.map((x) => x.name).join(' & ')} ${defenders.length > 1 ? 'defend' : 'defends'} a Reinforced sector: +200 Supply Limit.`);
    if (sector.difficulty !== undefined && aiDefended(sector)) notes.push(`${sector.name}'s AI garrison: ${sector.difficulty} Supply.`);
    for (const m of (sector.modifiers ?? []).map(modifierOf)) if (m) notes.push(`Sector modifier, ${m.name}: ${m.desc}`);
    for (const x of membersOf(b, b.attacker))
      if (x.manipulations.some((m) => m.text.startsWith(ORGANIZED_STRIKE))) notes.push(`${x.name} attacks with an Organized Strike: +200 Supply Limit.`);
  }
  if (c) {
    for (const side of b.sides) {
      const factionId = forces.find((f) => f.id === side.forceId)?.nexus?.factionId;
      if (!factionId) continue;
      const ports = ownedSectors(c, factionId).filter((s) => benefitOf(s)?.id === 'spacePort').length;
      if (ports) notes.push(`${side.name} gets ${ports} free Combat Manipulation${ports > 1 ? 's' : ''} (Militarized Space Port).`);
    }
  }
  return notes;
}

/** The Nexus faction a team plays for: its first force linked to a faction, else 'ai' for an AI team, else ''. */
export function teamFaction(b: TrackedBattle, t: TeamKey, c: Campaign, forces: Force[]): string {
  for (const x of membersOf(b, t)) {
    const id = forces.find((f) => f.id === x.forceId)?.nexus?.factionId;
    if (id && c.factions.some((f) => f.id === id)) return id;
  }
  return membersOf(b, t).some((x) => x.ai) ? 'ai' : '';
}

/**
 * Set a new battle up to be fought over a sector: team A attacks for a faction, team B defends.
 * A team's first player gets their faction's force loaded: the attacking detachment if given, else the faction's only force.
 */
export function atSector(b: TrackedBattle, c: Campaign, forces: Force[], s: Settings, sectorId: string, attacker: string, forceId?: string) {
  b.sectorId = sectorId;
  b.attacker = 'A';
  const owner = c.sectors.find((x) => x.id === sectorId)?.owner;
  const load = (t: TeamKey, factionId: string | undefined, pick?: string) => {
    const side = membersOf(b, t).find((x) => !x.ai);
    const theirs = forces.filter((f) => factionId && f.nexus?.factionId === factionId);
    const one = theirs.find((f) => f.id === pick) ?? (theirs.length === 1 ? theirs[0] : undefined);
    if (side && one) loadForce(side, one, undefined, s);
  };
  load('A', attacker, forceId);
  if (owner !== attacker) load('B', owner);
}

export type SectorGame = { event: Omit<CampaignEvent, 'id' | 'date'> } | { problem: string };

/**
 * The campaign log entry a battle over a Nexus sector makes when it's finished, or why it can't make one.
 * Undefined when the battle isn't fought over a sector. The defender is the team holding the sector, if one does.
 */
export function sectorGame(b: TrackedBattle, c: Campaign | undefined, forces: Force[]): SectorGame | undefined {
  if (!c || !b.sectorId) return undefined;
  const sector = c.sectors.find((s) => s.id === b.sectorId);
  if (!sector) return { problem: 'The sector fought over is no longer in the campaign.' };
  if (!b.attacker) return { problem: 'Pick the attacking team under Setup to update the Nexus map.' };
  const faction = (t: TeamKey) => teamFaction(b, t, c, forces);
  const attacker = faction(b.attacker);
  if (!attacker) return { problem: `${teamName(b, b.attacker)} isn't playing for a Nexus faction: load a force linked to one, or set the side to the AI.` };
  const defenders = teamsOf(b).filter((t) => t !== b.attacker).map(faction);
  const standIn = standInFor(b, c, forces);
  const defender = standIn || (defenders.find((x) => x && x === sector.owner) ?? defenders.find(Boolean) ?? sector.owner ?? '');
  const w = winner(b);
  let won = w === 'draw' ? '' : faction(w);
  if (w !== 'draw' && !won) return { problem: `${teamName(b, w)} won but isn't playing for a Nexus faction, so the map can't tell who takes ${sector.name}.` };
  if (standIn && won === ECHOES.id) won = standIn;
  const sc = score(b);
  const notes = `${b.mission.name}: ${teamsOf(b).map((t) => `${teamName(b, t)} ${sc[t]!.total}`).join(', ')} VP.`
    + (standIn ? ` The ${ECHOES.name} stood in for ${factionName(c, standIn)}.` : '');
  return { event: { sectorId: sector.id, attacker, defender, winner: won, notes, battleId: b.id } };
}

/**
 * The faction an AI defender stands in for: when a player's sector is attacked and they can't make the Battle,
 * the Void Echoes fight for it, and their win holds the sector for its owner. '' when no one is standing in.
 */
export function standInFor(b: TrackedBattle, c: Campaign, forces: Force[]): string {
  const owner = c.sectors.find((s) => s.id === b.sectorId)?.owner;
  if (!b.attacker || !owner || owner === ECHOES.id || owner === teamFaction(b, b.attacker, c, forces)) return '';
  const defenders = teamsOf(b).filter((t) => t !== b.attacker).map((t) => teamFaction(b, t, c, forces));
  return defenders.length && defenders.every((x) => x === ECHOES.id) ? owner : '';
}

/** What the post-battle wizard can fill in for one side of a tracked battle. */
export function wizardPrefill(b: TrackedBattle, sideId: string, input: BattleInput, f: Force, c?: Campaign): BattleInput {
  const side = b.sides.find((x) => x.id === sideId)!;
  const opps = b.sides.filter((x) => x.team !== side.team);
  const allies = membersOf(b, side.team).filter((x) => x !== side);
  const teamBp = (t: TeamKey) => membersOf(b, t).reduce((n, x) => n + x.bp, 0);
  // Suffering rolls compare team strength: my team against the strongest opposing team.
  const oppBp = Math.max(0, ...teamsOf(b).filter((t) => t !== side.team).map(teamBp));
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
  const scores = [side.team, ...teamsOf(b).filter((t) => t !== side.team)].map((t) => s[t]!.total).join('–');
  const sector = c?.sectors.find((x) => x.id === b.sectorId);
  return {
    ...input,
    opponent: opps.map((x) => x.name).join(' & '),
    result: resultFor(b, sideId),
    vsAi: opps.some((x) => x.ai),
    agendas: side.agendas.map((a) => a.name),
    myBp: teamBp(side.team) || input.myBp,
    oppBp: oppBp || input.oppBp,
    sectorId: sector?.id ?? input.sectorId,
    sectorName: sector?.name ?? input.sectorName,
    notes: [
      `${b.mission.name}, ${scores} VP after round ${b.round}.`,
      allies.length ? `Allied with ${allies.map((x) => x.name).join(' & ')}.` : '',
      b.notes,
    ].filter(Boolean).join(' '),
    units,
    from: { battleId: b.id, sideId },
  };
}

/** Which side of the tracked battle a force played, if it still needs recording. */
export function sideOfForce(b: TrackedBattle | undefined, forceId: string): string | undefined {
  if (!b?.ended) return undefined;
  return b.sides.find((x) => x.forceId === forceId && !b.recorded.includes(x.id))?.id;
}

// ---- Finished battles ----

/** A finished battle, shared with the group so each player can claim their rewards from it later. */
export interface FinishedBattle extends TrackedBattle {
  finishedAt: string;
}

export const finishBattle = (b: TrackedBattle, finishedAt: string): FinishedBattle => ({ ...structuredClone(b), ended: true, finishedAt });

/**
 * Sides whose rewards have been claimed, with the force that claimed them. A claim is the battle log entry
 * the record wizard writes into the player's own force, so players never write to the same document.
 */
export function claims(b: TrackedBattle, forces: Force[]): Record<string, Force | undefined> {
  const out: Record<string, Force | undefined> = {};
  for (const id of b.recorded) out[id] = forces.find((f) => f.id === b.sides.find((x) => x.id === id)?.forceId);
  for (const f of forces) for (const r of f.battleLog ?? []) if (r.battleId === b.id && r.sideId) out[r.sideId] = f;
  return out;
}

/** "Team A wins", "Draw: A and B"… */
export function resultTitle(b: TrackedBattle): string {
  const w = winner(b);
  const drawn = leaders(b);
  if (w !== 'draw') return `${teamName(b, w)} ${membersOf(b, w).length > 1 ? 'win' : 'wins'}`;
  return drawn.length < teamsOf(b).length ? `Draw: ${drawn.map((t) => teamName(b, t)).join(' and ')}` : 'Draw';
}
