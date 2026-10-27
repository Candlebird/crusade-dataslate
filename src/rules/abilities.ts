import type { Unit } from '../model/types';
import { KNOWN_ALIASES } from './oprRules';

// Abilities: what a unit's special rules, traits, relics and scars do in the training sim and the auto-battle, beyond
// the plain numbers. Each source maps to one or more effects; both games read the same list and play it out their own
// way. Timings are in rounds (a round is a few seconds in training), reaches in tiles (training) and wounds per model.

/** What a hit can leave on an enemy. knock and execute act at once; the rest wear off. */
export type Status = 'slow' | 'stun' | 'daze' | 'mark' | 'bleed' | 'knock' | 'execute';
export type AuraStat = 'hit' | 'save' | 'rate' | 'range';
export type PenaltyStat = 'hit' | 'save' | 'rate' | 'hp';
type Only = 'melee' | 'shoot';

export type Effect =
  /** Every `every` rounds, heal `n` wounds on itself, or with `ally` on the most hurt unit within that many tiles. */
  | { kind: 'heal'; n: number; every: number; ally?: number }
  /** Every `every` rounds, a shield of `n` wounds that soaks damage first. It refreshes, it doesn't stack. */
  | { kind: 'shield'; n: number; every: number }
  /** Every `every` rounds, `hits` extra hits at AP `ap`, within `range` tiles (else its longest reach), spilling `radius`. */
  | { kind: 'barrage'; hits: number; ap: number; every: number; range?: number; radius?: number }
  /** Struck in melee: `chance` of dealing `n` back. */
  | { kind: 'thorns'; n: number; chance: number }
  /** A hit has `chance` of leaving `status`. */
  | { kind: 'onHit'; status: Status; chance: number; only?: Only }
  /** A 6 to hit: `dmg` more damage, another attack, or it ignores armour. */
  | { kind: 'sixes'; dmg?: number; again?: boolean; rend?: boolean; only?: Only }
  /** A kill heals `n` wounds. */
  | { kind: 'leech'; n: number }
  /** Once, on falling: back up with this share of its wounds. */
  | { kind: 'revive'; n: number }
  /** On falling: `dmg` to everything within `radius` tiles. */
  | { kind: 'deathBlast'; dmg: number; radius: number }
  /** Units within `radius` tiles (itself included) get +`n` to a stat: rate and range as shares or tiles. */
  | { kind: 'aura'; stat: AuraStat; n: number; radius: number }
  /** Every `every` rounds, attacks `mul` times as fast for `time` rounds. */
  | { kind: 'frenzy'; mul: number; every: number; time: number }
  /** At half strength or below, attacks `mul` times as hard. */
  | { kind: 'lastStand'; mul: number }
  /** Enemies within `radius` tiles are slowed or dazed. */
  | { kind: 'field'; status: 'slow' | 'daze'; radius: number }
  /** Can move mid-wave, `uses` times a wave (charges in round 1 in an auto-battle). */
  | { kind: 'redeploy'; uses: number }
  /** A scar: -n to hit or Defense, or a share off its rate or wounds. */
  | { kind: 'penalty'; stat: PenaltyStat; n: number };

export interface Ability {
  /** The rule, trait, relic or scar it comes from. */
  source: string;
  effects: Effect[];
  /** A weapon's rule or trait: only that weapon's hits carry it. */
  gun?: string;
}

