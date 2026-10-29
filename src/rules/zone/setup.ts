import type { Campaign, CatalogBook, Force, Unit } from '../../model/types';
import type { Hook } from '../oprRules';
import { bookRules } from '../oprRules';
import { activeEvent } from '../nexus';
import { modifierOf } from '../difficulty';
import { leadsWith } from '../warlords';
import { teamsOf, type Holder, type TeamKey, type TrackedBattle } from '../tracker';
import { createBattle, pointsLost, type ZSetup, type ZSetupUnit } from './engine';
import { setupUnit } from './sim';
import { maxWoundsOf, woundsOf } from './profile';
import { xy, idx } from './board';
import type { Effect, SideIx, ZBattle, ZHolder } from './state';

// From the campaign to a zone battle and back: the tracked battle's sides and units become the battle's, with the
// sector's modifiers and the round's Galactic Event in play; the result goes back onto the tracked battle, which is
// then recorded like any other game.

export { ZONE_REWARDS, type ZoneMode } from './rewards';
import type { ZoneMode } from './rewards';

export interface ZoneStart {
  battle: ZBattle;
  /** What's in play from the sector and the event, to show. */
  effects: string[];
}

/** The two teams in the order the battle wants them: the attacker first. */
export function zoneTeams(b: TrackedBattle): [TeamKey, TeamKey] | undefined {
  const teams = teamsOf(b);
  if (teams.length !== 2) return undefined;
  return b.attacker && teams.includes(b.attacker) ? [b.attacker, teams.find((t) => t !== b.attacker)!] : [teams[0], teams[1]];
}

/** Why a tracked battle can't be fought as a zone battle, if it can't. */
export function zoneBlock(b: TrackedBattle): string | undefined {
  if (b.ended) return 'The battle is already over';
  if (!zoneTeams(b)) return 'A zone battle needs exactly two teams';
  const armed = teamsOf(b).filter((t) => b.sides.some((s) => s.team === t && s.units.some((u) => !u.destroyed && u.wounds > 0)));
  return armed.length < 2 ? 'Each side needs units first' : undefined;
}

/** A battle unit's id: its tracker side and unit (two sides may field the same force unit id in a practice mirror). */
export const zoneKey = (sideId: string, unitId: string) => `${sideId}|${unitId}`;

const unitOf = (b: TrackedBattle, forces: Force[], sideId: string, unitId?: string): Unit | undefined => {
  const side = b.sides.find((s) => s.id === sideId);
  const force = forces.find((f) => f.id === side?.forceId);
  return (side?.roster ?? []).find((x) => x.id === unitId) ?? force?.units.find((x) => x.id === unitId);
};

/**
 * A zone battle for a tracked battle. `mode` says who plays: in Command every side with a person on it is theirs to
 * play (the rest is the AI's); in Quick the AI plays everyone.
 */
