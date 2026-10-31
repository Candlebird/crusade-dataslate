import type { MissionDef } from '../missions';
import type { Hook, SpellDef } from '../oprRules';
import { newSide, score, type Holder, type TeamKey, type TrackedBattle } from '../tracker';
import type { AiStyle } from '../aiTrees';
import { dist, los, makeBoard, moveSquares, neighbours, reachable, xy, zoneOf, type BoardShape, type MoveOpts } from './board';
import {
  atHalf, attack, canShoot, defendRaw, has, heal, holds, inches, morale, rulesOf, settle, shootable, sum, woundsLeft, type Ctx,
} from './combat';
import { d6, hashSeed, resume, roll } from './dice';
import { alive, join, maxWoundsOf, modelHooks, toughOf, unitHooks, woundsOf, type ZProfile } from './profile';
import {
  fighting, onTable, other, sideName, unitById, type Effect, type LogDice, type LogLine, type SideIx, type ZBattle, type ZHolder, type ZMember, type ZUnit,
} from './state';

// The zone battle's rules: deployment, activations and orders, melee, spells, the mission's markers, rounds and the
// result. Every change goes through here and leaves the battle as plain data, ready to save.

/** Most a side can crowd into one zone: a squad takes 1, a big model 2, a titan 3 or 4. */
export const ZONE_CAP = 4;

export interface ZSetupUnit {
  id: string;
  side: SideIx;
  owner: string;
  name: string;
  p: ZProfile;
  points: number;
  ai: AiStyle;
  spells: SpellDef[];
  /** Battle-Worn: it already fought this round (its Quality and Defense already carry the -1). */
  worn?: boolean;
}

export interface ZSetup {
  id: string;
  mission: MissionDef;
  /** Points a side, for the board size. */
  points: number;
  sector?: Parameters<typeof makeBoard>[0]['sector'];
  shape?: BoardShape;
  seed: number | string;
  members: ZMember[];
  teams: [TeamKey, TeamKey];
  units: ZSetupUnit[];
  smart: [boolean, boolean];
  practice?: boolean;
}

/** A new battle, at the heroes-join step. Side 0 attacks on Attack & Defend missions. */
export function createBattle(s: ZSetup): ZBattle {
  const seed = typeof s.seed === 'number' ? s.seed : hashSeed(s.seed);
  const rng = resume({ seed, n: 0 });
  const board = makeBoard({ points: s.points, mission: s.mission, sector: s.sector, shape: s.shape, rng });
  const units: ZUnit[] = s.units.map((u) => {
    const hooks = unitHooks(u.p);
    return {
      id: u.id, side: u.side, owner: u.owner, name: u.name, p: u.p, sq: -1,
      startModels: alive(u.p).length, startWounds: woundsLeft0(u.p), points: u.points, ai: u.ai,
      ...(has(hooks, 'scout') ? { scout: true } : {}), ...(has(hooks, 'ambush') ? { ambush: true } : {}),
      activated: false, shaken: false, routed: false, destroyed: has(hooks, 'absent') || !alive(u.p).length, fought: false, held: false, charging: false,
      tokens: 0, spells: u.spells, used: {}, effects: [], xp: {}, ...(u.worn ? { worn: true } : {}),
    };
  });
  // two units of the same name on a side are told apart in the log: "Scourges", "Scourges 2"
  for (const side of [0, 1]) {
    const seen = new Map<string, number>();
    for (const u of units.filter((x) => x.side === side)) {
      const k = (seen.get(u.name) ?? 0) + 1;
      seen.set(u.name, k);
      if (k > 1) u.name = `${u.name} ${k}`;
    }
  }
  const n = board.objectives.length;
  const b: ZBattle = {
    v: 1, id: s.id, mission: s.mission, board, units, members: s.members, teams: s.teams,
    round: 1, rounds: s.mission.rounds || 4, phase: 'join', turn: 0, first: 0, rng: rng.saved(), log: [],
    control: Array(n).fill(''), history: [], carried: Array(n).fill(null), gone: Array(n).fill(false), counters: [{}, {}], smart: s.smart,
    ...(s.practice ? { practice: true } : {}),
  };
  if (kindOf(b) === 'smash') {
    const r = resume(b.rng);
    const relic = Math.floor(r() * n);
    let trap = n > 1 ? Math.floor(r() * (n - 1)) : -1;
    if (trap >= relic) trap++;
    b.secret = { relic, trap };
    b.rng = r.saved();
  }
  if (kindOf(b) === 'lastStand') b.reserve = { used: [], waiting: [] };
  if (kindOf(b) === 'vip' && n) b.counters[1].vipFrom = b.board.objectives[0].sq;
  return b;
}

const woundsLeft0 = (p: ZProfile) => alive(p).reduce((s, m) => s + p.kits[m.kit].tough - m.hurt, 0);

/** What the mission asks of its markers. */
export type MissionKind = 'standard' | 'carry' | 'sabotage' | 'demolition' | 'mosh' | 'smash' | 'vip' | 'rescue' | 'lastStand';
export function kindOf(b: Pick<ZBattle, 'mission'>): MissionKind {
  switch (b.mission.id) {
    case 'opr-relic-hunt': case 'opr-capture-and-hold': return 'carry';
    case 'opr-sabotage': return 'sabotage';
    case 'opr-demolition': return 'demolition';
    case 'opr-mosh-pit': return 'mosh';
    case 'opr-smash-and-grab': return 'smash';
    case 'opr-vip-escort': return 'vip';
    case 'opr-the-rescue': return 'rescue';
    case 'opr-last-stand': return 'lastStand';
    default: return 'standard';
  }
}

/** Runs a change with the battle's dice, and saves where the dice got to. */
function withDice<T>(b: ZBattle, fn: (c: Ctx) => T): { out: LogLine[]; value: T } {
  const rng = resume(b.rng);
  const c: Ctx = { b, rng, out: [] };
  const value = fn(c);
  b.rng = rng.saved();
  b.log.push(...c.out);
  return { out: c.out, value };
}

const line = (c: Ctx, l: Omit<LogLine, 'round'>) => c.out.push({ round: c.b.round, ...l });

// ---- Size and crowding ----

/** Slots a unit takes in a zone. */
export function slots(u: ZUnit): number {
  const t = toughOf(u.p);
  return t >= 18 ? 4 : t >= 12 ? 3 : t >= 6 ? 2 : 1;
}

export function zoneLoad(b: ZBattle, side: SideIx, zone: number, except?: ZUnit): number {
  return onTable(b).reduce((s, u) => (u.side === side && u !== except && zoneOf(b.board, u.sq) === zone ? s + slots(u) : s), 0);
}

/** Can the unit stand on this square: no enemy on it, not Blocking, and room in its zone. */
export function canStand(b: ZBattle, u: ZUnit, sq: number): boolean {
  if (sq < 0 || b.board.terrain[sq]?.blocking) return false;
  if (onTable(b).some((x) => x.side !== u.side && x.sq === sq)) return false;
  return zoneLoad(b, u.side, zoneOf(b.board, sq), u) + slots(u) <= ZONE_CAP;
}

// ---- Heroes joining ----

/** Units a hero can join: friendly, not a hero themselves, without a hero already, and the hero Tough 6 or less. */
export function joinTargets(b: ZBattle, hero: ZUnit): ZUnit[] {
  if (!isHeroUnit(hero) || hero.joinedTo || has(unitHooks(hero.p), 'loner') || toughOf(hero.p) > 6 || hero.destroyed) return [];
  return b.units.filter((u) => u.side === hero.side && u !== hero && !u.joinedTo && !u.destroyed && !isHeroUnit(u)
    && !u.p.kits.some((k) => k.hero) && !b.units.some((x) => x.joinedTo === u.id)
    // as at the table: only a multi-model unit with no Tough(7+) models takes a hero
    && u.p.models.length > 1 && u.p.kits.every((k) => k.tough <= 6));
}
export const isHeroUnit = (u: ZUnit) => u.p.kits.length === 1 && u.p.kits[0].hero && u.p.models.length === 1;

export function joinHero(b: ZBattle, heroId: string, unitId: string) {
  const hero = unitById(b, heroId)!;
  const unit = unitById(b, unitId)!;
  if (!joinTargets(b, hero).includes(unit)) return;
  unit.p = join(unit.p, hero.p);
  unit.startModels = alive(unit.p).length;
  unit.startWounds = woundsLeft0(unit.p);
  unit.spells = [...unit.spells, ...hero.spells];
  hero.joinedTo = unit.id;
  if (hero.scout && !unit.scout) delete hero.scout;
  b.log.push({ round: 0, side: unit.side, unit: unit.id, kind: 'info', text: `${hero.name} joins ${unit.name}.` });
}

/** The AI's heroes join the unit that suits them: same style, most points. */
export function autoJoin(b: ZBattle, side: SideIx) {
  for (const h of b.units.filter((u) => u.side === side && isHeroUnit(u) && !u.joinedTo)) {
    const opts = joinTargets(b, h).sort((x, y) => Number(y.ai === h.ai) - Number(x.ai === h.ai) || y.points - x.points);
    if (opts[0]) joinHero(b, h.id, opts[0].id);
  }
}

