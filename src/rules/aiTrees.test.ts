import { describe, expect, it } from 'vitest';
import { newUnit } from '../model/factory';
import type { Weapon } from '../model/types';
import { AI_TREES, aiStyleFor, randomActivation } from './aiTrees';

const weapon = (range: number, rules: string[] = []): Weapon => ({ id: 'w', name: 'W', count: 1, range, attacks: 1, rules, traits: [] });

describe('AI decision trees', () => {
  it('only point at questions that exist, and every question is reachable', () => {
    for (const tree of Object.values(AI_TREES)) {
      const seen = new Set<string>();
      const walk = (key: string) => {
        if (seen.has(key)) return;
        seen.add(key);
        const node = tree.nodes[key];
        expect(node, key).toBeDefined();
        for (const a of node.answers) {
          expect(!!a.go !== !!a.act, `${key} → ${a.label}`).toBe(true);
          if (a.go) walk(a.go);
        }
      };
      walk(tree.start);
      expect([...seen].sort()).toEqual(Object.keys(tree.nodes).sort());
    }
  });

  it('classifies units by their weapons', () => {
    expect(aiStyleFor(newUnit({ weapons: [weapon(0, ['AP(1)'])] }))).toBe('melee');
    expect(aiStyleFor(newUnit({ weapons: [weapon(24), weapon(0)] }))).toBe('shooting');
    expect(aiStyleFor(newUnit({ weapons: [weapon(24), weapon(0, ['Rending'])] }))).toBe('hybrid');
  });

  it('picks only units that can still activate', () => {
    const units = [
      { id: 'a', destroyed: true, activated: false },
      { id: 'b', destroyed: false, activated: true },
      { id: 'c', destroyed: false, activated: false },
    ];
    expect(randomActivation(units, () => 0.99)?.id).toBe('c');
    expect(randomActivation(units.slice(0, 2))).toBeUndefined();
  });
});