const heal = (n: number, every: number, ally?: number): Effect => ({ kind: 'heal', n, every, ...(ally ? { ally } : {}) });
const shield = (n: number, every: number): Effect => ({ kind: 'shield', n, every });
const barrage = (hits: number, ap: number, every: number, o: { range?: number; radius?: number } = {}): Effect => ({ kind: 'barrage', hits, ap, every, ...o });
const thorns = (n: number, chance: number): Effect => ({ kind: 'thorns', n, chance });
const onHit = (status: Status, chance: number, only?: Only): Effect => ({ kind: 'onHit', status, chance, ...(only ? { only } : {}) });
const sixes = (o: { dmg?: number; again?: boolean; rend?: boolean }, only?: Only): Effect => ({ kind: 'sixes', ...o, ...(only ? { only } : {}) });
const leech = (n: number): Effect => ({ kind: 'leech', n });
const revive = (n: number): Effect => ({ kind: 'revive', n });
const aura = (stat: AuraStat, n: number, radius: number): Effect => ({ kind: 'aura', stat, n, radius });
const frenzy = (mul: number, every: number, time: number): Effect => ({ kind: 'frenzy', mul, every, time });
const lastStand = (mul: number): Effect => ({ kind: 'lastStand', mul });
const field = (status: 'slow' | 'daze', radius: number): Effect => ({ kind: 'field', status, radius });
const redeploy = (uses: number): Effect => ({ kind: 'redeploy', uses });
const penalty = (stat: PenaltyStat, n: number): Effect => ({ kind: 'penalty', stat, n });

