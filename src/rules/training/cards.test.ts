import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { CARDS, autoCardIndex, cardById, cardText, drawCards, offerCards, pickCard } from './cards';
import { blankRun } from './testRun';
import type { TrainingRun, UnitTower } from './types';

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

describe('cards', () => {
  it('have unique ids and no heals or walls left to fight', () => {
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    expect(CARDS.map((c) => c.id)).not.toContain('rations');
    expect(CARDS.map((c) => c.id)).not.toContain('reinforce');
  });

  it('draws three different cards; unit cards only with a crafted unit', () => {
    const none = drawCards(blankRun(2));
    expect(none.every((d) => !cardById(d.id)!.unit)).toBe(true);
    const run = withUnit();
    for (let i = 0; i < 20; i++) {
      const d = drawCards(run);
      expect(d).toHaveLength(TRAINING.cards.offer);
      expect(new Set(d.map((x) => x.id)).size).toBe(d.length);
      d.filter((x) => cardById(x.id)!.unit).forEach((x) => expect(x.unitId).toBe('u'));
    }
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

  it('names the unit in its text', () => {
    const run = withUnit();
    expect(cardText(run, { id: 'aim', rarity: 'Common', unitId: 'u' }).text).toBe('Wardens: +1 to hit when shooting.');
  });

  it('mends the base no higher than full, and hold cards change the run mods', () => {
    const run = withUnit();
    run.baseHp = TRAINING.baseHp - 2;
    run.offer = [{ id: 'walls', rarity: 'Common' }];
    pickCard(run, 0);
    expect(run.baseHp).toBe(TRAINING.baseHp);
    run.offer = [{ id: 'chains', rarity: 'Legendary' }];
    pickCard(run, 0);
    expect(run.mods).toMatchObject({ holdMul: TRAINING.cards.holdMul, regrabAdd: TRAINING.cards.regrabAdd });
  });

  it('promotes a unit a free level, and Sandbags lays cover', () => {
    const run = withUnit();
    run.offer = [{ id: 'promote', rarity: 'Rare', unitId: 'u' }, { id: 'sandbags', rarity: 'Common' }];
    pickCard(run, 0);
    expect((run.pieces[0] as UnitTower).up).toBe(1);
    run.offer = [{ id: 'sandbags', rarity: 'Common' }];
    pickCard(run, 0);
    expect(run.cover).toHaveLength(TRAINING.cards.patches);
  });

  it('auto takes the rarest', () => {
    const run = blankRun();
    run.offer = [{ id: 'walls', rarity: 'Common' }, { id: 'heroes', rarity: 'Legendary' }, { id: 'bounty', rarity: 'Rare' }];
    expect(autoCardIndex(run)).toBe(1);
  });
});