// ---- Deployment ----

/** Units still to deploy on a side: the rest first, then Scouts. */
export function toDeploy(b: ZBattle, side: SideIx): ZUnit[] {
  const left = b.units.filter((u) => u.side === side && fighting(u) && u.sq < 0 && !u.used.ambushing && !u.used.reserve);
  const plain = left.filter((u) => !u.scout);
  return plain.length ? plain : left;
}

export function startDeploy(b: ZBattle) {
  b.phase = 'deploy';
  b.turn = isAmbushMission(b) ? nextDeployer(b, 0) : b.first;
  if (!toDeploy(b, b.turn).length) b.turn = other(b.turn);
}

/** A Fortification (Immobile): it may set up anywhere outside the enemy's deployment zone. */
export const isFortification = (u: ZUnit) => has(unitHooks(u.p), 'immobile');

/** The Ambush mission: the defender puts half its army down, the attacker deploys among it, then the defender the rest. */
const isAmbushMission = (b: Pick<ZBattle, 'mission'>) => b.mission.id === 'opr-ambush';
const defenderDown = (b: ZBattle) => b.units.filter((u) => u.side === 1 && fighting(u) && (u.sq >= 0 || u.used.ambushing || u.used.reserve)).length;
/** The Ambush mission's first wave: half the defender's units, rounded up. */
const firstWave = (b: ZBattle) => Math.ceil(b.units.filter((u) => u.side === 1 && fighting(u)).length / 2);
const inFirstWave = (b: ZBattle, side: SideIx) => side === 1 && defenderDown(b) < firstWave(b);

/** Who deploys next after `acted`: the sides alternate, or on Ambush the mission's three waves. */
function nextDeployer(b: ZBattle, acted: SideIx): SideIx {
  if (isAmbushMission(b)) {
    if (inFirstWave(b, 1) && toDeploy(b, 1).length) return 1;
    return toDeploy(b, 0).length ? 0 : 1;
  }
  const o = other(acted);
  return toDeploy(b, o).length ? o : acted;
}

/**
 * Squares a unit may deploy on: its zone, or up to 2 squares out of it for a Scout once everyone else is down. On
 * Ambush, after the defender's first wave, anywhere over 12" from the enemy (and the attacker within 6" of a friend
 * once it has one down). A Fortification may also go anywhere outside the enemy's zone.
 */
export function deploySquares(b: ZBattle, u: ZUnit): number[] {
  const zone = b.board.deploy[u.side];
  const plainLeft = [0, 1].some((s) => b.units.some((x) => x.side === s && fighting(x) && x.sq < 0 && !x.scout && !x.used.ambushing && !x.used.reserve));
  const enemyZone = new Set(b.board.deploy[other(u.side)]);
  let squares = zone;
  const open = isAmbushMission(b) && !inFirstWave(b, u.side);
  if (open) {
    const foes = onTable(b).filter((x) => x.side !== u.side), friends = onTable(b).filter((x) => x.side === u.side);
    squares = all(b.board).filter((sq) => foes.every((f) => dist(b.board, sq, f.sq) >= 3)
      && (u.side === 1 || !friends.length || friends.some((f) => dist(b.board, sq, f.sq) <= 1)));
    if (isFortification(u)) squares = all(b.board).filter((sq) => !enemyZone.has(sq) && foes.every((f) => dist(b.board, sq, f.sq) >= 3));
  } else if (isFortification(u)) {
    squares = all(b.board).filter((sq) => !enemyZone.has(sq) || zone.includes(sq));
  } else if (u.scout && !plainLeft) {
    const set = new Set(zone);
    for (const z of zone) for (const [sq] of reachable(b.board, z, 2, { flying: true })) set.add(sq);
    squares = [...set].filter((sq) => !enemyZone.has(sq) || zone.includes(sq));
  }
  return squares.filter((sq) => canStand(b, u, sq));
}

const all = (b: Pick<ZBattle['board'], 'w' | 'h'>) => Array.from({ length: b.w * b.h }, (_, i) => i);

/** What the deploying player is told about where its units go. */
export function deployHint(b: ZBattle, side: SideIx): string {
  const fort = toDeploy(b, side).some(isFortification) ? ' Fortifications may go anywhere outside the enemy\'s zone.' : '';
  if (!isAmbushMission(b)) return `Pick a unit, then a lit square in your zone. Deployment alternates; Scouts go last.${fort}`;
  if (inFirstWave(b, side)) return `Ambush: the defender first deploys half its army (${firstWave(b)} units) in its zone.${fort}`;
  return side === 0
    ? `Ambush: deploy anywhere over 12" from the enemy, each unit after the first within 6" of a friend.${fort}`
    : `Ambush: deploy the rest anywhere over 12" from the enemy.${fort}`;
}

/** Puts a unit down (or in Ambush), then passes the turn. Once everyone is down, round 1 begins. */
export function deploy(b: ZBattle, id: string, where: number | 'ambush') {
  const u = unitById(b, id);
  if (!u || b.phase !== 'deploy' || u.side !== b.turn) return;
  if (where === 'ambush') {
    if (!u.ambush) return;
    u.used.ambushing = 1;
    b.log.push({ round: 0, side: u.side, unit: u.id, kind: 'deploy', text: `${u.name} waits in Ambush.` });
  } else {
    if (!deploySquares(b, u).includes(where)) return;
    u.sq = where;
    b.log.push({ round: 0, side: u.side, unit: u.id, kind: 'deploy', text: `${u.name} deploys.`, path: [where, where] });
  }
  b.turn = nextDeployer(b, b.turn);
  if (!toDeploy(b, 0).length && !toDeploy(b, 1).length) beginBattle(b);
}

/** Picks a square for a unit to deploy on: shooters back, fighters forward, near markers, spread across zones. */
export function pickDeploy(b: ZBattle, u: ZUnit): number | 'ambush' {
  if (u.ambush && u.ai !== 'shooting') return 'ambush';
  const opts = deploySquares(b, u);
  if (!opts.length) return u.ambush ? 'ambush' : -1;
  // On Ambush the enemy may already stand outside its zone: what to keep near (or away from) is its units.
  const foes = onTable(b).filter((x) => x.side !== u.side).map((x) => x.sq);
  const enemyZone = isAmbushMission(b) && foes.length ? foes : b.board.deploy[other(u.side)];
  const markers = b.board.objectives.map((o) => o.sq);
  const scoreSq = (sq: number) => {
    const toEnemy = enemyZone.length ? Math.min(...enemyZone.map((e) => dist(b.board, sq, e))) : 0;
    const toMarker = markers.length ? Math.min(...markers.map((m) => dist(b.board, sq, m))) : 0;
    const load = zoneLoad(b, u.side, zoneOf(b.board, sq));
    const cover = b.board.terrain[sq]?.cover ? 1 : 0;
    // A Fortification can't move once down: on a marker if it can, in cover, and out of easy charge reach.
    if (isFortification(u)) return -toMarker * 1.2 - load * 0.8 + cover * 0.5 - Math.max(0, 3 - toEnemy);
    const fwd = u.ai === 'shooting' ? toEnemy * 0.3 : -toEnemy;
    return fwd - toMarker * 0.6 - load * 0.8 + cover * (u.ai === 'shooting' ? 1 : 0.3);
  };
  return [...opts].sort((x, y) => scoreSq(y) - scoreSq(x) || x - y)[0];
}

/** Deploys the rest of a side's units for it (the Auto-deploy button, and the AI). */
export function autoDeploy(b: ZBattle, side: SideIx, all = false) {
  let guard = 0;
  while (b.phase === 'deploy' && guard++ < 400) {
    if (b.turn !== side) { if (!all) break; }
    const s = b.turn;
    const u = toDeploy(b, s)[0];
    if (!u) break;
    if (s !== side && !all) break;
    const at = pickDeploy(b, u);
    if (at === -1) { u.used.reserve = 1; b.turn = nextDeployer(b, s); if (!toDeploy(b, 0).length && !toDeploy(b, 1).length) beginBattle(b); continue; }
    deploy(b, u.id, at);
  }
}

function beginBattle(b: ZBattle) {
  b.phase = 'battle';
  b.round = 1;
  withDice(b, (c) => startRound(c));
}

// ---- Rounds ----

/** Units that can still activate this round; while Ambushers are being placed, the side's ones still to place. */
export function ready(b: ZBattle, side: SideIx): ZUnit[] {
  if (b.placing) return inAmbush(b, side);
  return b.units.filter((u) => u.side === side && fighting(u) && !u.activated && u.sq >= 0);
}

/** A side's units in Ambush not yet placed (or kept waiting) this round. */
const inAmbush = (b: ZBattle, side: SideIx) =>
  b.units.filter((u) => u.side === side && fighting(u) && u.sq < 0 && u.used.ambushing && !u.used[`wait:${b.round}`]);

