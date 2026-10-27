import type { Campaign, CatalogBook, Force, Settings } from '../../model/types';
import { echoesBook, roleEchoes } from '../echoForce';
import { STANDARD_MISSION } from '../missions';
import { ECHOES } from '../nexusData';
import { FORMATS, loadForce, loadUnits, newBattle, type TrackedBattle } from '../tracker';

// Practice: a force's active units against Void Echoes of about the same points, on a zone board. Nothing is lost and
// nothing is earned, so it's free to try a list or learn the board. Units that already fought this round come Battle-Worn.

/** The practice battle's save id for a force (one at a time). */
export const practiceId = (forceId: string) => `practice-${forceId}`;

export function practiceBattle(f: Force, books: CatalogBook[], settings: Settings, c?: Campaign, rand = Math.random): TrackedBattle {
  const b = newBattle(STANDARD_MISSION, practiceId(f.id), new Date().toISOString(), rand, FORMATS.find((x) => x.label === '1 v AI'));
  loadForce(b.sides[0], f, undefined, settings, c);
  const points = b.sides[0].units.reduce((s, u) => s + (u.points ?? 0), 0);
  const ai = b.sides.find((x) => x.ai)!;
  loadUnits(ai, ECHOES.name, roleEchoes(echoesBook(books), Math.max(250, points), rand));
  return b;
}
