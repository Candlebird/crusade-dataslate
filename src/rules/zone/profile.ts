import { parseWeaponText, splitTopLevel } from '../../armyforge/book';
import type { Unit, Weapon } from '../../model/types';
import { resolve, type BookRules, type Dice, type Hook } from '../oprRules';

// A unit as the zone battle (and the Sortie) plays it: its models one by one, each with its own kit (Quality,
// Defense, Tough and rules; a joined hero brings a second kit) and the guns it carries, out of the unit's weapons,
// relic weapons and mounts (a mount's weapons and rules are read back out of its item label). Everything here is
// plain data, so a battle in progress saves as it is.

/** Hooks that only count for the attacks of the weapon they sit on. The rest of a weapon's hooks go to its bearer. */
const ATTACK_KINDS = new Set<Hook['k']>([
  'hit', 'ap', 'attacks', 'six', 'reroll', 'bane', 'shred', 'deadly', 'blast', 'reliable', 'limited', 'rending', 'noRegen',
  'noCover', 'indirect', 'takedown', 'range', 'carry', 'strikeFirst', 'unstoppable', 'blackHole', 'harvest',
]);
/** Hooks a model uses on its own while it stands (they don't need the whole unit to have them). */
const OWN_KINDS = new Set<Hook['k']>([
  'heal', 'hits', 'buff', 'aura', 'terror', 'steady', 'reposition', 'caster', 'explode', 'revive', 'luck', 'choice', 'hero',
  'impact', 'impactPer', 'counter', 'fear', 'dread', 'ravage',
]);
export const isAttackHook = (h: Hook) => ATTACK_KINDS.has(h.k);
export const isOwnHook = (h: Hook) => OWN_KINDS.has(h.k) || ATTACK_KINDS.has(h.k);

export interface ZGun {
  name: string;
  /** Inches; 0 = melee. */
  range: number;
  attacks: Dice;
  /** Its own hooks (attack hooks), from its profile and traits. */
  hooks: Hook[];
  /** As the profile reads, for the dice log. */
  label: string;
}

/** What a set of models shares: the troops of a unit, or a hero joined to it. */
export interface ZKit {
  /** The tracker unit these models belong to (a joined hero has its own). */
  src: string;
  name: string;
  quality: number;
  defense: number;
  tough: number;
  hero: boolean;
  /** Model rules (not the unit-wide ones, which sit on the profile). */
  hooks: Hook[];
  points: number;
}

export interface ZModel {
  kit: number;
  /** Wounds taken. */
  hurt: number;
  /** Indexes into the profile's guns; a gun twice means two of it. */
  guns: number[];
  /** Lower goes first when wounds are handed out: plain models, then special weapons, then heroes. */
  rank: number;
  dead?: boolean;
}

export interface ZProfile {
  kits: ZKit[];
  models: ZModel[];
  guns: ZGun[];
  /** Rules for every model in the unit (auras on it, "this model and its unit get…"). */
  shared: Hook[];
  /** Rules the battle doesn't play, or plays only in part, for the unit card. */
  notes: string[];
}

const lower = (s: string) => s.trim().toLowerCase();
const weaponLabel = (w: { range: number; attacks: Dice; rules: string[] }) =>
  [w.range ? `${w.range}"` : 'Melee', `A${w.attacks}`, ...w.rules].join(', ');

/** Reads labels into hooks: model hooks, unit hooks, hooks for every weapon, and what isn't played. */
class Reader {
  model: Hook[] = [];
  shared: Hook[] = [];
  allGuns: Hook[] = [];
  notes: string[] = [];
  mounts: Omit<Weapon, 'id' | 'traits'>[] = [];
  extraTough = 0;
  constructor(private book?: BookRules) {}

  rule(label: string, base = false) {
    const mount = this.mount(label);
    if (mount) return;
    const r = resolve(label, this.book);
    if (!r) return void this.notes.push(`${label}: not in the rules map`);
    if (r.partial) this.notes.push(`${label}: ${r.partial}`);
    for (const h of r.hooks) {
      if (h.k === 'none') { this.notes.push(`${label}: ${h.why}`); continue; }
      if (h.k === 'tough') { if (!base) this.extraTough += h.n; continue; }
      if (r.scope === 'weapon') this.allGuns.push(h);
      else if (r.scope === 'unit') this.shared.push(h);
      else this.model.push(h);
    }
  }

