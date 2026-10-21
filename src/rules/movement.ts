import type { Campaign, CampaignEvent, Force, ForcePosition, Sector } from '../model/types';
import { hexDistance, hexKey, isPlaced, neighbors, type Hex } from './hexmap';
import { activeEvent, currentRound, homeOf, stormed } from './nexus';
import { NEXUS_MOVE, PRODUCTION } from './nexusData';
import { hasBuilding } from './production';

// Detachments on the Nexus map (Nexus Wars). Each force linked to a faction stands in one sector, its faction's home
// until it first moves. A round it moves up to NEXUS_MOVE.base hexes: through its faction's sectors and unclaimed empty
// space freely, and into anything else as an attack, which ends its move. It takes the sector by winning there, and is
// pushed back to its faction's nearest sector if someone else takes the one it stands in.

export type MoveKind = 'move' | 'attack';

/** Passing through it is a plain move: the faction holds it, or it's unclaimed empty space with nothing guarding it. */
export const isOpen = (s: Sector, factionId: string) => s.owner === factionId || (!s.owner && s.type === 'empty' && !s.guardian);

/** The faction's sector nearest a hex: where its detachments fall back to. */
export function nearestHeld(c: Campaign, factionId: string, from?: Hex): (Sector & Hex) | undefined {
  const held = c.sectors.filter((s): s is Sector & Hex => s.owner === factionId && isPlaced(s));
  const home = homeOf(c, factionId);
  if (!from) return held.find((s) => s.id === home?.id) ?? held[0];
  return held.reduce<(Sector & Hex) | undefined>((best, s) => (!best || hexDistance(s, from) < hexDistance(best, from) ? s : best), undefined);
}

/** Where a detachment stands: where it last moved for its faction, else its faction's home (or another of its sectors). */
export function positionOf(c: Campaign, force: Force): (Sector & Hex) | undefined {
  const fid = force.nexus?.factionId;
  if (!fid) return undefined;
  const p = c.positions?.[force.id];
  const s = p?.factionId === fid ? c.sectors.find((x) => x.id === p.sectorId) : undefined;
  return s && isPlaced(s) ? s : nearestHeld(c, fid);
}

export function setPosition(c: Campaign, forceId: string, p: ForcePosition | null) {
  const next = { ...(c.positions ?? {}) };
  if (p) next[forceId] = p;
  else delete next[forceId];
  c.positions = next;
}

/** The detachment has a Forced March (Strategic Asset) this round. */
export const forcedMarch = (c: Campaign, forceId: string) =>
  (c.assetsSpent ?? []).some((a) => a.asset === 'forcedMarch' && a.forceId === forceId && a.round === currentRound(c));

/** How far a detachment moves this round, and why, from what it starts next to, its Assets and the Galactic Event. */
export function moveOf(c: Campaign, force: Force): { move: number; why: string[] } {
  const fid = force.nexus?.factionId;
  const start = positionOf(c, force);
  const why = [`${NEXUS_MOVE.base} base`];
  let move = NEXUS_MOVE.base;
  if (start && c.sectors.some((b) => b.owner === fid && hasBuilding(b, 'beacon') && isPlaced(b) && hexDistance(b, start) <= 1)) {
    move += NEXUS_MOVE.beacon;
    why.push(`+${NEXUS_MOVE.beacon} Hyperlane Beacon`);
  }
  if (forcedMarch(c, force.id)) {
    move += NEXUS_MOVE.forcedMarch;
    why.push(`+${NEXUS_MOVE.forcedMarch} Forced March`);
  }
  const event = activeEvent(c);
  if (event?.move) {
    move += event.move;
    why.push(`${event.move > 0 ? '+' : ''}${event.move} ${event.name}`);
  }
  return { move: Math.max(NEXUS_MOVE.min, move), why };
}

export interface Reach {
  kind: MoveKind;
  /** Hexes it takes to get there (the Warp Gate's reach: undefined). */
  steps?: number;
}

/**
 * Every sector a detachment can get to this round: a move through open sectors, or an attack that ends it. Storm-swallowed
 * sectors can't be entered at all. A Warp Gate its faction holds reaches anything within PRODUCTION.warpRange of it.
 */
export function reach(c: Campaign, force: Force): Map<string, Reach> {
  const out = new Map<string, Reach>();
  const fid = force.nexus?.factionId;
  const start = positionOf(c, force);
  if (!fid || !start) return out;
  const byKey = new Map(c.sectors.filter(isPlaced).map((s) => [hexKey(s.q, s.r), s]));
  const { move } = moveOf(c, force);
  let ring: (Sector & Hex)[] = [start];
  const seen = new Set([start.id]);
  for (let step = 1; step <= move && ring.length; step++) {
    const next: (Sector & Hex)[] = [];
    for (const h of ring)
      for (const n of neighbors(h)) {
        const t = byKey.get(hexKey(n.q, n.r));
        if (!t || seen.has(t.id) || stormed(c, t.id)) continue;
        seen.add(t.id);
        const open = isOpen(t, fid);
        out.set(t.id, { kind: open ? 'move' : 'attack', steps: step });
        if (open) next.push(t);
      }
    ring = next;
  }
  const gates = c.sectors.filter((g): g is Sector & Hex => g.owner === fid && hasBuilding(g, 'warpGate') && isPlaced(g));
  for (const t of c.sectors.filter(isPlaced))
    if (t.id !== start.id && !out.has(t.id) && !stormed(c, t.id) && gates.some((g) => hexDistance(g, t) <= PRODUCTION.warpRange))
      out.set(t.id, { kind: isOpen(t, fid) ? 'move' : 'attack' });
  return out;
}

/** Where a detachment can go this round, by name: its moves and its attacks. */
export function moveTargets(c: Campaign, force: Force) {
  const r = reach(c, force);
  const all = c.sectors.filter((s) => r.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
  return { moves: all.filter((s) => r.get(s.id)!.kind === 'move'), attacks: all.filter((s) => r.get(s.id)!.kind === 'attack') };
}

/**
 * Detachments standing in a sector someone else now holds fall back to their faction's nearest sector (or home).
 * Returns where those it moved stood before.
 */
export function regroup(c: Campaign): Record<string, ForcePosition | null> {
  const was: Record<string, ForcePosition | null> = {};
  for (const [id, p] of Object.entries(c.positions ?? {})) {
    const s = c.sectors.find((x) => x.id === p.sectorId);
    if (s && (!s.owner || s.owner === p.factionId)) continue;
    was[id] = p;
    const back = nearestHeld(c, p.factionId, s && isPlaced(s) ? s : undefined);
    setPosition(c, id, back ? { sectorId: back.id, factionId: p.factionId } : null);
  }
  return was;
}

/**
 * What a recorded game does to the detachments: the attacking one moves in when its faction takes or holds the sector,
 * and anyone else's standing there falls back. Notes where they stood, so deleting the game can put them back.
 */
export function settleGame(c: Campaign, e: CampaignEvent, s: Sector, undo: NonNullable<CampaignEvent['undo']>) {
  const was: Record<string, ForcePosition | null> = {};
  if (e.forceId && e.winner === e.attacker && s.owner === e.winner && isPlaced(s)) {
    was[e.forceId] = c.positions?.[e.forceId] ?? null;
    setPosition(c, e.forceId, { sectorId: s.id, factionId: e.winner });
  }
  Object.assign(was, regroup(c));
  if (Object.keys(was).length) undo.positions = was;
}

/** Put detachments back where a deleted game found them. */
export function unsettleGame(c: Campaign, was: Record<string, ForcePosition | null>) {
  for (const [id, p] of Object.entries(was)) setPosition(c, id, p);
}
