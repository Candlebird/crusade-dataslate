import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { waveCredits } from './economy';
import { affixInfo, budgetMul, creditMul, eventInfo, eventMapped, nexusLines, nexusOf, nexusStart } from './nexus';
import { campaign, guardian } from './nexusTest';
import { createRun, runXpCap } from './run';
import { blankRun } from './testRun';

// The campaign as a run meets it: threat, affixes, the event, and what they change at the start.

const X = TRAINING.nexus;

describe('nexus', () => {
  it('is nothing outside a campaign: threat 0, no event, the generic lord', () => {
    expect(nexusOf(undefined)).toBeUndefined();
    const lines = nexusLines(undefined);
    expect(lines.threat).toMatch(/Threat 0/);
    expect(lines.affixes).toEqual([]);
    expect(lines.lords).toHaveLength(1);
    expect(creditMul(blankRun())).toBe(1);
  });

  it('reads threat, one affix per two levels (at most three), the same for the whole round', () => {
    expect(nexusOf(campaign(0))!.affixes).toEqual([]);
    expect(nexusOf(campaign(1))!.affixes).toHaveLength(1);
    expect(nexusOf(campaign(4))!.affixes).toHaveLength(2);
    expect(nexusOf(campaign(6))!.affixes).toHaveLength(X.affixes.max);
    expect(nexusOf(campaign(5))).toEqual(nexusOf(campaign(5)));
    expect(new Set(nexusOf(campaign(6))!.affixes).size).toBe(X.affixes.max);
    for (const a of nexusOf(campaign(6))!.affixes) expect(affixInfo(a, 6).text).not.toBe('');
  });

  it('pays 10% more credits a threat level', () => {
    const run = blankRun();
    const base = waveCredits(run);
    run.nexus = { threat: 3, affixes: [], lords: [] };
    expect(creditMul(run)).toBeCloseTo(1 + 3 * X.credit);
    expect(waveCredits(run)).toBe(Math.round(base * (1 + 3 * X.credit)));
  });

  it("counts only this round's event; Rising Dark adds a threat level", () => {
    expect(nexusOf(campaign(2, [], { event: { id: 'convoys', round: 1 } }))!.event).toBeUndefined();
    expect(nexusOf(campaign(2, [], { event: { id: 'convoys', round: 2 } }))!.event).toBe('convoys');
    expect(nexusOf(campaign(2, [], { event: { id: 'risingDark', round: 2 } }))!.threat).toBe(3);
  });

  it('applies the events that map, and shows the rest as flavour', () => {
    for (const id of ['warpStorm', 'ceasefire', 'resonance']) {
      expect(eventMapped(id)).toBe(false);
      expect(nexusLines({ threat: 1, affixes: [], event: id, lords: [] }).event).toMatch(/flavour/);
    }
    for (const id of Object.keys(X.events)) expect(eventInfo(id)!.effect).not.toBe('');
    const at = (id: string) => createRun('f', [], 1, undefined, { threat: 0, affixes: [], event: id, lords: [] });
    const plain = createRun('f', [], 1);
    expect(at('convoys').credits).toBe(plain.credits + X.events.convoys.credits);
    expect(at('shardRush').draft.hand).toHaveLength(TRAINING.shards.draw + X.events.shardRush.draw);
    expect(at('derelicts').cover.length).toBeGreaterThan(plain.cover.length);
    expect(runXpCap(at('glory'))).toBe(TRAINING.xpCap + X.events.glory.xp);
    expect(budgetMul(at('echoSurge'))).toBeCloseTo(X.events.echoSurge.budget);
    expect(budgetMul(at('voidLull'))).toBeCloseTo(X.events.voidLull.budget);
  });

  it('starts the base lower under Bleed, and copies the Nexus into the run as plain JSON', () => {
    const nx = { threat: 3, affixes: ['bleed' as const], lords: [] };
    expect(nexusStart({ nexus: nx }).baseHp).toBe(-3 * X.bleed.per);
    const run = createRun('f', [], 1, undefined, nx);
    expect(run.baseHp).toBe(TRAINING.baseHp - 3 * X.bleed.per);
    expect(run.nexus).toEqual(nx);
    expect(run.nexus).not.toBe(nx);
    expect(JSON.parse(JSON.stringify(run)).nexus).toEqual(nx);
  });

  it('lists the lords by wave for the start screen', () => {
    const nx = nexusOf(campaign(2, [guardian('Vor the Pale', 'Rare')]))!;
    const lines = nexusLines(nx);
    expect(lines.lords[0]).toMatch(/^Wave 5: Vor the Pale \(Rare\)/);
    expect(lines.lords).toHaveLength(2);
  });
});
