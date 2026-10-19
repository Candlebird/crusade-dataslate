import { uid } from '../model/factory';
import type { Campaign, CampaignMap, Sector, SectorType } from '../model/types';
import { BENEFITS } from './nexus';

// Pointy-top hexes in axial coordinates (q, r), laid out as an "odd-r" rectangle.

export interface Hex {
  q: number;
  r: number;
}

export const hexKey = (q: number, r: number) => `${q},${r}`;

const DIRS: Hex[] = [{ q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 }, { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }];

export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));

export const hexDistance = (a: Hex, b: Hex) => (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;

const colOf = (h: Hex) => h.q + Math.floor(h.r / 2);

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

export const defaultMap = (factions: number): CampaignMap => ({ cols: 4 + Math.max(2, factions), rows: 3 + Math.max(2, factions), seed: randomSeed() });

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

type Rand = () => number;
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
};

const loreFor = (rand: Rand, type: SectorType) => `${pick(rand, LORE[type][0])} ${pick(rand, LORE[type][1])}`;

/** A fresh random name, lore line and (for planets) benefit for a sector of the given type. */
export function rollSector(type: SectorType, rand: Rand = Math.random): Pick<Sector, 'name' | 'notes' | 'benefit'> {
  const benefits = BENEFITS.filter((b) => b.type === type);
  return { name: nameFor(rand, type), notes: loreFor(rand, type), benefit: type === 'planet' && benefits.length ? pick(rand, benefits).id : undefined };
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
  /** Delete every non-home sector first; otherwise keep placed sectors where they are. */
  replace: boolean;
}

export function defaultCounts(factions: number): GenCounts {
  const f = Math.max(2, factions);
  return { planet: 2 * f + 1, research: Math.ceil(f / 2), void: Math.ceil(f / 2) + 1, anomaly: Math.ceil(f / 2), empty: 2 * f };
}

/** Cells on the straight hex line from a to b, inclusive. */
function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    const q = a.q + (b.q - a.q) * t + 1e-6;
    const r = a.r + (b.r - a.r) * t + 1e-6;
    const s = -q - r;
    let rq = Math.round(q), rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    out.push({ q: rq, r: rr });
  }
  return out;
}

/**
 * Lay out the campaign map: spread the home sectors apart, link them with chains of sectors,
 * grow the rest outward, then give each faction its nearest sectors. Mutates `c`.
 */
export function generateMap(c: Campaign, o: GenOptions) {
  const rand = rng(o.seed);
  const map: CampaignMap = { cols: o.cols, rows: o.rows, seed: o.seed };
  c.map = map;
  const all = cells(map);
  if (o.replace) {
    c.sectors = c.sectors.filter((s) => s.type === 'home');
    for (const s of c.sectors) s.q = s.r = undefined;
  }
  clampToMap(c);

  const taken = new Map<string, Sector>();
  for (const s of c.sectors) if (isPlaced(s)) taken.set(hexKey(s.q, s.r), s);
  const free = (h: Hex) => inBounds(map, h) && !taken.has(hexKey(h.q, h.r));
  const put = (s: Sector, h: Hex) => {
    s.q = h.q;
    s.r = h.r;
    taken.set(hexKey(h.q, h.r), s);
  };
  const edge = (h: Hex) => Math.min(colOf(h), map.cols - 1 - colOf(h), h.r, map.rows - 1 - h.r);

  // Homes: farthest-point spread, kept off the very edge where possible.
  const homes = c.sectors.filter((s) => s.type === 'home');
  for (const h of homes.filter((s) => !isPlaced(s))) {
    const placed = homes.filter(isPlaced);
    const options = all.filter(free);
    if (!options.length) break;
    const score = (x: Hex) => (placed.length ? Math.min(...placed.map((p) => hexDistance(p, x))) : rand() * 10) * 4 + Math.min(edge(x), 1) * 8 + rand();
    put(h, options.reduce((best, x) => (score(x) > score(best) ? x : best)));
  }

  // The pool of new sectors still needed to reach the target counts.
  const pool: SectorType[] = [];
  for (const t of Object.keys(o.counts) as (keyof GenCounts)[]) {
    const have = c.sectors.filter((s) => s.type === t).length;
    for (let i = have; i < o.counts[t]; i++) pool.push(t);
  }
  shuffle(rand, pool);
  const used = new Set(c.sectors.map((s) => s.name));
  const make = (type: SectorType): Sector => {
    let name = nameFor(rand, type);
    for (let i = 0; i < 20 && used.has(name); i++) name = nameFor(rand, type);
    used.add(name);
    const benefits = BENEFITS.filter((b) => b.type === type);
    const s: Sector = { id: uid(), name, type, notes: loreFor(rand, type) };
    if (type === 'planet' && benefits.length) s.benefit = pick(rand, benefits).id;
    c.sectors.push(s);
    return s;
  };
  const next = (): Sector => make(pool.pop() ?? 'empty');

  // Chains from each home to the centre keep the map connected and contested in the middle.
  const placedHomes = homes.filter(isPlaced);
  const centre = { q: Math.floor((map.cols - 1) / 2) - Math.floor(Math.floor((map.rows - 1) / 2) / 2), r: Math.floor((map.rows - 1) / 2) };
  if (placedHomes.length > 1) for (const h of placedHomes) for (const cell of hexLine(h, centre)) if (free(cell)) put(next(), cell);

  // Existing unplaced sectors, then the rest of the pool, grow from what is already on the map.
  const growInto = (): Hex | undefined => {
    const front = new Map<string, Hex>();
    for (const s of taken.values()) for (const n of neighbors(s as Hex)) if (free(n)) front.set(hexKey(n.q, n.r), n);
    const options = front.size ? [...front.values()] : all.filter(free);
    if (!options.length) return undefined;
    // Favour cells near the centre so the map fills out as a rough disc rather than a tendril.
    return options.reduce((best, x) => {
      const sx = hexDistance(x, centre) + rand() * 2.5, sb = hexDistance(best, centre) + rand() * 2.5;
      return sx < sb ? x : best;
    });
  };
  for (const s of c.sectors.filter((x) => !isPlaced(x))) {
    const cell = growInto();
    if (cell) put(s, cell);
  }
  while (pool.length) {
    const cell = growInto();
    if (!cell) break;
    put(next(), cell);
  }

  // Starting territory: round-robin, each faction takes its nearest unclaimed sector.
  for (let round = 0; round < o.startingSectors; round++) {
    for (const h of placedHomes) {
      if (!h.owner) continue;
      const open = c.sectors.filter((s) => isPlaced(s) && !s.owner && s.type !== 'void' && s.type !== 'home');
      if (!open.length) break;
      const near = open.reduce((a, b) => (hexDistance(h as Hex, a as Hex) <= hexDistance(h as Hex, b as Hex) ? a : b));
      near.owner = h.owner;
    }
  }
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
