// Homebrew Crusade rules, transcribed from the group's "One Page Rules Upgrade Tables" doc.

export type Category = 'Hero' | 'Infantry' | 'Elite' | 'Vehicle/Monster' | 'Aircraft' | 'Fortification';
export const CATEGORIES: Category[] = ['Hero', 'Infantry', 'Elite', 'Vehicle/Monster', 'Aircraft', 'Fortification'];

export const CATEGORY_HINT: Record<Category, string> = {
  Hero: 'Has [Hero]',
  Infantry: 'Multi-model unit',
  Elite: 'Single model, Tough 9 or less',
  'Vehicle/Monster': 'Tough 6+',
  Aircraft: 'Has [Aircraft]',
  Fortification: 'Has [Immobile]',
};

/** XP needed to reach each level (index 0 = level 1). */
export const LEVEL_THRESHOLDS = [10, 20, 40, 60, 90, 120, 170];
/** Above the last threshold, every this-much XP allows replacing a previous upgrade. */
export const POST_MAX_REPLACE_STEP = 20;

export const MAX_NORMAL_TRAITS = 5;
export const MAX_UNIQUE_TRAITS = 2;
export const MAX_WEAPON_TRAITS = 2;
export const MAX_SCARS = 3;

export const STARTING_SUPPLY = 1000;

export type RelicTier = 'Common' | 'Rare' | 'Legendary';

/** Relic slots by XP: [minXp, slots]. */
export const RELIC_SLOTS: [number, number][] = [
  [0, 0],
  [10, 1],
  [41, 2],
  [60, 3],
  [121, 4],
  [200, 5],
];

/** Minimum XP to take a relic of each tier. */
export const RELIC_TIER_MIN_XP: Record<RelicTier, number> = { Common: 0, Rare: 41, Legendary: 60 };

export interface TableEntry {
  name: string;
  desc?: string;
}

// Descriptions use current OPR wording. Names that match an official rule print the official text in the
// glossary instead (the army book or core rules win), so these are a fallback when those aren't imported.
const FAST_AGAIN = 'If it already has Fast, it moves a further +2" when using Advance and +4" when using Rush/Charge.';
const TOUGH_3 = { name: 'Tough +3', desc: 'Gets Tough(+3): must take 3 more wounds before being killed.' };
const FORTIFIED = { name: 'Fortified', desc: 'When units where all models have this rule take hits, those hits count as having AP(-1), to a min. of AP(0).' };
const NO_RETREAT = {
  name: 'No Retreat',
  desc: "When a unit where most models have this rule fails a morale test that causes it to be Shaken or Routed, the test counts as passed instead. Then, roll as many dice as the number of wounds it would take to fully destroy it, and for each result of 1-3 the unit takes one wound, which can't be ignored.",
};
const AMBUSH = {
  name: 'Ambush',
  desc: 'May be set aside before deployment. At the start of any round after the first, may be deployed anywhere over 9" away from enemy units.',
};
const RELENTLESS = { name: 'Relentless', desc: 'When this model shoots at enemies over 9" away, unmodified results of 6 to hit deal 1 extra hit.' };
const SURGE = { name: 'Surge', desc: 'On unmodified results of 6 to hit, this weapon deals 1 extra hit (only the original hit counts as a 6 for special rules).' };
const QUAKE = { name: 'Quake', desc: 'Ignores Regeneration, and on unmodified results of 1 to block hits, this weapon deals 1 extra wound.' };
const WELL_BALANCED = { name: 'Well Balanced', desc: 'Re-roll results of 1 to hit with this weapon.' };
const DUPLICATE = { name: 'Duplicate', desc: 'Duplicate a trait, or pick from the normal table.' };
const PLUS_A = { name: '+1 A', desc: 'This weapon gets +1 attack.' };
const PLUS_AP = { name: '+1 AP', desc: 'This weapon gets AP(+1).' };

