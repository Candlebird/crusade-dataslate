import type { Campaign, Force, Unit, Weapon } from '../model/types';
import { abilitiesOf, describe, effects, modelled, type Ability, type Status } from './abilities';
import { modifierOf } from './difficulty';
import { deathDiceCount, hasRule, levelForXp, ruleRating } from './engine';
import { activeEvent } from './nexus';
import { teamsOf, type TeamKey, type TrackedBattle } from './tracker';
import { leadsWith } from './warlords';

// Auto-battle: when there's no time to play a battle out, each unit gets an overall Attack and Defense from its
// profile (quality, defense, weapons, traits, relics, level), and the units trade blows for 4 rounds. A unit brought
// to half strength, or beaten in melee, tests its morale: failing leaves it Shaken, and it spends its next turn rallying.
// The sector's modifiers and the round's Galactic Event play their part too.

export const AUTO_BATTLE = {
  rounds: 4,
  /** Runs behind the forecast shown before a fight. */
  forecastRuns: 100,
  /** Each attack deals its expected wounds times a random factor from `luck` to `luck + 1`. */
  luck: 0.5,
  /** A melee target that survives strikes back with this share of its own melee. */
  strikeBack: 0.5,
  /** The side that lost the smaller share of its own points wins; within this many percentage points of each other, it's a draw. */
  drawMargin: 0.05,
  /** Each crusade level adds this much to Attack and Defense. */
  perLevel: 0.03,
  hero: 0.05,
  /** Traits and relics the auto-battle doesn't model one by one still count for this much each. */
  trait: 0.04,
  uniqueTrait: 0.08,
  relic: { Common: 0.05, Rare: 0.08, Legendary: 0.12 },
  scar: -0.04,
  /** What the Attack shown on a unit is measured against: Defense 4+, 5 models, Tough(1). */
  baseline: { defense: 4, size: 5, tough: 1 },
  /**
   * How hard a crusade force pushes an off-table fight. `attack` scales the wounds its units deal, `taken` the wounds
   * they take; a Cautious unit brought to half strength pulls out of the fight instead of fighting to the death.
   */
  /** A unit that pulled out counts this share of what it had left as lost, when judging who won: it gave up the ground. */
  withdrawCost: 0.5,
  stances: {
    cautious: { label: 'Cautious', attack: 1, taken: 1, withdraw: true, fearless: false, text: 'units pull back at half strength instead of fighting on, which gives up ground' },
    committed: { label: 'Committed', attack: 1, taken: 1, withdraw: false, fearless: false, text: 'fights it out' },
    allout: { label: 'All-out', attack: 1.25, taken: 1.25, withdraw: false, fearless: true, text: 'hits harder and takes harder hits, and never takes a Morale test' },
  },
};

export type Stance = keyof typeof AUTO_BATTLE.stances;
export const STANCES = Object.keys(AUTO_BATTLE.stances) as Stance[];

/** A weapon reduced to what the auto-battle needs. */
export interface Gun {
  name: string;
  melee: boolean;
  /** Inches; 0 = melee. */
  range: number;
  /** Total attacks: models × attacks per model. */
  attacks: number;
  ap: number;
  hitMod: number;
  blast: number;
  deadly: number;
  rending: boolean;
  reliable: boolean;
  /** Ignores Regeneration and similar. */
  bane: boolean;
}

export interface Fighter {
  /** sideId:unitId, unique across the battle. */
  key: string;
  sideId: string;
  team: TeamKey;
  /** The tracker unit's id. */
  unitId: string;
  name: string;
  points: number;
  quality: number;
  defense: number;
  size: number;
  tough: number;
  hp: number;
  maxHp: number;
  guns: Gun[];
  /** Saves: +1 to Defense rolls from traits, Fortified (AP -1). */
  defMod: number;
  fortified: boolean;
  /** Share of wounds ignored (Regeneration 5+, Protected 6+…). */
  ignore: number;
  /** Enemies get -1 to hit (Evasive, Stealth against shooting). */
  evasive: number;
  impact: number;
  /** To-hit modifiers from traits and scars. */
  hitShoot: number;
  hitMelee: number;
  /** Charges in round 1 instead of shooting. */
  fast: boolean;
  hero: boolean;
  /** The unit a hero has joined: it can't be picked out while that unit stands, as at the table. */
  host?: string;
  /** Bonus to Morale tests (Fearless, Fanatical Garrison). */
  morale: number;
  /** Bonus to Defense in round 1 (Entrenched). */
  r1Def: number;
  /** To-hit bonus when shooting in rounds 1 and 2 (Prepared Firing Lines; a penalty from Umbral Fog, Ion Storm). */
  earlyShoot: number;
  /** Charging in rounds 1 and 2 crosses Dangerous terrain (Minefields). */
  mines: boolean;
  /** Failed a Morale test: spends its next activation rallying, and can't strike back meanwhile. */
  shaken: boolean;
  /** Has taken its half-strength Morale test. */
  tested: boolean;
  /** Multipliers from traits, relics, Hero and level the auto-battle doesn't model one by one. */
  atkBonus: number;
  defBonus: number;
  /** Shooting and melee Attack, and Defense, as shown. */
  shoot: number;
  melee: number;
  attack: number;
  def: number;
  /** Why the numbers are what they are. */
  notes: string[];
  /** Kill XP earned so far. */
  xp: number;
  /** What its rules, traits, relics and scars do beyond the numbers. */
  abilities: Ability[];
  /** Wounds a shield soaks before its own. */
  shield: number;
  /** Left on it by enemy hits, until its next activation. */
  status: Status[];
  /** Has used its once-a-battle revive. */
  revived: boolean;
  /** Dice it rolls on the death roll if destroyed (2 with Lowered Constitution). */
  deathDice?: number;
  /** Pulled out of the fight (a Cautious stance at half strength): out of reach, but not destroyed. */
  withdrawn?: boolean;
}

export type MoveKind = 'shoot' | 'charge' | 'advance' | 'rally' | 'return' | 'stunned' | 'heal';

export interface Move {
  round: number;
  attacker: string;
  target?: string;
  kind: MoveKind;
  dmg: number;
  /** Melee damage struck back at the attacker. */
  back: number;
  /** Wounds the attacker lost to Dangerous terrain on the way in. */
  hazard?: number;
  /** The target was Shaken, so couldn't strike back. */
  cowed?: boolean;
  /** Units that failed a Morale test from this move. */
  shaken?: string[];
  /** Units that pulled out of the fight after this move. */
  withdrew?: string[];
  targetHp: number;
  attackerHp: number;
  /** What its abilities did along the way. */
  notes?: string[];
}

