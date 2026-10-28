import { describe, expect, it } from 'vitest';
import type { Force } from '../../model/types';
import { newUnit } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { CARDS, drawCards, rerollCards, rerollProblem, rerollsLeft } from './cards';
import {
  DRILL_GOALS, blankDrill, cardOpen, drillEarned, drillFrom, drillGoalText, drillOf, drillProgress, drillStats, luckCap, perkOf,
  unlockText,
} from './drill';
import { buyLuck, buyMend, luckCost, luckProblem } from './economy';
import { blankRun, testUnit } from './testRun';
import type { RunDrill, TrainingRun } from './types';

// Drill Honours: the track, what a force's goals open, and what a run held to them may do.

const D = TRAINING.drill;
const force = (o: Partial<Force> = {}): Force =>
  ({ id: 'f', name: 'Iron Hand', ledger: [], units: [newUnit({ id: 'a', name: 'Alpha' })], ...o }) as unknown as Force;
const drilled = (drill: RunDrill, o: Partial<TrainingRun> = {}): TrainingRun => Object.assign(blankRun(3), { drill }, o);
/** Every goal reached. */
const all = () => drillFrom(DRILL_GOALS.map((_, i) => i));

describe('drill honours', () => {
  it('has 25 goals (with the Final waves and luck 6-10), and every boss card opens once: at the start or in one group', () => {
    expect(DRILL_GOALS).toHaveLength(25);
    const groups = Object.values(D.groups).flatMap((g) => g.cards);
    const sources = [...D.cardsAtStart, ...groups];
    expect(new Set(sources).size).toBe(sources.length);
    expect([...sources].sort()).toEqual(CARDS.map((c) => c.id).sort());
    for (const g of DRILL_GOALS) {
      expect(g.n).toBeGreaterThan(0);
      if ('cards' in g.unlock) expect(D.groups[g.unlock.cards]).toBeDefined();
      expect(drillGoalText(g.goal, g.n)).toMatch(/\d/);
      expect(unlockText(g.unlock).name).not.toBe('');
    }
  });

  it('a fresh force: luck to 5, the start cards, no perks', () => {
    const d = drillOf(force());
    expect(d).toEqual({ luck: D.luckAtStart, cards: D.cardsAtStart, perks: {} });
    expect(drillEarned(force())).toEqual([]);
  });

  it('every goal reached opens luck 10, every card and every perk', () => {
    const d = all();
    expect(d.luck).toBe(TRAINING.shards.luckCost.length);
    expect([...d.cards].sort()).toEqual(CARDS.map((c) => c.id).sort());
    expect(d.perks).toEqual({ purse: 5, mend: 3, reroll: 5, thrift: 3 });
  });

  it('counts goals from the force, and an old force starts from its units\' records', () => {
    const a = newUnit({ id: 'a', name: 'Alpha' });
    a.trainingRecord = { best: 9, kills: 950, lords: 1, runs: 4, mvps: 1 };
    const b = newUnit({ id: 'b', name: 'Bravo' });
    b.trainingRecord = { best: 6, kills: 60, lords: 0, runs: 2, mvps: 0 };
    const f = force({ units: [a, b], trainingBest: 11 });
    expect(drillStats(f)).toMatchObject({ runs: 4, kills: 1010, lords: 1 });
    expect(drillProgress(f, 'best')).toBe(11);
    const earned = drillEarned(f);
    // runs 1, best 5, kills 1000, runs 4, best 10, lords 1
    expect(earned).toEqual([0, 1, 2, 4, 5, 7]);
    const st = { ...blankDrill(), runs: 1 };
    expect(drillEarned(force({ drill: st }))).toEqual([0]);
  });

  it('a run with no drill has everything open', () => {
    const run = blankRun();
    expect(luckCap(run)).toBe(TRAINING.shards.luckCost.length);
    expect(CARDS.every((c) => cardOpen(run, c.id))).toBe(true);
    expect(perkOf(run, 'purse')).toBe(0);
  });

  it('caps luck until a Drill Honour opens it', () => {
    const run = drilled(drillFrom([]), { credits: 9999, luck: D.luckAtStart });
    expect(luckProblem(run)).toMatch(/Drill Honour/);
    expect(() => buyLuck(run)).toThrow();
    const open = drilled(drillFrom([3]), { credits: 9999, luck: D.luckAtStart });
    expect(luckProblem(open)).toBeNull();
    buyLuck(open);
    expect(open.luck).toBe(D.luckAtStart + 1);
    while (!luckProblem(open)) buyLuck(open);
    expect(open.luck).toBe(6);
    expect(luckProblem(open)).toMatch(/Drill Honour/);
  });

  it('draws boss cards only from the open pool', () => {
    const run = drilled(drillFrom([]));
    run.pieces.push(testUnit());
    for (let i = 0; i < 40; i++) for (const d of drawCards(run)) expect(D.cardsAtStart).toContain(d.id);
  });

  it('perks: thrift, purse, mend; no perk widens the card offer', () => {
    const base = TRAINING.shards.luckCost[0];
    expect(luckCost(drilled({ luck: 4, cards: [], perks: { thrift: 2 } }))).toBe(Math.round(base * (1 - 2 * D.perks.thrift)));
    const hurt = drilled({ luck: 4, cards: [], perks: { mend: 1 } }, { credits: 9999, baseHp: 1 });
    buyMend(hurt);
    expect(hurt.baseHp).toBe(1 + TRAINING.mend.hp + D.perks.mend);
    const wide = drilled({ ...all(), perks: { reroll: 9 } });
    wide.pieces.push(testUnit());
    expect(drawCards(wide)).toHaveLength(TRAINING.cards.offer);
    expect(drawCards(wide, 9)).toHaveLength(TRAINING.cards.offer);
  });

  it('re-draws a card offer with the reroll perk, as many times as it has levels', () => {
    const none = drilled({ ...all(), perks: {} }, { offer: [{ id: 'aim', rarity: 'Common' }] });
    expect(rerollProblem(none)).toMatch(/Drill Honour/);
    const run = drilled({ ...all(), perks: { reroll: 1 } }, { offer: [{ id: 'aim', rarity: 'Common' }] });
    expect(rerollsLeft(run)).toBe(1);
    run.pieces.push(testUnit());
    rerollCards(run);
    expect(run.offer!.length).toBe(TRAINING.cards.offer);
    expect(rerollsLeft(run)).toBe(0);
    expect(rerollProblem(run)).toMatch(/left/);
    expect(() => rerollCards(run)).toThrow();
  });
});
