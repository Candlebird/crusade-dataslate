import { describe, expect, it } from 'vitest';
import { TRAINING } from '../downtimeData';
import { TALE_TEXT } from './taleText';
import { taleText, talesOf, type Highlight } from './tales';

// Tales only for highlights: one each, the most telling first, at most records.tales a run.

const vars = { force: 'Iron Hand', unit: 'Alpha', wave: '25', lord: 'Vex', title: 'Lordslayer' };
const h = (kind: Highlight['kind']): Highlight => ({ kind, units: ['a'], vars });

describe('training tales', () => {
  it('fills every line in, with nothing left over', () => {
    for (const kind of Object.keys(TALE_TEXT) as Highlight['kind'][]) {
      const seen = new Set<string>();
      for (let seed = 0; seed < 60; seed++) {
        const text = taleText(h(kind), seed, 0);
        expect(text).not.toMatch(/[{}]/);
        seen.add(text);
      }
      expect(seen.size).toBe(TALE_TEXT[kind].length);
    }
    expect(taleText(h('lord'), 1, 0)).toContain('Vex');
  });

  it('tells the same run the same way', () => {
    expect(taleText(h('best'), 42, 0)).toBe(taleText(h('best'), 42, 0));
  });

  it('puts the nemesis first, then the best, lords and titles, and stops at the cap', () => {
    const told = talesOf([h('title'), h('lord'), h('title'), h('best'), h('nemesis')], 3);
    expect(told.map((t) => t.kind)).toEqual(['nemesis', 'best', 'lord'].slice(0, TRAINING.records.tales));
    expect(talesOf([], 3)).toEqual([]);
    expect(talesOf([h('title')], 3)[0]).toMatchObject({ kind: 'title', units: ['a'] });
  });
});
