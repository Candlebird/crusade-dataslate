import type { Campaign, CampaignFaction } from '../model/types';
import { BUILDINGS, NEXUS_TECH, type Building } from './nexusData';

// The tech tree (Nexus Wars). Each building is a tech: tier 1 is known from the start, tiers 2 and 3 are researched
// with Research, which every faction earns when a round ends (NEXUS_TECH), once the techs they require are known. A
// Blueprint (Guardian loot) researches an open one for free, and an Archive unlock (a Lost Archive) any one at all. Doesn't import production.ts: production imports this.

const byId = (id: string) => BUILDINGS.find((b) => b.id === id);

/** Whether the faction can build it. */
export const knows = (f: CampaignFaction | undefined, b: Building) => b.tier === 1 || !!f?.techs?.includes(b.id);

export type TechStatus = 'known' | 'open' | 'locked';

/** Known, open to research (its requirements are known), or locked. */
export function techStatus(f: CampaignFaction | undefined, b: Building): TechStatus {
  if (knows(f, b)) return 'known';
  return (b.requires ?? []).every((id) => byId(id) && knows(f, byId(id)!)) ? 'open' : 'locked';
}

export const techCost = (b: Building) => NEXUS_TECH.cost[b.tier];

/** How a tech is researched: with Research, a Blueprint (an open tech, free) or an Archive unlock (any tech, free). */
export type ResearchVia = 'research' | 'blueprint' | 'archive';

/** Why the faction can't research it now, if it can't. */
export function researchBlock(f: CampaignFaction | undefined, id: string, via: ResearchVia = 'research'): string | undefined {
  const b = byId(id);
  if (!b) return 'Unknown building';
  if (!f) return 'Only a faction researches';
  const st = techStatus(f, b);
  if (st === 'known') return 'Already researched';
  if (via === 'archive') return (f.archives ?? 0) > 0 ? undefined : 'No Archive unlock (Lost Archive)';
  if (st === 'locked') return `Needs ${(b.requires ?? []).filter((r) => !byId(r) || !knows(f, byId(r)!)).map((r) => byId(r)?.name ?? r).join(' and ')} first`;
  if (via === 'blueprint') return (f.blueprints ?? 0) > 0 ? undefined : 'No Blueprint (Guardian loot)';
  if ((f.research ?? 0) < techCost(b)) return `Needs ${techCost(b)} Research (${f.research ?? 0} banked)`;
  return undefined;
}

/** Research a building for a faction: with Research, one of its Blueprints or one of its Archive unlocks. False when it can't. */
export function research(c: Campaign, factionId: string, id: string, via: ResearchVia = 'research'): boolean {
  const f = c.factions.find((x) => x.id === factionId);
  if (researchBlock(f, id, via) || !f) return false;
  if (via === 'blueprint') {
    f.blueprints = (f.blueprints ?? 0) - 1;
    if (!f.blueprints) delete f.blueprints;
  } else if (via === 'archive') {
    f.archives = (f.archives ?? 0) - 1;
    if (!f.archives) delete f.archives;
  } else f.research = (f.research ?? 0) - techCost(byId(id)!);
  f.techs = [...(f.techs ?? []), id];
  return true;
}

/** Research the faction earns when a round ends. */
export function researchRate(c: Campaign, factionId: string): number {
  const held = c.sectors.filter((s) => s.owner === factionId);
  const stations = held.filter((s) => s.type === 'research' || (s.type === 'home' && s.benefit === 'researchStation')).length;
  const observatories = held.filter((s) => s.buildings?.includes('observatory')).length;
  return NEXUS_TECH.perRound + stations * NEXUS_TECH.perStation + observatories * NEXUS_TECH.perObservatory;
}

/** Round end: every faction earns its Research. Returns what each gained. */
export function accrueResearch(c: Campaign): { factionId: string; gained: number }[] {
  return c.factions.map((f) => {
    const gained = researchRate(c, f.id);
    f.research = (f.research ?? 0) + gained;
    return { factionId: f.id, gained };
  });
}
