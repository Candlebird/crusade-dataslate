/** A date as YYYY-MM-DD in the user's own time zone (today by default, or an ISO timestamp). `toISOString()` gives the UTC date, which is already tomorrow on an evening in the Americas. */
export function localDate(at: Date | string = new Date()): string {
  // A bare date is already a calendar day; parsing it would read it as UTC midnight.
  if (typeof at === 'string' && (/^\d{4}-\d{2}-\d{2}$/.test(at) || Number.isNaN(Date.parse(at)))) return at.slice(0, 10);
  const d = typeof at === 'string' ? new Date(at) : at;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
