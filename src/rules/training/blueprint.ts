import { mapFor, N, noBuild, open, overlaps, routeLength, within, type Tile } from './map';
import { placeProblem } from './board';
import { TRAINING } from '../downtimeData';
import type { TrainingRun } from './types';

// Maze blueprints: a player's planned maze, drawn on an empty map and shown as a ghost in their runs, so they know where
// to set each piece. The route never changes, so a plan fits every run (the cover differs, but cover doesn't stop
// building). Synced with the player's account as shared/blueprint-<id>, like zone saves; a share code carries one to
// another player.

export interface Blueprint {
  id: string;
  /** Whose it is (the signed-in email; '' on a device that isn't signed in, which keeps it to itself). */
  owner: string;
  name: string;
  updatedAt: string;
  /** Each planned 2×2 piece by its top-left cell, in the order they were drawn. */
  spots: Tile[];
}

export const BLUEPRINT_PREFIX = 'shared/blueprint-';
/** Most spots a plan holds (a run sets well under this many pieces). */
export const BLUEPRINT_MAX = 400;
/** The most blueprints a player keeps. */
export const BLUEPRINT_KEEP = 20;

/** Why a planned piece can't go with its top-left at (x, y), or null: as a run's placeProblem, against the plan. */
export function spotProblem(spots: Tile[], x: number, y: number): string | null {
  const why = noBuild(x, y);
  if (why) return why;
  const at = { x, y };
  if (spots.some((s) => overlaps(s, at))) return 'That overlaps a planned piece.';
  if (spots.length >= BLUEPRINT_MAX) return `A plan holds at most ${BLUEPRINT_MAX} pieces.`;
  if (!open([...spots, at])) return 'That would wall the route off.';
  return null;
}

/** A click on the editor: drop the planned piece covering `cell`, else add one at `place` if it may go there. Returns
 *  the new spots and why nothing changed, if so. */
export function toggleSpot(spots: Tile[], cell: Tile, place: Tile): { spots: Tile[]; why?: string } {
  const i = spots.findIndex((s) => within(s, cell.x, cell.y));
  if (i >= 0) return { spots: spots.filter((_, j) => j !== i) };
  const why = spotProblem(spots, place.x, place.y);
  return why ? { spots, why } : { spots: [...spots, { x: place.x, y: place.y }] };
}

/** The route's length through a plan, and through the open map, in cells. */
export const mazeLength = (spots: Tile[]) => routeLength(mapFor(spots));
export const openLength = () => routeLength(mapFor([]));

/** How a planned spot stands in a run: a piece already there, something else in the way (a piece overlapping it, or
 *  setting it now would wall the route off), or open. */
export type SpotState = 'filled' | 'blocked' | 'open';

export function ghostSpots(run: TrainingRun, spots: Tile[]): { at: Tile; state: SpotState; n: number }[] {
  return spots.map((at, i) => {
    const n = i + 1;
    if (run.pieces.some((p) => p.x === at.x && p.y === at.y)) return { at, state: 'filled', n };
    return { at, state: placeProblem(run, at.x, at.y) ? 'blocked' : 'open', n };
  });
}

// Share codes: "MB1:<name>:<spots>", the name URI-encoded, each spot two base-62 digits (the map is 62 cells wide).
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const CODE_HEAD = 'MB1';

export function blueprintCode(b: Pick<Blueprint, 'name' | 'spots'>): string {
  return `${CODE_HEAD}:${encodeURIComponent(b.name)}:${b.spots.map((s) => DIGITS[s.x] + DIGITS[s.y]).join('')}`;
}

/** A share code back to a name and spots (spots that can't stand with the ones before them are dropped), or null when
 *  it isn't one. */
export function readBlueprintCode(code: string): { name: string; spots: Tile[]; dropped: number } | null {
  const m = /^MB1:([^:]*):([0-9A-Za-z]*)$/.exec(code.trim().replace(/\s+/g, ''));
  if (!m || m[2].length % 2) return null;
  let name: string;
  try { name = decodeURIComponent(m[1]); } catch { return null; }
  const spots: Tile[] = [];
  let dropped = 0;
  for (let i = 0; i < m[2].length; i += 2) {
    const x = DIGITS.indexOf(m[2][i]);
    const y = DIGITS.indexOf(m[2][i + 1]);
    if (x < 0 || y < 0 || x > N - 2 || y > N - 2 || spotProblem(spots, x, y)) dropped++;
    else spots.push({ x, y });
  }
  return { name: name.trim().slice(0, 40) || 'Shared maze', spots, dropped };
}

/** The blueprints a player sees: their own, and any made before they signed in. */
export const myBlueprints = (all: Blueprint[] | undefined, email: string | undefined): Blueprint[] =>
  (all ?? []).filter((b) => !b.owner || b.owner === email);

/** An empty run in the build phase with the plan's pieces set as rubble, for the editor's map (its route walks round them). */
export function planRun(spots: Tile[]): TrainingRun {
  return {
    v: 10, forceId: '', seed: 1, rng: 1, phase: 'build', wave: 0, cleared: 0, t: 0, power: 0, baseHp: TRAINING.baseHp,
    credits: 0, luck: 0, mends: 0, leaked: 0, nextId: spots.length + 1, pieces: spots.map((s, i) => ({ id: i + 1, kind: 'rubble', x: s.x, y: s.y })),
    draft: { step: 'done', hand: [], placed: [] }, recipes: [], crafted: [], enemies: [], queue: [], cover: [], cards: [],
    mods: { bounty: 1, holdMul: 1, regrabAdd: 0 }, banked: {}, fx: [], log: [],
  };
}
