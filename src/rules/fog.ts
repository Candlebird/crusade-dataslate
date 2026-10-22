import type { Campaign, Sector } from '../model/types';
import { hexDistance, isPlaced } from './hexmap';
import { RECON } from './downtimeData';
import { FOG, WARLORDS } from './nexusData';
import { hasPerk } from './warlords';

// Fog of war (Nexus Wars). A faction sees the sectors it holds and every placed sector within sight of them: FOG.sight
// hexes, FOG.homeSight from its home, more with a Watchtower and a Listening Post, and FOG.forceSight around each of its detachments. Sectors it has seen before stay on its map but only their
// type and name; who holds them, their garrison and buildings stay hidden until it can see them again.

/** How far a held sector sees. */
export const sightOf = (s: Sector) =>
  (s.type === 'home' ? FOG.homeSight : FOG.sight) + (s.buildings?.includes('watchtower') ? FOG.watchtower : 0) + (s.buildings?.includes('listeningPost') ? FOG.listeningPost : 0);

/** The sectors a faction can see right now. */
export function visibleTo(c: Campaign, factionId: string): Set<string> {
  const held = c.sectors.filter((s) => s.owner === factionId);
  const out = new Set(held.map((s) => s.id));
  // A Shadow Warlord's faction sees further.
  const spy = hasPerk(c, factionId, 'spymaster') ? WARLORDS.spymaster : 0;
  const scouts = hasPerk(c, factionId, 'scouts') ? WARLORDS.scouts : 0;
  for (const h of held.filter(isPlaced))
    for (const s of c.sectors) if (isPlaced(s) && hexDistance(h, s) <= sightOf(h) + spy) out.add(s.id);
  // Its detachments out on the map see around them too.
  for (const p of Object.values(c.positions ?? {})) {
    const at = p.factionId === factionId ? c.sectors.find((s) => s.id === p.sectorId) : undefined;
    if (at && isPlaced(at)) for (const s of c.sectors) if (isPlaced(s) && hexDistance(at, s) <= FOG.forceSight + scouts) out.add(s.id);
  }
  // And what its Recon units scouted lately.
  for (const id of reconSeen(c, factionId)) out.add(id);
  return out;
}

/** Sectors the faction's Recon units (rules/tasks.ts) see right now: scouted this round or the one before. */
export function reconSeen(c: Campaign, factionId: string): string[] {
  const round = c.round ?? 1;
  const recon = c.factions.find((x) => x.id === factionId)?.recon ?? [];
  return recon.filter((r) => r.round > round - RECON.rounds && r.round <= round).flatMap((r) => r.sectorIds);
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
