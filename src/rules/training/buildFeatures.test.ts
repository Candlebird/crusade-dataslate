import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { cardById, offerCards, pickCard, rerollCards } from './cards';
import { rateOf } from './combat';
import { buildOf } from './buildView';
import { aceSteps, cardMul, chainMax, hurt } from './harm';
import { botCard, botSpec } from './bot';
import { nextLord } from './lordPick';
import { nextBoss } from './nextRound';
import { pickSpec, SPEC, SPECS, specDue, specProblem, specsOf } from './specs';
import { pairOf, STRAT_PREFIX, STRATAGEMS } from './stratagems';
import { blankRun, testEnemy, testUnit } from './testRun';
import { TROPHIES, TROPHY_OF_SIG, TROPHY_OF_TRICK, TROPHY_PREFIX, trophyById } from './trophies';
import type { CardDraw, TrainingRun, UnitTower } from './types';

// The build-panel features: capped growth, specialisations, stratagems (card pairs) and trophies.

const ROLES13 = ['fortress', 'flyer', 'artillery', 'phantom', 'mystic', 'charger', 'ambusher', 'support', 'hunter', 'skirmisher', 'bulwark', 'reaver', 'gunline'] as const;

const withUnits = (n = 1, o: Partial<UnitTower> = {}): TrainingRun => {
  const run = blankRun(3);
  for (let i = 0; i < n; i++) run.pieces.push(testUnit({ unitId: `u${i}`, x: 20 + i * 2, y: 30, ...o }));
  return run;
};
const held = (id: string, unitId = 'u0'): CardDraw => ({ id, rarity: 'Common', unitId });

describe('capped growth', () => {
  it('Ace stops at its cap however many kills', () => {
    const run = withUnits();
    const t = run.pieces[0] as UnitTower;
    t.ace = 0.08;
    t.kills = 100000;
    expect(aceSteps(t)).toBe(TRAINING.cards.ace.max);
    expect(cardMul(run, t, testEnemy())).toBeCloseTo(1 + 0.08 * TRAINING.cards.ace.max);
    expect(cardById('ace')!.text(0.08)).toContain(`up to +${Math.round(0.08 * TRAINING.cards.ace.max * 100)}%`);
  });

  it('Pack tactics counts at most pack.max units', () => {
    const run = withUnits(9);
    for (const p of run.pieces as UnitTower[]) { p.x = 20; p.y = 30; }
    const t = run.pieces[0] as UnitTower;
    t.pack = 0.1;
    expect(cardMul(run, t, testEnemy())).toBeCloseTo(1 + 0.1 * TRAINING.cards.pack.max);
  });

  it('Kill chain stacks no higher than its cap, however many kills', () => {
    const run = withUnits();
    const t = run.pieces[0] as UnitTower;
    t.chain = { per: 0.1, stacks: 0, left: 0 };
    for (let i = 0; i < 50; i++) hurt(run, t, testEnemy({ hp: 1, maxHp: 1 }), 5, 'shot');
    expect(t.chain.stacks).toBe(chainMax(run));
  });
});

describe('specialisations', () => {
  it('two for each of the 13 archetypes, no base mending', () => {
    for (const r of ROLES13) expect(specsOf(r)).toHaveLength(2);
    expect(SPECS).toHaveLength(26);
    for (const s of SPECS) expect(s.text).not.toMatch(/base|mend/i);
  });

  it('are earned by level-ups or kills, picked once, for good', () => {
    const run = withUnits(1, { role: 'gunline' });
    const t = run.pieces[0] as UnitTower;
    expect(specProblem(run, t.id, 'firingLine')).toMatch(/Specialises at/);
    expect(specDue(run)).toHaveLength(0);
    t.kills = SPEC.kills;
    expect(specDue(run)).toHaveLength(1);
    expect(specProblem(run, t.id, 'heavyShells')).toMatch(/Not one/);
    const before = rateOf(run, t);
    pickSpec(run, t.id, 'firingLine');
    expect(rateOf(run, t)).toBeCloseTo(before * 1.12);
    expect(specProblem(run, t.id, 'suppressing')).toMatch(/already/);
    expect(() => pickSpec(run, t.id, 'suppressing')).toThrow();
  });

  it('static specs change the tower at the pick; Marksman hits bosses and elites harder', () => {
    const run = withUnits(1, { role: 'hunter', up: SPEC.level });
    const t = run.pieces[0] as UnitTower;
    pickSpec(run, t.id, 'marksman');
    expect(cardMul(run, t, testEnemy({ elite: true }))).toBeCloseTo(1.25);
    expect(cardMul(run, t, testEnemy())).toBeCloseTo(1);
    const r2 = withUnits(1, { role: 'artillery', up: SPEC.level });
    const a = r2.pieces[0] as UnitTower;
    pickSpec(r2, a.id, 'heavyShells');
    expect(a.guns[0].ap).toBe(1);
  });

  it('the bot skips hold specs for a unit that cannot hold', () => {
    expect(botSpec(testUnit({ role: 'charger', tough: 1 }))!.id).toBe('trample');
    expect(botSpec(testUnit({ role: 'charger', tough: 3 }))!.id).toBe('momentum');
  });
});

