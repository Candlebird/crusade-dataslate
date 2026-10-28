import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { CARDS, autoCardIndex, cardById, cardText, cardTower, cardUseful, drawCards, offerCards, pickCard } from './cards';
import { rateOf } from './combat';
import { DEFAULTS, defaultTower } from './emplacements';
import { cardMul, hurt } from './harm';
import { blankRun } from './testRun';
import type { DefaultTower, TrainingRun, UnitTower } from './types';

// Boss-kill cards.

const unit = (o: Partial<UnitTower> = {}): UnitTower => ({
  id: 9, x: 20, y: 20, kind: 'unit', unitId: 'u', name: 'Wardens', category: 'Infantry' as UnitTower['category'], points: 120, rank: 0,
  tough: 3, size: 1, impact: 0, skills: [], up: 0, cap: 4, holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt: 0, xp: 0,
  init: 0, jumpy: false, myopic: false, quality: 4,
  guns: [{ name: 'Rifle', melee: false, range: 24, attacks: 1, ap: 0, hitMod: 0, blast: 0, deadly: 0, rending: false, reliable: false, cd: 0, pending: 0, gap: 0, next: 0 } as UnitTower['guns'][number]],
  hitShoot: 0, hitMelee: 0, atkBonus: 1, boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0, ...o,
});

const withUnit = (): TrainingRun => {
  const run = blankRun(4);
  run.pieces.push(unit());
  return run;
};

const emplacement = (id = 30): DefaultTower => defaultTower(DEFAULTS[0], id, { x: 40, y: 40 });

