import { describe, expect, it } from 'vitest';
import { CATEGORY_COLORS, EMBLEM_SHAPES, SHAPE_IDS, defaultEmblem, defaultPortrait, forceEmblem, echoPortrait, emblemLayers, portraitInForce, randomEmblem, randomTop, unitPortrait } from './emblem';
import { rng } from '../rules/hexmap';

describe('emblemLayers', () => {
  const good = [
    { shape: 'shield', color: '#112233' },
    { shape: 'none', color: '#ffffff' },
    { shape: 'skull', color: '#C9A24A' },
  ];

  it('accepts three layers with known shapes and #rrggbb colours', () => {
    expect(emblemLayers(good)).toBe(good);
  });

  it('turns down anything else, so an odd cloud copy shows the plain marker', () => {
    expect(emblemLayers(undefined)).toBeUndefined();
    expect(emblemLayers(good.slice(0, 2))).toBeUndefined();
    expect(emblemLayers([...good.slice(0, 2), { shape: 'dragon', color: '#000000' }])).toBeUndefined();
    expect(emblemLayers([...good.slice(0, 2), { shape: 'star', color: 'red' }])).toBeUndefined();
    expect(emblemLayers([...good.slice(0, 2), null])).toBeUndefined();
  });
});

describe('randomEmblem', () => {
  it('always makes a valid emblem whose layers differ in colour from the one beneath', () => {
    const rand = rng('emblems');
    for (let n = 0; n < 200; n++) {
      const e = randomEmblem(rand);
      expect(emblemLayers(e)).toBe(e);
      expect(e[1].color).not.toBe(e[0].color);
      expect(e[2].color).not.toBe(e[1].color);
      expect(e[0].shape).not.toBe('none');
    }
  });
});

describe('EMBLEM_SHAPES', () => {
  it('gives every shape a closed path inside the 100 × 100 box', () => {
    for (const id of SHAPE_IDS) {
      const { path } = EMBLEM_SHAPES[id];
      expect(path.trim().endsWith('Z')).toBe(true);
      const nums = (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      expect(nums.every((v) => v >= 0 && v <= 100)).toBe(true);
    }
  });
});

describe('portraits', () => {
  it('gives every unit a steady default on its category colour', () => {
    const a = defaultPortrait({ id: 'u1', category: 'Elite' });
    expect(defaultPortrait({ id: 'u1', category: 'Elite' })).toEqual(a);
    expect(emblemLayers(a)).toBeDefined();
    expect(a[0].color).toBe(CATEGORY_COLORS.Elite);
    expect(a[1].color).not.toBe(a[0].color);
  });

  it("prefers the unit's own portrait", () => {
    const own = randomEmblem(() => 0.3);
    expect(unitPortrait({ id: 'u1', category: 'Hero', portrait: own })).toBe(own);
    expect(unitPortrait({ id: 'u1', category: 'Hero', portrait: [] as never })).toEqual(defaultPortrait({ id: 'u1', category: 'Hero' }));
  });

  it("puts a unit's own top layer on its force's emblem", () => {
    const force = { id: 'f1', emblem: randomEmblem(() => 0.1) };
    const own = randomEmblem(() => 0.7);
    const p = unitPortrait({ id: 'u1', category: 'Hero', portrait: own }, force);
    expect(p.slice(0, 2)).toEqual(force.emblem.slice(0, 2));
    expect(p[2]).toEqual(own[2]);
  });

  it("rolls a steady top for a unit in a force, in a colour unlike the force's", () => {
    const force = { id: 'f1', emblem: randomEmblem(() => 0.4) };
    const p = unitPortrait({ id: 'u1', category: 'Hero' }, force);
    expect(unitPortrait({ id: 'u1', category: 'Hero' }, force)).toEqual(p);
    expect(p).toEqual(portraitInForce({ id: 'u1' }, force));
    for (let i = 0; i < 50; i++) {
      const top = randomTop(force.emblem.slice(0, 2));
      expect([force.emblem[0].color, force.emblem[1].color]).not.toContain(top.color);
    }
  });

  it('draws every Echo of a type alike', () => {
    expect(echoPortrait('Void Hound')).toEqual(echoPortrait('Void Hound'));
    expect(emblemLayers(echoPortrait('Void Hound'))).toBeDefined();
  });
});

describe('forceEmblem', () => {
  it("is the force's own emblem if it has one, else a default that's the same every time for that force", () => {
    const own = randomEmblem(rng('own'));
    expect(forceEmblem({ id: 'f1', emblem: own })).toBe(own);
    expect(emblemLayers(forceEmblem({ id: 'f1' }))).toBeDefined();
    expect(forceEmblem({ id: 'f1' })).toEqual(defaultEmblem('f1'));
    expect(defaultEmblem('f1')).not.toEqual(defaultEmblem('f2'));
  });
});
