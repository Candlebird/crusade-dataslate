import { describe, expect, it } from 'vitest';
import { SORTIE_TRINKETS, TRAINING } from '../downtimeData';
import { cardText, offerCards, pickCard } from './cards';
import { blankRun, testUnit } from './testRun';
import { isTrinketCard, trinketOffer, TRINKET_CARD } from './trinkets';
import type { TrainingRun } from './types';

// A Sortie trinket as a 4th boss-kill card, once a run.

/** A run with two crafted units whose next trinket roll comes up (or not). */
function withUnits(seed: number): TrainingRun {
  const run = blankRun(seed);
  run.pieces.push(testUnit({ unitId: 'a', kills: 2 }), testUnit({ unitId: 'b', kills: 7, name: 'Best' }));
  return run;
}

describe('trinkets', () => {
  it('offers one a boss kill at its odds, at most one a run, to the best unit without one', () => {
    let offered = 0;
    let got;
    for (let s = 1; s < 200; s++) {
      const run = withUnits(s);
      const rng = run.rng;
      const d = trinketOffer(run);
      expect(run.rng, 'its own dice, not the run’s').toBe(rng);
      expect(run.trinket?.offered).toBe(!!d);
      if (!d) continue;
      offered++;
      got = d;
      // Once offered, never again this run (a boss kill that rolls none leaves it for the next).
      for (let k = 0; k < 20; k++) expect(trinketOffer(run)).toBeUndefined();
    }
    expect(offered / 199).toBeGreaterThan(TRAINING.shared.trinkets.odds - 0.12);
    expect(offered / 199).toBeLessThan(TRAINING.shared.trinkets.odds + 0.12);
    expect(got).toMatchObject({ id: TRINKET_CARD, unitId: 'b' });
    expect(SORTIE_TRINKETS[got!.trinket!]).toBeDefined();
  });

  it('goes to the spares when every unit carries one', () => {
    for (let s = 1; s < 200; s++) {
      const run = blankRun(s);
      run.pieces.push(testUnit({ trinket: 'charm' }));
      const d = trinketOffer(run);
      if (!d) continue;
      expect(d.unitId).toBeUndefined();
      expect(cardText(run, d).text).toMatch(/spares/);
      return;
    }
    throw new Error('never offered');
  });

  it('rides as a 4th card, and taking it puts it on the unit', () => {
    for (let s = 1; s < 400; s++) {
      const run = withUnits(s);
      offerCards(run);
      const i = run.offer!.findIndex(isTrinketCard);
      if (i < 0) continue;
      expect(run.offer).toHaveLength(TRAINING.cards.offer + 1);
      const d = run.offer![i];
      expect(cardText(run, d).name).toBe(`Trinket: ${SORTIE_TRINKETS[d.trinket!].name}`);
      pickCard(run, i);
      expect(run.pieces.find((p) => p.kind === 'unit' && p.unitId === 'b')).toMatchObject({ trinket: d.trinket });
      expect(run.trinket).toEqual({ offered: true, id: d.trinket, unitId: 'b' });
      return;
    }
    throw new Error('never offered');
  });
});
