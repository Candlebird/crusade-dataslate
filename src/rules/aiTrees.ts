import type { Unit } from '../model/types';

// Decision trees for AI-run units, transcribed from the group's DecisionTrees.drawio (Hybrid, Shooting and Melee pages).
// Each activation walks one tree from `start`: every answer either asks the next question (`go`) or gives the order (`act`).

export type AiStyle = 'hybrid' | 'shooting' | 'melee';

export interface AiAnswer {
  label: string;
  go?: string;
  act?: string;
}

export interface AiTree {
  label: string;
  start: string;
  nodes: Record<string, { ask: string; answers: AiAnswer[] }>;
}

const OBJECTIVES = 'Any objectives not controlled by the AI?';
const IN_THE_WAY = 'Any enemies in the way to the objective?';
const RANGE = 'What is the range?';
const CHARGE_RANGE = 'Are any enemies in Charge range?';
const ADVANCE_SHOOT = 'If you Advance, will any enemies be in shooting range?';
const ADVANCE_TOWARD = 'If you Advance towards an enemy, will they be in shooting range?';

const yesNo = (yes: Omit<AiAnswer, 'label'>, no: Omit<AiAnswer, 'label'>): AiAnswer[] => [{ label: 'Yes', ...yes }, { label: 'No', ...no }];

export const AI_TREES: Record<AiStyle, AiTree> = {
  hybrid: {
    label: 'Hybrid',
    start: 'objectives',
    nodes: {
      objectives: { ask: OBJECTIVES, answers: yesNo({ go: 'inTheWay' }, { go: 'chargeRange' }) },
      inTheWay: { ask: IN_THE_WAY, answers: yesNo({ go: 'range' }, { go: 'rushRange' }) },
      range: {
        ask: RANGE,
        answers: [
          { label: 'Can Charge', act: 'Charge!' },
          { label: 'Can Shoot', act: 'Advance and Shoot!' },
          { label: 'Too Far', act: 'Rush towards the nearest Objective!' },
        ],
      },
      rushRange: { ask: 'Is the objective in Rush range and not Advance range?', answers: yesNo({ act: 'Rush towards the nearest Objective!' }, { go: 'advanceShoot' }) },
      advanceShoot: { ask: ADVANCE_SHOOT, answers: yesNo({ act: 'Advance and Shoot!' }, { go: 'chargeRange' }) },
      chargeRange: { ask: CHARGE_RANGE, answers: yesNo({ act: 'Charge!' }, { go: 'advanceToward' }) },
      advanceToward: { ask: ADVANCE_TOWARD, answers: yesNo({ act: 'Advance and shoot the nearest enemy!' }, { act: 'Rush the nearest enemy!' }) },
    },
  },
  shooting: {
    label: 'Shooting',
    start: 'objectives',
    nodes: {
      objectives: { ask: OBJECTIVES, answers: yesNo({ go: 'advanceShoot' }, { go: 'advanceToward' }) },
      advanceShoot: { ask: ADVANCE_SHOOT, answers: yesNo({ act: 'Advance and Shoot!' }, { go: 'advanceToward' }) },
      advanceToward: { ask: ADVANCE_TOWARD, answers: yesNo({ act: 'Advance and shoot the nearest enemy!' }, { act: 'Rush the nearest enemy!' }) },
    },
  },
  melee: {
    label: 'Melee',
    start: 'objectives',
    nodes: {
      objectives: { ask: OBJECTIVES, answers: yesNo({ go: 'inTheWay' }, { go: 'chargeRange' }) },
      inTheWay: { ask: IN_THE_WAY, answers: yesNo({ go: 'range' }, { act: 'Rush the Objective!' }) },
      range: {
        ask: RANGE,
        answers: [
          { label: 'Can Charge', act: 'Charge!' },
          { label: "Can't Charge", act: 'Rush the Objective!' },
        ],
      },
      chargeRange: { ask: CHARGE_RANGE, answers: yesNo({ act: 'Charge!' }, { act: 'Rush the nearest enemy!' }) },
    },
  },
};

export const AI_STYLES = Object.keys(AI_TREES) as AiStyle[];

/**
 * Which tree a unit follows. Plain melee weapons (no special rules, like a basic CCW) don't make a gun unit a
 * hybrid, so a rifle squad counts as Shooting; a unit with no ranged weapon is Melee.
 */
export function aiStyleFor(u: Pick<Unit, 'weapons'>): AiStyle {
  const ranged = u.weapons.some((w) => w.range > 0);
  const melee = u.weapons.some((w) => w.range === 0 && w.rules.length + w.traits.length > 0);
  if (!ranged) return 'melee';
  return melee ? 'hybrid' : 'shooting';
}

/** Pick a random unit that can still activate this round. */
export function randomActivation<T extends { destroyed: boolean; activated: boolean }>(units: T[], rng = Math.random): T | undefined {
  const ready = units.filter((u) => !u.destroyed && !u.activated);
  return ready[Math.floor(rng() * ready.length)];
}
