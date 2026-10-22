/** Today's date as YYYY-MM-DD in the user's own time zone. `toISOString()` gives the UTC date, which is already tomorrow on an evening in the Americas. */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