/** Regular unit trait tables (d6). Infantry has two branches. */
export const TRAIT_TABLES: Record<string, TableEntry[]> = {
  Hero: [
    { name: 'Aura of Blinding', desc: 'Enemy units within 9" of this model get -1 to hit rolls when shooting.' },
    { name: 'Aura of Swiftness', desc: 'This model and its unit get Fast.' },
    { name: 'Quick Shot', desc: 'This model may shoot after using Rush actions.' },
    { name: 'Takedown Strike', desc: 'Once per game, when in melee, this model makes 1 extra attack with Reliable, AP(1), Deadly(3) and Takedown.' },
    { name: 'March Order', desc: 'Pick one friendly unit within 12", which may move up to 6".' },
    TOUGH_3,
  ],
  'Infantry (Utility)': [
    { name: 'Fast', desc: 'Moves +2" when using Advance, and +4" when using Rush/Charge.' },
    { name: 'Stealth', desc: 'When units where all models have this rule are shot from over 9" away, enemy units get -1 to hit rolls.' },
    FORTIFIED,
    { name: 'Strider', desc: 'May ignore the effects of difficult terrain when moving.' },
    { name: 'Scout', desc: 'May be set aside before deployment. After all other units are deployed, may be deployed anywhere fully within 12" of their deployment zone.' },
    { name: 'Regeneration', desc: 'When a unit where all models have this rule takes wounds, roll one die for each. On a 5+ it is ignored.' },
  ],
  'Infantry (Aggressive)': [
    { name: 'Trench Warfare', desc: 'While this unit is in ruins, its weapons get Ignores Cover.' },
    { name: 'Furious', desc: 'When charging, unmodified results of 6 to hit in melee deal 1 extra hit.' },
    RELENTLESS,
    { name: 'Mutations', desc: 'Roll one die: on a 1-3 its attacks get Rending, on a 4-6 they get AP(+1).' },
    AMBUSH,
    { name: 'Devour', desc: 'On unmodified results of 6 to hit in melee, the target also takes 1 wound.' },
  ],
  Elite: [
    NO_RETREAT,
    TOUGH_3,
    FORTIFIED,
    { name: 'Caster +1', desc: 'Gets Caster(1), or +1 to its Caster value.' },
    AMBUSH,
    RELENTLESS,
  ],
  'Vehicle/Monster': [
    { name: 'AP +1 when holding', desc: 'After using a Hold action, its weapons get AP(+1) when shooting.' },
    NO_RETREAT,
    { name: 'Precision Shooting Mark', desc: 'Once per activation, before attacking, pick one enemy unit within 18" in line of sight, which friendly units get +1 to hit rolls when shooting against once.' },
    { name: 'Fast', desc: `Gets Fast. ${FAST_AGAIN}` },
    { name: 'Auto-Repair', desc: 'When activated, remove 1 wound from this model.' },
    TOUGH_3,
  ],
  Aircraft: [
    { name: 'Evasive', desc: 'Enemies get -1 to hit rolls when attacking units where all models have this rule.' },
    { name: 'Air Break', desc: 'Once per game, when using an Advance action, this model may add anything from 0" to 30" to its move instead of the full 30".' },
    { name: 'Strafing Run', desc: 'Gets AP(+2) when shooting at the closest enemy unit.' },
    { name: 'Covering Fire', desc: "Pick one enemy unit hit by this model's shooting, which gets Slow until the end of its next activation." },
    { name: 'Assault Bomb', desc: 'When moving over enemy units, pick one of them. On a 2+ it takes 3 hits with AP(1).' },
    { name: 'Hover', desc: 'May turn up to 90° once, halfway through its move.' },
  ],
  Fortification: [
    { name: 'Deploy Cover', desc: 'Friendly units in cover from this model get +1 to Defense rolls, and enemies get -1 to hit rolls against them.' },
    { name: 'Protected', desc: 'When a unit where all models have this rule takes wounds, roll one die for each. On a 6+ it is ignored.' },
    { name: 'Overwatch', desc: 'Once per round, may shoot the first enemy unit that moves within 24", hitting on 6+.' },
    { name: 'Battlements', desc: 'When charged, on a 2+ the charging unit takes 3 hits with AP(1).' },
    { name: 'Orbital Drop', desc: `Works like Ambush, but can't be deployed within 3" of terrain.` },
    TOUGH_3,
  ],
};

