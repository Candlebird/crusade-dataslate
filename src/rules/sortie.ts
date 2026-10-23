import type { CatalogBook, CatalogUnit, ForceSortie, Unit } from '../model/types';
import { applySelection } from '../armyforge/book';
import { unitFromCatalog } from '../model/factory';
import { fighter, type Fighter, type Gun } from './autoBattle';
import { effects, type Ability, type Status } from './abilities';
import { hasRule, ruleRating } from './engine';
import { BIG_UNIT, randomSelection } from './echoForce';
import { squadPower } from './training';
import { unitName } from './battle';
import {
  SORTIE, SORTIE_BOONS, SORTIE_EVENTS, SORTIE_QUIRKS, SORTIE_TRINKETS, type SortieGoal,
  type SortieAffix, type SortieBoonId, type SortieChoice, type SortieEvent, type SortieLength, type SortieMode, type SortieOutcome,
  type SortieCurseId, type SortieMarkId, type SortieScarId,
} from './downtimeData';
import { SORTIE_BOSSES, SORTIE_LORE, SORTIE_LORE_DEFAULT, SORTIE_REGIONS, SORTIE_STAND, SORTIE_VOICE, type SortieBoss, type SortieRegion, type SortieRegionId, type SortieVoiceKind } from './sortieStory';
import { RELICS, type RelicDef } from './data';
import { pickRaiders, raidBand, type Raider } from './raiders';

// Sortie: a party of three units sets out across a branching map, Darkest Dungeon style. Fights are turn based. The
// party stands in a line of three slots, front, middle and back (a Fortification always at the back), and every round
// the line turns: the middle steps up to the front, the front falls back and the back moves up to the middle. The Echo
// squads stand Close, Mid or Far (several can share one), moving up as the fight goes on; a slot further back adds to
// the distance both ways. Blades reach only from the front to Close (a Charge reaches further and brings its target
// in); guns reach as far as their range allows. Every model on both sides rolls initiative each round and acts on its
// own: the player gives each unit one order a round (a Hero or a lone model picks each turn), and each model carries
// it out with its own weapons. Echoes fight the front unit in melee and shoot at random at whatever their guns reach.
// Models wounded in melee or seeing a squadmate fall test morale and can be Shaken or rout, as in OPR. Wounds stay
// between fights. The Echoes are real datasheets from the imported Void Echoes book, trimmed model by model to the
// fight's budget, and they show what kind of thing they'll do next.

type Rand = () => number;

export interface SortieModel {
  hp: number;
  max: number;
  /** Its own share of the unit's weapons: attacks are per model. */
  guns: Gun[];
  /** Spends its next turn steadying itself, at -1 Defense until then. */
  shaken?: boolean;
  /** Has fled the fight; back after it (with the wounds it had). */
  routed?: boolean;
}

/** What an Echo squad will do on its turn: only the kind is shown. */
export type SortieIntentKind = 'melee' | 'shoot' | 'charge' | 'ability' | 'advance' | 'shaken' | 'waiting';

export interface SortieSquad {
  key: string;
  name: string;
  unit: Unit;
  echo: boolean;
  /** A Marauder (rules/raiders.ts): who it is and whose army it's from, for its card. */
  raider?: string;
  models: SortieModel[];
  quality: number;
  defense: number;
  defMod: number;
  fortified: boolean;
  ignore: number;
  /** -1 to be hit: always (Evasive), when shot at Mid or Far (Stealth), in melee (Melee Evasion). */
  evasive: number;
  stealth: boolean;
  meleeEvasion: boolean;
  /** Impact hits per model when it charges. */
  impact: number;
  hitShoot: number;
  hitMelee: number;
  atkBonus: number;
  fast: boolean;
  slow: boolean;
  fearless: boolean;
  hero: boolean;
  /** Turns each model takes a round: big models (Tough 6 and up) act more than once. */
  turns: number;
  abilities: Ability[];
  points: number;
  /** Statuses, each to the last round it lasts (a stun is spent on the next turn it costs). */
  status: Partial<Record<Status, number>>;
  /** Skills by id: the first round each can be used again. */
  cooldowns: Record<string, number>;
  /** The last round it fought in melee: guns fire at -1 that round and the next. */
  engaged: number;
  shield: number;
  revived: boolean;
  /** Cracked under stress this round: it refuses its orders, or fights wild at -1 to hit. */
  crack?: { round: number; kind: 'refuse' | 'wild' };
  /** Not on the field yet (Ambush): turns up at Close range at the start of this round. */
  arrives?: number;
  /** How far off an Echo squad stands: 1 Close, 2 Mid, 3 Far. Several squads can share a distance. */
  dist?: number;
  intent?: SortieIntentKind;
  /** A party unit's place in the line: 0 front, 1 middle, 2 back; none once it's out of the fight. */
  slot?: number;
  /** A party unit's index in the run's party. */
  member?: number;
  /** The round a party unit made its last stand (SORTIE.lastStand); only one a fight. */
  stand?: number;
}

export type SortieTone = 'good' | 'bad' | 'info';
export interface SortieLine {
  text: string;
  tone: SortieTone;
}

export type SortieFightKind = 'fight' | 'elite' | 'boss';

export type SortieSkillKind = 'weapon' | 'atwill' | 'charge' | 'regroup' | 'heal' | 'shield' | 'barrage' | 'field' | 'outflank';

export interface SortieSkill {
  id: string;
  kind: SortieSkillKind;
  name: string;
  text: string;
  /** The furthest distance it reaches from where the unit stands (1 Close, 2 Mid, 3 Far); 0 for none. */
  reach: number;
  melee?: boolean;
  /** The weapon it fires, for weapon skills. */
  gun?: string;
  /** Rounds left on its cooldown; 0 when ready. */
  wait: number;
  /** Why it can't be used from the unit's slot (a blade away from the front, a short gun at the back). */
  blocked?: string;
}

/** One model's place in the round's initiative. */
export interface SortieTurn {
  key: string;
  i: number;
  init: number;
}

export interface SortieOrder {
  skill: string;
  target?: string;
}

export interface SortieCombat {
  kind: SortieFightKind;
  round: number;
  /** The party's units, in the run's order (slots say where each stands). */
  party: SortieSquad[];
  enemies: SortieSquad[];
  /** Models still to act this round, fastest first. */
  queue: SortieTurn[];
  /** What the game waits on: a unit's order for the round, or a Hero's (or lone model's) own turn. */
  need?: 'order' | 'turn';
  /** The party unit the game waits on. */
  acting?: string;
  /** Each unit's order this round. */
  orders: Record<string, SortieOrder>;
  /** Units whose order's ability or charge has gone off this round. */
  cast: Record<string, boolean>;
  /** Outflank: the round a unit's guns reach any distance. */
  outflank: Record<string, number>;
  /** Echo squads that already stepped forward this round. */
  moved: string[];
  kills: number;
  log: SortieLine[];
  over?: 'won' | 'lost' | 'broke';
  /** The Echo lord's squad key, in the boss fight. */
  lord?: string;
  /** The party unit that destroyed the last Echo squad to fall. */
  lastBlow?: string;
  /** An elite fight's affix, on every Echo squad in it. */
  affix?: SortieAffix;
  /** What a lord that broods spawns. */
  brood?: Unit;
  /** The Echoes struck first: they act ahead of the party in the first round. */
  ambush?: boolean;
  /** Already counted into the run's bestiary tally. */
  tallied?: boolean;
  /** The latest blows, for the view's trails and damage numbers (newest last). */
  fx?: SortieFx[];
  fxSeq?: number;
}

/** One blow: who struck whom, and how hard. */
export interface SortieFx { n: number; from: string; to: string; hits: number; dmg: number; melee: boolean; mine: boolean }

export type SortieNodeKind = 'fight' | 'elite' | 'camp' | 'shrine' | 'cache' | 'shop' | 'boss';
export interface SortieNode {
  row: number;
  col: number;
  kind: SortieNodeKind;
  /** An elite's affix. */
  affix?: SortieAffix;
  /** Columns it leads to in the next row. */
  next: number[];
  /** Shows as '?' until the party is near enough to see it (SORTIE.hidden). */
  hidden?: boolean;
  /** Started hidden: a fight here may be an ambush (SORTIE.ambush). */
  veiled?: boolean;
  /** Tells something of the lord (SORTIE.omens). */
  omen?: boolean;
}

export type SortieScreen = 'map' | 'combat' | 'reward' | 'event' | 'camp' | 'shop' | 'over';

export interface SortieHaul {
  supply: number;
  rp: number;
  us: number;
}

/** One unit of the party and the wounds its models carry. */
export interface SortieMember {
  unit: Unit;
  models: { hp: number; max: number }[];
  /** Stress, for this run only (SORTIE.stress): a full bar cracks the unit for a round. */
  stress?: number;
  /** Battle scars earned this run (SORTIE.scars). */
  scars?: SortieScarId[];
}

