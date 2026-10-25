import type { Relic, Unit } from '../../model/types';
import { effectsOf, type Effect } from '../abilities';
import { RELICS } from '../data';
import { TRAINING } from '../downtimeData';
import { centreOf, dist, towers, unitTowers } from './board';
import { afflict, busy, enemiesNear, FX_COLOR, FX_TIME, hurt, isBoss, pulse, reach, targetFor, toGo } from './harm';
import { canHold } from './holds';
import { fire } from './combat';
import { barrage, bleedField, grown, shieldBoost } from './skills';
import type { Enemy, RelicAct, RelicSocket, TrainingRun, UnitTower } from './types';

// Relic sockets: every relic on a crafted unit goes off by itself on its own clock during waves, drawn in gold.

const R = TRAINING.relics;

/** What a relic is, for one with no mapped effect: wargear, armour, an artefact, or a banner or icon. */
export type RelicKind = 'wargear' | 'armour' | 'artefact' | 'banner';

const KINDS: [RelicKind, RegExp][] = [
  ['banner', /standard|banner|icon|seal|oath|bell|psalm|crown|horn|torc|choir|morale/i],
  ['armour', /field|shield|plating|mantle|cloak|armou?r|harness|bionic|tough|ward|heart|defen[cs]e/i],
  ['artefact', /eye|lens|lantern|scope|key|splinter|mask|orb|amulet|grimoire|auspex|array|tether|anchor/i],
];

/** A relic's kind: by its name, else by what its card says, else wargear. */
export function relicKind(name: string): RelicKind {
  const desc = RELICS.find((r) => r.name === name)?.desc ?? '';
  return KINDS.find(([, re]) => re.test(name))?.[0] ?? KINDS.find(([, re]) => re.test(desc))?.[0] ?? 'wargear';
}

const KIND_ACT: Record<RelicKind, RelicAct> = { wargear: 'pulse', armour: 'brace', artefact: 'mark', banner: 'rally' };

/** The act a mapped effect becomes (revives, redeploys and penalties fall back to the relic's kind). */
const EFFECT_ACT: Partial<Record<Effect['kind'], RelicAct>> = {
  barrage: 'barrage', shield: 'shield', frenzy: 'frenzy', field: 'field', heal: 'bleed', leech: 'bleed', onHit: 'status',
  aura: 'rally', sixes: 'shot', lastStand: 'shot', thorns: 'pulse', deathBlast: 'pulse',
};

/** A relic in its socket: a weapon relic's special shot, a mapped effect's act, or its kind's; its clock set. */
export function socketOf(r: Pick<Relic, 'name' | 'tier' | 'profile'>): RelicSocket {
  const named = R.named[r.name] as RelicAct | undefined;
  const effect = r.profile || named ? undefined : (effectsOf(r.name, true) ?? []).find((e) => EFFECT_ACT[e.kind]);
  const act: RelicAct = r.profile ? 'shot' : named ?? (effect ? EFFECT_ACT[effect.kind]! : KIND_ACT[relicKind(r.name)]);
  const every = Math.round((R.cd[r.tier] ?? R.cd.Common) * (R.actMul[act] ?? 1) * 10) / 10;
  return { name: r.name, tier: r.tier, act, every, cd: every * R.first, ...(effect ? { effect } : {}), ...(r.profile ? { gun: r.name } : {}) };
}

/** Every relic a unit carries, socketed. */
export const socketsOf = (u: Unit): RelicSocket[] => u.relics.map(socketOf);

/** Skills a socket runs on its own clock (so the unit's skill list drops them): timed relic effects. */
export const socketRuns = (s: RelicSocket, source: string, kind: Effect['kind']) =>
  s.name.replace(/\s*\(\d+\)$/, '') === source && s.effect?.kind === kind && ['barrage', 'shield', 'frenzy'].includes(kind);

const reachOf = (t: UnitTower) => Math.max(TRAINING.meleeReach, ...t.guns.map((g) => reach(t, g)));

/** The relic's special shot: its own gun, else the unit's hardest-hitting gun with a target. */
function shot(run: TrainingRun, t: UnitTower, s: RelicSocket): boolean {
  const g = t.guns.find((x) => x.name === s.gun && targetFor(run, t, x))
    ?? [...t.guns].sort((a, b) => b.deadly + b.ap - (a.deadly + a.ap)).find((x) => targetFor(run, t, x));
  if (!g) return false;
  for (let i = 0; i < R.shot.attacks; i++) if (!fire(run, t, g, true)) break;
  return true;
}

