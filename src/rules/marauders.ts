import type { Campaign, CampaignEvent, Force, Marauder, Sector } from '../model/types';
import type { RelicTier } from './data';
import { difficultyLevel } from './difficulty';
import { colOf, hexKey, isPlaced, neighbors, type Hex, type Rand } from './hexmap';
import { positionOf } from './movement';
import { rollGuardianLoot } from './nexus';
import { MARAUDERS, NEXUS_ROUNDS, WARLORDS } from './nexusData';
import { isReinforced, produces, productionRate } from './production';
import { hasPerk } from './warlords';

// Marauders (Nexus Wars): raider bands that belong to no one. Once the opening rounds are over, a band can turn up at a
// round's end (from the map's edge or the Voidspawn) while there are fewer than the threat allows. Every round each
// band grows stronger and moves 1–2 hexes toward the richest, weakest faction world it can find. Reaching it, the band
// raids: it carries off half the bank and the world produces nothing the next round, unless Walls (or Reinforce) or a
// detachment of its owner standing there throw the band back. Marauders are always on the map, fog or not. Beat a band
// and it's broken: roll on the Guardian loot table, at a tier set by its strength.

/** The id marauder games are fought against (a game's `defender` / `winner`). */
export const MARAUDER_ID = 'marauders';

/** What a band did at a round's end. */
export interface Raid {
  band: string;
  sectorId: string;
  sector: string;
  owner: string;
  /** Materials carried off (0 when thrown back). */
  stolen: number;
  repelled: boolean;
}

export const bandsAt = (c: Campaign, sectorId: string) => (c.marauders ?? []).filter((m) => m.sectorId === sectorId);

/** Was this sector raided, so it produces nothing this round? */
export const isRaided = (c: Campaign, s: Sector) => s.raided === (c.round ?? 1);

/** The loot tier a band rolls at when beaten. */
export const marauderTier = (m: Marauder): RelicTier =>
  m.strength >= MARAUDERS.legendaryAt ? 'Legendary' : m.strength >= MARAUDERS.rareAt ? 'Rare' : 'Common';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];
/** The tier a faction loots a beaten band at: one higher for a Reaver Warlord's Headhunter. */
export const lootTier = (c: Campaign, m: Marauder, factionId: string): RelicTier =>
  TIERS[Math.min(TIERS.length - 1, TIERS.indexOf(marauderTier(m)) + (hasPerk(c, factionId, 'bounty') ? 1 : 0))];

/** Does a detachment of the sector's owner stand there (with the forces, or by recorded position without them)? */
function garrisoned(c: Campaign, s: Sector, forces?: Force[]) {
  if (forces) return forces.some((f) => f.nexus?.factionId === s.owner && positionOf(c, f)?.id === s.id);
  return Object.values(c.positions ?? {}).some((p) => p.sectorId === s.id && p.factionId === s.owner);
}

/** Walls, Reinforce or a garrison throw a raid back. */
export const repels = (c: Campaign, s: Sector, forces?: Force[]) => isReinforced(s) || garrisoned(c, s, forces);

/** Steps from a hex to every placed sector, over placed sectors; with the step before each, to walk the way back. */
function paths(c: Campaign, from: Sector & Hex) {
  const at = new Map(c.sectors.filter(isPlaced).map((s) => [hexKey(s.q, s.r), s]));
  const dist = new Map<string, number>([[from.id, 0]]);
  const prev = new Map<string, Sector & Hex>();
  const queue: (Sector & Hex)[] = [from];
  while (queue.length) {
    const s = queue.shift()!;
    for (const n of neighbors(s)) {
      const x = at.get(hexKey(n.q, n.r));
      if (!x || dist.has(x.id)) continue;
      dist.set(x.id, dist.get(s.id)! + 1);
      prev.set(x.id, s);
      queue.push(x);
    }
  }
  return { dist, prev };
}

/** Where a band is heading: the faction world scoring highest for its bank and weakness, against how far off it is. */
function targetOf(c: Campaign, dist: Map<string, number>, forces?: Force[]) {
  let best: { s: Sector & Hex; score: number } | undefined;
  for (const s of c.sectors) {
    const d = dist.get(s.id);
    if (!d || !isPlaced(s) || !produces(s) || !c.factions.some((f) => f.id === s.owner) || isRaided(c, s)) continue;
    // A Shadow Warlord's worlds (Unseen) draw them less.
    const score = ((s.bank ?? 0) + productionRate(s, c)) * (repels(c, s, forces) ? MARAUDERS.defendedWeight : 1)
      * (hasPerk(c, s.owner, 'unseen') ? WARLORDS.unseenWeight : 1) / (1 + d);
    if (!best || score > best.score) best = { s, score };
  }
  return best?.s;
}