export const UNIQUE_TRAIT_TABLES: Record<Category, TableEntry[]> = {
  Hero: [
    { name: 'Extreme Motivation', desc: 'This model always passes morale tests.' },
    { name: 'Crazed', desc: 'Gets +1 attack with melee weapons when charging.' },
    { name: 'Bitter Rivalry', desc: 'Gets +1 to hit rolls and AP(+1) against enemy Heroes.' },
    { name: 'Toughened Scars', desc: 'Once per round, may re-roll one failed Defense roll.' },
    { name: 'Swift', desc: `This model and its unit get Fast. ${FAST_AGAIN}` },
    { name: 'Heroic Presence', desc: 'Friendly units within 12" ignore wounds on a 6+.' },
  ],
  Infantry: [
    { name: 'Ghostly', desc: 'This unit gets Strider and Stealth, and ignores wounds on a 6+.' },
    { name: 'Heavy Training', desc: 'This unit gets Impact(+1) for every 2 models, up to 10 Impact in total.' },
    { name: 'Berserkers', desc: 'Enemy units in melee with this unit get -1 to morale test rolls.' },
    { name: 'Specialists', desc: 'Gets +1 to hit rolls in melee or when shooting (pick one).' },
    { name: 'Resilient', desc: 'Gets +1 to Defense rolls.' },
    { name: 'Lucky', desc: 'Once per round, may re-roll one die of any kind.' },
  ],
  Elite: [
    { name: 'Impact +3', desc: 'Gets Impact(+3).' },
    { name: 'Counter in melee / Rending when shooting', desc: 'Pick one: its melee weapons get Counter, or its ranged weapons get Rending.' },
    { name: 'Fear +3', desc: 'Gets Fear(+3): counts as having dealt +3 wounds when checking who won melee.' },
    { name: 'Inspiring Aura', desc: 'When activated, pick one friendly unit within 9", which gets +1 to its next hit roll.' },
    { name: 'Enhanced', desc: 'Gets Fortified and Tough(+3).' },
    { name: 'Elite', desc: 'Re-roll results of 1 to hit in melee or when shooting (pick one).' },
  ],
  'Vehicle/Monster': [
    { name: 'Transport +6', desc: 'Gets Transport(+6).' },
    { name: 'Flying + Fast', desc: 'Gets Flying and Fast.' },
    { name: 'Impact +6', desc: 'Gets Impact(+6).' },
    { name: 'Quick Shot', desc: 'This model may shoot after using Rush actions.' },
    { name: 'Bulldoze', desc: 'Once per game, may destroy one piece of medium or smaller terrain by moving through it.' },
    AMBUSH,
  ],
  Aircraft: [
    { name: 'Explosive Exit', desc: 'When this model is destroyed, pick a point anywhere on the table. Each unit within 9" of it rolls one die per model (up to 1 model per Tough), and takes 1 wound for each 1.' },
    { name: 'Sky Suppression', desc: 'Enemy units within 18" of this model get -1 to morale test rolls.' },
    { name: 'Combat Turn', desc: 'If its move would take it off the table, it may instead turn by any angle at the table edge and continue moving.' },
    { name: 'Supply Drop', desc: 'When moving over friendly units, pick up to 3 of them, which each remove D3 wounds.' },
    { name: 'Ignores Cover', desc: "This model's ranged weapons ignore cover." },
    { name: 'Aerial Scan', desc: 'When activated, pick any enemy unit. Friendly units get +1 to hit rolls the next time they attack it.' },
  ],
  Fortification: [
    { name: 'Sensor Array', desc: 'Friendly units within 6" of this model get +6" range.' },
    { name: 'Command Bastion', desc: 'When activated, gain 1 re-roll that may be used at any point to re-roll any one die.' },
    { name: 'Enhanced Orbital Drop', desc: 'Works like Ambush, and when deployed may destroy one piece of medium or smaller terrain. Enemy units within 9" of where it lands must take a dangerous terrain test.' },
    { name: 'Shield Generator', desc: 'Gets a Tough(3) shield with Regeneration, which must be destroyed before this model can take wounds.' },
    { name: 'Repair Bay', desc: 'When activated, pick one friendly unit within 9", which removes D6 wounds.' },
    { name: 'Psychic Barrier', desc: 'Enemy casters within 24" of this model get -1 to casting rolls, and take 1 wound for each failed cast.' },
  ],
};

