import { describe, expect, it } from 'vitest';
import { firstSteps } from './firstSteps';
import { newForce, newUnit } from './factory';

describe('firstSteps', () => {
  it('starts at importing a book', () => {
    expect(firstSteps(0, [])).toMatchObject({ book: false, force: false, units: false, next: 'book' });
  });

  it('moves on to making a force, then adding units', () => {
    expect(firstSteps(1, []).next).toBe('force');
    const f = newForce();
    const s = firstSteps(1, [f]);
    expect(s.next).toBe('units');
    expect(s.empty).toBe(f);
  });

  it('is done once any force of yours has a unit, even without a book', () => {
    const f = newForce();
    f.units.push(newUnit());
    expect(firstSteps(0, [f])).toMatchObject({ units: true, next: null });
  });
});
