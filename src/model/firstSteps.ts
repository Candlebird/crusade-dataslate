import type { Force } from './types';

export interface FirstSteps {
  book: boolean;
  force: boolean;
  units: boolean;
  /** The step to do next, or null once a force of yours has units. */
  next: 'book' | 'force' | 'units' | null;
  /** Your first force still without units, to send the player to. */
  empty?: Force;
}

/**
 * How far a new player is along "import a book, make a force, add units". Done steps stay ticked even out of order:
 * a force dropped in from an Army Forge list arrives with its units before any book is imported elsewhere.
 */
export function firstSteps(bookCount: number, mine: Force[]): FirstSteps {
  const book = bookCount > 0;
  const force = mine.length > 0;
  const units = mine.some((f) => f.units.length > 0);
  const next = units ? null : !book ? 'book' : !force ? 'force' : 'units';
  return { book, force, units, next, empty: units ? undefined : mine[0] };
}