export const WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    { name: 'First Strike', desc: 'The first attack with this weapon gets Deadly(3).' },
    PLUS_A,
    PLUS_AP,
    { name: 'Counter', desc: 'Strikes first with this weapon when charged, and the charging unit gets -1 total Impact rolls per model with Counter.' },
    { name: 'Thrust', desc: 'When charging, gets +1 to hit rolls and AP(+1) in melee.' },
    { name: 'Rending', desc: 'Ignores Regeneration, and on unmodified results of 6 to hit, those hits get AP(+4).' },
  ],
  Ranged: [
    { name: '+6" range', desc: 'This weapon gets +6" range.' },
    PLUS_A,
    PLUS_AP,
    { name: 'Unstoppable', desc: 'Ignores Regeneration, and ignores all negative modifiers to this weapon.' },
    { name: 'Takedown', desc: 'May pick any model in the target unit as its individual target, which is resolved as if it was a unit of 1.' },
    SURGE,
  ],
};

export const UNIQUE_WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    QUAKE,
    { name: 'Bane', desc: 'Ignores Regeneration, and when attacking the target must re-roll unmodified Defense results of 6.' },
    { name: 'Bleed', desc: 'Units hit by this weapon must take a dangerous terrain test the next time they move.' },
    SURGE,
    WELL_BALANCED,
    DUPLICATE,
  ],
  Ranged: [
    QUAKE,
    { name: 'Indirect', desc: 'Gets -1 to hit rolls when shooting after moving. May target enemies that are not in line of sight, and ignores cover from sight obstructions.' },
    { name: 'Slowing Strike', desc: 'Units hit by this weapon get Slow until the end of their next activation.' },
    { name: 'Demolish', desc: 'Ignores Cover, and against units where most models have Tough(3) to Tough(9), this weapon gets AP(+2).' },
    WELL_BALANCED,
    DUPLICATE,
  ],
};

/** Battle scars (d10). */
export const SCAR_TABLE: TableEntry[] = [
  { name: 'Crippling Injury', desc: 'Gets Slow. If it already has Slow, it moves a further -2" when using Advance and -4" when using Rush/Charge.' },
  { name: 'Damaged Equipment', desc: 'Gets -1 to hit rolls when shooting.' },
  { name: 'Weakened Armor', desc: 'Gets -1 to Defense rolls.' },
  { name: 'Weak Spot', desc: 'On unmodified Defense results of 1, takes 1 extra wound.' },
  { name: 'Faulty Aim', desc: 'Must re-roll unmodified results of 6 to hit.' },
  { name: 'Fear of Death', desc: 'Gets -1 to morale test rolls.' },
  { name: 'Dishonorable', desc: 'Can no longer join another unit.' },
  { name: 'Weakened Muscles', desc: 'Gets -1 to hit rolls in melee.' },
  { name: 'Lowered Constitution', desc: 'Future death rolls use 2 dice.' },
  { name: 'Comatose', desc: 'No scar, but sits out the next game.' },
];

export interface RelicDef {
  name: string;
  tier: RelicTier;
  profile?: string;
  note?: string;
  desc?: string;
  nexus?: boolean;
}