/** By name, lower case, with any (X) rating taken off. */
const TABLE: Record<string, Effect[]> = {
  // Core rules.
  'caster +1': [barrage(1, 1, 1, { range: 4.5 })],
  bane: [onHit('bleed', 0.5)],
  poison: [onHit('bleed', 0.5)],
  bleed: [onHit('bleed', 0.5)],
  counter: [thorns(1, 0.5)],
  'counter/rending': [thorns(1, 0.5)],
  thrust: [onHit('knock', 0.25, 'melee')],
  lance: [onHit('knock', 0.25, 'melee')],
  sniper: [onHit('mark', 0.5)],
  indirect: [onHit('daze', 0.25, 'shoot')],
  furious: [sixes({ again: true }, 'melee')],
  relentless: [sixes({ again: true }, 'shoot')],
  fast: [redeploy(2)],
  scout: [redeploy(1)],
  ambush: [redeploy(1)],
  strider: [redeploy(1)],
  flying: [redeploy(2)],
  fearless: [lastStand(1.5)],
  // Army book rules (renamed ones, like Heal for Mend, are looked up by the rule they stand for).
  mend: [heal(2, 1, 1)],
  'regeneration aura': [heal(1, 1, 2)],
  resistance: [shield(1, 2)],
  'breath attack': [barrage(1, 1, 1, { range: 1.5, radius: 1 })],
  // Hero traits.
  'aura of blinding': [field('daze', 1.5)],
  'aura of swiftness': [aura('rate', 0.25, 2)],
  'quick shot': [frenzy(2, 2, 0.5)],
  'takedown strike': [onHit('execute', 0.5, 'melee')],
  'march order': [aura('rate', 0.15, 2)],
  'rallying cry': [heal(1, 2, 2)],
  'veteran instincts': [shield(1, 2)],
  'field medic': [heal(1, 1, 2)],
  // Infantry traits.
  skirmishers: [redeploy(2)],
  spotters: [onHit('mark', 0.5, 'shoot')],
  'brace for impact': [shield(1, 2)],
  'trench warfare': [thorns(1, 0.33)],
  devour: [leech(1)],
  bloodthirsty: [leech(1)],
  'hammer blow': [onHit('stun', 0.15, 'melee')],
  overrun: [onHit('knock', 0.25, 'melee')],
  // Elite traits.
  'no retreat': [lastStand(1.5)],
  'iron discipline': [aura('save', 1, 2)],
  'tank hunters': [sixes({ dmg: 2 })],
  'rapid redeploy': [redeploy(2)],
  // Vehicle/Monster traits.
  'ap +1 when holding': [sixes({ dmg: 1 }, 'shoot')],
  'precision shooting mark': [onHit('mark', 0.5, 'shoot')],
  'auto-repair': [heal(1, 1)],
  trample: [thorns(1, 0.5)],
  'smoke launchers': [shield(2, 2)],
  // Aircraft traits.
  'air break': [redeploy(2)],
  hover: [redeploy(2)],
  'strafing run': [barrage(3, 0, 2, { radius: 1 })],
  'covering fire': [onHit('daze', 0.3, 'shoot')],
  'assault bomb': [barrage(4, 1, 3, { radius: 1.5 })],
  'armoured cockpit': [shield(2, 3)],
  'flare countermeasures': [shield(1, 2)],
  'low pass': [onHit('knock', 0.2, 'shoot')],
  'escort wing': [aura('save', 1, 1.5)],
  // Fortification traits.
  'deploy cover': [aura('save', 1, 1.5)],
  overwatch: [frenzy(2, 2, 0.5)],
  battlements: [shield(2, 2)],
  'orbital drop': [redeploy(1)],
  'ablative plating': [shield(1, 1)],
  overlook: [aura('hit', 1, 2)],
  'ammo cache': [aura('rate', 0.25, 1.5)],
  'mined approaches': [field('slow', 1.5)],
  // Unique traits.
  'extreme motivation': [aura('rate', 0.2, 2)],
  crazed: [lastStand(2)],
  'bitter rivalry': [sixes({ dmg: 1 })],
  swift: [redeploy(2)],
  'heavy training': [sixes({ again: true })],
  lucky: [revive(0.34)],
  'fear +3': [field('daze', 1.5)],
  'inspiring aura': [aura('hit', 1, 2)],
  'transport +6': [heal(1, 2, 1.5)],
  'flying + fast': [redeploy(2)],
  bulldoze: [barrage(3, 1, 2, { range: 1.5 })],
  'explosive exit': [{ kind: 'deathBlast', dmg: 4, radius: 2 }],
  'sky suppression': [onHit('daze', 0.4, 'shoot')],
  'combat turn': [redeploy(3)],
  'supply drop': [heal(2, 2, 3)],
  'ignores cover': [sixes({ rend: true })],
  'aerial scan': [aura('hit', 1, 3)],
  'sensor array': [aura('range', 1, 2)],
  'command bastion': [aura('hit', 1, 2)],
  'enhanced orbital drop': [redeploy(2)],
  'shield generator': [aura('save', 1, 2)],
  'repair bay': [heal(3, 1, 2.25)],
  'psychic barrier': [shield(3, 2)],
  // Weapon traits.
  'first strike': [sixes({ again: true }, 'melee')],
  duelist: [sixes({ dmg: 1 }, 'melee')],
  reaping: [leech(1)],
  'guard stance': [shield(1, 2)],
  takedown: [onHit('execute', 0.5, 'shoot')],
  'rapid volley': [frenzy(2, 2, 0.5)],
  'hollow point': [sixes({ dmg: 1 }, 'shoot')],
  'suppressing fire': [onHit('daze', 0.4, 'shoot')],
  quake: [onHit('stun', 0.15)],
  'slowing strike': [onHit('slow', 0.5)],
  demolish: [sixes({ dmg: 2 })],
  // Relic weapons' rules.
  beam: [sixes({ again: true })],
  'temporal rift': [onHit('stun', 0.3)],
  'soul harvest': [leech(1)],
  'black hole': [onHit('execute', 0.3)],
  // Scars.
  'crippling injury': [penalty('rate', 0.15)],
  'weak spot': [penalty('save', 0.5)],
  'fear of death': [penalty('rate', 0.1)],
  dishonorable: [penalty('hit', 0.3)],
  'lowered constitution': [penalty('hp', 0.15)],
  comatose: [penalty('rate', 0.5)],
  // Relics.
  'conversion field': [shield(1, 1)],
  'disruption shielding': [shield(2, 2)],
  'dark age jump pack': [redeploy(2)],
  'temporal displacer gauntlet': [onHit('stun', 0.2, 'melee')],
  'nanite infusion injector': [heal(1, 1)],
  'dimensional anchor': [field('slow', 1.5)],
  'ethereal capacitor': [frenzy(2, 3, 1)],
  'archeotech nano-med': [heal(2, 2, 1.5)],
  'dark age displacer belt': [redeploy(3)],
  'enhanced eye': [sixes({ dmg: 1 }, 'shoot')],
  'unstable matter projector': [barrage(3, 2, 2, { radius: 1 })],
  'archeotech combat restoratives': [revive(0.5)],
  'mobius repeater': [sixes({ again: true })],
  'null-field disruptor': [field('daze', 2)],
  'nanite hive field': [heal(1, 1, 2)],
  'chrono-disruptor matrix': [field('slow', 2.5)],
  'celestial nullification matrix': [shield(4, 2), field('daze', 2)],
  // Training feat relics (the Splinter is a weapon).
  'crown of the last lord': [onHit('mark', 0.5)],
  // Nexus relics.
  'shadesplinter cloak': [shield(1, 1)],
  'umbra echo plating': [thorns(1, 0.5)],
  'warp-infusion': [frenzy(1.5, 2, 1)],
  'null zone projector': [field('daze', 2)],
  'shard-lens scope': [sixes({ rend: true })],
  'umbral standard': [aura('hit', 1, 2)],
  'phase-step harness': [redeploy(2)],
  'shadow veil emitter': [aura('save', 1, 1.5)],
  'whispering shard': [onHit('daze', 0.3)],
  'blackstone shard amulet': [shield(2, 2)],
  'ancient quantum shielding': [shield(3, 2)],
  'shard-crown of command': [aura('rate', 0.2, 2.5)],
  'echoing grimoire': [barrage(2, 1, 1)],
  'umbral tether': [onHit('slow', 0.4)],
  'oblivion orb': [barrage(5, 2, 4, { radius: 1.5 })],
  'nexus resonator': [aura('rate', 0.15, 2)],
  // Nexus traits.
  shadowmeld: [redeploy(2)],
  'chrono-distortion': [field('slow', 2)],
  voidwalk: [redeploy(3)],
  'umbral command': [aura('hit', 1, 2.5)],
  'soul siphon': [leech(2)],
  'dread presence': [field('daze', 2)],
  'umbral veil': [shield(1, 2)],
  'temporal surge': [frenzy(2, 3, 1)],
  'shard-laced armour': [thorns(1, 0.33)],
  'void resilience': [revive(0.34)],
  'phase assault': [redeploy(2)],
  'umbral rally': [heal(1, 2, 2)],
  'shard infusion': [sixes({ dmg: 1 })],
  'shroud of despair': [field('daze', 1.5)],
  wraithstep: [redeploy(3)],
  'null aura': [aura('save', 1, 1.5)],
  "hunter's mark": [onHit('mark', 0.5)],
  'shardborn fury': [lastStand(2)],
  shadowbound: [shield(2, 1)],
  'nexus amplification': [aura('rate', 0.2, 2)],
  'void-forged plating': [shield(2, 2)],
  'shard-spiked bulk': [thorns(2, 0.5)],
  'nexus engine': [redeploy(2)],
  'echo repair': [heal(2, 1)],
  'umbral bombardment': [barrage(4, 1, 2, { radius: 1.5 })],
  'warp-engine': [redeploy(3)],
  'shadow wake': [field('slow', 1.5)],
  'phase hull': [shield(2, 2)],
  'shadow strafe': [barrage(3, 1, 1, { radius: 1 })],
  'interceptor protocols': [onHit('stun', 0.2, 'shoot')],
  'warp-anchor': [field('slow', 2)],
  'nexus resonance': [aura('rate', 0.2, 2)],
  'umbral battery': [barrage(2, 2, 1, { range: 6 })],
  'shard bulwark': [shield(3, 2)],
  'void lattice': [aura('save', 1, 2)],
  'recall beacon': [heal(2, 2, 3)],
};

