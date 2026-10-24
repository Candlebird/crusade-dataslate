import type { Campaign, Sector, SectorGuardian, Unit } from '../../model/types';
import type { RelicTier } from '../data';

// Test-only: a campaign for the Nexus tests (F3). Not in index.ts.

/** A guardian with these rules. */
export const guardian = (name: string, tier: RelicTier, rules: string[] = []): SectorGuardian =>
  ({ name, tier, unit: { rules } as unknown as Unit });

/** A campaign at `threat` in round 2, with these guardians and anything else given. */
export function campaign(threat: number, guardians: SectorGuardian[] = [], o: Partial<Campaign> = {}): Campaign {
  const sectors = guardians.map((g, i) => ({ id: `s${i}`, name: `S${i}`, type: 'planet', guardian: g }) as unknown as Sector);
  return { id: 'c1', name: 'C', updatedAt: '', factions: [], sectors, log: [], round: 2, threat, ...o };
}
