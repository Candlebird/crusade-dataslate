import type { Unit } from '../../model/types';
import { AUTO_BATTLE } from '../autoBattle';
import { effectsOf, STAT_RULES, type Effect } from '../abilities';
import { SHARD_TYPES, TRAINING, type ShardType } from '../downtimeData';
import { hasRule } from '../engine';
import type { Grade, RecipeSlot } from './types';

// Living recipes: a unit's crusade record (traits, weapon traits, scars) reworks the recipe its datasheet gives, and
// what the record does in a fight that never reaches a tower (towers are never attacked) comes in another way.

const V = TRAINING.veterans;
const TYPES = Object.keys(SHARD_TYPES) as ShardType[];

/** A trait or scar on a unit's record: its name, and for a weapon trait the weapon and whether it's melee. */
export interface RecordEntry {
  name: string;
  kind: 'trait' | 'scar';
  weapon?: string;
  melee?: boolean;
}

/** Traits (unit, then weapon) in the order earned, then scars. */
export function recordOf(u: Unit): RecordEntry[] {
  return [
    ...u.upgrades.map((x): RecordEntry => ({ name: x.name, kind: 'trait' })),
    ...u.weapons.flatMap((w) => w.traits.map((x): RecordEntry => ({ name: x.name, kind: 'trait', weapon: w.name, melee: w.range === 0 }))),
    ...u.scars.filter((x) => !V.notScars.includes(x.name)).map((x): RecordEntry => ({ name: x.name, kind: 'scar' })),
  ];
}

const lookup = <T>(table: Record<string, T>, name: string): T | undefined =>
  table[name] ?? Object.entries(table).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];

/** The Shard type a kind of effect belongs to. */
function typeOfEffect(e: Effect): ShardType | undefined {
  switch (e.kind) {
    case 'aura': case 'field': return 'command';
    case 'heal': case 'leech': case 'revive': return 'vigor';
    case 'shield': case 'thorns': case 'lastStand': return 'bulwark';
    case 'redeploy': return 'swift';
    case 'barrage': case 'deathBlast': return 'blast';
    case 'sixes': return e.rend || e.dmg ? 'breach' : e.only === 'melee' ? 'assault' : 'firepower';
    case 'onHit': return e.only === 'melee' ? 'assault' : 'firepower';
    case 'frenzy': return 'firepower';
    default: return undefined;
  }
}

/** A trait's own Shard type: from TRAINING.veterans.traitTypes, else its effect, else (a weapon trait) its weapon's
 *  kind; undefined if none (it then lifts the lowest slot). */
export function traitType(t: RecordEntry): ShardType | undefined {
  const named = lookup(V.traitTypes, t.name);
  if (named) return named;
  const e = effectsOf(t.name, !t.weapon)?.find((x) => typeOfEffect(x));
  if (e) return typeOfEffect(e);
  if (t.weapon) return t.melee ? 'assault' : 'firepower';
  return undefined;
}

/** +1 grade for a trait of type `type`: on the lowest slot short of Pristine (of that type, among the lowest), so a
 *  veteran's recipe asks for a commoner Shard rather than a rarer one; with every slot Pristine, a new Cracked slot (up
 *  to maxSlots). */
function lift(slots: RecipeSlot[], type: ShardType | undefined): void {
  const open = slots.filter((s) => s.grade < 5);
  const lowest = Math.min(...open.map((s) => s.grade));
  const s = open.find((x) => x.grade === lowest && x.type === type) ?? open.find((x) => x.grade === lowest);
  if (s) { s.grade = (s.grade + 1) as Grade; return; }
  if (slots.length < V.maxSlots) slots.push({ type: type ?? slots[0]?.type ?? TYPES[0], grade: 1 });
}

/** −1 grade for a scar: on the dearest slot, never below Cracked. */
function crack(slots: RecipeSlot[]): void {
  const s = slots.reduce<RecipeSlot | undefined>((m, x) => (!m || x.grade > m.grade ? x : m), undefined);
  if (s && s.grade > 1) s.grade = (s.grade - 1) as Grade;
}

/** Traits and scars net out, capped at ±TRAINING.veterans.cap: `net` (the traits that count, for the damage they add:
 *  gritOf), the trait types to lift (one grade every `traitsPerLift` of them, the first earned), or the scars' count to
 *  crack. */
