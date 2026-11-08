import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newUnit } from '../model/factory';
import { SORTIE_BOONS, SORTIE_SPECS, SORTIE_SPEC_AT, type SortieBoonId } from './downtimeData';
import {
  autoSpec, autoStep, createRun, enterNode, isSpecial, meterOf, pairsOf, pickSpec, previewOf, reachable, rerollOffer, specChoices, specDue,
  partnersWanted, startCombat, stratagemsDue, trophyOf, unitSheet, type SortieRun,
} from './sortie';
import { buildOf } from './sortieBuild';

// Sortie: stratagems, trophies, specialities, rerolls, previews, the damage meter and the build panel.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });
const party = (): Unit[] => [
  newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
  newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  newUnit({ id: 'snip', name: 'Snipers', category: 'Infantry', size: 3, quality: 3, defense: 5, points: 90, rules: ['Stealth'], weapons: [gun('Sniper Rifle', 36, 1, 3, ['AP(2)', 'Deadly(2)'])] }),
];
const give = (run: SortieRun, ...ids: SortieBoonId[]) => {
  for (const id of ids) {
    run.boons.push(id);
    (run.boonTier ??= {})[id] = 'Common';
  }
};
/** Step on autopilot until the party has a boon offer in front of it; the kind of fight it came from, if any. */
function toReward(run: SortieRun): string | undefined {
  let kind: string | undefined;
  for (let i = 0; i < 5000 && !run.over && run.screen !== 'reward'; i++) {
    if (run.screen === 'map') kind = undefined;
    autoStep(run, book);
    if (run.combat) kind = run.combat.kind;
  }
  return kind;
}

describe('Sortie stratagems', () => {
  it('every stratagem pairs two plain boons, and each boon card can name its pair', () => {
    for (const [id, b] of Object.entries(SORTIE_BOONS)) {
      if (!b.pair) continue;
      expect(b.pair).toHaveLength(2);
      for (const x of b.pair) {
        expect(isSpecial(x)).toBe(false);
        expect(pairsOf(x).map((p) => p.strat)).toContain(id);
      }
      expect(b.tiers.Legendary).toBeTruthy();
    }
  });

  it('holding both halves puts the stratagem in the next offer once, in place of a card', () => {
    for (let seed = 1; seed < 6; seed++) {
      const run = createRun(party(), seed, 'free', 'short');
      give(run, 'scope', 'cells');
      expect(stratagemsDue(run)).toContain('killzone');
      const kind = toReward(run);
      if (run.over) continue;
      const ids = run.offer!.boons.map((d) => d.id);
      expect(ids).toContain('killzone');
      expect(ids.length).toBe(kind === 'fight' ? 2 : 3);
      expect(run.paired).toContain('killzone');
      expect(stratagemsDue(run)).not.toContain('killzone');
      return;
    }
    throw new Error('no offer reached');
  });
});

describe('Sortie elite trophies', () => {
  it('an elite with an affix puts its trophy among three rare cards', () => {
    const run = createRun(party(), 3, 'free', 'short');
    run.screen = 'combat';
    startCombat(run, book, 'elite', 'armoured');
    expect(trophyOf('armoured')).toBe('plate');
    toReward(run);
    expect(run.over).toBeFalsy();
    expect(run.offer!.rare).toBe(true);
    expect(run.offer!.boons).toHaveLength(3);
    expect(run.offer!.boons.map((d) => d.id)).toContain('plate');
  });
});

describe('Sortie specialities', () => {
  it('every party role has two, and a unit earns one after its wins', () => {
    const roles = new Set(Object.values(SORTIE_SPECS).map((s) => s.role));
    for (const r of roles) expect(Object.values(SORTIE_SPECS).filter((s) => s.role === r)).toHaveLength(2);
    const run = createRun(party(), 3, 'free', 'short');
    expect(specDue(run)).toBeUndefined();
    run.party[1].wins = SORTIE_SPEC_AT;
    expect(specDue(run)).toBe(1);
    const choices = specChoices(run.party[1]);
    expect(choices).toHaveLength(2);
    expect(choices).toContain(autoSpec(run.party[1]));
    pickSpec(run, 1, 'nonsense');
    expect(run.party[1].spec).toBeUndefined();
    pickSpec(run, 1, choices[1]);
    expect(run.party[1].spec).toBe(choices[1]);
    expect(specDue(run)).toBeUndefined();
    expect(unitSheet(run, 1).spec?.id).toBe(choices[1]);
  });

  it('auto-play picks a speciality as soon as one is due', () => {
    const run = createRun(party(), 4, 'free', 'short');
    run.party[0].wins = SORTIE_SPEC_AT;
    autoStep(run, book);
    expect(run.party[0].spec).toBe(autoSpec(run.party[0]));
  });
});