export function startZoneBattle(b: TrackedBattle, forces: Force[], books: CatalogBook[], mode: ZoneMode, c?: Campaign, seed: number | string = `${b.id}:${Date.now()}`): ZoneStart {
  const teams = zoneTeams(b)!;
  const sideOf = (team: TeamKey): SideIx => (team === teams[0] ? 0 : 1);
  const rules = bookRules(books);
  const units: ZSetupUnit[] = [];
  for (const side of b.sides) {
    const s = sideOf(side.team);
    for (const t of side.units) {
      if (t.destroyed || t.wounds <= 0) continue;
      const u = unitOf(b, forces, side.id, t.unitId);
      if (!u) continue;
      const book = books.find((x) => x.uid === u.bookUid) ?? books.find((x) => x.name === u.bookName);
      const key = zoneKey(side.id, t.id);
      const z = setupUnit(u, key, s, side.id, book, rules);
      // The tracker's wounds are the truth: they carry earlier losses (and a size the force page may not show).
      const full = maxWoundsOf(z.p);
      const pre = setupUnit(u, key, s, side.id, book, rules, Math.min(full, Math.round(t.wounds * (full / Math.max(1, t.maxWounds)))));
      // Battle-Worn (it already fought this round): -1 Quality and -1 Defense, so each needs one more on the die.
      if (t.worn) pre.p = { ...pre.p, kits: pre.p.kits.map((k) => ({ ...k, quality: Math.min(6, k.quality + 1), defense: Math.min(6, k.defense + 1) })) };
      units.push({ ...pre, name: t.name || pre.name, points: t.points ?? u.points, ...(t.aiStyle ? { ai: t.aiStyle } : {}) });
    }
  }
  const points = Math.max(...[0, 1].map((s) => units.filter((u) => u.side === s).reduce((n, u) => n + u.points, 0)));
  const sector = c?.sectors.find((s) => s.id === b.sectorId);
  const setup: ZSetup = {
    id: b.id, mission: b.mission, points, sector: sector?.type, seed,
    members: b.sides.filter((s) => s.team === teams[0] || s.team === teams[1])
      .map((s) => ({ id: s.id, name: s.name, side: sideOf(s.team), ai: mode === 'quick' || !!s.ai, team: s.team })),
    teams, units, smart: [true, true],
  };
  const effects: string[] = [];
  const later: { ids: string[]; e: Omit<Effect, 'from'>; from: string }[] = [];
  const att = units.filter((u) => u.side === 0);
  const def = units.filter((u) => u.side === 1);
  const best = (us: ZSetupUnit[], by: (u: ZSetupUnit) => number, n: number) => [...us].sort((x, y) => by(y) - by(x)).slice(0, n);
  const meleeOf = (u: ZSetupUnit) => u.p.models.reduce((s, m) => s + m.guns.filter((g) => u.p.guns[g].range === 0).length, 0) + (u.ai === 'melee' ? 5 : 0);
  const shootOf = (u: ZSetupUnit) => u.p.models.reduce((s, m) => s + m.guns.filter((g) => u.p.guns[g].range > 0).length, 0);
  const names = (us: ZSetupUnit[]) => us.map((u) => u.name).join(' & ');
  const gift = (us: ZSetupUnit[], from: string, give: Hook[], until: Effect['until'] = 'game') => { if (us.length) later.push({ ids: us.map((u) => u.id), e: { give, until, round: 1 }, from }); };
  const own = (us: ZSetupUnit[], hooks: Hook[]) => us.forEach((u) => { u.p = { ...u.p, shared: [...u.p.shared, ...hooks] }; });
  let first: SideIx | undefined;
  const board: ((z: ZBattle) => void)[] = [];

  if (sector && b.attacker && def.length) for (const m of (sector.modifiers ?? []).map(modifierOf)) {
    if (!m) continue;
    const say = (text: string) => effects.push(`${m.name}: ${text}`);
    switch (m.id) {
      case 'entrenched': gift(def, m.name, [{ k: 'def', n: 1 }], 'round'); say('the defenders get +1 to Defense in round 1.'); break;
      case 'lurkers': {
        const us = best(def.filter((u) => !u.p.shared.some((h) => h.k === 'ambush')), meleeOf, 2);
        own(us, [{ k: 'ambush' }]);
        if (us.length) say(`${names(us)} gain Ambush.`);
        break;
      }
      case 'fanatics': gift(def, m.name, [{ k: 'morale', n: 1 }]); say('the defenders get +1 to Morale tests.'); break;
      case 'regrowth': {
        const us = best(def.filter((u) => !u.p.kits.some((k) => k.hero)), (u) => maxWoundsOf(u.p), 1);
        own(us, [{ k: 'ignore', on: 5, regen: true }]);
        if (us.length) say(`${names(us)} gains Regeneration.`);
        break;
      }
      case 'veterans': { const us = best(def, meleeOf, 2); gift(us, m.name, [{ k: 'hit', n: 1, c: { when: 'melee' } }]); if (us.length) say(`${names(us)} get +1 to hit in melee.`); break; }
      case 'gunline': { const us = best(def.filter((u) => shootOf(u) > 0), shootOf, 1); gift(us, m.name, [{ k: 'hit', n: 1, c: { when: 'shoot' } }], 'next'); if (us.length) say(`${names(us)} gets +1 to hit shooting in rounds 1 and 2.`); break; }
      case 'fog': gift(att, m.name, [{ k: 'hit', n: -1, c: { when: 'shoot', over: 18 } }], 'next'); say('the attackers get -1 to hit shooting over 18" in rounds 1 and 2.'); break;
      case 'minefield': board.push((z) => mines(z)); say("the ground in front of the defenders' zone is Dangerous."); break;
      case 'bastion': board.push((z) => z.board.objectives.forEach((o) => { if (!z.board.terrain[o.sq]) z.board.terrain[o.sq] = { name: 'Bastion', cover: true }; })); say('every marker stands in cover.'); break;
      case 'initiative': first = 1; say('the defender deploys and activates first.'); break;
      case 'tide': {
        const us = best(def.filter((u) => !u.p.kits.some((k) => k.hero)), (u) => u.points, 1);
        own(us, us.map((u) => ({ k: 'revive', on: 1, hp: maxWoundsOf(u.p) }) as Hook));
        if (us.length) say(`${names(us)} comes back once at full strength when destroyed.`);
        break;
      }
      default: say('no effect in a zone battle.');
    }
  }
  const event = c && activeEvent(c);
  if (event?.id === 'ionStorm') {
    gift(units, event.name, [{ k: 'hit', n: -1, c: { when: 'shoot', over: 18 } }], 'next');
    effects.push(`${event.name}: everyone gets -1 to hit shooting over 18" in rounds 1 and 2.`);
  } else if (event?.cast) effects.push(`${event.name}: casters get +${event.cast} to their casting rolls.`);
  else if (event?.xp) effects.push(`${event.name}: every unit that survives earns +${event.xp} XP (the battle report adds it, in full).`);
  else if (event?.battle) effects.push(`${event.name}: ${event.battle} Not part of a zone battle.`);
  // A Conqueror Warlord's Onslaught: it hits harder and its side holds firmer.
  if (c) for (const side of b.sides) {
    const force = forces.find((f) => f.id === side.forceId);
    const lord = force && c.factions.find((x) => x.id === force.nexus?.factionId)?.warlord;
    if (!force || !lord || !leadsWith(c, force, 'onslaught')) continue;
    const ids = new Set(side.units.filter((t) => t.unitId === lord.unitId).map((t) => zoneKey(side.id, t.id)));
    const leader = units.filter((u) => ids.has(u.id));
    if (!leader.length) continue;
    gift(leader, 'Warlord (Onslaught)', [{ k: 'hit', n: 1 }]);
    gift(units.filter((u) => u.owner === side.id), 'Warlord (Onslaught)', [{ k: 'morale', n: 1 }]);
    effects.push(`${lord.name} (Warlord, Onslaught): +1 to hit, and ${force.name} gets +1 to Morale tests.`);
  }

  const battle = createBattle(setup);
  for (const l of later) for (const id of l.ids) battle.units.find((u) => u.id === id)?.effects.push({ ...l.e, from: l.from });
  for (const f of board) f(battle);
  if (first !== undefined) battle.first = first;
  if (event?.cast) battle.castBonus = event.cast;
  for (const e of effects) battle.log.push({ round: 0, kind: 'info', text: e });
  return { battle, effects };
}

