// Mission definitions for the battle tracker. These are plain data: add, remove or tweak a mission here
// (or in the app's Mission Library, which saves custom missions for every player) and the tracker follows.

export type MissionSource = 'OPR' | 'Crusade' | 'Nexus Wars' | 'Custom';

/** Something both sides tally during the game, worth `vp` each (e.g. "Relics recovered"). */
export interface MissionCounter {
  id: string;
  label: string;
  vp: number;
  /** Highest count per side (none = unlimited). */
  max?: number;
}

/** A rule to remind the table of. With `round` it is only shown in that round. */
export interface MissionRule {
  title: string;
  text: string;
  round?: number;
}

export interface MissionDef {
  id: string;
  name: string;
  source: MissionSource;
  summary: string;
  /** How the armies deploy. */
  deployment?: string;
  /** Game length in rounds (OPR standard: 4). */
  rounds: number;
  /** Number of objective markers, or 'D3+2' to roll for it at the start. */
  objectives: number | 'D3+2';
  scoring: {
    /** VP for each objective a side holds. 0 = objectives don't score VP. */
    objectiveVp: number;
    /** 'every' scores at the end of every round, 'last' only at the end of the game. */
    when: 'every' | 'last';
  };
  counters?: MissionCounter[];
  rules?: MissionRule[];
  /** Set by the Mission Library on custom missions; drives sync. */
  updatedAt?: string;
}

/** How a unit seizes an objective in the core rules; shown on every mission with objectives. */
export const SEIZE_RULE =
  'At the end of each round, a side seizes a marker if it has a non-Shaken unit within 3" of it and the other side doesn\'t. ' +
  'If both sides have one there it is contested. Seized markers stay seized when the units move away.';

export const STANDARD_MISSION: MissionDef = {
  id: 'opr-standard',
  name: 'Standard Mission',
  source: 'OPR',
  summary: 'The core-rules mission: hold the most objective markers when the game ends.',
  deployment: 'Players roll off; the winner picks a long table edge and deploys first. Deployment zones are 12" deep along each long edge. Players alternate placing one unit at a time.',
  rounds: 4,
  objectives: 'D3+2',
  scoring: { objectiveVp: 1, when: 'last' },
  rules: [
    { title: 'Objectives', text: 'Roll D3+2 markers. Players alternate placing them, starting with the player who deploys second: at least 9" from each other and outside deployment zones.' },
    { title: 'Seizing', text: SEIZE_RULE },
    { title: 'Winning', text: 'After round 4, the side holding the most markers wins. Equal markers is a draw.' },
  ],
};

/**
 * A template showing every option a mission can use. It's here to copy from: duplicate it in the
 * Mission Library (or here) and change what you like.
 */
export const EXAMPLE_MISSION: MissionDef = {
  id: 'example-salvage',
  name: 'Example: Salvage Run',
  source: 'Custom',
  summary: 'A template for custom missions — objectives score every round, plus salvage tokens and a round 3 twist.',
  deployment: 'Standard: 12" zones along the long edges.',
  rounds: 4,
  objectives: 3,
  scoring: { objectiveVp: 1, when: 'every' },
  counters: [
    { id: 'salvage', label: 'Salvage recovered', vp: 2, max: 3 },
    { id: 'heroes', label: 'Enemy heroes slain', vp: 1 },
  ],
  rules: [
    { title: 'Salvage', text: 'Place 3 salvage tokens in the middle. A unit that ends its move in contact picks one up; it\'s worth 2 VP if it is still carried at the end.' },
    { title: 'Tremors', text: 'At the start of round 3, every unit within 6" of the centre takes a Dangerous Terrain test.', round: 3 },
  ],
};

export const BUILTIN_MISSIONS: MissionDef[] = [STANDARD_MISSION, EXAMPLE_MISSION];

export const SOURCES: MissionSource[] = ['OPR', 'Crusade', 'Nexus Wars', 'Custom'];

/** Built-in missions, then the group's custom ones (a custom mission with a built-in's id replaces it). */
export function allMissions(custom: MissionDef[] = []): MissionDef[] {
  const ids = new Set(custom.map((m) => m.id));
  return [...BUILTIN_MISSIONS.filter((m) => !ids.has(m.id)), ...custom];
}

export const isBuiltin = (id: string) => BUILTIN_MISSIONS.some((m) => m.id === id);