/** The wounds a pulse takes its share of: the enemy's own, but the siege colossus counts as an ordinary Final boss
 *  (pulse.siegeBase), or a share of its millions would end the siege in a few goes. */
const pulseBase = (run: TrainingRun, e: Enemy) => (run.siege && e.final ? Math.min(e.maxHp, R.pulse.siegeBase) : e.maxHp);

/** A damage pulse: a share of each nearby enemy's wounds (less on a boss). */
function blast(run: TrainingRun, t: UnitTower, s: RelicSocket): boolean {
  const c = centreOf(t);
  const r = R.pulse.radius + grown(t);
  const near = enemiesNear(run, c.x, c.y, r);
  if (!near.length) return false;
  const share = R.pulse.share[s.tier] ?? R.pulse.share.Common;
  for (const e of near) hurt(run, t, e, pulseBase(run, e) * share * (isBoss(e) ? R.pulse.bossShare : 1), 'other');
  pulse(run, c.x, c.y, r, FX_COLOR.relic);
  return true;
}

/** Armour: the next hold lasts longer; a unit that can't hold deals more for a moment instead. */
function brace(run: TrainingRun, t: UnitTower): boolean {
  if (canHold(t)) { t.brace = R.brace.mul; return true; }
  if (!busy(run, t)) return false;
  t.dmgBoost = { mul: Math.max(t.dmgBoost.left > 0 ? t.dmgBoost.mul : 0, R.brace.ward), left: Math.max(t.dmgBoost.left, R.brace.secs) };
  return true;
}

/** Banner: towers near it attack faster for a moment (only once one of them has something to shoot). */
function rally(run: TrainingRun, t: UnitTower): boolean {
  const c = centreOf(t);
  const r = R.rally.radius + grown(t);
  const near = towers(run).filter((o) => { const p = centreOf(o); return dist(c.x, c.y, p.x, p.y) <= r; });
  if (!near.some((o) => busy(run, o))) return false;
  for (const o of near) o.rush = { mul: Math.max(R.rally.mul, o.rush && o.rush.left > 0 ? o.rush.mul : 0), left: R.rally.secs };
  pulse(run, c.x, c.y, r, FX_COLOR.relic);
  return true;
}

/** Enemies in the unit's reach, the furthest along first. */
const inReach = (run: TrainingRun, t: UnitTower) => {
  const c = centreOf(t);
  return enemiesNear(run, c.x, c.y, reachOf(t)).sort((a, b) => toGo(run, a) - toGo(run, b));
};

/** A mapped hit status (or an artefact's mark) on up to status.max enemies in reach. */
function status(run: TrainingRun, t: UnitTower, s: RelicSocket): boolean {
  const near = inReach(run, t).slice(0, s.act === 'mark' ? undefined : R.status.max);
  if (!near.length) return false;
  const st = s.effect?.kind === 'onHit' && s.act === 'status' ? s.effect.status : 'mark';
  for (const e of near) afflict(run, t, e, st);
  const c = centreOf(t);
  pulse(run, c.x, c.y, reachOf(t), FX_COLOR.relic);
  return true;
}

/** Sunder: one enemy in reach (a boss first, else the furthest along, one not already sundered before one that is)
 *  takes AP(+sunder.ap) on every hit for sunder.secs. */
function sunder(run: TrainingRun, t: UnitTower): boolean {
  const near = inReach(run, t);
  const e = near.find((x) => isBoss(x) && !(x.sunder! > 0)) ?? near.find((x) => !(x.sunder! > 0)) ?? near[0];
  if (!e) return false;
  e.sunder = R.sunder.secs;
  const c = centreOf(t);
  run.fx.push({ x1: c.x, y1: c.y, x2: e.x, y2: e.y, t: FX_TIME.shot, color: FX_COLOR.relic });
  pulse(run, e.x, e.y, 1, FX_COLOR.relic);
  return true;
}

