import type { Campaign, Force } from '../model/types';
import { factionForces, supplyLimit } from './detachments';
import { aiDefended, bandFightSize, ratingFor } from './difficulty';
import { hexDistance, isPlaced, type Rand } from './hexmap';
import { ATTACK_DEFEND_MISSIONS, rollAdvancedMission, type MissionDef } from './missions';
import { ECHOES, currentRound, factionName } from './nexus';
import { GAME_NIGHT, MUSTER, NEXUS_REINFORCE_BONUS } from './nexusData';
import { fieldCap } from './fieldCap';
import { foughtFor, type Attack } from './orders';
import { isReinforced } from './production';

// The Game Night Planner (Nexus Wars): the evening's tables, worked out from the campaign. The round's revealed
// attacks are fought first (player against player when both are here, the Echoes standing in when the defender
// isn't); whoever is left takes on the nearest Marauder band, then a skirmish with another player, or a patrol.

export type TableKind = 'pvp' | 'ai' | 'guardian' | 'standin' | 'marauder' | 'skirmish';

export interface NightTable {
  kind: TableKind;
  /** The players at it, the attacker first. */
  factions: string[];
  /** The attacking detachment. */
  forceId?: string;
  /** A muster: every detachment attacking together. */
  forceIds?: string[];
  /** A big game: a muster, its armies together over the field cap. */
  big?: boolean;
  /** A raid: the garrison matches the raiders. */
  raid?: boolean;
  sectorId?: string;
  bandId?: string;
  /** Who the GM fields when the other side isn't a player. */
  foe?: string;
  points: number;
  mission: MissionDef;
  /** Worth knowing at the table: the order's flags, a Reinforced defender. */
  notes: string[];
}

/** The factions coming to this round's game night. */
export const comingTonight = (c: Campaign): string[] => (c.gameNight?.round === currentRound(c) ? c.gameNight.coming : []);

/** Ticks a faction in or out of this round's game night (last round's list is dropped). */
export function setComing(c: Campaign, factionId: string, coming: boolean) {
  const now = comingTonight(c).filter((id) => id !== factionId);
  c.gameNight = { round: currentRound(c), coming: coming ? [...now, factionId] : now };
}

const roundDown = (n: number) => Math.floor(n / GAME_NIGHT.step) * GAME_NIGHT.step;

/** What a faction brings to a table: the detachment's Supply Limit, else its biggest detachment's. */
export function nightPoints(forces: Force[], factionId: string, forceId?: string): number {
  const own = forceId ? forces.find((f) => f.id === forceId) : undefined;
  const best = Math.max(0, ...factionForces(forces, factionId).map(supplyLimit));
  return roundDown(own ? supplyLimit(own) : best || GAME_NIGHT.fallbackPoints);
}