/** Rules the games already count in a unit's numbers (to hit, saves, wounds, AP…): no ability of their own. */
export const STAT_RULES = [
  'Tough', 'Hero', 'Impact', 'AP', 'Blast', 'Deadly', 'Rending', 'Reliable', 'Stealth', 'Fortified', 'Regeneration',
  'Dug In', 'Protected', 'Evasive', 'Resilient', 'Blade Master', 'Mutations', 'Precise Strikes', 'Specialists', 'Elite',
  'Berserkers', 'Point Blank', 'Targeting Array', 'Armoured Prow', 'Tough +3', 'Toughened Scars', 'Enhanced', 'Impact +3',
  'Impact +6', 'Momentum', '+1 A', '+1 AP', '+6" range', 'Surge', 'Brutal', 'Well Balanced', 'Duplicate', 'Spread Shot',
  'Unstoppable', 'Ghostly', 'Heroic Presence', 'Artisan Bionics', 'Damaged Equipment', 'Weakened Armor', 'Weakened Muscles',
  'Faulty Aim',
].map((s) => s.toLowerCase());

/** Unknown rules, traits and relics still do something when their name says what. */
const KEYWORDS: [RegExp, Effect[]][] = [
  [/medic|repair|heal/, [heal(1, 2)]],
  [/shield|barrier|ward/, [shield(1, 2)]],
  [/fear|terror/, [field('daze', 1.5)]],
  [/rage|fury|berserk/, [lastStand(1.5)]],
  [/teleport|deep strike|jump|warp/, [redeploy(1)]],
  [/poison|toxic/, [onHit('bleed', 0.3)]],
  [/stun|shock/, [onHit('stun', 0.15)]],
  [/sniper|spotter|marked/, [onHit('mark', 0.3)]],
  [/banner|inspir|command|orders/, [aura('hit', 1, 2)]],
];

