import { resolve, type Cond, type Hook } from '../oprRules';
import { dist, inRange, los, SQUARE } from './board';
import { d6, roll, type Rng } from './dice';
import { alive, bearerHooks, isAttackHook, modelHooks, toughOf, unitHooks, type ZGun, type ZModel } from './profile';
import { onTable, type LogDice, type LogLine, type ZBattle, type ZUnit } from './state';

// The combat core: what rules count for an attack, the dice for hits, Defense and the rules that ignore wounds,
// handing wounds out to models, and Morale. The zone battle and the Sortie both roll through here.

/** What an action needs: the battle, its dice, and the log it writes to. */
export interface Ctx {
  b: ZBattle;
  rng: Rng;
  out: LogLine[];
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const inches = (b: ZBattle, a: ZUnit, c: ZUnit) => (a.sq < 0 || c.sq < 0 ? 999 : dist(b.board, a.sq, c.sq) * SQUARE);
const silenced = (u: ZUnit) => u.effects.some((e) => e.mark === undefined && e.give.some((h) => h.k === 'silenced'));

/** The rules a unit plays right now: its own and its unit's, gifts on it, and auras it stands in (marks on it aside). */
export function rulesOf(b: ZBattle, u: ZUnit): Hook[] {
  const out = [...unitHooks(u.p)];
  for (const e of u.effects) if (e.mark === undefined) out.push(...e.give);
  if (u.sq < 0) return out;
  for (const v of onTable(b)) {
    if (silenced(v)) continue;
    for (const h of unitHooks(v.p)) {
      if (h.k !== 'aura' || (h.side === 'friend') !== (v.side === u.side)) continue;
      if (inches(b, u, v) <= h.range) out.push(...h.give);
    }
  }
  return out;
}

export const has = (hooks: Hook[], k: Hook['k']) => hooks.some((h) => h.k === k);
export const sum = (hooks: Hook[], k: 'hit' | 'ap' | 'attacks' | 'def' | 'apIn' | 'hitIn' | 'morale' | 'range' | 'impact' | 'fear' | 'dread', ok: (c?: Cond) => boolean) =>
  hooks.reduce((s, h) => (h.k === k && ok((h as { c?: Cond }).c) ? s + (h as { n: number }).n : s), 0);

/** Who's looking at whom, for a rule's condition. */
export interface View {
  b: ZBattle;
  me: ZUnit;
  them?: ZUnit;
  kind?: 'shoot' | 'melee';
  /** `me` charged this activation (an attacker), or was charged (a defender). */
  charging?: boolean;
  charged?: boolean;
  inches?: number;
  /** The incoming hit's AP (for a defender). */
  ap?: number;
  range?: number;
  closest?: boolean;
}

export function holds(c: Cond | undefined, v: View): boolean {
  if (!c) return true;
  if (c.when === 'melee' && v.kind !== 'melee') return false;
  if (c.when === 'shoot' && v.kind !== 'shoot') return false;
  if (c.when === 'charge' && !(v.kind === 'melee' && v.charging)) return false;
  if (c.when === 'charged' && !(v.kind === 'melee' && v.charged)) return false;
  const d = v.inches ?? 0;
  if (c.over !== undefined && !(d > c.over)) return false;
  if (c.within !== undefined && !(d <= c.within)) return false;
  if (c.hold !== undefined && v.me.held !== c.hold) return false;
  if (c.fromRound !== undefined && v.b.round < c.fromRound) return false;
  if (c.inCover && !(v.me.sq >= 0 && v.b.board.terrain[v.me.sq]?.cover)) return false;
  if (c.halfRange && !(v.range && d <= v.range / 2)) return false;
  if (c.closest && !v.closest) return false;
  if (c.vsAp !== undefined && (v.ap ?? 0) < c.vsAp) return false;
  const t = v.them;
  if (!t) return !(c.vsTough || c.vsDef || c.vsHero || c.vsSingle || c.vsSize || c.vsHurt || c.vsFlying);
  if (c.vsTough) { const n = toughOf(t.p); if (n < c.vsTough[0] || n > c.vsTough[1]) return false; }
  if (c.vsDef) { const n = mainKit(t).defense; if (n < c.vsDef[0] || n > c.vsDef[1]) return false; }
  if (c.vsHero && !heroStanding(t)) return false;
  if (c.vsSingle && !(heroStanding(t) || alive(t.p).length === 1)) return false;
  if (c.vsSize && alive(t.p).length < c.vsSize) return false;
  if (c.vsHurt && !(t.shaken || atHalf(t))) return false;
  if (c.vsFlying && !has(unitHooks(t.p), 'flying')) return false;
  return true;
}

const heroStanding = (u: ZUnit) => alive(u.p).some((m) => u.p.kits[m.kit].hero);
/** The kit most of its standing models share. */
export function mainKit(u: ZUnit) {
  const n = new Map<number, number>();
  for (const m of alive(u.p)) n.set(m.kit, (n.get(m.kit) ?? 0) + 1);
  const k = [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return u.p.kits[k];
}

/** At half strength or less: half its models (or, for a single model, half its wounds) gone. */
export function atHalf(u: ZUnit): boolean {
  const left = alive(u.p);
  if (u.startModels > 1) return left.length <= u.startModels / 2;
  const w = left.reduce((s, m) => s + u.p.kits[m.kit].tough - m.hurt, 0);
  return w <= u.startWounds / 2;
}

export const woundsLeft = (u: ZUnit) => alive(u.p).reduce((s, m) => s + u.p.kits[m.kit].tough - m.hurt, 0);

/** Marks on `t` that `side` gets against it, as hooks, with the effects they came from (to use up 'once' ones). */
function marksOn(t: ZUnit, side: number) {
  const fx = t.effects.filter((e) => e.mark === side);
  return { hooks: fx.flatMap((e) => e.give), fx };
}

/** Rolls `n` dice; `reroll` re-rolls the ones it picks once. */
function dice(rng: Rng, n: number, reroll?: (r: number) => boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let r = d6(rng);
    if (reroll?.(r)) r = d6(rng);
    out.push(r);
  }
  return out;
}

/** One hit that got through to a Defense roll. */
interface Hit {
  ap: number;
  deadly: number;
  /** Extra wounds on an unmodified 6 to hit (Devour). */
  plus: number;
  noRegen: boolean;
  bane: boolean;
  shred: { n: number; upTo: number }[];
  takedown: boolean;
  noCover: boolean;
  /** The kit whose model made it, for kill XP. */
  src: string;
}

export interface Strike {
  wounds: number;
  kills: number;
  dice: LogDice[];
}

/** What a set of guns needs to attack: each model's guns, grouped by gun and kit. */
function groups(u: ZUnit, models: ZModel[], want: (g: ZGun, i: number) => boolean) {
  const out = new Map<string, { gun: number; kit: number; models: ZModel[]; copies: number }>();
  for (const m of models) for (const gi of m.guns) {
    if (!want(u.p.guns[gi], gi)) continue;
    const key = `${gi}:${m.kit}`;
    const g = out.get(key) ?? { gun: gi, kit: m.kit, models: [], copies: 0 };
    if (!g.models.includes(m)) g.models.push(m);
    g.copies++;
    out.set(key, g);
  }
  return [...out.values()];
}

export interface AttackOpts {
  kind: 'shoot' | 'melee';
  /** The attacker charged this activation. */
  charging?: boolean;
  /** Hits only on unmodified 6s (Fatigue, or Shaken striking back). */
  sixesOnly?: boolean;
  /** Only these guns (by index). */
  guns?: (g: ZGun, i: number) => boolean;
  closest?: boolean;
  /** Rolled against this unit's Defense instead (Mirrorglass Mantle turns shots back). */
  reflectTo?: ZUnit;
}

/** The attack hooks a model's gun plays against a target. */
function attackHooks(c: Ctx, u: ZUnit, m: ZModel, gun: ZGun, t: ZUnit) {
  const own = modelHooks(u.p, m).filter(isAttackHook);
  const unit = rulesOf(c.b, u).filter(isAttackHook);
  const mk = marksOn(t, u.side);
  return { hooks: [...gun.hooks, ...own, ...unit, ...mk.hooks], fx: mk.fx };
}

/** An attack with a unit's weapons on one target: to hit, Defense, wounds handed out. */
export function attack(c: Ctx, u: ZUnit, t: ZUnit, models: ZModel[], o: AttackOpts): Strike {
  const b = c.b;
  const d = inches(b, u, t);
  const defView: View = { b, me: t, them: u, kind: o.kind, charged: o.kind === 'melee' && t.chargedBy === u.id, inches: d };
  const tRules = rulesOf(b, t);
  const hits: Hit[] = [];
  const log: LogDice[] = [];
  const usedFx = new Set<object>();
  const want = (g: ZGun, i: number) => (o.kind === 'melee' ? g.range === 0 : g.range > 0) && (!o.guns || o.guns(g, i));
  for (const grp of groups(u, models, want)) {
    const gun = u.p.guns[grp.gun];
    const kit = u.p.kits[grp.kit];
    const m = grp.models[0];
    const { hooks, fx } = attackHooks(c, u, m, gun, t);
    const view: View = { b, me: u, them: t, kind: o.kind, charging: o.charging, inches: d, range: gun.range, closest: o.closest };
    const on = (h: Hook) => holds((h as { c?: Cond }).c, view);
    const live = hooks.filter(on);
    if (fx.length && live.some((h) => fx.some((e) => e.give.includes(h)))) fx.forEach((e) => usedFx.add(e));
    if (has(live, 'limited')) {
      const key = `limited:${grp.gun}`;
      if (u.used[key]) continue;
      u.used[key] = 1;
    }
    let attacks = 0;
    const plusA = sum(live, 'attacks', () => true) + (has(live, 'harvest') ? u.used.harvest ?? 0 : 0);
    for (let i = 0; i < grp.copies; i++) attacks += Math.max(0, roll(gun.attacks, c.rng) + plusA);
    if (!attacks) continue;
    const unstoppable = has(live, 'unstoppable');
    let mod = sum(live, 'hit', () => true) + sum(tRules, 'hitIn', (cc) => holds(cc, defView));
    if (unstoppable) mod = Math.max(0, mod);
    // Unpredictable: a die for the fight, 1-3 AP(+1), 4-6 +1 to hit.
    let unpredictableAp = 0;
    const unp = live.find((h) => h.k === 'unpredictable') as { melee?: boolean } | undefined;
    if (unp && (!unp.melee || o.kind === 'melee')) { if (d6(c.rng) <= 3) unpredictableAp = 1; else mod += 1; }
    const quality = has(live, 'reliable') ? 2 : kit.quality;
    const need = o.sixesOnly ? 6 : clamp(quality - mod, 2, 6);
    const rr = live.find((h) => h.k === 'reroll') as { ones?: boolean; six?: boolean } | undefined;
    const rolls = dice(c.rng, attacks, (r) => (rr?.ones && r === 1) || (!!rr?.six && r === 6));
    const ok = rolls.filter((r) => r !== 1 && (r === 6 || r >= need));
    log.push({ label: `${gun.name}${grp.copies > 1 ? ` ×${grp.copies}` : ''} to hit`, need, rolls, ok: ok.length });
    const six = live.filter((h) => h.k === 'six') as { hits?: number; ap?: number; wound?: number }[];
    const ap = sum(live, 'ap', () => true) + unpredictableAp;
    const blast = Math.max(1, ...live.filter((h) => h.k === 'blast').map((h) => (h as { n: number }).n));
    const blastMul = Math.min(blast, Math.max(1, alive(t.p).length));
    const deadly = Math.max(1, ...live.filter((h) => h.k === 'deadly').map((h) => (h as { n: number }).n));
    const base = {
      deadly, noRegen: has(live, 'noRegen') || has(live, 'rending'), bane: has(live, 'bane'),
      shred: live.filter((h) => h.k === 'shred').map((h) => ({ n: (h as { n: number }).n, upTo: (h as { upTo?: number }).upTo ?? 1 })),
      takedown: has(live, 'takedown'), noCover: has(live, 'noCover') || has(live, 'indirect') && false, src: kit.src,
    };
    for (const r of ok) {
      const isSix = r === 6;
      const extra = isSix ? six.reduce((s, h) => s + (h.hits ?? 0), 0) : 0;
      const sixAp = isSix ? six.reduce((s, h) => s + (h.ap ?? 0), 0) : 0;
      const plus = isSix ? six.reduce((s, h) => s + (h.wound ?? 0), 0) : 0;
      const hitAp = Math.max(ap + sixAp, isSix && has(live, 'rending') ? 4 : 0);
      for (let n = 0; n < (1 + extra) * blastMul; n++) hits.push({ ...base, ap: hitAp, plus: n === 0 ? plus : 0 });
    }
    if (has(live, 'blackHole') && ok.length) {
      // Black Hole: roll for each model in the target; on 5+ it's slain.
      const bh = live.find((h) => h.k === 'blackHole') as { on: number };
      const rs = dice(c.rng, alive(t.p).length);
      const slain = rs.filter((x) => x >= bh.on).length;
      log.push({ label: 'Black Hole', need: bh.on, rolls: rs, ok: slain });
      for (let i = 0; i < slain; i++) hits.push({ ...base, ap: 99, deadly: 99, plus: 0, noRegen: true });
    }
    if (has(live, 'harvest') && o.kind === 'melee') u.used.harvestPending = 1;
  }
  for (const e of usedFx) if ((e as { until: string }).until === 'once') t.effects = t.effects.filter((x) => x !== e);
  const target = o.reflectTo ?? t;
  const res = defend(c, target, hits, { kind: o.kind, from: u, view: defView, log });
  if (u.used.harvestPending) {
    delete u.used.harvestPending;
    if (res.kills) {
      u.used.harvest = (u.used.harvest ?? 0) + 1;
      heal(u, res.kills);
    }
  }
  return { ...res, dice: log };
}

/** Takes `n` wounds off a unit's hurt models (it's healed). Returns the wounds taken off. */
export function heal(u: ZUnit, n: number, revive = false): number {
  let left = n;
  const hurt = u.p.models.filter((m) => !m.dead && m.hurt > 0).sort((a, b) => b.hurt - a.hurt);
  for (const m of hurt) { const take = Math.min(left, m.hurt); m.hurt -= take; left -= take; if (!left) break; }
  if (revive && left > 0) {
    const dead = u.p.models.filter((m) => m.dead).sort((a, b) => b.rank - a.rank)[0];
    if (dead) {
      const t = u.p.kits[dead.kit].tough;
      dead.dead = false;
      dead.hurt = Math.max(0, t - left);
      left = Math.max(0, left - t);
    }
  }
  return n - left;
}

interface DefendOpts {
  kind: 'shoot' | 'melee' | 'spell' | 'ability';
  from?: ZUnit;
  view: View;
  log: LogDice[];
}

/** Defense rolls for hits that got through, then wounds ignored, then wounds handed out. */
export function defend(c: Ctx, t: ZUnit, hits: Hit[], o: DefendOpts): { wounds: number; kills: number } {
  if (!hits.length) return { wounds: 0, kills: 0 };
  const b = c.b;
  const rules = rulesOf(b, t);
  const cover = o.kind === 'shoot' && ((t.sq >= 0 && !!b.board.terrain[t.sq]?.cover) || rules.some((h) => h.k === 'cover' && holds(h.c, o.view)));
  const exposed = has(rules, 'exposed');
  const kit = mainKit(t);
  const groupsW: { n: number; src: string; noRegen: boolean; takedown: boolean }[] = [];
  const defRolls: number[] = [];
  let need0 = 0;
  let luck = Math.max(0, rules.filter((h) => h.k === 'luck').reduce((s, h) => s + (h as { n: number }).n, 0) - (t.used[`luck:${b.round}`] ?? 0));
  for (const h of hits) {
    const view: View = { ...o.view, ap: h.ap };
    const apIn = h.ap >= 99 ? 0 : sum(rules, 'apIn', (cc) => holds(cc, view));
    const ap = h.ap >= 99 ? 99 : Math.max(0, h.ap + apIn);
    const mod = sum(rules, 'def', (cc) => holds(cc, view)) + (cover && !h.noCover && !exposed ? 1 : 0);
    const need = ap >= 99 ? 7 : clamp(kit.defense + ap - mod, 2, 7);
    need0 = Math.max(need0, Math.min(need, 6));
    let r = d6(c.rng);
    if (h.bane && r === 6) r = d6(c.rng);
    const failed = (x: number) => x === 1 || (x !== 6 && x < need) || need >= 7;
    if (failed(r) && luck > 0 && need < 7) { luck--; t.used[`luck:${b.round}`] = (t.used[`luck:${b.round}`] ?? 0) + 1; r = d6(c.rng); }
    defRolls.push(r);
    if (!failed(r)) {
      if (o.kind === 'melee' && r === 6 && has(rules, 'riposte') && o.from) riposte.push(o.from);
      continue;
    }
    let w = 1 + h.plus;
    for (const s of h.shred) if (r <= s.upTo) w += s.n;
    if (r === 1) w += rules.filter((x) => x.k === 'weak').reduce((s, x) => s + (x as { n: number }).n, 0);
    for (let i = 0; i < w; i++) groupsW.push({ n: h.deadly, src: h.src, noRegen: h.noRegen, takedown: h.takedown });
  }
  o.log.push({ label: `${t.name} Defense`, need: need0 || undefined, rolls: defRolls, ok: defRolls.length - groupsW.length });
  if (riposte.length && o.from) {
    const back = riposte.length;
    riposte.length = 0;
    pending.push({ to: o.from, n: back, src: kit.src });
  }
  return takeWounds(c, t, groupsW, o, rules);
}
const riposte: ZUnit[] = [];
/** Wounds to deal once the attack is done (Riposte), so a unit isn't hurt mid-roll. */
export const pending: { to: ZUnit; n: number; src: string }[] = [];

/** Wounds ignored (Regeneration and the like, shields), then handed to models: hurt ones first, plainest first, heroes last. */
function takeWounds(c: Ctx, t: ZUnit, wounds: { n: number; src: string; noRegen: boolean; takedown: boolean }[], o: DefendOpts, rules: Hook[]): { wounds: number; kills: number } {
  const b = c.b;
  if (!wounds.length) return { wounds: 0, kills: 0 };
  // Ignore rolls, per wound before Deadly multiplies it.
  const ign = rules.filter((h) => h.k === 'ignore') as { on: number; spell?: number; regen?: boolean }[];
  let kept = wounds;
  if (ign.length) {
    const rolls: number[] = [];
    let best = 7;
    kept = wounds.filter((w) => {
      const on = Math.min(...ign.filter((h) => !(h.regen && w.noRegen)).map((h) => (o.kind === 'spell' && h.spell ? Math.min(h.spell, h.on) : h.on)), 7);
      if (on >= 7) return true;
      best = Math.min(best, on);
      const r = d6(c.rng);
      rolls.push(r);
      return r < on;
    });
    if (rolls.length) o.log.push({ label: `${t.name} ignores wounds`, need: best, rolls, ok: wounds.length - kept.length });
  }
  // A shield of wounds, taken first and ignored on its roll.
  const pool = rules.find((h) => h.k === 'shieldPool') as { n: number; on: number } | undefined;
  if (pool && kept.length) {
    const left = pool.n - (t.used.shield ?? 0);
    const take = Math.min(left, kept.length);
    if (take > 0) {
      t.used.shield = (t.used.shield ?? 0) + take;
      const rs = dice(c.rng, take);
      const saved = rs.filter((r) => r >= pool.on).length;
      o.log.push({ label: `${t.name} shield`, need: pool.on, rolls: rs, ok: saved });
      kept = kept.slice(saved);
    }
  }
  const round = b.round;
  if (has(rules, 'ablative') && kept.length && !t.used[`ablative:${round}`]) { t.used[`ablative:${round}`] = 1; kept = kept.slice(1); }
  const soak = rules.find((h) => h.k === 'soak') as { n: number | string } | undefined;
  if (soak && kept.length && !t.used[`soak:${round}`]) { t.used[`soak:${round}`] = 1; kept = kept.slice(roll(soak.n, c.rng)); }
  if (has(rules, 'negate') && !t.used.negate && kept.length * Math.max(1, kept[0]?.n ?? 1) >= 3 && o.kind !== 'ability') { t.used.negate = 1; kept = []; }
  if (has(rules, 'halve') && !t.used.halve && kept.length >= 3) t.used.halve = round;
  if (t.used.halve === round) kept = kept.slice(0, Math.ceil(kept.length / 2));

  let dealt = 0, kills = 0;
  const lastStand = rules.find((h) => h.k === 'lastStand') as { on: number } | undefined;
  for (const w of kept) {
    const standing = alive(t.p);
    if (!standing.length) break;
    let m: ZModel;
    if (w.takedown) {
      // Picks a model: a hero, or the best-armed one.
      m = standing.find((x) => t.p.kits[x.kit].hero) ?? [...standing].sort((a, b) => b.rank - a.rank)[0];
    } else {
      m = standing.find((x) => x.hurt > 0 && !t.p.kits[x.kit].hero) ?? [...standing].sort((a, b) => a.rank - b.rank || b.hurt - a.hurt)[0];
    }
    const tough = t.p.kits[m.kit].tough;
    const take = Math.min(w.n, tough - m.hurt);
    m.hurt += take;
    dealt += take;
    if (m.hurt >= tough) {
      if (lastStand && !t.used.lastStand && alive(t.p).length === 1) {
        t.used.lastStand = 1;
        const r = d6(c.rng);
        o.log.push({ label: `${t.name} last stand`, need: lastStand.on, rolls: [r], ok: r >= lastStand.on ? 1 : 0 });
        if (r >= lastStand.on) { m.hurt = tough - 1; continue; }
      }
      m.dead = true;
      kills++;
      if (o.from) {
        const xp = tough === 1 && t.startModels >= 10 ? 0.5 : tough;
        o.from.xp[w.src] = (o.from.xp[w.src] ?? 0) + xp;
      }
    }
  }
  if (!alive(t.p).length) destroyed(c, t, o.from);
  return { wounds: dealt, kills };
}

/** A unit with no models left: it may get back up once (Revive), or blow up (Explode). */
export function destroyed(c: Ctx, t: ZUnit, by?: ZUnit) {
  const rules = unitHooksAll(t);
  const rev = rules.find((h) => h.k === 'revive') as { on: number; hp: number | string } | undefined;
  if (rev && !t.used.revive) {
    t.used.revive = 1;
    const r = d6(c.rng);
    if (r >= rev.on) {
      const m = [...t.p.models].sort((a, b) => b.rank - a.rank)[0];
      const tough = t.p.kits[m.kit].tough;
      m.dead = false;
      m.hurt = Math.max(0, tough - roll(rev.hp, c.rng));
      c.out.push({ round: c.b.round, side: t.side, unit: t.id, kind: 'ability', text: `${t.name} gets back up (${r}).`, dice: [{ label: 'Revive', need: rev.on, rolls: [r], ok: 1 }] });
      return;
    }
  }
  t.destroyed = true;
  dropMarkers(c.b, t);
  if (by) by.used[`killed:${c.b.round}`] = 1;
  const ex = rules.find((h) => h.k === 'explode') as { range: number } | undefined;
  if (ex) {
    for (const v of onTable(c.b)) {
      if (v === t || inches(c.b, v, t) > ex.range) continue;
      const n = Math.min(alive(v.p).length * Math.max(1, toughOf(v.p)), 10);
      const rs = dice(c.rng, Math.min(n, alive(v.p).length));
      const w = rs.filter((r) => r === 1).length;
      if (w) defendRaw(c, v, w, 0, `${t.name} explodes`, []);
    }
  }
}

/** Every hook on the unit's models, its own ones included (for once-only rules after the models are gone). */
const unitHooksAll = (t: ZUnit) => [...t.p.shared, ...t.p.kits.flatMap((k) => k.hooks), ...t.p.guns.flatMap(bearerHooks)];

/** Drops whatever markers the unit carries where it stands. */
export function dropMarkers(b: ZBattle, t: ZUnit) {
  b.carried = b.carried.map((id, i) => {
    if (id !== t.id) return id;
    b.board.objectives[i].sq = t.sq >= 0 ? t.sq : b.board.objectives[i].sq;
    return null;
  });
}

/** Hits from an ability, a spell or terrain: no roll to hit, then Defense as usual. */
export function defendRaw(c: Ctx, t: ZUnit, n: number, ap: number, label: string, rules: string[], from?: ZUnit, spell = false): { wounds: number; kills: number; dice: LogDice[] } {
  const hooks = rules.flatMap((r) => resolve(r)?.hooks ?? []);
  const blast = Math.max(1, ...hooks.filter((h) => h.k === 'blast').map((h) => (h as { n: number }).n));
  const deadly = Math.max(1, ...hooks.filter((h) => h.k === 'deadly').map((h) => (h as { n: number }).n));
  const hitN = n * Math.min(blast, Math.max(1, alive(t.p).length));
  const extraAp = hooks.filter((h) => h.k === 'ap').reduce((s, h) => s + (h as { n: number }).n, 0);
  const hits: Hit[] = Array.from({ length: hitN }, () => ({
    ap: ap + extraAp, deadly, plus: 0, noRegen: has(hooks, 'noRegen') || has(hooks, 'rending'), bane: has(hooks, 'bane'), shred: [], takedown: false,
    noCover: has(hooks, 'noCover'), src: from ? mainKit(from).src : '',
  }));
  const log: LogDice[] = [];
  const view: View = { b: c.b, me: t, them: from, kind: undefined, inches: from ? inches(c.b, t, from) : 0 };
  const res = defend(c, t, hits, { kind: spell ? 'spell' : 'ability', from, view, log });
  void label;
  return { ...res, dice: log };
}

/** Deals wounds owed after an attack (Riposte). */
export function settle(c: Ctx) {
  while (pending.length) {
    const p = pending.shift()!;
    if (p.to.destroyed) continue;
    const r = defendRaw(c, p.to, p.n, 0, 'Riposte', []);
    if (r.wounds) c.out.push({ round: c.b.round, side: p.to.side, unit: p.to.id, kind: 'melee', text: `${p.to.name} takes ${r.wounds} wound${r.wounds === 1 ? '' : 's'} from Riposte.`, dice: r.dice });
  }
}

// ---- Morale ----

/** The Quality a unit tests Morale on: a joined hero's, else most of its models'. */
function moraleQuality(u: ZUnit): number {
  const hero = alive(u.p).find((m) => u.p.kits[m.kit].hero);
  return hero ? u.p.kits[hero.kit].quality : mainKit(u).quality;
}

/**
 * A Morale test. Failing leaves it Shaken, or Routed when at half strength or less (No Rout: Shaken instead).
 * Fearless re-tests a fail on 4+. Natural 1s fail and 6s pass. Returns whether it passed.
 */
export function morale(c: Ctx, u: ZUnit, why: string, mod = 0): boolean {
  if (u.destroyed || u.routed) return true;
  const rules = rulesOf(c.b, u);
  const view: View = { b: c.b, me: u };
  const line = (text: string, d: LogDice[]) => c.out.push({ round: c.b.round, side: u.side, unit: u.id, kind: 'morale', text, dice: d });
  if (has(rules, 'steadfast')) { line(`${u.name} holds firm (${why}).`, []); return true; }
  const need = clamp(moraleQuality(u) - sum(rules, 'morale', (cc) => holds(cc, view)) - mod, 2, 6);
  const r = d6(c.rng);
  const d: LogDice[] = [{ label: `Morale (${why})`, need, rolls: [r], ok: 0 }];
  let pass = r !== 1 && (r === 6 || r >= need);
  if (!pass && has(rules, 'fearless')) {
    const r2 = d6(c.rng);
    d.push({ label: 'Fearless', need: 4, rolls: [r2], ok: r2 >= 4 ? 1 : 0 });
    pass = r2 >= 4;
  }
  if (!pass && has(rules, 'passOnce') && !u.used.passOnce) { u.used.passOnce = 1; pass = true; d.push({ label: 'Rule: passes once a game', rolls: [], ok: 1 }); }
  if (!pass && has(rules, 'noRetreat')) {
    const by = Math.max(1, need - r);
    const rs = dice(c.rng, by);
    const w = rs.filter((x) => x <= 3).length;
    d.push({ label: 'No Retreat', need: 4, rolls: rs, ok: by - w });
    d[0].ok = 1;
    line(`${u.name} won't retreat (${why})${w ? `, and takes ${w} wound${w === 1 ? '' : 's'}` : ''}.`, d);
    if (w) defendRaw(c, u, w, 99, 'No Retreat', []);
    return true;
  }
  d[0].ok = pass ? 1 : 0;
  if (pass) { line(`${u.name} passes Morale (${why}).`, d); return true; }
  if (atHalf(u) && !has(rules, 'noRout')) {
    u.routed = true;
    dropMarkers(c.b, u);
    line(`${u.name} fails Morale (${why}) and is Routed.`, d);
  } else {
    u.shaken = true;
    dropMarkers(c.b, u);
    line(`${u.name} fails Morale (${why}) and is Shaken.`, d);
  }
  return false;
}

// ---- Who can shoot whom ----

/** The range a gun reaches against a target, with range rules (and Shrouded) counted. */
export function gunRange(c: Pick<Ctx, 'b'>, u: ZUnit, m: ZModel, gi: number, t?: ZUnit): number {
  const g = u.p.guns[gi];
  if (!g.range) return 0;
  const hooks = [...g.hooks, ...modelHooks(u.p, m), ...rulesOf(c.b, u)];
  let r = g.range + hooks.filter((h) => h.k === 'range').reduce((s, h) => s + (h as { n: number }).n, 0);
  if (t) {
    const sh = rulesOf(c.b, t).find((h) => h.k === 'shroud') as { range: number } | undefined;
    if (sh) r = Math.max(6, r - sh.range);
  }
  return r;
}

/** Can this gun shoot that unit from where it stands: in range, in sight (Indirect needs none), not veiled. */
export function canShoot(c: Pick<Ctx, 'b'>, u: ZUnit, m: ZModel, gi: number, t: ZUnit, from = u.sq): boolean {
  if (t.sq < 0 || from < 0 || t.sq === from) return false;
  const b = c.b;
  const g = u.p.guns[gi];
  const sq = dist(b.board, from, t.sq);
  if (!inRange(sq, gunRange(c, u, m, gi, t))) return false;
  const veil = rulesOf(b, t).find((h) => h.k === 'veil') as { over: number } | undefined;
  if (veil && t.held && sq * SQUARE > veil.over) return false;
  return g.hooks.some((h) => h.k === 'indirect') || los(b.board, from, t.sq);
}

/** Enemies at least one of the unit's guns could shoot from a square. */
export function shootable(c: Pick<Ctx, 'b'>, u: ZUnit, from = u.sq): ZUnit[] {
  const out: ZUnit[] = [];
  for (const t of onTable(c.b)) {
    if (t.side === u.side) continue;
    if (alive(u.p).some((m) => m.guns.some((gi) => u.p.guns[gi].range > 0 && canShoot(c, u, m, gi, t, from)))) out.push(t);
  }
  return out;
}
