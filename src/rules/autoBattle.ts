import type { Campaign, Force, Unit, Weapon } from '../model/types';
import { modifierOf } from './difficulty';
import { hasRule, levelForXp, ruleRating } from './engine';
import { activeEvent } from './nexus';
import { teamsOf, type TeamKey, type TrackedBattle } from './tracker';

// Auto-battle: when there's no time to play a battle out, each unit gets an overall Attack and Defense from its
// profile (quality, defense, weapons, traits, relics, level), and the units trade blows for 4 rounds. A unit brought
// to half strength, or beaten in melee, tests its morale: failing leaves it Shaken, and it spends its next turn rallying.
// The sector's modifiers and the round's Galactic Event play their part too.

export const AUTO_BATTLE = {
  rounds: 4,
  /** Each attack deals its expected wounds times a random factor from `luck` to `luck + 1`. */
  luck: 0.5,
  /** A melee target that survives strikes back with this share of its own melee. */
  strikeBack: 0.5,
  /** Within this share of the larger side's points destroyed, it's a draw. */
  drawMargin: 0.1,
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
};

/** A weapon reduced to what the auto-battle needs. */
interface Gun {
  name: string;
  melee: boolean;
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
}

export type MoveKind = 'shoot' | 'charge' | 'advance' | 'rally' | 'return';

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
  targetHp: number;
  attackerHp: number;
}

export interface AutoResult {
  fighters: Fighter[];
  moves: Move[];
  /** Points of enemy destroyed per team, counting partly-killed units by the wounds they lost. */
  dealt: Partial<Record<TeamKey, number>>;
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
  if (has('Berserkers') || has('Furious') || has('Bloodthirsty')) { hitMelee += 0.5; note(['Berserkers', 'Furious', 'Bloodthirsty'].find(has)!, 'more hits in melee'); }
  if (has('Point Blank') || has('Targeting Array')) { hitShoot += 0.3; note(['Point Blank', 'Targeting Array'].find(has)!, 'more hits when shooting'); }
  if (has('Damaged Equipment')) { hitShoot -= 1; note('Damaged Equipment', '-1 to hit when shooting'); }
  if (has('Weakened Muscles')) { hitMelee -= 1; note('Weakened Muscles', '-1 to hit in melee'); }
  if (has('Faulty Aim')) { hitShoot -= 0.17; hitMelee -= 0.17; note('Faulty Aim', 'fewer 6s'); }
  known.push('Blade Master', 'Mutations', 'Precise Strikes', 'Regeneration', 'Protected', 'Ghostly', 'Heroic Presence', 'Artisan Bionics', 'Evasive', 'Stealth', 'Tough +3', 'Toughened Scars');

  const impact = (ruleRating(names, 'Impact') ?? 0) + 3 * count(upgrades, 'Impact +3') + 6 * count(upgrades, 'Impact +6') + (has('Momentum') ? size : 0);
  const fast = ['Fast', 'Flying', 'Scout', 'Ambush', 'Swift', 'Aura of Swiftness', 'Flying + Fast', 'Orbital Drop'].some(has);
  const morale = has('Fearless') ? 1 : 0;
  if (morale) notes.push('Fearless: +1 to Morale tests');