  /** A mount or carried item with weapons in its label: "Great Flayer (Heavy Claws (A2, AP(1)), Fast, Tough(6))". */
  mount(label: string): boolean {
    const m = label.match(/^([^()]+?)\s*\((.*)\)$/);
    if (!m || !/\(/.test(m[2])) return false;
    if (resolve(label, this.book)) return false;
    const name = m[1].trim();
    for (const part of splitTopLevel(m[2])) {
      // "(12", A2, AP(1)) (A1)": a drone's gun and its melee attack, both without names.
      const pair = part.match(/^\((.*?\))\s*\((.*)\)$/);
      const weapons = pair ? [`${name} (${pair[1]}`, `${name} (${pair[2]})`] : [part];
      const parsed = weapons.map((w) => parseWeaponText(w));
      if (parsed.every(Boolean)) this.mounts.push(...(parsed as Omit<Weapon, 'id' | 'traits'>[]));
      else this.rule(part);
    }
    return true;
  }
}

/** A gun from a weapon: its profile rules and crusade traits read as hooks (Duplicate copies the first stacking trait). */
function gunOf(w: Pick<Weapon, 'name' | 'range' | 'attacks' | 'rules'> & { traits?: Weapon['traits'] }, book: BookRules | undefined, notes: string[], extra: Hook[]): ZGun {
  const hooks: Hook[] = [];
  const traits = (w.traits ?? []).map((t) => t.name);
  const dup = traits.filter((t) => lower(t) === 'duplicate').length;
  const stacking = traits.find((t) => ['+1 a', '+1 ap'].includes(lower(t)));
  const labels = [...w.rules, ...traits.filter((t) => lower(t) !== 'duplicate'), ...(stacking ? Array(dup).fill(stacking) : [])];
  const bearer: Hook[] = [];
  for (const label of labels) {
    const r = resolve(label, book);
    if (!r) { notes.push(`${w.name}: ${label}: not in the rules map`); continue; }
    if (r.partial) notes.push(`${w.name}: ${label}: ${r.partial}`);
    for (const h of r.hooks) {
      if (h.k === 'none') notes.push(`${w.name}: ${label}: ${h.why}`);
      else if (ATTACK_KINDS.has(h.k)) hooks.push(h);
      else bearer.push(h);
    }
  }
  // Spread Shot adds to the Blast already in the profile.
  const blasts = hooks.filter((h) => h.k === 'blast') as { k: 'blast'; n: number }[];
  const merged = blasts.length > 1 ? [...hooks.filter((h) => h.k !== 'blast'), { k: 'blast', n: blasts.reduce((s, b) => s + b.n, 0) } as Hook] : hooks;
  const gun: ZGun = { name: w.name, range: w.range, attacks: w.attacks, hooks: [...merged, ...extra], label: weaponLabel(w) };
  // Hooks for the bearer ride along on the gun, picked up by the model that carries it.
  if (bearer.length) (gun as ZGun & { bearer?: Hook[] }).bearer = bearer;
  return gun;
}

/** The hooks a weapon gives the model carrying it (Guard Stance, Counter's Impact cut…). */
export const bearerHooks = (g: ZGun): Hook[] => (g as ZGun & { bearer?: Hook[] }).bearer ?? [];

/** A relic weapon's profile, e.g. 'Melee, A4, AP(1), Demolish' or '18", A1, AP(2), Deadly(3)'. */
export function relicWeapon(name: string, profile: string): Omit<Weapon, 'id' | 'traits'> {
  const parts = splitTopLevel(profile);
  const range = /^melee$/i.test(parts[0]) ? 0 : Number(parts[0].replace(/\D/g, '')) || 12;
  const a = parts.find((p) => /^A\s?\S+$/.test(p));
  return { name, count: 1, range, attacks: a ? (isNaN(Number(a.replace(/^A\s?/, ''))) ? a.replace(/^A\s?/, '') : Number(a.replace(/^A\s?/, ''))) : 1, rules: parts.filter((p) => p !== parts[0] && p !== a) };
}

/**
 * One unit's profile. `src` is the tracker unit id; `wounds` its wounds left (unset: unhurt). Wounds already lost
 * come off its plainest models first, as they would have in the last fight.
 */
export function profileOf(u: Unit, src: string, book?: BookRules, wounds?: number): ZProfile {
  const read = new Reader(book);
  for (const r of u.rules) read.rule(r, /^tough\s*\(\d+\)$/i.test(r.trim()));
  for (const x of u.upgrades) read.rule(x.name);
  for (const x of u.scars) read.rule(x.name);
  for (const x of u.relics) if (!x.profile) read.rule(x.name);

  const size = Math.max(1, u.size);
  const hero = read.model.some((h) => h.k === 'hero');
  const kit: ZKit = {
    src, name: u.name || u.unitType, quality: u.quality, defense: u.defense, tough: Math.max(1, u.tough || 1) + read.extraTough,
    hero, hooks: read.model, points: u.points,
  };
  const notes = [...read.notes];
  const guns: ZGun[] = [];
  const models: ZModel[] = Array.from({ length: size }, () => ({ kit: 0, hurt: 0, guns: [], rank: hero ? 100 : 0 }));

  const weapons: (Pick<Weapon, 'name' | 'range' | 'attacks' | 'rules' | 'count'> & { traits?: Weapon['traits'] })[] = [
    ...u.weapons,
    ...read.mounts.map((w) => ({ ...w, count: w.count * size })),
  ];
  if (!weapons.some((w) => w.range === 0)) weapons.push({ name: 'Hand weapons', count: size, range: 0, attacks: 1, rules: [] });

  // Weapons every model carries go on all of them; the rest (special weapons) on models from the end of the list,
  // the commonest first, so the first models stay plain and fall first.
  const byClass = (melee: boolean) => weapons.filter((w) => (w.range === 0) === melee && w.count > 0).sort((a, b) => b.count - a.count);
  for (const melee of [false, true]) {
    let at = size - 1;
    const list = byClass(melee);
    const top = list[0]?.count ?? 0;
    for (const w of list) {
      const i = guns.push(gunOf(w, book, notes, read.allGuns)) - 1;
      if (w.count >= size) {
        for (let n = 0; n < w.count; n++) models[n % size].guns.push(i);
        continue;
      }
      for (let n = 0; n < w.count; n++) {
        const m = models[at];
        m.guns.push(i);
        if (w.count < top || w.count < size) m.rank += w.count < top ? 2 : 1;
        at = (at - 1 + size) % size;
      }
    }
  }
  for (const r of u.relics) if (r.profile) {
    const i = guns.push(gunOf(relicWeapon(r.name, r.profile), book, notes, read.allGuns)) - 1;
    models[size - 1].guns.push(i);
    models[size - 1].rank += 3;
  }

  const p: ZProfile = { kits: [kit], models, guns, shared: read.shared, notes: [...new Set(notes)] };
  if (wounds !== undefined) takeOld(p, kit.tough * size - wounds);
  return p;
}

/** Hands out wounds already lost before the battle: whole models first, plainest first. */
function takeOld(p: ZProfile, lost: number) {
  for (const m of [...p.models].sort((a, b) => a.rank - b.rank)) {
    if (lost <= 0) break;
    const t = p.kits[m.kit].tough;
    const take = Math.min(lost, t - m.hurt);
    m.hurt += take;
    lost -= take;
    if (m.hurt >= t) m.dead = true;
  }
}

/** A hero joined to a unit: one profile, the hero's models with their own kit and guns, falling last. */
export function join(unit: ZProfile, hero: ZProfile): ZProfile {
  const k0 = unit.kits.length;
  const g0 = unit.guns.length;
  return {
    kits: [...unit.kits, ...hero.kits],
    guns: [...unit.guns, ...hero.guns],
    models: [...unit.models, ...hero.models.map((m) => ({ ...m, kit: m.kit + k0, guns: m.guns.map((g) => g + g0), rank: m.rank + 100 }))],
    shared: [...unit.shared, ...hero.shared],
    notes: [...unit.notes, ...hero.notes],
  };
}

export const alive = (p: ZProfile) => p.models.filter((m) => !m.dead);

/** A model's own hooks: its kit's, and what its weapons give their bearer. */
export function modelHooks(p: ZProfile, m: ZModel): Hook[] {
  const own = p.kits[m.kit].hooks;
  const fromGuns = m.guns.flatMap((g) => bearerHooks(p.guns[g]));
  return fromGuns.length ? [...own, ...fromGuns] : own;
}

const keyOf = (h: Hook) => JSON.stringify(h);
const unitCache = new WeakMap<ZProfile, { mask: string; hooks: Hook[] }>();

/**
 * The hooks the unit as a whole plays: its shared rules, and each model rule all its standing models have
 * (a hero joined to troops doesn't give them its Stealth). Rules a model uses on its own (auras, heals, impact)
 * count while any model with them stands.
 */
export function unitHooks(p: ZProfile): Hook[] {
  const mask = p.models.map((m) => (m.dead ? 0 : 1)).join('');
  const hit = unitCache.get(p);
  if (hit && hit.mask === mask) return hit.hooks;
  const standing = alive(p);
  const out: Hook[] = [...p.shared];
  if (standing.length) {
    const sets = standing.map((m) => modelHooks(p, m));
    const seen = new Set<string>();
    for (const set of sets) for (const h of set) {
      if (isOwnHook(h)) continue;
      const k = keyOf(h);
      if (seen.has(k)) continue;
      seen.add(k);
      // Count the copies each model has, so two Fast don't count as one.
      const n = Math.min(...sets.map((s) => s.filter((x) => keyOf(x) === k).length));
      for (let i = 0; i < n; i++) out.push(h);
    }
    for (const kit of new Set(standing.map((m) => m.kit))) for (const h of p.kits[kit].hooks) if (OWN_KINDS.has(h.k) && !ATTACK_KINDS.has(h.k)) out.push(h);
  }
  unitCache.set(p, { mask, hooks: out });
  return out;
}

/** Wounds left on the models of one tracker unit (a joined hero is its own tracker unit). */
export const woundsOf = (p: ZProfile, src: string) =>
  p.models.reduce((s, m) => (p.kits[m.kit].src === src && !m.dead ? s + p.kits[m.kit].tough - m.hurt : s), 0);

/** Wounds the unit could take when whole. */
export const maxWoundsOf = (p: ZProfile, src?: string) =>
  p.models.reduce((s, m) => (!src || p.kits[m.kit].src === src ? s + p.kits[m.kit].tough : s), 0);

/** The Tough most of its standing models have. */
export function toughOf(p: ZProfile): number {
  const t = alive(p).map((m) => p.kits[m.kit].tough).sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)] ?? 1;
}