export const RELICS: RelicDef[] = [
  { name: 'Common Weapon (Surge)', tier: 'Common', desc: 'Pick one non-relic weapon, which gets Surge.' },
  { name: 'Artisan Bionics', tier: 'Common', desc: 'Gets Protected.' },
  { name: 'Conversion Field', tier: 'Common', desc: 'Gets +1 to Defense rolls against melee attacks. Once per melee, when it blocks a hit with an unmodified 6, the closest enemy unit within 1" takes 1 wound.' },
  { name: 'Disruption Shielding', tier: 'Common', desc: "Once per game, when this unit takes wounds, ignore all wounds from one weapon's attacks." },
  { name: 'Terminus Eye', tier: 'Common', profile: '9", A1, AP(3), Deadly(3)' },
  { name: 'Fang of the River Goul', tier: 'Common', profile: 'Melee, A6, AP(2), Demolish' },
  { name: "Shadow's Touch", tier: 'Common', profile: 'Melee, A3, AP(1), Quake', note: 'Casters only' },
  { name: 'Graviton Handcannon', tier: 'Common', profile: '18", A2, AP(2), Deadly(3), Ignores Cover' },
  { name: 'Dark Age Grenade Belt', tier: 'Common', profile: '12", A1, AP(1), Blast(6), Limited' },
  { name: 'Dark Age Jump Pack', tier: 'Common', desc: 'Gets Flying.' },
  { name: 'Temporal Displacer Gauntlet', tier: 'Common', desc: 'Once per activation, pick one enemy unit within 12". On a 4+ it gets -1 to hit rolls until the end of the round.' },
  { name: 'Null Zone Projector', tier: 'Common', desc: 'All casting rolls within 12" get -1, including friendly ones. If the bearer is destroyed, the area stays until the end of the game.' },
  { name: 'Nanite Infusion Injector', tier: 'Common', desc: 'When activated, remove 1 wound from this model or a friendly unit within 3". This can bring back a model without Tough.' },
  { name: 'Dimensional Anchor', tier: 'Rare', desc: `Once per game, pick one enemy unit within 18", which must take a morale test. If it fails, it can't move until the end of the round.` },
  { name: 'Ethereal Capacitor', tier: 'Rare', desc: 'Ignores wounds on a 6+. If it already ignores wounds (like Protected), it does so on a 5+ instead.' },
  { name: 'Archeotech Nano-med', tier: 'Rare', desc: 'The first time this model is killed, roll one die at the end of that activation. On a 2+ set it back up as close as possible to where it was, with D3 wounds remaining.' },
  { name: 'Dark Age Displacer Belt', tier: 'Rare', desc: 'Instead of moving, this model may be placed anywhere on the table over 9" away from enemy units.' },
  { name: 'Enhanced Eye', tier: 'Rare', desc: 'Once per activation, pick one ranged weapon, which gets Takedown when shooting.' },
  { name: 'Xenotech Digital Laser', tier: 'Rare', profile: '12", A2, AP(4), Beam' },
  { name: 'Unstable Matter Projector', tier: 'Rare', desc: 'This unit moves 2D6+6" when using Advance, and gets Strider and Flying while doing so.' },
  { name: 'Archeotech Combat Restoratives', tier: 'Rare', desc: 'When activated, remove D3+1 wounds from this model or a friendly unit within 6". Can bring back a model if it is healed to full (e.g. a Tough(3) model needs 3 wounds removed).' },
  { name: 'Mobius Repeater', tier: 'Rare', desc: "Wounds from this model's attacks can carry over into one additional unit." },
  { name: 'Null-field Disruptor', tier: 'Rare', desc: 'Enemy units within 9" get -1 to hit rolls, and friendly units within 9" get +1 to hit rolls.' },
  { name: 'Vortex Grenade', tier: 'Rare', profile: '12", A1, AP(4), Deadly(3), Blast(3), Limited' },
  { name: 'Chrono-Phase Blade', tier: 'Legendary', profile: 'Melee, A4, AP(4), Temporal Rift' },
  { name: 'Soulforge Glaive', tier: 'Legendary', profile: 'Melee, A D3+1, AP(3), Soul Harvest' },
  { name: 'Nanite Hive Field', tier: 'Legendary', desc: 'Once per game, when activated, this model and up to D3 friendly models within 9" each remove 3 wounds and get Regeneration until the end of the round. Models that already have Regeneration ignore wounds on a 4+ instead.' },
  { name: 'Singularity Cannon', tier: 'Legendary', profile: '36", A1, AP(4), Limited, Black Hole' },
  { name: 'Chrono-Disruptor Matrix', tier: 'Legendary', desc: `Once per game, when activated: until the end of the round, enemy units within 12" can't move or charge.` },
  { name: 'Celestial Nullification Matrix', tier: 'Legendary', desc: 'Once per game: until the end of the round, enemy units within 12" get -1 to Defense rolls and -1 to casting rolls, and take 3 wounds for each failed cast in that area.' },
  // Nexus Wars relics
  { name: 'Shadesplinter Cloak', tier: 'Common', nexus: true, desc: 'After this model and its unit use an Advance action, they count as being in cover.' },
  { name: 'Umbra Echo Plating', tier: 'Common', nexus: true, desc: 'When activated, remove 1 wound from this model.' },
  { name: 'Warp-infusion', tier: 'Common', nexus: true, desc: 'Pick one non-relic melee weapon, which gets Quake.' },
  { name: 'Blackstone Shard Amulet', tier: 'Rare', nexus: true, desc: "This model's unit can't be targeted or affected by spells, and can't cast spells." },
  { name: 'Ancient Quantum Shielding', tier: 'Rare', nexus: true, desc: 'When blocking melee hits, for each unmodified 6 the attacking unit takes 1 wound.' },
  { name: 'Umbra Claw', tier: 'Rare', profile: 'Melee, A6, AP(1), Bane', nexus: true },
  { name: 'Oblivion Orb', tier: 'Legendary', nexus: true, desc: 'Once per game, pick a point within 24". Roll one die for each unit, friend or foe, within 6" of it; on a 4+ that unit takes D6 hits with AP(2).' },
  { name: 'Nexus Resonator', tier: 'Legendary', nexus: true, desc: 'Once per game, when activated, every enemy unit within 12" takes 3 hits with AP(1).' },
];