export interface AutoResult {
  fighters: Fighter[];
  moves: Move[];
  /** Points of enemy destroyed per team, counting partly-killed units by the wounds they lost. */
  dealt: Partial<Record<TeamKey, number>>;
  /** The share (0–1) of its own points each team lost. */
  lost: Partial<Record<TeamKey, number>>;
  winner: TeamKey | 'draw';
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** "3" → 3, "D3" → 2, "2D6+1" → 8: the average. */
export function avgAttacks(a: number | string): number {
  if (typeof a === 'number') return a;
  const m = a.replace(/\s/g, '').match(/^(\d*)D(\d+)(?:\+(\d+))?$/i);
  if (m) return (Number(m[1] || 1) * (Number(m[2]) + 1)) / 2 + Number(m[3] || 0);
  return Number(a.replace(/[^\d.]/g, '')) || 1;
}

const count = (names: string[], n: string) => names.filter((x) => x.toLowerCase() === n.toLowerCase()).length;

function gun(w: Weapon): Gun {
  const traits = w.traits.map((t) => t.name);
  // Duplicate copies another trait on the weapon: count it as one more of the first stacking one.
  const dup = count(traits, 'Duplicate');
  const plusA = count(traits, '+1 A') + (dup && traits.includes('+1 A') ? dup : 0);
  const plusAp = count(traits, '+1 AP') + count(traits, 'Brutal') + count(traits, 'Bane') + (dup && traits.includes('+1 AP') ? dup : 0);
  const rules = [...w.rules, ...traits];
  const blast = ruleRating(rules, 'Blast') ?? (hasRule(rules, 'Blast') ? 3 : 1);
  return {
    name: w.name,
    melee: w.range === 0,
    range: w.range,
    attacks: Math.max(1, w.count) * (avgAttacks(w.attacks) + plusA),
    ap: (ruleRating(rules, 'AP') ?? 0) + plusAp,
    hitMod: (hasRule(rules, 'Well Balanced') ? 1 : 0) + (hasRule(rules, 'Surge') || hasRule(rules, 'Brutal') ? 0.17 : 0),
    blast: blast + (hasRule(rules, 'Spread Shot') ? 1 : 0),
    deadly: ruleRating(rules, 'Deadly') ?? 1,
    rending: hasRule(rules, 'Rending'),
    reliable: hasRule(rules, 'Reliable'),
    bane: ['Bane', 'Rending', 'Quake', 'Unstoppable'].some((r) => hasRule(rules, r)),
  };
}

/** A relic weapon's profile, e.g. 'Melee, A4, AP(1), Demolish' or '18", A1, AP(2), Deadly(3)'. */
function relicWeapon(name: string, profile: string): Weapon {
  const parts = profile.split(',').map((p) => p.trim());
  const range = parts[0] === 'Melee' ? 0 : Number(parts[0].replace(/\D/g, '')) || 12;
  const a = parts.find((p) => /^A\s?\S+$/.test(p));
  return { id: name, name, count: 1, range, attacks: a ? a.replace(/^A\s?/, '') : 1, rules: parts.filter((p) => p !== parts[0] && p !== a), traits: [] };
}

/** Hit chance: quality X+ with modifiers, never better than 2+ or worse than 6+. */
const hitChance = (quality: number, mod: number) => clamp((7 - quality + mod) / 6, 1 / 6, 5 / 6);
/** Chance a Defense roll fails against AP. */
const failChance = (defense: number, ap: number, mod: number) => 1 - clamp((7 - defense - ap + mod) / 6, 0, 5 / 6);

interface Target {
  defense: number;
  size: number;
  tough: number;
  defMod: number;
  fortified: boolean;
  ignore: number;
  evasive: number;
}

/** Expected wounds a weapon deals to a target. */
function gunDamage(g: Gun, quality: number, hitBonus: number, t: Target, alive: number): number {
  const hit = g.reliable ? 5 / 6 : hitChance(quality, g.hitMod + hitBonus - t.evasive * (g.melee ? 0.5 : 1));
  const hits = g.attacks * hit * Math.min(g.blast, Math.max(1, alive));
  const ap = Math.max(0, g.ap - (t.fortified ? 1 : 0));
  // Rending: 6s to hit get AP(+4).
  const sixes = g.rending ? Math.min(1, 1 / 6 / hit) : 0;
  const fail = sixes * failChance(t.defense, ap + 4, t.defMod) + (1 - sixes) * failChance(t.defense, ap, t.defMod);
  const ignore = g.bane ? Math.min(t.ignore, 1 / 6) : t.ignore;
  return hits * fail * Math.min(g.deadly, t.tough) * (1 - ignore);
}

/** A unit as an auto-battle fighter: its weapons, saves and the bonuses from everything it has earned. */
export function fighter(u: Unit | undefined, t: { id: string; name: string; wounds: number; maxWounds: number; points?: number }, sideId: string, team: TeamKey): Fighter {
  const notes: string[] = [];
  const quality = u?.quality ?? 4;
  const defense = u?.defense ?? 4;
  const tough = Math.max(1, u?.tough || 1);
  const size = Math.max(1, u?.size ?? t.maxWounds);
  const upgrades = (u?.upgrades ?? []).map((x) => x.name);
  const scars = (u?.scars ?? []).map((x) => x.name);
  const names = [...(u?.rules ?? []), ...upgrades, ...scars];
  const has = (n: string) => hasRule(names, n);
  notes.push(`Quality ${quality}+ (hits on ${quality}+), Defense ${defense}+, ${size > 1 ? `${size} models, ` : ''}Tough(${tough})`);

  const weapons = [...(u?.weapons ?? []), ...(u?.relics ?? []).filter((r) => r.profile).map((r) => relicWeapon(r.name, r.profile!))];
  if (!weapons.length) weapons.push({ id: 'x', name: 'Hand weapons', count: size, range: 0, attacks: 1, rules: [], traits: [] });
  const guns = weapons.map(gun);
  if (has('Blade Master')) guns.filter((g) => g.melee).forEach((g) => (g.ap += 1));
  if (has('Mutations')) guns.forEach((g) => (g.ap += 0.5));
  if (has('Precise Strikes')) guns.forEach((g) => (g.ap += 0.33));

  let defMod = 0;
  const known: string[] = [];
  const note = (name: string, text: string) => { known.push(name); notes.push(`${name}: ${text}`); };
  if (has('Resilient')) { defMod += 1; note('Resilient', '+1 to Defense'); }
  if (has('Weakened Armor')) { defMod -= 1; note('Weakened Armor', '-1 to Defense'); }
  if (has('Armoured Prow')) { defMod += 0.5; note('Armoured Prow', '+1 to Defense in melee'); }
  if (has('Dug In')) { defMod += 0.3; note('Dug In', 'sometimes +1 to Defense'); }
  const fortified = has('Fortified') || has('Enhanced');
  if (fortified) note(has('Enhanced') ? 'Enhanced' : 'Fortified', 'hits on it lose AP(1)');
  const ignore = has('Regeneration') ? 1 / 3 : has('Protected') || has('Ghostly') || has('Heroic Presence') || has('Artisan Bionics') ? 1 / 6 : 0;
  if (ignore) notes.push(`Ignores ${ignore > 0.2 ? '1 wound in 3 (Regeneration)' : '1 wound in 6'}`);
  const evasive = (has('Evasive') ? 1 : 0) + (has('Stealth') || has('Ghostly') ? 0.5 : 0);
  if (evasive) notes.push(`Enemies get -1 to hit it${evasive < 1 ? ' when shooting from afar' : ''}`);
  const extraTough = 3 * (count(upgrades, 'Tough +3') + count(upgrades, 'Toughened Scars') + count(upgrades, 'Enhanced'));

  let hitShoot = 0;
  let hitMelee = 0;
  if (has('Specialists') || has('Elite')) { hitShoot += 0.5; hitMelee += 0.5; note(has('Elite') ? 'Elite' : 'Specialists', 'better hit rolls'); }
  if (has('Berserkers')) { hitMelee += 0.5; note('Berserkers', 'more hits in melee'); }
  if (has('Point Blank') || has('Targeting Array')) { hitShoot += 0.3; note(['Point Blank', 'Targeting Array'].find(has)!, 'more hits when shooting'); }
  if (has('Damaged Equipment')) { hitShoot -= 1; note('Damaged Equipment', '-1 to hit when shooting'); }
  if (has('Weakened Muscles')) { hitMelee -= 1; note('Weakened Muscles', '-1 to hit in melee'); }
  if (has('Faulty Aim')) { hitShoot -= 0.17; hitMelee -= 0.17; note('Faulty Aim', 'fewer 6s'); }
  known.push('Blade Master', 'Mutations', 'Precise Strikes', 'Regeneration', 'Protected', 'Ghostly', 'Heroic Presence', 'Artisan Bionics', 'Evasive', 'Stealth', 'Tough +3', 'Toughened Scars');

  const impact = (ruleRating(names, 'Impact') ?? 0) + 3 * count(upgrades, 'Impact +3') + 6 * count(upgrades, 'Impact +6') + (has('Momentum') ? size : 0);
  const abilities = abilitiesOf(u);
  const fast = ['Aura of Swiftness'].some(has) || effects(abilities, 'redeploy').length > 0;
  const morale = has('Fearless') ? 1 : 0;
  if (morale) notes.push('Fearless: +1 to Morale tests');

  // Everything else it has earned still counts, a little each.
  let atkBonus = 1;
  let defBonus = 1;
  for (const a of abilities) for (const e of a.effects) {
    notes.push(`${a.source}${a.gun ? ` (${a.gun})` : ''}: ${describe(e)}`);
    if (e.kind !== 'penalty') continue;
    if (e.stat === 'hit') { hitShoot -= e.n; hitMelee -= e.n; }
    if (e.stat === 'save') defMod -= e.n;
    if (e.stat === 'rate') atkBonus *= 1 - e.n;
    if (e.stat === 'hp') defBonus *= 1 - e.n;
  }
  const level = u ? levelForXp(u.xp) : 0;
  if (level) { atkBonus += level * AUTO_BATTLE.perLevel; defBonus += level * AUTO_BATTLE.perLevel; notes.push(`Level ${level}: +${Math.round(level * AUTO_BATTLE.perLevel * 100)}%`); }
  if (u && hasRule(u.rules, 'Hero')) { atkBonus += AUTO_BATTLE.hero; defBonus += AUTO_BATTLE.hero; notes.push(`Hero: +${AUTO_BATTLE.hero * 100}%`); }
  const other = (u?.upgrades ?? []).filter((x) => !known.includes(x.name) && !modelled(abilities, x.name) && !hasRule(['Fast', 'Swift', 'Impact +3', 'Impact +6', 'Momentum'], x.name));
  if (other.length) {
    const add = other.reduce((n, x) => n + (x.unique ? AUTO_BATTLE.uniqueTrait : AUTO_BATTLE.trait), 0);
    atkBonus += add / 2; defBonus += add / 2;
    notes.push(`${other.map((x) => x.name).join(', ')}: +${Math.round(add * 100)}%`);
  }
  const relics = (u?.relics ?? []).filter((r) => !r.profile && !modelled(abilities, r.name));
  if (relics.length) {
    const add = relics.reduce((n, r) => n + AUTO_BATTLE.relic[r.tier], 0);
    atkBonus += add / 2; defBonus += add / 2;
    notes.push(`${relics.map((r) => r.name).join(', ')}: +${Math.round(add * 100)}%`);
  }
  const otherScars = scars.filter((s) => !['Weakened Armor', 'Damaged Equipment', 'Weakened Muscles', 'Faulty Aim'].includes(s) && !modelled(abilities, s));
  if (otherScars.length) {
    atkBonus += (otherScars.length * AUTO_BATTLE.scar) / 2; defBonus += (otherScars.length * AUTO_BATTLE.scar) / 2;
    notes.push(`${otherScars.join(', ')}: ${Math.round(otherScars.length * AUTO_BATTLE.scar * 100)}%`);
  }
  if (extraTough) defBonus *= (size * tough + extraTough) / (size * tough);

  const f: Fighter = {
    key: `${sideId}:${t.id}`, sideId, team, unitId: t.id, name: t.name, points: t.points ?? u?.points ?? 0,
    quality, defense, size, tough, hp: t.wounds, maxHp: t.maxWounds, guns, defMod, fortified, ignore, evasive, impact, hitShoot, hitMelee, fast,
    hero: !!u && hasRule(u.rules, 'Hero'), deathDice: u ? deathDiceCount(u) : 1, morale, r1Def: 0, earlyShoot: 0, mines: false, shaken: false, tested: false,
    atkBonus: Math.max(0.5, atkBonus), defBonus: Math.max(0.5, defBonus), shoot: 0, melee: 0, attack: 0, def: 0, notes, xp: 0,
    abilities, shield: 0, status: [], revived: false,
  };
  return rate(f);
}

/** The Attack and Defense shown on a fighter. */
function rate(f: Fighter): Fighter {
  const base = { ...AUTO_BATTLE.baseline, defMod: 0, fortified: false, ignore: 0, evasive: 0 };
  f.shoot = round1(damage(f, base, 'shoot', base.size));
  f.melee = round1(damage(f, base, 'charge', base.size));
  f.attack = round1(Math.max(f.shoot, f.melee) + 0.35 * Math.min(f.shoot, f.melee));
  // Defense: hits from a plain AP(0) weapon it takes to deal one wound.
  f.def = round1((f.defBonus * (1 / failChance(f.defense, 0, f.defMod)) / (1 - f.ignore)) * (1 + f.evasive / 6));
  return f;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const hitBonus = (f: Fighter, kind: MoveKind) => (kind === 'shoot' ? f.hitShoot : f.hitMelee);

/** Models still standing. */
const alive = (f: { hp: number; tough: number; size: number }) => Math.min(f.size, Math.ceil(f.hp / f.tough));

/** Expected wounds `f` deals to `t` this move, before its target's Defense bonus. */
function damage(f: Fighter, t: Target, kind: MoveKind, targetModels: number, hit = hitBonus(f, kind)): number {
  if (kind !== 'shoot' && kind !== 'charge') return 0;
  const melee = kind === 'charge';
  // A unit that has lost models has fewer guns.
  const share = alive(f) / f.size;
  let n = f.guns.filter((g) => g.melee === melee).reduce((sum, g) => sum + gunDamage(g, f.quality, hit, t, targetModels), 0);
  if (melee && f.impact) n += f.impact * (5 / 6) * failChance(t.defense, 0, t.defMod) * (1 - t.ignore);
  return n * share * f.atkBonus;
}

/** Expected wounds `f` deals to `t` in this round, with the round's sector effects. */
function expected(f: Fighter, t: Fighter, kind: MoveKind, round: number, hitMod = 0) {
  const target = round === 1 && t.r1Def ? { ...t, defMod: t.defMod + t.r1Def } : t;
  const hit = hitBonus(f, kind) + (kind === 'shoot' && round <= 2 ? f.earlyShoot : 0) + hitMod;
  return damage(f, target, kind, alive(t), hit) / t.defBonus;
}

/** What a unit does this round: shoot, charge, or (with nothing to shoot and too slow to charge) advance. */
function moveKind(f: Fighter, round: number, t: Fighter): MoveKind {
  const shoot = expected(f, t, 'shoot', round);
  const charge = expected(f, t, 'charge', round);
  if (round === 1 && !f.fast) return shoot > 0 ? 'shoot' : 'advance';
  return charge > shoot ? 'charge' : shoot > 0 ? 'shoot' : 'advance';
}

/** Pick a target: the enemy it can hurt most for its worth, with some luck. */
function pickTarget(f: Fighter, enemies: Fighter[], round: number, rng: () => number): Fighter {
  const weight = (t: Fighter) => {
    const kind = moveKind(f, round, t);
    const dmg = Math.min(t.hp, expected(f, t, kind === 'advance' ? 'charge' : kind, round));
    return Math.pow(0.05 + (dmg / t.maxHp) * (t.points + 50), 2);
  };
  const ws = enemies.map(weight);
  let r = rng() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < enemies.length; i++) if ((r -= ws[i]) <= 0) return enemies[i];
  return enemies[enemies.length - 1];
}

/** Expected wounds, with luck, rounded up or down at random. */
function roll(exp: number, rng: () => number): number {
  const n = exp * (AUTO_BATTLE.luck + rng());
  return Math.floor(n) + (rng() < n - Math.floor(n) ? 1 : 0);
}

/** Kill XP for wounds dealt: 1 per wound of each model destroyed, ½ per model in 10+ model, 1-wound units (as on the tracker). */
function killXp(t: Fighter, before: number, after: number): number {
  const lost = alive({ ...t, hp: before }) - alive({ ...t, hp: after });
  return lost * (t.tough === 1 && t.size >= 10 ? 0.5 : t.tough);
}

/** A Morale test: a Quality test, with its bonuses. Failing leaves the unit Shaken. */
function moraleTest(f: Fighter, rng: () => number): boolean {
  if (f.hp <= 0 || f.shaken) return false;
  f.shaken = rng() >= hitChance(f.quality, f.morale);
  return f.shaken;
}

/** The test a unit takes on first being brought to half strength. */
function halfStrength(f: Fighter, rng: () => number): boolean {
  if (f.tested || f.hp <= 0 || f.hp > f.maxHp / 2) return false;
  f.tested = true;
  return moraleTest(f, rng);
}

/** Every unit still in the fight on each side, as fighters. */
export function fightersOf(b: TrackedBattle, forces: Force[]): Fighter[] {
  return b.sides.flatMap((side) => {
    const force = forces.find((f) => f.id === side.forceId);
    return side.units.filter((t) => !t.destroyed && t.wounds > 0).map((t) => {
      const u = (side.roster ?? []).find((x) => x.id === t.unitId) ?? force?.units.find((x) => x.id === t.unitId);
      return fighter(u, t, side.id, side.team);
    });
  });
}

/** Battle-wide effects from the sector: who goes first, and whose first fallen unit comes back. */
export interface AutoOptions {
  /** Activates first in round 1 (Home Ground). */
  first?: TeamKey;
  /** The first of this team's non-hero units destroyed comes back once, at full strength, next round (Endless Tide). */
  tide?: TeamKey;
  /** How hard each team pushes (Committed if not set). */
  stances?: Partial<Record<TeamKey, Stance>>;
}

/** What the battle's sector modifiers and Galactic Event do in an auto-battle. */
export interface AutoSetup extends AutoOptions {
  fighters: Fighter[];
  /** What's in play, to show. */
  effects: string[];
}

const best = (fs: Fighter[], by: (f: Fighter) => number, n: number) => [...fs].sort((a, b) => by(b) - by(a)).slice(0, n);

/** Every unit still in the fight, with the sector's modifiers and the round's Galactic Event applied. */
export function autoSetup(b: TrackedBattle, forces: Force[], c?: Campaign): AutoSetup {
  const fighters = fightersOf(b, forces);
  const setup: AutoSetup = { fighters, effects: [] };
  const sector = c?.sectors.find((s) => s.id === b.sectorId);
  const touched = new Set<Fighter>();
  const give = (fs: Fighter[], note: string, fn: (f: Fighter) => void) => fs.forEach((f) => { fn(f); f.notes.push(note); touched.add(f); });
  const names = (fs: Fighter[]) => fs.map((f) => f.name).join(' & ');
  const att = fighters.filter((f) => f.team === b.attacker);
  const def = fighters.filter((f) => f.team !== b.attacker);
  const defender = def[0]?.team;
  if (sector && b.attacker && defender) {
    for (const m of (sector.modifiers ?? []).map(modifierOf)) {
      if (!m) continue;
      const say = (text: string) => setup.effects.push(`${m.name}: ${text}`);
      const note = `${m.name}: `;
      switch (m.id) {
        case 'entrenched': give(def, `${note}+1 to Defense in round 1`, (f) => (f.r1Def += 1)); say('the defenders get +1 to Defense in round 1.'); break;
        case 'lurkers': {
          const fs = best(def.filter((f) => !f.fast), (f) => f.melee, 2);
          give(fs, `${note}Ambush, so can charge in round 1`, (f) => (f.fast = true));
          if (fs.length) say(`${names(fs)} gain Ambush, so can charge in round 1.`);
          break;
        }
        case 'fanatics': give(def, `${note}+1 to Morale tests`, (f) => (f.morale += 1)); say('the defenders get +1 to Morale tests.'); break;
        case 'regrowth': {
          const fs = best(def.filter((f) => !f.hero && f.ignore < 1 / 3), (f) => f.tough * 100 + f.maxHp, 1);
          give(fs, `${note}Regeneration`, (f) => (f.ignore = 1 / 3));
          if (fs.length) say(`${names(fs)} gains Regeneration.`);
          break;
        }
        case 'veterans': {
          const fs = best(def, (f) => f.melee, 2);
          give(fs, `${note}+1 to hit in melee`, (f) => (f.hitMelee += 1));
          if (fs.length) say(`${names(fs)} get +1 to hit in melee.`);
          break;
        }
        case 'gunline': {
          const fs = best(def.filter((f) => f.shoot > 0), (f) => f.shoot, 1);
          give(fs, `${note}+1 to hit shooting in rounds 1 and 2`, (f) => (f.earlyShoot += 1));
          if (fs.length) say(`${names(fs)} gets +1 to hit shooting in rounds 1 and 2.`);
          break;
        }
        case 'fog': give(att, `${note}often -1 to hit shooting in rounds 1 and 2 (long range)`, (f) => (f.earlyShoot -= 0.5)); say('the attackers often get -1 to hit shooting in rounds 1 and 2, while the armies are far apart.'); break;
        case 'minefield': give(att, `${note}charging in rounds 1 and 2 crosses Dangerous terrain`, (f) => (f.mines = true)); say('attackers charging in rounds 1 and 2 lose a wound for each model that rolls a 1.'); break;
        case 'bastion': give(def, `${note}often +1 to Defense (on objectives)`, (f) => (f.defMod += 0.5)); say('the defenders often get +1 to Defense, holding the objectives.'); break;
        case 'initiative': setup.first = defender; say('the defender activates first in round 1.'); break;
        case 'tide': setup.tide = defender; say("the defender's first non-hero unit destroyed comes back once, at full strength, the next round."); break;
        default: say('no effect in an auto-battle.');
      }
    }
  }
  const event = c && activeEvent(c);
  if (event?.id === 'ionStorm') {
    give(fighters, `${event.name}: often -1 to hit shooting in rounds 1 and 2 (long range)`, (f) => (f.earlyShoot -= 0.5));
    setup.effects.push(`${event.name}: everyone often gets -1 to hit shooting in rounds 1 and 2, while the armies are far apart.`);
  } else if (event?.xp) setup.effects.push(`${event.name}: every unit that survives earns +${event.xp} XP (the battle report adds it).`);
  else if (event?.battle) setup.effects.push(`${event.name}: ${event.battle} Not part of the auto-battle: apply it yourself.`);
  // A Conqueror Warlord's Onslaught: it hits harder and its side holds firmer, while it's in the fight.
  if (c) for (const side of b.sides) {
    const force = forces.find((f) => f.id === side.forceId);
    const lord = force && c.factions.find((x) => x.id === force.nexus?.factionId)?.warlord;
    if (!force || !lord || !leadsWith(c, force, 'onslaught')) continue;
    const ours = fighters.filter((f) => f.sideId === side.id);
    const ids = new Set(side.units.filter((t) => t.unitId === lord.unitId).map((t) => t.id));
    const leader = ours.filter((f) => ids.has(f.unitId));
    if (!leader.length) continue;
    give(leader, 'Warlord (Onslaught): +1 to hit', (f) => { f.hitMelee += 1; f.hitShoot += 1; });
    give(ours, 'Warlord (Onslaught): +1 to Morale tests', (f) => (f.morale += 1));
    setup.effects.push(`${lord.name} (Warlord, Onslaught): +1 to hit, and ${force.name} gets +1 to Morale tests.`);
  }
  touched.forEach(rate);
  return setup;
}

/** Does an effect count for this attack: its `only`, and its weapon if it's a weapon's. */
function applies(f: Fighter, e: { only?: 'melee' | 'shoot'; gun?: string }, melee: boolean): boolean {
  if (e.only && (e.only === 'melee') !== melee) return false;
  const g = e.gun && f.guns.find((x) => x.name === e.gun);
  return !g || g.melee === melee;
}

/** Due this round: every N rounds, from round 1. */
const due = (every: number, round: number) => (round - 1) % Math.max(1, Math.round(every)) === 0;

/** How much harder `f` hits this time: 6s to hit, a frenzy, a last stand. Notes say why. */
function fury(f: Fighter, melee: boolean, round: number, notes: string[]): number {
  let mul = 1;
  for (const e of effects(f.abilities, 'sixes')) if (applies(f, e, melee)) mul += (e.again ? 1 / 6 : 0) + (e.dmg ?? 0) / 8 + (e.rend ? 0.1 : 0);
  for (const e of effects(f.abilities, 'frenzy')) {
    if (!due(e.every, round)) continue;
    mul *= 1 + (e.mul - 1) * Math.min(1, e.time);
    notes.push(`${e.source}: ${f.name} frenzies`);
  }
  if (f.hp <= f.maxHp / 2) for (const e of effects(f.abilities, 'lastStand')) {
    mul *= e.mul;
    notes.push(`${e.source}: ${f.name} makes a last stand`);
  }
  return mul;
}

/** Wounds onto a fighter: its shield soaks first. Returns wounds lost. */
function hurt(t: Fighter, n: number, notes: string[]): number {
  const soak = Math.min(t.shield, n);
  if (soak) { t.shield -= soak; notes.push(`${t.name}'s shield soaks ${soak}`); }
  const lost = Math.min(t.hp, n - soak);
  t.hp -= lost;
  return lost;
}

/** `t` has just fallen to `by`: it may get back up, blast as it goes, and feed the killer's leech. */
function falls(t: Fighter, by: Fighter, rng: () => number, notes: string[]) {
  if (t.hp > 0) return;
  const rev = effects(t.abilities, 'revive')[0];
  if (rev && !t.revived) {
    t.revived = true;
    t.hp = Math.max(1, Math.round(t.maxHp * rev.n));
    notes.push(`${rev.source}: ${t.name} gets back up`);
    return;
  }
  for (const e of effects(t.abilities, 'deathBlast')) {
    if (by.hp <= 0) break;
    const n = Math.min(by.hp, roll((e.dmg * failChance(by.defense, 1, by.defMod)) / by.defBonus, rng));
    if (n) { by.hp -= n; notes.push(`${e.source}: ${n} to ${by.name}`); }
  }
  for (const e of effects(by.abilities, 'leech')) {
    const n = Math.min(by.maxHp - by.hp, e.n);
    if (by.hp > 0 && n > 0) { by.hp += n; notes.push(`${e.source}: ${by.name} heals ${n}`); }
  }
}

const STATUS_TEXT: Record<Status, string> = { slow: 'slowed', stun: 'stunned', daze: 'dazed', mark: 'marked', bleed: 'bleeding', knock: 'knocked back', execute: 'finished off' };

/** Each wound dealt is a chance to leave a status on the target, until its next activation. */
function procs(f: Fighter, t: Fighter, melee: boolean, dmg: number, rng: () => number, notes: string[]) {
  if (dmg <= 0) return;
  for (const e of effects(f.abilities, 'onHit')) {
    if (t.hp <= 0 || !applies(f, e, melee) || (e.status !== 'execute' && t.status.includes(e.status))) continue;
    if (e.status === 'execute' && t.hp > t.maxHp / 4) continue;
    if (rng() >= 1 - Math.pow(1 - e.chance, dmg)) continue;
    if (e.status === 'execute') t.hp = 0;
    else t.status.push(e.status);
    notes.push(`${e.source}: ${t.name} ${STATUS_TEXT[e.status]}`);
  }
}

/** Auras at the start: each lifts its unit and up to 2 allies near it. */
function auras(fighters: Fighter[], rng: () => number) {
  for (const f of fighters) {
    const list = effects(f.abilities, 'aura');
    if (!list.length) continue;
    const near = fighters.filter((x) => x.team === f.team && x !== f).map((x) => ({ x, r: rng() })).sort((a, b) => a.r - b.r).slice(0, 2).map((a) => a.x);
    for (const e of list) for (const x of [f, ...near]) {
      if (e.stat === 'hit') { x.hitShoot += e.n; x.hitMelee += e.n; }
      if (e.stat === 'save') x.defMod += e.n;
      if (e.stat === 'rate') x.atkBonus *= 1 + e.n;
      if (e.stat === 'range') x.earlyShoot += 0.5;
      if (x !== f) x.notes.push(`${e.source} (${f.name}): ${describe(e)}`);
    }
  }
}

/** Each hero joins one of its side's multi-model units, the biggest first, one hero to a unit. */
function joinHeroes(fighters: Fighter[]) {
  const taken = new Set<string>();
  for (const h of fighters.filter((f) => f.hero && f.hp > 0 && !f.host)) {
    const host = fighters
      .filter((f) => f.team === h.team && !f.hero && f.size > 1 && f.hp > 0 && !taken.has(f.key))
      .sort((a, b) => b.hp - a.hp)[0];
    if (!host) continue;
    taken.add(host.key);
    h.host = host.key;
    h.notes.push(`Joins ${host.name}: can't be picked out while it stands`);
  }
}

/** Fight it out: units of each team take turns, each attacking once a round, for 4 rounds or until one team is left. */
export function autoBattle(start: Fighter[], rng: () => number = Math.random, rounds = AUTO_BATTLE.rounds, opts: AutoOptions = {}): AutoResult {
  const fighters = start.map((f) => ({ ...f, notes: [...f.notes], status: [...f.status] }));
  const teams = [...new Set(fighters.map((f) => f.team))];
  const moves: Move[] = [];
  const standing = () => teams.filter((t) => fighters.some((f) => f.team === t && f.hp > 0 && !f.withdrawn));
  let first = Math.floor(rng() * teams.length);
  if (opts.first && teams.includes(opts.first)) first = teams.indexOf(opts.first);
  joinHeroes(fighters);
  auras(fighters, rng);
  const stance = (f: Fighter) => AUTO_BATTLE.stances[opts.stances?.[f.team] ?? 'committed'];
  // Wounds from `a` onto `t`, as hard as their stances push.
  const push = (a: Fighter, t: Fighter) => stance(a).attack * stance(t).taken;
  const up = (f: Fighter) => f.hp > 0 && !f.withdrawn;
  // Endless Tide: the unit waiting to come back, then '' once it has.
  let tide: Fighter | '' | undefined;
  const fallen = (t: Fighter) => {
    if (t.hp <= 0 && tide === undefined && t.team === opts.tide && !t.hero) tide = t;
  };
  // A team wiped out with its Endless Tide unit still to come back fights on.
  const fighting = () => standing().length + (tide && !standing().includes(tide.team) ? 1 : 0) > 1;
  for (let round = 1; round <= rounds && fighting(); round++) {
    if (tide) {
      Object.assign(tide, { hp: tide.maxHp, shaken: false, tested: false, status: [] });
      moves.push({ round, attacker: tide.key, kind: 'return', dmg: 0, back: 0, targetHp: tide.hp, attackerHp: tide.hp });
      tide = '';
    }
    // Shuffle each team's activation order, then take turns.
    const queues = teams.map((t) => fighters.filter((f) => f.team === t && up(f)).map((f) => ({ f, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.f));
    for (let turn = 0; queues.some((q) => q.length); turn++) {
      const q = queues[(first + turn) % teams.length];
      const f = q.shift();
      if (!f || !up(f)) continue;
      // What enemy hits left on it lasts until now.
      const st = f.status;
      f.status = [];
      const notes: string[] = [];
      const say = () => (notes.length ? { notes } : {});
      if (st.includes('bleed') && f.hp > 1) { f.hp -= 1; notes.push(`${f.name} bleeds 1`); }
      if (st.includes('stun')) {
        moves.push({ round, attacker: f.key, kind: 'stunned', dmg: 0, back: 0, targetHp: f.hp, attackerHp: f.hp, ...say() });
        continue;
      }
      if (f.shaken) {
        f.shaken = false;
        moves.push({ round, attacker: f.key, kind: 'rally', dmg: 0, back: 0, targetHp: f.hp, attackerHp: f.hp, ...say() });
        continue;
      }
      const enemies = fighters.filter((x) => x.team !== f.team && up(x));
      if (!enemies.length) break;
      // Heals and shields come before it acts.
      for (const e of effects(f.abilities, 'heal')) {
        if (!due(e.every, round)) continue;
        const pool: Fighter[] = e.ally ? fighters.filter((x) => x.team === f.team && up(x)) : [f];
        const who: Fighter = [...pool].sort((a, b) => b.maxHp - b.hp - (a.maxHp - a.hp))[0];
        const n = Math.min(e.n, who.maxHp - who.hp);
        if (n <= 0) continue;
        who.hp += n;
        if (who === f) notes.push(`${e.source}: heals ${n}`);
        else moves.push({ round, attacker: f.key, target: who.key, kind: 'heal', dmg: n, back: 0, targetHp: who.hp, attackerHp: f.hp, notes: [e.source] });
      }
      for (const e of effects(f.abilities, 'shield')) {
        if (!due(e.every, round) || f.shield >= e.n) continue;
        f.shield = e.n;
        notes.push(`${e.source}: shield of ${e.n}`);
      }
      // A hero is only picked out once the unit it joined is gone.
      const open = enemies.filter((x) => !x.host || !fighters.some((y) => y.key === x.host && up(y)));
      const t = pickTarget(f, open.length ? open : enemies, round, rng);
      let kind = moveKind(f, round, t);
      // Slowed or knocked back: no charging this turn.
      if (kind === 'charge' && (st.includes('slow') || st.includes('knock'))) {
        kind = expected(f, t, 'shoot', round) > 0 ? 'shoot' : 'advance';
        notes.push(`${f.name} can't charge (${st.includes('slow') ? 'slowed' : 'knocked back'})`);
      }
      const before = t.hp;
      // Barrages land whatever else it does.
      for (const e of effects(f.abilities, 'barrage')) {
        if (!due(e.every, round) || t.hp <= 0) continue;
        const ap = Math.max(0, e.ap - (t.fortified ? 1 : 0));
        const lost = hurt(t, roll((e.hits * failChance(t.defense, ap, t.defMod) * (1 - t.ignore)) / t.defBonus, rng), notes);
        notes.push(`${e.source}: ${lost} to ${t.name}`);
        falls(t, f, rng, notes);
      }
      if (kind === 'advance') {
        f.xp += killXp(t, before, Math.min(before, t.hp));
        fallen(t);
        fallen(f);
        moves.push({ round, attacker: f.key, ...(t.hp < before ? { target: t.key } : {}), kind, dmg: Math.max(0, before - t.hp), back: 0, targetHp: t.hp, attackerHp: f.hp, ...say() });
        continue;
      }
      const melee = kind === 'charge';
      // Minefields: charging across them early costs a wound for each model that rolls a 1 (never the last one).
      const hazard = melee && f.mines && round <= 2 ? Math.min(f.hp - 1, roll(alive(f) / 6, rng)) : 0;
      f.hp -= hazard;
      // Dazed, or charging into a field of fear: -1 to hit. Into a slowing field: a softer charge. Marked: it takes more.
      const fields = effects(t.abilities, 'field');
      const dazed = st.includes('daze') || (melee && fields.some((e) => e.status === 'daze'));
      const soft = melee && fields.some((e) => e.status === 'slow') ? 0.75 : 1;
      const marked = t.status.includes('mark') ? 1.25 : 1;
      if (t.hp > 0) {
        const n = hurt(t, roll(expected(f, t, kind, round, dazed ? -1 : 0) * fury(f, melee, round, notes) * soft * marked * push(f, t), rng), notes);
        procs(f, t, melee, n, rng, notes);
        falls(t, f, rng, notes);
      }
      const dmg = Math.max(0, before - t.hp);
      f.xp += killXp(t, before, Math.min(before, t.hp));
      fallen(t);
      fallen(f);
      let back = 0;
      const cowed = melee && t.hp > 0 && t.shaken;
      // A Shaken unit can't strike back.
      if (melee && t.hp > 0 && !t.shaken && f.hp > 0) {
        const was = f.hp;
        let n = roll(expected(t, f, 'charge', round, t.status.includes('daze') ? -1 : 0) * AUTO_BATTLE.strikeBack * fury(t, true, round, notes) * push(t, f), rng);
        for (const e of effects(t.abilities, 'thorns')) if (rng() < e.chance) { n += e.n; notes.push(`${e.source}: ${e.n} back`); }
        hurt(f, n, notes);
        procs(t, f, true, was - f.hp, rng, notes);
        falls(f, t, rng, notes);
        back = Math.max(0, was - f.hp);
        t.xp += killXp(f, was, Math.min(was, f.hp));
        fallen(f);
      }
      const shaken: string[] = [];
      for (const x of [t, f]) if (!stance(x).fearless && halfStrength(x, rng)) shaken.push(x.key);
      // The loser of a melee tests too.
      if (melee && dmg !== back) {
        const loser = dmg < back ? f : t;
        if (!stance(loser).fearless && moraleTest(loser, rng)) shaken.push(loser.key);
      }
      // Cautious: a unit at half strength pulls out, and takes any hero that joined it along.
      const withdrew: string[] = [];
      for (const x of [t, f]) {
        if (!stance(x).withdraw || !up(x) || x.hp > x.maxHp / 2) continue;
        for (const y of [x, ...fighters.filter((h) => h.host === x.key && up(h))]) { y.withdrawn = true; withdrew.push(y.key); }
      }
      moves.push({ round, attacker: f.key, target: t.key, kind, dmg, back, targetHp: t.hp, attackerHp: f.hp, ...(hazard ? { hazard } : {}), ...(cowed ? { cowed } : {}), ...(shaken.length ? { shaken } : {}), ...(withdrew.length ? { withdrew } : {}), ...say() });
    }
    first = (first + 1) % teams.length;
  }
  const dealtTo = (xs: Fighter[]) => xs.reduce((n, f) => n + (f.points * (start.find((s) => s.key === f.key)!.hp - f.hp)) / f.maxHp, 0);
  const dealt: Partial<Record<TeamKey, number>> = {};
  for (const t of teams) dealt[t] = Math.round(dealtTo(fighters.filter((f) => f.team !== t)));
  // Judged by the share of its own army each team lost, not points destroyed: a bigger army offers more to kill,
  // and would otherwise lose fights it plainly won.
  const lost: Partial<Record<TeamKey, number>> = {};
  for (const t of teams) {
    const mine = fighters.filter((f) => f.team === t);
    const total = mine.reduce((n, f) => n + f.points, 0);
    const yielded = mine.filter((f) => f.withdrawn).reduce((n, f) => n + (f.points * f.hp * AUTO_BATTLE.withdrawCost) / f.maxHp, 0);
    lost[t] = total ? ((dealtTo(mine) + yielded) / total) : 1;
  }
  const order = [...teams].sort((a, b) => lost[a]! - lost[b]!);
  const draw = order.length > 1 && lost[order[1]]! - lost[order[0]]! <= AUTO_BATTLE.drawMargin;
  return { fighters, moves, dealt, lost, winner: draw ? 'draw' : order[0] };
}

/** How many war stories a fight tells. */
const STORIES = 3;

/**
 * The fight's most notable moments, told in a line each, for the log and the turn report: a small unit bringing down a
 * big one, a unit that destroyed several, a comeback, a last stand, a unit hanging on by a single wound. Best first.
 */
export function warStories(start: Fighter[], r: AutoResult, team: (t: TeamKey) => string = (t) => `Team ${t}`, max = STORIES): string[] {
  const out: { score: number; text: string }[] = [];
  const byKey = new Map(r.fighters.map((f) => [f.key, f]));
  // A name both sides use gets its team, so the line says whose it was.
  const name = (f: Fighter) => (r.fighters.some((x) => x.team !== f.team && x.name === f.name) ? `${f.name} (${team(f.team)})` : f.name);
  const kills = new Map<string, Fighter[]>();
  // Each unit's biggest kill against the odds: a small unit bringing down a much bigger one.
  const giants = new Map<string, { score: number; text: string }>();
  const killed = (by: Fighter, t: Fighter, round: number) => {
    kills.set(by.key, [...(kills.get(by.key) ?? []), t]);
    const score = 10 + (t.points / Math.max(1, by.points)) * 2;
    if (t.points >= 1.5 * by.points && t.points >= 150 && score > (giants.get(by.key)?.score ?? 0))
      giants.set(by.key, { score, text: `${name(by)} (${by.points} pts) brought down ${name(t)} (${t.points} pts) in round ${round}.` });
  };
  for (const m of r.moves) {
    const a = byKey.get(m.attacker)!;
    const t = m.target ? byKey.get(m.target) : undefined;
    if (t && m.kind !== 'heal' && m.targetHp <= 0 && (m.dmg > 0 || m.kind === 'advance')) killed(a, t, m.round);
    if (t && m.kind === 'charge' && m.back > 0 && m.attackerHp <= 0) killed(t, a, m.round);
    for (const n of m.notes ?? []) {
      if (n.endsWith(`${a.name} makes a last stand`) && a.hp > 0) out.push({ score: 9, text: `${name(a)} made a last stand in round ${m.round}, and lived to tell of it.` });
      const up = r.fighters.find((f) => n.endsWith(`${f.name} gets back up`));
      if (up) out.push({ score: 7, text: `${name(up)} was cut down in round ${m.round}, and got back up.` });
    }
  }
  out.push(...giants.values());
  for (const [key, ts] of kills) {
    if (ts.length < 2) continue;
    const f = byKey.get(key)!;
    const list = ts.map(name);
    out.push({ score: 6 * ts.length, text: `${name(f)} destroyed ${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}.` });
  }
  for (const f of r.fighters) {
    const was = start.find((x) => x.key === f.key);
    if (was && f.hp === 1 && was.hp >= 3 && !f.withdrawn) out.push({ score: 5, text: `${name(f)} held on to the end with a single wound left.` });
  }
  const pulled = r.fighters.filter((f) => f.withdrawn && !f.host);
  if (pulled.length) out.push({ score: 3, text: `${pulled.map(name).join(', ')} pulled back from the fight, battered but alive.` });
  // A comeback: the winner had lost the bigger share of its army after round 2.
  if (r.winner !== 'draw') {
    const hp = new Map(start.map((f) => [f.key, f.hp]));
    for (const m of r.moves.filter((x) => x.round <= 2)) {
      hp.set(m.attacker, m.attackerHp);
      if (m.target) hp.set(m.target, m.targetHp);
    }
    const share = (t: TeamKey) => {
      const mine = start.filter((f) => f.team === t);
      const total = mine.reduce((n, f) => n + f.points, 0);
      return total ? mine.reduce((n, f) => n + (f.points * (f.hp - Math.max(0, hp.get(f.key)!))) / f.maxHp, 0) / total : 0;
    };
    const w = r.winner;
    const behind = Object.keys(r.lost).some((t) => t !== w && share(w) > share(t as TeamKey) + AUTO_BATTLE.drawMargin);
    if (behind) out.push({ score: 15, text: `${team(w)} was losing after round 2, and turned it around.` });
    // Wiped out before the end.
    for (const t of Object.keys(r.lost) as TeamKey[]) {
      const last = Math.max(0, ...r.moves.filter((m) => m.targetHp <= 0 && byKey.get(m.target ?? '')?.team === t).map((m) => m.round));
      if (t !== w && r.fighters.filter((f) => f.team === t).every((f) => f.hp <= 0) && last < AUTO_BATTLE.rounds)
        out.push({ score: 8, text: `${team(t)} was wiped out by round ${last}.` });
    }
  } else if (Object.keys(r.lost).length === 2) out.push({ score: 4, text: 'Neither side could break the other.' });
  return out.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.text);
}

/** What a fight is likely to cost one team, from many simulated runs. */
export interface AutoOdds {
  /** Share of runs it won, and drew. */
  win: number;
  draw: number;
  /** Units it can expect to lose. */
  unitsLost: number;
  /** Chance at least one of its units (of the sides that make death rolls) picks up a scar, and that one goes Comatose. */
  scar: number;
  comatose: number;
}

/**
 * Fight the same set-up `runs` times and tally, per team, how often it wins and what it costs. Only units on sides in
 * `rolls` (the crusade forces) make death rolls: any 1 is a scar, and one scar in ten is Comatose.
 */
export function autoOdds(fighters: Fighter[], opts: AutoOptions, rolls: Set<string>, runs = AUTO_BATTLE.forecastRuns, rng: () => number = Math.random): Partial<Record<TeamKey, AutoOdds>> {
  const teams = [...new Set(fighters.map((f) => f.team))];
  const out: Partial<Record<TeamKey, AutoOdds>> = {};
  for (const t of teams) out[t] = { win: 0, draw: 0, unitsLost: 0, scar: 0, comatose: 0 };
  for (let i = 0; i < runs; i++) {
    const r = autoBattle(fighters, rng, AUTO_BATTLE.rounds, opts);
    for (const t of teams) {
      const o = out[t]!;
      if (r.winner === t) o.win++;
      if (r.winner === 'draw') o.draw++;
      let clean = 1;
      let awake = 1;
      for (const f of r.fighters) {
        const before = fighters.find((x) => x.key === f.key)!;
        if (f.team !== t || before.hp <= 0 || f.hp > 0) continue;
        o.unitsLost++;
        if (!rolls.has(f.sideId)) continue;
        const scar = 1 - (5 / 6) ** (f.deathDice ?? 1);
        clean *= 1 - scar;
        awake *= 1 - scar / 10;
      }
      o.scar += 1 - clean;
      o.comatose += 1 - awake;
    }
  }
  for (const o of Object.values(out)) for (const k of ['win', 'draw', 'unitsLost', 'scar', 'comatose'] as const) o![k] /= runs;
  return out;
}

/** Write the outcome onto the tracked battle: wounds, losses and kill XP, and who won. It's then recorded like any other battle. */
export function applyAutoBattle(b: TrackedBattle, r: AutoResult, stories: string[] = []) {
  // Already applied (a second click before the dialog closed): its kill XP would count twice.
  if (b.ended) return;
  for (const f of r.fighters) {
    const u = b.sides.find((s) => s.id === f.sideId)?.units.find((x) => x.id === f.unitId);
    if (!u) continue;
    u.wounds = f.hp;
    u.destroyed = f.hp <= 0;
    u.xp = (u.xp ?? 0) + f.xp;
  }
  b.auto = { winner: r.winner, dealt: r.dealt, ...(stories.length ? { stories } : {}) };
  b.round = Math.max(b.round, Math.min(b.mission.rounds, AUTO_BATTLE.rounds));
  b.ended = true;
}

/** Can the battle be auto-played: at least two teams with units in it. */
export function autoBattleBlock(b: TrackedBattle): string | undefined {
  const armed = teamsOf(b).filter((t) => b.sides.some((s) => s.team === t && s.units.some((u) => !u.destroyed)));
  if (b.ended) return 'The battle is already over';
  return armed.length < 2 ? 'Each side needs units first' : undefined;
}
