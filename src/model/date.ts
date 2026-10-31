/** A date as YYYY-MM-DD in the user's own time zone (today by default, or an ISO timestamp). `toISOString()` gives the UTC date, which is already tomorrow on an evening in the Americas. */
export function localDate(at: Date | string = new Date()): string {
  // A bare date is already a calendar day; parsing it would read it as UTC midnight.
  if (typeof at === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(at) || Number.isNaN(Date.parse(at)))) return at.slice(0, 10);
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** When the week (Monday to Sunday, the ISO week of sortie.ts weekKey, by the local date) next turns over: the coming
 *  Monday at local midnight. */
export function nextWeekReset(now: Date = new Date()): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + (8 - (d.getDay() || 7)));
  return d;
}

/** Time left as "2d 5h", "5h 13m" or "13m" (rounded up to the minute). */
export function timeLeft(ms: number): string {
  const mins = Math.max(1, Math.ceil(ms / 60000));
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