/** Homebrew special rules used in relic weapon profiles. */
export const RELIC_WEAPON_RULES: TableEntry[] = [
  { name: 'Beam', desc: 'On unmodified results of 6 to hit, this weapon deals 2 extra hits (only the original hit counts as a 6 for special rules).' },
  { name: 'Temporal Rift', desc: 'Each time this weapon wounds a target, roll one die. On a 5+, at the end of that melee the target is moved to a random quarter of the table, over 9" away from enemy units.' },
  { name: 'Soul Harvest', desc: 'Each time this weapon kills an enemy model in melee, remove 1 wound from the bearer, and this weapon gets +1 attack for the rest of the game.' },
  { name: 'Black Hole', desc: 'Roll one die for each model in the target unit. On a 6 that model is killed.' },
];

export const NEXUS_TRAITS: Record<Category, TableEntry[]> = {
  Hero: [
    { name: 'Shadowmeld', desc: 'This model and its unit get Stealth.' },
    { name: 'Chrono-Distortion', desc: 'Gets +1 to Defense rolls against shooting, and +1 to hit rolls in melee.' },
    { name: 'Voidwalk', desc: 'This model and its unit get Bounding: when activated, they may first be placed anywhere within D3+1" of their position.' },
  ],
  Infantry: [
    { name: 'Umbral Veil', desc: `After using a Hold action, this unit can't be targeted from over 18" away until the end of the round.` },
    { name: 'Temporal Surge', desc: 'Once per game, for one activation this unit moves +2" when using Advance and +4" when using Rush/Charge.' },
  ],
  Elite: [
    { name: 'Shard Infusion', desc: 'After it destroys an enemy unit in melee, it gets +1 to hit rolls when shooting. After it destroys one by shooting, it gets +1 to hit rolls in melee.' },
    { name: 'Shroud of Despair', desc: 'Twice per game, when activated, pick one enemy unit within 12", which must take a morale test. If it fails, it takes 3 hits.' },
  ],
  'Vehicle/Monster': [
    { name: 'Shadowbound', desc: 'Once per game, when targeted by an enemy, this model takes half the wounds it would (rounding up, min. 1) until the end of the round.' },
    { name: 'Nexus Amplification', desc: 'Once per round, may re-roll one failed hit or Defense roll.' },
  ],
  Aircraft: [
    { name: 'Umbral Bombardment', desc: 'Gets AP(+1) when attacking enemy units within 18" of this model.' },
    { name: 'Warp-Engine', desc: 'Once per game, when activated, may first be placed at any table edge, then continues its activation as normal.' },
  ],
  Fortification: [
    { name: 'Warp-Anchor', desc: `Gets Repel Ambushers (enemy units using Ambush must be set up over 12" away from this model's unit), and enemy casters within 18" get -1 to casting rolls.` },
    { name: 'Nexus Resonance', desc: 'Friendly units within 12" get +1 to morale test rolls, and enemy units within 12" get -1.' },
  ],
};

