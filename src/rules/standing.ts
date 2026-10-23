import type { Campaign } from '../model/types';
import { bandHeading } from './marauders';
import { MARAUDERS } from './nexusData';
import { echoMarks } from './voidspawn';

// What a detachment standing in a sector does when the round ends, so an order says what it's for. No rules of its
// own: it reads the Echo marks and the Marauders' roads, which already decide it.

/** Short tags for what a faction's detachment standing in the sector does at round end. */
export function standingEffects(c: Campaign, sectorId: string, factionId: string): string[] {
  const s = c.sectors.find((x) => x.id === sectorId);
  if (!s) return [];
  const out: string[] = [];
  // A mark is held by the sector's own faction, or by anyone while nobody holds the sector.
  if (echoMarks(c).some((m) => m.sectorId === s.id && !m.brokenBy) && (!s.owner || s.owner === factionId)) out.push(`🛡 holds the mark on ${s.name}`);
  for (const m of c.marauders ?? []) {
    const h = bandHeading(c, m);
    if (!h) continue;
    // Only the hexes it walks this round, short of its target, bar the road.
    const i = h.road.findIndex((x) => x.id === s.id);
    if (i >= 0 && i < MARAUDERS.move && s.id !== h.target.id) out.push(`🏴 bars ${m.name}' road to ${h.target.name}`);
    if (s.id === h.target.id && s.owner === factionId) out.push(`⛨ guards ${s.name} from ${m.name}`);
  }
  return out;
}