describe('stratagems', () => {
  it('pair real boss cards, each card in one pair at most', () => {
    const all = STRATAGEMS.flatMap((s) => s.needs);
    expect(new Set(all).size).toBe(all.length);
    for (const c of all) expect(cardById(c)).toBeDefined();
    expect(STRATAGEMS.length).toBeGreaterThanOrEqual(8);
  });

  it('once both cards are held, the next offer holds it in place of a card: still three', () => {
    const run = withUnits();
    run.cards.push(held('whet'));
    expect(pairOf(run, 'whet')).toMatchObject({ other: 'deadly', held: 0, status: 'building' });
    run.cards.push(held('deadly'));
    expect(pairOf(run, 'whet')!.status).toBe('ready');
    offerCards(run);
    expect(run.offer).toHaveLength(TRAINING.cards.offer);
    expect(run.offer!.filter((d) => d.id === `${STRAT_PREFIX}overkill`)).toHaveLength(1);
    const ap = (run.pieces[0] as UnitTower).guns[0].ap;
    pickCard(run, run.offer!.findIndex((d) => d.id.startsWith(STRAT_PREFIX)));
    expect(run.stratagems).toEqual(['overkill']);
    expect((run.pieces[0] as UnitTower).guns[0].ap).toBe(ap + 1);
    offerCards(run);
    expect(run.offer!.some((d) => d.id.startsWith(STRAT_PREFIX))).toBe(false);
  });

  it('a re-draw keeps it and keeps three', () => {
    const run = withUnits();
    run.drill = { luck: 10, cards: [], perks: { reroll: 1 } };
    run.drill.cards = Object.values(TRAINING.drill.groups).flatMap((g) => g.cards);
    run.cards.push(held('bounty'), held('promote'));
    offerCards(run);
    rerollCards(run);
    expect(run.offer).toHaveLength(3);
    expect(run.offer!.some((d) => d.id === `${STRAT_PREFIX}spoils`)).toBe(true);
  });
});

describe('trophies', () => {
  it('every trick and signature has one; none mends the base', () => {
    for (const id of [...Object.values(TROPHY_OF_TRICK), ...Object.values(TROPHY_OF_SIG)]) expect(trophyById(id)).toBeDefined();
    for (const t of TROPHIES) expect(t.text).not.toMatch(/base|mend/i);
  });

  it('a real lord slain puts its trophy in its own offer, in place of a card, to the tower that slew it', () => {
    const run = withUnits(2);
    run.nexus = { threat: 1, affixes: [], lords: [{ key: 'k', name: 'Gorrak', tier: 'Common', trick: 'regen', from: 'guardian' }] } as unknown as TrainingRun['nexus'];
    const by = run.pieces[1] as UnitTower;
    const boss = testEnemy({ kind: 'lord', hp: 5, maxHp: 5, lord: { i: 0, next: 0, ward: 0, burst: 0 } });
    run.enemies.push(boss);
    hurt(run, by, boss, 50, 'shot');
    expect(run.offer).toHaveLength(3);
    const i = run.offer!.findIndex((d) => d.id === `${TROPHY_PREFIX}livingHeart`);
    expect(i).toBeGreaterThanOrEqual(0);
    expect(run.offer![i].unitId).toBe(by.unitId);
    expect(botCard(run)).toBe(i);
    pickCard(run, i);
    expect(by.atkBonus).toBeCloseTo(1.15);
    expect(run.trophies).toEqual(['livingHeart']);
    expect(run.trophyDue).toBeUndefined();
    const v = buildOf(run);
    expect(v.trophies[0].name).toBe('Living Heart');
    expect(v.towers.find((t) => t.id === by.id)!.cards[0].name).toBe('Trophy: Living Heart');
  });

  it('a plain boss leaves none', () => {
    const run = withUnits();
    const boss = testEnemy({ kind: 'lord', hp: 5, maxHp: 5 });
    hurt(run, run.pieces[0] as UnitTower, boss, 50, 'shot');
    expect(run.trophyDue).toBeUndefined();
    expect((run.offer ?? []).some((d) => d.id.startsWith(TROPHY_PREFIX))).toBe(false);
  });
});

describe('build view', () => {
  it('shows held cards with live numbers and the cap', () => {
    const run = withUnits();
    const t = run.pieces[0] as UnitTower;
    run.offer = [{ id: 'ace', rarity: 'Legendary', unitId: 'u0' }];
    pickCard(run, 0);
    t.kills = 35;
    const v = buildOf(run);
    expect(v.towers[0].cards[0].name).toBe('Ace');
    expect(v.towers[0].live.join(' ')).toMatch(/Ace: 8% per 10 kills, up to \+64% \(now \+24%\)/);
    expect(v.strats.length).toBe(STRATAGEMS.length);
  });
});

describe('next boss', () => {
  it('names the next boss wave; a real lord shows its trick and trophy', () => {
    const run = withUnits();
    const plain = nextBoss(run)!;
    expect(plain.wave % TRAINING.wave.bossEvery).toBe(0);
    expect(plain.trophy).toBeUndefined();
    run.nexus = { threat: 1, affixes: [], lords: [{ key: 'k', name: 'Gorrak', tier: 'Common', trick: 'regen', from: 'guardian' }] } as unknown as TrainingRun['nexus'];
    const at = nextLord(run, 0)!;
    expect(at).toBeDefined();
    run.wave = at.wave - 1;
    const b = nextBoss(run)!;
    expect(b).toMatchObject({ wave: at.wave, name: 'Gorrak', trophy: { name: 'Living Heart' } });
    expect(b.trick).toMatch(/^.+: /);
  });
});
