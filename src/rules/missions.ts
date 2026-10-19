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

/** How the number of objective markers is rolled at the start of a battle. */
export type ObjectiveRoll = 'D3+2' | 'D3';
export const OBJECTIVE_ROLLS: ObjectiveRoll[] = ['D3+2', 'D3'];

/** OPR Advanced Rules mission types (rolled 1-2 / 3-4 / 5-6). */
export type MissionGroup = 'Face-Off' | 'Progressive Scoring' | 'Attack & Defend';

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
  /** Mission type within its source, used to group the list (e.g. the OPR Advanced types). */
  group?: string;
  /** One side attacks and the other defends (the deployment roll-off winner picks). */
  roles?: boolean;
  /** How the armies deploy. */
  deployment?: string;
  /** Game length in rounds (OPR standard: 4). */
  rounds: number;
  /** Number of objective markers, or a roll made at the start. */
  objectives: number | ObjectiveRoll;
  scoring: {
    /** VP for each objective a side holds. 0 = objectives don't score VP. */
    objectiveVp: number;
    /** 'every' scores at the end of every round, 'last' only at the end of the game. */
    when: 'every' | 'last';
    /** Extra VP for holding more markers than the opponent, every round or at the end of the game. */
    mostBonus?: { vp: number; when: 'every' | 'last' };
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
  name: 'Duel (Standard Mission)',
  source: 'OPR',
  group: 'Face-Off',
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

// ---- OPR Advanced Rules missions (Grimdark Future Advanced Rules v3.4.1, p.24-26) ----

const PLACE_RULE = {
  title: 'Placing objectives',
  text: 'The players roll off, and the winner picks who places the first marker. Then they alternate placing one marker each, outside the deployment zones and over 9" from other markers.',
};
const SEIZE = { title: 'Seizing', text: SEIZE_RULE };
const CARRY_RULE = {
  title: 'Carried markers',
  text: 'When a unit seizes a marker, remove it from the table: the unit carries it. If the unit is Shaken or destroyed, the marker is dropped on the spot.',
};
const QUARTERS = { title: 'Placing objectives', text: 'Divide the area outside the deployment zones into 4 equal quarters, and place one marker at the centre of each.' };
const OWN_MARKERS = {
  title: 'Placing objectives',
  text: 'Each player sets up 1 marker 12" from their own table edge. It belongs to them, and if an enemy unit ever seizes it, it is destroyed and removed from play.',
};
const HQ_MARKERS = { title: 'Placing objectives', text: "Each player sets up 1 marker at the centre of their own deployment zone, 12\" from their table edge." };
const HILL_MARKER = { title: 'Placing objectives', text: 'Set up only 1 marker, over 9" from the deployment zones and the table edges.' };
const ROLES_RULE = {
  title: 'Attacker and defender',
  text: 'The player who wins the deployment roll-off picks whether to attack or defend.',
};
const BONUS_POINTS = { title: 'Army size', text: 'The attacker gets 25% more points than the defender.' };
const MOST_MARKERS = (rounds: number) => ({ title: 'Winning', text: `After ${rounds} rounds, the side holding the most markers wins.` });
const MOST_VP = { title: 'Winning', text: 'After 4 rounds, the side with the most VP wins.' };
/** For missions decided by where a marker ends up: tick it for the side that won. */
const MISSION_WON = { id: 'won', label: 'Mission won (tick for the winner)', vp: 1, max: 1 };

const faceOff = (m: Pick<MissionDef, 'id' | 'name' | 'summary' | 'objectives' | 'rules'> & Partial<MissionDef>): MissionDef => ({
  source: 'OPR', group: 'Face-Off', rounds: 4, scoring: { objectiveVp: 1, when: 'last' }, ...m,
});
const progressive = (m: Pick<MissionDef, 'id' | 'name' | 'summary' | 'objectives' | 'rules'> & Partial<MissionDef>): MissionDef => ({
  source: 'OPR', group: 'Progressive Scoring', rounds: 4, scoring: { objectiveVp: 1, when: 'every' }, ...m,
});
const attackDefend = (m: Pick<MissionDef, 'id' | 'name' | 'summary' | 'objectives' | 'rules'> & Partial<MissionDef>): MissionDef => ({
  source: 'OPR', group: 'Attack & Defend', rounds: 6, roles: true, scoring: { objectiveVp: 1, when: 'last' }, ...m,
});

export const FACE_OFF_MISSIONS: MissionDef[] = [
  STANDARD_MISSION,
  faceOff({
    id: 'opr-seize-ground', name: 'Seize Ground', objectives: 4,
    summary: 'Four markers, one in each quarter of no man\'s land. Hold the most when the game ends.',
    rules: [QUARTERS, SEIZE, MOST_MARKERS(4)],
  }),
  faceOff({
    id: 'opr-relic-hunt', name: 'Relic Hunt', objectives: 3,
    summary: 'Three relics that units pick up and carry. Hold the most when the game ends.',
    rules: [PLACE_RULE, SEIZE, CARRY_RULE, MOST_MARKERS(4)],
  }),
  faceOff({
    id: 'opr-sabotage', name: 'Sabotage', objectives: 2,
    summary: 'Each side has its own marker. Destroy the enemy\'s while keeping yours intact.',
    scoring: { objectiveVp: 0, when: 'last' },
    counters: [{ id: 'destroyed', label: 'Enemy marker destroyed', vp: 1, max: 1 }],
    rules: [
      OWN_MARKERS, SEIZE,
      { title: 'Winning', text: 'After 4 rounds, the side that destroyed the enemy marker while its own is still intact wins. Otherwise it is a draw.' },
    ],
  }),
  faceOff({
    id: 'opr-breakthrough', name: 'Breakthrough', objectives: 2,
    summary: 'One marker in the middle of each deployment zone. Hold the most when the game ends.',
    rules: [HQ_MARKERS, SEIZE, MOST_MARKERS(4)],
  }),
  faceOff({
    id: 'opr-king-of-the-hill', name: 'King of the Hill', objectives: 1,
    summary: 'A single marker in the middle. Whoever holds it at the end wins.',
    rules: [HILL_MARKER, SEIZE, { title: 'Winning', text: 'After 4 rounds, the side holding the marker wins.' }],
  }),
];

export const PROGRESSIVE_MISSIONS: MissionDef[] = [
  progressive({
    id: 'opr-pitched-battle', name: 'Pitched Battle', objectives: 'D3+2',
    summary: '1 VP per marker every round, and 1 VP at the end for holding more markers.',
    scoring: { objectiveVp: 1, when: 'every', mostBonus: { vp: 1, when: 'last' } },
    rules: [PLACE_RULE, SEIZE, MOST_VP],
  }),
  progressive({
    id: 'opr-domination', name: 'Domination', objectives: 4,
    summary: 'Four markers in the quarters. 1 VP per marker and 1 VP for holding more, every round.',
    scoring: { objectiveVp: 1, when: 'every', mostBonus: { vp: 1, when: 'every' } },
    rules: [QUARTERS, SEIZE, MOST_VP],
  }),
  progressive({
    id: 'opr-capture-and-hold', name: 'Capture & Hold', objectives: 3,
    summary: 'Three carried markers. 1 VP per marker every round, and 1 VP at the end for holding more.',
    scoring: { objectiveVp: 1, when: 'every', mostBonus: { vp: 1, when: 'last' } },
    rules: [PLACE_RULE, SEIZE, CARRY_RULE, MOST_VP],
  }),
  progressive({
    id: 'opr-demolition', name: 'Demolition', objectives: 2,
    summary: 'Each side has its own marker. Score every round it survives, and for avenging it.',
    scoring: { objectiveVp: 0, when: 'every' },
    counters: [
      { id: 'intact', label: 'Rounds ended with your marker intact', vp: 1, max: 4 },
      { id: 'avenged', label: 'Enemy marker destroyed after yours fell', vp: 1, max: 1 },
    ],
    rules: [
      OWN_MARKERS, SEIZE,
      { title: 'Scoring', text: 'At the end of each round, 1 VP if your marker has not been destroyed, and 1 VP if you destroy the enemy marker while yours was already destroyed. Tally both below.' },
      MOST_VP,
    ],
  }),
  progressive({
    id: 'opr-headquarters', name: 'Headquarters', objectives: 2,
    summary: 'One marker in each deployment zone. 1 VP per marker every round, and 1 VP at the end for holding more.',
    scoring: { objectiveVp: 1, when: 'every', mostBonus: { vp: 1, when: 'last' } },
    rules: [HQ_MARKERS, SEIZE, MOST_VP],
  }),
  progressive({
    id: 'opr-mosh-pit', name: 'Mosh Pit', objectives: 1,
    summary: 'A single central marker. 1 VP every round you hold it, plus 1 VP if the enemy didn\'t hold it before.',
    counters: [{ id: 'fresh', label: 'Rounds you seized it while the enemy didn\'t hold it', vp: 1, max: 4 }],
    rules: [
      HILL_MARKER, SEIZE,
      { title: 'Scoring', text: 'At the end of each round, 1 VP if you hold the marker, and 1 VP more if you seized it while it was not already held by the enemy. Tally the second one below.' },
      MOST_VP,
    ],
  }),
];

export const ATTACK_DEFEND_MISSIONS: MissionDef[] = [
  attackDefend({
    id: 'opr-the-raid', name: 'The Raid', objectives: 1,
    summary: 'The defender guards a central marker against a bigger raiding force. Whoever holds it wins.',
    deployment: 'The defender sets up the marker within 12" of the table centre and deploys half its units within 12" of it. The attacker deploys within 12" of any table edge. Then the defender deploys the rest anywhere over 12" from enemy units and from the marker.',
    rules: [ROLES_RULE, BONUS_POINTS, SEIZE, { title: 'Winning', text: 'After 6 rounds, the side holding the marker wins.' }],
  }),
  attackDefend({
    id: 'opr-smash-and-grab', name: 'Smash & Grab', objectives: 'D3+2',
    summary: 'The attacker hunts for a hidden relic among the defender\'s markers and must get it to a table edge.',
    scoring: { objectiveVp: 0, when: 'last' },
    counters: [MISSION_WON],
    rules: [
      ROLES_RULE, BONUS_POINTS,
      { title: 'Placing objectives', text: 'The defender sets up D3+2 markers, then secretly notes one as a trap and one as the relic.' },
      { title: 'Revealing', text: 'When an attacking unit seizes a marker, the defender reveals it. A trap deals D6+1 hits to the unit. Any marker that is not the relic is removed.' },
      { title: 'The relic', text: 'The unit that seizes the relic carries it. If the unit is Shaken or destroyed, the relic is dropped on the spot.' },
      { title: 'Winning', text: 'After 6 rounds, the attacker wins if the relic is within 6" of any table edge. Otherwise the defender wins.' },
    ],
  }),
  attackDefend({
    id: 'opr-ambush', name: 'Ambush', objectives: 'D3',
    summary: 'The attacker deploys right among the defender\'s army. Hold the most markers after 6 rounds.',
    deployment: 'The defender deploys half its units in its deployment zone. The attacker deploys anywhere over 12" from enemy units and within 6" of another friendly unit. Then the defender deploys the rest anywhere over 12" from enemy units.',
    rules: [ROLES_RULE, { title: 'Placing objectives', text: 'Set up D3 markers, the defender placing first.' }, SEIZE, MOST_MARKERS(6)],
  }),
  attackDefend({
    id: 'opr-last-stand', name: 'Last Stand', objectives: 1,
    summary: 'The defender holds the centre against waves of returning attackers.',
    deployment: 'The defender sets up 1 marker within 12" of the table centre and deploys its whole army within 12" of the centre. Then the attacker deploys within 12" of any table edge.',
    rules: [
      ROLES_RULE, SEIZE,
      { title: 'Reserves', text: 'The first time an attacking unit is destroyed, put it in reserve. At the start of each round, roll for each reserve: on a 6 it is placed within 12" of any table edge. A unit can only go to reserve once, and if the attacker has no units on the table at the start of a round, the remaining reserves are destroyed.' },
      { title: 'Winning', text: 'After 6 rounds, the side holding the marker wins.' },
    ],
  }),
  attackDefend({
    id: 'opr-vip-escort', name: 'VIP Escort', objectives: 1,
    summary: 'The defender escorts a marker across the table; the attacker must stop it.',
    scoring: { objectiveVp: 0, when: 'last' },
    counters: [MISSION_WON],
    deployment: 'The defender sets up the marker within 6" of a table edge and deploys within 12" of it. The attacker deploys within 12" of any table edge and over 12" from enemy units.',
    rules: [
      ROLES_RULE, SEIZE,
      { title: 'Moving the VIP', text: 'At the start of each round, if the defender holds the marker, it may move it up to 12" in any direction.' },
      { title: 'Winning', text: 'After 6 rounds, the defender wins if the marker is within 6" of the edge opposite where it started. Otherwise the attacker wins.' },
    ],
  }),
  attackDefend({
    id: 'opr-the-rescue', name: 'The Rescue', objectives: 1,
    summary: 'The attacker must carry a central marker off to a table edge while both armies arrive from reserve.',
    scoring: { objectiveVp: 0, when: 'last' },
    counters: [MISSION_WON],
    deployment: 'The defender sets up 1 marker within 12" of the table centre. Each player deploys at most half its units and keeps the rest in reserve.',
    rules: [
      ROLES_RULE, BONUS_POINTS, SEIZE,
      { title: 'Reserves', text: 'At the start of each round after the first, roll for each reserve: on a 4+ it is placed within 12" of any table edge, over 12" from enemy units and from the marker.' },
      { title: 'Carrying', text: 'An attacking unit that seizes the marker carries it. If that unit is Shaken or destroyed, the marker is dropped and the defender may move it up to 6" in any direction.' },
      { title: 'Winning', text: 'After 6 rounds, the attacker wins if the marker is within 6" of any table edge. Otherwise the defender wins.' },
    ],
  }),
];

/** The OPR mission tables: roll a type (1-2, 3-4, 5-6), then a D6 within it. */
export const ADVANCED_MISSION_TABLE: Record<MissionGroup, MissionDef[]> = {
  'Face-Off': FACE_OFF_MISSIONS,
  'Progressive Scoring': PROGRESSIVE_MISSIONS,
  'Attack & Defend': ATTACK_DEFEND_MISSIONS,
};

export function rollAdvancedMission(rng = Math.random): MissionDef {
  const groups = Object.values(ADVANCED_MISSION_TABLE);
  const group = groups[Math.floor(rng() * 3)];
  return group[Math.floor(rng() * 6)];
}

/** OPR Advanced deployment styles (the table maps are on p.21-23 of the Advanced Rules). */
export const DEPLOYMENT_STYLES: { group: string; desc: string; styles: string[] }[] = [
  { group: 'Balanced', desc: 'Fairly standard gameplay. Frontline is the core-rules deployment.', styles: ['Frontline', 'Ground War', 'Side Battle', 'Disordered', 'Spearhead', 'Opposing Forces'] },
  { group: 'Strategic', desc: 'Balanced, with twists that need strategic thinking.', styles: ["No Man's Land", 'Long Haul', 'Flank Assault', 'Frontal Clash', 'Tactical Push', 'Meeting Engagement'] },
  { group: 'Unbalanced', desc: 'One player is surrounded or at a disadvantage.', styles: ['Open Warzone', 'Pushback', 'Cornered', 'Encircled', 'Behind Enemy Lines', 'Lightning Strike'] },
];

/** Roll a D6 on one deployment table. */
export function rollDeployment(group: string, rng = Math.random): string {
  const t = DEPLOYMENT_STYLES.find((d) => d.group === group) ?? DEPLOYMENT_STYLES[0];
  return t.styles[Math.floor(rng() * 6)];
}

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

export const BUILTIN_MISSIONS: MissionDef[] = [...FACE_OFF_MISSIONS, ...PROGRESSIVE_MISSIONS, ...ATTACK_DEFEND_MISSIONS, EXAMPLE_MISSION];

export const SOURCES: MissionSource[] = ['OPR', 'Crusade', 'Nexus Wars', 'Custom'];

/** Built-in missions, then the group's custom ones (a custom mission with a built-in's id replaces it). */
export function allMissions(custom: MissionDef[] = []): MissionDef[] {
  const ids = new Set(custom.map((m) => m.id));
  return [...BUILTIN_MISSIONS.filter((m) => !ids.has(m.id)), ...custom];
}

export const isBuiltin = (id: string) => BUILTIN_MISSIONS.some((m) => m.id === id);