function startRound(c: Ctx) {
  const b = c.b;
  line(c, { kind: 'round', text: `Round ${b.round}` });
  for (const u of b.units) { u.activated = false; u.fought = false; u.chargedBy = undefined; u.charging = false; }
  b.turn = b.first;
  // Casters gather tokens.
  for (const u of b.units.filter((x) => fighting(x))) {
    const n = unitHooks(u.p).filter((h) => h.k === 'caster').reduce((s, h) => s + (h as { n: number }).n, 0);
    if (n) u.tokens = Math.min(6, u.tokens + n);
  }
  missionRoundStart(c);
  for (const u of onTable(b)) fire(c, u, 'roundStart');
  sweep(c);
  // Ambush: from round 2, units waiting in Ambush are placed first, the sides alternating from the one that activates first.
  if (b.round >= 2 && (inAmbush(b, 0).length || inAmbush(b, 1).length)) {
    b.placing = true;
    if (!inAmbush(b, b.turn).length) b.turn = other(b.turn);
    return;
  }
  openRound(c);
}

/** The activations begin: the first side, or the other if the first has nobody to activate. */
function openRound(c: Ctx) {
  const b = c.b;
  delete b.placing;
  b.turn = b.first;
  if (!ready(b, b.turn).length) b.turn = other(b.turn);
  // Nobody on the table to activate (every unit waiting in Ambush): the round passes.
  if (!ready(b, b.turn).length) endRound(c);
}

/**
 * Places a unit from Ambush anywhere over 9" from every enemy, or keeps it waiting for a later round. Placing isn't its
 * activation: it activates in the round as usual. Placed in the last round, it can't seize or contest markers.
 */
function placeAmbusher(c: Ctx, u: ZUnit, o: Order) {
  const b = c.b;
  const squares = arriveSquares(b, u);
  if (o.action === 'arrive' && squares.length) {
    const sq = o.to !== undefined && squares.includes(o.to) ? o.to : squares[0];
    u.sq = sq;
    delete u.used.ambushing;
    const late = b.round >= b.rounds;
    if (late) u.used.late = 1;
    line(c, { side: u.side, unit: u.id, kind: 'move', text: `${u.name} arrives from Ambush${late ? ': in the last round, it can\'t seize or contest markers' : ''}.`, path: [sq, sq] });
  } else {
    u.used[`wait:${b.round}`] = 1;
    line(c, { side: u.side, unit: u.id, kind: 'info', text: `${u.name} stays in Ambush.` });
  }
  const o2 = other(u.side);
  if (inAmbush(b, o2).length) b.turn = o2;
  else if (!inAmbush(b, u.side).length) openRound(c);
}

/** Passes the turn after an activation; ends the round when no one has a unit left to activate. */
function passTurn(c: Ctx, acted: SideIx) {
  const b = c.b;
  const o = other(acted);
  if (!ready(b, acted).length && b.finishedFirst === undefined) b.finishedFirst = acted;
  if (ready(b, o).length) b.turn = o;
  else if (ready(b, acted).length) { b.turn = acted; if (b.finishedFirst === undefined) b.finishedFirst = o; }
  else endRound(c);
}

function endRound(c: Ctx) {
  const b = c.b;
  seize(c);
  missionRoundEnd(c);
  b.history.push([...b.control]);
  for (const u of b.units) {
    u.effects = u.effects.filter((e) => !(e.until === 'round' && e.round <= b.round) && !((e.until === 'next' || e.until === 'once') && e.round < b.round));
  }
  if (b.round >= b.rounds || !onTable(b).some((u) => u.side === 0) && !hasReserves(b, 0) || !onTable(b).some((u) => u.side === 1) && !hasReserves(b, 1)) {
    finish(c);
    return;
  }
  b.first = b.finishedFirst ?? b.first;
  b.finishedFirst = undefined;
  b.round++;
  startRound(c);
}

const hasReserves = (b: ZBattle, side: SideIx) => b.units.some((u) => u.side === side && fighting(u) && u.sq < 0 && (u.used.ambushing || b.reserve?.waiting.includes(u.id)));

// ---- Activations ----

export type Action = 'hold' | 'advance' | 'rush' | 'charge' | 'idle' | 'arrive' | 'wait';

export interface Order {
  unit: string;
  action: Action;
  /** Where it moves to (advance, rush, arrive). */
  to?: number;
  /** Who it shoots or charges. */
  target?: string;
  spell?: { name: string; targets: string[] };
  choice?: 'a' | 'b';
  /** Who its abilities on activation (a heal, an aid, a hex) go to; left out, the best pick. */
  aid?: string;
}

const moveOpts = (b: ZBattle, u: ZUnit): MoveOpts => {
  const h = rulesOf(b, u);
  return { strider: has(h, 'strider'), flying: has(h, 'flying'), blocked: (sq) => !canStand(b, u, sq) };
};

/** How many squares it moves on an Advance and a Rush (or Charge). */
export function speed(b: ZBattle, u: ZUnit): { advance: number; rush: number } {
  const h = rulesOf(b, u);
  if (has(h, 'immobile')) return { advance: 0, rush: 0 };
  const view = { b, me: u };
  let adv = 6, rush = 12;
  for (const x of h) if (x.k === 'move' && holds(x.c, view)) { adv += x.adv; rush += x.rush; }
  if (has(h, 'slow')) { adv -= 2; rush -= 4; }
  if (u.used[`pinned:${b.round}`]) return { advance: 0, rush: 0 };
  return { advance: moveSquares(adv), rush: moveSquares(rush) };
}

/** Squares it can Advance or Rush to. */
export function moves(b: ZBattle, u: ZUnit, action: 'advance' | 'rush'): Map<number, number> {
  if (u.sq < 0) return new Map();
  const s = speed(b, u);
  return reachable(b.board, u.sq, action === 'advance' ? s.advance : s.rush, moveOpts(b, u));
}

/**
 * Enemies it can charge: its full Rush move, ending on a square beside the enemy. `froms` are the squares it may strike
 * from (any side of the enemy it can get to within that move, going round enemies and terrain, never through them);
 * `from` is the nearest, the one taken when none is picked.
 */
export function chargeTargets(b: ZBattle, u: ZUnit): { target: ZUnit; from: number; froms: number[] }[] {
  if (u.sq < 0) return [];
  const steps = speed(b, u).rush;
  if (!steps) return [];
  const opts = moveOpts(b, u);
  const enemyOn = (sq: number) => onTable(b).some((x) => x.side !== u.side && x.sq === sq);
  const out: { target: ZUnit; from: number; froms: number[] }[] = [];
  for (const t of onTable(b)) {
    if (t.side === u.side) continue;
    const sh = rulesOf(b, t).find((h) => h.k === 'shroud') as { charge: number } | undefined;
    const reach = sh ? Math.min(steps, moveSquares(Math.max(0, 12 + (steps - 2) * 6 - sh.charge))) : steps;
    if (dist(b.board, u.sq, t.sq) > reach + 1) continue;
    const near = reachable(b.board, u.sq, reach, { ...opts, noPass: enemyOn, blocked: (sq) => sq !== u.sq && !canStand(b, u, sq) });
    const cost = ([sq, s]: [number, number]) => (sq === u.sq ? -1 : s);
    const froms = [...near].filter(([sq]) => dist(b.board, sq, t.sq) === 1).sort((x, y) => cost(x) - cost(y) || x[0] - y[0]).map(([sq]) => sq);
    if (froms.length) out.push({ target: t, from: froms[0], froms });
  }
  return out;
}

/** Enemies beside it that it can fight in melee (it has a melee weapon), as after an Advance. */
export function meleeTargets(b: ZBattle, u: ZUnit): ZUnit[] {
  if (u.sq < 0 || !alive(u.p).some((m) => m.guns.some((g) => u.p.guns[g].range === 0))) return [];
  return onTable(b).filter((t) => t.side !== u.side && dist(b.board, u.sq, t.sq) <= 1);
}

/** Squares an Ambush unit can arrive on: over 9" (2 squares) from every enemy. */
export function arriveSquares(b: ZBattle, u: ZUnit): number[] {
  const enemies = onTable(b).filter((x) => x.side !== u.side);
  const out: number[] = [];
  for (let sq = 0; sq < b.board.w * b.board.h; sq++)
    if (canStand(b, u, sq) && enemies.every((e) => dist(b.board, sq, e.sq) >= 2)) out.push(sq);
  return out;
}

/** The orders a unit can take now. */
export function actions(b: ZBattle, u: ZUnit): Action[] {
  if (u.sq < 0) return b.placing && inAmbush(b, u.side).includes(u) ? (arriveSquares(b, u).length ? ['arrive', 'wait'] : ['wait']) : [];
  if (u.shaken && !has(rulesOf(b, u), 'rally')) return ['idle'];
  const out: Action[] = ['hold'];
  const s = speed(b, u);
  if (s.advance) out.push('advance');
  if (s.rush) out.push('rush');
  if (chargeTargets(b, u).length) out.push('charge');
  return out;
}

