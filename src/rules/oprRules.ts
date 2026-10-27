import type { CatalogBook } from '../model/types';

// What each rule does in a zone battle: OPR's core rules, the army books' own rules and spells, and the crusade's
// traits, relics, scars and Nexus traits, each written as the hooks the battle engine plays. Book rules this file
// doesn't name are read from their rule text (Army Forge writes them in a fixed style); anything neither covers is
// flagged as not modelled, so the GM can see what a battle leaves out (the Rules audit on the Books page).
//
// Distances are in inches, as the rules say; the battle measures them square to square (a square is 6").

/** Dice: a number, or 'D3', 'D6', 'D3+1', '2D6'. */
export type Dice = number | string;

/** Which attacks a hook counts for: melee, shooting, melee while charging, or melee when charged. */
export type When = 'melee' | 'shoot' | 'charge' | 'charged';

/** When a hook counts beyond its `when`. All fields must hold. */
export interface Cond {
  when?: When;
  /** The other unit is over this far away (the shooter, for a defensive hook). */
  over?: number;
  within?: number;
  /** It used a Hold action this activation (for a defensive hook: its last activation). */
  hold?: boolean;
  /** The target's Tough, from–to (most of its models). */
  vsTough?: [number, number];
  vsDef?: [number, number];
  vsHero?: boolean;
  /** The target is a Hero or a unit of one model. */
  vsSingle?: boolean;
  /** The target has at least this many models. */
  vsSize?: number;
  /** The target is Shaken or under half strength. */
  vsHurt?: boolean;
  vsFlying?: boolean;
  /** Defensive: the incoming hit has at least this AP. */
  vsAp?: number;
  /** It stands in cover terrain. */
  inCover?: boolean;
  /** From this round on. */
  fromRound?: number;
  /** The target is within half the weapon's range. */
  halfRange?: boolean;
  /** The target is the closest enemy unit. */
  closest?: boolean;
}

/** How often an active hook can be used. Unset: whenever its timing comes round. */
export type Per = 'game' | 'round' | 'twice';

/** When an active hook goes off. */
export type Timing = 'activation' | 'roundStart' | 'charge' | 'charged' | 'death' | 'kill' | 'hold' | 'shot';

export type Hook =
  // Attacking.
  | { k: 'hit'; n: number; c?: Cond }
  | { k: 'ap'; n: number; c?: Cond }
  /** More attacks per model with each weapon. */
  | { k: 'attacks'; n: number; c?: Cond }
  /** Unmodified 6s to hit: extra hits, extra AP for those hits, or an extra wound on the target. */
  | { k: 'six'; hits?: number; ap?: number; wound?: number; c?: Cond }
  /** Re-roll unmodified 1s to hit; `six` = must re-roll unmodified 6s (Faulty Aim). */
  | { k: 'reroll'; ones?: boolean; six?: boolean; c?: Cond }
  /** The target must re-roll unmodified Defense 6s (Bane). */
  | { k: 'bane'; c?: Cond }
  /** Unmodified Defense results of 1 (or up to `upTo`) take extra wounds (Shred, Quake). */
  | { k: 'shred'; n: number; upTo?: number; c?: Cond }
  | { k: 'deadly'; n: number }
  | { k: 'blast'; n: number }
  | { k: 'reliable' }
  /** Fires once a game. */
  | { k: 'limited' }
  | { k: 'rending' }
  | { k: 'noRegen' }
  | { k: 'noCover' }
  | { k: 'indirect' }
  /** Picks one model as its target (Sniper shoots at Quality 2+ too). */
  | { k: 'takedown'; sniper?: boolean; c?: Cond }
  /** More range, in inches. */
  | { k: 'range'; n: number }
  /** When its attacks destroy their target, leftover wounds go to another enemy within `range`". */
  | { k: 'carry'; range: number }
  | { k: 'strikeFirst' }
  /** Ignores negative modifiers to this weapon. */
  | { k: 'unstoppable' }
  /** On a hit, roll per model in the target: on this or more it's killed (Black Hole). */
  | { k: 'blackHole'; on: number }
  /** Kills in melee heal the bearer and add an attack for the rest of the game (Soul Harvest). */
  | { k: 'harvest' }
  // Being attacked.
  | { k: 'def'; n: number; c?: Cond }
  /** Hits on it lose AP (Fortified: -1, to a minimum of 0). */
  | { k: 'apIn'; n: number; c?: Cond }
  /** Enemies get this to hit it (Evasive -1). */
  | { k: 'hitIn'; n: number; c?: Cond }
  /** Ignores each wound on this or more; `spell` for wounds from spells; `regen` = Regeneration (Rending, Bane… skip it). */
  | { k: 'ignore'; on: number; spell?: number; regen?: boolean }
  /** Counts as in cover against shooting. */
  | { k: 'cover'; c?: Cond }
  /** Unmodified Defense 1s take this many extra wounds (Weak Spot). */
  | { k: 'weak'; n: number }
  /** A shield of `n` wounds taken first, each ignored on `on`+; once down it stays down. */
  | { k: 'shieldPool'; n: number; on: number }
  /** Ignores the first wound each round. */
  | { k: 'ablative' }
  /** Once a game, when attacked: takes half the wounds (rounded up) until the round ends. */
  | { k: 'halve' }
  /** Once a round, ignores this many of the wounds it takes. */
  | { k: 'soak'; n: Dice }
  /** Once a game, ignores all wounds from one weapon's attacks. */
  | { k: 'negate' }
  /** Once a game, when it takes its last wound, on `on`+ one model stays with 1 wound. */
  | { k: 'lastStand'; on: number }
  /** Once a round, when shot at, on `on`+ the shooters take the hits instead. */
  | { k: 'reflect'; on: number }
  /** In melee, each unmodified Defense 6 it rolls is a wound on the attackers. */
  | { k: 'riposte' }
  /** Enemy spells on it (or friends near it, as an aura) fail on `on`+. */
  | { k: 'spellWard'; on: number }
  /** Can't be targeted or affected by spells, and can't cast. */
  | { k: 'spellproof' }
  /** Can't cast spells or use auras (a mark from Bell of Severance). */
  | { k: 'silenced' }
  /** Loses Stealth, and friends ignore cover when shooting it. */
  | { k: 'exposed' }
  /** Once a game, a failed morale test counts as passed. */
  | { k: 'passOnce' }
  /** Enemies over this far can't target it after a Hold, until the round ends (Umbral Veil). */
  | { k: 'veil'; over: number }
  /** Enemy shooting loses range against it, to a minimum of 6"; enemy charges lose movement (Shrouded). */
  | { k: 'shroud'; range: number; charge: number }
  // The unit.
  | { k: 'move'; adv: number; rush: number; c?: Cond }
  | { k: 'strider' }
  | { k: 'flying' }
  | { k: 'scout' }
  | { k: 'ambush' }
  | { k: 'slow' }
  | { k: 'immobile' }
  | { k: 'hero' }
  | { k: 'caster'; n: number }
  | { k: 'tough'; n: number }
  | { k: 'impact'; n: number }
  /** Impact(1) per this many models when charging, up to `max`. */
  | { k: 'impactPer'; models: number; max: number }
  /** Enemies charging it get -1 Impact per model with this weapon (Counter). */
  | { k: 'counter' }
  | { k: 'fearless' }
  | { k: 'morale'; n: number; c?: Cond }
  /** Always passes morale tests. */
  | { k: 'steadfast' }
  /** When it would be Routed it is Shaken instead. */
  | { k: 'noRout' }
  /** A failed test counts as passed, but it takes wounds: a die per wound left, 1-3 each a wound (No Retreat). */
  | { k: 'noRetreat' }
  /** Counts as having dealt this many more wounds when deciding who won a melee. */
  | { k: 'fear'; n: number }
  /** Enemies in melee with it get this to morale tests. */
  | { k: 'dread'; n: number }
  | { k: 'rushShoot' }
  /** Moves up to `d`" after shooting (and after melee unless `shootOnly`), once a round. */
  | { k: 'hitRun'; d: number; shootOnly?: boolean }
  /** Moves up to `d`" after destroying a unit in melee. */
  | { k: 'overrun'; d: number }
  /** Shaken: on activation, a 4+ stops it being Shaken and it acts as normal. */
  | { k: 'rally' }
  /** When in melee (or attacking, unless `melee`), a die: 1-3 AP(+1), 4-6 +1 to hit. */
  | { k: 'unpredictable'; melee?: boolean }
  /** On its turn to attack in melee, roll `n` dice: each 6 is a wound on the target. */
  | { k: 'ravage'; n: number }
  /** Can't join another unit. */
  | { k: 'loner' }
  /** Skips the battle (Comatose). */
  | { k: 'absent' }
  // Active: heals, hits, buffs and marks, with a timing.
  | { k: 'heal'; n: Dice; at: Timing; who: 'self' | 'friend'; range?: number; targets?: number; per?: Per; revive?: boolean; toughOnly?: boolean; on?: number }
  | { k: 'hits'; n: Dice; ap: number; rules?: string[]; at: Timing; range: number; who: 'enemy' | 'enemies' | 'all'; per?: Per; on?: number; los?: boolean; targets?: number }
  /** Gives hooks to units: friends (`side: 'friend'`), or as a mark on enemies that friendly units use against them. */
  | { k: 'buff'; give: Hook[]; side: 'friend' | 'enemy'; mark?: boolean; range: number; at: Timing; targets?: number; per?: Per; los?: boolean; self?: boolean; until: 'once' | 'round' | 'next' | 'game'; on?: number; enemyRule?: boolean }
  /** Hooks for units within `range`" all the time: friends, or enemies. */
  | { k: 'aura'; give: Hook[]; side: 'friend' | 'enemy'; range: number }
  /** Enemies within `range`" (one, or `targets`) take a morale test; failing, each takes `hits` hits, or can't move this round (`pin`). */
  | { k: 'terror'; range: number; hits?: number; pin?: boolean; targets?: number; per?: Per }
  /** On activation, one of two sets of hooks for this activation (the player or AI picks). */
  | { k: 'choice'; a: Hook[]; b: Hook[] }
  /** Back up once with this many wounds, on this or more. */
  | { k: 'revive'; on: number; hp: Dice }
  /** Destroyed: each unit within `range`" rolls a die per model (up to one per Tough) and takes a wound per 1. */
  | { k: 'explode'; range: number }
  /** A one-off re-roll each round (Nexus Amplification, Lucky). */
  | { k: 'luck'; n: number }
  /** May move `d`" when activated, before anything else (March Order: another friendly unit; Voidwalk: itself). */
  | { k: 'reposition'; d: Dice; who: 'self' | 'friend'; per?: Per }
  /** Unshakes one friendly unit within `range`" once a game. */
  | { k: 'steady'; range: number }
  /** Not played in a zone battle; why. */
  | { k: 'none'; why: string };

