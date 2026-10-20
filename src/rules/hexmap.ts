import { uid } from '../model/factory';
import type { Campaign, CampaignMap, Sector, SectorType } from '../model/types';
import { BENEFITS, ECHOES, isStronghold } from './nexus';
import { NEXUS_MAP } from './nexusData';

// Pointy-top hexes in axial coordinates (q, r), laid out as an "odd-r" rectangle.

export interface Hex {
  q: number;
  r: number;
}

export const hexKey = (q: number, r: number) => `${q},${r}`;

const DIRS: Hex[] = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];

export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

export const hexDistance = (a: Hex, b: Hex) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

export const colOf = (h: Hex) => h.q + Math.floor(h.r / 2);

export const inBounds = (m: CampaignMap, h: Hex) => h.r >= 0 && h.r < m.rows && colOf(h) >= 0 && colOf(h) < m.cols;

export function cells(m: CampaignMap): Hex[] {
  const out: Hex[] = [];
  for (let r = 0; r < m.rows; r++) for (let col = 0; col < m.cols; col++) out.push({ q: col - Math.floor(r / 2), r });
  return out;
}

/** Centre of a hex in pixels, for hexes of the given circumradius. */
export const toPixel = (h: Hex, size: number) => ({ x: size * Math.sqrt(3) * (h.q + h.r / 2), y: size * 1.5 * h.r });