const bare = (name: string) => name.replace(/\s*\(.*\)\s*$/, '').trim().toLowerCase();
const rating = (name: string) => Number(name.match(/\((\d+)\)/)?.[1] ?? 0);

/** What one name does: from the table, Caster(X), or (when `guess`) a keyword in it. */
export function effectsOf(name: string, guess = true): Effect[] | undefined {
  const b = bare(name);
  if (b === 'caster') return [barrage(Math.max(1, rating(name)), 1, 1, { range: 4.5 })];
  if (TABLE[b]) return TABLE[b];
  const original = KNOWN_ALIASES[b];
  if (original) return effectsOf(original, guess);
  const inner = b.match(/^(.+) aura$/)?.[1];
  if (inner && TABLE[inner]) return TABLE[inner];
  if (!guess || STAT_RULES.includes(b)) return undefined;
  return KEYWORDS.find(([re]) => re.test(b))?.[1];
}

/** Everything a unit can do beyond its numbers. */
export function abilitiesOf(u: Unit | undefined): Ability[] {
  if (!u) return [];
  const out: Ability[] = [];
  const add = (source: string, guess: boolean, gun?: string) => {
    const effects = effectsOf(source, guess);
    const name = source.replace(/\s*\(\d+\)$/, '');
    if (effects && !out.some((a) => a.source === name && a.gun === gun)) out.push({ source: name, effects, ...(gun ? { gun } : {}) });
  };
  u.rules.forEach((r) => add(r, true));
  u.upgrades.forEach((x) => add(x.name, true));
  u.scars.forEach((x) => add(x.name, false));
  u.relics.filter((r) => !r.profile).forEach((r) => add(r.name, true));
  for (const w of u.weapons) [...w.rules, ...w.traits.map((t) => t.name)].forEach((r) => add(r, false, w.name));
  for (const r of u.relics.filter((x) => x.profile)) r.profile!.split(',').slice(1).forEach((p) => add(p.trim(), false, r.name));
  return out;
}

