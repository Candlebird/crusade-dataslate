import type { Campaign, Force } from '../model/types';
import { frontier, isPlaced } from './hexmap';
import { homeChallengeBlock } from './nexus';

// Nexus Wars sealed orders: each player picks what their factions attack next game (or holds),
// nobody sees anyone else's picks until the GM reveals them.

export const HOLD = 'hold';

/** The GM's round: open for orders until revealed, then locked. */
export interface OrderRound {
  campaignId: string;
  round: number;
  revealed: boolean;
}

/** One player's orders for a round: faction id → target sector id, or HOLD. */
export interface PlayerOrders {
  email: string;
  round: number;
  picks: Record<string, string>;
}

/** Who has declared for a round, without what: readable by everyone before the reveal. */
export interface Declared {
  email: string;
  round: number;
  factions: string[];
}

/** The factions this player commands: those their forces are linked to. */
export function myFactions(c: Campaign, forces: Force[], email: string | null): string[] {
  const ids = new Set(forces.filter((f) => (!f.owner || f.owner === email) && f.nexus?.factionId).map((f) => f.nexus!.factionId));
  return c.factions.filter((f) => ids.has(f.id)).map((f) => f.id);
}

/** Factions anyone in the campaign plays, by player email. */
export function playedFactions(c: Campaign, forces: Force[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of forces) {
    const id = f.nexus?.factionId;
    if (!f.owner || !id || !c.factions.some((x) => x.id === id)) continue;
    const list = out.get(f.owner) ?? [];
    if (!list.includes(id)) list.push(id);
    out.set(f.owner, list);
  }
  return out;
}

/** Sectors a faction may attack: placed ones next to its territory, by name. */
export function attackTargets(c: Campaign, factionId: string) {
  const front = frontier(c, factionId);
  return c.sectors.filter((s) => isPlaced(s) && front.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export interface Attack {
  email: string;
  factionId: string;
  sectorId: string;
  /** Who holds the sector now ('' when unclaimed). */
  defender: string;
  /** Why this attack needs the GM's attention. */
  flags: string[];
}

export interface Revealed {
  attacks: Attack[];
  holds: { email: string; factionId: string }[];
}

/** Turn everyone's revealed orders into a list of attacks, flagging clashes and stale picks. */
export function revealOrders(c: Campaign, orders: PlayerOrders[], round: number): Revealed {
  const attacks: Attack[] = [];
  const holds: Revealed['holds'] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.round !== round) continue;
    for (const [factionId, pick] of Object.entries(o.picks)) {
      if (seen.has(factionId) || !c.factions.some((f) => f.id === factionId)) continue;
      seen.add(factionId);
      if (pick === HOLD) {
        holds.push({ email: o.email, factionId });
        continue;
      }
      const s = c.sectors.find((x) => x.id === pick);
      if (!s) continue;
      const flags: string[] = [];
      if (!frontier(c, factionId).has(s.id)) flags.push('No longer next to their territory');
      const blocked = homeChallengeBlock(c, s);
      if (blocked) flags.push(blocked);
      attacks.push({ email: o.email, factionId, sectorId: s.id, defender: s.owner ?? '', flags });
    }
  }
  const name = (id: string) => c.factions.find((f) => f.id === id)?.name ?? id;
  for (const a of attacks) {
    const rivals = attacks.filter((x) => x !== a && x.sectorId === a.sectorId);
    if (rivals.length) a.flags.push(`Also attacked by ${rivals.map((x) => name(x.factionId)).join(', ')}`);
    if (rivals.length && c.sectors.find((s) => s.id === a.sectorId)?.type === 'home') a.flags.push('A home sector can only be challenged once per round');
    if (a.defender && a.defender !== a.factionId && attacks.some((x) => x.factionId === a.defender && c.sectors.find((s) => s.id === x.sectorId)?.owner === a.factionId))
      a.flags.push(`${name(a.defender)} is attacking them too`);
  }
  return { attacks, holds };
}