  // Everything else it has earned still counts, a little each.
  let atkBonus = 1;
  let defBonus = 1;
  const level = u ? levelForXp(u.xp) : 0;
  if (level) { atkBonus += level * AUTO_BATTLE.perLevel; defBonus += level * AUTO_BATTLE.perLevel; notes.push(`Level ${level}: +${Math.round(level * AUTO_BATTLE.perLevel * 100)}%`); }
  if (u && hasRule(u.rules, 'Hero')) { atkBonus += AUTO_BATTLE.hero; defBonus += AUTO_BATTLE.hero; notes.push(`Hero: +${AUTO_BATTLE.hero * 100}%`); }
  const other = (u?.upgrades ?? []).filter((x) => !known.includes(x.name) && !hasRule(['Fast', 'Swift', 'Impact +3', 'Impact +6', 'Momentum'], x.name));
  if (other.length) {
    const add = other.reduce((n, x) => n + (x.unique ? AUTO_BATTLE.uniqueTrait : AUTO_BATTLE.trait), 0);
    atkBonus += add / 2; defBonus += add / 2;
    notes.push(`${other.map((x) => x.name).join(', ')}: +${Math.round(add * 100)}%`);
  }
  const relics = (u?.relics ?? []).filter((r) => !r.profile);
  if (relics.length) {
    const add = relics.reduce((n, r) => n + AUTO_BATTLE.relic[r.tier], 0);
    atkBonus += add / 2; defBonus += add / 2;
    notes.push(`${relics.map((r) => r.name).join(', ')}: +${Math.round(add * 100)}%`);
  }
  const otherScars = scars.filter((s) => !['Weakened Armor', 'Damaged Equipment', 'Weakened Muscles', 'Faulty Aim'].includes(s));
  if (otherScars.length) {
    atkBonus += (otherScars.length * AUTO_BATTLE.scar) / 2; defBonus += (otherScars.length * AUTO_BATTLE.scar) / 2;
    notes.push(`${otherScars.join(', ')}: ${Math.round(otherScars.length * AUTO_BATTLE.scar * 100)}%`);
  }
  if (extraTough) defBonus *= (size * tough + extraTough) / (size * tough);