export function hexCorners(cx: number, cy: number, size: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export const isPlaced = (s: Sector): s is Sector & Hex => s.q != null && s.r != null;

export function sectorAt(c: Campaign, h: Hex): Sector | undefined {
  return c.sectors.find((s) => s.q === h.q && s.r === h.r);
}

/** Sectors not held by the faction that border its territory. */
export function frontier(c: Campaign, factionId: string): Set<string> {
  const byKey = new Map(c.sectors.filter(isPlaced).map((s) => [hexKey(s.q, s.r), s]));
  const out = new Set<string>();
  for (const s of c.sectors.filter(isPlaced)) {
    if (s.owner !== factionId) continue;
    for (const n of neighbors(s)) {
      const t = byKey.get(hexKey(n.q, n.r));
      if (t && t.owner !== factionId) out.add(t.id);
    }
  }
  return out;
}

/** Unplace sectors that fall outside the map after a resize. */
export function clampToMap(c: Campaign) {
  if (!c.map) return;
  for (const s of c.sectors) if (s.q != null && s.r != null && !inBounds(c.map, { q: s.q, r: s.r })) s.q = s.r = undefined;
}

/** Room for every faction to grow: 12×12 for two factions, two columns and rows more for each extra one (NEXUS_MAP). */
export function defaultMap(factions: number): CampaignMap {
  const n = NEXUS_MAP.size + NEXUS_MAP.perExtraFaction * (Math.max(2, factions) - 2);
  return { cols: n, rows: n, seed: randomSeed() };
}

// ---- seeded randomness ----

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;
const pick = <T,>(rand: Rand, xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
function shuffle<T>(rand: Rand, xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// ---- names & lore ----

const SYL_A = ['Vor', 'Kess', 'Mal', 'Thra', 'Ix', 'Cal', 'Drus', 'Hel', 'Syl', 'Grav', 'Nyx', 'Bael', 'Ostr', 'Zar', 'Kor', 'Vel', 'Ath', 'Mor', 'Tes', 'Sab', 'Ulth', 'Orm', 'Cyr', 'Dag'];
const SYL_B = ['a', 'e', 'i', 'o', 'u', 'ae', 'y', '', '', 'an', 'or'];
const SYL_C = ['x', 'ris', 'thos', 'nar', 'dun', 'lyx', 'mire', 'gard', 'phon', 'ium', 'os', 'eth', 'ara', 'ion', 'usk', 'heim', 'vane'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Iota', 'Kappa', 'Sigma', 'Tau', 'Omega'];

const root = (rand: Rand) => pick(rand, SYL_A) + pick(rand, SYL_B) + pick(rand, SYL_C);

function nameFor(rand: Rand, type: SectorType): string {
  const n = root(rand);
  switch (type) {
    case 'planet':
      return n + pick(rand, [' Prime', ' Secundus', ' IV', ' VII', ' Minor', ' Majoris', '', '', ' III']);
    case 'research':
      return pick(rand, [`Station ${pick(rand, GREEK)}-${1 + Math.floor(rand() * 99)}`, `${n} Observatory`, `Archive ${pick(rand, GREEK)}`, `The ${n} Spire`]);
    case 'void':
      return pick(rand, [`Hulk ${n}`, `The ${pick(rand, ['Drowned', 'Silent', 'Hollow', 'Broken', 'Weeping', 'Burning'])} ${pick(rand, ['Cathedral', 'Leviathan', 'Ark', 'Choir', 'Crown', 'Reliquary'])}`, `Wreck of the ${n}`]);
    case 'anomaly':
      return pick(rand, [`The ${n} Rift`, `${n} Maelstrom`, `Eye of ${n}`, `The ${n} Scar`]);
    case 'empty':
      return pick(rand, [`${n} Expanse`, `${n} Deep`, `Dust of ${n}`, `The ${n} Reach`]);
    case 'home':
      return `${n} Bastion`;
    case 'voidspawn':
      return pick(rand, [`The ${n} Wound`, `${n} Hollow`, `Maw of ${n}`, `The Echoing ${pick(rand, ['Dark', 'Choir', 'Deep', 'Silence'])}`]);
  }
}

const LORE: Record<SectorType, [string[], string[]]> = {
  planet: [
    ['An irradiated world', 'A hive-choked world', 'A frozen world', 'A jungle-drowned world', 'An ash-grey world', 'A tidally-locked world', 'A storm-wracked ocean world'],
    ['its cities long since swallowed by the Umbra.', 'still garrisoned by the remnants of a forgotten army.', 'whose crust weeps shard-crystal.', 'where the dead are said to walk at dusk.', 'stripped bare by centuries of war.', 'ringed by the wreckage of an ancient fleet.'],
  ],
  research: [
    ['A derelict orbital laboratory', 'A sealed xeno-archive', 'A listening post', 'A cogitator vault'],
    ['still humming with forbidden data.', 'whose last transmission was a scream.', 'guarded by automata that never stood down.', 'where the Nexus was first catalogued.'],
  ],
  void: [
    ['A drifting mass of fused starships', 'A hollowed moon', 'A colossal derelict', 'A tomb-ship of unknown make'],
    ['crawling with things that should not live.', 'that answers no hail.', 'whose engines still burn cold blue.', 'lost in the warp for a thousand years.'],
  ],
  anomaly: [
    ['A wound in reality', 'A storm of pure Umbra', 'A gravity well that bends time', 'A shimmering tear in the void'],
    ['that rewards the bold and devours the rest.', 'where shadows move against the light.', 'that whispers to those who draw near.', 'leaking raw Nexus energy.'],
  ],
  empty: [
    ['A dead stretch of space', 'A dust-choked nebula', 'A graveyard of shattered moons', 'A silent void lane'],
    ['crossed only by the desperate.', 'patrolled by nothing at all.', 'where sensors fail.', 'littered with the debris of old battles.'],
  ],
  home: [
    ['A fortified stronghold', 'A sprawling fortress-world', 'An armoured citadel'],
    ['that has never fallen.', 'from which the faction wages its war.'],
  ],
  voidspawn: [
    ['A festering breach in the Nexus', 'A world hollowed out by the Echoes', 'A pulsing mass of void-flesh'],
    ['from which the Void Echoes pour forth.', 'that swallows the light of nearby stars.', 'whose whispers grow louder every cycle.'],
  ],
};

const loreFor = (rand: Rand, type: SectorType) => `${pick(rand, LORE[type][0])} ${pick(rand, LORE[type][1])}`;

/** A fresh random name, lore line and (for planets) benefit for a sector of the given type. Voidspawns belong to the Void Echoes. */
export function rollSector(type: SectorType, rand: Rand = Math.random): Pick<Sector, 'name' | 'notes' | 'benefit' | 'owner'> {
  const benefits = BENEFITS.filter((b) => b.type === type);
  return {
    name: nameFor(rand, type),
    notes: loreFor(rand, type),
    benefit: type === 'planet' && benefits.length ? pick(rand, benefits).id : undefined,
    owner: type === 'voidspawn' ? ECHOES.id : undefined,
  };
}

// ---- generation ----

export type GenCounts = Record<Exclude<SectorType, 'home'>, number>;

export interface GenOptions {
  cols: number;
  rows: number;
  seed: string;
  /** Target totals per type (existing sectors count toward them). */
  counts: GenCounts;
  /** Nearby sectors handed to each faction at the start. */
  startingSectors: number;
  /** Delete every sector but the homes and Voidspawns first; otherwise keep placed sectors where they are. */
  replace: boolean;
}

/**
 * Sector counts that fill NEXUS_MAP.fill of a cols × rows map (the default map's size when not given): NEXUS_MAP.poiShare
 * of them points of interest split by their weights, the rest clear space around the homes and the Voidspawn.
 */
export function defaultCounts(factions: number, cols?: number, rows?: number): GenCounts {
  const f = Math.max(2, factions);
  const size = cols && rows ? { cols, rows } : defaultMap(f);
  const total = Math.round(size.cols * size.rows * NEXUS_MAP.fill);
  const poi = Math.round(total * NEXUS_MAP.poiShare);
  const kinds = Object.entries(NEXUS_MAP.poiWeights) as [keyof GenCounts, number][];
  const sum = kinds.reduce((n, [, w]) => n + w, 0);
  const counts: GenCounts = { planet: 0, research: 0, void: 0, anomaly: 0, empty: 0, voidspawn: 1 };
  // Largest remainder, so the points of interest add up exactly.
  const exact = kinds.map(([t, w]) => ({ t, x: (poi * w) / sum }));
  for (const e of exact) counts[e.t] = Math.floor(e.x);
  let left = poi - exact.reduce((n, e) => n + Math.floor(e.x), 0);
  for (const e of [...exact].sort((a, b) => (b.x % 1) - (a.x % 1))) if (left-- > 0) counts[e.t]++;
  counts.empty = Math.max(0, total - poi - f - counts.voidspawn);
  return counts;
}

/**
 * Lay out the campaign map. Homes sit two hexes in from the edge, spread evenly around the map so rivals start at opposite
 * ends; the Voidspawn sits in the middle. Each faction then grows the same mix of sectors into its own half (the hexes
 * nearer its home than any other), the leftovers form a contested middle around the Voidspawn, and empty space links up
 * anything cut off. Finally each faction takes its nearest sectors. Mutates `c`.
 */
export function generateMap(c: Campaign, o: GenOptions) {
  const rand = rng(o.seed);
  const map: CampaignMap = { cols: o.cols, rows: o.rows, seed: o.seed };
  c.map = map;
  const all = cells(map);
  if (o.replace) {
    c.sectors = c.sectors.filter(isStronghold);
    for (const s of c.sectors) s.q = s.r = undefined;
  }
  clampToMap(c);
  const used = new Set(c.sectors.map((s) => s.name));
  const make = (type: SectorType): Sector => {
    let name = nameFor(rand, type);
    for (let i = 0; i < 20 && used.has(name); i++) name = nameFor(rand, type);
    used.add(name);
    const benefits = BENEFITS.filter((b) => b.type === type);
    const s: Sector = { id: uid(), name, type, notes: loreFor(rand, type) };
    if (type === 'planet' && benefits.length) s.benefit = pick(rand, benefits).id;
    if (type === 'voidspawn') s.owner = ECHOES.id;
    c.sectors.push(s);
    return s;
  };
  // Voidspawns are laid out like homes, so add any still missing now.
  for (let i = c.sectors.filter((s) => s.type === 'voidspawn').length; i < o.counts.voidspawn; i++) make('voidspawn');

  const taken = new Map<string, Sector>();
  for (const s of c.sectors) if (isPlaced(s)) taken.set(hexKey(s.q, s.r), s);
  const free = (h: Hex) => inBounds(map, h) && !taken.has(hexKey(h.q, h.r));
  const put = (s: Sector, h: Hex) => {
    s.q = h.q;
    s.r = h.r;
    taken.set(hexKey(h.q, h.r), s);
  };
  const edge = (h: Hex) => Math.min(colOf(h), map.cols - 1 - colOf(h), h.r, map.rows - 1 - h.r);
  const nearest = (options: Hex[], score: (h: Hex) => number) => {
    let best: Hex | undefined;
    let low = Infinity;
    for (const x of options) {
      const v = score(x);
      if (v < low) [best, low] = [x, v];
    }
    return best;
  };

  // Where a hex sits relative to the middle of the map, scaled so the map reads as a circle.
  const corner = toPixel({ q: 0, r: 0 }, 1);
  const far = toPixel({ q: map.cols - 1 - Math.floor((map.rows - 1) / 2), r: map.rows - 1 }, 1);
  const mid = { x: (corner.x + far.x) / 2, y: (corner.y + far.y) / 2 };
  const half = { x: Math.max(1, (far.x - corner.x) / 2), y: Math.max(1, (far.y - corner.y) / 2) };
  const polar = (h: Hex) => {
    const p = toPixel(h, 1);
    const x = (p.x - mid.x) / half.x, y = (p.y - mid.y) / half.y;
    return { angle: Math.atan2(y, x), radius: Math.hypot(x, y) };
  };
  const centre = nearest(all, (h) => polar(h).radius) ?? { q: 0, r: 0 };

  // Voidspawns: the first in the middle, any others spread out around it, away from the edge.
  const strongholds = c.sectors.filter(isStronghold);
  const spawns = strongholds.filter((s) => s.type === 'voidspawn');
  for (const v of spawns.filter((s) => !isPlaced(s))) {
    const placed = strongholds.filter(isPlaced);
    const cell = placed.some((s) => s.type === 'voidspawn')
      ? nearest(all.filter((h) => free(h) && edge(h) >= 3), (h) => -Math.min(...placed.map((p) => hexDistance(p, h))) + rand())
      : nearest(all.filter(free), (h) => hexDistance(h, centre) + rand() * 0.5);
    if (cell) put(v, cell);
  }

  // Homes: spaced evenly around the ring two hexes in from the edge, the first on the left (so a pair faces off across the
  // map). Four or six factions go by angle from a corner instead, so no home lands on a short side nearer the middle.
  const homes = strongholds.filter((s) => s.type === 'home');
  const ring = all.filter((x) => edge(x) === 2).sort((a, b) => polar(a).angle - polar(b).angle);
  const left = ring.indexOf(nearest(ring, (x) => Math.abs(Math.abs(polar(x).angle) - Math.PI) + polar(x).radius * 0.01)!);
  const turn = 2 * Math.PI;
  const byAngle = homes.length > 2 && homes.length % 2 === 0;
  homes.forEach((h, i) => {
    if (isPlaced(h)) return;
    const others = homes.filter(isPlaced);
    const wrap = (d: number, n: number) => Math.min(((d % n) + n) % n, n - (((d % n) + n) % n));
    const angle = Math.PI + (turn * (i + 0.5)) / homes.length;
    const spot = left + (i * ring.length) / homes.length;
    const off = (x: Hex) => (byAngle ? wrap(polar(x).angle - angle, turn) : wrap(ring.indexOf(x) - spot, ring.length));
    const open = ring.filter((x) => free(x) && others.every((p) => hexDistance(p, x) >= 3));
    const cell = open.length
      ? nearest(open, off)
      // Too small a map for a ring: keep homes as far from each other as possible.
      : nearest(all.filter(free), (x) => -(others.length ? Math.min(...others.map((p) => hexDistance(p, x))) : rand() * 10) * 4 - Math.min(edge(x), 1) * 8 - rand());
    if (cell) put(h, cell);
  });

  // The new sectors still needed to reach the target counts: an equal share for each faction, the rest to the middle.
  const placedHomes = homes.filter(isPlaced);
  const share: SectorType[] = [];
  const middle: SectorType[] = [];
  for (const t of Object.keys(o.counts) as (keyof GenCounts)[]) {
    if (t === 'voidspawn') continue;
    const need = Math.max(0, o.counts[t] - c.sectors.filter((s) => s.type === t).length);
    const each = placedHomes.length > 1 ? Math.floor(need / placedHomes.length) : 0;
    for (let i = 0; i < each; i++) share.push(t);
    for (let i = each * placedHomes.length; i < need; i++) middle.push(t);
  }
  shuffle(rand, share);
  shuffle(rand, middle);

  // A faction's half: hexes strictly nearer its home than any other, leaving the Voidspawn's surroundings to the middle.
  const spawnsPlaced = spawns.filter(isPlaced);
  const regionOf = (x: Hex) => {
    if (spawnsPlaced.some((v) => hexDistance(v, x) < 2)) return -1;
    const d = placedHomes.map((h) => hexDistance(h, x));
    const best = Math.min(...d);
    return d.filter((n) => n === best).length === 1 ? d.indexOf(best) : -1;
  };
  const toward = (x: Hex) => hexDistance(x, centre);
  // Every faction lays the same type at the same step, taking turns to go first, so no one gets the pick of the map.
  share.forEach((type, k) => {
    for (let j = 0; j < placedHomes.length; j++) {
      const i = (k + j) % placedHomes.length;
      const home = placedHomes[i];
      const front = new Map<string, Hex>();
      for (const s of taken.values()) {
        if (s !== home && regionOf(s as Hex) !== i) continue;
        for (const n of neighbors(s as Hex)) if (free(n) && regionOf(n) === i) front.set(hexKey(n.q, n.r), n);
      }
      const cell = nearest([...front.values()], (x) => hexDistance(x, home) * 2 + toward(x) + rand() * 1.5);
      if (cell) put(make(type), cell);
      else middle.push(type);
    }
  });

  // The contested middle, then any existing sectors not yet on the map, grow from what is already there.
  // The middle keeps off the factions' halves while it can, so the leftovers don't favour whoever is nearest.
  const growInto = (contested = false): Hex | undefined => {
    const front = new Map<string, Hex>();
    for (const s of taken.values()) for (const n of neighbors(s as Hex)) if (free(n)) front.set(hexKey(n.q, n.r), n);
    const shared = contested ? [...front.values()].filter((x) => regionOf(x) === -1) : [];
    return nearest(shared.length ? shared : front.size ? [...front.values()] : all.filter(free), (x) => toward(x) + rand() * 2);
  };
  for (const type of middle) {
    const cell = growInto(true);
    if (!cell) break;
    put(make(type), cell);
  }
  for (const s of c.sectors.filter((x) => !isPlaced(x))) {
    const cell = growInto();
    if (cell) put(s, cell);
  }

  // Link up anything cut off with the shortest run of empty space.
  for (let guard = 0; guard < 50; guard++) {
    const groups = components([...taken.values()] as (Sector & Hex)[]);
    if (groups.length < 2) break;
    const main = new Set(groups[0].map((s) => hexKey(s.q, s.r)));
    const path = shortestPath(groups[1], main, free);
    if (!path) break;
    for (const h of path) put(make('empty'), h);
  }

  // Starting territory: round-robin, each faction takes its nearest unclaimed sector.
  for (let round = 0; round < o.startingSectors; round++) {
    for (const h of placedHomes) {
      if (!h.owner) continue;
      const open = c.sectors.filter((s) => isPlaced(s) && !s.owner && s.type !== 'void' && !isStronghold(s));
      if (!open.length) break;
      const near = open.reduce((a, b) => (hexDistance(h as Hex, a as Hex) <= hexDistance(h as Hex, b as Hex) ? a : b));
      near.owner = h.owner;
    }
  }
}

/** What the end-of-round refresh changed. `cleared` holds the space hulks as they were before they went. */
export interface Refresh {
  cleared: Sector[];
  fresh: Sector[];
}

/**
 * The map moves on at the end of a round: space hulks whose reward has been claimed drift off and leave clear space
 * (still held by whoever held it), and new points of interest turn up, NEXUS_MAP.refreshPerFaction in each faction's
 * half and NEXUS_MAP.refreshContested in the contested middle. New ones appear in unclaimed clear space, or at the edge
 * of the map's sectors when there is none, never right next to a home. `hulks` more space hulks drift into the
 * contested middle too (the Derelict Fleet event). Mutates `c`.
 */
export function refreshSectors(c: Campaign, rand: Rand = Math.random, hulks = 0): Refresh {
  const cleared: Sector[] = [];
  const fresh: Sector[] = [];
  const used = new Set(c.sectors.map((s) => s.name));
  const named = (type: SectorType) => {
    let r = rollSector(type, rand);
    for (let i = 0; i < 20 && used.has(r.name); i++) r = rollSector(type, rand);
    used.add(r.name);
    return r;
  };

  for (const s of c.sectors) {
    if (s.type !== 'void' || !s.rewardClaimed) continue;
    cleared.push(structuredClone(s));
    const r = named('empty');
    s.type = 'empty';
    s.name = r.name;
    const was = cleared[cleared.length - 1].name;
    s.notes = `Where ${/hulk/i.test(was) ? was : `the space hulk ${was}`} drifted until it was picked clean.`;
    delete s.benefit;
    delete s.rewardClaimed;
    delete s.modifiers;
    delete s.difficulty;
  }

  const map = c.map;
  if (!map) return { cleared, fresh };
  const homes = c.sectors.filter((s): s is Sector & Hex => s.type === 'home' && isPlaced(s));
  const spawns = c.sectors.filter((s): s is Sector & Hex => s.type === 'voidspawn' && isPlaced(s));
  // Nearer one home than any other is that faction's half; ties and the Voidspawn's surroundings are the middle (-1).
  const regionOf = (x: Hex) => {
    if (spawns.some((v) => hexDistance(v, x) < 2)) return -1;
    const d = homes.map((h) => hexDistance(h, x));
    const best = Math.min(...d);
    return d.filter((n) => n === best).length === 1 ? d.indexOf(best) : -1;
  };
  const weights = Object.entries(NEXUS_MAP.poiWeights) as [SectorType, number][];
  const kind = () => {
    let roll = rand() * weights.reduce((n, [, w]) => n + w, 0);
    for (const [t, w] of weights) if ((roll -= w) < 0) return t;
    return weights[0][0];
  };

  const spawn = (region: number, near?: Hex, forced?: SectorType) => {
    const ok = (x: Hex) => regionOf(x) === region && homes.every((h) => hexDistance(h, x) >= 2);
    let options: Hex[] = c.sectors.filter((s): s is Sector & Hex => isPlaced(s) && s.type === 'empty' && !s.owner && ok(s));
    if (!options.length) {
      const taken = new Set(c.sectors.filter(isPlaced).map((s) => hexKey(s.q!, s.r!)));
      const edge = new Map<string, Hex>();
      for (const s of c.sectors.filter(isPlaced))
        for (const n of neighbors(s as Hex)) if (inBounds(map, n) && !taken.has(hexKey(n.q, n.r)) && ok(n)) edge.set(hexKey(n.q, n.r), n);
      options = [...edge.values()];
    }
    let cell: Hex | undefined;
    let low = Infinity;
    for (const x of options) {
      const v = (near ? hexDistance(near, x) : 0) + rand() * 3;
      if (v < low) [cell, low] = [x, v];
    }
    if (!cell) return;
    const type = forced ?? kind();
    const r = named(type);
    let s = c.sectors.find((x) => x.q === cell!.q && x.r === cell!.r);
    if (!s) c.sectors.push((s = { id: uid(), name: '', type, notes: '', q: cell.q, r: cell.r }));
    s.type = type;
    s.name = r.name;
    s.notes = r.notes;
    if (r.benefit) s.benefit = r.benefit;
    else delete s.benefit;
    delete s.rewardClaimed;
    delete s.modifiers;
    delete s.difficulty;
    fresh.push(s);
  };
  homes.forEach((h, i) => {
    if (!h.owner) return;
    for (let k = 0; k < NEXUS_MAP.refreshPerFaction; k++) spawn(i, h);
  });
  for (let k = 0; k < NEXUS_MAP.refreshContested; k++) spawn(-1, spawns[0]);
  for (let k = 0; k < hulks; k++) spawn(-1, spawns[0], 'void');
  return { cleared, fresh };
}

/** Groups of neighbouring sectors, biggest first. */
function components(placed: (Sector & Hex)[]): (Sector & Hex)[][] {
  const byKey = new Map(placed.map((s) => [hexKey(s.q, s.r), s]));
  const seen = new Set<string>();
  const out: (Sector & Hex)[][] = [];
  for (const start of placed) {
    if (seen.has(hexKey(start.q, start.r))) continue;
    const group: (Sector & Hex)[] = [];
    const queue = [start];
    seen.add(hexKey(start.q, start.r));
    while (queue.length) {
      const s = queue.pop()!;
      group.push(s);
      for (const n of neighbors(s)) {
        const t = byKey.get(hexKey(n.q, n.r));
        if (t && !seen.has(hexKey(t.q, t.r))) {
          seen.add(hexKey(t.q, t.r));
          queue.push(t);
        }
      }
    }
    out.push(group);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** The fewest free hexes that connect `from` to a hex in `to`, not counting either end. */
function shortestPath(from: Hex[], to: Set<string>, free: (h: Hex) => boolean): Hex[] | undefined {
  const prev = new Map<string, Hex | null>();
  const queue: Hex[] = [];
  for (const h of from) {
    prev.set(hexKey(h.q, h.r), null);
    queue.push(h);
  }
  for (let i = 0; i < queue.length; i++) {
    const h = queue[i];
    for (const n of neighbors(h)) {
      const k = hexKey(n.q, n.r);
      if (prev.has(k)) continue;
      if (to.has(k)) {
        const path: Hex[] = [];
        for (let x = h; prev.get(hexKey(x.q, x.r)); x = prev.get(hexKey(x.q, x.r))!) path.push(x);
        return path;
      }
      if (!free(n)) continue;
      prev.set(k, h);
      queue.push(n);
    }
  }
  return undefined;
}

/** True if every placed sector can be reached from every other through neighbouring sectors. */
export function isConnected(c: Campaign): boolean {
  const placed = c.sectors.filter(isPlaced);
  if (placed.length < 2) return true;
  const keys = new Set(placed.map((s) => hexKey(s.q, s.r)));
  const seen = new Set([hexKey(placed[0].q, placed[0].r)]);
  const queue: Hex[] = [placed[0]];
  while (queue.length) {
    for (const n of neighbors(queue.pop()!)) {
      const k = hexKey(n.q, n.r);
      if (keys.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push(n);
      }
    }
  }
  return seen.size === keys.size;
}