export interface RuleDef {
  hooks: Hook[];
  /** 'weapon': the hooks only count for this weapon's attacks. 'unit': the model and its joined unit share them. */
  scope?: 'weapon' | 'model' | 'unit';
  /** Part of the rule isn't played, and what. */
  partial?: string;
}

// Shorthands.
const at = (k: Hook['k'], o: object = {}): Hook => ({ k, ...o }) as Hook;
const none = (why: string): RuleDef => ({ hooks: [{ k: 'none', why }] });
const def = (hooks: Hook[], partial?: string, scope?: RuleDef['scope']): RuleDef => ({ hooks, ...(partial ? { partial } : {}), ...(scope ? { scope } : {}) });
const unit = (hooks: Hook[], partial?: string): RuleDef => def(hooks, partial, 'unit');
const weapon = (hooks: Hook[], partial?: string): RuleDef => def(hooks, partial, 'weapon');
const melee: Cond = { when: 'melee' };
const shoot: Cond = { when: 'shoot' };
const charge: Cond = { when: 'charge' };
const FAST: Hook = { k: 'move', adv: 2, rush: 4 };

/**
 * OPR core rules and the army books' rules, by name in lower case with any (X) taken off. `x` is the rating.
 * A book's own text wins over these only where this table has no entry.
 */
const CORE: Record<string, (x: number) => RuleDef> = {
  ap: (x) => weapon([at('ap', { n: x })]),
  blast: (x) => weapon([at('blast', { n: x || 3 }), at('noCover')]),
  deadly: (x) => weapon([at('deadly', { n: x || 3 })]),
  rending: () => weapon([at('rending'), at('noRegen')]),
  reliable: () => weapon([at('reliable')]),
  bane: () => weapon([at('bane'), at('noRegen')]),
  'bane in melee': () => def([at('bane', { c: melee }), at('noRegen')]),
  poison: () => weapon([at('bane'), at('noRegen')]),
  lance: () => weapon([at('ap', { n: 2, c: charge })]),
  sniper: () => weapon([at('takedown', { sniper: true })]),
  takedown: () => weapon([at('takedown')]),
  indirect: () => weapon([at('indirect'), at('hit', { n: -1, c: { when: 'shoot', hold: false } })]),
  'ignores cover': () => weapon([at('noCover')]),
  'ignores regeneration': () => weapon([at('noRegen')]),
  unstoppable: () => weapon([at('noRegen'), at('noCover'), at('unstoppable')]),
  surge: () => weapon([at('six', { hits: 1 })]),
  relentless: () => weapon([at('six', { hits: 1, c: { when: 'shoot', over: 9 } })]),
  furious: () => def([at('six', { hits: 1, c: charge })]),
  sergeant: () => def([at('six', { hits: 1 })]),
  shred: () => weapon([at('shred', { n: 1 })]),
  quake: () => weapon([at('shred', { n: 1 }), at('noRegen')]),
  demolish: () => weapon([at('noCover'), at('ap', { n: 2, c: { vsTough: [3, 9] } })]),
  fragment: () => weapon([at('noCover'), at('ap', { n: 1, c: { vsDef: [2, 4] } })]),
  disintegrate: () => weapon([at('noRegen'), at('ap', { n: 2, c: { vsDef: [2, 3] } })]),
  thrust: () => weapon([at('hit', { n: 1, c: charge }), at('ap', { n: 1, c: charge })]),
  'thrust in melee': () => def([at('hit', { n: 1, c: charge }), at('ap', { n: 1, c: charge })]),
  counter: () => weapon([at('strikeFirst'), at('counter')]),
  'counter in melee': () => def([at('strikeFirst'), at('counter')]),
  'counter-attack': () => def([at('strikeFirst')]),
  impact: (x) => def([at('impact', { n: x })]),
  tough: (x) => def([at('tough', { n: x })]),
  defense: (x) => def([at('def', { n: x })]),
  armor: () => none('Sets Defense, which the unit already shows'),
  'good attacker': () => def([at('hit', { n: 1 })]),
  'good shooter': () => def([at('hit', { n: 1, c: shoot })]),
  'good fighter': () => def([at('hit', { n: 1, c: melee })]),
  'melee slayer': () => def([at('ap', { n: 2, c: { when: 'charge', vsTough: [3, 99] } })]),
  unpredictable: () => def([at('unpredictable')]),
  'unpredictable fighter': () => def([at('unpredictable', { melee: true })]),
  ravage: (x) => def([at('ravage', { n: x || 1 })]),
  fast: () => def([FAST]),
  'speed boost': () => def([FAST]),
  slow: () => def([at('slow')]),
  immobile: () => def([at('immobile')]),
  strider: () => def([at('strider')]),
  flying: () => def([at('flying')]),
  aircraft: () => def([at('flying'), at('move', { adv: 24, rush: 24 }), at('hitIn', { n: -1 })], 'Moves straight and can\'t be charged at the table; here it just flies far and is hard to hit'),
  scout: () => def([at('scout')]),
  ambush: () => def([at('ambush')]),
  hero: () => def([at('hero')]),
  caster: (x) => def([at('caster', { n: x || 1 })]),
  fearless: () => def([at('fearless')]),
  fear: (x) => def([at('fear', { n: x || 1 })]),
  stealth: () => def([at('hitIn', { n: -1, c: { when: 'shoot', over: 9 } })]),
  evasive: () => def([at('hitIn', { n: -1 })]),
  'melee evasion': () => def([at('hitIn', { n: -1, c: melee })]),
  fortified: () => def([at('apIn', { n: -1 })]),
  reinforced: () => def([at('apIn', { n: -1, c: { over: 9 } })]),
  'ballistic vest': () => def([at('apIn', { n: -1, c: { over: 9 } })]),
  'ballistic vest boost': () => def([at('apIn', { n: -1 })]),
  regeneration: () => def([at('ignore', { on: 5, regen: true })]),
  protected: () => def([at('ignore', { on: 6 })]),
  resistance: () => def([at('ignore', { on: 6, spell: 2 })]),
  shrouded: () => def([at('shroud', { range: 4, charge: 2 })]),
  shadowborn: () => def([at('shroud', { range: 4, charge: 2 })]),
  'shadowborn boost': () => def([at('shroud', { range: 8, charge: 4 })]),
  'quick shot': () => def([at('rushShoot')]),
  'hit & run': () => def([at('hitRun', { d: 3 })]),
  'hit & run shooter': () => def([at('hitRun', { d: 3, shootOnly: true })]),
  'hit & run boost': () => def([at('hitRun', { d: 6 })]),
  'no retreat': () => def([at('noRetreat')]),
  'repel ambushers': () => def([at('none', { why: 'Ambushers set up over 12" away: the battle keeps them out of its zone' })]),
  'ambush beacon': () => none('Ambushers deploy near it, ignoring distance'),
  ethereal: () => def([at('reposition', { d: 6, who: 'self' }), at('move', { adv: -6, rush: -6 })]),
  'precision target': (x) => def([at('buff', { give: [at('hit', { n: x || 1 })], side: 'enemy', mark: true, range: 18, los: true, at: 'activation', per: 'game', until: 'game' })]),
  'breath attack': () => def([at('hits', { n: 1, ap: 1, rules: ['Blast(3)'], at: 'activation', range: 6, who: 'enemy', on: 2, los: true })]),
  mend: () => def([at('heal', { n: 'D3', at: 'activation', who: 'friend', range: 3, toughOnly: true })]),
  transport: () => none('Transports come in a later phase'),
  limited: () => weapon([at('limited')]),
  unique: () => none('Army building only'),
  banner: () => def([at('morale', { n: 1 })], 'Read as +1 to morale tests for its unit'),
  musician: () => def([at('morale', { n: 1 })], 'Read as +1 to morale tests for its unit'),
  'psychic barrier': () => def([at('spellWard', { on: 4 })]),
  entrenched: () => def([at('hitIn', { n: -2, c: { when: 'shoot', over: 9, hold: true } })], 'Read as: it held still on its last activation'),
  'increased shooting range': () => def([at('range', { n: 6 })]),
  'morale debuff': () => def([at('aura', { give: [at('morale', { n: -1 })], side: 'enemy', range: 12 })], 'Read as -1 to morale for enemies within 12"'),
};

