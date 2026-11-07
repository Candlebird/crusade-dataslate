import type { CatalogBook, Unit } from '../../model/types';
import type { Status } from '../abilities';
import type { Gun } from '../autoBattle';
import { hasRule, ruleRating } from '../engine';
import { rand } from '../training/rng';
import { POWER_OF, WARPATH, type PowerId } from './data';
import { blastRadius } from './mods';
import type { BoonId, Body, Blow, EnemyWays, Squad, SquadRole, SquadTraits, WarpathRun, WGun, WSpell } from './types';

// What a datasheet's rules mean in Warpath: read once when a unit or enemy kind is built, into plain data the sim checks.
// The book's wording is the reference (Regeneration ignores wounds on 5+ unless Rending stops it, and so on).

const W = WARPATH;

/** The rule, or the same rule as an Aura (the unit has what it hands out). */
const own = (rules: string[], name: string) => hasRule(rules, name) || hasRule(rules, `${name} Aura`);
const anyOf = (rules: string[], names: string[]) => names.some((n) => own(rules, n));

/** A unit's rules with its upgrades. */
export const allRules = (u: Unit) => [...u.rules, ...u.upgrades.map((x) => x.name)];

/** Those and every rule on its weapons (what sets its archetype). */
export const everyRule = (u: Unit) => [...allRules(u), ...u.weapons.flatMap((w) => [...w.rules, ...w.traits.map((t) => t.name)])];

/** What shields a body and how it crosses the ground. None if it has nothing. */
export function bodyFrom(rules: string[]): Body | undefined {
  const b: Body = {};
  if (own(rules, 'Regeneration')) b.regen = true;
  if (own(rules, 'Resistance') || own(rules, 'Psy-Barrier')) b.ward = 5 / 6;
  else if (own(rules, 'Warding')) b.ward = 1 / 2;
  else if (own(rules, 'Protected')) b.ward = 1 / 6;
  if (anyOf(rules, ['Fortified', 'Enhanced', 'Ballistic Vest Boost', 'Heavy Shield OLD'])) b.plate = 'all';
  else if (anyOf(rules, ['Ballistic Vest', 'Warden', 'Sturdy'])) b.plate = 'far';
  if (own(rules, 'Evasive')) b.evade = 1;
  if (own(rules, 'Stealth')) b.stealth = true;
  if (own(rules, 'Melee Evasion')) b.meleeEvade = true;
  if (own(rules, 'Entrenched')) b.entrench = true;
  if (own(rules, 'Shadowborn Boost')) b.shadow = W.rules.shadowBoost;
  else if (own(rules, 'Shadowborn')) b.shadow = W.rules.shadowborn;
  if (own(rules, 'Flying') || hasRule(rules, 'Aircraft')) { b.flying = true; b.strider = true; }
  if (own(rules, 'Strider')) b.strider = true;
  if (hasRule(rules, 'Teleport') || hasRule(rules, 'Ethereal')) b.blink = true;
  return Object.keys(b).length ? b : undefined;
}

/** A weapon's rules as flags on the gun. */
export function gunFlags(g: Gun, rules: string[], unit: string[]): Partial<WGun> {
  const on = (name: string) => hasRule(rules, name);
  const f: Partial<WGun> = {};
  const melee = g.melee;
  if (g.rending || g.bane || on('Poison') || on('Disintegrate') || on('Ignores Regeneration') || (melee && hasRule(unit, 'Bane in Melee'))) f.noRegen = true;
  if (on('Ignores Cover') || on('Unstoppable') || on('Demolish') || on('Fragment') || g.blast > 1) f.noCover = true;
  if (on('Quake')) f.shred = 2;
  else if (on('Shred') || on('Hollow Point') || (!melee && hasRule(unit, 'Shred when Shooting Aura'))) f.shred = 1;
  if (on('Bane') || (melee && hasRule(unit, 'Bane in Melee'))) f.bane = true;
  if (on('Surge')) f.surge = true;
  if (on('Thrust') || (melee && hasRule(unit, 'Thrust in Melee Aura'))) f.thrust = true;
  if (melee && hasRule(unit, 'Melee Slayer')) f.slayer = true;
  if (on('Duelist')) f.duelist = true;
  if (on('Reaping')) f.reaping = true;
  if (on('Rapid Volley')) f.rapid = true;
  if (on('Suppressing Fire')) f.suppress = true;
  if (on('Slowing Strike')) f.slowing = true;
  if (on('Demolish')) f.demolish = true;
  if (on('Disintegrate')) f.crack = { def: 3, ap: 2 };
  else if (on('Fragment')) f.crack = { def: 4, ap: 1 };
  if (on('Unstoppable')) f.unstoppable = true;
  return f;
}