/**
 * Plays one activation. Returns what happened, for the log and the map. With `split`, a unit that holds or moves and
 * then shoots stops before its shooting: `b.pending` holds it, and `attackNow` plays the shooting (on the screen, a
 * stage of its own). `split` true does so only when there's something in reach; 'always' whenever the unit has guns.
 */
export function act(b: ZBattle, o: Order, split: boolean | 'always' = false): LogLine[] {
  const u = unitById(b, o.unit);
  if (!u || b.phase !== 'battle' || b.pending || u.side !== b.turn || !ready(b, u.side).includes(u)) return [];
  if (b.placing) return withDice(b, (c) => { placeAmbusher(c, u, o); sweep(c); }).out;
  return withDice(b, (c) => {
    const next = activate(c, u, o);
    if (next === 'shoot' && fighting(u) && u.sq >= 0) {
      // After an Advance it may fight an enemy beside it instead of shooting.
      const melee = o.action === 'advance' && !u.held && meleeTargets(b, u).length > 0;
      if (split && (melee || (hasGuns(u) && (split === 'always' || shootable(c, u).length)))) {
        b.pending = { unit: u.id, target: unitById(b, o.target ?? '')?.side === u.side ? undefined : o.target, ...(melee ? { melee } : {}) };
        sweep(c);
        return;
      }
      shootOrHold(c, u, o.target);
    }
    wrapUp(c, u, next !== 'quiet');
  }).out;
}

/**
 * The second stage of a split activation: the moved unit shoots (at `target`, or as it planned), unless it holds its
 * fire. With `melee`, a unit that advanced fights `target`, an enemy beside it, instead: not a charge, so no Impact
 * and no charge bonuses, and it stays where it is.
 */
export function attackNow(b: ZBattle, target?: string, holdFire = false, melee = false): LogLine[] {
  const p = b.pending;
  const u = p && unitById(b, p.unit);
  delete b.pending;
  if (!u || b.phase !== 'battle') return [];
  return withDice(b, (c) => {
    const foe = melee && p!.melee && fighting(u) ? meleeTargets(b, u).find((t) => t.id === target) : undefined;
    if (foe) fight(c, u, foe, u.sq, false);
    else if (!holdFire && fighting(u) && u.sq >= 0) shootOrHold(c, u, target ?? p!.target);
    else if (holdFire) line(c, { side: u.side, unit: u.id, kind: 'move', text: `${u.name} holds its fire.` });
    wrapUp(c, u);
  }).out;
}

/** Does `u` carry a gun (a weapon with a range)? */
export const hasGuns = (u: ZUnit) => u.p.guns.some((g) => g.range > 0);

/** Shoots; a unit that held and had nothing to shoot at still shows in the log, so nobody wonders what it did. */
function shootOrHold(c: Ctx, u: ZUnit, target?: string) {
  const logged = c.out.length;
  shoot(c, u, target);
  if (c.out.length === logged && u.held) line(c, { side: u.side, unit: u.id, kind: 'move', text: `${u.name} holds.` });
}

/** Ends an activation: the gifts it used up go and it picks up what it stands on (unless `full` is false), then the turn passes. */
function wrapUp(c: Ctx, u: ZUnit, full = true) {
  if (full) {
    u.charging = false;
    u.effects = u.effects.filter((e) => !e.spend);
    if (!u.destroyed && !u.routed) pickUp(c, u);
  } else for (const e of u.effects) delete e.spend;
  sweep(c);
  passTurn(c, u.side);
}

/**
 * Plays an activation up to its shooting: 'shoot' when shooting follows (after an Advance, or a Rush that may shoot),
 * 'done' when it's over, 'quiet' when it only arrived or recovered (nothing used up, nothing picked up).
 */
function activate(c: Ctx, u: ZUnit, o: Order): 'shoot' | 'done' | 'quiet' {
  const b = c.b;
  u.activated = true;
  for (const e of u.effects) if (e.until === 'once' && e.mark === undefined) e.spend = true;
  if (u.sq < 0) return 'quiet';
  if (u.shaken) {
    const rally = has(rulesOf(b, u), 'rally');
    const r = rally ? d6(c.rng) : 0;
    if (!rally || r < 4) {
      u.shaken = false;
      u.held = true;
      line(c, { side: u.side, unit: u.id, kind: 'morale', text: `${u.name} stays put and recovers from Shaken.`, dice: rally ? [{ label: 'Rally', need: 4, rolls: [r], ok: 0 }] : undefined });
      return 'quiet';
    }
    u.shaken = false;
    line(c, { side: u.side, unit: u.id, kind: 'morale', text: `${u.name} rallies.`, dice: [{ label: 'Rally', need: 4, rolls: [r], ok: 1 }] });
  }
  if (o.choice) {
    const ch = unitHooks(u.p).find((h) => h.k === 'choice') as { a: Hook[]; b: Hook[] } | undefined;
    if (ch) { u.choice = o.choice; u.effects.push({ give: o.choice === 'a' ? ch.a : ch.b, until: 'round', round: b.round, from: u.name }); }
  }
  fire(c, u, 'activation', o.aid ?? o.target);
  if (o.spell) cast(c, u, o.spell.name, o.spell.targets);
  if (u.destroyed || u.routed) return 'quiet';
  const action = actions(b, u).includes(o.action) ? o.action : 'hold';
  u.held = action === 'hold';
  u.charging = false;
  if (action === 'charge') {
    const ct = chargeTargets(b, u);
    const pick = ct.find((x) => x.target.id === o.target) ?? ct[0];
    if (pick) charge(c, u, pick.target, o.to !== undefined && pick.froms.includes(o.to) ? o.to : pick.from);
  } else if (action === 'advance' || action === 'rush') {
    const opts = moves(b, u, action);
    const to = o.to !== undefined && opts.has(o.to) ? o.to : u.sq;
    move(c, u, to, action);
    return !u.destroyed && (action === 'advance' || has(rulesOf(b, u), 'rushShoot')) ? 'shoot' : 'done';
  } else {
    if (action === 'hold') fire(c, u, 'hold');
    return u.destroyed ? 'done' : 'shoot';
  }
  return 'done';
}

function move(c: Ctx, u: ZUnit, to: number, action: string) {
  const from = u.sq;
  if (to === from) {
    line(c, { side: u.side, unit: u.id, kind: 'move', text: `${u.name} holds its ground.` });
    return;
  }
  u.sq = to;
  carryMarkers(c.b, u);
  line(c, { side: u.side, unit: u.id, kind: 'move', text: `${u.name} ${action === 'rush' ? 'rushes' : 'advances'}${terrainName(c.b, to)}.`, path: [from, to] });
  dangerous(c, u);
}

const terrainName = (b: ZBattle, sq: number) => (b.board.terrain[sq] ? ` into the ${b.board.terrain[sq]!.name.toLowerCase()}` : '');

/** Dangerous terrain: a die per model (up to 3 for a big one), each 1 a wound. Fliers are above it. */
function dangerous(c: Ctx, u: ZUnit) {
  const t = c.b.board.terrain[u.sq];
  if (!t?.dangerous || has(rulesOf(c.b, u), 'flying')) return;
  const n = alive(u.p).reduce((s, m) => s + Math.min(3, u.p.kits[m.kit].tough >= 3 ? 3 : 1), 0);
  const rolls = Array.from({ length: n }, () => d6(c.rng));
  const w = rolls.filter((r) => r === 1).length;
  const res = w ? defendRaw(c, u, w, 99, 'Dangerous terrain', []) : { wounds: 0, dice: [] };
  line(c, { side: u.side, unit: u.id, kind: 'ability', text: `${u.name} crosses dangerous ground${w ? ` and takes ${res.wounds} wound${res.wounds === 1 ? '' : 's'}` : ' unharmed'}.`, dice: [{ label: 'Dangerous terrain', need: 2, rolls, ok: n - w }, ...res.dice] });
}

// ---- Shooting ----

/** The enemy each gun shoots: the target if it can, otherwise the nearest it can reach. */
export function gunTargets(b: ZBattle, u: ZUnit, target?: ZUnit): Map<ZUnit, Set<number>> {
  const out = new Map<ZUnit, Set<number>>();
  const enemies = onTable(b).filter((x) => x.side !== u.side).sort((x, y) => dist(b.board, u.sq, x.sq) - dist(b.board, u.sq, y.sq));
  const c = { b };
  for (const m of alive(u.p)) for (const gi of m.guns) {
    if (u.p.guns[gi].range <= 0) continue;
    const t = target && canShoot(c, u, m, gi, target) ? target : enemies.find((e) => canShoot(c, u, m, gi, e));
    if (!t) continue;
    const set = out.get(t) ?? new Set<number>();
    set.add(gi);
    out.set(t, set);
  }
  return out;
}