/** The crusade's homebrew traits, relics, scars and Nexus traits (rules/data.ts), as their rule text says. */
const CRUSADE: Record<string, RuleDef> = {
  // Weapon traits.
  'well balanced': weapon([at('hit', { n: 1 }), at('reroll', { ones: true })]),
  duplicate: none('Copies another trait: counted where the unit is built'),
  '+1 a': weapon([at('attacks', { n: 1 })]),
  '+1 ap': weapon([at('ap', { n: 1 })]),
  'first strike': weapon([at('hit', { n: 1, c: melee }), at('deadly', { n: 3 })], 'Read as every attack, not only the first'),
  'guard stance': weapon([at('def', { n: 1, c: melee })]),
  momentum: weapon([at('impactPer', { models: 1, max: 99 })]),
  duelist: weapon([at('hit', { n: 1, c: { vsSingle: true } }), at('ap', { n: 1, c: { vsSingle: true } })]),
  reaping: weapon([at('attacks', { n: 1, c: { vsSize: 5 } }), at('attacks', { n: 1, c: { vsSize: 10 } })]),
  '+6" range': weapon([at('range', { n: 6 })]),
  'rapid volley': weapon([at('attacks', { n: 1, c: { when: 'shoot', halfRange: true } })]),
  'hollow point': weapon([at('shred', { n: 1 })]),
  'suppressing fire': weapon([at('buff', { give: [at('hit', { n: -1, c: shoot })], side: 'enemy', range: 99, at: 'shot', until: 'next', enemyRule: true })]),
  'spread shot': weapon([at('blast', { n: 2 })], 'Adds to Blast in its profile'),
  brutal: weapon([at('ap', { n: 1 }), at('six', { hits: 1 })]),
  'slowing strike': weapon([at('buff', { give: [at('slow'), at('hit', { n: -1 })], side: 'enemy', range: 99, at: 'shot', until: 'next', enemyRule: true })]),
  beam: weapon([at('six', { hits: 2 })]),
  'temporal rift': none('Moves the target to a random quarter of the table'),
  'soul harvest': weapon([at('harvest')]),
  'mounting rage': weapon([at('attacks', { n: 1, c: { fromRound: 2 } }), at('attacks', { n: 1, c: { fromRound: 3 } }), at('attacks', { n: 1, c: { fromRound: 4 } })]),
  'black hole': weapon([at('blackHole', { on: 5 })]),
  // Hero traits.
  'aura of blinding': def([at('aura', { give: [at('hit', { n: -1, c: shoot })], side: 'enemy', range: 9 })]),
  'aura of swiftness': unit([FAST]),
  'takedown strike': def([at('hits', { n: 1, ap: 1, rules: ['Deadly(3)'], at: 'charge', range: 0, who: 'enemy', per: 'round' })], 'Read as an extra Deadly(3) hit when it strikes in melee'),
  'march order': def([at('reposition', { d: 3, who: 'friend' })]),
  'rallying cry': def([at('aura', { give: [at('morale', { n: 1 })], side: 'friend', range: 12 })]),
  'veteran instincts': unit([at('hit', { n: 1, c: { when: 'shoot', hold: true } })]),
  'blade master': def([at('ap', { n: 1, c: melee })]),
  'field medic': def([at('heal', { n: 1, at: 'activation', who: 'self' })]),
  'precision shooting mark': def([at('buff', { give: [at('hit', { n: 1, c: shoot })], side: 'enemy', mark: true, range: 18, los: true, at: 'activation', until: 'once' })]),
  swift: unit([FAST]),
  'tough +3': def([at('tough', { n: 3 })]),
  bleed: weapon([at('noRegen')], 'The dangerous terrain test is not rolled'),
  // Infantry.
  skirmishers: def([at('hitRun', { d: 3, shootOnly: true })]),
  spotters: def([at('buff', { give: [at('hit', { n: 1, c: shoot })], side: 'enemy', mark: true, range: 24, los: true, at: 'activation', until: 'once' })]),
  'dug in': def([at('def', { n: 1, c: { hold: true } })]),
  'brace for impact': def([at('def', { n: 1, c: { when: 'charged' } })]),
  'trench warfare': def([at('noCover'), at('hit', { n: 1, c: { when: 'melee', inCover: true } })], 'Ignores cover all the time, not only from cover'),
  mutations: none('Rolled when gained: write Rending or AP(+1) on its weapons'),
  devour: def([at('six', { wound: 1, c: melee })]),
  bloodthirsty: def([at('hit', { n: 1, c: { when: 'melee', vsHurt: true } })]),
  'hammer blow': def([at('ap', { n: 1, c: charge })]),
  'point blank': def([at('hit', { n: 1, c: { when: 'shoot', within: 6 } })]),
  overrun: def([at('overrun', { d: 6 })]),
  'caster +1': def([at('caster', { n: 1 })]),
  'precise strikes': def([at('six', { ap: 2 })]),
  // Elite.
  'iron discipline': def([at('morale', { n: 1 }), at('noRout')]),
  'tank hunters': def([at('ap', { n: 1, c: { vsTough: [6, 99] } })]),
  'rapid redeploy': def([at('reposition', { d: 12, who: 'self', per: 'game' })], 'It may still act after moving'),
  'ap +1 when holding': def([at('ap', { n: 1, c: { when: 'shoot', hold: true } })]),
  // Vehicles and monsters.
  'auto-repair': def([at('heal', { n: 1, at: 'activation', who: 'self' })]),
  'armoured prow': def([at('def', { n: 1, c: melee })]),
  'targeting array': def([at('reroll', { ones: true, c: shoot })]),
  trample: def([at('hits', { n: 'D3', ap: 1, at: 'charge', range: 0, who: 'enemy' })]),
  'smoke launchers': def([at('buff', { give: [at('cover')], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'next' })]),
  // Aircraft.
  'air break': none('Flight path control'),
  'strafing run': def([at('ap', { n: 2, c: { when: 'shoot', closest: true } })]),
  'covering fire': def([at('buff', { give: [at('slow')], side: 'enemy', range: 99, at: 'shot', until: 'next', enemyRule: true })]),
  'assault bomb': def([at('hits', { n: 3, ap: 1, at: 'activation', range: 6, who: 'enemy', on: 2 })], 'Read as a nearby enemy, not one it flew over'),
  hover: none('Flight path control'),
  'armoured cockpit': def([at('def', { n: 1, c: { when: 'shoot', over: 12 } })]),
  'flare countermeasures': def([at('hitIn', { n: -1, c: shoot })], 'Read as every shot, not once a round'),
  'low pass': def([at('hit', { n: 1, c: { when: 'shoot', within: 6 } })], 'Read as units within 6"'),
  'escort wing': def([at('buff', { give: [at('hitIn', { n: -1, c: { when: 'shoot', over: 12 } })], side: 'friend', range: 12, at: 'activation', until: 'next' })]),
  // Fortifications.
  'deploy cover': def([at('aura', { give: [at('def', { n: 1, c: shoot }), at('hitIn', { n: -1, c: shoot })], side: 'friend', range: 3 })]),
  overwatch: none('Reaction fire outside its activation'),
  battlements: def([at('hits', { n: 3, ap: 1, at: 'charged', range: 0, who: 'enemy', on: 2 })]),
  'orbital drop': def([at('ambush')]),
  'ablative plating': def([at('ablative')]),
  overlook: def([at('aura', { give: [at('hit', { n: 1, c: { when: 'shoot', over: 12 } })], side: 'friend', range: 6 })]),
  'ammo cache': def([at('aura', { give: [at('reroll', { ones: true, c: shoot })], side: 'friend', range: 6 })]),
  'mined approaches': def([at('aura', { give: [at('none', { why: 'mines' })], side: 'enemy', range: 6 })], 'Dangerous terrain tests near it are not rolled'),
  // Unique traits.
  'extreme motivation': def([at('steadfast')]),
  crazed: def([at('attacks', { n: 1, c: charge })]),
  'bitter rivalry': def([at('hit', { n: 1, c: { vsHero: true } }), at('ap', { n: 1, c: { vsHero: true } })]),
  'toughened scars': def([at('tough', { n: 3 }), at('luck', { n: 1 })]),
  'heroic presence': def([at('aura', { give: [at('ignore', { on: 6 })], side: 'friend', range: 12 })]),
  ghostly: def([at('strider'), at('hitIn', { n: -1, c: { when: 'shoot', over: 9 } }), at('ignore', { on: 6 })]),
  'heavy training': def([at('impactPer', { models: 2, max: 10 })]),
  berserkers: def([at('hit', { n: 1, c: charge }), at('dread', { n: -1 })]),
  specialists: def([at('hit', { n: 1, c: shoot })], 'Read as shooting unless noted otherwise'),
  resilient: def([at('def', { n: 1 })]),
  lucky: def([at('luck', { n: 2 })]),
  'impact +3': def([at('impact', { n: 3 })]),
  'counter in melee / rending when shooting': def([at('strikeFirst'), at('counter')], 'Read as Counter'),
  'fear +3': def([at('fear', { n: 3 }), at('dread', { n: -1 })]),
  'inspiring aura': def([at('buff', { give: [at('hit', { n: 1 })], side: 'friend', range: 9, at: 'activation', until: 'next' })]),
  enhanced: def([at('apIn', { n: -1 }), at('tough', { n: 3 })]),
  elite: def([at('reroll', { ones: true })], 'Read as both melee and shooting'),
  'transport +6': none('Transports come in a later phase'),
  'flying + fast': def([at('flying'), FAST]),
  'impact +6': def([at('impact', { n: 6 })]),
  bulldoze: def([at('strider')], 'Terrain is not destroyed'),
  'explosive exit': def([at('explode', { range: 9 })]),
  'sky suppression': def([at('aura', { give: [at('morale', { n: -1 })], side: 'enemy', range: 18 })]),
  'combat turn': none('Flight path control'),
  'supply drop': def([at('heal', { n: 'D3', at: 'activation', who: 'friend', range: 6, targets: 3 })], 'Read as friendly units within 6"'),
  'aerial scan': def([at('buff', { give: [at('hit', { n: 1 })], side: 'enemy', mark: true, range: 999, at: 'activation', until: 'once' })]),
  'sensor array': def([at('aura', { give: [at('range', { n: 6 })], side: 'friend', range: 6 })]),
  'command bastion': def([at('luck', { n: 1 })]),
  'enhanced orbital drop': def([at('ambush')]),
  'shield generator': def([at('shieldPool', { n: 3, on: 5 })]),
  'repair bay': def([at('heal', { n: 'D6', at: 'activation', who: 'friend', range: 9 })]),
  // Scars.
  'crippling injury': def([at('slow')]),
  'damaged equipment': def([at('hit', { n: -1, c: shoot })]),
  'weakened armor': def([at('def', { n: -1 })]),
  'weak spot': def([at('weak', { n: 1 })]),
  'faulty aim': def([at('reroll', { six: true })]),
  'fear of death': def([at('morale', { n: -1 })]),
  dishonorable: def([at('loner')]),
  'weakened muscles': def([at('hit', { n: -1, c: melee })]),
  'lowered constitution': none('Only matters for death rolls'),
  comatose: def([at('absent')]),
  // Relics.
  'common weapon (surge)': none('Gives a weapon Surge: write it on the weapon'),
  'disruption shielding': def([at('negate')]),
  'auspex array': unit([at('noCover')], 'Ambush keep-out not played'),
  'dimensional anchor': def([at('terror', { range: 18, pin: true, per: 'round' })]),
  'enhanced eye': def([at('takedown', { c: shoot }), at('hit', { n: 1, c: shoot })]),
  'mobius repeater': def([at('carry', { range: 6 })]),
  'chrono-disruptor matrix': def([at('buff', { give: [at('immobile')], side: 'enemy', range: 12, targets: 99, at: 'activation', per: 'game', until: 'round', enemyRule: true })]),
  'bell of severance': def([at('buff', { give: [at('silenced')], side: 'enemy', range: 18, at: 'activation', per: 'game', until: 'round', enemyRule: true })]),
  "halvar's firing key": def([at('buff', { give: [at('ap', { n: 2, c: shoot }), at('noCover')], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'once' })]),
  'unbroken oath-seal': def([at('lastStand', { on: 4 })]),
  'mirrorglass mantle': unit([at('reflect', { on: 5 })]),
  "abbot's last psalm": def([at('aura', { give: [at('spellWard', { on: 4 })], side: 'friend', range: 12 })]),
  'wreck-core reactor': unit([at('choice', { a: [at('move', { adv: 3, rush: 3 })], b: [at('ap', { n: 1, c: shoot })] })]),
  "vashkar's dread mask": def([at('aura', { give: [at('morale', { n: -1 })], side: 'enemy', range: 12 }), at('terror', { range: 12, targets: 99, per: 'game' })]),
  'singing splinter': unit([at('hitIn', { n: -1, c: { when: 'shoot', over: 12 } })]),
  'umbra echo plating': unit([at('soak', { n: 'D3' })]),
  'umbral standard': unit([at('morale', { n: 1 }), at('passOnce')]),
  'void lantern': def([at('aura', { give: [at('exposed')], side: 'enemy', range: 9 })]),
  'blackstone shard amulet': unit([at('spellproof')]),
  'ancient quantum shielding': unit([at('riposte')]),
  'artisan bionics': unit([at('ignore', { on: 6 })]),
  'conversion field': unit([at('def', { n: 1, c: melee })]),
  'dark age jump pack': unit([at('flying')]),
  'temporal displacer gauntlet': def([at('buff', { give: [at('hit', { n: -1 })], side: 'enemy', range: 12, at: 'activation', until: 'round', on: 4, enemyRule: true })]),
  'refractor field': unit([at('def', { n: 1, c: { when: 'shoot', over: 12 } })]),
  'combat stimm injector': unit([at('buff', { give: [at('hit', { n: 1, c: melee }), FAST], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'round' })]),
  'nanite infusion injector': def([at('heal', { n: 1, at: 'activation', who: 'friend', range: 3, revive: true })]),
  'ethereal capacitor': unit([at('ignore', { on: 6 })], 'Doesn\'t step Protected up to 5+'),
  'archeotech nano-med': def([at('revive', { on: 2, hp: 'D3' })]),
  'dark age displacer belt': unit([at('none', { why: 'Rush anywhere' })], 'Teleport not played'),
  'unstable matter projector': unit([at('move', { adv: 7, rush: 0 }), at('strider')]),
  'archeotech combat restoratives': def([at('heal', { n: 'D3+1', at: 'activation', who: 'friend', range: 6, revive: true })]),
  'null-field disruptor': def([at('aura', { give: [at('hit', { n: -1 })], side: 'enemy', range: 9 })]),
  'nanite hive field': def([at('heal', { n: 3, at: 'activation', who: 'friend', range: 9, targets: 3, per: 'game' })]),
  'celestial nullification matrix': def([at('buff', { give: [at('def', { n: -1 })], side: 'enemy', range: 12, targets: 99, at: 'activation', per: 'game', until: 'round', enemyRule: true })]),
  'servitor power cell': def([at('heal', { n: 'D3', at: 'activation', who: 'self', per: 'game' })]),
  'korvane guard standard': def([at('aura', { give: [at('morale', { n: 1 })], side: 'friend', range: 6 }), at('buff', { give: [at('hit', { n: 1 })], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'round' })]),
  'the carrion crown': unit([at('flying'), at('hits', { n: 'D3', ap: 1, at: 'charge', range: 3, who: 'enemies' })]),
  'choir-throat torc': def([at('buff', { give: [at('hit', { n: -1 })], side: 'enemy', range: 12, targets: 99, at: 'activation', per: 'round', until: 'round', enemyRule: true })]),
  'heart of the blind mountain': def([at('tough', { n: 3 }), at('hits', { n: 3, ap: 1, at: 'activation', range: 6, who: 'enemies', per: 'round' })]),
  'the hollow crown': def([at('caster', { n: 2 })], 'Casting twice not played'),
  'shadesplinter cloak': unit([at('cover', { c: { when: 'shoot' } })], 'Read as always, not only after Advancing'),
  'warp-infusion': none('Gives a weapon Quake: write it on the weapon'),
  'null zone projector': none('Casting rolls'),
  'shard-lens scope': none('Gives a weapon +6" and Ignores Cover: write it on the weapon'),
  'phase-step harness': unit([at('move', { adv: 0, rush: 2 })]),
  'shadow veil emitter': unit([at('hitIn', { n: -1, c: { when: 'shoot', over: 9 } })]),
  'whispering shard': def([at('none', { why: 'casting re-roll' })], 'Casting re-roll not played'),
  'shard-crown of command': def([at('aura', { give: [at('morale', { n: 1 })], side: 'friend', range: 12 }), at('steady', { range: 12 })]),
  'echoing grimoire': def([at('caster', { n: 1 })], 'Keeping tokens on a failed cast not played'),
  'umbral tether': def([at('buff', { give: [at('move', { adv: -2, rush: -4 })], side: 'enemy', range: 12, at: 'activation', until: 'round', enemyRule: true })]),
  'oblivion orb': def([at('hits', { n: '2D6', ap: 2, at: 'activation', range: 24, who: 'enemy', per: 'game' })], 'Hits one enemy unit, not everything near a point'),
  'nexus resonator': def([at('hits', { n: 6, ap: 1, at: 'activation', range: 12, who: 'enemies', per: 'game' })]),
  'crown of the last lord': def([at('aura', { give: [at('morale', { n: 1 })], side: 'friend', range: 12 })], 'Read as a morale aura'),
  // Nexus traits.
  shadowmeld: unit([at('hitIn', { n: -1, c: { when: 'shoot', over: 9 } })]),
  'chrono-distortion': def([at('def', { n: 1, c: shoot }), at('hit', { n: 1, c: melee })]),
  voidwalk: unit([at('reposition', { d: 'D3+1', who: 'self' })]),
  'umbral command': none('Activates another unit at once'),
  'soul siphon': def([at('heal', { n: 1, at: 'kill', who: 'self' })]),
  'dread presence': def([at('aura', { give: [at('morale', { n: -1 })], side: 'enemy', range: 12 })]),
  'umbral veil': def([at('veil', { over: 18 })]),
  'temporal surge': def([at('buff', { give: [FAST], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'once' })]),
  'shard-laced armour': def([at('def', { n: 1, c: { when: 'shoot', over: 12 } })]),
  'void resilience': def([at('ignore', { on: 6 })]),
  'phase assault': def([at('move', { adv: 0, rush: 2 })]),
  'umbral rally': def([at('rally')]),
  'shard infusion': def([at('hit', { n: 1, c: { vsHurt: true } })], 'Read as +1 to hit against hurt units'),
  'shroud of despair': def([at('terror', { range: 12, hits: 3, per: 'twice' })]),
  wraithstep: def([at('strider'), at('move', { adv: 0, rush: 2 })]),
  'null aura': none('Spell defence only'),
  "hunter's mark": def([at('buff', { give: [at('hit', { n: 1 })], side: 'enemy', mark: true, range: 18, los: true, at: 'activation', until: 'once' })]),
  'shardborn fury': def([at('buff', { give: [at('attacks', { n: 1 })], side: 'friend', self: true, range: 0, at: 'activation', per: 'game', until: 'once' })]),
  shadowbound: def([at('halve')]),
  'nexus amplification': def([at('luck', { n: 1 })]),
  'void-forged plating': def([at('def', { n: 1, c: { vsAp: 2 } })]),
  'shard-spiked bulk': def([at('impact', { n: 3 })]),
  'nexus engine': def([FAST]),
  'echo repair': def([at('heal', { n: 'D3', at: 'roundStart', who: 'self' })]),
  'umbral bombardment': def([at('ap', { n: 1, c: { within: 18 } })]),
  'warp-engine': none('Placed at a table edge'),
  'shadow wake': none('Debuffs units it moves over'),
  'phase hull': def([at('hitIn', { n: -1, c: { when: 'shoot', over: 18 } })]),
  'shadow strafe': def([at('hits', { n: 'D3+1', ap: 1, at: 'activation', range: 6, who: 'enemy' })], 'Read as a nearby enemy, not one it flew over'),
  'interceptor protocols': def([at('hit', { n: 1, c: { when: 'shoot', vsFlying: true } }), at('ap', { n: 1, c: { when: 'shoot', vsFlying: true } })]),
  'warp-anchor': none('Stops enemy teleports'),
  'nexus resonance': def([at('aura', { give: [at('morale', { n: 1 })], side: 'friend', range: 12 }), at('aura', { give: [at('morale', { n: -1 })], side: 'enemy', range: 12 })]),
  'umbral battery': def([at('hits', { n: 'D3', ap: 2, at: 'activation', range: 24, who: 'enemy', per: 'round', los: true })]),
  'shard bulwark': def([at('aura', { give: [at('cover', { c: shoot })], side: 'friend', range: 6 })]),
  'void lattice': def([at('def', { n: 1, c: shoot })]),
  'recall beacon': none('Moves a friendly unit to it'),
};