/** The evening's tables, from the revealed attacks (none before the reveal) and who's coming. */
export function planNight(c: Campaign, forces: Force[], attacks: Attack[], coming: string[], rand: Rand = Math.random): NightTable[] {
  const here = new Set(coming.filter((id) => c.factions.some((f) => f.id === id)));
  const seated = new Set<string>();
  const tables: NightTable[] = [];
  const round = currentRound(c);
  const attackMission = () => ATTACK_DEFEND_MISSIONS[Math.floor(rand() * ATTACK_DEFEND_MISSIONS.length)];

  // Musters first (they're the big games), closest fights first among them; then the rest as declared.
  const supplyOf = (a: Attack) => (a.forceIds ?? (a.forceId ? [a.forceId] : [])).reduce((n, id) => n + (forces.find((f) => f.id === id) ? supplyLimit(forces.find((f) => f.id === id)!) : 0), 0);
  const gap = (a: Attack) => {
    const s = c.sectors.find((x) => x.id === a.sectorId);
    const g = s && aiDefended(s) && !a.raid ? ratingFor(s, a.factionId, c) : undefined;
    const mine = supplyOf(a);
    return g && mine ? Math.max(g, mine) / Math.min(g, mine) : 1;
  };
  const muster = (a: Attack) => (a.forceIds?.length ?? 0) > 1;
  const ordered = [...attacks].sort((x, y) => Number(muster(y)) - Number(muster(x)) || (muster(x) ? gap(x) - gap(y) : 0));
  for (const a of ordered) {
    const s = c.sectors.find((x) => x.id === a.sectorId);
    if (!s || !here.has(a.factionId) || foughtFor(c, a, round)) continue;
    if (tables.some((t) => t.sectorId === s.id && t.factions[0] === a.factionId)) continue;
    const together = muster(a) ? roundDown(supplyOf(a)) : 0;
    const points = together || nightPoints(forces, a.factionId, a.forceId);
    const notes = [...a.flags];
    const big = together > fieldCap(c);
    const base = {
      forceId: a.forceId, sectorId: s.id, mission: attackMission(), notes,
      ...(muster(a) ? { forceIds: a.forceIds } : {}), ...(big ? { big } : {}), ...(a.raid ? { raid: true } : {}),
    };
    seated.add(a.factionId);
    if (aiDefended(s)) {
      const garrison = a.raid ? points : ratingFor(s, a.factionId, c) ?? points;
      if (!a.raid && Math.max(garrison, points) >= MUSTER.lopsided * Math.min(garrison, points))
        notes.push(`Lopsided: ${points} against a ${garrison} garrison. Settle it off the table (overrun or zone battle) and keep the table for a close fight`);
      tables.push({ ...base, kind: s.guardian ? 'guardian' : 'ai', factions: [a.factionId], points: garrison,
        foe: s.guardian ? `${s.guardian.name} (guardian)` : s.owner ? ECHOES.name : "The sector's defenders" });
      continue;
    }
    if (isReinforced(s)) notes.push(`Reinforced: the defender gets +${NEXUS_REINFORCE_BONUS} Supply`);
    if (here.has(s.owner!)) {
      seated.add(s.owner!);
      tables.push({ ...base, kind: 'pvp', factions: [a.factionId, s.owner!], points });
    } else {
      tables.push({ ...base, kind: 'standin', factions: [a.factionId], points, foe: `The ${ECHOES.name}, standing in for ${factionName(c, s.owner)}` });
    }
  }

  // Everyone else: the nearest band first, then each other, then a patrol.
  const left = [...here].filter((id) => !seated.has(id));
  const placed = c.sectors.filter(isPlaced);
  const bands = (c.marauders ?? []).filter((m) => placed.some((s) => s.id === m.sectorId));
  const spare: string[] = [];
  for (const id of left) {
    const home = placed.filter((s) => s.owner === id);
    const far = (sectorId: string) => {
      const at = placed.find((s) => s.id === sectorId)!;
      return Math.min(Infinity, ...home.map((h) => hexDistance(h, at)));
    };
    const band = bands.filter((m) => !tables.some((t) => t.bandId === m.id)).sort((x, y) => far(x.sectorId) - far(y.sectorId))[0];
    if (!band) {
      spare.push(id);
      continue;
    }
    tables.push({ kind: 'marauder', factions: [id], sectorId: band.sectorId, bandId: band.id, foe: band.name, points: bandFightSize(c, band.strength, band.barred?.sectorId ?? band.sectorId), mission: rollAdvancedMission(rand), notes: [] });
  }
  for (let i = 0; i + 1 < spare.length; i += 2) {
    const pair = [spare[i], spare[i + 1]];
    tables.push({ kind: 'skirmish', factions: pair, points: Math.min(...pair.map((id) => nightPoints(forces, id))), mission: rollAdvancedMission(rand), notes: [] });
  }
  if (spare.length % 2) {
    const id = spare[spare.length - 1];
    tables.push({ kind: 'skirmish', factions: [id], foe: ECHOES.name, points: nightPoints(forces, id), mission: rollAdvancedMission(rand), notes: ['A patrol against the Echoes'] });
  }
  return tables;
}