export interface Requisition {
  name: string;
  cost: number;
  desc: string;
}

export const REQUISITIONS: Requisition[] = [
  { name: 'Increase Supply', cost: 1, desc: 'Increase the Supply Limit (amount set in Settings).' },
  { name: 'Rearm', cost: 1, desc: 'Replace weapons/equipment; the unit keeps its XP.' },
  { name: 'Remove a Scar', cost: 1, desc: 'Remove one battle scar from a unit.' },
  { name: 'Retraining', cost: 1, desc: 'Swap one upgrade for another from the same table.' },
  { name: 'Elite Reinforcements', cost: 1, desc: 'A new unit starts at 10 XP.' },
  { name: 'Off Duty Training', cost: 1, desc: 'Unit gains 6D3 XP, then roll: 1 = scar, 2-5 = +1 XP, 6 = +3 XP.' },
  { name: 'Additional Agenda', cost: 1, desc: 'Take one extra agenda this battle.' },
  { name: 'Heroic Rise', cost: 2, desc: 'Non-hero Tough(1) infantry gains a relic slot and Tough(3), +1 CP.' },
  { name: 'Common Relic', cost: 1, desc: 'Acquire a Common relic.' },
  { name: 'Rare Relic', cost: 3, desc: 'Acquire a Rare relic.' },
  { name: 'Legendary Relic', cost: 5, desc: 'Acquire a Legendary relic.' },
  { name: 'Unit Evolution', cost: 2, desc: 'Transfer XP to a new unit.' },
];

// ---- Battles (Gaining Experience, Agendas, Requisitions, Deaths) ----

/** XP each participating unit gains for playing. */
export const PARTICIPATION_XP = 2;
/** Participation XP when playing without agendas. */
export const NO_AGENDA_XP = 3;
/** Marked for Greatness bonus. */
export const MARKED_XP = 3;
/** RP every force gains for playing a match. */
export const BATTLE_RP = 1;
export const MAX_AGENDAS = 2;

export interface Agenda {
  name: string;
  desc: string;
  special?: boolean;
}

export const AGENDAS: Agenda[] = [
  { name: 'Recover Supplies', desc: 'Extra objective; up to 3 units controlling it at the end gain 1 XP (own zone), 3 (no man\'s land) or 6 (enemy zone).' },
  { name: 'Kill their Leaders', desc: 'Any Hero destroyed is worth 3 extra XP.' },
  { name: 'Crush the Weak', desc: 'Every 5 models destroyed gains 2 extra XP.' },
  { name: 'Capture their Ranks', desc: 'Every unit you Rout gains 3 XP.' },
  { name: 'Growth Through Bloodshed', desc: 'One scarred unit: if it destroys an enemy character it gains 5 XP and loses a scar.' },
  { name: 'Survivor', desc: 'Up to 3 units: if they survive to the end they gain 5 XP.' },
  { name: 'Bravery in the Face of Defeat', desc: 'Every morale test passed gains 2 XP.' },
  { name: 'Establish a Foothold', desc: 'Pick a no man\'s land objective; if held at the end, up to 3 units on it gain 3 XP.' },
  { name: 'Priority Target', desc: 'Random objective each round; units on it at round end gain 3 XP. Complete 3 times for +1 RP.', special: true },
  { name: 'Recover Supplies (action)', desc: 'Units completing the action on an objective gain 2 XP. Half the objectives activated: +1 RP.', special: true },
  { name: 'Risky Gamble', desc: 'Win: 12 XP to distribute and +1 RP. Lose: no participation XP.', special: true },
  { name: 'Overwhelming Victory', desc: 'Hold every objective or destroy every enemy: up to 3 units gain 5 XP, and +1 RP.', special: true },
];

/** Who a reward's XP can go to. */
export type XpTarget = 'any' | 'survivor' | 'holder' | 'dead';

