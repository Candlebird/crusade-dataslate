import { describe, expect, it } from 'vitest';
import { localDate } from './date';

describe('localDate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    const late = new Date(2026, 9, 21, 23, 30);
    expect(localDate(late)).toBe('2026-10-21');
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});