/** Renamed rules Army Forge books carry (a book's "custom rules"), for books imported before the app read them. */
export const KNOWN_ALIASES: Record<string, string> = {
  heal: 'Mend',
  'healing aura': 'Regeneration Aura',
  'psy-barrier': 'Resistance',
  'ancient wrath': 'Furious Aura',
  'ammo box': 'AP(+1) when Shooting Aura',
  'battle ready': 'Scout Aura',
  'precision fire': 'Increased Shooting Range Aura',
  'absolute power': 'Morale Debuff',
};

const lower = (s: string) => s.trim().toLowerCase();
/** 'Tough(3)' → ['tough', 3]; 'AP(+1) when Shooting' → ['ap when shooting', 1]. */
export function splitRule(label: string): [string, number] {
  const m = label.match(/\(([+-]?\d+)"?\)/);
  const x = m ? Number(m[1]) : 0;
  return [lower(label.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ')), x];
}

/** Adds a condition to every hook that takes one (e.g. "in melee"). */
function only(r: RuleDef, c: Cond): RuleDef {
  const tag = (h: Hook): Hook => ('c' in h || ['hit', 'ap', 'attacks', 'six', 'reroll', 'bane', 'shred', 'def', 'apIn', 'hitIn', 'morale', 'move', 'cover'].includes(h.k) ? { ...h, c: { ...(h as { c?: Cond }).c, ...c } } as Hook : h);
  return { ...r, hooks: r.hooks.map(tag), scope: r.scope === 'weapon' ? undefined : r.scope };
}

const num = (s: string) => Number(s.replace(/[^\d-]/g, '')) || 0;
const dice = (s: string): Dice => (/d/i.test(s) ? s.toUpperCase().replace(/\s/g, '') : num(s));
const TARGETS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, 'up to two': 2, 'up to three': 3, 'up to 2': 2, 'up to 3': 3 };
const count = (s: string | undefined) => (s ? TARGETS[lower(s)] ?? (num(s) || 1) : 1);

/**
 * What a "gets X" phrase gives: "+1 to defense rolls", "+1 to hit rolls in melee", "Furious", "Regeneration",
 * "+6" range when shooting", "moves +2" when using Advance…", "-1 to morale test rolls", "AP(+1) in melee".
 */
export function parseGift(text: string, book?: BookRules): Hook[] | undefined {
  const t = text.trim().replace(/\.$/, '');
  const when: Cond | undefined = /in melee/i.test(t) ? melee : /when shooting/i.test(t) ? shoot : /when charging/i.test(t) ? charge : undefined;
  const c = when ? { c: when } : {};
  let m;
  if ((m = t.match(/^([+-]\d+) to hit rolls?/i))) return [at('hit', { n: num(m[1]), ...c })];
  if ((m = t.match(/^([+-]\d+) to defen[cs]e rolls?/i))) return [at('def', { n: num(m[1]), ...c })];
  if ((m = t.match(/^([+-]\d+) to morale test rolls?/i))) return [at('morale', { n: num(m[1]) })];
  if ((m = t.match(/^AP\(([+-]?\d+)\)/i))) return [at('ap', { n: num(m[1]), ...c })];
  if ((m = t.match(/moves? \+(\d+)"? when using Advance(?: actions)?,? (?:and|or) \+(\d+)"? when using Rush/i))) return [at('move', { adv: num(m[1]), rush: num(m[2]) })];
  if ((m = t.match(/^\+(\d+)"? range/i))) return [at('range', { n: num(m[1]) })];
  const r = resolve(t, book);
  return r && !r.hooks.every((h) => h.k === 'none') ? r.hooks : undefined;
}

/** A rule read from its Army Forge text. Undefined when the text isn't in a style it knows. */
export function parseRule(name: string, desc: string, book?: BookRules): RuleDef | undefined {
  const d = desc.trim();
  let m;
  // "This model and its unit get X."
  if ((m = d.match(/^This model and its unit get (.+?)\.?$/i))) {
    const g = parseGift(m[1], book);
    return g ? unit(g) : undefined;
  }
  if ((m = d.match(/^This model gets (.+?)\.?$/i))) {
    const g = parseGift(m[1], book);
    return g ? def(g) : undefined;
  }
  // "Once per activation, before attacking, pick one friendly unit within 12", which gets X once (next time the effect would apply)."
  if ((m = d.match(/^Once per (activation|round|game), before attacking, pick (one|two|three|up to \w+) (friendly|enemy) units? within (\d+)"( in line of sight)?, which (friendly units )?(?:gets? )?(.+?) (?:against )?once \(next time/i))) {
    const [, per, n, side, range, los, mark, what] = m;
    const g = parseGift(what.replace(/ against$/i, ''), book);
    if (!g) return undefined;
    return def([at('buff', { give: g, side: lower(side) === 'friendly' ? 'friend' : 'enemy', ...(mark ? { mark: true } : { enemyRule: lower(side) === 'enemy' }), range: num(range), at: 'activation', targets: count(n), ...(per !== 'activation' ? { per } : {}), ...(los ? { los: true } : {}), until: 'once' })]);
  }
  // "Once per activation, before attacking, pick one friendly model within 3" with Tough, and remove D3 wounds from it."
  if ((m = d.match(/pick one friendly (model|unit) within (\d+)"( with Tough)?, and remove (\w+(?:\+\d+)?) wounds?/i))) {
    return def([at('heal', { n: dice(m[4]), at: 'activation', who: 'friend', range: num(m[2]), ...(m[3] ? { toughOnly: true } : {}) })]);
  }
  // "When activated, ... removes N wounds" / "At the start of each round, removes D3 wounds."
  if ((m = d.match(/^(When activated|At the start of each round),? (?:this model(?:'s unit)? |it )?removes? (\w+) wounds?/i))) {
    return def([at('heal', { n: dice(m[2]), at: /round/i.test(m[1]) ? 'roundStart' : 'activation', who: 'self' })]);
  }
  // "... one enemy unit within 6" in line of sight takes 1 hit with Blast(3) and AP(1)."
  if ((m = d.match(/(?:On a (\d)\+ )?one enemy unit within (\d+)"( in line of sight)? takes (\w+) hits? with (.+?)\.?$/i))) {
    return def([at('hits', { n: dice(m[4]), ...hitRules(m[5]), at: 'activation', range: num(m[2]), who: 'enemy', ...(m[1] ? { on: num(m[1]) } : {}), ...(m[3] ? { los: true } : {}) })]);
  }
  if ((m = d.match(/^When a unit where all models have this rule takes wounds, roll one die for each\. On a (\d)\+ it is ignored/i))) return def([at('ignore', { on: num(m[1]) })]);
  if ((m = d.match(/^Enemies get ([+-]\d+) to hit rolls( in melee)? when attacking units where all models have this rule/i))) return def([at('hitIn', { n: num(m[1]), ...(m[2] ? { c: melee } : {}) })]);
  if ((m = d.match(/^Moves \+(\d+)" when using Advance, and \+(\d+)/i))) return def([at('move', { adv: num(m[1]), rush: num(m[2]) })]);
  if (/^Ignores Cover/i.test(d) && (m = d.match(/AP\(\+(\d+)\)/))) {
    const tough = d.match(/Tough\((\d+)\) to Tough\((\d+)\)/i);
    const dv = d.match(/Defense (\d)\+ to Defense (\d)\+/i);
    return weapon([at('noCover'), at('ap', { n: num(m[1]), c: tough ? { vsTough: [num(tough[1]), num(tough[2])] } : dv ? { vsDef: [num(dv[1]), num(dv[2])] } : undefined })]);
  }
  if ((m = d.match(/^On unmodified results of 6 to hit, this weapon deals (\d+) extra hits?/i))) return weapon([at('six', { hits: num(m[1]) })]);
  if ((m = d.match(/^On unmodified results of 1 to block hits, this weapon deals (\d+) extra wound/i))) return weapon([at('shred', { n: num(m[1]) })]);
  void name;
  return undefined;
}

/** "AP(2) and Deadly(3)" → AP and the other rules. */
function hitRules(text: string): { ap: number; rules?: string[] } {
  const parts = text.split(/,|\band\b/).map((s) => s.trim()).filter(Boolean);
  const ap = parts.find((p) => /^AP\(/i.test(p));
  const rules = parts.filter((p) => p !== ap);
  return { ap: ap ? num(ap) : 0, ...(rules.length ? { rules } : {}) };
}

/** A book's rule texts, by lower-case name, with its renamed rules. */
export interface BookRules {
  desc: Map<string, string>;
  alias: Map<string, string>;
}

export function bookRules(books: Pick<CatalogBook, 'rules'>[]): BookRules {
  const desc = new Map<string, string>();
  const alias = new Map<string, string>(Object.entries(KNOWN_ALIASES));
  for (const b of books) for (const r of b.rules) {
    const k = lower(r.name);
    if (r.desc && !desc.has(k)) desc.set(k, r.desc);
    if (r.alias) alias.set(k, r.alias);
  }
  return { desc, alias };
}

/** One rule's hooks: the crusade table, the core table, then its book text; aliases and suffixes ("Aura", "in Melee") unwrapped. */
export function resolve(label: string, book?: BookRules, depth = 0): RuleDef | undefined {
  if (depth > 4) return undefined;
  const [name, x] = splitRule(label);
  const full = lower(label);
  if (CRUSADE[full]) return CRUSADE[full];
  if (CRUSADE[name]) return CRUSADE[name];
  if (CORE[name]) return CORE[name](x);
  const aliased = book?.alias.get(name) ?? KNOWN_ALIASES[name];
  if (aliased) return resolve(aliased, book, depth + 1);
  // "X Aura": the model and its unit get X. "X Boost Aura" likewise.
  let m;
  if ((m = label.match(/^(.+?)\s+Aura$/i))) {
    const inner = resolve(m[1], book, depth + 1);
    return inner && { ...inner, scope: 'unit' };
  }
  if ((m = label.match(/^(.+?)\s+in Melee$/i))) {
    const inner = resolve(m[1], book, depth + 1);
    return inner && only(inner, melee);
  }
  if ((m = label.match(/^(.+?)\s+when Shooting$/i))) {
    const inner = resolve(m[1], book, depth + 1);
    return inner && only(inner, shoot);
  }
  const text = book?.desc.get(name);
  if (text) return parseRule(name, text, book);
  return undefined;
}

// ---- Spells ----

export interface SpellDef {
  name: string;
  threshold: number;
  range: number;
  side: 'friend' | 'enemy';
  targets: number;
  /** Damage: hits with AP and rules. */
  hits?: { n: Dice; ap: number; rules?: string[] };
  /** A once-only gift (on friends) or mark/debuff (on enemies). */
  give?: Hook[];
  /** Friends get it against the target (a mark), not the target itself. */
  mark?: boolean;
  /** Not played, and why. */
  none?: string;
}

/** A spell read from its text, e.g. "Target enemy unit within 12" takes 2 hits with AP(2)." */
export function parseSpell(s: { name: string; threshold: number; effect: string }, book?: BookRules): SpellDef {
  const e = s.effect.trim();
  const base = { name: s.name, threshold: s.threshold };
  const m = e.match(/^(?:Target|Pick) (up to \w+|one|two|three|\d+)? ?(friendly|enemy) (units?|models?) within (\d+)["”]?,? (?:which )?(.*)$/i);
  if (!m) return { ...base, range: 12, side: 'enemy', targets: 1, none: 'Text not understood' };
  const [, n, side, , range, rest] = m;
  const out: SpellDef = { ...base, range: num(range), side: lower(side) === 'friendly' ? 'friend' : 'enemy', targets: count(n) };
  let h;
  if ((h = rest.match(/takes? (\w+) hits?(?: with (.+?))?\.?$/i))) return { ...out, hits: { n: dice(h[1]), ...(h[2] ? hitRules(h[2]) : { ap: 0 }) } };
  const mark = /^friendly units gets? (.+?) against once/i.exec(rest);
  if (mark) {
    const g = parseGift(mark[1], book);
    return g ? { ...out, give: g, mark: true } : { ...out, none: 'Text not understood' };
  }
  const gift = rest.replace(/^(?:which )?(?:gets?|get) /i, '').replace(/ once \(next time.*$/i, '');
  const g = parseGift(gift.replace(/^move /i, 'moves '), book);
  return g ? { ...out, give: g } : { ...out, none: 'Text not understood' };
}

// ---- The audit ----

export type AuditStatus = 'full' | 'partial' | 'none';

export interface AuditRow {
  name: string;
  /** Where it's from: a book's rule, a spell, or a crusade table. */
  kind: 'rule' | 'spell' | 'crusade';
  status: AuditStatus;
  /** What the battle does with it, in a few words. */
  plays: string;
  note?: string;
}

const ruleStatus = (r: RuleDef | undefined): AuditStatus => (!r || r.hooks.every((h) => h.k === 'none') ? 'none' : r.partial || r.hooks.some((h) => h.k === 'none') ? 'partial' : 'full');

/** Every rule and spell a book uses (its own list and the rules on its units and weapons), and how the battle plays each. */
export function auditBook(book: CatalogBook): AuditRow[] {
  const br = bookRules([book]);
  const names = new Set<string>(book.rules.map((r) => r.name));
  for (const u of book.units) {
    u.rules.forEach((r) => names.add(splitLabel(r)));
    u.weapons.forEach((w) => w.rules.forEach((r) => names.add(splitLabel(r))));
    for (const s of u.sections) for (const o of s.options) for (const g of o.gains) {
      if (g.kind === 'rule') names.add(splitLabel(g.label));
      // An item's content mixes rules and weapons ("Grenade-Mod (24", A1, …)"); the weapons' rules are on its units.
      if (g.kind === 'item') g.rules.filter((r) => !isWeaponLabel(r)).forEach((r) => names.add(splitLabel(r)));
      if (g.kind === 'weapon') g.weapon.rules.forEach((r) => names.add(splitLabel(r)));
    }
  }
  const rows: AuditRow[] = [...names].sort().map((name) => {
    const r = resolve(name, br);
    const why = r?.hooks.find((h): h is Extract<Hook, { k: 'none' }> => h.k === 'none')?.why;
    return {
      name, kind: 'rule', status: ruleStatus(r), plays: r ? summarize(r) : 'Nothing',
      ...(r?.partial || why ? { note: r?.partial ?? why } : !r ? { note: br.desc.has(lower(name)) ? 'Its text is in a style the battle can\'t read' : 'No rule text in the book' } : {}),
    };
  });
  for (const s of book.spells) {
    const sp = parseSpell(s, br);
    rows.push({ name: s.name, kind: 'spell', status: sp.none ? 'none' : 'full', plays: spellText(sp), ...(sp.none ? { note: sp.none } : {}) });
  }
  return rows;
}

/** The crusade's own traits, relics and scars as the battle plays them. */
export function auditCrusade(entries: { name: string; profile?: string }[]): AuditRow[] {
  return entries.map((e) => {
    if (e.profile) {
      const rules = e.profile.split(/,\s*/).filter((p) => !/^(Melee|\d+"|A\d+)$/.test(p.trim()));
      const missing = rules.filter((r) => ruleStatus(resolve(r)) === 'none');
      return { name: e.name, kind: 'crusade' as const, status: missing.length ? ('partial' as const) : ('full' as const), plays: `Weapon: ${e.profile}`, ...(missing.length ? { note: `Not played: ${missing.join(', ')}` } : {}) };
    }
    const r = resolve(e.name);
    const why = r?.hooks.find((h): h is Extract<Hook, { k: 'none' }> => h.k === 'none')?.why;
    return { name: e.name, kind: 'crusade', status: ruleStatus(r), plays: r ? summarize(r) : 'Nothing', ...(r?.partial || why ? { note: r?.partial ?? why } : !r ? { note: 'Not in the rules map' } : {}) };
  });
}

const isWeaponLabel = (label: string) => /\((?:[^()]*?, )?A\d+[,)]/.test(label);
const splitLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*$/, '').trim();

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const condText = (c?: Cond) => {
  if (!c) return '';
  const bits = [
    c.when === 'melee' ? 'in melee' : c.when === 'shoot' ? 'shooting' : c.when === 'charge' ? 'charging' : c.when === 'charged' ? 'when charged' : '',
    c.over != null ? `over ${c.over}"` : '', c.within != null ? `within ${c.within}"` : '', c.hold ? 'after Hold' : c.hold === false ? 'after moving' : '',
    c.vsTough ? `vs Tough(${c.vsTough[0]}+)` : '', c.vsDef ? `vs Defense ${c.vsDef[0]}-${c.vsDef[1]}+` : '', c.vsHero ? 'vs Heroes' : '', c.vsSingle ? 'vs single models' : '',
    c.vsSize ? `vs ${c.vsSize}+ models` : '', c.vsHurt ? 'vs hurt units' : '', c.vsFlying ? 'vs flyers' : '', c.vsAp ? `vs AP(${c.vsAp}+)` : '',
    c.inCover ? 'in cover' : '', c.fromRound ? `from round ${c.fromRound}` : '', c.halfRange ? 'at half range' : '', c.closest ? 'at the closest enemy' : '',
  ];
  const s = bits.filter(Boolean).join(', ');
  return s ? ` (${s})` : '';
};

/** A hook in a few words. */
export function hookText(h: Hook): string {
  switch (h.k) {
    case 'hit': return `${sign(h.n)} to hit${condText(h.c)}`;
    case 'ap': return `AP(${sign(h.n)})${condText(h.c)}`;
    case 'attacks': return `${sign(h.n)} attack${condText(h.c)}`;
    case 'six': return `6s to hit: ${[h.hits && `+${h.hits} hit`, h.ap && `AP(+${h.ap})`, h.wound && `+${h.wound} wound`].filter(Boolean).join(', ')}${condText(h.c)}`;
    case 'reroll': return `${h.six ? 'must re-roll 6s' : 're-roll 1s'} to hit${condText(h.c)}`;
    case 'bane': return `target re-rolls Defense 6s${condText(h.c)}`;
    case 'shred': return `Defense ${h.upTo ? `1-${h.upTo}` : '1'}s take +${h.n} wound`;
    case 'deadly': return `Deadly(${h.n})`;
    case 'blast': return `Blast(${h.n})`;
    case 'reliable': return 'hits on 2+';
    case 'limited': return 'once a game';
    case 'rending': return '6s to hit get AP(+4)';
    case 'noRegen': return 'ignores Regeneration';
    case 'noCover': return 'ignores cover';
    case 'indirect': return 'no line of sight needed';
    case 'takedown': return `${h.sniper ? 'hits on 2+, picks a model' : 'picks a model'}${condText(h.c)}`;
    case 'range': return `+${h.n}" range`;
    case 'carry': return `leftover wounds carry to an enemy within ${h.range}"`;
    case 'soak': return `once a round, ignores ${h.n} wounds`;
    case 'negate': return "once a game, ignores one weapon's wounds";
    case 'lastStand': return `once a game, stays with 1 wound on ${h.on}+`;
    case 'reflect': return `once a round, shots bounce back on ${h.on}+`;
    case 'riposte': return 'melee Defense 6s wound the attackers';
    case 'spellWard': return `enemy spells fail on ${h.on}+`;
    case 'spellproof': return "spells can't touch it; can't cast";
    case 'silenced': return "can't cast or use auras";
    case 'exposed': return 'loses Stealth; friends ignore its cover';
    case 'passOnce': return 'once a game, passes a failed morale test';
    case 'choice': return `picks ${h.a.map(hookText).join(', ')} or ${h.b.map(hookText).join(', ')}`;
    case 'strikeFirst': return 'strikes first when charged';
    case 'unstoppable': return 'ignores negative modifiers';
    case 'blackHole': return `a hit kills models on ${h.on}+`;
    case 'harvest': return 'melee kills heal it and add an attack';
    case 'def': return `${sign(h.n)} to Defense${condText(h.c)}`;
    case 'apIn': return `hits on it AP(${h.n})${condText(h.c)}`;
    case 'hitIn': return `enemies ${sign(h.n)} to hit it${condText(h.c)}`;
    case 'ignore': return `ignores wounds on ${h.on}+${h.spell ? ` (spells ${h.spell}+)` : ''}`;
    case 'cover': return `counts as in cover${condText(h.c)}`;
    case 'weak': return `Defense 1s take +${h.n} wound`;
    case 'shieldPool': return `${h.n}-wound shield, ${h.on}+ ignores`;
    case 'ablative': return 'ignores its first wound each round';
    case 'halve': return 'once a game, halves wounds for a round';
    case 'veil': return `can't be targeted from over ${h.over}" after Hold`;
    case 'shroud': return `shooters -${h.range}" range, chargers -${h.charge}"`;
    case 'move': return `moves ${sign(h.adv)}" / ${sign(h.rush)}"${condText(h.c)}`;
    case 'strider': return 'ignores difficult terrain';
    case 'flying': return 'flies over terrain';
    case 'scout': return 'Scout';
    case 'ambush': return 'Ambush';
    case 'slow': return 'Slow';
    case 'immobile': return "can't move";
    case 'hero': return 'Hero (can join a unit)';
    case 'caster': return `Caster(${h.n})`;
    case 'tough': return `Tough(${sign(h.n)})`;
    case 'impact': return `Impact(${h.n})`;
    case 'impactPer': return `Impact(1) per ${h.models} model${h.models > 1 ? 's' : ''} charging`;
    case 'counter': return 'chargers lose Impact';
    case 'fearless': return 'failed morale passes on 4+';
    case 'morale': return `${sign(h.n)} to morale${condText(h.c)}`;
    case 'steadfast': return 'always passes morale';
    case 'noRout': return 'Shaken instead of Routed';
    case 'noRetreat': return 'never fails morale, takes wounds instead';
    case 'fear': return `Fear(${h.n})`;
    case 'dread': return `enemies in melee ${sign(h.n)} to morale`;
    case 'rushShoot': return 'shoots after Rush';
    case 'hitRun': return `moves ${h.d}" after ${h.shootOnly ? 'shooting' : 'shooting or melee'}`;
    case 'overrun': return `moves ${h.d}" after a melee kill`;
    case 'rally': return 'Shaken: 4+ to act anyway';
    case 'unpredictable': return `random AP(+1) or +1 to hit${h.melee ? ' in melee' : ''}`;
    case 'ravage': return `${h.n} dice in melee, 6s wound`;
    case 'loner': return "can't join units";
    case 'absent': return 'sits the battle out';
    case 'heal': return `${h.at === 'roundStart' ? 'each round' : h.at === 'kill' ? 'on a kill' : 'on activation'}: heals ${h.n} on ${h.who === 'self' ? 'itself' : `a friend within ${h.range}"`}${h.per ? ` (once a ${h.per === 'twice' ? 'game, twice' : h.per})` : ''}`;
    case 'hits': return `${h.n} hit${h.n === 1 ? '' : 's'} AP(${h.ap})${h.rules?.length ? ` ${h.rules.join(' ')}` : ''} on ${h.who === 'enemies' ? 'every enemy' : 'an enemy'} within ${h.range}"${h.at === 'charge' ? ' when charging' : h.at === 'charged' ? ' when charged' : ''}${h.on ? ` on ${h.on}+` : ''}${h.per ? ` (once a ${h.per === 'twice' ? 'game, twice' : h.per})` : ''}`;
    case 'buff': return `${h.mark ? 'marks an enemy' : h.side === 'enemy' ? 'an enemy gets' : h.self ? 'it gets' : 'a friend gets'} ${h.give.map(hookText).join(', ')}${h.range && h.range < 99 ? ` within ${h.range}"` : ''} (${h.until === 'once' ? 'once' : h.until === 'round' ? 'this round' : h.until === 'game' ? 'all game' : 'next activation'})`;
    case 'aura': return `${h.side === 'enemy' ? 'enemies' : 'friends'} within ${h.range}": ${h.give.map(hookText).join(', ')}`;
    case 'terror': return `${h.targets ? 'every enemy' : 'an enemy'} within ${h.range}" tests morale${h.hits ? `, ${h.hits} hits if it fails` : h.pin ? ", can't move if it fails" : ''}`;
    case 'revive': return `back up on ${h.on}+ with ${h.hp} wounds`;
    case 'explode': return `explodes within ${h.range}"`;
    case 'luck': return `${h.n} re-roll${h.n > 1 ? 's' : ''} a round`;
    case 'reposition': return `${h.who === 'self' ? 'moves' : 'moves a friend'} ${h.d}" on activation`;
    case 'steady': return `once a game, rallies a unit within ${h.range}"`;
    case 'none': return `not played: ${h.why}`;
  }
}

export const summarize = (r: RuleDef) => r.hooks.filter((h) => h.k !== 'none').map(hookText).join('; ') || 'Nothing';

export function spellText(s: SpellDef): string {
  if (s.none) return 'Nothing';
  const who = `${s.targets > 1 ? `up to ${s.targets} ` : ''}${s.side === 'enemy' ? 'enemy' : 'friendly'} unit${s.targets > 1 ? 's' : ''} within ${s.range}"`;
  if (s.hits) return `${who}: ${s.hits.n} hits AP(${s.hits.ap})${s.hits.rules?.length ? ` ${s.hits.rules.join(' ')}` : ''}`;
  return `${who}: ${s.mark ? 'friends get ' : ''}${(s.give ?? []).map(hookText).join(', ')}${s.mark ? ' against it' : ''}, once`;
}
