import type { Campaign, Force } from '../model/types';
import { frontier, isPlaced } from './hexmap';
import { homeChallengeBlock, stormed } from './nexus';

// Nexus Wars sealed orders: each player picks what their detachments attack next game (or holds),
// nobody sees anyone else's picks until the GM reveals them. Each force linked to a faction is a
// detachment and declares its own attack.

export const HOLD = 'hold';

/** The GM's round: open for orders until revealed, then locked. */
export interface OrderRound {
  campaignId: string;
  round: number;
  revealed: boolean;
}

/** One player's orders for a round: force id (or, from older orders, faction id) → target sector id, or HOLD. */
export interface PlayerOrders {
  email: string;
  round: number;
  picks: Record<string, string>;
}

/** Who has declared for a round, without what: readable by everyone before the reveal. */
export interface Declared {
  email: string;
  round: number;
  /** The keys of their picks: force ids (faction ids in older orders). */
  factions: string[];
}

/** The detachments this player commands: their forces linked to one of the campaign's factions, by faction then name. */
export function myDetachments(c: Campaign, forces: Force[], email: string | null): Force[] {
  const order = c.factions.map((f) => f.id);
  return forces
    .filter((f) => (!f.owner || f.owner === email) && f.nexus && order.includes(f.nexus.factionId))
    .sort((a, b) => order.indexOf(a.nexus!.factionId) - order.indexOf(b.nexus!.factionId) || a.name.localeCompare(b.name));
}

/** Every detachment a player plays in the campaign (forces with an owner, linked to a faction). */
export const playedDetachments = (c: Campaign, forces: Force[]) =>
  forces.filter((f) => f.owner && f.nexus && c.factions.some((x) => x.id === f.nexus!.factionId));

/** Sectors a faction may attack: placed ones next to its territory, by name. */
export function attackTargets(c: Campaign, factionId: string) {
  const front = frontier(c, factionId);
  return c.sectors.filter((s) => isPlaced(s) && front.has(s.id) && !stormed(c, s.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export interface Attack {
  email: string;
  factionId: string;
  /** The detachment attacking (absent in older orders, picked per faction). */
  forceId?: string;
  sectorId: string;
  /** Who holds the sector now ('' when unclaimed). */
  defender: string;
  /** Why this attack needs the GM's attention. */
  flags: string[];
}

export interface Revealed {
  attacks: Attack[];
  holds: { email: string; factionId: string; forceId?: string }[];
}

/** Turn everyone's revealed orders into a list of attacks, flagging clashes and stale picks. */
export function revealOrders(c: Campaign, orders: PlayerOrders[], round: number, forces: Force[] = []): Revealed {
  const attacks: Attack[] = [];
  const holds: Revealed['holds'] = [];
  const seen = new Set<string>();
  for (const o of orders) {
    if (o.round !== round) continue;
    for (const [key, pick] of Object.entries(o.picks)) {
      const force = forces.find((f) => f.id === key);
      const factionId = force ? force.nexus?.factionId : key;
      const forceId = force?.id;
      if (seen.has(key) || !factionId || !c.factions.some((f) => f.id === factionId)) continue;
      seen.add(key);
      if (pick === HOLD) {
        holds.push({ email: o.email, factionId, ...(forceId ? { forceId } : {}) });
        continue;
      }
      const s = c.sectors.find((x) => x.id === pick);
      if (!s) continue;
      const flags: string[] = [];
      if (!frontier(c, factionId).has(s.id)) flags.push('No longer next to their territory');
      const blocked = homeChallengeBlock(c, s);
      if (blocked) flags.push(blocked);
      attacks.push({ email: o.email, factionId, ...(forceId ? { forceId } : {}), sectorId: s.id, defender: s.owner ?? '', flags });
    }
  }
  const name = (id: string) => c.factions.find((f) => f.id === id)?.name ?? id;
  for (const a of attacks) {
    const rivals = attacks.filter((x) => x !== a && x.sectorId === a.sectorId);
    const others = [...new Set(rivals.filter((x) => x.factionId !== a.factionId).map((x) => x.factionId))];
    if (others.length) a.flags.push(`Also attacked by ${others.map(name).join(', ')}`);
    if (rivals.some((x) => x.factionId === a.factionId)) a.flags.push(`Another detachment of ${name(a.factionId)} attacks it too: pick one, or fight together`);
    if (rivals.length && c.sectors.find((s) => s.id === a.sectorId)?.type === 'home') a.flags.push('A home sector can only be challenged once per round');
    if (a.defender && a.defender !== a.factionId && attacks.some((x) => x.factionId === a.defender && c.sectors.find((s) => s.id === x.sectorId)?.owner === a.factionId))
      a.flags.push(`${name(a.defender)} is attacking them too`);
  }
  return { attacks, holds };
}
