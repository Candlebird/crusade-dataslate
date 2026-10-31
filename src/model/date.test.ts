import { describe, expect, it } from 'vitest';
import { localDate, nextWeekReset, timeLeft } from './date';
import { weekKey } from '../rules/sortie';

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

describe('the weekly reset', () => {
  it('is the coming Monday at local midnight, a whole week on from a Monday', () => {
    const at = (s: string) => nextWeekReset(new Date(s));
    expect(at('2026-11-04T12:00:00')).toEqual(new Date(2026, 10, 9));
    expect(at('2026-11-08T23:59:00')).toEqual(new Date(2026, 10, 9));
    expect(at('2026-11-09T00:00:00')).toEqual(new Date(2026, 10, 16));
    // The reset is where weekKey turns over.
    const r = at('2026-11-04T12:00:00');
    expect(weekKey(localDate(new Date(r.getTime() - 1)))).toBe('2026-W45');
    expect(weekKey(localDate(r))).toBe('2026-W46');
  });

  it('reads as days and hours, hours and minutes, or minutes', () => {
    expect(timeLeft((2 * 1440 + 5 * 60 + 13) * 60000)).toBe('2d 5h');
    expect(timeLeft((5 * 60 + 13) * 60000)).toBe('5h 13m');
    expect(timeLeft(12.5 * 60000)).toBe('13m');
    expect(timeLeft(0)).toBe('1m');
  });
});