/** The same rules on an enemy's attack. */
export const blowFrom = (f: Partial<WGun>, ranged: boolean): Blow | undefined => {
  const b: Blow = {};
  if (f.noRegen) b.noRegen = true;
  if (f.shred) b.shred = f.shred;
  if (f.noCover) b.noCover = true;
  if (ranged) b.ranged = true;
  return Object.keys(b).length ? b : undefined;
};

/** Does a Buff rule name one of the boons? */
const BUFFS: [string, BoonId][] = [
  ['Defense Buff', 'def'], ['Regeneration Buff', 'regen'], ['Furious Buff', 'furious'], ['Precision Fighter Buff', 'hit'], ['Precision Shooter Buff', 'hit'],
  ['Speed Buff', 'speed'], ['Increased Shooting Range Buff', 'reach'], ['Evasive Buff', 'evade'],
];

/** A squad's rules that aren't about being hit. */
export function traitsFrom(rules: string[]): SquadTraits | undefined {
  const t: SquadTraits = {};
  if (own(rules, 'Furious') || own(rules, 'Ancient Wrath')) t.furious = true;
  const impact = ruleRating(rules, 'Impact') ?? ruleRating(rules, 'Heavy Impact');
  if (impact) t.impact = impact;
  if (hasRule(rules, 'Heavy Impact') || hasRule(rules, 'Mighty Horns')) t.impactAp = 1;
  if (hasRule(rules, 'Scout')) t.scout = true;
  if (hasRule(rules, 'Transport')) t.ferry = true;
  if (hasRule(rules, 'Counter')) t.counter = true;
  if (own(rules, 'Fear')) t.fear = true;
  const buffs = BUFFS.filter(([r]) => hasRule(rules, r)).map(([, b]) => b);
  if (buffs.length) t.buffs = buffs;
  return Object.keys(t).length ? t : undefined;
}

const has = (rules: string[], names: string[]) => names.some((n) => hasRule(rules, n));
const CHARGE = ['Impact', 'Heavy Impact', 'Mighty Horns', 'Furious', 'Thrust', 'Melee Slayer', 'Ancient Wrath', 'Furious Aura', 'Melee Slayer Aura'];
const PHASE = ['Teleport', 'Ethereal', 'Stealth', 'Shadowborn', 'Shadowborn Boost', 'Evasive', 'Melee Evasion'];
const AMBUSH = ['Ambush', 'Infiltrate', 'Surprise Attack'];
const HELP = ['Mend', 'Heal', 'Transport', 'Field Medic', ...BUFFS.map(([r]) => r)];
const HUNT = ['Sniper', 'Takedown', 'Duelist'];
const QUICK = ['Scout', 'Quick Shot', 'Hit & Run', 'Hit & Run Shooter'];
const STAND = ['Fortified', 'Sturdy', 'Ballistic Vest', 'Counter', 'Entrenched', 'Trench Warfare', 'Brace for Impact'];
const REAP = ['Reaping', 'Surge', 'Rapid Volley', 'Shred', 'Hollow Point', 'Bane', 'Rending'];

/** A unit's archetype: the first of these its rules (its weapons' too) match. */
export function roleFrom(rules: string[], u: Pick<Unit, 'category' | 'tough'>): SquadRole {
  if (hasRule(rules, 'Immobile') || u.category === 'Fortification') return 'fortress';
  if (has(rules, ['Aircraft', 'Flying']) || u.category === 'Aircraft') return 'flyer';
  if (hasRule(rules, 'Indirect')) return 'artillery';
  if (has(rules, PHASE)) return 'phantom';
  if (hasRule(rules, 'Caster')) return 'mystic';
  if (has(rules, CHARGE)) return 'charger';
  if (has(rules, AMBUSH)) return 'ambusher';
  if (has(rules, HELP)) return 'support';
  if (has(rules, HUNT)) return 'hunter';
  if (has(rules, QUICK)) return 'skirmisher';
  if (has(rules, STAND) || (u.tough ?? 1) >= 6 || u.category === 'Vehicle/Monster') return 'bulwark';
  if (has(rules, REAP)) return 'reaver';
  return 'gunline';
}

/** A unit's archetype, for the screens. */
export const roleOfUnit = (u: Unit) => roleFrom(everyRule(u), u);

/** A squad's archetype (an old save has none: read from its kind). */
export function roleOf(s: Squad): SquadRole {
  if (s.role) return s.role;
  if (s.kind === 'fort') return 'fortress';
  if (s.kind === 'air') return 'flyer';
  if (s.kind === 'artillery') return 'artillery';
  if (s.kind === 'heavy') return 'bulwark';
  return s.caster > 0 ? 'mystic' : 'gunline';
}

/** The hero's order: every archetype gives one. */
export const heroPowerOf = (s: Squad): PowerId => POWER_OF[roleOf(s)];