export function recordBudget(u: Unit): { lifts: (ShardType | undefined)[]; cracks: number; net: number } {
  const rec = recordOf(u);
  const traits = rec.filter((r) => r.kind === 'trait');
  const net = Math.max(-V.cap, Math.min(V.cap, traits.length - (rec.length - traits.length)));
  const lifts = Math.floor(Math.max(0, net) / V.traitsPerLift);
  return { lifts: traits.slice(0, lifts).map(traitType), cracks: Math.max(0, -net), net };
}

/** A recipe as the unit's record makes it: a copy of `slots`, lifted by its traits or cracked by its scars. */
export function adjustSlots(slots: RecipeSlot[], budget: { lifts: (ShardType | undefined)[]; cracks: number }): RecipeSlot[] {
  const out = slots.map((s) => ({ ...s }));
  for (const t of budget.lifts) lift(out, t);
  for (let i = 0; i < budget.cracks; i++) crack(out);
  return out;
}

/** What the record adds to a tower beyond its fighter() numbers: hold share, Tough, damage share (its own, liftDmg a
 *  net trait and crackDmg off a crack), initiative. */
export function gritOf(u: Unit): { hold: number; tough: number; atk: number; init: number } {
  const out = { hold: 1, tough: 0, atk: 0, init: 0 };
  for (const r of recordOf(u)) {
    if (r.weapon) continue;
    const g = lookup(V.grit, r.name);
    if (g) { out.hold += g.hold ?? 0; out.tough += g.tough ?? 0; out.atk += g.atk ?? 0; }
    if (r.kind !== 'trait') continue;
    for (const e of effectsOf(r.name) ?? []) {
      if (e.kind === 'redeploy') out.init += e.uses * V.redeployInit;
      if (e.kind === 'revive') out.hold += V.reviveHold;
    }
  }
  const b = recordBudget(u);
  out.atk += Math.max(0, b.net) * V.liftDmg - b.cracks * V.crackDmg;
  out.hold = Math.max(V.minHold, out.hold);
  return out;
}

/** Cells more reach a weapon's +6" range traits give it. */
export const rangeBonus = (u: Unit, gun: string): number =>
  (u.weapons.find((w) => w.name === gun)?.traits ?? []).filter((t) => t.name === '+6" range').length * V.rangeTrait;

/** What a rule's effect does here, in a few words (heals and shields work differently in Training). */
export function hereText(e: Effect): string {
  const B = TRAINING.bleedField;
  switch (e.kind) {
    case 'heal': return `Enemies within ${B.radius} cells bleed`;
    case 'shield': return `Every ${e.every} round${e.every === 1 ? '' : 's'}, another tower deals +${Math.round(e.n * TRAINING.shieldBoost.perN * 100)}% for a round`;
    case 'barrage': return `${e.hits} extra hit${e.hits === 1 ? '' : 's'} at AP(${e.ap}) every ${e.every} round${e.every === 1 ? '' : 's'}${e.radius ? `, blasting ${e.radius} cells round` : ''}`;
    case 'thorns': return `While holding: ${e.n * e.chance} damage a second to the held enemy`;
    case 'leech': return `While holding: ${e.n} damage a second to the held enemy`;
    case 'lastStand': return `While holding: hits ${e.mul}× as hard`;
    case 'deathBlast': return `An enemy slain near it explodes for ${e.dmg} damage`;
    case 'revive': return `Holds ${Math.round(V.reviveHold * 100)}% longer`;
    case 'redeploy': return `Attacks ${Math.round(e.uses * V.redeployInit * TRAINING.habits.rate * 100)}% faster`;
    case 'aura': return `Aura (${e.radius} cells): ${e.stat === 'hit' ? '+1 to hit' : e.stat === 'save' ? 'nothing here (towers are never hit)' : e.stat === 'rate' ? `attacks ${Math.round(e.n * 100)}% faster` : `+${e.n} cell of reach`}`;
    case 'frenzy': return `Attacks ${e.mul}× as fast for ${e.time === 1 ? 'a round' : `${e.time} rounds`} every ${e.every} rounds while it has a target`;
    case 'field': return `Enemies within ${e.radius} cells are ${e.status === 'slow' ? 'slowed' : 'dazed (slower)'}`;
    case 'onHit': case 'sixes': case 'penalty': return describeHere(e);
  }
}

