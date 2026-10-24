import { SORTIE_TRINKETS, TRAINING } from '../downtimeData';
import { trinketInfo } from '../sortie';
import { unitTowers } from './board';
import { applyTrinket, habitText, trinketHabit } from './habits';
import { pick, rand, type Rng } from './rng';
import type { CardDraw, TrainingRun } from './types';

// Sortie trinkets from Training: a boss kill can put one on offer as a 4th card, once a run. Taken, it goes to work on
// its unit at once and is the unit's to keep (bankShared equips it, or puts it in the force's spares).

/** The id a trinket card has in run.offer and run.cards. */
export const TRINKET_CARD = 'trinket';

/** Is this draw a trinket card. */
export const isTrinketCard = (d: CardDraw) => d.id === TRINKET_CARD && !!d.trinket;

/** The trinket roll's own dice, from the seed and wave, so it never shifts the run's. */
export const trinketDice = (run: TrainingRun): Rng => ({ rng: (run.seed ^ Math.imul(run.wave + 1, 0x9e3779b1)) | 0 });

/** Maybe a trinket card for this boss kill: at TRAINING.shared.trinkets.odds, once a run. It falls to the crafted unit
 *  with the most kills and no trinket, or to the spares if every one has one. */
export function trinketOffer(run: TrainingRun): CardDraw | undefined {
  const s = (run.trinket ??= { offered: false });
  const dice = trinketDice(run);
  if (s.offered || rand(dice) >= TRAINING.shared.trinkets.odds) return undefined;
  s.offered = true;
  const id = pick(dice, Object.keys(SORTIE_TRINKETS));
  const t = unitTowers(run).filter((u) => !u.trinket).sort((a, b) => b.kills - a.kills || b.dealt - a.dealt)[0];
  return { id: TRINKET_CARD, rarity: TRAINING.shared.trinkets.rarity, trinket: id, ...(t ? { unitId: t.unitId } : {}) };
}

/** A trinket card's name and text. */
export function trinketCardText(run: TrainingRun, d: CardDraw): { name: string; text: string } {
  const k = trinketInfo(d.trinket);
  const t = unitTowers(run).find((u) => u.unitId === d.unitId);
  if (!k) return { name: 'Trinket', text: '' };
  const here = habitText(trinketHabit(k));
  return {
    name: `Trinket: ${k.name}`,
    text: t ? `${t.name} keeps it. On a Sortie: ${k.text} Here: ${here}` : `To the force's spares. On a Sortie: ${k.text}`,
  };
}

/** Take a trinket card: on its unit now, and noted for the bank. */
export function takeTrinket(run: TrainingRun, d: CardDraw): void {
  const t = unitTowers(run).find((u) => u.unitId === d.unitId);
  if (t && d.trinket) applyTrinket(t, d.trinket);
  run.trinket = { offered: true, id: d.trinket, ...(t ? { unitId: t.unitId } : {}) };
}
