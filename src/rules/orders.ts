import type { Campaign, CampaignEvent, Force } from '../model/types';
import { frontier, hexDistance, isPlaced } from './hexmap';
import { PRODUCTION, homeChallengeBlock, stormed } from './nexus';
import { hasBuilding } from './production';
import { isOpen, positionOf, reach, setPosition } from './movement';
import { fallBack, meetingOutcomes, meetings } from './meetings';
import { siegeAttack, siegeOf } from './sieges';

// Nexus Wars sealed orders: each player picks where their detachments move or what they attack next game (or holds),
// nobody sees anyone else's picks until the GM reveals them. Each force linked to a faction is a
// detachment and declares its own order, within its reach on the map (movement.ts).

export const HOLD = 'hold';

/** A detachment holding on its own faction's sector digs in: if the sector is attacked that round, it defends it. */
export const digsIn = (c: Campaign, force: Force) => !!force.nexus && positionOf(c, force)?.owner === force.nexus.factionId;

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

/** Sectors a faction may attack: placed ones next to its territory, or in a Warp Gate's reach, by name (orders picked per faction). */
export function attackTargets(c: Campaign, factionId: string) {
  const front = frontier(c, factionId);
  const gates = c.sectors.filter((s) => s.owner === factionId && hasBuilding(s, 'warpGate')).filter(isPlaced);
  for (const s of c.sectors)
    if (s.owner !== factionId && isPlaced(s) && gates.some((g) => hexDistance(g, s) <= PRODUCTION.warpRange)) front.add(s.id);
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
  /** The defender's detachment dug in there: it fights the battle and picks the deployment. */
  dugIn?: string;
}

/** A detachment moving through its own or empty space: no game, the GM moves it on the map. */
export interface Move {
  email: string;
  factionId: string;
  forceId: string;
  sectorId: string;
  flags: string[];
}

export interface Revealed {
  attacks: Attack[];
  moves: Move[];
  holds: { email: string; factionId: string; forceId?: string }[];
}

/** Turn everyone's revealed orders into a list of attacks, flagging clashes and stale picks. */
export function revealOrders(c: Campaign, orders: PlayerOrders[], round: number, forces: Force[] = []): Revealed {
  const attacks: Attack[] = [];
  const moves: Move[] = [];
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
      // A detachment pinned by a siege can't move or attack anywhere else: it keeps the siege up (added below).
      const siege = siegeOf(c, forceId);
      if (siege) {
        seen.delete(key);
        continue;
      }
      if (pick === HOLD) {
        holds.push({ email: o.email, factionId, ...(forceId ? { forceId } : {}) });
        continue;
      }
      const s = c.sectors.find((x) => x.id === pick);
      if (!s) continue;
      const flags: string[] = [];
      if (force && forceId) {
        // A detachment's order: a move if it's open ground, else an attack, either one within its reach.
        if (!reach(c, force).has(s.id)) flags.push('Out of reach');
        if (isOpen(s, factionId)) {
          moves.push({ email: o.email, factionId, forceId, sectorId: s.id, flags });
          continue;
        }
      } else if (!frontier(c, factionId).has(s.id)) flags.push('No longer next to their territory');
      const blocked = homeChallengeBlock(c, s);
      if (blocked) flags.push(blocked);
      attacks.push({ email: o.email, factionId, ...(forceId ? { forceId } : {}), sectorId: s.id, defender: s.owner ?? '', flags });
    }
  }
  // Standing sieges attack again every round.
  for (const f of forces) {
    const siege = siegeOf(c, f.id);
    if (!siege || seen.has(f.id)) continue;
    seen.add(f.id);
    const own = orders.find((o) => o.round === round && (o.picks[f.id] ?? HOLD) !== HOLD && o.picks[f.id] !== siege.sectorId && o.picks[f.id] !== undefined);
    const a = siegeAttack(c, siege, f.owner ?? '');
    if (own) a.flags.push(`Pinned by the siege: its order to ${c.sectors.find((x) => x.id === own.picks[f.id])?.name ?? 'move'} doesn't count`);
    attacks.push(a);
  }
  const name = (id: string) => c.factions.find((f) => f.id === id)?.name ?? id;
  for (const a of attacks) {
    const dug = a.defender && a.defender !== a.factionId
      ? holds.map((h) => forces.find((f) => f.id === h.forceId)).find((f) => f && f.nexus?.factionId === a.defender && positionOf(c, f)?.id === a.sectorId)
      : undefined;
    if (dug) {
      a.dugIn = dug.id;
      a.flags.push(`Dug in: ${dug.name} defends it and picks the deployment`);
    }
    const rivals = attacks.filter((x) => x !== a && x.sectorId === a.sectorId);
    const others = [...new Set(rivals.filter((x) => x.factionId !== a.factionId).map((x) => x.factionId))];
    if (others.length) a.flags.push(`Also attacked by ${others.map(name).join(', ')}`);
    if (rivals.some((x) => x.factionId === a.factionId)) a.flags.push(`Another detachment of ${name(a.factionId)} attacks it too: pick one, or fight together`);
    if (rivals.length && c.sectors.find((s) => s.id === a.sectorId)?.type === 'home') a.flags.push('A home sector can only be challenged once per round');
    if (a.defender && a.defender !== a.factionId && attacks.some((x) => x.factionId === a.defender && c.sectors.find((s) => s.id === x.sectorId)?.owner === a.factionId))
      a.flags.push(`${name(a.defender)} is attacking them too`);
  }
  return { attacks, moves, holds };
}

/**
 * Make the revealed moves on the map: those still in reach, after the meeting engagements (meetings.ts) — a detachment
 * that lost one falls back to its faction's nearest sector, one that drew stays where it was. Returns how many moved.
 */
export function applyMoves(c: Campaign, moves: Move[], forces: Force[], round?: number): number {
  let n = 0;
  const outcomes = round === undefined ? new Map() : meetingOutcomes(c, meetings(c, { moves }, forces), round);
  for (const [id, o] of outcomes) {
    const force = forces.find((f) => f.id === id);
    if (force && o.to === 'back' && fallBack(c, force, o.from)) n++;
  }
  for (const m of moves) {
    if (outcomes.has(m.forceId)) continue;
    const force = forces.find((f) => f.id === m.forceId);
    const s = c.sectors.find((x) => x.id === m.sectorId);
    if (!force || !s || force.nexus?.factionId !== m.factionId || reach(c, force).get(s.id)?.kind !== 'move') continue;
    setPosition(c, force.id, { sectorId: s.id, factionId: m.factionId });
    n++;
  }
  return n;
}

/** The game already recorded for a revealed attack this round, if it has been fought. */
export function foughtFor(c: Campaign, a: Pick<Attack, 'factionId' | 'sectorId'>, round: number): CampaignEvent | undefined {
  return [...c.log].reverse().find((e) => e.round === round && e.sectorId === a.sectorId && e.attacker === a.factionId && !e.spread && !e.skirmish && !e.crisis && !e.marauder);
}