  const f: Fighter = {
    key: `${sideId}:${t.id}`, sideId, team, unitId: t.id, name: t.name, points: t.points ?? u?.points ?? 0,
    quality, defense, size, tough, hp: t.wounds, maxHp: t.maxWounds, guns, defMod, fortified, ignore, evasive, impact, hitShoot, hitMelee, fast,
    hero: !!u && hasRule(u.rules, 'Hero'), morale, r1Def: 0, earlyShoot: 0, mines: false, shaken: false, tested: false,
    atkBonus: Math.max(0.5, atkBonus), defBonus: Math.max(0.5, defBonus), shoot: 0, melee: 0, attack: 0, def: 0, notes, xp: 0,
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
function expected(f: Fighter, t: Fighter, kind: MoveKind, round: number) {
  const target = round === 1 && t.r1Def ? { ...t, defMod: t.defMod + t.r1Def } : t;
  const hit = hitBonus(f, kind) + (kind === 'shoot' && round <= 2 ? f.earlyShoot : 0);
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
  } else if (event?.battle) setup.effects.push(`${event.name}: ${event.battle} Not part of the auto-battle: apply it yourself.`);
  touched.forEach(rate);
  return setup;
}

/** Fight it out: units of each team take turns, each attacking once a round, for 4 rounds or until one team is left. */
export function autoBattle(start: Fighter[], rng: () => number = Math.random, rounds = AUTO_BATTLE.rounds, opts: AutoOptions = {}): AutoResult {
  const fighters = start.map((f) => ({ ...f, notes: [...f.notes] }));
  const teams = [...new Set(fighters.map((f) => f.team))];
  const moves: Move[] = [];
  const standing = () => teams.filter((t) => fighters.some((f) => f.team === t && f.hp > 0));
  let first = Math.floor(rng() * teams.length);
  if (opts.first && teams.includes(opts.first)) first = teams.indexOf(opts.first);
  // Endless Tide: the unit waiting to come back, then '' once it has.
  let tide: Fighter | '' | undefined;
  const fallen = (t: Fighter) => {
    if (t.hp <= 0 && tide === undefined && t.team === opts.tide && !t.hero) tide = t;
  };
  // A team wiped out with its Endless Tide unit still to come back fights on.
  const fighting = () => standing().length + (tide && !standing().includes(tide.team) ? 1 : 0) > 1;
  for (let round = 1; round <= rounds && fighting(); round++) {
    if (tide) {
      Object.assign(tide, { hp: tide.maxHp, shaken: false, tested: false });
      moves.push({ round, attacker: tide.key, kind: 'return', dmg: 0, back: 0, targetHp: tide.hp, attackerHp: tide.hp });
      tide = '';
    }
    // Shuffle each team's activation order, then take turns.
    const queues = teams.map((t) => fighters.filter((f) => f.team === t && f.hp > 0).map((f) => ({ f, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.f));
    for (let turn = 0; queues.some((q) => q.length); turn++) {
      const q = queues[(first + turn) % teams.length];
      const f = q.shift();
      if (!f || f.hp <= 0) continue;
      if (f.shaken) {
        f.shaken = false;
        moves.push({ round, attacker: f.key, kind: 'rally', dmg: 0, back: 0, targetHp: f.hp, attackerHp: f.hp });
        continue;
      }
      const enemies = fighters.filter((x) => x.team !== f.team && x.hp > 0);
      if (!enemies.length) break;
      const t = pickTarget(f, enemies, round, rng);
      const kind = moveKind(f, round, t);
      if (kind === 'advance') {
        moves.push({ round, attacker: f.key, kind, dmg: 0, back: 0, targetHp: t.hp, attackerHp: f.hp });
        continue;
      }
      // Minefields: charging across them early costs a wound for each model that rolls a 1 (never the last one).
      const hazard = kind === 'charge' && f.mines && round <= 2 ? Math.min(f.hp - 1, roll(alive(f) / 6, rng)) : 0;
      f.hp -= hazard;
      const before = t.hp;
      const dmg = Math.min(t.hp, roll(expected(f, t, kind, round), rng));
      t.hp -= dmg;
      f.xp += killXp(t, before, t.hp);
      fallen(t);
      let back = 0;
      const cowed = kind === 'charge' && t.hp > 0 && t.shaken;
      // A Shaken unit can't strike back.
      if (kind === 'charge' && t.hp > 0 && !t.shaken) {
        const was = f.hp;
        back = Math.min(f.hp, roll(expected(t, f, 'charge', round) * AUTO_BATTLE.strikeBack, rng));
        f.hp -= back;
        t.xp += killXp(f, was, f.hp);
        fallen(f);
      }
      const shaken: string[] = [];
      for (const x of [t, f]) if (halfStrength(x, rng)) shaken.push(x.key);
      // The loser of a melee tests too.
      if (kind === 'charge' && dmg !== back) {
        const loser = dmg < back ? f : t;
        if (moraleTest(loser, rng)) shaken.push(loser.key);
      }
      moves.push({ round, attacker: f.key, target: t.key, kind, dmg, back, targetHp: t.hp, attackerHp: f.hp, ...(hazard ? { hazard } : {}), ...(cowed ? { cowed } : {}), ...(shaken.length ? { shaken } : {}) });
    }
    first = (first + 1) % teams.length;
  }
  const dealt: Partial<Record<TeamKey, number>> = {};
  for (const t of teams) {
    dealt[t] = Math.round(fighters.filter((f) => f.team !== t).reduce((n, f) => n + (f.points * (start.find((s) => s.key === f.key)!.hp - f.hp)) / f.maxHp, 0));
  }
  // In a free-for-all, every team's losses are shared among its enemies; the most points destroyed wins.
  const order = [...teams].sort((a, b) => dealt[b]! - dealt[a]!);
  const top = dealt[order[0]]!;
  const draw = order.length > 1 && top - dealt[order[1]]! <= Math.max(1, top * AUTO_BATTLE.drawMargin);
  return { fighters, moves, dealt, winner: draw ? 'draw' : order[0] };
}

/** Write the outcome onto the tracked battle: wounds, losses and kill XP, and who won. It's then recorded like any other battle. */
export function applyAutoBattle(b: TrackedBattle, r: AutoResult) {
  for (const f of r.fighters) {
    const u = b.sides.find((s) => s.id === f.sideId)?.units.find((x) => x.id === f.unitId);
    if (!u) continue;
    u.wounds = f.hp;
    u.destroyed = f.hp <= 0;
    u.xp = (u.xp ?? 0) + f.xp;
  }
  b.auto = { winner: r.winner, dealt: r.dealt };
  b.round = Math.max(b.round, Math.min(b.mission.rounds, AUTO_BATTLE.rounds));
  b.ended = true;
}

/** Can the battle be auto-played: at least two teams with units in it. */
export function autoBattleBlock(b: TrackedBattle): string | undefined {
  const armed = teamsOf(b).filter((t) => b.sides.some((s) => s.team === t && s.units.some((u) => !u.destroyed)));
  if (b.ended) return 'The battle is already over';
  return armed.length < 2 ? 'Each side needs units first' : undefined;
}
