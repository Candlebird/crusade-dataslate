import { describe, expect, it } from 'vitest';
import { readShot, runVolley, throughArmour, volleySize } from './shots';

const pace = { shootEvery: 0.5, meleeEvery: 0.3, volleySpread: 0.5 };

describe('shared shot method', () => {
  it('fires a volley of its attacks spread over half the wait, then waits', () => {
    const g = { cd: 0, pending: 0, gap: 0, next: 0, melee: false, attacks: 4 };
    let shots = 0;
    for (let i = 0; i < 58; i++) runVolley(g, 1, 1 / 60, pace, () => 0.5, () => true, () => { shots++; return true; });
    // Just under 1 s at a 0.5 s wait: two volleys of 4.
    expect(shots).toBe(8);
  });
  it('rolls a fraction of an attack as a chance of one more', () => {
    expect(volleySize(() => 0.2, 1.5)).toBe(2);
    expect(volleySize(() => 0.7, 1.5)).toBe(1);
  });
  it('reads a 6 with Rending as AP 4 through armour', () => {
    expect(readShot(0.1, 0.5, 1, true)).toEqual({ miss: false, six: true, rend: true, ap: 4 });
    expect(readShot(0.6, 0.5, 1, true).miss).toBe(true);
    expect(throughArmour(2, 3, false)).toBe(0.5);
    expect(throughArmour(2, 3, true)).toBe(2);
  });
});
