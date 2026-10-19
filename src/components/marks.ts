/** Glyphs the list sheet prints after anything that alters a unit, so every upgrade stands out. */
export const MARKS = { trait: '✦', unique: '★', nexus: '◆', relic: '✠' } as const;

export function traitMark(t: { unique?: boolean; nexus?: boolean }): string {
  return t.nexus ? MARKS.nexus : t.unique ? MARKS.unique : MARKS.trait;
}