/** Does a list of abilities say anything about this name? (So the flat bonus for unknown traits skips it.) */
export const modelled = (abilities: Ability[], name: string) => abilities.some((a) => !a.gun && a.source.toLowerCase() === bare(name));

const pct = (n: number) => `${Math.round(n * 100)}%`;
const rounds = (n: number) => (n === 1 ? 'every round' : `every ${n} rounds`);
const wounds = (n: number) => `${n} wound${n === 1 ? '' : 's'}`;
const STATUS: Record<Status, string> = {
  slow: 'slows it', stun: 'stuns it', daze: 'dazes it (-1 to hit)', mark: 'marks it (takes more damage)',
  bleed: 'makes it bleed', knock: 'knocks it back', execute: 'finishes it off if badly hurt',
};

/** One effect in a few words. */
export function describe(e: Effect): string {
  switch (e.kind) {
    case 'heal': return `Heals ${wounds(e.n)} ${rounds(e.every)}${e.ally ? `, on itself or the most hurt unit within ${e.ally} tiles` : ''}`;
    case 'shield': return `A ${wounds(e.n)} shield ${rounds(e.every)}`;
    case 'barrage': return `${e.hits} extra hit${e.hits === 1 ? '' : 's'} at AP(${e.ap}) ${rounds(e.every)}${e.radius ? `, blasting ${e.radius} tiles round` : ''}`;
    case 'thorns': return `Struck in melee: ${pct(e.chance)} to deal ${e.n} back`;
    case 'onHit': return `${e.only === 'melee' ? 'Melee hits' : e.only === 'shoot' ? 'Shots that hit' : 'Hits'}: ${pct(e.chance)} ${STATUS[e.status]}`;
    case 'sixes': return `${e.only === 'melee' ? 'In melee, a' : e.only === 'shoot' ? 'Shooting, a' : 'A'} 6 to hit ${[e.dmg && `deals +${e.dmg}`, e.again && 'attacks again', e.rend && 'ignores armour'].filter(Boolean).join(' and ')}`;
    case 'leech': return `A kill heals ${wounds(e.n)}`;
    case 'revive': return `Once, on falling, gets back up with ${pct(e.n)} of its wounds`;
    case 'deathBlast': return `On falling, deals ${e.dmg} to everything within ${e.radius} tiles`;
    case 'aura': return `Aura (${e.radius} tiles): ${e.stat === 'hit' ? '+1 to hit' : e.stat === 'save' ? '+1 to Defense' : e.stat === 'rate' ? `attacks ${pct(e.n)} faster` : `+${e.n} tile of reach`}`;
    case 'frenzy': return `Attacks ${e.mul}× as fast for ${e.time === 1 ? 'a round' : `${e.time} round`} ${rounds(e.every)}`;
    case 'lastStand': return `At half strength or below, hits ${e.mul}× as hard`;
    case 'field': return `Enemies within ${e.radius} tiles are ${e.status === 'slow' ? 'slowed' : 'dazed (-1 to hit)'}`;
    case 'redeploy': return `Can move mid-wave ${e.uses === 1 ? 'once' : `${e.uses} times`} a wave; charges in round 1 of an auto-battle`;
    case 'penalty': return e.stat === 'hit' ? `-${e.n} to hit` : e.stat === 'save' ? `-${e.n} to Defense` : e.stat === 'rate' ? `Attacks ${pct(e.n)} less` : `${pct(e.n)} fewer wounds`;
  }
}

/** All the effects of one kind across a unit's abilities, with where each came from. */
export function effects<K extends Effect['kind']>(abilities: Ability[], kind: K): (Extract<Effect, { kind: K }> & { source: string; gun?: string })[] {
  return abilities.flatMap((a) => a.effects.filter((e): e is Extract<Effect, { kind: K }> => e.kind === kind).map((e) => ({ ...e, source: a.source, ...(a.gun ? { gun: a.gun } : {}) })));
}