/** Minefield: the squares just in front of the defender's zone are Dangerous. */
function mines(z: ZBattle) {
  const zone = new Set(z.board.deploy[1]);
  for (const sq of zone) {
    const [x, y] = xy(z.board, sq);
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= z.board.w || ny >= z.board.h) continue;
      const n = idx(z.board, nx, ny);
      if (zone.has(n) || z.board.deploy[0].includes(n) || z.board.terrain[n]?.blocking) continue;
      z.board.terrain[n] = { ...(z.board.terrain[n] ?? { name: 'Minefield' }), dangerous: true };
    }
  }
}

/** Who scored what, in the tracked battle's terms. */
const holder = (teams: [TeamKey, TeamKey], h: ZHolder): Holder => (h === 0 ? teams[0] : h === 1 ? teams[1] : h);

/**
 * Writes an ended zone battle onto its tracked battle: each unit's wounds, losses and kill XP (times `xpScale`), the
 * markers held each round, the mission's tallies and who won. It's then recorded like any other battle.
 */
export function applyZoneBattle(b: TrackedBattle, z: ZBattle, xpScale = 1, stories: string[] = []) {
  if (b.ended || z.phase !== 'ended' || !z.result || z.practice) return;
  for (const side of b.sides) for (const t of side.units) {
    const key = zoneKey(side.id, t.id);
    const host = z.units.find((u) => !u.joinedTo && u.p.kits.some((k) => k.src === key));
    if (!host) continue;
    const scale = t.maxWounds / Math.max(1, maxWoundsOf(host.p, key));
    t.wounds = Math.max(0, Math.round(woundsOf(host.p, key) * scale));
    t.destroyed = t.wounds <= 0 || host.destroyed || host.routed;
    t.shaken = host.shaken && !t.destroyed;
    const xp = z.units.reduce((s, u) => s + (u.xp[key] ?? 0), 0);
    t.xp = (t.xp ?? 0) + Math.round(xp * xpScale * 10) / 10;
  }
  const teams = z.teams;
  b.objectives = z.board.objectives.length;
  b.control = z.history.map((row) => row.map((h) => holder(teams, h)));
  b.counters = { ...b.counters, [teams[0]]: { ...z.counters[0] }, [teams[1]]: { ...z.counters[1] } };
  const w = z.result.winner;
  b.auto = {
    winner: w === 'draw' ? 'draw' : teams[w],
    dealt: { [teams[0]]: pointsLost(z, 1), [teams[1]]: pointsLost(z, 0) },
    ...(stories.length ? { stories } : {}),
  };
  b.round = Math.max(b.round, z.history.length);
  b.ended = true;
}
