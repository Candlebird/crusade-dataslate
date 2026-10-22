import { describe, expect, it } from 'vitest';
import { localDate } from './date';

describe('localDate', () => {
  it('uses the local calendar day, not the UTC one', () => {
    const late = new Date(2026, 9, 21, 23, 30);
    expect(localDate(late)).toBe('2026-10-21');
    expect(localDate(new Date(2026, 0, 5, 0, 1))).toBe('2026-01-05');
  });
});

describe('localDate of a timestamp', () => {
  it('reads an ISO timestamp in local time and keeps a bad one as it was', () => {
    const iso = new Date(2026, 9, 21, 23, 30).toISOString();
    expect(localDate(iso)).toBe('2026-10-21');
    expect(localDate('2026-10-21')).toBe('2026-10-21');
    expect(localDate('not a date')).toBe('not a date');
  });
});