/** Shoots with every gun that reaches: the picked target, or the nearest enemy each gun can reach. */
export function shoot(c: Ctx, u: ZUnit, targetId?: string) {
  const b = c.b;
  if (u.sq < 0) return;
  const target = targetId ? unitById(b, targetId) : undefined;
  const plan = gunTargets(b, u, target && onTable(b).includes(target) ? target : shootable(c, u)[0]);
  if (!plan.size) return;
  const nearest = [...onTable(b)].filter((x) => x.side !== u.side).sort((x, y) => dist(b.board, u.sq, x.sq) - dist(b.board, u.sq, y.sq))[0];
  for (const [t, guns] of plan) {
    if (t.destroyed || t.routed) continue;
    const before = { models: alive(t.p).length, half: atHalf(t) };
    const r = attack(c, u, t, alive(u.p), { kind: 'shoot', guns: (_g, i) => guns.has(i), closest: t === nearest });
    const names = [...guns].map((i) => u.p.guns[i].name).join(', ');
    const killed = before.models - alive(t.p).length;
    line(c, {
      side: u.side, unit: u.id, target: t.id, kind: 'shoot', wounds: r.wounds,
      text: `${u.name} shoots ${t.name} (${names}): ${r.wounds} wound${r.wounds === 1 ? '' : 's'}${killed ? `, ${killed} model${killed === 1 ? '' : 's'} down` : ''}${t.destroyed ? ' — destroyed' : ''}.`,
      dice: r.dice,
    });
    settle(c);
    if (!t.destroyed && r.wounds && atHalf(t)) morale(c, t, 'half strength');
  }
  fire(c, u, 'shot');
}

// ---- Melee ----

const isFirst = (u: ZUnit, gi: number) => u.p.guns[gi].hooks.some((h) => h.k === 'strikeFirst');

function charge(c: Ctx, u: ZUnit, t: ZUnit, from: number) {
  const b = c.b;
  const start = u.sq;
  if (from !== start) { u.sq = from; carryMarkers(b, u); dangerous(c, u); if (u.destroyed) return; }
  u.charging = true;
  t.chargedBy = u.id;
  line(c, { side: u.side, unit: u.id, target: t.id, kind: 'move', text: `${u.name} charges ${t.name}.`, path: [start, t.sq] });
  fire(c, u, 'charge', t.id);
  fire(c, t, 'charged', u.id);
  fight(c, u, t, from, true);
}

/**
 * Melee between `u` and `t`: Impact (on a charge), strike-first weapons, the attacker, the rest; then the loser tests
 * morale, and the attacker takes the ground if the defender is gone, otherwise stands at `from`.
 */
function fight(c: Ctx, u: ZUnit, t: ZUnit, from: number, charging: boolean) {
  const b = c.b;
  if (u.destroyed || u.routed || t.destroyed || t.routed) { settle(c); return; }
  if (!charging) line(c, { side: u.side, unit: u.id, target: t.id, kind: 'move', text: `${u.name} attacks ${t.name} in melee.` });
  const dealt = [0, 0];
  // Impact: hits on 2+, less one for each model with Counter.
  const imp = !charging ? 0 : impactOf(u) - alive(t.p).filter((m) => modelHooks(t.p, m).some((h) => h.k === 'counter') || m.guns.some((g) => t.p.guns[g].hooks.some((h) => h.k === 'counter'))).length;
  if (imp > 0) {
    const rolls = Array.from({ length: imp }, () => d6(c.rng));
    const hits = rolls.filter((r) => r >= 2).length;
    const res = hits ? defendRaw(c, t, hits, 0, 'Impact', [], u) : { wounds: 0, kills: 0, dice: [] };
    dealt[0] += res.wounds;
    line(c, { side: u.side, unit: u.id, target: t.id, kind: 'melee', wounds: res.wounds, text: `${u.name} slams into ${t.name}: ${res.wounds} wound${res.wounds === 1 ? '' : 's'} from Impact.`, dice: [{ label: 'Impact', need: 2, rolls, ok: hits }, ...res.dice] });
  }
  const strike = (a: ZUnit, d: ZUnit, guns: (gi: number) => boolean, who: 'first' | 'charge' | 'back') => {
    if (a.destroyed || a.routed || d.destroyed || d.routed || !alive(a.p).length) return;
    const models = alive(a.p).filter((m) => m.guns.some((g) => a.p.guns[g].range === 0 && guns(g)));
    if (!models.length) return;
    const sixes = a.fought || (who !== 'charge' && a.shaken);
    const r = attack(c, a, d, models, { kind: 'melee', charging: charging && who === 'charge', sixesOnly: sixes, guns: (_g, i) => guns(i) });
    // Ravage: dice of its own, each 6 a wound.
    const rav = rulesOf(b, a).reduce((n, h) => (h.k === 'ravage' ? n + h.n : n), 0);
    let ravW = 0;
    if (rav) {
      const rs = Array.from({ length: rav }, () => d6(c.rng));
      const n6 = rs.filter((x) => x === 6).length;
      if (n6) ravW = defendRaw(c, d, n6, 99, 'Ravage', [], a).wounds;
      r.dice.push({ label: 'Ravage', need: 6, rolls: rs, ok: n6 });
    }
    dealt[a === u ? 0 : 1] += r.wounds + ravW;
    const verb = who === 'first' ? 'strikes first at' : who === 'charge' ? 'fights' : 'strikes back at';
    line(c, {
      side: a.side, unit: a.id, target: d.id, kind: 'melee', wounds: r.wounds + ravW,
      text: `${a.name} ${verb} ${d.name}${sixes ? ' (6s only)' : ''}: ${r.wounds + ravW} wound${r.wounds + ravW === 1 ? '' : 's'}${d.destroyed ? ' — destroyed' : ''}.`,
      dice: r.dice,
    });
    settle(c);
  };
  strike(t, u, (gi) => isFirst(t, gi), 'first');
  strike(u, t, () => true, 'charge');
  strike(t, u, (gi) => !isFirst(t, gi), 'back');
  u.fought = true;
  t.fought = true;
  // Who won: wounds dealt, Fear counting as more.
  const fear = (x: ZUnit) => sum(rulesOf(b, x), 'fear', () => true);
  const a = dealt[0] + (u.destroyed ? 0 : fear(u));
  const d = dealt[1] + (t.destroyed ? 0 : fear(t));
  const dread = (x: ZUnit) => sum(rulesOf(b, x), 'dread', () => true);
  if (a > d && !t.destroyed && !t.routed) morale(c, t, 'lost the melee', dread(u));
  else if (d > a && !u.destroyed && !u.routed) morale(c, u, 'lost the melee', dread(t));
  // The charger takes the ground if the defender is gone, otherwise steps back.
  if (!u.destroyed && !u.routed) {
    if ((t.destroyed || t.routed) && canStand(b, u, t.sq)) u.sq = t.sq;
    else u.sq = from;
    carryMarkers(b, u);
  }
}

function impactOf(u: ZUnit): number {
  let n = 0;
  const models = alive(u.p);
  for (const m of models) n += modelHooks(u.p, m).filter((h) => h.k === 'impact').reduce((s, h) => s + (h as { n: number }).n, 0);
  for (const h of u.p.shared) if (h.k === 'impact') n += h.n * models.length;
  const per = unitHooks(u.p).find((h) => h.k === 'impactPer') as { models: number; max: number } | undefined;
  if (per) n += Math.min(per.max, Math.floor(models.length / per.models));
  return n;
}

// ---- Spells ----

/** Casts a spell: tokens spent, a 4+ (5+ if an enemy caster within 18" spends a token to stop it), less the battle's castBonus. */
export function cast(c: Ctx, u: ZUnit, name: string, targetIds: string[]): boolean {
  const b = c.b;
  const s = u.spells.find((x) => x.name === name);
  if (!s || s.none || u.tokens < s.threshold || has(rulesOf(b, u), 'spellproof') || has(rulesOf(b, u), 'silenced')) return false;
  const targets = targetIds.map((id) => unitById(b, id)).filter((t): t is ZUnit => !!t && onTable(b).includes(t) && (t.side === u.side) === (s.side === 'friend') && inches(b, u, t) <= s.range + 2).slice(0, s.targets);
  if (!targets.length) return false;
  u.tokens -= s.threshold;
  const stopper = onTable(b).find((x) => x.side !== u.side && x.tokens > 0 && inches(b, u, x) <= 18 && !has(rulesOf(b, x), 'silenced'));
  if (stopper) stopper.tokens--;
  const need = (stopper ? 5 : 4) - (b.castBonus ?? 0);
  const r = d6(c.rng);
  const dice: LogDice[] = [{ label: `Cast ${s.name}`, need, rolls: [r], ok: r >= need ? 1 : 0 }];
  if (r < need) {
    line(c, { side: u.side, unit: u.id, kind: 'spell', text: `${u.name} casts ${s.name}, but it fails${stopper ? ` (${stopper.name} works against it)` : ''}.`, dice });
    return false;
  }
  const bits: string[] = [];
  for (const t of targets) {
    const ward = rulesOf(b, t).find((h) => h.k === 'spellWard') as { on: number } | undefined;
    if (s.side === 'enemy' && (has(rulesOf(b, t), 'spellproof') || (ward && d6(c.rng) >= ward.on))) { bits.push(`${t.name} shrugs it off`); continue; }
    if (s.hits) {
      const res = defendRaw(c, t, roll(s.hits.n, c.rng), s.hits.ap, s.name, s.hits.rules ?? [], u, true);
      dice.push(...res.dice);
      bits.push(`${t.name} takes ${res.wounds} wound${res.wounds === 1 ? '' : 's'}${t.destroyed ? ' and is destroyed' : ''}`);
      settle(c);
      if (!t.destroyed && res.wounds && atHalf(t)) morale(c, t, 'half strength');
    }
    if (s.give?.length) {
      t.effects.push({ give: s.give, ...(s.mark ? { mark: u.side } : {}), until: s.side === 'friend' ? 'once' : 'next', round: b.round, from: s.name });
      bits.push(`${t.name} ${s.mark ? 'is marked' : s.side === 'friend' ? 'is empowered' : 'is hexed'}`);
    }
  }
  line(c, { side: u.side, unit: u.id, target: targets[0].id, kind: 'spell', text: `${u.name} casts ${s.name}: ${bits.join('; ') || 'done'}.`, dice });
  return true;
}