/** Effects whose text reads the same in both games. */
function describeHere(e: Extract<Effect, { kind: 'onHit' | 'sixes' | 'penalty' }>): string {
  if (e.kind === 'penalty') {
    if (e.stat === 'hit') return `-${e.n} to hit`;
    if (e.stat === 'rate') return `${Math.round(e.n * 100)}% less damage`;
    return '';
  }
  if (e.kind === 'sixes') return `A 6 to hit ${[e.dmg && `deals +${e.dmg}`, e.again && 'attacks again', e.rend && 'ignores armour'].filter(Boolean).join(' and ')}${e.only ? ` (${e.only === 'melee' ? 'melee' : 'shooting'})` : ''}`;
  const what = { slow: 'slows it', stun: 'stuns it', daze: 'dazes it', mark: 'marks it (+1 damage)', bleed: 'makes it bleed', knock: 'knocks it back', execute: 'finishes it off if badly hurt' }[e.status];
  return `${e.only === 'melee' ? 'Melee hits' : e.only === 'shoot' ? 'Shots that hit' : 'Hits'}: ${Math.round(e.chance * 100)}% ${what}`;
}

/** What rules folded into a tower's numbers (fighter()) do. */
const STAT_TEXT: Record<string, string> = {
  'blade master': '+1 AP in melee', mutations: '+½ AP', 'precise strikes': '+⅓ AP', specialists: 'Better hit rolls', elite: 'Better hit rolls',
  berserkers: 'More hits in melee', 'point blank': 'More hits shooting', 'targeting array': 'More hits shooting',
  'damaged equipment': '-1 to hit shooting', 'weakened muscles': '-1 to hit in melee', 'faulty aim': 'Fewer 6s',
  '+1 a': '+1 attack', '+1 ap': '+1 AP', brutal: '+1 AP', surge: 'More hits', 'spread shot': 'Blast +1', 'well balanced': '+1 to hit',
  rending: 'A 6 to hit gets AP(4) and ignores armour', unstoppable: 'Ignores regeneration (nothing here)', duplicate: 'Another copy of a trait',
  '+6" range': `+${V.rangeTrait} cells of reach`,
};

/** A badge on the tower card and the recipe book: a trait or scar, its Shard type (traits) and what it does here. */
export interface RecordBadge {
  name: string;
  kind: 'trait' | 'scar';
  type?: ShardType;
  text: string;
}

/** What one trait or scar does here, in a few words. */
function entryText(u: Unit, r: RecordEntry): string {
  const parts: string[] = [];
  const g = r.weapon ? undefined : lookup(V.grit, r.name);
  if (g?.tough) parts.push(`+${g.tough} Tough (holds longer)`);
  if (g?.hold) parts.push(`holds ${Math.round(Math.abs(g.hold) * 100)}% ${g.hold > 0 ? 'longer' : 'shorter'}`);
  if (g?.atk) parts.push(`+${Math.round(g.atk * 100)}% damage`);
  const effs = effectsOf(r.name, r.kind === 'trait' && !r.weapon) ?? [];
  parts.push(...effs.map(hereText).filter(Boolean));
  const stat = STAT_TEXT[r.name.toLowerCase()];
  if (stat && !parts.length) parts.push(stat);
  if (!parts.length && !r.weapon && !STAT_RULES.includes(r.name.toLowerCase()) && !hasRule(['Fast', 'Swift'], r.name)) {
    const unique = u.upgrades.find((x) => x.name === r.name)?.unique;
    const n = r.kind === 'scar' ? AUTO_BATTLE.scar : unique ? AUTO_BATTLE.uniqueTrait : AUTO_BATTLE.trait;
    parts.push(`${n > 0 ? '+' : ''}${Math.round((n / 2) * 100)}% damage`);
  }
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every trait and scar on the unit's record, as badges (weapon traits named with their weapon). */
export function recordBadges(u: Unit): RecordBadge[] {
  return recordOf(u).map((r) => ({
    name: r.weapon ? `${r.name} (${r.weapon})` : r.name,
    kind: r.kind,
    ...(r.kind === 'trait' ? { type: traitType(r) } : {}),
    text: entryText(u, r),
  }));
}