/** How an enemy datasheet fights. */
export function waysFrom(rules: string[], tough: number): EnemyWays | undefined {
  const w: EnemyWays = {};
  const impact = ruleRating(rules, 'Impact') ?? ruleRating(rules, 'Heavy Impact') ?? 0;
  if (impact || hasRule(rules, 'Fast') || hasRule(rules, 'Very Fast')) w.lunge = { hits: impact, ap: hasRule(rules, 'Heavy Impact') || hasRule(rules, 'Mighty Horns') ? 1 : 0 };
  if (hasRule(rules, 'Flying') || hasRule(rules, 'Aircraft')) w.flies = true;
  if (['Ambush', 'Infiltrate', 'Surprise Attack'].some((r) => hasRule(rules, r))) w.ambush = true;
  const caster = ruleRating(rules, 'Caster') ?? 0;
  if (caster) w.caster = caster;
  if (hasRule(rules, 'Mend') || hasRule(rules, 'Heal') || hasRule(rules, 'Healing Aura')) w.mend = true;
  if (hasRule(rules, 'Fear')) w.fear = true;
  const fuse = ruleRating(rules, 'Self-Destruct') ?? 0;
  if (fuse) w.fuse = fuse;
  if (tough >= W.foes.slamTough || hasRule(rules, 'Very Heavy')) w.slam = true;
  return Object.keys(w).length ? w : undefined;
}

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3 };

/** A book's spell read from its wording; undefined if it does nothing here (morale alone counts as a daze). */
export function readSpell(name: string, cost: number, effect: string): WSpell | undefined {
  const t = effect.toLowerCase();
  const n = /(?:target|pick(?: up to)?) (\d+|one|two|three)\b/.exec(t)?.[1];
  const targets = n ? (WORDS[n] ?? Number(n)) : 1;
  const sp: WSpell = { name, cost: Math.max(1, cost), targets };
  const hits = /takes? (\d+) hits?/.exec(t);
  if (hits) {
    sp.hits = Number(hits[1]);
    sp.ap = Number(/ap\((\d+)\)/.exec(t)?.[1] ?? 0);
    const deadly = /deadly\((\d+)\)/.exec(t);
    if (deadly) sp.deadly = Number(deadly[1]);
    const blast = /blast\((\d+)\)/.exec(t);
    sp.radius = blast ? blastRadius(Number(blast[1])) : W.caster.spellRadius;
    if (blast) sp.hits *= Number(blast[1]);
    if (/disintegrate|rending|ignores regeneration/.test(t)) sp.noRegen = true;
    return sp;
  }
  const friendly = /friendly/.test(t) && !/enemy/.test(t.split('friendly')[0]);
  if (friendly) {
    const boon: BoonId | undefined = /regeneration/.test(t) ? 'regen' : /evasive/.test(t) ? 'evade' : /to hit/.test(t) ? 'hit' : /defense/.test(t) ? 'def' : /furious/.test(t) ? 'furious'
      : /move|flying/.test(t) ? 'speed' : /range/.test(t) ? 'reach' : undefined;
    return boon ? { ...sp, boon } : undefined;
  }
  const curse: Status | undefined = /defense/.test(t) ? 'mark' : /to hit|morale/.test(t) ? 'daze' : undefined;
  return curse ? { ...sp, curse } : undefined;
}

/** A caster's spells from its book. */
export function spellsOf(u: Unit, books?: CatalogBook[]): WSpell[] | undefined {
  const book = books?.find((b) => b.uid === u.bookUid) ?? books?.find((b) => b.name === u.bookName);
  const list = (book?.spells ?? []).flatMap((s) => readSpell(s.name, s.threshold, s.effect) ?? []);
  return list.length ? list : undefined;
}

/** A boon's seconds left. */
export const boon = (s: Squad, id: BoonId) => (s.boon?.[id] ?? 0) > 0;

/** Give a boon for a while. */
export function bless(s: Squad, id: BoonId, secs: number = W.roles.boonSecs): void {
  (s.boon ??= {})[id] = Math.max(s.boon[id] ?? 0, secs);
}

/** Is a wound ignored (Regeneration 5+ unless stopped, then a ward's 6+; wards are better against spells)? */
export function shrug(run: WarpathRun, b: Body | undefined, noRegen: boolean | undefined, spell?: boolean, regen = b?.regen): boolean {
  if (regen && !noRegen && rand(run) < W.rules.regen) return true;
  return !!b?.ward && rand(run) < (spell ? b.ward : W.rules.ward);
}

/** The to-hit penalty a body gets against an attack. */
export const dodgeOf = (b: Body | undefined, melee: boolean, far: boolean) =>
  !b ? 0 : (b.evade ?? 0) + (melee ? (b.meleeEvade ? 1 : 0) : b.stealth && far ? 1 : 0);

/** AP a body's plate takes off an attack. */
export const plateOf = (b: Body | undefined, far: boolean) => (b?.plate === 'all' || (b?.plate === 'far' && far) ? 1 : 0);
