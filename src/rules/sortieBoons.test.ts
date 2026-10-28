import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newUnit } from '../model/factory';
import { BOON_TIERS, SORTIE, SORTIE_BOONS, boonText, type SortieBoonId } from './downtimeData';
import { autoStep, boonLevel, boonTier, createRun, enterNode, isFort, leaveCombat, pickBoon, shopPrice, startCombat, type SortieRun } from './sortie';

// Sortie boons at three rarities.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });
const party = (): Unit[] => [
  newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
  newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  newUnit({ id: 'bunk', name: 'Bunker', category: 'Fortification', size: 1, tough: 6, quality: 4, defense: 2, points: 100, rules: ['Tough(6)'], weapons: [gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
];

/** Win a fight of this kind and land on its rewards. */
function won(run: SortieRun, kind: 'fight' | 'elite' = 'fight') {
  startCombat(run, book, kind);
  run.combat!.over = 'won';
  leaveCombat(run);
}

describe('sortie boon rarities', () => {
  it('every boon says what it does at each rarity it comes at; curses and the lantern at one', () => {
    for (const [id, b] of Object.entries(SORTIE_BOONS)) {
      const tiers = BOON_TIERS.filter((t) => b.tiers[t]);
      expect(tiers.length, id).toBeGreaterThan(0);
      if (b.curse) expect(tiers).toEqual(['Common']);
    }
    expect(BOON_TIERS.filter((t) => SORTIE_BOONS.lantern.tiers[t])).toEqual(['Rare']);
    expect(boonText('veteran', 'Rare', 'Wardens')).toBe('Wardens: gets +1 to hit.');
    expect(SORTIE.boonsAtStart).not.toContain('spotter');
    expect(SORTIE.boonsAtStart).toEqual(expect.arrayContaining(['veteran', 'holdline']));
  });

  it('offers boons at rarities they come at, and a held one only at a higher rarity', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = createRun(party(), seed);
      run.boons.push('scope');
      run.boonTier = { scope: 'Rare' };
      won(run);
      for (const d of run.offer!.boons) {
        expect(SORTIE_BOONS[d.id].tiers[d.tier]).toBeDefined();
        if (d.id === 'scope') expect(d.tier).toBe('Legendary');
      }
    }
  });

  it('an elite always offers a Rare or better', () => {
    for (let seed = 1; seed < 40; seed++) {
      const run = createRun(party(), seed);
      won(run, 'elite');
      expect(run.offer!.boons.some((d) => d.tier !== 'Common')).toBe(true);
    }
  });

  it('draws rarities about 60/30/10', () => {
    const n = { Common: 0, Rare: 0, Legendary: 0 };
    for (let seed = 1; seed < 400; seed++) {
      const run = createRun(party(), seed);
      won(run);
      for (const d of run.offer!.boons) n[d.tier]++;
    }
    const all = n.Common + n.Rare + n.Legendary;
    expect(n.Common / all).toBeGreaterThan(0.5);
    expect(n.Legendary / all).toBeGreaterThan(0.05);
    expect(n.Legendary / all).toBeLessThan(0.16);
  });

  it('taking a held boon at a higher rarity upgrades it (Thick Hide adds the difference)', () => {
    const run = createRun(party(), 3);
    const max0 = run.party[0].models[0].max;
    Object.assign(run, { screen: 'reward', offer: { boons: [{ id: 'hide', tier: 'Common' }] } });
    pickBoon(run, 0);
    expect(run.party[0].models[0].max).toBe(max0 + SORTIE.hpMul);
    Object.assign(run, { screen: 'reward', offer: { boons: [{ id: 'hide', tier: 'Legendary' }] } });
    pickBoon(run, 0);
    expect(run.boons.filter((b) => b === 'hide')).toHaveLength(1);
    expect(boonTier(run, 'hide')).toBe('Legendary');
    expect(boonLevel(run, 'hide')).toBe(3);
    expect(run.party[0].models[0].max).toBe(max0 + 3 * SORTIE.hpMul);
  });

  it('a unit boon goes to one unit and stays with it; a Bodyguard never goes to a Fortification', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = createRun(party(), seed);
      run.unlocked = undefined;
      won(run);
      for (const d of run.offer!.boons) {
        if (!SORTIE_BOONS[d.id].unit) { expect(d.unit).toBeUndefined(); continue; }
        expect(run.party[d.unit!]).toBeDefined();
        if (d.id === 'bodyguard') expect(isFort(run.party[d.unit!].unit)).toBe(false);
      }
    }
    const run = createRun(party(), 5);
    Object.assign(run, { screen: 'reward', offer: { boons: [{ id: 'veteran', tier: 'Common', unit: 1 }] } });
    pickBoon(run, 0);
    Object.assign(run, { screen: 'reward', offer: { boons: [{ id: 'veteran', tier: 'Rare', unit: 0 }] } });
    pickBoon(run, 0);
    expect(run.boonUnit?.veteran).toBe(1);
  });

  it('prices a shop boon by its rarity', () => {
    const run = createRun(party(), 9);
    run.map[0][0].kind = 'shop';
    enterNode(run, book, run.map[0][0]);
    for (const b of run.shop!.boons) expect(b.price).toBe(shopPrice(run, SORTIE.shop.price[b.tier]));
  });

  it('counts a win streak with no model lost, for Momentum', () => {
    const run = createRun(party(), 4);
    const play = (lose: boolean) => {
      startCombat(run, book, 'fight');
      const c = run.combat!;
      if (lose) c.lostModel = true;
      for (const e of c.enemies) for (const m of e.models) m.hp = 0;
      for (let i = 0; i < 50 && !c.over; i++) autoStep(run, book);
      expect(c.over).toBe('won');
      leaveCombat(run);
      run.offer = undefined;
      run.screen = 'map';
    };
    play(false);
    play(false);
    expect(run.streak).toBe(2);
    play(true);
    expect(run.streak).toBe(0);
  });

  it('a boon nobody holds is level 0', () => {
    const run = createRun(party(), 1);
    for (const id of Object.keys(SORTIE_BOONS) as SortieBoonId[]) expect(boonLevel(run, id)).toBe(0);
  });
});