/** Spells a unit can cast now, with the units each could target. */
export function castable(b: ZBattle, u: ZUnit): { spell: SpellDef; targets: ZUnit[] }[] {
  if (u.sq < 0 || has(rulesOf(b, u), 'silenced')) return [];
  return u.spells.filter((s) => !s.none && u.tokens >= s.threshold).map((s) => ({
    spell: s,
    targets: onTable(b).filter((t) => (t.side === u.side) === (s.side === 'friend') && inches(b, u, t) <= s.range + 2),
  })).filter((x) => x.targets.length);
}

// ---- Rules that go off at a moment ----

const perOk = (u: ZUnit, key: string, per: string | undefined, round: number) => {
  if (!per) return true;
  const k = per === 'round' ? `${key}:${round}` : key;
  const n = u.used[k] ?? 0;
  if (n >= (per === 'twice' ? 2 : 1)) return false;
  u.used[k] = n + 1;
  return true;
};

/** Heals, hits, buffs, marks and terror the unit's rules do at a moment (round start, activation, charge…). */
function fire(c: Ctx, u: ZUnit, at: string, targetId?: string) {
  const b = c.b;
  if (u.sq < 0 || !fighting(u)) return;
  const hooks = unitHooks(u.p);
  hooks.forEach((h, i) => {
    if (u.destroyed || u.routed) return;
    const key = `${at}:${i}:${h.k}`;
    if (h.k === 'heal' && h.at === at) {
      const hurt = healable(b, u, h).sort((x, y) => Number(y.id === targetId) - Number(x.id === targetId) || (maxWoundsOf(y.p) - woundsLeft(y)) - (maxWoundsOf(x.p) - woundsLeft(x)));
      if (!hurt.length || !perOk(u, key, h.per, b.round)) return;
      for (const t of hurt.slice(0, h.targets ?? 1)) {
        const r = h.on ? d6(c.rng) : 7;
        if (h.on && r < h.on) continue;
        const n = heal(t, roll(h.n, c.rng), h.revive);
        if (n) line(c, { side: u.side, unit: u.id, target: t.id, kind: 'ability', text: `${u.name} heals ${t === u ? 'itself' : t.name}: ${n} wound${n === 1 ? '' : 's'} back.` });
      }
    } else if (h.k === 'hits' && h.at === at) {
      let pool = onTable(b).filter((x) => (h.who === 'all' ? x !== u : x.side !== u.side) && inches(b, u, x) <= h.range + 2 && (!h.los || canSee(b, u, x)));
      if (!pool.length || !perOk(u, key, h.per, b.round)) return;
      if (h.who === 'enemy') {
        const t = pool.find((x) => x.id === targetId) ?? pool.sort((x, y) => dist(b.board, u.sq, x.sq) - dist(b.board, u.sq, y.sq))[0];
        pool = [t];
      } else if (h.targets) pool = pool.slice(0, h.targets);
      for (const t of pool) {
        if (h.on) { const r = d6(c.rng); if (r < h.on) continue; }
        const res = defendRaw(c, t, roll(h.n, c.rng), h.ap, '', h.rules ?? [], u);
        line(c, { side: u.side, unit: u.id, target: t.id, kind: 'ability', wounds: res.wounds, text: `${u.name} hits ${t.name}: ${res.wounds} wound${res.wounds === 1 ? '' : 's'}${t.destroyed ? ' — destroyed' : ''}.`, dice: res.dice });
        settle(c);
        if (!t.destroyed && res.wounds && atHalf(t) && at !== 'charge') morale(c, t, 'half strength');
      }
    } else if (h.k === 'buff' && h.at === at) {
      const enemy = h.side === 'enemy';
      let pool = h.self && !enemy ? [u] : onTable(b).filter((x) => (enemy ? x.side !== u.side : x.side === u.side && x !== u) && inches(b, u, x) <= h.range + 2 && (!h.los || canSee(b, u, x)));
      if (!pool.length) return;
      if (enemy) {
        const t = pool.find((x) => x.id === targetId) ?? pool.sort((x, y) => dist(b.board, u.sq, x.sq) - dist(b.board, u.sq, y.sq))[0];
        pool = [t];
      } else if (!h.self) pool = pool.sort((x, y) => Number(y.id === targetId) - Number(x.id === targetId) || Number(x.activated) - Number(y.activated) || y.points - x.points).slice(0, h.targets ?? 1);
      if (!perOk(u, key, h.per, b.round)) return;
      if (h.on) { const r = d6(c.rng); if (r < h.on) return; }
      for (const t of pool) {
        const e: Effect = { give: h.give, ...(h.mark ? { mark: u.side } : {}), until: h.until, round: b.round, from: u.name };
        t.effects.push(e);
      }
      line(c, { side: u.side, unit: u.id, target: pool[0].id, kind: 'ability', text: `${u.name} ${h.mark ? 'marks' : enemy ? 'hinders' : 'aids'} ${pool.map((x) => (x === u ? 'itself' : x.name)).join(', ')}.` });
    } else if (h.k === 'terror' && at === 'activation') {
      let pool = onTable(b).filter((x) => x.side !== u.side && inches(b, u, x) <= h.range + 2);
      if (!pool.length || !perOk(u, key, h.per, b.round)) return;
      pool = h.targets ? pool.slice(0, h.targets) : [pool.find((x) => x.id === targetId) ?? pool[0]];
      for (const t of pool) {
        if (morale(c, t, `${u.name}'s terror`)) continue;
        if (h.hits) defendRaw(c, t, h.hits, 0, 'Terror', [], u);
        if (h.pin) t.used[`pinned:${b.round}`] = 1;
      }
    } else if (h.k === 'steady' && at === 'activation') {
      const t = onTable(b).find((x) => x.side === u.side && x.shaken && inches(b, u, x) <= h.range + 2);
      if (!t || u.used.steady) return;
      u.used.steady = 1;
      t.shaken = false;
      line(c, { side: u.side, unit: u.id, target: t.id, kind: 'ability', text: `${u.name} steadies ${t.name}.` });
    }
  });
}

/** The units a heal can mend: the hurt ones in reach (or the unit itself). */
function healable(b: ZBattle, u: ZUnit, h: Extract<Hook, { k: 'heal' }>) {
  const pool = h.who === 'self' ? [u] : onTable(b).filter((x) => x.side === u.side && inches(b, u, x) <= (h.range ?? 6) + 2);
  return pool.filter((x) => woundsLeft(x) < maxWoundsOf(x.p) && (!h.toughOnly || toughOf(x.p) >= 3));
}

const perLeft = (b: ZBattle, u: ZUnit, key: string, per: string | undefined) =>
  !per || (u.used[per === 'round' ? `${key}:${b.round}` : key] ?? 0) < (per === 'twice' ? 2 : 1);

export interface Usable {
  /** What it does, for the orders. */
  label: string;
  /** Who it can go to, where the player picks; empty when nobody is in reach (or it picks itself). */
  targets: ZUnit[];
  /** It goes off on its own (on itself, or on everyone in reach), with nothing to pick. */
  auto?: boolean;
}