describe('cards', () => {
  it('have unique ids, a strength at one rarity or more, and no base mending', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) expect(Object.keys(c.tiers).length).toBeGreaterThan(0);
    for (const id of ['walls', 'ramparts', 'rations', 'reinforce']) expect(cardById(id)).toBeUndefined();
    for (const c of CARDS) for (const n of Object.values(c.tiers)) expect(c.text(n!)).not.toMatch(/mend|base/i);
  });

  it('a rarer draw of the same card is stronger', () => {
    for (const c of CARDS) {
      const ns = (['Common', 'Rare', 'Legendary'] as const).flatMap((r) => (c.tiers[r] === undefined ? [] : [c.tiers[r]!]));
      for (let i = 1; i < ns.length; i++) expect(ns[i]).toBeGreaterThan(ns[i - 1]);
    }
  });

  it('draws three different cards; tower cards only with a tower on the field', () => {
    const none = drawCards(blankRun(2));
    expect(none.every((d) => !cardById(d.id)!.fits)).toBe(true);
    const run = withUnit();
    for (let i = 0; i < 20; i++) {
      const d = drawCards(run);
      expect(d).toHaveLength(TRAINING.cards.offer);
      expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
      d.filter((x) => cardById(x.id)!.fits).forEach((x) => expect(x.unitId).toBe('u'));
      d.forEach((x) => expect(cardById(x.id)!.tiers[x.rarity]).toBeDefined());
    }
  });

  it('never offers more than three', () => {
    const run = withUnit();
    expect(drawCards(run, 10)).toHaveLength(TRAINING.cards.offer);
    for (let s = 1; s < 200; s++) {
      const r = withUnit();
      r.seed = s;
      r.rng = s;
      offerCards(r);
      expect(r.offer!.length).toBeLessThanOrEqual(TRAINING.cards.offer);
    }
  });

  it('gun cards can go to a default emplacement, unit-only cards never do', () => {
    const run = blankRun(5);
    const e = emplacement();
    run.pieces.push(e);
    for (let i = 0; i < 30; i++) {
      for (const d of drawCards(run)) {
        const c = cardById(d.id)!;
        if (!c.fits) continue;
        expect(d.pieceId).toBe(e.id);
        expect(c.fits(e, run)).toBe(true);
        expect(cardTower(run, d)).toBe(e);
      }
    }
    expect(cardUseful(run, cardById('grip')!)).toBe(false);
    expect(cardUseful(run, cardById('whet')!)).toBe(true);
    const ap = e.guns[0].ap;
    run.offer = [{ id: 'ap', rarity: 'Legendary', pieceId: e.id }];
    pickCard(run, 0);
    expect(e.guns[0].ap).toBe(ap + cardById('ap')!.tiers.Legendary!);
    expect(run.log[run.log.length - 1]).toContain(e.name);
  });

  it('applies the strength of its rarity', () => {
    const run = withUnit();
    const t = run.pieces[0] as UnitTower;
    run.offer = [{ id: 'whet', rarity: 'Legendary', unitId: 'u' }];
    pickCard(run, 0);
    expect(t.atkBonus).toBeCloseTo(1 + cardById('whet')!.tiers.Legendary!);
    run.offer = [{ id: 'grip', rarity: 'Rare', unitId: 'u' }];
    pickCard(run, 0);
    expect(t.tough).toBe(3 + cardById('grip')!.tiers.Rare!);
    const reach = t.guns[0].range;
    run.offer = [{ id: 'barrels', rarity: 'Common', unitId: 'u' }];
    pickCard(run, 0);
    expect((t.guns[0].range - reach) * TRAINING.rangeMul).toBeCloseTo(1);
    run.offer = [{ id: 'promote', rarity: 'Legendary', unitId: 'u' }];
    pickCard(run, 0);
    expect(t.up).toBe(3);
    run.offer = [{ id: 'promote', rarity: 'Legendary', unitId: 'u' }];
    pickCard(run, 0);
    expect(t.up).toBe(t.cap);
    run.offer = [{ id: 'rapid', rarity: 'Legendary', unitId: 'u' }];
    pickCard(run, 0);
    expect(t.skills[t.skills.length - 1].effect).toEqual({ kind: 'sixes', again: true, dmg: 1, rend: true });
  });

  it('offers once, then a pick applies, logs and clears it', () => {
    const run = withUnit();
    offerCards(run);
    const first = run.offer;
    offerCards(run);
    expect(run.offer).toBe(first);
    const i = autoCardIndex(run);
    pickCard(run, i);
    expect(run.offer).toBeUndefined();
    expect(run.cards).toHaveLength(1);
    expect(run.log[run.log.length - 1]).toMatch(/^Card: /);
    expect(() => pickCard(run, 0)).toThrow();
  });

  it('names the tower in its text', () => {
    const run = withUnit();
    expect(cardText(run, { id: 'aim', rarity: 'Rare', unitId: 'u' }).text).toBe('Wardens: +1 to hit with every attack.');
  });

  it('a card from an old save does nothing but clears the offer', () => {
    const run = withUnit();
    run.offer = [{ id: 'walls', rarity: 'Common' }];
    pickCard(run, 0);
    expect(run.offer).toBeUndefined();
    expect(cardText(run, run.cards[0]).name).toBe('walls');
  });

  it('auto takes the rarest', () => {
    const run = blankRun();
    run.offer = [{ id: 'bounty', rarity: 'Common' }, { id: 'heroes', rarity: 'Legendary' }, { id: 'bounty', rarity: 'Rare' }];
    expect(autoCardIndex(run)).toBe(1);
  });

  it('offers only cards that would do something now (cardUseful)', () => {
    const c = (id: string) => cardById(id)!;
    const run = blankRun(2);
    expect(['heroes', 'nets', 'promote', 'aim', 'whet'].map((id) => cardUseful(run, c(id)))).toEqual(Array(5).fill(false));
    expect(cardUseful(run, c('bounty'))).toBe(true);
    const t = unit();
    run.pieces.push(t);
    expect(['heroes', 'nets', 'promote'].map((id) => cardUseful(run, c(id)))).toEqual(Array(3).fill(true));
    t.up = t.cap;
    expect(cardUseful(run, c('heroes'))).toBe(false);
    expect(cardUseful(run, c('promote'))).toBe(false);
    t.category = 'Aircraft' as UnitTower['category'];
    expect(cardUseful(run, c('nets'))).toBe(false);
  });

  it('Pack tactics goes to a unit with another near it, and hits harder for each', () => {
    const run = withUnit();
    const t = run.pieces[0] as UnitTower;
    expect(cardUseful(run, cardById('pack')!)).toBe(false);
    run.pieces.push(unit({ id: 10, unitId: 'v', x: 22, y: 22 }), unit({ id: 11, unitId: 'w', x: 40, y: 40 }));
    expect(cardById('pack')!.fits!(t, run)).toBe(true);
    expect(cardById('pack')!.fits!(run.pieces[2] as UnitTower, run)).toBe(false);
    run.offer = [{ id: 'pack', rarity: 'Rare', unitId: 'u' }];
    pickCard(run, 0);
    expect(cardMul(run, t, {} as TrainingRun['enemies'][number])).toBeCloseTo(1 + cardById('pack')!.tiers.Rare!);
  });

  it('Crossfire hits harder only against a held enemy, and only once something can hold', () => {
    const run = blankRun(3);
    const e = emplacement();
    run.pieces.push(e);
    expect(cardUseful(run, cardById('crossfire')!)).toBe(false);
    run.pieces.push(unit());
    expect(cardUseful(run, cardById('crossfire')!)).toBe(true);
    run.offer = [{ id: 'crossfire', rarity: 'Legendary', pieceId: e.id }];
    pickCard(run, 0);
    const foe = { heldBy: undefined } as TrainingRun['enemies'][number];
    expect(cardMul(run, e, foe)).toBe(1);
    expect(cardMul(run, e, { ...foe, heldBy: 9 })).toBeCloseTo(1 + cardById('crossfire')!.tiers.Legendary!);
  });

  it('Kill chain stacks a kill at a time up to its cap, and speeds the tower up', () => {
    const run = withUnit();
    const t = run.pieces[0] as UnitTower;
    const slow = rateOf(run, t);
    run.offer = [{ id: 'chain', rarity: 'Common', unitId: 'u' }];
    pickCard(run, 0);
    expect(rateOf(run, t)).toBeCloseTo(slow);
    for (let i = 0; i < TRAINING.cards.chain.max + 2; i++) {
      const foe: TrainingRun['enemies'][number] = { id: 100 + i, kind: 'drone', x: 24.5, y: 31.5, leg: 0, hp: 1, maxHp: 1, flies: false, status: {}, dots: [], regrab: 0 };
      run.enemies.push(foe);
      hurt(run, t, foe, 5, 'other', false);
    }
    expect(t.chain!.stacks).toBe(TRAINING.cards.chain.max);
    expect(rateOf(run, t)).toBeCloseTo(slow * (1 + TRAINING.cards.chain.max * cardById('chain')!.tiers.Common!));
  });

  it("Ace goes only to the run's top killer, and grows with its kills", () => {
    const run = withUnit();
    const t = run.pieces[0] as UnitTower;
    const other = unit({ id: 10, unitId: 'v', x: 40, y: 40, kills: 3 });
    run.pieces.push(other);
    expect(cardById('ace')!.fits!(t, run)).toBe(false);
    expect(cardById('ace')!.fits!(other, run)).toBe(true);
    t.kills = 25;
    for (let i = 0; i < 20; i++) for (const d of drawCards(run)) if (d.id === 'ace') expect(d.unitId).toBe('u');
    run.offer = [{ id: 'ace', rarity: 'Legendary', unitId: 'u' }];
    pickCard(run, 0);
    expect(cardMul(run, t, {} as TrainingRun['enemies'][number])).toBeCloseTo(1 + 2 * cardById('ace')!.tiers.Legendary!);
  });
});