export interface SortieRun {
  rng: number;
  /** Marauders from the other armies in the app this run may meet (rules/raiders.ts). */
  raiders?: Raider[];
  /** The Ascension level past the top tier: its first that many curses (SORTIE.ascension) are on. */
  ascension?: number;
  /** Echoes met this run, for the force's bestiary: fights met in and squads slain, by name (or 'lord:<id>'). */
  met?: Record<string, { met: number; slain: number }>;
  /** Times the force has slain this run's lord before (up to the tricks there are): it comes back with that many. */
  rematch?: number;
  /** The boons the force has unlocked; none means every boon is on offer. */
  unlocked?: string[];
  /** The three units, in their starting line (a Fortification last). */
  party: SortieMember[];
  mode: SortieMode;
  length: SortieLength;
  /** Some unit has a ranged weapon / a real melee weapon: boons for those are offered. */
  ranged: boolean;
  melee: boolean;
  /** Points-based power (levels included), and how far the Echoes' size-up of the party bends it (see sizeUp). */
  power: number;
  scale?: Partial<Record<SortieFightKind, number>>;
  /** Rows of nodes; the last row is the boss alone. */
  map: SortieNode[][];
  /** Where the party is; row -1 before the first node. */
  row: number;
  col: number;
  /** Extra wounds per model from boons and shrines. */
  tough: number;
  boons: SortieBoonId[];
  won: number;
  /** XP earned so far, before the cap. */
  xp: number;
  /** What a Shard run brings home, if it gets home. */
  haul: SortieHaul;
  bossDown: boolean;
  /** Nodes cleared. */
  depth: number;
  screen: SortieScreen;
  combat?: SortieCombat;
  /** Boons to pick from; `patch` offers patching up instead. */
  offer?: { boons: SortieBoonId[]; patch?: boolean };
  event?: { id: string; result?: string; then?: 'fight' };
  /** fell: wiped out. broke: the last models routed. home: headed home from a camp. */
  over?: 'fell' | 'broke' | 'won' | 'quit' | 'home';
  journal: SortieLine[];
  /** Where the run goes, and the Echo lord waiting at the end of it. */
  region: SortieRegionId;
  boss: string;
  /** Story threads' steps done, and encounters already met. */
  flags: string[];
  seen: string[];
  /** The scene at the node the party is at. */
  scene?: string;
  /** A shop's wares, bought with the run's Supply. */
  shop?: { boons: { id: SortieBoonId; price: number; sold?: boolean }[]; healed?: boolean };
  /** How much of the Echo lord's wounds story choices have taken. */
  weaken: number;
  /** The region's deep version (bigger fights, a bigger haul). */
  deep?: boolean;
  /** The lord's grudge level against this force: it beat a party of theirs before, and is tougher for it. */
  nemesis?: number;
  /** The lord wiped out the party, broke it or saw it turn back mid-fight: the force's nemesis from now on. */
  lordWon?: boolean;
  /** The difficulty tier (SORTIE.tiers). */
  tier?: number;
  /** From tier 3: the lord's second signature ability, borrowed from another lord. */
  sig2?: string;
  /** Trinkets found on the way, brought home whatever happens. */
  trinkets?: string[];
  /** The weekly challenge this run is (an ISO week like '2026-W43'). */
  weekly?: string;
  /** Pact marks taken on for this run (SORTIE.marks). */
  marks?: SortieMarkId[];
  /** Omens of the lord read on the road, and whether they took away its own signature ability. */
  omens?: number;
  foreseen?: boolean;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** The run's own dice, so a seed replays the same run. */
function rand(run: { rng: number }): number {
  run.rng = (run.rng + 0x6d2b79f5) | 0;
  let t = run.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const d6 = (run: SortieRun) => 1 + Math.floor(rand(run) * 6);
/** 2.3 → 2 or 3, 3 30% of the time. */
const stoch = (run: SortieRun, n: number) => Math.floor(n) + (rand(run) < n - Math.floor(n) ? 1 : 0);
const pickOf = <T,>(run: SortieRun, xs: readonly T[]): T => xs[Math.floor(rand(run) * xs.length)];

/** Models still on their feet (routed or not), and those still in the fight. */
export const alive = (s: SortieSquad) => s.models.filter((m) => m.hp > 0);
export const active = (s: SortieSquad) => s.models.filter((m) => m.hp > 0 && !m.routed);
export const standing = (s: SortieSquad) => active(s).length > 0;
const hpOf = (s: SortieSquad) => active(s).reduce((n, m) => n + m.hp, 0);
const maxOf = (s: SortieSquad) => s.models.reduce((n, m) => n + m.max, 0);

const FISTS: Gun = { name: 'Fists', melee: true, range: 0, attacks: 1, ap: 0, hitMod: 0, blast: 1, deadly: 1, rending: false, reliable: false, bane: false };
const countOf = (names: string[], n: string) => names.filter((x) => x === n).length;

/** Each model's share of the weapons, in the order fighter() made the guns: one carried by every model goes to all, the rest round-robin. */
function modelsOf(u: Unit, f: Fighter, n: number, tough: number): SortieModel[] {
  const models: SortieModel[] = Array.from({ length: n }, () => ({ hp: tough, max: tough, guns: [] }));
  const relics = (u.relics ?? []).filter((r) => r.profile).length;
  const counts = [...u.weapons.map((w) => Math.max(1, w.count)), ...Array<number>(relics).fill(1)];
  const next = { melee: 0, ranged: 0 };
  f.guns.forEach((g, i) => {
    const c = counts[i] ?? f.size;
    const per = { ...g, attacks: g.attacks / c };
    if (i >= u.weapons.length && relics) return models[0].guns.push(per);
    if (c >= f.size) return models.forEach((m) => m.guns.push({ ...per }));
    const kind = g.melee ? 'melee' : 'ranged';
    for (let k = 0; k < c; k++) {
      const m = models[next[kind]++ % f.size];
      if (m) m.guns.push({ ...per });
    }
  });
  for (const m of models) if (!m.guns.some((g) => g.melee)) m.guns.push({ ...FISTS });
  return models;
}

/** A unit in the fight: its own fighter numbers, every model on its own with its Tough times the run's multiplier in wounds. */
export function squadOf(u: Unit, key: string, opts: { n?: number; extraTough?: number; echo?: boolean } = {}): SortieSquad {
  const f = fighter(u, { id: u.id, name: unitName(u) || u.unitType, wounds: 1, maxWounds: 1, points: u.points }, key, opts.echo ? 'B' : 'A');
  const names = [...u.rules, ...u.upgrades.map((x) => x.name), ...u.scars.map((x) => x.name)];
  const has = (r: string) => hasRule(names, r);
  const upgrades = u.upgrades.map((x) => x.name);
  const extra = 3 * (countOf(upgrades, 'Tough +3') + countOf(upgrades, 'Toughened Scars') + countOf(upgrades, 'Enhanced'));
  // fighter() counts extra Tough as Defense; here it is wounds on each model instead.
  const defBonus = extra ? f.defBonus / ((f.size * f.tough + extra) / (f.size * f.tough)) : f.defBonus;
  const n = clamp(opts.n ?? f.size, 1, f.size);
  const knack = opts.echo ? 0 : (u.quirks?.includes('hardy') ? 2 : 0) - (u.quirks?.includes('frail') ? 2 : 0) + (SORTIE_TRINKETS[u.trinket ?? '']?.hp ?? 0);
  const tough = Math.max(1, (f.tough + extra) * SORTIE.hpMul + (opts.extraTough ?? 0) + knack);
  const s: SortieSquad = {
    key, name: f.name, unit: u, echo: !!opts.echo, models: modelsOf(u, f, n, tough),
    quality: f.quality, defense: f.defense, defMod: f.defMod, fortified: f.fortified,
    ignore: clamp(1 - (1 - Math.max(f.ignore, has('Resistance') ? 1 / 6 : 0)) / Math.max(0.5, defBonus), 0, 0.5),
    evasive: has('Evasive') ? 1 : 0, stealth: has('Stealth') || has('Ghostly'), meleeEvasion: has('Melee Evasion'),
    impact: (ruleRating(names, 'Impact') ?? 0) + (3 * countOf(upgrades, 'Impact +3') + 6 * countOf(upgrades, 'Impact +6')) / f.size + (has('Momentum') ? 1 : 0),
    hitShoot: f.hitShoot, hitMelee: f.hitMelee, atkBonus: f.atkBonus,
    fast: has('Fast') || has('Flying') || has('Aura of Swiftness'), slow: has('Slow'),
    fearless: has('Fearless'), hero: has('Hero'), turns: Math.max(1, Math.floor((f.tough + extra) / 3)),
    abilities: f.abilities, points: Math.round((u.points * n) / f.size),
    status: {}, cooldowns: {}, engaged: -9, shield: 0, revived: false,
  };
  // Its own auras lift itself (each unit of the party fights on its own).
  for (const e of effects(s.abilities, 'aura')) {
    if (e.stat === 'hit') { s.hitShoot += e.n; s.hitMelee += e.n; }
    if (e.stat === 'save') s.defMod += e.n;
    if (e.stat === 'rate') s.atkBonus *= 1 + e.n;
  }
  return s;
}

const hasRanged = (s: SortieSquad) => s.models.some((m) => m.guns.some((g) => !g.melee));
const hasBlade = (s: SortieSquad) => s.impact > 0 || s.models.some((m) => m.guns.some((g) => g.melee && g.name !== 'Fists'));

export const isFort = (u: Unit) => u.category === 'Fortification';
/** "A", "A and B", "A, B and C". */
export const listText = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
export const memberName = (m: SortieMember) => unitName(m.unit) || m.unit.unitType;
/** A party unit with a model still on its feet. */
export const memberUp = (m: SortieMember) => m.models.some((x) => x.hp > 0);
const allModels = (run: SortieRun) => run.party.flatMap((m) => m.models);

// --- The run -----------------------------------------------------------------------------------------------------

/** A run for a party of units; a Fortification goes to the back of the line. */
export function createRun(
  units: Unit[], seed: number, mode: SortieMode = 'free', length: SortieLength = 'short',
  opts: {
    nemesis?: Record<string, number>; deep?: string[]; tier?: number; weekly?: string; ascension?: number; slain?: Record<string, number>; boons?: string[];
    marks?: SortieMarkId[]; raiders?: Raider[];
  } = {},
): SortieRun {
  const line = [...units.filter((u) => !isFort(u)), ...units.filter(isFort)];
  const run: SortieRun = {
    rng: seed | 0, party: [], mode, length, ranged: false, melee: false, power: squadPower(units), map: [], row: -1, col: 0,
    tough: 0, boons: [], won: 0, xp: 0, haul: { supply: 0, rp: 0, us: 0 }, bossDown: false, depth: 0, screen: 'map', journal: [],
    region: 'ashfields', boss: '', flags: [], seen: [], weaken: 0,
  };
  run.region = pickOf(run, SORTIE_REGIONS).id;
  run.boss = pickOf(run, SORTIE_BOSSES).id;
  // A force with deep regions unlocked can go deep into one of them; a lord with a grudge often waits for it.
  const deep = SORTIE_REGIONS.filter((r) => opts.deep?.includes(r.id));
  if (deep.length) {
    run.region = pickOf(run, deep).id;
    run.deep = true;
  }
  const grudges = SORTIE_BOSSES.filter((b) => opts.nemesis?.[b.id]);
  if (grudges.length && rand(run) < SORTIE.nemesis.odds) run.boss = pickOf(run, grudges).id;
  if (opts.nemesis?.[run.boss]) run.nemesis = opts.nemesis[run.boss];
  const tier = clamp(Math.floor(opts.tier ?? 0), 0, SORTIE.tiers.length - 1);
  if (tier) run.tier = tier;
  if (opts.weekly) run.weekly = opts.weekly;
  const asc = tier === SORTIE.tiers.length - 1 ? clamp(Math.floor(opts.ascension ?? 0), 0, SORTIE.ascension.curses.length) : 0;
  if (asc) run.ascension = asc;
  const marks = opts.weekly ? [] : SORTIE.marks.list.filter((m) => opts.marks?.includes(m.id)).map((m) => m.id);
  if (marks.length) run.marks = marks;
  const slain = Math.min(SORTIE.rematch.tricks.length, (opts.slain?.[run.boss] ?? 0) + (marked(run, 'scarred') ? 1 : 0));
  if (slain) run.rematch = slain;
  if (opts.boons) run.unlocked = [...opts.boons];
  if (tier >= 3) run.sig2 = pickOf(run, SORTIE_BOSSES.filter((b) => b.id !== run.boss && b.sig.id !== bossOf(run).sig.id)).sig.id;
  for (const u of line) {
    const s = squadOf(u, 'p');
    run.ranged ||= hasRanged(s);
    run.melee ||= hasBlade(s);
    const start = marked(run, 'bleed') ? SORTIE.marks.bleed : 1;
    run.party.push({
      unit: structuredClone(u),
      models: s.models.map((m) => ({ hp: Math.max(1, Math.round(m.max * start)), max: m.max })),
      ...(cursed(run, 'frayed') ? { stress: SORTIE.ascension.stress } : {}),
    });
  }
  // The map: each node leads straight on and to one neighbour; the first row is fights, the last before the boss camps.
  const rows = SORTIE.rows[length];
  for (let r = 0; r < rows; r++) {
    const row: SortieNode[] = [];
    for (let c = 0; c < SORTIE.width; c++) {
      let kind: SortieNodeKind = 'fight';
      if (r === rows - 1) kind = 'camp';
      else if (r > 0) {
        let x = rand(run);
        for (const [k, p] of Object.entries(SORTIE.odds) as [SortieNodeKind, number][]) {
          if ((x -= p) < 0) { kind = k; break; }
        }
        if (kind === 'elite' && r < Math.ceil(rows * 0.4)) kind = 'fight';
      }
      const side = c === 0 ? 1 : c === SORTIE.width - 1 ? c - 1 : rand(run) < 0.5 ? c - 1 : c + 1;
      row.push({ row: r, col: c, kind, next: r === rows - 1 ? [0] : [...new Set([c, side])].sort() });
    }
    run.map.push(row);
  }
  // Never two camps, shrines or caches in a row: a node after one is a fight (an elite deep enough in), and so is the
  // row before the camps.
  const benefit = (n: SortieNode) => n.kind === 'camp' || n.kind === 'shrine' || n.kind === 'cache' || n.kind === 'shop';
  for (let r = 1; r < rows - 1; r++) for (const n of run.map[r]) {
    const after = r === rows - 2 || run.map[r - 1].some((p) => benefit(p) && p.next.includes(n.col));
    if (after && benefit(n)) n.kind = r >= Math.ceil(rows * 0.4) && rand(run) < 0.25 ? 'elite' : 'fight';
  }
  // Tier 2: fewer camps on the way.
  if (tier >= 2) for (const n of run.map.slice(1, -1).flat()) if (n.kind === 'camp' && rand(run) < SORTIE.tierTwist.camps) n.kind = 'fight';
  // Mark of Pride: some plain fights past the first row are elites.
  if (marked(run, 'proud')) for (const n of run.map.slice(1).flat()) if (n.kind === 'fight' && rand(run) < SORTIE.marks.proud) n.kind = 'elite';
  run.map.push([{ row: rows, col: 0, kind: 'boss', next: [] }]);
  const affixes = Object.keys(SORTIE.affixes) as SortieAffix[];
  for (const n of run.map.flat()) if (n.kind === 'elite' || (tier >= 5 && n.kind === 'fight')) n.affix = pickOf(run, affixes);
  // Some of the middle of the map is hidden until the party gets near.
  const share = cursed(run, 'dark') ? SORTIE.ascension.hidden : SORTIE.hidden.share;
  for (const n of run.map.slice(1, rows - 1).flat()) if (rand(run) < share) n.hidden = n.veiled = true;
  // Omens of the lord along the road, enough that a party can find the ones it needs.
  if (!marked(run, 'silent')) {
    const middle = run.map.slice(1, rows).flat();
    for (const n of middle) if (rand(run) < SORTIE.omens.share) n.omen = true;
    for (let k = 0; k < 50 && middle.filter((n) => n.omen).length <= SORTIE.omens.need; k++) pickOf(run, middle).omen = true;
  }
  reveal(run);
  note(run, `${listText(run.party.map(memberName))} set out${mode === 'shard' ? ' on a Shard run' : ''} into ${regionName(run)}.`, 'info');
  note(run, run.deep ? regionOf(run).deep.intro : regionOf(run).intro, 'info');
  if (run.nemesis) note(run, `${bossOf(run).name} remembers you, and waits at the end of the road.`, 'bad');
  if (run.rematch) {
    const before = opts.slain?.[run.boss] ? 'has been slain by this force before, and comes back changed' : 'bears the Mark of the Scarred';
    note(run, `${bossOf(run).name} ${before}: ${listText(rematchTricks(run).map((t) => t.name))}.`, 'bad');
  }
  if (marks.length) note(run, `Pact marks (${markHeat(run)} heat, +${Math.round(markHeat(run) * SORTIE.marks.pay * 100)}% pay): ${marksOf(run).map((m) => m.text).join(' ')}`, 'bad');
  if (run.weekly) note(run, `The weekly challenge (${run.weekly}): every force faces this same road this week.`, 'info');
  if (tier) note(run, `${SORTIE.tiers[tier].name}: ${SORTIE.tiers.slice(1, tier + 1).map((t) => t.text).join(' ')}`, 'bad');
  if (asc) note(run, `Ascension ${asc}: ${cursesOf(run).map((x) => x.text).join(' ')}`, 'bad');
  // Marauders from the other armies roam the road (not on the weekly, which every force must face alike).
  if (opts.raiders?.length && !run.weekly) {
    run.raiders = pickRaiders(opts.raiders, SORTIE.raiders.pick, () => rand(run));
    note(run, `Marauders out of ${listText([...new Set(run.raiders.map((m) => m.faction))])} roam this road.`, 'bad');
  }
  return run;
}

export const regionOf = (run: SortieRun): SortieRegion => SORTIE_REGIONS.find((r) => r.id === run.region) ?? SORTIE_REGIONS[0];
/** The region's name, or its deep version's. */
export const regionName = (run: SortieRun) => (run.deep ? regionOf(run).deep.name : regionOf(run).name);
/** The region's story thread followed to its last step. */
export const threadDone = (run: SortieRun) => run.flags.includes(`${run.region}-done`);
/** The run's difficulty tier, and what it pays for it. */
export const tierOf = (run: SortieRun) => run.tier ?? 0;
export const tierPay = (run: SortieRun) =>
  (SORTIE.tiers[tierOf(run)]?.pay ?? 1) + (run.ascension ?? 0) * SORTIE.ascension.pay + markHeat(run) * SORTIE.marks.pay;
/** The pact marks on for the run, whether one is, and their heat. */
export const marksOf = (run: SortieRun) => SORTIE.marks.list.filter((m) => run.marks?.includes(m.id));
export const marked = (run: SortieRun, id: SortieMarkId) => !!run.marks?.includes(id);
export const markHeat = (run: SortieRun) => marksOf(run).reduce((n, m) => n + m.heat, 0);
/** The Ascension curses on for the run, and whether one is. */
export const cursesOf = (run: SortieRun) => SORTIE.ascension.curses.slice(0, run.ascension ?? 0);
export const cursed = (run: SortieRun, id: SortieCurseId) => cursesOf(run).some((x) => x.id === id);
/** A shop price, dearer under that curse. */
export const shopPrice = (run: SortieRun, n: number) => Math.round(n * (cursed(run, 'dear') ? SORTIE.ascension.prices : 1));
/** The odds a fight at a node that started hidden is an ambush: none with a scout standing or the lantern. */
export const ambushOdds = (run: SortieRun) =>
  has(run, 'lantern') || run.party.some((m) => memberUp(m) && voiceKind(m.unit) === 'scout') ? 0 : SORTIE.ambush.odds * (cursed(run, 'hunted') ? SORTIE.ascension.ambush : 1);
/** The lord's signature abilities: its own, and from tier 3 one borrowed from another lord. */
export function sigsOf(run: SortieRun): SortieBoss['sig'][] {
  const extra = run.sig2 ? SORTIE_BOSSES.find((b) => b.sig.id === run.sig2)?.sig : undefined;
  return [...(run.foreseen ? [] : [bossOf(run).sig]), ...(extra ? [extra] : [])];
}

// --- Quirks: habits a unit picks up on runs, which count on a Sortie (and some in Training) -----------------------

/** A quirk's name, text and kind; a region one reads `native:<region>` or `haunted:<region>`. */
export function quirkInfo(id: string): { name: string; text: string; good: boolean; foe: string } | undefined {
  const [kind, region] = id.split(':');
  if (region) {
    const r = SORTIE_REGIONS.find((x) => x.id === region);
    if (!r) return undefined;
    return kind === 'native'
      ? { name: `${r.name}-wise`, text: `+1 to its saves (cover) in ${r.name}.`, good: true, foe: `haunted:${region}` }
      : { name: `Haunted by ${r.name}`, text: `-1 to hit in ${r.name}.`, good: false, foe: `native:${region}` };
  }
  return SORTIE_QUIRKS[id];
}

/** Give a unit a quirk: it drops the opposite one; at the most it can have, it pushes out its oldest quirk of the other
 * kind (a good one pushes out a bad one), or doesn't stick. Returns whether it took. */
export function addQuirk(u: Unit, id: string): boolean {
  const q = quirkInfo(id);
  if (!q || u.quirks?.includes(id)) return false;
  let list = (u.quirks ?? []).filter((x) => x !== q.foe);
  if (list.length >= SORTIE.quirks.max) {
    const i = list.findIndex((x) => quirkInfo(x)?.good !== q.good);
    if (i < 0) return false;
    list = list.filter((_, j) => j !== i);
  }
  u.quirks = [...list, id];
  return true;
}

/** A party squad with this quirk (Echoes have none). */
const quirk = (s: SortieSquad, id: string) => !s.echo && !!s.unit.quirks?.includes(id);
/** A region quirk for where the run is. */
const quirkHere = (run: SortieRun, s: SortieSquad, kind: 'native' | 'haunted') => quirk(s, `${kind}:${run.region}`);

// --- Trinkets and stress ---------------------------------------------------------------------------------------------

/** The trinket a party squad carries (Echoes carry none). */
const trinketOf = (s: SortieSquad) => (s.echo ? undefined : SORTIE_TRINKETS[s.unit.trinket ?? '']);
export const trinketInfo = (id?: string) => (id ? SORTIE_TRINKETS[id] : undefined);

/** Maybe find a trinket. */
function findTrinket(run: SortieRun, chance: number) {
  if (rand(run) >= chance) return;
  const ids = Object.keys(SORTIE_TRINKETS);
  const id = ids[Math.floor(rand(run) * ids.length)];
  (run.trinkets ??= []).push(id);
  note(run, `Found a trinket: ${SORTIE_TRINKETS[id].name} (${SORTIE_TRINKETS[id].text})`, 'good');
}

/** Stress on a party unit, bent by its quirks, trinket and boons (a unit wiped out takes no more); a negative takes it off. */
function stress(run: SortieRun, m: SortieMember, n: number) {
  if (n > 0) {
    if (!memberUp(m)) return;
    const q = m.unit.quirks ?? [];
    n *= (q.includes('steady') ? 0.75 : 1) * (q.includes('shaky') ? 1.25 : 1) * (SORTIE_TRINKETS[m.unit.trinket ?? '']?.stress ?? 1) * (has(run, 'hymn') ? 0.5 : 1);
  }
  m.stress = clamp((m.stress ?? 0) + n, 0, SORTIE.stress.max);
}
const stressAll = (run: SortieRun, n: number) => run.party.forEach((m) => stress(run, m, n));
/** A party squad's member of the run. */
const memberOf = (run: SortieRun, s: SortieSquad) => (s.echo || s.member === undefined ? undefined : run.party[s.member]);
/** A party unit's battle scar, if it has earned it this run. */
const scarred = (run: SortieRun, s: SortieSquad, id: SortieScarId) => !!memberOf(run, s)?.scars?.includes(id);
/** It cracked this round and won't take orders. */
const refusing = (c: SortieCombat, s: SortieSquad) => s.crack?.round === c.round && s.crack.kind === 'refuse';

// --- The weekly challenge -----------------------------------------------------------------------------------------

/** The ISO week a date (YYYY-MM-DD) falls in, like '2026-W43'. */
export function weekKey(date: string): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / (7 * 86400000));
  return `${year}-W${String(week).padStart(2, '0')}`;
}
/** The week's seed: the same for everyone. */
export function weekSeed(key: string): number {
  let h = 2166136261;
  for (const ch of `sortie:${key}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h | 0;
}
/** A weekly run's score: how deep it got, fights won, the lord slain and units still standing. */
export function weeklyScore(run: SortieRun): number {
  const w = SORTIE.weekly;
  return run.depth * w.depth + run.won * w.won + (run.bossDown ? w.boss : 0) + run.party.filter(memberUp).length * w.alive;
}

/** A unit's veteran title from its Sortie record, if it has earned one. */
export function veteranTitle(u: Unit): string | undefined {
  const r = u.sortieRecord;
  if (!r) return undefined;
  const v = SORTIE.veteran;
  const runs = [...v.titles].reverse().find(([n]) => r.runs >= n)?.[1];
  const lord = r.lords >= v.lords ? v.lordTitle : undefined;
  return [runs, lord].filter(Boolean).join(', ') || undefined;
}

/** The relic a finished thread brings home, if the party gets home (or wins). */
export const relicOf = (run: SortieRun): RelicDef | undefined =>
  threadDone(run) && (run.over === 'won' || run.over === 'home') ? RELICS.find((r) => r.sortie === run.region) : undefined;
/** RP for slaying a nemesis, paid on any run. */
export const bountyOf = (run: SortieRun) => (run.bossDown && run.nemesis ? run.nemesis * SORTIE.nemesis.bounty : 0);

/** What kind of unit it is, for the lines it gets in camp and at encounters. */
export function voiceKind(u: Unit): SortieVoiceKind {
  if (isFort(u)) return 'fort';
  if (hasRule(u.rules, 'Caster')) return 'caster';
  if (u.category === 'Hero' || hasRule(u.rules, 'Hero')) return 'hero';
  if (u.category === 'Aircraft' || hasRule(u.rules, 'Aircraft')) return 'flyer';
  if (u.category === 'Vehicle/Monster') return 'big';
  if (['Scout', 'Strider', 'Ambush'].some((r) => hasRule(u.rules, r))) return 'scout';
  return u.size > 1 ? 'squad' : 'solo';
}

/** A line naming a unit of the party (one still standing, unless given). Hashed, not rolled, so it leaves the run's dice alone. */
export function voiceLine(run: SortieRun, ctx: 'camp' | 'event', mem?: SortieMember): string {
  const up = run.party.filter(memberUp);
  if (!up.length && !mem) return '';
  let h = (run.rng ^ (run.row * 977 + run.col * 131 + run.depth * 7)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  const m = mem ?? up[h % up.length];
  const lines = SORTIE_VOICE[voiceKind(m.unit)][ctx];
  return lines[(h >>> 8) % lines.length].split('{name}').join(memberName(m));
}

export const bossOf = (run: SortieRun): SortieBoss => SORTIE_BOSSES.find((b) => b.id === run.boss) ?? SORTIE_BOSSES[0];
/** The tricks a lord slain before comes back with. */
export const rematchTricks = (run: SortieRun) => SORTIE.rematch.tricks.slice(0, run.rematch ?? 0);

/** How far a force has come toward a boon unlock goal. */
export function goalProgress(story: ForceSortie | undefined, goal: SortieGoal): number {
  const st = story?.stats;
  const beasts = Object.entries(story?.bestiary ?? {});
  switch (goal) {
    case 'runs': return st?.runs ?? 0;
    case 'wins': return st?.wins ?? 0;
    case 'flawless': return st?.flawless ?? 0;
    case 'deepest': return st?.deepest ?? 0;
    case 'lords': return beasts.filter(([k]) => k.startsWith('lord:')).reduce((n, [, b]) => n + b.slain, 0);
    case 'beasts': return beasts.filter(([k]) => !k.startsWith('lord:')).length;
    case 'lore': return beasts.filter(([, b]) => b.slain).length;
    case 'tier': return story?.tier ?? 0;
    case 'deep': return story?.deep?.length ?? 0;
    case 'relics': return story?.relics?.length ?? 0;
  }
}

/** A boon unlock goal in words. */
export function goalText(goal: SortieGoal, n: number): string {
  const s = n === 1 ? '' : 's';
  switch (goal) {
    case 'runs': return `Come back from ${n} run${s}`;
    case 'wins': return n === 1 ? 'Win a run' : `Win ${n} runs`;
    case 'flawless': return n === 1 ? 'Win a run with no unit wiped out' : `Win ${n} runs with no unit wiped out`;
    case 'deepest': return `Reach step ${n} on one run`;
    case 'lords': return n === 1 ? 'Slay an Echo lord' : `Slay Echo lords ${n} times`;
    case 'beasts': return `Meet ${n} kinds of Echo`;
    case 'lore': return `Learn the lore of ${n} Echo${s === 's' ? 'es' : ''}`;
    case 'tier': return `Unlock ${SORTIE.tiers[n]?.name ?? `tier ${n}`}`;
    case 'deep': return n === 1 ? 'Follow a region’s story to its end' : `Follow ${n} regions’ stories to their end`;
    case 'relics': return n === 1 ? 'Bring home a relic' : `Bring home ${n} relics`;
  }
}

/** The boons a force's parties may be offered: the starting set, every curse, and those whose goal it has reached. */
export function unlockedBoons(story: ForceSortie | undefined): SortieBoonId[] {
  return (Object.keys(SORTIE_BOONS) as SortieBoonId[]).filter((id) => {
    const u = SORTIE.unlocks[id];
    return SORTIE_BOONS[id].curse || SORTIE.boonsAtStart.includes(id) || !u || goalProgress(story, u.goal) >= u.n;
  });
}

/** Whether a party unit is in the middle of its last stand. */
export const lastStanding = (c: SortieCombat, s: SortieSquad) => s.stand !== undefined && c.round - s.stand < SORTIE.lastStand.rounds;

/** After a hit: a party unit down to its last model, or a lone model down to a third of its wounds, may make its last stand. */
function lastStand(run: SortieRun, s: SortieSquad, alive0: number, hp0: number) {
  const c = run.combat;
  if (!c || s.echo || s.stand !== undefined || !standing(s) || marked(run, 'fuse')) return;
  const up = active(s);
  const lone = s.models.length === 1 && hp0 * 3 > maxOf(s) && hpOf(s) * 3 <= maxOf(s);
  if (!(lone || (alive0 > 1 && up.length === 1))) return;
  if (rand(run) >= SORTIE.lastStand.odds) return;
  s.stand = c.round;
  for (const m of up) m.shaken = false;
  const mem = memberOf(run, s);
  log(c, mem ? standLine(run, mem) : `${s.name} makes a last stand!`, 'good');
  log(c, `Last stand: ${s.name} hits at +1 with ${SORTIE.lastStand.mul}× the attacks and takes no morale tests, this round and the next.`, 'good');
  note(run, `${s.name} made a last stand against ${c.kind === 'boss' ? bossOf(run).name : 'the Echoes'}.`, 'good');
}

/** A last-stand line that fits the unit. Hashed, so it leaves the run's dice alone. */
function standLine(run: SortieRun, mem: SortieMember): string {
  const lines = SORTIE_STAND[voiceKind(mem.unit)];
  const h = Math.abs((run.rng ^ (run.depth * 131 + (run.combat?.round ?? 0) * 17)) | 0);
  return lines[h % lines.length].split('{name}').join(memberName(mem));
}
/** The region's last word on how the run ended. */
export const epilogueOf = (run: SortieRun) => {
  const e = regionOf(run).epilogue;
  return run.over === 'won' ? e.won : run.over === 'home' || run.over === 'quit' ? e.home : run.over ? e.fell : '';
};

/** The next encounter: a story thread's next step most likely, then the region's own, then a common one. */
function pickEvent(run: SortieRun): SortieEvent {
  const w = SORTIE.storyWeight;
  const pool: [SortieEvent, number][] = [
    ...regionOf(run).events
      .filter((e) => !run.seen.includes(e.id) && (!e.after || run.flags.includes(e.after)))
      .map((e): [SortieEvent, number] => [e, e.after ? w.next : w.region]),
    ...SORTIE_EVENTS.filter((e) => !run.seen.includes(e.id)).map((e): [SortieEvent, number] => [e, w.common]),
  ];
  if (!pool.length) return pickOf(run, SORTIE_EVENTS);
  let x = rand(run) * pool.reduce((n, [, k]) => n + k, 0);
  for (const [e, k] of pool) if ((x -= k) < 0) return e;
  return pool[pool.length - 1][0];
}

const note = (run: SortieRun, text: string, tone: SortieTone = 'info') => run.journal.push({ text, tone });

/** Nodes the party can go to next. */
export function reachable(run: SortieRun): SortieNode[] {
  if (run.screen !== 'map' || run.over) return [];
  if (run.row < 0) return run.map[0];
  return run.map[run.row][run.col].next.map((c) => run.map[run.row + 1][c]);
}

/** How many steps ahead the party sees: one more with a scout in it, and with the lantern. */
export const sightOf = (run: SortieRun) =>
  SORTIE.hidden.sight + (run.party.some((m) => memberUp(m) && voiceKind(m.unit) === 'scout') ? 1 : 0) + (has(run, 'lantern') ? 1 : 0);

/** Show the hidden nodes within sight of where the party stands. */
export function reveal(run: SortieRun) {
  let front = run.row < 0 ? run.map[0] : [run.map[run.row][run.col]];
  if (run.row < 0) for (const n of front) n.hidden = false;
  for (let k = run.row < 0 ? 1 : 0; k < sightOf(run); k++) {
    front = [...new Set(front.flatMap((n) => n.next.map((c) => run.map[n.row + 1]?.[c]).filter((x): x is SortieNode => !!x)))];
    for (const n of front) n.hidden = false;
  }
}

export function enterNode(run: SortieRun, book: CatalogBook, node: SortieNode) {
  if (!reachable(run).includes(node)) throw new Error('Not a step you can take from here.');
  run.row = node.row;
  run.col = node.col;
  if (node.hidden) node.hidden = false;
  reveal(run);
  if (node.omen) readOmen(run, node);
  const flavor = regionOf(run).flavor;
  run.scene = node.kind === 'shrine' || node.kind === 'boss' ? undefined : pickOf(run, flavor[node.kind]);
  if (node.kind === 'camp') run.scene = `${run.scene} ${voiceLine(run, 'camp')}`.trim();
  if (node.kind === 'shrine') run.scene = voiceLine(run, 'event') || undefined;
  if (node.kind === 'fight' || node.kind === 'elite') {
    const odds = node.veiled ? ambushOdds(run) : 0;
    const ambush = odds > 0 && rand(run) < odds;
    const raid = !!run.raiders?.length && rand(run) < (ambush ? SORTIE.raiders.ambush : SORTIE.raiders.odds);
    return startCombat(run, book, node.kind, node.affix, ambush, raid);
  }
  if (node.kind === 'boss') return startCombat(run, book, node.kind, node.affix);
  if (node.kind === 'camp') return void (run.screen = 'camp');
  if (node.kind === 'shop') return openShop(run);
  if (node.kind === 'cache') {
    gain(run, SORTIE.haul.cache);
    run.offer = { boons: boonOffer(run, 3) };
    run.screen = 'reward';
    note(run, `${run.scene} A cache of old supplies (+${SORTIE.haul.cache.supply} Supply).`, 'info');
    return findTrinket(run, SORTIE.trinkets.cache);
  }
  const ev = pickEvent(run);
  run.seen.push(ev.id);
  run.event = { id: ev.id };
  run.screen = 'event';
}

/** Read an omen at a node: enough of them take away one of the lord's tricks. */
function readOmen(run: SortieRun, node: SortieNode) {
  node.omen = false;
  const boss = bossOf(run);
  const n = (run.omens = (run.omens ?? 0) + 1);
  if (n > SORTIE.omens.need) return;
  note(run, `Omen: ${boss.omens[n - 1]}`, 'info');
  if (n < SORTIE.omens.need) return;
  if (run.rematch) {
    const t = rematchTricks(run)[run.rematch - 1];
    run.rematch = run.rematch - 1 || undefined;
    note(run, `The omens add up: ${boss.name} has lost its ${t.name} trick.`, 'good');
  } else {
    run.foreseen = true;
    note(run, `The omens add up: the party knows ${boss.name}’s ${boss.sig.name}, and it won’t work on them.`, 'good');
  }
}

/** A node done: back to the map. */
function onward(run: SortieRun) {
  run.depth++;
  run.screen = 'map';
  run.offer = undefined;
  run.event = undefined;
  run.shop = undefined;
  run.scene = undefined;
}

/** Add to the haul: Supply to spend at shops on any run; only a Shard run brings it home. */
export function gain(run: SortieRun, h: Partial<SortieHaul>) {
  run.haul.supply += h.supply ?? 0;
  run.haul.rp += h.rp ?? 0;
  run.haul.us = Math.min(SORTIE.haul.maxUs, run.haul.us + (h.us ?? 0));
}

// --- Rewards, camps and shrines ----------------------------------------------------------------------------------

/** Some boons the party could still take: commons mostly, a rare now and then (always one with 'rare'), or curses. */
function boonOffer(run: SortieRun, n: number, kind: 'any' | 'rare' | 'curse' = 'any'): SortieBoonId[] {
  const pool = (Object.keys(SORTIE_BOONS) as SortieBoonId[]).filter((id) => {
    const b = SORTIE_BOONS[id];
    return !run.boons.includes(id) && (b.curse || !run.unlocked || run.unlocked.includes(id)) && (run.ranged || !b.ranged) && (run.melee || !b.melee) && (run.mode === 'shard' || !b.shard) && !b.curse === (kind !== 'curse');
  });
  const take = (ids: SortieBoonId[]) => {
    const id = ids[Math.floor(rand(run) * ids.length)];
    pool.splice(pool.indexOf(id), 1);
    return id;
  };
  const out: SortieBoonId[] = [];
  if (kind === 'rare' && pool.some((id) => SORTIE_BOONS[id].rare)) out.push(take(pool.filter((id) => SORTIE_BOONS[id].rare)));
  while (out.length < n && pool.length) {
    const rare = pool.filter((id) => SORTIE_BOONS[id].rare);
    const common = pool.filter((id) => !SORTIE_BOONS[id].rare);
    out.push(take(rare.length && (!common.length || rand(run) < SORTIE.rareChance) ? rare : common));
  }
  return out;
}

function addBoon(run: SortieRun, id: SortieBoonId) {
  run.boons.push(id);
  if (id === 'hide') toughen(run, SORTIE.hpMul);
  if (id === 'lantern') {
    for (const n of run.map.flat()) n.hidden = false;
  }
  note(run, `Boon: ${SORTIE_BOONS[id].name}.`, 'good');
}

/** Extra wounds on every model of the party. */
function toughen(run: SortieRun, n: number) {
  run.tough += n;
  for (const m of allModels(run)) {
    m.max += n;
    if (m.hp > 0) m.hp += n;
  }
}

/** Mend a share of every standing model's wounds. */
function heal(run: SortieRun, share: number) {
  for (const m of allModels(run)) if (m.hp > 0) m.hp = Math.min(m.max, m.hp + Math.ceil(m.max * share));
}

/** Fallen models a unit still in the fight can get back on their feet; a unit wiped out stays down. */
const downOf = (m: SortieMember) => (memberUp(m) ? m.models.filter((x) => x.hp <= 0) : []);

/** Bring fallen models back with a quarter of their wounds, up to `n` of them (most hurt unit first). Returns how many. */
function revive(run: SortieRun, n: number, members = run.party): number {
  let done = 0;
  for (const mem of [...members].sort((a, b) => downOf(b).length / b.models.length - downOf(a).length / a.models.length)) {
    for (const m of downOf(mem)) {
      if (done >= n) return done;
      m.hp = Math.max(1, Math.ceil(m.max / 4));
      done++;
    }
  }
  return done;
}

/** Take an offered boon (or skip them with null). */
export function pickBoon(run: SortieRun, i: number | null) {
  if (run.screen !== 'reward' || !run.offer) return;
  const id = i === null ? undefined : run.offer.boons[i];
  if (id) addBoon(run, id);
  onward(run);
}

/** Instead of a boon after a fight: every model mends some of its wounds, and one fallen model gets back up. */
export function patchUp(run: SortieRun) {
  if (run.screen !== 'reward' || !run.offer?.patch) return;
  heal(run, SORTIE.patch);
  stressAll(run, -SORTIE.stress.patch);
  const up = revive(run, 1);
  note(run, `Patched up${up ? ', and a fallen model gets back up' : ''}.`, 'good');
  onward(run);
}

/** How many fallen a camp brings back to a unit: a share of it, at least one. */
const raiseOf = (m: SortieMember) => Math.min(downOf(m).length, Math.max(1, Math.round(m.models.length * SORTIE.raise)));
/** How many fallen a camp brings back across the party. */
export const campRaise = (run: SortieRun) => run.party.reduce((n, m) => n + raiseOf(m), 0);

/** Every model standing mends some of its wounds, and some of the fallen get back up. */
export function campRest(run: SortieRun) {
  if (run.screen !== 'camp') return;
  heal(run, SORTIE.rest * (cursed(run, 'thin') ? SORTIE.ascension.rest : 1));
  stressAll(run, -SORTIE.stress.camp);
  const up = run.party.reduce((n, m) => n + revive(run, raiseOf(m), [m]), 0);
  note(run, `Camp: the party rests${up === 1 ? ', and a fallen model gets back up' : up ? `, and ${up} fallen get back up` : ''}.`, 'good');
  onward(run);
}

/** Head home from a camp, keeping the haul. */
export function campHome(run: SortieRun) {
  if (run.screen !== 'camp') return;
  note(run, 'The party heads home.', 'info');
  endRun(run, 'home');
}

/** A shop: a few boons for Supply, and patching up. */
function openShop(run: SortieRun) {
  const { boon, rare, boons } = SORTIE.shop;
  run.shop = { boons: boonOffer(run, boons).map((id) => ({ id, price: shopPrice(run, SORTIE_BOONS[id].rare ? rare : boon) })) };
  run.screen = 'shop';
  note(run, run.scene ?? 'A shop.', 'info');
}

export function shopBuy(run: SortieRun, i: number) {
  const item = run.shop?.boons[i];
  if (run.screen !== 'shop' || !item || item.sold || run.haul.supply < item.price) return;
  run.haul.supply -= item.price;
  item.sold = true;
  addBoon(run, item.id);
}

export function shopHeal(run: SortieRun) {
  if (run.screen !== 'shop' || !run.shop || run.shop.healed || run.haul.supply < shopPrice(run, SORTIE.shop.heal)) return;
  run.haul.supply -= shopPrice(run, SORTIE.shop.heal);
  run.shop.healed = true;
  heal(run, SORTIE.shop.healShare);
  stressAll(run, -SORTIE.stress.patch);
  note(run, 'Bought field dressings: the party mends.', 'good');
}

export function leaveShop(run: SortieRun) {
  if (run.screen === 'shop') onward(run);
}

export const eventOf = (run: SortieRun) => [...regionOf(run).events, ...SORTIE_EVENTS].find((e) => e.id === run.event?.id);

/** A shrine choice the party can take: a unit still standing has the rule or weapon asked for. */
export function choiceOpen(run: SortieRun, c: SortieChoice): boolean {
  if (!c.needs) return true;
  const up = run.party.filter(memberUp);
  return c.needs.some((n) =>
    n === 'ranged' ? run.ranged
      : n === 'melee' ? run.melee
        : n === 'squad' ? up.some((m) => m.models.length > 1 && downOf(m).length > 0)
          : n === 'solo' ? up.some((m) => m.models.length === 1)
            : up.some((m) => hasRule(m.unit.rules, n)),
  );
}

export function eventChoose(run: SortieRun, i: number) {
  const ev = eventOf(run);
  const c = ev?.choices[i];
  if (run.screen !== 'event' || !ev || !c || run.event!.result !== undefined || !choiceOpen(run, c)) return;
  const o = c.chance === undefined || rand(run) < c.chance ? c.win : c.fail ?? c.win;
  const lead = c.needs && run.party.filter(memberUp).find((m) => c.needs!.some((n) => hasRule(m.unit.rules, n)));
  run.event!.result = `${lead ? `${memberName(lead)} leads the way. ` : ''}${outcome(run, o)}`;
  if (ev.id === regionOf(run).finale && !threadDone(run)) run.flags.push(`${run.region}-done`);
  note(run, `${ev.name}: ${run.event!.result}`, o === c.fail ? 'bad' : 'info');
  if (o === c.fail) stressAll(run, SORTIE.stress.fail);
  else if (!o.fight && !o.hurt) findTrinket(run, SORTIE.trinkets.event);
  if (o.fight) run.event!.then = 'fight';
}

/** Leave a shrine once its outcome is read. */
export function leaveEvent(run: SortieRun, book: CatalogBook) {
  if (run.screen !== 'event' || run.event?.result === undefined) return;
  if (run.event.then === 'fight') return startCombat(run, book, 'fight');
  onward(run);
}

function outcome(run: SortieRun, o: SortieOutcome): string {
  const bits = [o.text];
  if (o.boon || o.rare) {
    const id = boonOffer(run, 1, o.rare ? 'rare' : 'any')[0];
    if (id) { addBoon(run, id); bits.push(`Boon: ${SORTIE_BOONS[id].name}.`); }
  }
  if (o.flag && !run.flags.includes(o.flag)) run.flags.push(o.flag);
  if (o.weaken) {
    run.weaken = Math.min(SORTIE.maxWeaken, run.weaken + o.weaken);
    bits.push(`${bossOf(run).name} will start the fight ${Math.round(run.weaken * 100)}% down.`);
  }
  if (o.curse) {
    const id = boonOffer(run, 1, 'curse')[0];
    if (id) { addBoon(run, id); bits.push(`${SORTIE_BOONS[id].name}: ${SORTIE_BOONS[id].text}`); }
    else bits.push('Nothing more it can give you.');
    stressAll(run, SORTIE.stress.hurt);
  }
  if (o.tough) { toughen(run, o.tough * SORTIE.hpMul); bits.push(`+${o.tough} Tough.`); }
  if (o.heal) heal(run, o.heal);
  if (o.revive) {
    const n = revive(run, o.revive);
    if (n) bits.push(`${n} fallen back on their feet.`);
  }
  if (o.hurt) {
    let n = o.hurt * SORTIE.hpMul;
    while (n-- > 0) {
      // A shrine never finishes a unit off: the last wound of a unit's last model is spared.
      const up = run.party.flatMap((mem) => {
        const left = mem.models.filter((m) => m.hp > 0);
        return left.filter((m) => left.length > 1 || m.hp > 1);
      });
      if (!up.length) break;
      pickOf(run, up).hp--;
    }
    bits.push(`${o.hurt * SORTIE.hpMul} wounds.`);
    stressAll(run, SORTIE.stress.hurt);
  }
  if (o.supply || o.rp) {
    gain(run, { supply: o.supply, rp: o.rp });
    bits.push(`+${[o.supply ? `${o.supply} Supply` : '', o.rp ? `${o.rp} RP` : ''].filter(Boolean).join(', ')}.`);
  }
  return bits.join(' ');
}

// --- Fights ------------------------------------------------------------------------------------------------------

/**
 * Points misjudge how a party fares here (brawlers do better than on a table, long guns worse, and a lone monster has
 * a hard time against a lord with escorts), so before its first fight of each kind the Echoes size it up: they try
 * fights of that kind against the fresh party at a few sizes and settle on the one it comes out of with about
 * `SORTIE.sizeUp.left` of its wounds. The same party always gets the same answer, so it's cached.
 */
const sizedUp = new WeakMap<CatalogBook, Map<string, number>>();
export function sizeUp(units: Unit[], book: CatalogBook, kind: SortieFightKind = 'fight', boss?: string): number {
  const cache = sizedUp.get(book) ?? new Map<string, number>();
  sizedUp.set(book, cache);
  const key = JSON.stringify({ units: units.map((u) => ({ ...u, id: '', name: '' })), kind, boss });
  const known = cache.get(key);
  if (known !== undefined) return known;
  const { tries, steps, min, max } = SORTIE.sizeUp;
  let lo = Math.log(min);
  let hi = Math.log(max);
  for (let step = 0; step < steps; step++) {
    const mid = (lo + hi) / 2;
    let kept = 0;
    for (let i = 0; i < tries; i++) {
      const t = createRun(units, 104729 + 7919 * i);
      t.scale = { [kind]: Math.exp(mid) };
      if (boss) t.boss = boss;
      t.row = 0;
      startCombat(t, book, kind);
      for (let n = 0; n < 3000 && !t.combat!.over; n++) autoMove(t);
      const c = t.combat!;
      if (c.over === 'won') kept += c.party.reduce((n, p) => n + hpOf(p), 0) / c.party.reduce((n, p) => n + maxOf(p), 0);
    }
    if (kept / tries > SORTIE.sizeUp.left[kind]) lo = mid;
    else hi = mid;
  }
  // The last size it came through, not the midpoint: a few points more can let a bigger lord in.
  const scale = Math.exp(lo);
  cache.set(key, scale);
  return scale;
}

/** What a fight of this kind on this row may spend on Echoes. The boss was sized up as it stands, so it doesn't climb. */
export function fightBudget(run: SortieRun, book: CatalogBook, kind: SortieFightKind, row = run.row): number {
  run.scale ??= {};
  const scale = (run.scale[kind] ??= sizeUp(run.party.map((m) => m.unit), book, kind, kind === 'boss' ? run.boss : undefined));
  const climb = kind === 'boss' ? 0 : (SORTIE.ramp * Math.max(0, row)) / Math.max(1, run.map.length - 2);
  const t = tierOf(run);
  const twist = (t >= 1 && kind === 'elite' ? SORTIE.tierTwist.elite : 1) * (t >= 4 ? SORTIE.tierTwist.fights : 1)
    * (kind !== 'boss' && cursed(run, 'swollen') ? SORTIE.ascension.fights : 1);
  return run.power * scale * (SORTIE.budget + climb) * (run.deep ? SORTIE.deep.budget : 1) * twist;
}

/**
 * Echo squads to `budget` points, trimmed model by model; a boss fight is led by a hero or a big monster. A named lord
 * leads it whatever it costs (the fight scales its wounds to fit, see lordScale), and the rest of the budget is escorts.
 */
export function echoSquads(book: CatalogBook, budget: number, kind: SortieFightKind, r: Rand, lord?: string): Unit[] {
  const out: { u: Unit; n: number }[] = [];
  let left = budget;
  const take = (cu: CatalogUnit, max = left) => {
    const l = [applySelection(cu, randomSelection(cu, r)), applySelection(cu, {})].find((x) => x.cost > 0 && x.cost / cu.size <= max);
    if (!l) return false;
    const n = Math.min(cu.size, Math.floor(max / (l.cost / cu.size)));
    out.push({ u: unitFromCatalog(cu, l, book), n });
    left -= (l.cost * n) / cu.size;
    return true;
  };
  const units = book.units.filter((cu) => cu.cost > 0);
  const named = kind === 'boss' && lord ? units.find((cu) => cu.name === lord) : undefined;
  if (named) {
    take(named, named.cost);
    left = Math.max(0, budget - named.cost * lordScale(budget, named.cost));
  } else if (kind === 'boss') {
    const leads = units.filter((cu) => hasRule(cu.rules, 'Hero') || (ruleRating(cu.rules, 'Tough') ?? 1) >= 6).sort((a, b) => b.cost - a.cost);
    const lead = leads.find((cu) => cu.cost <= budget * 0.7) ?? leads[leads.length - 1];
    if (lead) take(lead, Math.max(left * 0.7, lead.cost));
  }
  // Big Echoes only join fights big enough to hold them, so a pricey unit isn't sized up against a capped fight.
  const small = units.filter((cu) => cu.cost <= Math.max(BIG_UNIT, budget * 0.5));
  for (let misses = 0; out.length < SORTIE.squads && misses < 40 && small.length; ) {
    const cu = small[Math.floor(r() * small.length)];
    if (!take(cu)) misses++;
  }
  if (!out.length && units.length) {
    const cheapest = [...units].sort((a, b) => a.cost / a.size - b.cost / b.size)[0];
    take(cheapest, cheapest.cost / cheapest.size);
  }
  return out.map(({ u, n }) => {
    // Trimmed squads carry their size in points; the datasheet keeps its own.
    u.points = Math.round((u.points * n) / u.size);
    u.size = n;
    return u;
  });
}

export const fightTitle: Record<SortieFightKind, string> = { fight: 'Echo pack', elite: 'Elite Echoes', boss: 'Echo lord' };

/** How far a named lord's wounds stretch or shrink to take its share of the boss fight's budget. */
const lordScale = (budget: number, cost: number) => clamp((budget * 0.7) / Math.max(1, cost), 0.3, 3);

const log = (c: SortieCombat, text: string, tone: SortieTone = 'info') => c.log.push({ text, tone });
const has = (run: SortieRun, b: SortieBoonId) => run.boons.includes(b);
const statusOn = (c: SortieCombat, s: SortieSquad, st: Status) => (s.status[st] ?? -1) >= c.round;
/** The Echo squads on the field, closest first. */
export const onField = (c: SortieCombat) => c.enemies.filter((e) => standing(e) && !e.arrives).sort((a, b) => distOf(a) - distOf(b));
export const distOf = (e: SortieSquad) => e.dist ?? 1;
export const slotOf = (s: SortieSquad) => s.slot ?? 0;
export const DISTANCES = ['', 'Close', 'Mid', 'Far'];
export const SLOTS = ['Front', 'Middle', 'Back'];
/** "Close", "Close or Mid", "any distance". */
export const reachText = (reach: number) => (reach >= SORTIE.ranks ? 'any distance' : reach === 1 ? 'Close' : `Close or ${DISTANCES[reach]}`);
const squadByKey = (c: SortieCombat, key: string) => c.party.find((p) => p.key === key) ?? c.enemies.find((e) => e.key === key);
/** The party's units still in the fight, front to back. */
export const partyLine = (c: SortieCombat) => c.party.filter((p) => standing(p) && p.slot !== undefined).sort((a, b) => slotOf(a) - slotOf(b));
/** The unit at the front of the line. */
export const frontOf = (c: SortieCombat): SortieSquad | undefined => partyLine(c)[0];
/** A party unit acts turn by turn, not by orders: a lone model or a Hero. */
export const perTurn = (s: SortieSquad) => s.models.length === 1 || s.hero;
/** The party unit the game waits on. */
export const actingSquad = (run: SortieRun) => (run.combat?.acting ? run.combat.party.find((p) => p.key === run.combat!.acting) : undefined);

/**
 * The furthest distance a gun reaches. An Echo's is its raw reach, to set against its distance plus the slot of the
 * unit it aims at; a party unit's is counted from its slot (so a short gun at the back may reach nothing).
 */
export function gunReach(run: SortieRun, s: SortieSquad, g: Gun): number {
  const c = run.combat;
  if (g.melee) return s.echo || slotOf(s) === 0 ? 1 : 0;
  if (!s.echo && c && c.outflank[s.key] === c.round) return SORTIE.ranks;
  const band = SORTIE.ranges.find(([r]) => g.range <= r)?.[1] ?? SORTIE.ranks;
  if (s.echo) return band;
  return clamp(band + (has(run, 'cells') ? 1 : 0) + (has(run, 'spotter') && slotOf(s) === 2 ? 1 : 0) - slotOf(s), 0, SORTIE.ranks);
}
export const chargeReach = (run: SortieRun, s: SortieSquad) => SORTIE.chargeReach + (!s.echo && has(run, 'packs') ? 1 : 0);

const healOf = (s: SortieSquad) => SORTIE.hpMul * Math.max(1, effects(s.abilities, 'heal').reduce((n, e) => n + e.n, 0)) * 2;
const shieldOf = (s: SortieSquad) => SORTIE.hpMul * Math.max(1, effects(s.abilities, 'shield').reduce((n, e) => n + e.n, 0)) + active(s).length;
const barrageOf = (s: SortieSquad) => {
  const list = effects(s.abilities, 'barrage');
  return { hits: Math.max(2, 2 * list.reduce((n, e) => n + e.hits, 0)), ap: Math.max(0, ...list.map((e) => e.ap)) };
};
const fieldOf = (s: SortieSquad): 'slow' | 'daze' => effects(s.abilities, 'field')[0]?.status ?? 'daze';
const sourceOf = (s: SortieSquad, k: 'heal' | 'shield' | 'barrage' | 'field' | 'redeploy') => effects(s.abilities, k)[0]?.source;

/** Give the units still standing their slots front to back, in the order they hold, a Fortification last. */
function closeRanks(c: SortieCombat) {
  const fort = (p: SortieSquad) => (isFort(p.unit) ? 1 : 0);
  const line = c.party.filter(standing).sort((a, b) => fort(a) - fort(b) || (a.slot ?? 9) - (b.slot ?? 9));
  for (const p of c.party) if (!line.includes(p)) p.slot = undefined;
  line.forEach((p, i) => (p.slot = i));
}

/** The line turns: the front falls back, everyone else steps up. A Fortification holds the back. */
function rotate(run: SortieRun, c: SortieCombat) {
  const line = partyLine(c).filter((p) => !isFort(p.unit));
  if (line.length < 2) return;
  const back = line.shift()!;
  line.push(back);
  if (has(run, 'dressing')) {
    const n = mend(back, active(back).reduce((x, m) => x + Math.ceil(m.max / 6), 0));
    if (n) log(c, `${back.name} dress their wounds: mended ${n}.`, 'good');
  }
  line.forEach((p, i) => (p.slot = i));
  closeRanks(c);
  log(c, `The line turns: ${partyLine(c).map((p, i) => `${p.name} ${SLOTS[i].toLowerCase()}`).join(', ')}.`, 'info');
}

/** The slot each unit standing will hold once the line next turns, by squad key. */
export function nextSlots(c: SortieCombat): Record<string, number> {
  const line = partyLine(c);
  const turn = line.filter((p) => !isFort(p.unit));
  const order = turn.length < 2 ? line : [...turn.slice(1), turn[0], ...line.filter((p) => isFort(p.unit))];
  return Object.fromEntries(order.map((p, i) => [p.key, i]));
}

/** On the map, between fights: move a party member one place along the line. A Fortification keeps the Back. */
export function moveMember(run: SortieRun, i: number, dir: -1 | 1): boolean {
  const j = i + dir;
  const p = run.party;
  if (run.screen !== 'map' || run.over || !p[i] || !p[j] || isFort(p[i].unit) || isFort(p[j].unit)) return false;
  [p[i], p[j]] = [p[j], p[i]];
  return true;
}

export function startCombat(run: SortieRun, book: CatalogBook, kind: SortieFightKind, affix?: SortieAffix, ambush = false, raid = false) {
  const budget = fightBudget(run, book, kind);
  const boss = kind === 'boss' ? bossOf(run) : undefined;
  // Marauders: a band out of the other armies in the app instead of the Echoes (never the lord's fight).
  const band = raid && kind !== 'boss' && run.raiders?.length ? raidBand(run.raiders, budget, SORTIE.squads, () => rand(run)) : [];
  const echoes = band.length ? band.map((b) => b.unit) : echoSquads(book, budget, kind, () => rand(run), boss?.unit);
  const party = run.party.map((mem, i) => {
    const s = squadOf(mem.unit, `p${i}`, { extraTough: run.tough + (mem.scars?.includes('survivor') ? SORTIE.hpMul : 0) });
    if (mem.scars?.includes('headhunter')) s.atkBonus *= SORTIE.scars.headhunter.mul!;
    s.models.forEach((m, j) => (m.hp = mem.models[j]?.hp ?? m.max));
    s.member = i;
    s.slot = i;
    return s;
  });
  const enemies = echoes.map((u, i) => {
    const s = squadOf(u, `e${i}`, { echo: true });
    if (band[i]) s.raider = `${band[i].raider.faction}${band[i].raider.force ? `, of ${band[i].raider.force}` : ''}`;
    if (hasRule(u.rules, 'Ambush')) s.arrives = 2;
    if (marked(run, 'fierce')) s.atkBonus *= SORTIE.marks.fierce;
    return s;
  });
  // Where they stand: Scouts and brawlers Close, short guns Mid, long guns Far.
  for (const s of enemies) {
    const longest = Math.max(0, ...s.models.flatMap((m) => m.guns.filter((g) => !g.melee).map((g) => g.range)));
    const brawler = output(s, true) >= output(s, false);
    s.dist = hasRule(s.unit.rules, 'Scout') || brawler ? 1 : longest <= SORTIE.ranges[0][0] ? 2 : 3;
  }
  // Nobody standing Close: the nearest squad steps up.
  const near = Math.min(...enemies.filter((e) => !e.arrives).map(distOf));
  if (near > 1) for (const e of enemies) if (!e.arrives && distOf(e) === near) e.dist = near - 1;
  run.combat = { kind, round: 0, party, enemies, queue: [], orders: {}, cast: {}, outflank: {}, moved: [], kills: 0, log: [] };
  run.screen = 'combat';
  const c = run.combat;
  closeRanks(c);
  if (run.scene) log(c, run.scene, 'info');
  const lord = boss && enemies[0]?.unit.unitType === boss.unit ? enemies[0] : undefined;
  if (boss && lord) {
    // The lord takes its share of the budget in wounds, less what the party's story choices took off it.
    // A nemesis comes back tougher for every party of the force it has beaten.
    const mul = lordScale(budget, echoes[0].points) * (1 + SORTIE.nemesis.tough * (run.nemesis ?? 0)) * (cursed(run, 'grim') ? SORTIE.ascension.lord : 1);
    const short = 1 - Math.min(run.weaken, SORTIE.maxWeaken);
    for (const m of lord.models) {
      m.max = Math.max(1, Math.round(m.max * mul));
      m.hp = Math.max(1, Math.round(m.max * short));
    }
    lord.name = boss.name;
    lord.arrives = undefined;
    lord.dist = 1;
    c.lord = lord.key;
    if (sigsOf(run).some((s) => s.id === 'brood')) {
      const cu = book.units.find((u) => u.name === 'Fiends');
      if (cu) c.brood = unitFromCatalog(cu, applySelection(cu, {}), book);
    }
    // A lord slain before comes back with a trick for each time.
    if (run.rematch) {
      if (run.rematch >= 1) lord.defMod += SORTIE.rematch.def;
      if (run.rematch >= 2) lord.atkBonus *= SORTIE.rematch.atk;
    }
    log(c, run.nemesis ? boss.taunt : boss.intro, 'bad');
    if (run.rematch) {
      log(c, boss.rematch[run.rematch - 1], 'bad');
      for (const t of rematchTricks(run)) log(c, `${t.name}: ${t.text}`, 'bad');
    }
    if (run.nemesis) log(c, `Nemesis: ${Math.round(SORTIE.nemesis.tough * run.nemesis * 100)}% more wounds, and a bounty of ${run.nemesis * SORTIE.nemesis.bounty} RP on its head.`, 'bad');
    for (const sig of sigsOf(run)) log(c, `${sig.name}: ${sig.text}`, 'bad');
    if (run.weaken) log(c, `${boss.name} comes into the fight already hurt.`, 'good');
  }
  if (affix) {
    c.affix = affix;
    for (const e of enemies) {
      if (affix === 'armoured') e.defMod += 1;
      if (affix === 'swift') e.fast = true;
      if (affix === 'frenzied') e.atkBonus *= 1.25;
      if (affix === 'shrouded') e.stealth = true;
    }
    log(c, `${SORTIE.affixes[affix].name}: ${SORTIE.affixes[affix].text}`, 'bad');
  }
  log(c, `${boss ? boss.name : band.length ? 'Marauders' : fightTitle[kind]}: ${enemies.map((e) => `${e.models.length > 1 ? `${e.models.length} ` : ''}${e.name}${e.arrives ? ' (in ambush)' : ''}`).join(', ')}.`, 'info');
  for (const b of band.filter((x, i) => x.raider.force && band.findIndex((y) => y.raider === x.raider) === i)) {
    log(c, `That's ${unitName(b.unit)} out of ${b.raider.force}'s army! Gone raiding, it seems.`, 'bad');
  }
  if (band.length) note(run, `Marauders: ${listText([...new Set(band.map((b) => `${unitName(b.unit)} (${b.raider.faction})`))])}.`, 'bad');
  if (ambush) {
    c.ambush = true;
    log(c, `Ambush! The ${band.length ? 'Marauders' : 'Echoes'} were waiting, and strike first this round.`, 'bad');
    note(run, `Ambushed by ${listText([...new Set(enemies.map((e) => e.name))])}.`, 'bad');
  }
  if (has(run, 'banner')) for (const p of partyLine(c)) p.shield = active(p).length;
  if (has(run, 'pact')) {
    for (const m of partyLine(c).flatMap(active)) m.hp = Math.max(1, m.hp - Math.ceil(m.max / 6));
    log(c, 'The Void Pact takes its due.', 'bad');
  }
  newRound(run);
}

/** Rough offence of a squad's weapons of one kind, to place the squads and pick a line. */
function output(s: SortieSquad, melee: boolean): number {
  return active(s).reduce((n, m) => n + m.guns.filter((g) => g.melee === melee).reduce((x, g) => x + g.attacks * Math.min(g.blast, 3) * (1 + g.ap * 0.3) * g.deadly, 0), 0);
}

/** A new round: the line turns, ambushers arrive, bleeding bites, everyone rolls initiative, the Echoes show their intents. */
function newRound(run: SortieRun) {
  const c = run.combat!;
  c.round++;
  c.moved = [];
  c.orders = {};
  c.cast = {};
  c.acting = undefined;
  log(c, `— Round ${c.round} —`, 'info');
  if (c.round > 1) {
    for (const p of c.party) p.shield = 0;
    rotate(run, c);
  }
  if (has(run, 'rally')) for (const p of partyLine(c)) for (const m of p.models) m.shaken = false;
  for (const e of c.enemies) if (e.arrives && e.arrives <= c.round && standing(e)) {
    e.arrives = undefined;
    e.dist = 1;
    log(c, `${e.name} burst out of ambush at Close range!`, 'bad');
  }
  // Nobody left Close: the rest of the Echoes close in a step.
  if (c.round > 1 && onField(c).length && !onField(c).some((e) => distOf(e) === 1)) {
    for (const e of onField(c)) e.dist = distOf(e) - 1;
    log(c, 'The Echoes close in.', 'info');
  }
  for (const s of [...partyLine(c), ...onField(c)]) if (statusOn(c, s, 'bleed')) wound(run, s, SORTIE.hpMul / 2, 'Bleeding');
  checkEnd(run);
  if (c.over) return;
  signature(run);
  checkEnd(run);
  if (c.over) return;
  if (c.affix === 'regenerating') for (const e of onField(c)) {
    const n = mend(e, Math.ceil(maxOf(e) * 0.08));
    if (n) log(c, `${e.name} regenerate: mended ${n}.`, 'bad');
  }
  // A unit whose stress is full cracks for the round, and comes back down after.
  for (const p of partyLine(c)) {
    const m = memberOf(run, p);
    if (!m || (m.stress ?? 0) < SORTIE.stress.max) continue;
    const kind = rand(run) < SORTIE.stress.refuse ? 'refuse' : 'wild';
    p.crack = { round: c.round, kind };
    m.stress = SORTIE.stress.after;
    log(c, `${p.name} crack under the strain${kind === 'refuse' ? ' and won’t take orders this round' : ' and fight wild this round (-1 to hit)'}!`, 'bad');
    note(run, `${p.name} cracked under the strain${kind === 'refuse' ? ' and refused orders' : ' and fought wild'}.`, 'bad');
  }
  const turns: SortieTurn[] = [];
  for (const s of [...partyLine(c), ...onField(c)]) {
    if (refusing(c, s)) continue;
    const mod = (trinketOf(s)?.init ?? 0) + (s.fast ? SORTIE.fast : 0) - (s.slow || statusOn(c, s, 'slow') ? SORTIE.slow : 0) + (!s.echo && has(run, 'drill') ? 1 : 0) + (!s.echo && has(run, 'adrenal') ? 2 : 0)
      + (quirk(s, 'quick') ? 1 : 0) - (quirk(s, 'jumpy') && c.round === 1 ? 2 : 0) + (s.echo && c.ambush && c.round === 1 ? SORTIE.ambush.init : 0);
    s.models.forEach((m, i) => {
      if (m.hp > 0 && !m.routed) for (let k = 0; k < s.turns; k++) turns.push({ key: s.key, i, init: d6(run) + mod + rand(run) * 0.1 });
    });
  }
  c.queue = turns.sort((a, b) => b.init - a.init);
  for (const e of c.enemies) e.intent = standing(e) ? intentOf(run, e) : undefined;
  nextOrder(run);
}

/** The Echo lord's signature ability, at the start of a round while it stands. */
function signature(run: SortieRun) {
  const c = run.combat!;
  const lord = c.enemies.find((e) => e.key === c.lord);
  if (!lord || !standing(lord) || lord.arrives) return;
  if ((run.rematch ?? 0) >= 3 && c.round > 1 && hpOf(lord) < maxOf(lord)) {
    const n = mend(lord, Math.max(1, Math.round(maxOf(lord) * SORTIE.rematch.regen)));
    if (n) log(c, `Regenerating: ${lord.name} mends ${n} wound${n === 1 ? '' : 's'}.`, 'bad');
  }
  for (const sig of sigsOf(run)) {
  const line = partyLine(c);
  if (!line.length) return;
  if (sig.id === 'rage' && c.round > 1) {
    lord.atkBonus *= 1.12;
    log(c, `${sig.name}: ${lord.name} hits harder.`, 'bad');
  }
  if (sig.id === 'dive' && c.round % 2 === 0) {
    const back = line[line.length - 1];
    const guns = active(lord)[0]?.guns.filter((g) => g.melee) ?? [];
    log(c, `${sig.name}: ${lord.name} swoops on ${back.name}!`, 'bad');
    strike(run, lord, back, { melee: true, guns: guns.length ? guns : [FISTS], dist: 1, label: sig.name });
  }
  if (sig.id === 'dirge' && c.round % 2 === 0) {
    for (const p of line) p.status.daze = c.round;
    log(c, `${sig.name}: the whole party is dazed.`, 'bad');
  }
  if (sig.id === 'tremor' && c.round % 3 === 0) {
    log(c, `${sig.name}: the ground heaves.`, 'bad');
    for (const p of line) wound(run, p, active(p).length * Math.ceil(SORTIE.hpMul / 2), sig.name);
  }
  if (sig.id === 'dread') {
    const f = line[0];
    for (const m of active(f)) morale(run, f, m, false);
  }
  if (sig.id === 'brood' && c.round % 3 === 0 && c.brood) {
    const s = squadOf(c.brood, `e${c.enemies.length}`, { echo: true, n: 2 });
    s.dist = 1;
    s.intent = intentOf(run, s);
    c.enemies.push(s);
    log(c, `${sig.name}: ${s.models.length} ${s.name} crawl out of ${lord.name}!`, 'bad');
  }
  }
}

/** Ask for the next unit's order, front to back; once every unit has one, the round runs. */
function nextOrder(run: SortieRun) {
  const c = run.combat!;
  const s = partyLine(c).find((p) => !perTurn(p) && !refusing(c, p) && !c.orders[p.key]);
  if (!s) return advance(run);
  c.need = 'order';
  c.acting = s.key;
}

/** Run the round on until a player choice is needed or the round ends. */
function advance(run: SortieRun) {
  const c = run.combat!;
  c.need = undefined;
  c.acting = undefined;
  while (c.queue.length && !c.over) {
    const t = c.queue[0];
    const s = squadByKey(c, t.key);
    const m = s?.models[t.i];
    if (!s || !m || m.hp <= 0 || m.routed || s.arrives) { c.queue.shift(); continue; }
    if (!s.echo && perTurn(s)) {
      // Its turn begins: a shaken or stunned model just spends it.
      if (lostTurn(run, s, m)) { c.queue.shift(); continue; }
      c.need = 'turn';
      c.acting = s.key;
      return;
    }
    c.queue.shift();
    if (!lostTurn(run, s, m)) {
      if (s.echo) echoAct(run, s, m);
      else orderAct(run, s, m);
    }
    checkEnd(run);
  }
  if (c.over) return;
  for (const e of onField(c)) for (const st of Object.keys(e.status) as Status[]) if ((e.status[st] ?? 0) < c.round) delete e.status[st];
  newRound(run);
}

/** A shaken model steadies itself, and a stunned squad loses a model's turn. */
function lostTurn(run: SortieRun, s: SortieSquad, m: SortieModel): boolean {
  const c = run.combat!;
  if (statusOn(c, s, 'stun')) {
    delete s.status.stun;
    log(c, `${s.name} ${s.echo ? 'is' : 'are'} stunned and lose${s.echo ? 's' : ''} a turn.`, s.echo ? 'good' : 'bad');
    return true;
  }
  if (m.shaken) {
    m.shaken = false;
    log(c, `A model of ${s.name} steadies itself.`, 'info');
    return true;
  }
  return false;
}

/** Wounds that skip the dice (bleeding, thorns, blasts), most hurt model first. */
function wound(run: SortieRun, s: SortieSquad, n: number, why: string) {
  let lost = 0;
  const alive0 = alive(s).length;
  const hp0 = hpOf(s);
  for (let i = 0; i < n; i++) {
    const m = pickHurt(s);
    if (!m) break;
    if (s.shield > 0) { s.shield--; continue; }
    m.hp--;
    lost++;
    if (m.hp <= 0) fell(run, s, false);
  }
  if (run.combat && lost) log(run.combat, `${why}: ${lost} wound${lost === 1 ? '' : 's'} on ${s.name}.`, s.echo ? 'good' : 'bad');
  if (lost) lastStand(run, s, alive0, hp0);
}

/** The model hits go onto: the most hurt one still fighting. */
const pickHurt = (s: SortieSquad) => [...active(s)].sort((a, b) => a.hp - b.hp)[0];

/** A model just fell: count it (the party unit that felled it may leech), and if it was the last, a revive or a death blast. */
function fell(run: SortieRun, s: SortieSquad, front: boolean, by?: SortieSquad) {
  const c = run.combat;
  if (!c) return;
  if (s.echo) {
    c.kills++;
    if (by && !by.echo) {
      const leech = effects(by.abilities, 'leech').reduce((n, e) => n + e.n, 0) + (has(run, 'trophy') ? 1 : 0);
      if (leech) mend(by, leech);
    }
  }
  if (alive(s).length) return;
  const rev = effects(s.abilities, 'revive')[0];
  if (rev && !s.revived) {
    s.revived = true;
    const m = s.models[0];
    m.hp = Math.max(1, Math.round(m.max * rev.n));
    m.routed = false;
    if (s.echo) c.kills--;
    return log(c, `${rev.source}: ${s.name} get${s.echo ? 's' : ''} back up!`, s.echo ? 'bad' : 'good');
  }
  if (s.echo) {
    if (by && !by.echo) c.lastBlow = by.key;
    log(c, `${s.name} destroyed.`, 'good');
    const blast = effects(s.abilities, 'deathBlast')[0];
    const f = frontOf(c);
    if (blast && front && f) wound(run, f, stoch(run, blast.dmg * 0.5 * SORTIE.hpMul), blast.source);
    if (c.affix === 'vengeful' && f) wound(run, f, SORTIE.hpMul, 'Vengeful');
  } else {
    log(c, `${s.name} ${s.models.length === 1 ? 'has fallen' : 'are wiped out'}.`, 'bad');
    for (const p of c.party) {
      const m = p !== s && alive(p).length ? memberOf(run, p) : undefined;
      if (m) stress(run, m, SORTIE.stress.lost);
    }
  }
}

/** Mend wounds, most hurt models first. Returns wounds mended. */
function mend(s: SortieSquad, n: number): number {
  return mendAll([s], n);
}

/** Mend wounds across some squads, most hurt models first. Returns wounds mended. */
function mendAll(squads: SortieSquad[], n: number): number {
  let done = 0;
  for (; done < n; done++) {
    const m = squads.flatMap(active).filter((x) => x.hp < x.max).sort((a, b) => a.hp / a.max - b.hp / b.max)[0];
    if (!m) break;
    m.hp++;
  }
  return done;
}

/** How much harder it hits this round: a frenzy, a last stand. */
function fury(c: SortieCombat, s: SortieSquad): number {
  let mul = 1;
  for (const e of effects(s.abilities, 'frenzy')) if ((c.round - 1) % Math.max(1, Math.round(e.every)) === 0) mul *= 1 + (e.mul - 1) * Math.min(1, e.time);
  if (hpOf(s) <= maxOf(s) / 2) for (const e of effects(s.abilities, 'lastStand')) mul *= e.mul;
  if (lastStanding(c, s)) mul *= SORTIE.lastStand.mul;
  return mul;
}

const appliesTo = (e: { only?: 'melee' | 'shoot'; gun?: string }, g: Gun) => (!e.only || (e.only === 'melee') === g.melee) && (!e.gun || e.gun === g.name);

interface Strike {
  melee: boolean;
  guns: Gun[];
  /** How far apart they are: the Echo squad's distance plus the party unit's slot. */
  dist: number;
  label?: string;
  /** Fired at will, at the nearest squad. */
  loose?: boolean;
}

/** How far apart an Echo squad and a party unit stand. */
const gap = (e: SortieSquad, p: SortieSquad) => distOf(e) + slotOf(p);

/** To-hit modifier for one weapon on one target. */
function hitMod(run: SortieRun, att: SortieSquad, def: SortieSquad, g: Gun, a: Strike): number {
  const c = run.combat!;
  let mod = g.hitMod + (a.melee ? att.hitMelee : att.hitShoot);
  if (statusOn(c, def, 'mark')) mod += 1;
  if (statusOn(c, att, 'daze')) mod -= 1;
  if (lastStanding(c, att)) mod += 1;
  mod -= def.evasive + (a.melee ? (def.meleeEvasion ? 1 : 0) : def.stealth && a.dist >= 2 ? 1 : 0);
  if (!a.melee && !att.echo && has(run, 'scope') && a.dist >= 3) mod += 1;
  if (!att.echo && has(run, 'relay') && slotOf(att) === 1) mod += 1;
  if (!att.echo && has(run, 'salvo') && c.round === 1) mod += 1;
  if (!att.echo && has(run, 'pact')) mod += 1;
  if (a.melee) mod += (quirk(att, 'brute') ? 1 : 0) - (quirk(att, 'clumsy') ? 1 : 0);
  else mod += (quirk(att, 'eagle') ? 1 : 0) - (quirk(att, 'myopic') && a.dist >= 3 ? 1 : 0);
  if (quirkHere(run, att, 'haunted')) mod -= 1;
  mod += (a.melee ? trinketOf(att)?.melee : trinketOf(att)?.shoot) ?? 0;
  if (att.crack?.round === c.round && att.crack.kind === 'wild') mod -= 1;
  // Fresh from melee, guns are hard to bring to bear.
  if (!a.melee && att.engaged >= c.round - 1) mod -= 1;
  return mod;
}

/** One model's attack on a squad, dice by dice. Returns wounds dealt. */
function strike(run: SortieRun, att: SortieSquad, def: SortieSquad, a: Strike): number {
  const c = run.combat!;
  const front = def.echo ? distOf(def) === 1 : true;
  const before = alive(def).length;
  const hp0 = hpOf(def);
  const mine = !att.echo;
  let dealt = 0;
  let hits = 0;
  const wounded = new Set<SortieModel>();
  let fallen = 0;
  const mul = att.atkBonus * fury(c, att);
  const sixes = effects(att.abilities, 'sixes');
  for (const g of a.guns) {
    let n = stoch(run, g.attacks * mul + (a.melee && mine && has(run, 'bayonets') ? 1 : 0));
    const mod = hitMod(run, att, def, g, a);
    for (let i = 0; i < n; i++) {
      if (!standing(def)) break;
      const need = g.reliable ? 2 : clamp(att.quality - mod, 2, 6);
      const r = d6(run);
      if (r < need) continue;
      const six = r === 6;
      const six6 = six ? sixes.filter((e) => appliesTo(e, g)) : [];
      if (six6.some((e) => e.again)) n++;
      const rend = six && (g.rending || six6.some((e) => e.rend) || (mine && !a.melee && has(run, 'rounds')));
      const extra = six6.reduce((x, e) => x + (e.dmg ?? 0), 0);
      const blast = Math.min(g.blast, Math.max(1, active(def).length));
      for (let b = 0; b < blast; b++) {
        const target = pickHurt(def);
        if (!target) break;
        hits++;
        const ap = g.ap + (a.melee && mine ? (has(run, 'blades') ? 1 : 0) + (has(run, 'fury') ? 2 : 0) : 0) + (rend ? 4 : 0) - (def.fortified ? 1 : 0);
        const cover = -(target.shaken ? 1 : 0) + (def.echo ? 0 : (has(run, 'ward') && c.round === 1 ? 1 : 0)
          + (has(run, 'wall') && slotOf(def) === 0 ? 1 : 0) + (has(run, 'grit') && target.hp * 2 <= target.max ? 1 : 0) - (has(run, 'fury') ? 1 : 0) + (quirkHere(run, def, 'native') ? 1 : 0) + (trinketOf(def)?.def ?? 0));
        const save = clamp(def.defense + Math.max(0, ap) - def.defMod - cover, 2, 7);
        if (save < 7 && d6(run) >= save) continue;
        const ignore = g.bane ? Math.min(def.ignore, 1 / 6) : def.ignore;
        // Deadly: all its wounds onto one model, none carried over.
        let w = 0;
        for (let k = 0; k < Math.max(1, g.deadly) + stoch(run, extra); k++) if (rand(run) >= ignore) w++;
        w = Math.min(w, target.hp + def.shield);
        const soak = Math.min(def.shield, w);
        def.shield -= soak;
        const lost = Math.min(target.hp, w - soak);
        target.hp -= lost;
        dealt += lost;
        if (lost && target.hp > 0) wounded.add(target);
        if (target.hp <= 0) {
          wounded.delete(target);
          fallen++;
          fell(run, def, front, att);
        }
      }
    }
  }
  const kills = before - alive(def).length;
  const label = a.label ? ` (${a.label})` : '';
  log(c, `${att.name}${label} → ${def.name}: ${hits} hit${hits === 1 ? '' : 's'}, ${dealt} wound${dealt === 1 ? '' : 's'}${kills > 0 ? `, ${kills} ${def.echo ? 'Echo' : 'model'}${kills === 1 ? '' : def.echo ? 'es' : 's'} down` : ''}.`, mine ? (dealt ? 'good' : 'info') : dealt ? 'bad' : 'info');
  c.fxSeq = (c.fxSeq ?? 0) + 1;
  c.fx = [...(c.fx ?? []), { n: c.fxSeq, from: att.key, to: def.key, hits, dmg: dealt, melee: !!a.melee, mine }].slice(-12);
  if (dealt) procs(run, att, def, a.melee, dealt);
  if (a.melee) {
    att.engaged = def.engaged = c.round;
    thorns(run, def, att);
  }
  // Morale: a model wounded in melee down to half its wounds tests, and a squadmate tests for each model that falls.
  if (dealt) lastStand(run, def, before, hp0);
  if (a.melee) for (const m of wounded) if (m.hp <= m.max / 2) morale(run, def, m, true);
  for (let k = 0; k < fallen; k++) {
    const up = active(def);
    if (up.length) morale(run, def, pickOf(run, up), a.melee);
  }
  return dealt;
}

/** An OPR morale test for one model: Quality or better on a d6. A fail shakes it; failing again in melee while shaken and down to half its wounds routs it. */
function morale(run: SortieRun, s: SortieSquad, m: SortieModel, melee: boolean) {
  const c = run.combat!;
  if (m.hp <= 0 || m.routed || lastStanding(c, s)) return;
  const bonus = (s.hero ? SORTIE.heroMorale : 0) + (!s.echo && has(run, 'stims') ? SORTIE.heroMorale : 0) - (!s.echo && has(run, 'adrenal') ? 1 : 0)
    + (quirk(s, 'steady') ? 1 : 0) - (quirk(s, 'shaky') ? 1 : 0) + (trinketOf(s)?.morale ?? 0) + (scarred(run, s, 'blooded') ? 1 : 0);
  const pass = () => d6(run) + bonus >= s.quality;
  if (pass() || (s.fearless && pass())) return;
  if (m.shaken && melee && m.hp <= m.max / 2) {
    m.routed = true;
    log(c, `A model of ${s.name} breaks and flees!`, s.echo ? 'good' : 'bad');
    if (!standing(s)) log(c, `${s.name} ${s.echo ? 'is' : 'are'} routed.`, s.echo ? 'good' : 'bad');
    return;
  }
  if (!m.shaken) {
    m.shaken = true;
    log(c, `A model of ${s.name} is shaken.`, s.echo ? 'good' : 'bad');
    const mem = memberOf(run, s);
    if (mem) stress(run, mem, SORTIE.stress.shaken);
  }
}

const STATUS_TEXT: Record<Status, string> = { slow: 'slowed', stun: 'stunned', daze: 'dazed', mark: 'marked', bleed: 'bleeding', knock: 'knocked back', execute: 'finished off' };

/** Each wound is a chance to leave a status. */
function procs(run: SortieRun, att: SortieSquad, def: SortieSquad, melee: boolean, dmg: number) {
  const c = run.combat!;
  for (const e of effects(att.abilities, 'onHit')) {
    if (!standing(def) || (e.only && (e.only === 'melee') !== melee) || (e.status !== 'execute' && e.status !== 'knock' && statusOn(c, def, e.status))) continue;
    if (rand(run) >= 1 - Math.pow(1 - e.chance, dmg / SORTIE.hpMul)) continue;
    if (e.status === 'execute') {
      const hurt = active(def).filter((m) => m.hp < m.max).sort((a, b) => a.hp - b.hp)[0];
      if (!hurt) continue;
      hurt.hp = 0;
      fell(run, def, def.echo ? distOf(def) === 1 : true, att);
    } else if (e.status === 'knock') {
      // An Echo squad is thrown back a distance; a party unit is slowed by it.
      if (def.echo) {
        if (distOf(def) >= SORTIE.ranks) continue;
        def.dist = distOf(def) + 1;
      } else def.status.slow = c.round + 1;
    } else def.status[e.status] = c.round + 1;
    log(c, `${e.source}: ${def.name} ${def.echo ? 'is' : 'are'} ${STATUS_TEXT[e.status]}.`, def.echo ? 'good' : 'bad');
  }
}

function thorns(run: SortieRun, struck: SortieSquad, by: SortieSquad) {
  for (const e of effects(struck.abilities, 'thorns')) if (standing(by) && rand(run) < e.chance) wound(run, by, e.n, e.source);
}

/** A charge lands: the target is brought in Close (or the charger closes in) and takes the impact hits, on 2+ at AP 0. */
function charge(run: SortieRun, att: SortieSquad, def: SortieSquad) {
  const c = run.combat!;
  if (!att.echo) {
    def.dist = 1;
    log(c, `${att.name} charge ${def.name}!`, 'info');
  } else {
    att.dist = 1;
    log(c, `${att.name} charges ${def.name}!`, 'bad');
  }
  att.cooldowns.charge = c.round + 1 + (att.fast ? 1 : SORTIE.cooldown.charge);
  const n = stoch(run, att.impact * active(att).length);
  if (n) strike(run, att, def, { melee: true, dist: 1, guns: [{ ...FISTS, name: 'Impact', attacks: n, reliable: true }], label: 'impact' });
}

// --- Skills ------------------------------------------------------------------------------------------------------

const ready = (c: SortieCombat, s: SortieSquad, id: string) => (s.cooldowns[id] ?? 0) <= c.round;
const waitOf = (c: SortieCombat, s: SortieSquad, id: string) => Math.max(0, (s.cooldowns[id] ?? 0) - c.round);
const cool = (c: SortieCombat, s: SortieSquad, id: string, cd: number) => (s.cooldowns[id] = c.round + 1 + cd);

const weaponText = (g: Gun) =>
  [g.melee ? 'Melee' : `${g.range}"`, `A${+(g.attacks).toFixed(2)}`, g.ap ? `AP(${g.ap})` : '', g.blast > 1 ? `Blast(${g.blast})` : '', g.deadly > 1 ? `Deadly(${g.deadly})` : '', g.rending ? 'Rending' : '', g.reliable ? 'Reliable' : '', g.bane ? 'Bane' : ''].filter(Boolean).join(', ');

/** The skills the unit the game waits on (or, on a Hero's or lone model's turn, that one model) can use. */
export function skillsOf(run: SortieRun, model?: SortieModel): SortieSkill[] {
  const s = actingSquad(run);
  return s ? skillsFor(run, s, model) : [];
}

/** The skills a party unit (or one of its models) can use from where it stands. */
function skillsFor(run: SortieRun, me: SortieSquad, model?: SortieModel): SortieSkill[] {
  const c = run.combat;
  if (!c) return [];
  const models = model ? [model] : active(me);
  const from = SLOTS[slotOf(me)]?.toLowerCase() ?? 'line';
  const front = slotOf(me) === 0;
  const out: SortieSkill[] = [];
  const seen = new Set<string>();
  const real = models.some((m) => m.guns.some((g) => g.melee && g.name !== 'Fists'));
  for (const m of models) for (const g of m.guns) {
    if (seen.has(g.name) || (g.name === 'Fists' && real)) continue;
    seen.add(g.name);
    const reach = gunReach(run, me, g);
    const carriers = models.filter((x) => x.guns.some((y) => y.name === g.name)).length;
    const blocked = reach ? undefined : g.melee ? 'Blades only reach from the front.' : `Out of range from the ${from}.`;
    out.push({
      id: `w:${g.name}`, kind: 'weapon', name: g.name, gun: g.name, melee: g.melee, reach, wait: 0, blocked,
      text: `${weaponText(g)}. ${g.melee ? 'Close only, from the front' : reach ? `From the ${from}, reaches ${reachText(reach)}` : `Reaches nothing from the ${from}`}${!model && models.length > 1 ? `; ${carriers} of ${models.length} carry it, the rest act at will` : ''}.`,
    });
  }
  out.unshift({ id: 'atwill', kind: 'atwill', name: 'At will', reach: 0, wait: 0, text: model ? 'Fire or fight with the best weapon at the nearest squad in reach.' : 'Each model fires or fights with its best weapon at the nearest squad in reach.' });
  if (hasBlade(me) && !statusOn(c, me, 'slow')) {
    const reach = front ? chargeReach(run, me) : 0;
    out.push({
      id: 'charge', kind: 'charge', name: 'Charge', melee: true, reach, wait: waitOf(c, me, 'charge'), blocked: front ? undefined : 'Only the front unit can charge.',
      text: `From the front, bring a squad at ${reachText(chargeReach(run, me))} range in Close${me.impact ? ` with ${+(me.impact * active(me).length).toFixed(1)} impact hits` : ''}, then fight it in melee. Cooldown ${me.fast ? 1 : SORTIE.cooldown.charge}.`,
    });
  }
  out.push({ id: 'regroup', kind: 'regroup', name: 'Regroup', reach: 0, wait: waitOf(c, me, 'regroup'), text: `Catch a breath: every model mends a third of its wounds, steadies if shaken, and the unit shakes off slows, dazes and bleeding. Cooldown ${SORTIE.cooldown.regroup}.` });
  const b = barrageOf(me);
  const abil: [SortieSkillKind, string | undefined, string, number][] = [
    ['heal', sourceOf(me, 'heal'), `Mend ${healOf(me)} wounds across the party, most hurt models first.`, 0],
    ['shield', sourceOf(me, 'shield'), `A shield on the front unit that soaks ${shieldOf(me)} wounds this round.`, 0],
    ['barrage', sourceOf(me, 'barrage'), `${b.hits} hits at AP(${b.ap}) at any distance.`, SORTIE.ranks],
    ['field', sourceOf(me, 'field'), `The squads at Close and Mid are ${fieldOf(me) === 'slow' ? 'slowed (−2 initiative, no charges)' : 'dazed (−1 to hit)'} this round and next.`, 0],
    ['outflank', sourceOf(me, 'redeploy'), 'Swing round the flank: this round the unit\'s guns reach every distance, from any slot.', 0],
  ];
  for (const [kind, src, text, reach] of abil) if (src) {
    out.push({ id: kind, kind, name: src, text: `${text} Cooldown ${SORTIE.cooldown[kind]}.`, reach, wait: waitOf(c, me, kind) });
  }
  return out;
}

/** The model whose turn it is, on a Hero's or lone model's turn. */
export function turnModel(run: SortieRun): SortieModel | undefined {
  const c = run.combat;
  if (c?.need !== 'turn') return undefined;
  return actingSquad(run)?.models[c.queue[0]?.i];
}

/** Echo squads a skill can go on now. */
export function skillTargets(run: SortieRun, skill: SortieSkill): string[] {
  const c = run.combat;
  if (!c || !skill.reach || skill.blocked) return [];
  return onField(c).filter((e) => distOf(e) <= skill.reach).map((e) => e.key);
}

/** Why a skill can't be used on this target now, or null. */
export function skillProblem(run: SortieRun, id: string, target?: string): string | null {
  const c = run.combat;
  if (!c || c.over || !c.need) return 'Not your move.';
  const sk = skillsOf(run, turnModel(run)).find((x) => x.id === id);
  if (!sk) return 'No such skill.';
  if (sk.blocked) return sk.blocked;
  if (sk.wait) return `Ready in ${sk.wait} round${sk.wait === 1 ? '' : 's'}.`;
  if (!sk.reach) {
    if (sk.kind === 'heal' && !partyLine(c).some((p) => active(p).some((m) => m.hp < m.max))) return 'No one is hurt.';
    return null;
  }
  const t = onField(c).find((e) => e.key === target);
  if (!t) return 'Pick an Echo squad.';
  if (distOf(t) > sk.reach) return sk.melee && sk.kind === 'weapon' ? 'Blades only reach Close: Charge to bring one in.' : `Out of reach: it stands ${DISTANCES[distOf(t)]}.`;
  return null;
}

/** Give the unit the game waits on its order for the round. */
export function giveOrder(run: SortieRun, id: string, target?: string) {
  const c = run.combat!;
  const s = actingSquad(run);
  if (c.need !== 'order' || !s) throw new Error('No order needed now.');
  const p = skillProblem(run, id, target);
  if (p) throw new Error(p);
  c.orders[s.key] = { skill: id, target };
  const sk = skillsFor(run, s).find((x) => x.id === id)!;
  log(c, `▸ ${s.name}: ${sk.name}${target ? ` on ${squadByKey(c, target)?.name}` : ''}.`, 'info');
  nextOrder(run);
}

/** A Hero's or lone model's own turn. */
export function act(run: SortieRun, id: string, target?: string) {
  const c = run.combat!;
  const s = actingSquad(run);
  if (c.need !== 'turn' || !s) throw new Error('Not a turn to take now.');
  const p = skillProblem(run, id, target);
  if (p) throw new Error(p);
  const m = turnModel(run)!;
  const sk = skillsFor(run, s, m).find((x) => x.id === id)!;
  c.queue.shift();
  log(c, `▸ ${s.name}: ${sk.name}${target ? ` on ${squadByKey(c, target)?.name}` : ''}.`, 'info');
  useSkill(run, s, m, sk, target);
  checkEnd(run);
  if (!c.over) advance(run);
}

/** One model carries out its unit's order; one without the weapon ordered, or after the order's one-off, acts at will. */
function orderAct(run: SortieRun, s: SortieSquad, m: SortieModel) {
  const c = run.combat!;
  const o = c.orders[s.key];
  const sk = o && skillsFor(run, s).find((x) => x.id === o.skill);
  if (!sk || sk.kind === 'atwill') return atWill(run, s, m, !!sk);
  if (sk.kind === 'weapon') return m.guns.some((g) => g.name === sk.gun) ? useSkill(run, s, m, sk, o.target) : atWill(run, s, m);
  if (sk.kind === 'regroup') return useSkill(run, s, m, sk, o.target);
  if (sk.kind === 'charge') {
    // The first to act leads the charge; the rest pile into whatever it brought in.
    if (!c.cast[s.key]) {
      c.cast[s.key] = true;
      return useSkill(run, s, m, sk, o.target);
    }
    const t = squadByKey(c, o.target ?? '');
    return fight(run, s, m, t && standing(t) && distOf(t) === 1 ? t : onField(c)[0]);
  }
  if (c.cast[s.key]) return atWill(run, s, m);
  c.cast[s.key] = true;
  useSkill(run, s, m, sk, o.target);
}

/** The model fights in melee with every melee weapon it has, if its unit holds the front. */
function fight(run: SortieRun, s: SortieSquad, m: SortieModel, t: SortieSquad | undefined) {
  if (!t || slotOf(s) !== 0 || distOf(t) !== 1) return atWill(run, s, m);
  strike(run, s, t, { melee: true, dist: 1, guns: m.guns.filter((g) => g.melee) });
}

/** A target still standing and in reach, or the nearest one that is. */
function retarget(run: SortieRun, key: string | undefined, reach: number): SortieSquad | undefined {
  const c = run.combat!;
  const t = onField(c).find((e) => e.key === key);
  if (t && distOf(t) <= reach) return t;
  return onField(c).find((e) => distOf(e) <= reach);
}

function useSkill(run: SortieRun, me: SortieSquad, m: SortieModel, sk: SortieSkill, target?: string) {
  const c = run.combat!;
  switch (sk.kind) {
    case 'atwill': return atWill(run, me, m, true);
    case 'weapon': {
      const g0 = m.guns.find((g) => g.name === sk.gun);
      const reach = g0 ? gunReach(run, me, g0) : 0;
      const t = retarget(run, target, reach);
      const main = m.guns.filter((g) => g.name === sk.gun);
      if (!t || !main.length) return atWill(run, me, m);
      // The model's other weapons of the same kind join in where they reach.
      const guns = [...main, ...m.guns.filter((g) => g.name !== sk.gun && g.melee === !!sk.melee && g.name !== 'Fists' && distOf(t) <= gunReach(run, me, g))];
      return void strike(run, me, t, { melee: !!sk.melee, dist: gap(t, me), guns });
    }
    case 'charge': {
      const t = slotOf(me) === 0 ? retarget(run, target, chargeReach(run, me)) : undefined;
      if (!t) return atWill(run, me, m);
      charge(run, me, t);
      if (standing(t) && standing(me)) fight(run, me, m, t);
      return;
    }
    case 'regroup': {
      cool(c, me, 'regroup', SORTIE.cooldown.regroup);
      m.shaken = false;
      const before = m.hp;
      m.hp = Math.min(m.max, m.hp + Math.ceil(m.max / 3));
      if (Object.keys(me.status).length) { me.status = {}; log(c, `${me.name} shake it off.`, 'good'); }
      if (m.hp > before) log(c, `${me.name} regroup: mended ${m.hp - before}.`, 'good');
      return;
    }
    case 'heal': cool(c, me, 'heal', SORTIE.cooldown.heal); return log(c, `${sk.name}: mended ${mendAll(partyLine(c), healOf(me))} wounds across the party.`, 'good');
    case 'shield': {
      cool(c, me, 'shield', SORTIE.cooldown.shield);
      const f = frontOf(c) ?? me;
      f.shield = Math.max(f.shield, shieldOf(me));
      return log(c, `${sk.name}: a ${f.shield}-wound shield on ${f.name}.`, 'good');
    }
    case 'barrage': {
      const t = retarget(run, target, SORTIE.ranks);
      if (!t) return;
      cool(c, me, 'barrage', SORTIE.cooldown.barrage);
      const b = barrageOf(me);
      return void strike(run, me, t, { melee: false, dist: 1, guns: [{ ...FISTS, name: sk.name, melee: false, range: 99, attacks: b.hits, ap: b.ap, reliable: true }], label: sk.name });
    }
    case 'field': {
      cool(c, me, 'field', SORTIE.cooldown.field);
      const st = fieldOf(me);
      for (const e of onField(c)) if (distOf(e) <= 2) e.status[st] = c.round + 1;
      return log(c, `${sk.name}: the squads at Close and Mid are ${STATUS_TEXT[st]}.`, 'good');
    }
    case 'outflank':
      cool(c, me, 'outflank', SORTIE.cooldown.outflank);
      c.outflank[me.key] = c.round;
      return log(c, `${sk.name}: ${me.name}'s guns reach every distance this round.`, 'good');
  }
}

/** Expected wounds from some of a squad's weapons on a target at this distance. */
function expect(run: SortieRun, att: SortieSquad, guns: Gun[], def: SortieSquad, dist: number, melee: boolean, loose = false): number {
  let n = 0;
  for (const g of guns) {
    const a: Strike = { melee, guns: [g], dist, loose };
    const hit = g.reliable ? 5 / 6 : clamp((7 - att.quality + hitMod(run, att, def, g, a)) / 6, 1 / 6, 5 / 6);
    const ap = g.ap + (melee && !att.echo ? (has(run, 'blades') ? 1 : 0) + (has(run, 'fury') ? 2 : 0) : 0) - (def.fortified ? 1 : 0);
    const fail = 1 - clamp((7 - def.defense - Math.max(0, ap) + def.defMod) / 6, 0, 5 / 6);
    const per = Math.min(g.deadly, def.models[0]?.max ?? 1);
    n += g.attacks * att.atkBonus * hit * Math.min(g.blast, active(def).length) * fail * per * (1 - def.ignore);
  }
  return n;
}

/** Value of hurting a squad: finish what's nearly dead, and go for what hits hardest. */
function worth(def: SortieSquad, dmg: number): number {
  const left = hpOf(def);
  const threat = 1 + 0.15 * (output(def, true) + output(def, false));
  return Math.min(dmg, left) * threat * (dmg >= left ? 1.5 : 1);
}

interface Attack {
  guns: Gun[];
  t: SortieSquad;
  melee: boolean;
  v: number;
}

/**
 * The best weapon and target for one model of a party unit: a melee blow from the front at Close or a shot as deep as
 * its guns reach from its slot. Loose (At will) it only looks at the nearest squads it can hurt.
 */
function bestAttack(run: SortieRun, s: SortieSquad, m: SortieModel, loose = false): Attack | null {
  const c = run.combat!;
  let best: Attack | null = null;
  const consider = (guns: Gun[], t: SortieSquad, melee: boolean) => {
    if (!guns.length) return;
    const v = worth(t, expect(run, s, guns, t, melee ? 1 : gap(t, s), melee, loose));
    if (!best || v > best.v) best = { guns, t, melee, v };
  };
  const front = slotOf(s) === 0;
  let field = onField(c);
  if (loose) {
    const hits = (t: SortieSquad) => m.guns.some((g) => (g.melee ? front && distOf(t) === 1 : distOf(t) <= gunReach(run, s, g)));
    const near = Math.min(...field.filter(hits).map(distOf));
    field = field.filter((t) => hits(t) && distOf(t) === near);
  }
  for (const t of field) {
    if (front && distOf(t) === 1) consider(m.guns.filter((g) => g.melee), t, true);
    consider(m.guns.filter((g) => !g.melee && distOf(t) <= gunReach(run, s, g)), t, false);
  }
  return best;
}

function atWill(run: SortieRun, s: SortieSquad, m: SortieModel, loose = false) {
  const b = bestAttack(run, s, m, loose);
  if (b) strike(run, s, b.t, { melee: b.melee, dist: b.melee ? 1 : gap(b.t, s), guns: b.guns, loose });
}

// --- The Echoes --------------------------------------------------------------------------------------------------

/** The party units an Echo model's guns reach, and the guns that reach each. */
function echoShots(run: SortieRun, e: SortieSquad, m: SortieModel): { t: SortieSquad; guns: Gun[] }[] {
  return partyLine(run.combat!)
    .map((t) => ({ t, guns: m.guns.filter((g) => !g.melee && gap(e, t) <= gunReach(run, e, g)) }))
    .filter((x) => x.guns.length);
}

/** What an Echo model does best: fight the front unit in melee, or shoot (at a party unit picked at random as it fires). */
function echoBest(run: SortieRun, e: SortieSquad, m: SortieModel): { melee: boolean; v: number } | null {
  const front = frontOf(run.combat!);
  let best: { melee: boolean; v: number } | null = null;
  const melee = m.guns.filter((g) => g.melee);
  if (front && distOf(e) === 1 && melee.length) best = { melee: true, v: worth(front, expect(run, e, melee, front, 1, true)) };
  const shots = echoShots(run, e, m);
  if (shots.length) {
    const v = shots.reduce((n, x) => n + worth(x.t, expect(run, e, x.guns, x.t, gap(e, x.t), false)), 0) / shots.length;
    if (!best || v > best.v) best = { melee: false, v };
  }
  return best;
}

/** A ready ability worth using now, for an Echo squad. */
function echoAbility(run: SortieRun, e: SortieSquad): 'heal' | 'shield' | 'barrage' | 'field' | null {
  const c = run.combat!;
  if (sourceOf(e, 'heal') && ready(c, e, 'heal') && maxOf(e) - hpOf(e) >= healOf(e) / 2 && hpOf(e) > 0) return 'heal';
  if (sourceOf(e, 'barrage') && ready(c, e, 'barrage')) return 'barrage';
  if (sourceOf(e, 'field') && ready(c, e, 'field') && partyLine(c).some((p) => !statusOn(c, p, fieldOf(e)))) return 'field';
  if (sourceOf(e, 'shield') && ready(c, e, 'shield') && distOf(e) <= 2) return 'shield';
  return null;
}

const firstUp = (s: SortieSquad, m: SortieModel) => active(s)[0] === m;
const canCharge = (run: SortieRun, e: SortieSquad) => {
  const c = run.combat!;
  const dist = distOf(e);
  return !!frontOf(c) && hasBlade(e) && dist > 1 && dist <= SORTIE.chargeReach && ready(c, e, 'charge') && !statusOn(c, e, 'slow') && output(e, true) > output(e, false);
};

/** What an Echo squad means to do, as its first model would see it. */
export function intentOf(run: SortieRun, e: SortieSquad): SortieIntentKind {
  const c = run.combat!;
  if (e.arrives) return 'waiting';
  const up = active(e);
  if (up.every((m) => m.shaken) || statusOn(c, e, 'stun')) return 'shaken';
  if (echoAbility(run, e)) return 'ability';
  if (canCharge(run, e)) return 'charge';
  const b = echoBest(run, e, up[0]);
  if (b) return b.melee ? 'melee' : 'shoot';
  return 'advance';
}

function echoAct(run: SortieRun, e: SortieSquad, m: SortieModel) {
  const c = run.combat!;
  const line = partyLine(c);
  const front = line[0];
  if (!front) return;
  const ab = firstUp(e, m) ? echoAbility(run, e) : null;
  if (ab) {
    cool(c, e, ab, SORTIE.cooldown[ab]);
    const src = sourceOf(e, ab);
    if (ab === 'heal') return log(c, `${e.name} (${src}): mends ${mend(e, healOf(e))} wounds.`, 'bad');
    if (ab === 'shield') { e.shield = Math.max(e.shield, shieldOf(e)); return log(c, `${e.name} (${src}): a ${e.shield}-wound shield.`, 'bad'); }
    if (ab === 'field') {
      const t = pickOf(run, line.filter((p) => !statusOn(c, p, fieldOf(e))));
      t.status[fieldOf(e)] = c.round + 1;
      return log(c, `${e.name} (${src}): ${t.name} are ${STATUS_TEXT[fieldOf(e)]}.`, 'bad');
    }
    const b = barrageOf(e);
    return void strike(run, e, pickOf(run, line), { melee: false, dist: 1, guns: [{ ...FISTS, name: src ?? 'Barrage', melee: false, range: 99, attacks: b.hits, ap: b.ap, reliable: true }], label: src });
  }
  if (canCharge(run, e)) {
    charge(run, e, front);
    if (standing(e) && standing(front)) strike(run, e, front, { melee: true, dist: 1, guns: m.guns.filter((g) => g.melee) });
    return;
  }
  const b = echoBest(run, e, m);
  if (b?.melee) return void strike(run, e, front, { melee: true, dist: 1, guns: m.guns.filter((g) => g.melee) });
  if (b) {
    const shots = echoShots(run, e, m);
    const w = shots.map((x) => SORTIE.aim[slotOf(x.t)] ?? 1);
    let r = rand(run) * w.reduce((n, x) => n + x, 0);
    const shot = shots.find((_, i) => (r -= w[i]) < 0) ?? shots[shots.length - 1];
    return void strike(run, e, shot.t, { melee: false, dist: gap(e, shot.t), guns: shot.guns });
  }
  // Nothing in reach: the squad moves up a distance (once a round).
  if (distOf(e) > 1 && !c.moved.includes(e.key)) {
    e.dist = distOf(e) - 1;
    c.moved.push(e.key);
    log(c, `${e.name} moves up to ${DISTANCES[e.dist]}.`, 'info');
  }
}

function checkEnd(run: SortieRun) {
  const c = run.combat!;
  if (c.over) return;
  closeRanks(c);
  if (!c.party.some((p) => alive(p).length)) return finish(run, 'lost');
  if (!c.party.some(standing)) return finish(run, 'broke');
  if (!onField(c).length) {
    // The field is clear, but an ambush may still be waiting: spring it now.
    const lurk = c.enemies.find((e) => e.arrives && standing(e));
    if (lurk) {
      lurk.arrives = c.round;
      return;
    }
    return finish(run, 'won');
  }
  if (c.round > 30) finish(run, 'broke');
}

/** The fight is over: wounds carry back to the run, and a win brings XP, the haul and a reward. */
function finish(run: SortieRun, how: 'won' | 'lost' | 'broke') {
  const c = run.combat!;
  c.over = how;
  c.need = undefined;
  c.acting = undefined;
  c.queue = [];
  // Wounds carry back, and the share of its wounds a fight cost a unit stresses it.
  const sum = (ms: { hp: number }[]) => ms.reduce((n, m) => n + Math.max(0, m.hp), 0);
  for (const p of c.party) {
    const mem = run.party[p.member!];
    const lost = Math.max(0, sum(mem.models) - sum(p.models)) / Math.max(1, mem.models.reduce((n, m) => n + m.max, 0));
    mem.models = p.models.map((m) => ({ hp: Math.max(0, m.hp), max: m.max }));
    if (lost) stress(run, mem, SORTIE.stress.wounds * lost);
  }
  if (c.kind === 'boss' && how !== 'won') run.lordWon = true;
  if (how === 'lost') {
    log(c, 'The party has fallen.', 'bad');
    return note(run, `Wiped out by ${fightTitle[c.kind].toLowerCase()} at depth ${run.depth + 1}.`, 'bad');
  }
  if (how === 'broke') {
    log(c, 'The last of the party breaks and runs.', 'bad');
    return note(run, `Broke and fled from ${fightTitle[c.kind].toLowerCase()} at depth ${run.depth + 1}.`, 'bad');
  }
  run.won++;
  stressAll(run, -(SORTIE.stress.won + (has(run, 'respite') ? 2 : 0)));
  run.xp += c.kind === 'boss' ? SORTIE.xp.boss[run.length] : SORTIE.xp[c.kind];
  const loot: Partial<SortieHaul> = SORTIE.haul[c.kind];
  const more = (has(run, 'scavenge') ? 1.5 : 1) * (run.deep ? SORTIE.deep.haul : 1) * tierPay(run);
  gain(run, { supply: Math.round((loot.supply ?? 0) * more), rp: Math.round((loot.rp ?? 0) * more), us: loot.us });
  if (c.kind === 'boss' && run.length === 'long' && rand(run) < SORTIE.haul.longShard) gain(run, { us: 1 });
  log(c, `Victory! ${c.kills} Echo${c.kills === 1 ? '' : 'es'} destroyed.`, 'good');
  const lost = c.party.filter((p) => !alive(p).length).map((p) => p.name);
  note(run, `Beat ${fightTitle[c.kind].toLowerCase()}: ${c.kills} kill${c.kills === 1 ? '' : 's'}.${lost.length ? ` ${listText(lost)} fell.` : ''}`, lost.length ? 'bad' : 'good');
  earnScars(run, c);
  if (has(run, 'medic') && !revive(run, 1)) {
    const m = run.party.filter(memberUp).flatMap((x) => x.models).filter((x) => x.hp > 0 && x.hp < x.max).sort((a, b) => a.hp - b.hp)[0];
    if (m) m.hp = Math.min(m.max, m.hp + 2 * SORTIE.hpMul);
  }
  if (c.kind === 'boss') {
    run.bossDown = true;
    log(c, bossOf(run).victory, 'good');
    if (run.nemesis) log(c, `The grudge is settled: a bounty of ${bountyOf(run)} RP.`, 'good');
  }
}

/** After a won fight: the battle scars the party's units earned in it, each once a run. */
function earnScars(run: SortieRun, c: SortieCombat) {
  for (const p of c.party) {
    const mem = memberOf(run, p);
    if (!mem || !alive(p).length) continue;
    const earned: SortieScarId[] = [];
    if (p.stand !== undefined) earned.push('blooded');
    if (c.kind === 'elite' && c.lastBlow === p.key) earned.push('headhunter');
    if (hpOf(p) * 4 <= maxOf(p)) earned.push('survivor');
    for (const id of earned) {
      if (mem.scars?.includes(id)) continue;
      (mem.scars ??= []).push(id);
      const sc = SORTIE.scars[id];
      if (id === 'survivor') for (const m of mem.models) {
        m.max += SORTIE.hpMul;
        if (m.hp > 0) m.hp += SORTIE.hpMul;
      }
      log(c, `${p.name} earns a battle scar: ${sc.name}, ${sc.text}`, 'good');
      note(run, `${p.name} ${sc.how}, and is ${sc.name} for the rest of the run.`, 'good');
    }
  }
}

/** Leave a finished fight: on to the rewards, or the end of the run. */
export function leaveCombat(run: SortieRun) {
  const c = run.combat;
  if (!c?.over) return;
  tally(run, c);
  run.combat = undefined;
  if (c.over === 'lost') return endRun(run, 'fell');
  if (c.over === 'broke') return endRun(run, 'broke');
  if (c.kind === 'boss') {
    run.depth++;
    return endRun(run, 'won');
  }
  const lean = cursed(run, 'lean') ? 1 : 0;
  run.offer = c.kind === 'elite' ? { boons: boonOffer(run, 3 - lean, 'rare') } : { boons: boonOffer(run, 2 - lean), patch: true };
  run.screen = 'reward';
  if (c.kind === 'elite') findTrinket(run, SORTIE.trinkets.elite);
}

/** The bestiary key of an Echo squad: its datasheet, or the lord's id. */
export const beastKey = (run: SortieRun, c: SortieCombat, e: SortieSquad) => (c.lord === e.key ? `lord:${run.boss}` : e.unit.unitType);

/** A bestiary entry's name and lore, from its key. */
export function beastInfo(key: string): { name: string; unit: string; lore: string; lord: boolean } {
  if (key.startsWith('lord:')) {
    const b = SORTIE_BOSSES.find((x) => x.id === key.slice(5));
    if (b) return { name: b.name, unit: b.unit, lore: b.lore, lord: true };
  }
  return { name: key, unit: key, lore: SORTIE_LORE[key] ?? SORTIE_LORE_DEFAULT, lord: false };
}

/** Count a fight's Echoes into the run's bestiary tally: each kind met once a fight, each squad down slain. */
function tally(run: SortieRun, c: SortieCombat) {
  if (c.tallied) return;
  c.tallied = true;
  const met = (run.met ??= {});
  const seen = new Set<string>();
  for (const e of c.enemies) {
    if (e.arrives || e.raider) continue;
    const k = beastKey(run, c, e);
    const b = (met[k] ??= { met: 0, slain: 0 });
    if (!seen.has(k)) b.met++;
    seen.add(k);
    if (!standing(e)) b.slain++;
  }
}

function endRun(run: SortieRun, how: NonNullable<SortieRun['over']>) {
  run.over = how;
  run.screen = 'over';
  if (how === 'won') note(run, `${bossOf(run).victory} The sortie is a success!`, 'good');
}

/** Give up the run: the XP stays, the haul is left behind. */
export function quitRun(run: SortieRun) {
  if (run.over) return;
  if (run.combat?.kind === 'boss' && !run.combat.over) run.lordWon = true;
  if (run.combat) tally(run, run.combat);
  endRun(run, 'quit');
}

/** XP the run has earned, up to its cap. */
export const xpCap = (run: SortieRun) => Math.floor(SORTIE.caps[run.mode][run.length] * tierPay(run) + 1e-9);
export const runXp = (run: SortieRun) => Math.min(xpCap(run), Math.floor(run.xp * tierPay(run) + 1e-9));
/** A Shard run keeps its haul only by finishing or heading home. */
export const keepsHaul = (run: SortieRun) => run.mode === 'shard' && (run.over === 'won' || run.over === 'home');
/** On a Shard run, the units wiped out: each comes home scarred or in a coma. */
/** A unit wiped out on the run takes home half its XP. */
export const memberXp = (run: SortieRun, m: SortieMember) => (memberUp(m) ? runXp(run) : Math.floor(runXp(run) / 2));
export const fallenUnits = (run: SortieRun): Unit[] => (run.mode === 'shard' && run.over ? run.party.filter((m) => !memberUp(m)).map((m) => m.unit) : []);

/** Any active unit can go on a free run. */
export const canSortie = (u: Unit) => u.status === 'active';

// --- Auto-play: the balance tests and the Auto button --------------------------------------------------------------

/** The best skill for the unit the game waits on to use now (as its order or turn), and its target. */
export function autoChoice(run: SortieRun): { id: string; target?: string } | null {
  const c = run.combat;
  const me = actingSquad(run);
  if (!c?.need || !me) return null;
  const model = turnModel(run);
  const models = model ? [model] : active(me);
  const skills = skillsFor(run, me, model).filter((s) => !s.wait && !s.blocked);
  const ok = (id: string) => skills.some((s) => s.id === id);
  const hurt = partyLine(c).reduce((n, p) => n + active(p).reduce((x, m) => x + m.max - m.hp, 0), 0);
  const shaken = models.filter((m) => m.shaken).length;
  if (ok('heal') && hurt >= healOf(me) * 0.75) return { id: 'heal' };
  if (ok('regroup') && (shaken * 2 >= models.length || statusOn(c, me, 'bleed'))) return { id: 'regroup' };
  if (ok('barrage') && onField(c).length) return { id: 'barrage', target: [...onField(c)].sort((a, b) => worth(b, 3) - worth(a, 3))[0]?.key };
  if (ok('field') && onField(c).length) return { id: 'field' };
  const incoming = onField(c).filter((e) => e.intent === 'melee' || e.intent === 'shoot' || e.intent === 'charge').length;
  if (ok('shield') && incoming >= 2) return { id: 'shield' };
  if (ok('outflank') && onField(c).some((e) => gap(e, me) > 2)) return { id: 'outflank' };
  // Attacks: what each would do this round, summed over the models carrying it out.
  const atwill = models.reduce((n, m) => n + (bestAttack(run, me, m, true)?.v ?? 0), 0);
  let best: { id: string; target?: string; v: number } = { id: 'atwill', v: atwill };
  for (const sk of skills) {
    if (sk.kind !== 'weapon' && sk.kind !== 'charge') continue;
    for (const key of skillTargets(run, sk)) {
      const t = squadByKey(c, key)!;
      let v = 0;
      for (const m of models) {
        const guns = sk.kind === 'charge' ? m.guns.filter((g) => g.melee) : m.guns.filter((g) => g.name === sk.gun);
        v += guns.length ? worth(t, expect(run, me, guns, t, sk.melee ? 1 : gap(t, me), !!sk.melee)) : bestAttack(run, me, m)?.v ?? 0;
      }
      if (sk.kind === 'charge') v += me.impact * models.length * 0.5 + (distOf(t) > 1 ? 1 : 0);
      if (v > best.v * 1.05) best = { id: sk.id, target: key, v };
    }
  }
  const mend = models.reduce((n, m) => n + Math.min(m.max - m.hp, Math.ceil(m.max / 3)), 0);
  if (ok('regroup') && mend > 0 && best.v < 0.05 + mend * 0.02) return { id: 'regroup' };
  return best;
}

/** Make the choice the game is waiting on with autoChoice. */
export function autoMove(run: SortieRun) {
  const c = run.combat;
  if (!c?.need) return;
  const p = autoChoice(run) ?? { id: 'atwill' };
  if (c.need === 'order') giveOrder(run, p.id, p.target);
  else act(run, p.id, p.target);
}

/** How hurt the party is, as a share of all its wounds. */
const hurtShare = (run: SortieRun) => allModels(run).reduce((n, m) => n + m.max - Math.max(0, m.hp), 0) / allModels(run).reduce((n, m) => n + m.max, 0);

/** One step of a whole run on autopilot: the tests use it to play runs to the end. */
export function autoStep(run: SortieRun, book: CatalogBook) {
  if (run.over) return;
  switch (run.screen) {
    case 'map': {
      const next = reachable(run);
      const hurt = hurtShare(run);
      const pref = (n: SortieNode) => (n.kind === 'camp' ? hurt * 4 : n.kind === 'cache' ? 2 : n.kind === 'shrine' || n.kind === 'shop' ? 1.5 : n.kind === 'elite' ? (hurt < 0.3 ? 1.6 : 0) : 1);
      return enterNode(run, book, [...next].sort((a, b) => pref(b) - pref(a))[0]);
    }
    case 'combat':
      if (run.combat?.over) return leaveCombat(run);
      return autoMove(run);
    case 'reward': {
      if (run.offer?.patch && hurtShare(run) > 0.25) return patchUp(run);
      return pickBoon(run, run.offer?.boons.length ? 0 : null);
    }
    case 'camp':
      return campRest(run);
    case 'shop': {
      const s = run.shop!;
      if (!s.healed && hurtShare(run) > 0.3 && run.haul.supply >= shopPrice(run, SORTIE.shop.heal)) return shopHeal(run);
      const buy = s.boons.map((b, i) => ({ ...b, i })).filter((b) => !b.sold && b.price <= run.haul.supply).sort((a, b) => a.price - b.price)[0];
      return buy ? shopBuy(run, buy.i) : leaveShop(run);
    }
    case 'event': {
      if (run.event?.result !== undefined) return leaveEvent(run, book);
      const ev = eventOf(run)!;
      const i = ev.choices.findIndex((ch) => choiceOpen(run, ch) && !ch.win.hurt);
      return eventChoose(run, Math.max(0, i));
    }
  }
}