/** What the unit's rules do as it activates, before it moves (Mend, aids, hexes, terror), for the player to see and aim. */
export function onActivation(b: ZBattle, u: ZUnit): Usable[] {
  if (u.sq < 0 || !fighting(u)) return [];
  const out: Usable[] = [];
  unitHooks(u.p).forEach((h, i) => {
    const key = `activation:${i}:${h.k}`;
    const odds = 'on' in h && h.on ? ` on a ${h.on}+` : '';
    if (h.k === 'heal' && h.at === 'activation') {
      if (!perLeft(b, u, key, h.per)) return;
      const t = healable(b, u, h);
      if (h.who === 'self') out.push({ label: `Heals itself ${h.n}${odds}`, targets: [], auto: true });
      else out.push({ label: `Heals ${h.n}${odds}: a friend within ${h.range ?? 6}"${h.toughOnly ? ' with Tough' : ''}`, targets: t });
    } else if (h.k === 'hits' && h.at === 'activation') {
      if (!perLeft(b, u, key, h.per)) return;
      const t = onTable(b).filter((x) => (h.who === 'all' ? x !== u : x.side !== u.side) && inches(b, u, x) <= h.range + 2 && (!h.los || canSee(b, u, x)));
      out.push(h.who === 'enemy' ? { label: `${h.n} hits${odds}: an enemy within ${h.range}"`, targets: t } : { label: `${h.n} hits${odds} on ${h.who === 'all' ? 'every unit' : 'every enemy'} within ${h.range}"`, targets: [], auto: true });
    } else if (h.k === 'buff' && h.at === 'activation') {
      if (!perLeft(b, u, key, h.per)) return;
      const enemy = h.side === 'enemy';
      if (h.self && !enemy) { out.push({ label: `Aids itself${odds}`, targets: [], auto: true }); return; }
      const t = onTable(b).filter((x) => (enemy ? x.side !== u.side : x.side === u.side && x !== u) && inches(b, u, x) <= h.range + 2 && (!h.los || canSee(b, u, x)));
      out.push({ label: `${h.mark ? 'Marks' : enemy ? 'Hinders' : 'Aids'}${odds}: ${enemy ? 'an enemy' : 'a friend'} within ${h.range}"`, targets: t });
    } else if (h.k === 'terror') {
      if (!perLeft(b, u, key, h.per)) return;
      const t = onTable(b).filter((x) => x.side !== u.side && inches(b, u, x) <= h.range + 2);
      out.push(h.targets ? { label: `Terror on ${h.targets} enem${h.targets === 1 ? 'y' : 'ies'} within ${h.range}"`, targets: [], auto: true } : { label: `Terror: an enemy within ${h.range}" tests morale`, targets: t });
    }
  });
  return out;
}

const canSee = (b: ZBattle, u: ZUnit, t: ZUnit) => u.sq >= 0 && t.sq >= 0 && (dist(b.board, u.sq, t.sq) <= 1 || los(b.board, u.sq, t.sq));

// ---- After damage ----

/** Units gone this action: Last Stand sends attackers back to reserve once; carried markers drop. */
function sweep(c: Ctx) {
  const b = c.b;
  for (const u of b.units) {
    if ((u.destroyed || u.routed || u.shaken) && b.carried.includes(u.id)) dropCarried(c, u);
    if (u.destroyed && b.reserve && u.side === 0 && !b.reserve.used.includes(u.id) && !u.joinedTo) {
      b.reserve.used.push(u.id);
      b.reserve.waiting.push(u.id);
      for (const m of u.p.models) { m.dead = false; m.hurt = 0; }
      u.destroyed = false;
      u.shaken = false;
      u.sq = -1;
      u.used.lostOnce = 1;
      line(c, { side: u.side, unit: u.id, kind: 'info', text: `${u.name} falls back to reserve.` });
    }
  }
}

function dropCarried(c: Ctx, u: ZUnit) {
  const b = c.b;
  b.carried = b.carried.map((id, i) => {
    if (id !== u.id) return id;
    if (u.sq >= 0) b.board.objectives[i].sq = u.sq;
    line(c, { side: u.side, unit: u.id, kind: 'objective', text: `${u.name} drops the ${markerName(b, i)}.` });
    // The Rescue: the defender moves a dropped marker a square back toward the middle.
    if (kindOf(b) === 'rescue') {
      const [x, y] = xy(b.board, b.board.objectives[i].sq);
      const nx = x + Math.sign(Math.floor(b.board.w / 2) - x), ny = y + Math.sign(Math.floor(b.board.h / 2) - y);
      const sq = ny * b.board.w + nx;
      if (!b.board.terrain[sq]?.blocking) b.board.objectives[i].sq = sq;
    }
    return null;
  });
}

function carryMarkers(b: ZBattle, u: ZUnit) {
  b.carried.forEach((id, i) => { if (id === u.id && u.sq >= 0) b.board.objectives[i].sq = u.sq; });
}

export const markerName = (b: ZBattle, i: number) => {
  const k = kindOf(b);
  if (k === 'smash' && b.secret?.relic === i && b.carried[i]) return 'relic';
  if (k === 'carry' || k === 'rescue') return b.mission.id === 'opr-relic-hunt' ? 'relic' : 'marker';
  if (k === 'vip') return 'VIP';
  return `marker ${i + 1}`;
};

/** Picks up a marker in its zone at the end of its activation, if no enemy stands there (carry missions). */
function pickUp(c: Ctx, u: ZUnit) {
  const b = c.b;
  const k = kindOf(b);
  if (!['carry', 'rescue', 'smash'].includes(k) || u.sq < 0 || u.shaken || u.used.late || !fighting(u)) return;
  if ((k === 'rescue' || k === 'smash') && u.side !== 0) return;
  if (b.carried.includes(u.id)) return;
  const zone = zoneOf(b.board, u.sq);
  b.board.objectives.forEach((o, i) => {
    if (b.gone[i] || b.carried[i] || zoneOf(b.board, o.sq) !== zone) return;
    if (k === 'smash' && !(b.secret?.relic === i && b.control[i] === 0)) return;
    if (onTable(b).some((x) => x.side !== u.side && !x.shaken && zoneOf(b.board, x.sq) === zone)) return;
    if (b.carried.includes(u.id)) return;
    b.carried[i] = u.id;
    o.sq = u.sq;
    b.control[i] = u.side;
    line(c, { side: u.side, unit: u.id, kind: 'objective', text: `${u.name} picks up the ${markerName(b, i)}.` });
  });
}

// ---- Markers and the mission ----

/** Who's in a marker's zone, unshaken. */
function presence(b: ZBattle, sq: number): [boolean, boolean] {
  const z = zoneOf(b.board, sq);
  const out: [boolean, boolean] = [false, false];
  for (const u of onTable(b)) if (!u.shaken && !u.used.late && zoneOf(b.board, u.sq) === z) out[u.side] = true;
  return out;
}

/** End of round: each marker goes to the side alone in its zone, contested when both are, unchanged when neither. */
function seize(c: Ctx) {
  const b = c.b;
  const k = kindOf(b);
  b.board.objectives.forEach((o, i) => {
    if (b.gone[i]) { b.control[i] = ''; return; }
    const carrier = b.carried[i] ? unitById(b, b.carried[i]!) : undefined;
    if (carrier) { b.control[i] = carrier.side; return; }
    const [a, d] = presence(b, o.sq);
    const was = b.control[i];
    const now: ZHolder = a && d ? 'x' : a ? 0 : d ? 1 : was;
    if (now !== was && (now === 0 || now === 1)) line(c, { side: now, kind: 'objective', text: `${sideName(b, now)} seizes ${markerName(b, i)}.` });
    b.control[i] = now;
    // Own markers: seizing the enemy's destroys it.
    if ((k === 'sabotage' || k === 'demolition') && o.owner !== undefined && now !== 'x' && now !== '' && now !== o.owner) {
      b.gone[i] = true;
      b.control[i] = '';
      const by = now as SideIx;
      const ownGone = b.board.objectives.some((x, j) => x.owner === by && b.gone[j] && j !== i);
      if (k === 'sabotage') b.counters[by].destroyed = 1;
      if (k === 'demolition' && ownGone) b.counters[by].avenged = 1;
      line(c, { side: by, kind: 'objective', text: `The ${by === 0 ? 'first' : 'second'} side destroys the enemy marker.` });
    }
    // Smash & Grab: an attacker seizing a marker reveals it.
    if (k === 'smash' && now === 0 && b.secret && !b.carried[i]) {
      if (i === b.secret.trap && !b.counters[0][`trap${i}`]) {
        b.counters[0][`trap${i}`] = 1;
        const victim = onTable(b).find((u) => u.side === 0 && zoneOf(b.board, u.sq) === zoneOf(b.board, o.sq));
        if (victim) {
          const res = defendRaw(c, victim, d6(c.rng) + 1, 0, 'Trap', []);
          line(c, { side: 1, target: victim.id, kind: 'objective', text: `It's a trap! ${victim.name} takes ${res.wounds} wound${res.wounds === 1 ? '' : 's'}.`, dice: res.dice });
        }
      }
      if (i !== b.secret.relic) { b.gone[i] = true; b.control[i] = ''; line(c, { side: 0, kind: 'objective', text: `Marker ${i + 1} is a decoy, and is removed.` }); }
      else {
        const carrier2 = onTable(b).find((u) => u.side === 0 && !u.shaken && zoneOf(b.board, u.sq) === zoneOf(b.board, o.sq));
        if (carrier2) { b.carried[i] = carrier2.id; o.sq = carrier2.sq; line(c, { side: 0, unit: carrier2.id, kind: 'objective', text: `Marker ${i + 1} is the relic! ${carrier2.name} takes it.` }); }
      }
    }
  });
}