describe('Sortie rerolls', () => {
  it('redraws plain cards, keeps a stratagem and the offer size, and spends a reroll', () => {
    const run = createRun(party(), 11, 'free', 'short', { rerolls: 2 });
    expect(run.rerolls).toBe(2);
    give(run, 'scope', 'cells');
    toReward(run);
    const before = run.offer!.boons.map((d) => d.id);
    rerollOffer(run);
    expect(run.rerolls).toBe(1);
    expect(run.offer!.boons).toHaveLength(before.length);
    expect(run.offer!.boons.map((d) => d.id)).toContain('killzone');
    run.rerolls = 0;
    const now = run.offer!.boons.map((d) => d.id);
    rerollOffer(run);
    expect(run.offer!.boons.map((d) => d.id)).toEqual(now);
  });
});

describe('Sortie previews', () => {
  it('a seen fight shows the Echo squads it will bring, and a hidden one shows nothing', () => {
    let checked = 0;
    for (let seed = 1; seed < 30 && checked < 4; seed++) {
      const run = createRun(party(), seed, 'free', 'short');
      const hidden = run.map.flat().find((n) => n.hidden && (n.kind === 'fight' || n.kind === 'elite'));
      if (hidden) expect(previewOf(run, book, hidden)).toBeUndefined();
      const node = reachable(run).find((n) => !n.hidden && (n.kind === 'fight' || n.kind === 'elite'));
      if (!node) continue;
      const pre = previewOf(run, book, node)!;
      expect(pre.length).toBeGreaterThan(0);
      enterNode(run, book, node);
      const c = run.combat;
      if (!c) continue;
      expect(c.enemies.map((e) => e.unit.unitType)).toEqual(pre.map((p) => p.name));
      expect(c.enemies.map((e) => e.unit.size)).toEqual(pre.map((p) => p.n));
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('old saves without a seed get no preview', () => {
    const run = createRun(party(), 5, 'free', 'short');
    delete run.seed;
    const node = run.map.flat().find((n) => n.kind === 'fight')!;
    node.hidden = false;
    expect(previewOf(run, book, node)).toBeUndefined();
  });
});

describe('Sortie damage meter and build panel', () => {
  it('counts wounds dealt and taken, per fight and for the run', () => {
    const run = createRun(party(), 21, 'free', 'short');
    for (let i = 0; i < 5000 && !run.over && !(run.combat?.over); i++) autoStep(run, book);
    const fight = meterOf(run, true);
    expect(fight.reduce((n, r) => n + r.dealt, 0)).toBeGreaterThan(0);
    toReward(run);
    const all = meterOf(run, false);
    expect(all.reduce((n, r) => n + r.dealt, 0)).toBe(fight.reduce((n, r) => n + r.dealt, 0));
  });

  it('the build panel lists every unit, its guns, pairs being built and the lord', () => {
    const run = createRun(party(), 8, 'free', 'short');
    give(run, 'scope');
    const b = buildOf(run);
    expect(b.units).toHaveLength(3);
    for (const u of b.units) expect(u.guns.length).toBeGreaterThan(0);
    expect(b.pairs.find((p) => p.id === 'killzone')?.status).toBe('building');
    expect(b.lord.sig).toBeTruthy();
    give(run, 'cells');
    expect(buildOf(run).pairs.find((p) => p.id === 'killzone')?.status).toBe('ready');
  });
});

describe('Sortie pair nudge', () => {
  it('wants the other half of an open stratagem once one half is held', () => {
    const run = createRun(party(), 7, 'free', 'short');
    give(run, 'wall');
    expect(partnersWanted(run)).toContain('holdline');
    give(run, 'holdline');
    expect(partnersWanted(run)).not.toContain('holdline');
  });

  it('autopilot takes a stratagem on offer rather than patching up', () => {
    const run = createRun(party(), 11, 'free', 'short');
    give(run, 'wall', 'holdline');
    toReward(run);
    expect(run.screen).toBe('reward');
    expect(run.offer!.boons.some((d) => d.id === 'ironwall')).toBe(true);
    autoStep(run, book);
    expect(run.boons).toContain('ironwall');
  });
});