/** One go of a relic: true if it went (its clock restarts), false to try again next step. */
function go(run: TrainingRun, t: UnitTower, s: RelicSocket): boolean {
  const e = s.effect;
  const c = centreOf(t);
  switch (s.act) {
    case 'shot': return shot(run, t, s);
    case 'pulse': return blast(run, t, s);
    case 'brace': return brace(run, t);
    case 'rally': return rally(run, t);
    case 'mark': case 'status': return status(run, t, s);
    case 'sunder': return sunder(run, t);
    case 'barrage': return e?.kind === 'barrage' ? barrage(run, t, e) : blast(run, t, s);
    case 'shield': return shieldBoost(run, t, e?.kind === 'shield' ? e.n : 1);
    case 'frenzy': {
      if (e?.kind !== 'frenzy' || !busy(run, t)) return false;
      t.frenzy = Math.max(t.frenzy, e.time * TRAINING.abilityRound);
      t.frenzyMul = Math.max(t.frenzyMul, e.mul);
      return true;
    }
    case 'field': {
      if (e?.kind !== 'field') return false;
      const r = e.radius + grown(t);
      const near = enemiesNear(run, c.x, c.y, r);
      if (!near.length) return false;
      for (const o of near) o.status[e.status] = Math.max(o.status[e.status] ?? 0, R.field.secs);
      pulse(run, c.x, c.y, r, FX_COLOR.relic);
      return true;
    }
    case 'bleed': {
      const r = TRAINING.bleedField.radius + grown(t);
      if (!enemiesNear(run, c.x, c.y, r).length) return false;
      const n = e && 'n' in e ? e.n : 1;
      bleedField(run, t, r, n * TRAINING.bleedField.dmg * R.bleed.mul, true);
      return true;
    }
  }
}

/** Wear rally boosts down, then run every relic's clock; whatever a relic draws is gold. */
export function relics(run: TrainingRun, dt: number): void {
  for (const e of run.enemies) if (e.sunder !== undefined && (e.sunder -= dt) <= 0) e.sunder = undefined;
  for (const t of towers(run)) {
    if (!t.rush) continue;
    t.rush.left -= dt;
    if (t.rush.left <= 0) t.rush = undefined;
  }
  for (const t of unitTowers(run)) {
    for (const s of t.relics ?? []) {
      s.cd -= dt;
      if (s.cd > 0) continue;
      const from = run.fx.length;
      s.cd = go(run, t, s) ? s.every : 0;
      for (let i = from; i < run.fx.length; i++) run.fx[i].color = FX_COLOR.relic;
    }
  }
}

/** Put every relic's clock back to its first go (a new wave). */
export const resetSockets = (t: UnitTower) => (t.relics ?? []).forEach((s) => { s.cd = s.every * R.first; });

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** What a relic does when it goes off, in a few words (the tower card adds its clock). */
export function relicText(s: RelicSocket): string {
  const e = s.effect;
  switch (s.act) {
    case 'shot': return `${R.shot.attacks} quick attacks${s.gun ? ` with ${s.gun}` : ' with its best weapon'}`;
    case 'pulse': return `A blast: enemies within ${R.pulse.radius} cells lose ${pct(R.pulse.share[s.tier] ?? R.pulse.share.Common)} of their wounds (a boss ${pct((R.pulse.share[s.tier] ?? R.pulse.share.Common) * R.pulse.bossShare)})`;
    case 'brace': return `Its next hold lasts ${R.brace.mul}× as long (if it can't hold: +${pct(R.brace.ward)} damage for ${R.brace.secs}s)`;
    case 'mark': return `Marks every enemy in its reach (+${TRAINING.markDmg} damage from each hit)`;
    case 'rally': return `Towers within ${R.rally.radius} cells attack ${pct(R.rally.mul)} faster for ${R.rally.secs}s`;
    case 'barrage': return e?.kind === 'barrage' ? `${e.hits} extra hit${e.hits === 1 ? '' : 's'} at AP(${e.ap})${e.radius ? `, blasting ${e.radius} cells round` : ''}` : 'A blast';
    case 'shield': return `Another tower deals +${pct((e?.kind === 'shield' ? e.n : 1) * TRAINING.shieldBoost.perN)} for a round`;
    case 'frenzy': return e?.kind === 'frenzy' ? `Attacks ${e.mul}× as fast for ${e.time === 1 ? 'a round' : `${e.time} rounds`}` : 'Attacks faster';
    case 'field': return e?.kind === 'field' ? `Enemies within ${e.radius} cells are ${e.status === 'slow' ? 'slowed' : 'dazed'} for ${R.field.secs}s` : 'A field';
    case 'bleed': return `Enemies within ${TRAINING.bleedField.radius} cells bleed`;
    case 'sunder': return `One enemy in its reach (a boss first) takes AP(+${R.sunder.ap}) from every hit for ${R.sunder.secs}s`;
    case 'status': {
      const what = e?.kind === 'onHit' ? { slow: 'slowed', stun: 'stunned', daze: 'dazed', mark: 'marked', bleed: 'bleeding', knock: 'knocked back', execute: 'finished off if badly hurt' }[e.status] : 'marked';
      return `Up to ${R.status.max} enemies in its reach are ${what}`;
    }
  }
}