export interface RewardEntry {
  text: string;
  rp?: number;
  supply?: number;
  xp?: number;
  /** 'any' is a pool to distribute; the others go to a single unit. */
  xpTarget?: XpTarget;
  /** Remove a scar: 'battle' = one gained this battle, 'any' = any scar. */
  removeScar?: 'battle' | 'any';
  /** Free upgrade / relic applied on the unit sheet. */
  free?: string;
  /** Roll on this sub-table too. */
  subtable?: RewardTableKey;
}

export type RewardTableKey = 'winner' | 'winnerSpecial' | 'loser' | 'suffering' | 'ai' | 'aiSpecial';

export const REWARD_TABLES: Record<RewardTableKey, { label: string; entries: RewardEntry[] }> = {
  winner: {
    label: 'Winners table',
    entries: [
      { text: '6 XP to distribute; undo one scar from this battle', xp: 6, xpTarget: 'any', removeScar: 'battle' },
      { text: '+100 Supply Limit', supply: 100 },
      { text: '+150 Supply Limit', supply: 150 },
      { text: '1 extra RP', rp: 1 },
      { text: '+1 RP and +50 Supply Limit', rp: 1, supply: 50 },
      { text: 'Roll on the special table', subtable: 'winnerSpecial' },
    ],
  },
  winnerSpecial: {
    label: 'Winners special table',
    entries: [
      { text: '+1 RP and +100 Supply Limit', rp: 1, supply: 100 },
      { text: '+1 RP and remove 1 scar', rp: 1, removeScar: 'any' },
      { text: 'Free upgrade', free: 'Free upgrade' },
      { text: 'Free weapon upgrade', free: 'Free weapon upgrade' },
      { text: 'Gain a Common relic', free: 'Common relic' },
      { text: 'Gain a Rare relic', free: 'Rare relic' },
    ],
  },
  loser: {
    label: 'Losers table',
    entries: [
      { text: 'Undo one scar from this battle (re-roll if none)', removeScar: 'battle' },
      { text: '6 XP to a survivor', xp: 6, xpTarget: 'survivor' },
      { text: '6 XP to a unit holding a point at the end', xp: 6, xpTarget: 'holder' },
      { text: '10 XP to a unit that died this battle', xp: 10, xpTarget: 'dead' },
      { text: '+150 Supply Limit', supply: 150 },
      { text: '1 extra RP', rp: 1 },
    ],
  },
  suffering: {
    label: 'Growth Through Suffering',
    entries: [
      { text: '2 XP to distribute', xp: 2, xpTarget: 'any' },
      { text: '2 XP to distribute', xp: 2, xpTarget: 'any' },
      { text: '4 XP to distribute', xp: 4, xpTarget: 'any' },
      { text: '4 XP to distribute', xp: 4, xpTarget: 'any' },
      { text: '6 XP to distribute', xp: 6, xpTarget: 'any' },
      { text: '8 XP to distribute', xp: 8, xpTarget: 'any' },
    ],
  },
  ai: {
    label: 'AI table',
    entries: [
      { text: '3 XP to a survivor', xp: 3, xpTarget: 'survivor' },
      { text: '3 XP to distribute', xp: 3, xpTarget: 'any' },
      { text: '6 XP to distribute', xp: 6, xpTarget: 'any' },
      { text: '6 XP to a unit holding a point at the end', xp: 6, xpTarget: 'holder' },
      { text: '+50 Supply Limit', supply: 50 },
      { text: 'Roll on the special table', subtable: 'aiSpecial' },
    ],
  },
  aiSpecial: {
    label: 'AI special table',
    entries: [
      { text: 'Remove 1 scar', removeScar: 'any' },
      { text: '+1 RP', rp: 1 },
      { text: '+50 Supply Limit', supply: 50 },
      { text: '+100 Supply Limit', supply: 100 },
      { text: '8 XP to distribute', xp: 8, xpTarget: 'any' },
      { text: '+1 RP and +50 Supply Limit', rp: 1, supply: 50 },
    ],
  },
};

/** Every this-many BP the winner has over the loser earns another Growth Through Suffering roll. */
export const SUFFERING_BP_STEP = 5;
/** Scar whose owner rolls two dice for future death rolls. */
export const LOWERED_CONSTITUTION = 'Lowered Constitution';
