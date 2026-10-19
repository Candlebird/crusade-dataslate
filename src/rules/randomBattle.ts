import type { Force } from '../model/types';
import { FORMATS } from './tracker';

// A random battle for the start screen: players split into random teams (or all against the AI),
// optionally with a random force for each side.

export type Format = (typeof FORMATS)[number];
type Rand = () => number;

export const MAX_PLAYERS = 6;

function shuffle<T>(rand: Rand, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

export const formatLabel = (teams: Format['teams']) =>
  teams.map((t) => (t.every((k) => k === 'ai') ? 'AI' : String(t.length))).join(' v ');

/**
 * Split the players into random teams. With the AI they all fight it together; without, there are
 * at least two teams of at least one player each, any number of teams being as likely as any other.
 */
export function randomFormat(players: number, ai: boolean, rand: Rand = Math.random): Format {
  const n = Math.max(ai ? 1 : 2, Math.min(MAX_PLAYERS, Math.floor(players)));
  let teams: Format['teams'];
  if (ai) teams = [Array(n).fill('player'), ['ai']];
  else {
    const k = 2 + Math.floor(rand() * (n - 1));
    const sizes = Array(k).fill(1);
    for (let i = k; i < n; i++) sizes[Math.floor(rand() * k)]++;
    sizes.sort((a, b) => b - a);
    teams = sizes.map((s) => Array(s).fill('player'));
  }
  return FORMATS.find((f) => f.label === formatLabel(teams)) ?? { label: formatLabel(teams), teams };
}

/** Up to n different forces with someone to field, in random order. */
export function randomForces(forces: Force[], n: number, rand: Rand = Math.random): Force[] {
  const ready = forces.filter((f) => f.units.some((u) => u.status === 'active'));
  return shuffle(rand, ready).slice(0, n);
}
