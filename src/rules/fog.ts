import type { Campaign, Sector } from '../model/types';
import { hexDistance, isPlaced } from './hexmap';
import { FOG } from './nexusData';

// Fog of war (Nexus Wars). A faction sees the sectors it holds and every placed sector within sight of them: FOG.sight
// hexes, FOG.homeSight from its home, more with a Watchtower. Sectors it has seen before stay on its map but only their
// type and name; who holds them, their garrison and buildings stay hidden until it can see them again.

/** How far a held sector sees. */
export const sightOf = (s: Sector) => (s.type === 'home' ? FOG.homeSight : FOG.sight) + (s.buildings?.includes('watchtower') ? FOG.watchtower : 0);

/** The sectors a faction can see right now. */
export function visibleTo(c: Campaign, factionId: string): Set<string> {
  const held = c.sectors.filter((s) => s.owner === factionId);
  const out = new Set(held.map((s) => s.id));
  for (const h of held.filter(isPlaced))
    for (const s of c.sectors) if (isPlaced(s) && hexDistance(h, s) <= sightOf(h)) out.add(s.id);
  return out;
}

/** Sectors a faction has seen at some point but can't see now. */
export function rememberedBy(c: Campaign, factionId: string, visible = visibleTo(c, factionId)): Set<string> {
  const ids = new Set(c.sectors.map((s) => s.id));
  return new Set((c.explored?.[factionId] ?? []).filter((id) => ids.has(id) && !visible.has(id)));
}

/** Note what every faction can see now, so it stays on their maps. */
export function explore(c: Campaign) {
  const ids = new Set(c.sectors.map((s) => s.id));
  const explored: Record<string, string[]> = {};
  for (const f of c.factions) {
    const seen = new Set([...(c.explored?.[f.id] ?? []), ...visibleTo(c, f.id)]);
    explored[f.id] = [...seen].filter((id) => ids.has(id));
  }
  c.explored = explored;
}

export type Sight = 'visible' | 'remembered' | 'hidden';

/** What one faction knows of each sector. With no faction (the GM), everything is visible. */
export function sightMap(c: Campaign, factionId: string | undefined): (s: Sector) => Sight {
  if (!factionId) return () => 'visible';
  const visible = visibleTo(c, factionId);
  const remembered = rememberedBy(c, factionId, visible);
  return (s) => (visible.has(s.id) ? 'visible' : remembered.has(s.id) ? 'remembered' : 'hidden');
}