/** Move one band (it grows first), raiding if it reaches its target. Returns what the raid did, if there was one. */
function advance(c: Campaign, m: Marauder, rand: Rand, forces?: Force[]): Raid | undefined {
  m.strength = Math.min(MARAUDERS.max, m.strength + MARAUDERS.grow);
  const from = c.sectors.find((s) => s.id === m.sectorId);
  if (!from || !isPlaced(from)) return undefined;
  const { dist, prev } = paths(c, from);
  const target = targetOf(c, dist, forces);
  if (!target) return undefined;
  const route: (Sector & Hex)[] = [];
  for (let s: (Sector & Hex) | undefined = target; s && s.id !== from.id; s = prev.get(s.id)) route.unshift(s);
  const steps = Math.min(route.length, MARAUDERS.move.min + Math.floor(rand() * (MARAUDERS.move.max - MARAUDERS.move.min + 1)));
  const end = route[steps - 1];
  if (end.id !== target.id) {
    m.sectorId = end.id;
    return undefined;
  }
  const raid: Raid = { band: m.name, sectorId: target.id, sector: target.name, owner: target.owner!, stolen: 0, repelled: repels(c, target, forces) };
  if (raid.repelled) {
    // Thrown back: it stops a hex short, and bloodied.
    m.sectorId = (route[steps - 2] ?? from).id;
    m.strength = Math.max(MARAUDERS.min, m.strength - MARAUDERS.repelLoss);
    return raid;
  }
  raid.stolen = Math.floor((target.bank ?? 0) * MARAUDERS.steal);
  target.bank = (target.bank ?? 0) - raid.stolen;
  if (!target.bank) delete target.bank;
  target.raided = c.round ?? 1;
  m.sectorId = target.id;
  return raid;
}

/** Where a new band can turn up: the Voidspawn, or unclaimed sectors at the map's edge. */
function spawnPoint(c: Campaign, rand: Rand): (Sector & Hex) | undefined {
  const placed = c.sectors.filter(isPlaced);
  const spawns = placed.filter((s) => s.type === 'voidspawn');
  const m = c.map;
  const edge = placed.filter((s) => !s.owner && s.type !== 'voidspawn' && (!m || s.r === 0 || s.r === m.rows - 1 || colOf(s) === 0 || colOf(s) === m.cols - 1));
  const pick = (xs: (Sector & Hex)[]) => xs[Math.floor(rand() * xs.length)];
  if (spawns.length && (!edge.length || rand() < MARAUDERS.voidspawnChance)) return pick(spawns);
  return edge.length ? pick(edge) : undefined;
}

function bandName(c: Campaign, rand: Rand) {
  const used = new Set((c.marauders ?? []).map((m) => m.name));
  const roll = () => `The ${MARAUDERS.names.adjective[Math.floor(rand() * MARAUDERS.names.adjective.length)]} ${MARAUDERS.names.noun[Math.floor(rand() * MARAUDERS.names.noun.length)]}`;
  let name = roll();
  for (let i = 0; i < 20 && used.has(name); i++) name = roll();
  return name;
}

/** The most bands the map holds at a threat. */
export const marauderCap = (threat: number) => MARAUDERS.capByThreat[Math.max(0, Math.min(MARAUDERS.capByThreat.length - 1, threat))];

/**
 * Round end (after the round has moved on): every band grows and moves, raiding what it reaches, and a new one may turn
 * up. Bands whose sector is gone go with it. Mutates `c`.
 */
export function moveMarauders(c: Campaign, threat: number, rand: Rand = Math.random, newId: () => string = () => '', forces?: Force[]) {
  c.marauders = (c.marauders ?? []).filter((m) => c.sectors.some((s) => s.id === m.sectorId && isPlaced(s)));
  const raids: Raid[] = [];
  for (const m of c.marauders) {
    const r = advance(c, m, rand, forces);
    if (r) raids.push(r);
  }
  const spawned: Marauder[] = [];
  if ((c.round ?? 1) > NEXUS_ROUNDS.graceRounds && c.marauders.length < marauderCap(threat) && rand() < MARAUDERS.spawnChance) {
    const at = spawnPoint(c, rand);
    if (at) {
      const step = MARAUDERS.grow;
      const strength = Math.max(step, Math.round((MARAUDERS.start * difficultyLevel(c).scale) / step) * step);
      const m: Marauder = { id: newId() || `m${c.round}-${c.marauders.length}`, name: bandName(c, rand), sectorId: at.id, strength, since: c.round ?? 1 };
      c.marauders.push(m);
      spawned.push(m);
    }
  }
  if (!c.marauders.length) delete c.marauders;
  return { raids, spawned };
}

/**
 * Log a game against a band. The faction beating it breaks the band and rolls on the Guardian loot table (the band is
 * kept on the entry, so deleting it brings the band back).
 */
export function recordMarauderGame(c: Campaign, e: CampaignEvent, bandId: string, rand: Rand = Math.random) {
  const m = (c.marauders ?? []).find((x) => x.id === bandId);
  if (!m) return;
  e.round ??= c.round ?? 1;
  e.sectorId = m.sectorId;
  e.defender = MARAUDER_ID;
  e.marauder = { ...m };
  c.log.push(e);
  if (!e.winner || !c.factions.some((f) => f.id === e.winner)) return;
  c.marauders = c.marauders!.filter((x) => x.id !== m.id);
  if (!c.marauders.length) delete c.marauders;
  const s = c.sectors.find((x) => x.id === m.sectorId);
  // The spoils go to the sector's bank if the winner holds it, otherwise home.
  const bank = s?.owner === e.winner ? s : c.sectors.find((x) => x.type === 'home' && x.owner === e.winner);
  if (bank) e.loot = rollGuardianLoot(c, bank, { tier: lootTier(c, m, e.winner) }, e.winner, rand);
}

/** A deleted marauder game: the band it broke is back (if nothing took its place). */
export function unrecordMarauderGame(c: Campaign, e: CampaignEvent) {
  const m = e.marauder;
  if (!m || !c.factions.some((f) => f.id === e.winner) || (c.marauders ?? []).some((x) => x.id === m.id)) return;
  if (!c.sectors.some((s) => s.id === m.sectorId)) return;
  c.marauders = [...(c.marauders ?? []), { ...m }];
}