function missionRoundEnd(c: Ctx) {
  const b = c.b;
  const k = kindOf(b);
  if (k === 'demolition') for (const s of [0, 1] as SideIx[]) {
    const own = b.board.objectives.findIndex((o) => o.owner === s);
    if (own >= 0 && !b.gone[own]) b.counters[s].intact = Math.min(4, (b.counters[s].intact ?? 0) + 1);
  }
  if (k === 'mosh') {
    const now = b.control[0];
    const before = b.history.length ? b.history[b.history.length - 1][0] : '';
    if (now === 0 || now === 1) if (before !== other(now)) b.counters[now].fresh = Math.min(4, (b.counters[now].fresh ?? 0) + 1);
  }
}

function missionRoundStart(c: Ctx) {
  const b = c.b;
  const k = kindOf(b);
  if (k === 'vip' && b.round > 1 && b.control[0] === 1 && !b.gone[0]) {
    const o = b.board.objectives[0];
    const goal = vipGoal(b);
    const from = o.sq;
    let sq = from;
    for (let i = 0; i < 2; i++) {
      const next = neighbours(b.board, sq).filter((n) => !b.board.terrain[n]?.blocking && !onTable(b).some((u) => u.side === 0 && u.sq === n))
        .sort((x, y) => goalDist(b, x, goal) - goalDist(b, y, goal))[0];
      if (next === undefined || goalDist(b, next, goal) >= goalDist(b, sq, goal)) break;
      sq = next;
    }
    if (sq !== from) { o.sq = sq; line(c, { side: 1, kind: 'objective', text: 'The VIP moves on.', path: [from, sq] }); }
  }
  if (b.reserve && b.round > 1) {
    if (!onTable(b).some((u) => u.side === 0)) {
      for (const id of b.reserve.waiting) { const u = unitById(b, id); if (u) u.destroyed = true; }
      b.reserve.waiting = [];
    }
    for (const id of [...b.reserve.waiting]) {
      const u = unitById(b, id)!;
      const r = d6(c.rng);
      if (r < 6) continue;
      const edge = edgeSquares(b).filter((sq) => canStand(b, u, sq) && onTable(b).every((e) => e.side === u.side || dist(b.board, sq, e.sq) >= 2));
      if (!edge.length) continue;
      u.sq = edge[Math.floor(c.rng() * edge.length)];
      b.reserve.waiting = b.reserve.waiting.filter((x) => x !== id);
      line(c, { side: 0, unit: u.id, kind: 'move', text: `${u.name} returns from reserve.`, dice: [{ label: 'Reserve', need: 6, rolls: [r], ok: 1 }], path: [u.sq, u.sq] });
    }
  }
}

const edgeSquares = (b: ZBattle) => {
  if (b.board.edges.length) return b.board.edges;
  const out: number[] = [];
  for (let sq = 0; sq < b.board.w * b.board.h; sq++) if (onEdge(b, sq)) out.push(sq);
  return out;
};
const onEdge = (b: ZBattle, sq: number) => { const [x, y] = xy(b.board, sq); return x === 0 || y === 0 || x === b.board.w - 1 || y === b.board.h - 1; };

/** VIP Escort: the edge opposite the one the VIP started nearest, as 'x0', 'x1', 'y0', 'y1'. */
function vipGoal(b: ZBattle): string {
  const [x, y] = xy(b.board, b.counters[1].vipFrom ?? b.board.objectives[0].sq);
  const d = [['x1', x], ['x0', b.board.w - 1 - x], ['y1', y], ['y0', b.board.h - 1 - y]] as [string, number][];
  return d.sort((p, q) => p[1] - q[1])[0][0];
}
function goalDist(b: ZBattle, sq: number, goal: string) {
  const [x, y] = xy(b.board, sq);
  return goal === 'x1' ? b.board.w - 1 - x : goal === 'x0' ? x : goal === 'y1' ? b.board.h - 1 - y : y;
}

// ---- The result ----

/** Points a side has lost: a unit gone (or Routed) all of its points, any other the share of wounds it lost. */
export function pointsLost(b: ZBattle, side: SideIx): number {
  let lost = 0;
  for (const u of b.units.filter((x) => x.side === side && !x.joinedTo)) {
    const host = u;
    const kits = new Set(host.p.kits.map((k) => k.src));
    for (const src of kits) {
      const joined = b.units.find((x) => x.id === src && x.joinedTo === host.id);
      const pts = joined ? joined.points : host.points;
      if (host.destroyed || host.routed || host.used.lostOnce) { lost += pts; continue; }
      const max = maxWoundsOf(host.p, src);
      lost += max ? pts * (1 - woundsOf(host.p, src) / max) : 0;
    }
  }
  return Math.round(lost);
}

const totalPoints = (b: ZBattle, side: SideIx) => b.units.filter((u) => u.side === side).reduce((s, u) => s + u.points, 0);

/** The battle as the tracker scores it: two teams, the marker rows and the mission tallies. */
export function asTracked(b: ZBattle): TrackedBattle {
  const team = (h: ZHolder): Holder => (h === 0 || h === 1 ? b.teams[h] : h);
  return {
    id: b.id, startedAt: '', mission: b.mission, round: Math.max(1, b.history.length), objectives: b.board.objectives.length,
    control: b.history.map((row) => row.map(team)),
    sides: [newSide('z0', 'Side 1', b.teams[0]), newSide('z1', 'Side 2', b.teams[1])],
    counters: { [b.teams[0]]: b.counters[0], [b.teams[1]]: b.counters[1] },
    notes: '', ended: false, recorded: [],
  };
}

/** VP so far, per side. */
export function vpOf(b: ZBattle): [number, number] {
  const s = score(asTracked(b));
  return [s[b.teams[0]]?.total ?? 0, s[b.teams[1]]?.total ?? 0];
}

function finish(c: Ctx) {
  const b = c.b;
  const k = kindOf(b);
  if (k === 'sabotage') for (const s of [0, 1] as SideIx[]) {
    const own = b.board.objectives.findIndex((o) => o.owner === s);
    if (own >= 0 && b.gone[own]) b.counters[s].destroyed = 0;
  }
  if (k === 'smash' && b.secret) {
    const at = b.board.objectives[b.secret.relic].sq;
    const won: SideIx = b.carried[b.secret.relic] && unitById(b, b.carried[b.secret.relic]!)?.side === 0 && onEdge(b, at) ? 0 : 1;
    b.counters[won].won = 1;
  }
  if (k === 'vip' && b.board.objectives.length) b.counters[goalDist(b, b.board.objectives[0].sq, vipGoal(b)) === 0 ? 1 : 0].won = 1;
  if (k === 'rescue' && b.board.objectives.length) {
    const carrier = b.carried[0] ? unitById(b, b.carried[0]) : undefined;
    b.counters[carrier?.side === 0 && onEdge(b, b.board.objectives[0].sq) ? 0 : 1].won = 1;
  }
  // Tidy the tallies that aren't VP (the VIP's start, traps sprung) out of the scoring.
  for (const s of [0, 1] as SideIx[]) for (const key of Object.keys(b.counters[s])) if (key === 'vipFrom' || key.startsWith('trap')) delete b.counters[s][key];
  const vp = vpOf(b);
  const lost: [number, number] = [pointsLost(b, 0), pointsLost(b, 1)];
  const share: [number, number] = [lost[0] / Math.max(1, totalPoints(b, 0)), lost[1] / Math.max(1, totalPoints(b, 1))];
  let winner: SideIx | 'draw';
  let why: string;
  if (vp[0] !== vp[1]) { winner = vp[0] > vp[1] ? 0 : 1; why = `${vp[winner]}–${vp[other(winner)]} on VP`; }
  else if (Math.abs(share[0] - share[1]) <= 0.05) { winner = 'draw'; why = `level on VP (${vp[0]}–${vp[1]}) and on losses`; }
  else { winner = share[0] < share[1] ? 0 : 1; why = `level on VP (${vp[0]}–${vp[1]}), fewer points lost (${Math.round(share[winner] * 100)}% to ${Math.round(share[other(winner)] * 100)}%)`; }
  b.result = { winner, vp, lost, share, why };
  b.phase = 'ended';
  line(c, { kind: 'end', text: winner === 'draw' ? `The battle ends in a draw: ${why}.` : `${sideName(b, winner)} wins: ${why}.` });
}

/** Ends the battle now (a side concedes, or the table calls it). */
export function endNow(b: ZBattle) {
  if (b.phase === 'ended') return;
  delete b.pending;
  withDice(b, (c) => { if (b.phase === 'battle') { seize(c); b.history.push([...b.control]); } finish(c); });
}

