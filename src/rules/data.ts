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
const QUAKE = { name: 'Quake', desc: 'Ignores Regeneration, and on unmodified results of 1 or 2 to block hits, this weapon deals 1 extra wound.' };
const WELL_BALANCED = { name: 'Well Balanced', desc: 'This weapon gets +1 to hit rolls, and re-rolls unmodified results of 1 to hit.' };
const DUPLICATE = { name: 'Duplicate', desc: 'Copies another trait on this weapon, stacking where it can (e.g. +1 A becomes +2 A). With nothing to copy, pick from the normal table instead.' };
const PLUS_A = { name: '+1 A', desc: 'This weapon gets +1 attack.' };
const PLUS_AP = { name: '+1 AP', desc: 'This weapon gets AP(+1).' };

/** Regular unit trait tables (d10). Infantry has two branches. */
export const TRAIT_TABLES: Record<string, TableEntry[]> = {
  Hero: [
    { name: 'Aura of Blinding', desc: 'Enemy units within 9" of this model get -1 to hit rolls when shooting.' },
    { name: 'Aura of Swiftness', desc: 'This model and its unit get Fast.' },
    { name: 'Quick Shot', desc: 'This model may shoot after using Rush actions.' },
    { name: 'Takedown Strike', desc: 'Once per round, when in melee, this model makes 1 extra attack with Reliable, AP(1), Deadly(3) and Takedown.' },
    { name: 'March Order', desc: 'When activated, pick one other friendly unit within 12", which may immediately move up to 3" (not into melee).' },
    TOUGH_3,
    { name: 'Rallying Cry', desc: 'Friendly units within 12" of this model get +1 to morale test rolls.' },
    { name: 'Blade Master', desc: "This model's melee weapons get AP(+1)." },
    { name: 'Veteran Instincts', desc: 'After using a Hold action, this model and its unit get +1 to hit rolls when shooting in that same activation.' },
    { name: 'Field Medic', desc: "When activated, this model's unit removes 1 wound." },
  ],
  'Infantry (Utility)': [
    { name: 'Fast', desc: 'Moves +2" when using Advance, and +4" when using Rush/Charge.' },
    { name: 'Stealth', desc: 'When units where all models have this rule are shot from over 9" away, enemy units get -1 to hit rolls.' },
    FORTIFIED,
    { name: 'Strider', desc: 'May ignore the effects of difficult terrain when moving.' },
    { name: 'Scout', desc: 'May be set aside before deployment. After all other units are deployed, may be deployed anywhere fully within 12" of their deployment zone.' },
    { name: 'Regeneration', desc: 'When a unit where all models have this rule takes wounds, roll one die for each. On a 5+ it is ignored.' },
    { name: 'Skirmishers', desc: 'After shooting in its own activation, this unit may immediately move up to 3" (not into melee).' },
    { name: 'Spotters', desc: 'When activated, pick one enemy unit within 24" in line of sight. The next friendly unit that shoots at it this round gets +1 to hit rolls.' },
    { name: 'Dug In', desc: 'After using a Hold action, gets +1 to Defense rolls until its next activation.' },
    { name: 'Brace for Impact', desc: 'Gets +1 to Defense rolls in melee when it is charged.' },
  ],
  'Infantry (Aggressive)': [
    { name: 'Trench Warfare', desc: 'While this unit is in cover terrain, its shooting ignores the cover of the units it targets, and it gets +1 to hit rolls in melee.' },
    { name: 'Furious', desc: 'When charging, unmodified results of 6 to hit in melee deal 1 extra hit.' },
    RELENTLESS,
    { name: 'Mutations', desc: 'When this trait is gained, roll one die and note the result: on a 1-3 all its weapons get Rending, on a 4-6 all its weapons get AP(+1).' },
    AMBUSH,
    { name: 'Devour', desc: 'On unmodified results of 6 to hit in melee, the target also takes 1 wound.' },
    { name: 'Bloodthirsty', desc: 'Gets +1 to hit rolls in melee against enemy units that are Shaken, or that have fewer than half of their starting models (single models: fewer than half their Tough left).' },
    { name: 'Hammer Blow', desc: 'When charging, its melee weapons get AP(+1).' },
    { name: 'Point Blank', desc: 'Gets +1 to hit rolls when shooting at enemy units within 6" of it.' },
    { name: 'Overrun', desc: 'After destroying a unit in melee, may immediately move up to 6" (not into melee).' },
  ],
  Elite: [
    NO_RETREAT,
    TOUGH_3,
    FORTIFIED,
    { name: 'Caster +1', desc: 'Gets Caster(1), or +1 to its Caster value.' },
    AMBUSH,
    RELENTLESS,
    { name: 'Precise Strikes', desc: 'In melee and when shooting, its unmodified results of 6 to hit get AP(+2).' },
    { name: 'Iron Discipline', desc: 'Gets +1 to morale test rolls, and when it would be Routed it is Shaken instead.' },
    { name: 'Tank Hunters', desc: 'Gets AP(+1) against units with Tough(6) or more.' },
    { name: 'Rapid Redeploy', desc: 'Once per game, when activated, may be placed anywhere fully within 12" of its position and over 9" from enemy units. It may then only use a Hold action.' },
  ],
  'Vehicle/Monster': [
    { name: 'AP +1 when holding', desc: 'After using a Hold action, its weapons get AP(+1) when shooting.' },
    NO_RETREAT,
    { name: 'Precision Shooting Mark', desc: 'Once per activation, before attacking, pick one enemy unit within 18" of this model and in line of sight. The next friendly unit that shoots at it this round gets +1 to hit rolls.' },
    { name: 'Fast', desc: `Gets Fast. ${FAST_AGAIN}` },
    { name: 'Auto-Repair', desc: 'When activated, remove 1 wound from this model.' },
    TOUGH_3,
    { name: 'Armoured Prow', desc: 'Gets +1 to Defense rolls in melee.' },
    { name: 'Targeting Array', desc: 'Re-rolls unmodified results of 1 to hit when shooting.' },
    { name: 'Trample', desc: 'After this model finishes a charge move, before anyone strikes, each enemy unit in base contact with it takes D3 hits with AP(1).' },
    { name: 'Smoke Launchers', desc: 'Once per game, when activated, this model counts as being in cover against shooting until the start of its next activation.' },
  ],
  Aircraft: [
    { name: 'Evasive', desc: 'Enemies get -1 to hit rolls when attacking units where all models have this rule.' },
    { name: 'Air Break', desc: 'When using an Advance action, this model may add anything from 0" to 30" to its move instead of the full 30".' },
    { name: 'Strafing Run', desc: 'Its ranged weapons get AP(+2) when shooting at the enemy unit closest to this model (pick one if tied).' },
    { name: 'Covering Fire', desc: 'Once per activation, after shooting, pick one enemy unit this model hit. It gets Slow until the end of its next activation.' },
    { name: 'Assault Bomb', desc: 'Once per activation, after moving over enemy units, pick one of them and roll one die. On a 2+ it takes 3 hits with AP(1).' },
    { name: 'Hover', desc: 'May turn up to 90° once, halfway through its move.' },
    { name: 'Armoured Cockpit', desc: 'Gets +1 to Defense rolls against shooting from over 12" away.' },
    { name: 'Flare Countermeasures', desc: 'Once per round, when this model is shot at, the attacking unit gets -1 to hit rolls for that attack.' },
    { name: 'Low Pass', desc: 'Gets +1 to hit rolls when shooting at units it moved over this activation.' },
    { name: 'Escort Wing', desc: 'When activated, pick one friendly unit within 12" of this model. Until this model activates again, enemy units shooting at that unit from over 12" away (measured from the shooter to that unit) get -1 to hit rolls.' },
  ],
  Fortification: [
    { name: 'Deploy Cover', desc: 'Friendly units within 3" of this model get +1 to Defense rolls against shooting, and enemy units get -1 to hit rolls when shooting at them.' },
    { name: 'Protected', desc: 'When a unit where all models have this rule takes wounds, roll one die for each. On a 6+ it is ignored.' },
    { name: 'Overwatch', desc: 'Once per round, when an enemy unit ends a move within 24" of this model and in line of sight, this model may shoot it with all its ranged weapons at -1 to hit. This is on top of its own activation.' },
    { name: 'Battlements', desc: 'When charged, on a 2+ the charging unit takes 3 hits with AP(1).' },
    { name: 'Orbital Drop', desc: `Works like Ambush, but can't be deployed within 3" of terrain.` },
    TOUGH_3,
    { name: 'Ablative Plating', desc: 'Ignores the first wound it takes each round.' },
    { name: 'Overlook', desc: 'Friendly units within 6" of this model get +1 to hit rolls when shooting at enemy units over 12" away from them.' },
    { name: 'Ammo Cache', desc: 'Friendly units that start their activation within 6" of this model re-roll unmodified results of 1 to hit when shooting.' },
    { name: 'Mined Approaches', desc: 'When an enemy unit ends a move within 6" of this model, it must take a dangerous terrain test. Each enemy unit takes this test at most once per round.' },
  ],
};

export const UNIQUE_TRAIT_TABLES: Record<Category, TableEntry[]> = {
  Hero: [
    { name: 'Extreme Motivation', desc: 'This model always passes morale tests.' },
    { name: 'Crazed', desc: 'Each of its melee weapons gets +1 attack when it charges.' },
    { name: 'Bitter Rivalry', desc: 'Gets +1 to hit rolls and AP(+1) against enemy Heroes.' },
    { name: 'Toughened Scars', desc: 'Gets Tough(+3), and once per round may re-roll one failed Defense roll.' },
    { name: 'Swift', desc: `This model and its unit get Fast. ${FAST_AGAIN}` },
    { name: 'Heroic Presence', desc: 'Friendly units within 12" of this model ignore wounds on a 6+ (roll one die per wound).' },
  ],
  Infantry: [
    { name: 'Ghostly', desc: 'This unit gets Strider and Stealth, and ignores wounds on a 6+.' },
    { name: 'Heavy Training', desc: 'When charging, this unit gets Impact(1) for every 2 models it has (rounded down), added to any Impact it already has, up to 10 Impact in total for the unit.' },
    { name: 'Berserkers', desc: 'Gets +1 to hit rolls in melee when charging, and enemy units in melee with it get -1 to morale test rolls.' },
    { name: 'Specialists', desc: 'Gets +1 to hit rolls either in melee or when shooting. Pick which when this trait is gained, and note it.' },
    { name: 'Resilient', desc: 'Gets +1 to Defense rolls.' },
    { name: 'Lucky', desc: 'Twice per round, may re-roll one die of any kind.' },
  ],
  Elite: [
    { name: 'Impact +3', desc: 'Gets Impact(+3).' },
    { name: 'Counter in melee / Rending when shooting', desc: 'Pick one when this trait is gained, and note it: its melee weapons get Counter, or its ranged weapons get Rending.' },
    { name: 'Fear +3', desc: 'Gets Fear(+3): counts as having dealt +3 wounds when checking who won melee. Enemy units in melee with it also get -1 to morale test rolls.' },
    { name: 'Inspiring Aura', desc: 'When activated, pick one friendly unit within 9", which gets +1 to hit rolls in its next activation.' },
    { name: 'Enhanced', desc: 'Gets Fortified and Tough(+3).' },
    { name: 'Elite', desc: 'Re-rolls unmodified results of 1 to hit either in melee or when shooting. Pick which when this trait is gained, and note it.' },
  ],
  'Vehicle/Monster': [
    { name: 'Transport +6', desc: 'Gets Transport(+6). Units that disembark from it may still charge in that activation.' },
    { name: 'Flying + Fast', desc: 'Gets Flying and Fast.' },
    { name: 'Impact +6', desc: 'Gets Impact(+6).' },
    { name: 'Quick Shot', desc: 'This model may shoot after using Rush actions.' },
    { name: 'Bulldoze', desc: 'Moves through terrain as if it were open ground. Once per round, may destroy one piece of medium or smaller terrain it moved through this activation, and each enemy unit in that terrain takes D6 hits with AP(1).' },
    AMBUSH,
  ],
  Aircraft: [
    { name: 'Explosive Exit', desc: 'When this model is destroyed, pick a point anywhere on the table. Each unit (friend or foe) within 9" of that point rolls one die per model (up to 1 model per Tough), and takes 1 wound for each 1.' },
    { name: 'Sky Suppression', desc: 'Enemy units within 18" of this model get -1 to morale test rolls, and once per activation one enemy unit it moved over must take a morale test.' },
    { name: 'Combat Turn', desc: 'If its move would take it off the table, it may instead turn by any angle at the table edge and continue moving.' },
    { name: 'Supply Drop', desc: 'Once per activation, after moving over friendly units, pick up to 3 of them. Each removes D3 wounds.' },
    { name: 'Ignores Cover', desc: "This model's ranged weapons ignore cover." },
    { name: 'Aerial Scan', desc: 'When activated, pick any one enemy unit on the table (no range or line of sight needed). The next friendly unit that attacks it this round gets +1 to hit rolls for that attack.' },
  ],
  Fortification: [
    { name: 'Sensor Array', desc: 'Friendly units that start their activation within 6" of this model get +6" range on their ranged weapons for that activation.' },
    { name: 'Command Bastion', desc: 'When activated, gain 1 re-roll. Until the end of the round, it may be used to re-roll any one die rolled for a friendly unit. If unused, it is lost.' },
    { name: 'Enhanced Orbital Drop', desc: 'Works like Ambush, and when deployed may destroy one piece of medium or smaller terrain. Enemy units within 9" of where it lands must take a dangerous terrain test.' },
    { name: 'Shield Generator', desc: 'Has a 3-wound shield. Wounds this model would take go to the shield first, and the shield ignores each one on a 5+. Once the shield has taken 3 wounds it is down for the rest of the game.' },
    { name: 'Repair Bay', desc: 'When activated, pick one friendly unit within 9", which removes D6 wounds.' },
    { name: 'Psychic Barrier', desc: 'Enemy casters within 24" of this model get -1 to casting rolls, and take 1 wound for each failed cast. Friendly units within 12" ignore wounds from spells on a 4+.' },
  ],
};

export const WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    { name: 'First Strike', desc: 'In each melee, the first attack each model makes with this weapon gets +1 to hit and Deadly(3).' },
    PLUS_A,
    PLUS_AP,
    { name: 'Counter', desc: 'Strikes first with this weapon when charged, getting +1 to hit rolls when it does, and the charging unit gets -1 total Impact rolls per model with Counter.' },
    { name: 'Thrust', desc: 'When charging, gets +1 to hit rolls and AP(+1) in melee.' },
    { name: 'Rending', desc: 'Ignores Regeneration, and on unmodified results of 6 to hit, those hits get AP(+4).' },
    { name: 'Guard Stance', desc: 'Models with this weapon get +1 to Defense rolls in melee.' },
    { name: 'Momentum', desc: 'When charging, each model with this weapon gets Impact(1), or +1 to the Impact it already has.' },
    { name: 'Duelist', desc: 'Gets +1 to hit rolls and AP(+1) against Heroes and units of a single model.' },
    { name: 'Reaping', desc: 'Gets +1 attack against units of 5 or more models, and +2 attacks against units of 10 or more.' },
  ],
  Ranged: [
    { name: '+6" range', desc: 'This weapon gets +6" range, and +1 to hit rolls when shooting after a Hold action.' },
    PLUS_A,
    PLUS_AP,
    { name: 'Unstoppable', desc: 'Ignores Regeneration and Cover, and ignores all negative modifiers to this weapon.' },
    { name: 'Takedown', desc: 'May pick any model in the target unit as its individual target, which is resolved as if it was a unit of 1.' },
    SURGE,
    { name: 'Rapid Volley', desc: 'Gets +1 attack when shooting at targets within half its range.' },
    { name: 'Hollow Point', desc: 'On unmodified results of 1 to block hits from this weapon, the target takes 1 extra wound.' },
    { name: 'Suppressing Fire', desc: 'Units that take wounds from this weapon get -1 to hit rolls when shooting until the end of their next activation.' },
    { name: 'Spread Shot', desc: 'Gets Blast(2), or +1 to the Blast value it already has.' },
  ],
};

export const UNIQUE_WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    QUAKE,
    { name: 'Bane', desc: 'Gets AP(+1) and ignores Regeneration, and the target must re-roll unmodified Defense results of 6 against it.' },
    { name: 'Bleed', desc: "Units that take wounds from this weapon can't regenerate or heal them this round, and must take a dangerous terrain test at the start of their next activation." },
    { name: 'Brutal', desc: 'Gets AP(+1), and on unmodified results of 6 to hit, this weapon deals 1 extra hit (only the original hit counts as a 6 for special rules).' },
    WELL_BALANCED,
    DUPLICATE,
  ],
  Ranged: [
    QUAKE,
    { name: 'Indirect', desc: 'Gets -1 to hit rolls when shooting after moving. May target enemies that are not in line of sight, and ignores cover from sight obstructions.' },
    { name: 'Slowing Strike', desc: 'Units that take wounds from this weapon get Slow and -1 to hit rolls until the end of their next activation.' },
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
  { name: 'Lowered Constitution', desc: 'When this unit makes a death roll, it rolls 2 dice: if either is a 1 it gains a scar, otherwise if either is a 6 it gains +1 XP.' },
  { name: 'Comatose', desc: 'No scar, but this unit sits out the next game.' },
];

export interface RelicDef {
  name: string;
  tier: RelicTier;
  profile?: string;
  note?: string;
  desc?: string;
  nexus?: boolean;
  /**
   * Brought home from a Sortie, once, and only then (relicKeysOf in sortie.ts): a region id for finishing its story
   * thread, `deep:<region>` for winning its deep version, `lord:<boss>` for slaying that Echo lord on a high tier,
   * `flawless` for a win with no unit wiped out, `nemesis` for slaying a lord with a full grudge.
   */
  sortie?: string;
}

export const RELICS: RelicDef[] = [
  { name: 'Common Weapon (Surge)', tier: 'Common', desc: 'Pick one non-relic weapon, which gets Surge.' },
  { name: 'Artisan Bionics', tier: 'Common', desc: 'This model and its unit get Protected.' },
  { name: 'Conversion Field', tier: 'Common', desc: 'This model and its unit get +1 to Defense rolls against melee attacks.' },
  { name: 'Disruption Shielding', tier: 'Common', desc: "Once per game, when this model's unit takes wounds, ignore all wounds from one weapon's attacks." },
  { name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4), Deadly(3)' },
  { name: 'Fang of the River Goul', tier: 'Common', profile: 'Melee, A4, AP(1), Demolish' },
  { name: "Shadow's Touch", tier: 'Common', profile: 'Melee, A3, AP(1), Quake', note: 'Casters only' },
  { name: 'Graviton Handcannon', tier: 'Common', profile: '18", A1, AP(2), Deadly(3), Ignores Cover' },
  { name: 'Dark Age Grenade Belt', tier: 'Common', profile: '12", A1, AP(1), Blast(6), Limited' },
  { name: 'Dark Age Jump Pack', tier: 'Common', desc: 'This model and its unit get Flying.' },
  { name: 'Temporal Displacer Gauntlet', tier: 'Common', desc: 'Once per activation, pick one enemy unit within 12". On a 4+ it gets -1 to hit rolls until the end of the round.' },
  { name: 'Refractor Field', tier: 'Common', desc: 'This model and its unit get +1 to Defense rolls against shooting from over 12" away.' },
  { name: 'Master-crafted Sidearm', tier: 'Common', profile: '12", A2, AP(2), Reliable' },
  { name: 'Auspex Array', tier: 'Common', desc: "This model's unit ignores cover when shooting. Enemy units can't be deployed by Ambush within 12\" of this model." },
  { name: 'Combat Stimm Injector', tier: 'Common', desc: 'Once per game, when activated, this model and its unit get +1 to hit rolls in melee and move +2" until the end of the round.' },
  { name: 'Nanite Infusion Injector', tier: 'Common', desc: 'When activated, remove 1 wound from this model or a friendly unit within 3". This can bring back a killed model that does not have Tough.' },
  { name: 'Dimensional Anchor', tier: 'Rare', desc: `Once per round, when activated, pick one enemy unit within 18", which must take a morale test. If it fails, it can't move until the end of the round.` },
  { name: 'Ethereal Capacitor', tier: 'Rare', desc: 'This model and its unit ignore wounds on a 6+. If they already ignore wounds on a 6+ (like Protected), they do so on a 5+ instead.' },
  { name: 'Archeotech Nano-med', tier: 'Rare', desc: 'The first time this model is killed, roll one die at the end of that activation. On a 2+ set it back up as close as possible to where it was, with D3 wounds left before it is killed (up to its Tough value).' },
  { name: 'Dark Age Displacer Belt', tier: 'Rare', desc: 'When this model and its unit use a Rush action, they may instead be placed anywhere on the table over 9" away from enemy units.' },
  { name: 'Enhanced Eye', tier: 'Rare', desc: "This model's ranged weapons get Takedown, and get +1 to hit rolls against the model they pick with it." },
  { name: 'Xenotech Digital Laser', tier: 'Rare', profile: '12", A2, AP(4), Beam' },
  { name: 'Unstable Matter Projector', tier: 'Rare', desc: 'This unit moves 2D6+6" when using Advance, and gets Strider and Flying while doing so.' },
  { name: 'Archeotech Combat Restoratives', tier: 'Rare', desc: 'When activated, remove D3+1 wounds from this model or a friendly unit within 6". Can bring back a model if it is healed to full (e.g. a Tough(3) model needs 3 wounds removed).' },
  { name: 'Mobius Repeater', tier: 'Rare', desc: "When this model's attacks destroy their target, leftover wounds carry over to one other enemy unit within 6\" of it." },
  { name: 'Null-field Disruptor', tier: 'Rare', desc: 'Enemy units within 9" get -1 to hit rolls.' },
  { name: 'Vortex Grenade', tier: 'Rare', profile: '12", A1, AP(4), Deadly(3), Blast(3), Limited' },
  { name: 'Ancestral Storm Maul', tier: 'Rare', profile: 'Melee, A3, AP(4), Deadly(3)' },
  { name: 'Chrono-Phase Blade', tier: 'Legendary', profile: 'Melee, A4, AP(4), Temporal Rift' },
  { name: 'Soulforge Glaive', tier: 'Legendary', profile: 'Melee, A4, AP(3), Soul Harvest' },
  { name: 'Nanite Hive Field', tier: 'Legendary', desc: 'Once per game, when activated, this model and up to D3 friendly units within 9" each remove 3 wounds and get Regeneration until the end of the round. Units that already have Regeneration ignore wounds on a 4+ instead.' },
  { name: 'Singularity Cannon', tier: 'Legendary', profile: '36", A1, AP(4), Limited, Black Hole' },
  { name: 'Chrono-Disruptor Matrix', tier: 'Legendary', desc: `Once per game, when activated: until the end of the round, enemy units within 12" can't move or charge.` },
  { name: 'Celestial Nullification Matrix', tier: 'Legendary', desc: 'Once per game: until the end of the round, enemy units within 12" get -1 to Defense rolls and -1 to casting rolls, and take 3 wounds for each failed cast in that area.' },
  // Nexus Wars relics
  { name: "The Ninth's Last Charge", tier: 'Common', sortie: 'ashfields', profile: '3", A1, AP(4), Blast(6), Limited' },
  { name: 'Servitor Power Cell', tier: 'Common', sortie: 'foundry', desc: 'Once per game, when activated, remove D3 wounds from this model or its unit.' },
  { name: 'Singing Splinter', tier: 'Common', sortie: 'glass', desc: "Enemy units get -1 to hit rolls when they shoot at this model's unit from over 12\" away." },
  { name: 'Bell of Severance', tier: 'Common', sortie: 'monastery', desc: "Once per game, when activated, pick one enemy unit within 18\". It can't cast spells or use auras until the end of the round." },
  { name: "Halvar's Firing Key", tier: 'Common', sortie: 'wreck', desc: "Once per game, when this model's unit shoots, one of its weapons gets AP(+2) and Ignores Cover for that attack." },
  { name: 'Unbroken Oath-Seal', tier: 'Common', sortie: 'flawless', desc: "Once per game, when this model's unit takes its last wound, roll one die. On a 4+ one model stays on the table with 1 wound left." },
  { name: 'Korvane Guard Standard', tier: 'Rare', sortie: 'deep:ashfields', desc: 'Friendly units within 6" get +1 to morale tests. Once per game, when activated, this model and its unit get +1 to hit rolls until the end of the round.' },
  { name: 'Furnace-Heart Lance', tier: 'Rare', sortie: 'deep:foundry', profile: '18", A2, AP(3), Blast(3)' },
  { name: 'Mirrorglass Mantle', tier: 'Rare', sortie: 'deep:glass', desc: "Once per round, when this model's unit is shot at, roll one die. On a 5+ the shooting unit takes the hits instead." },
  { name: "Abbot's Last Psalm", tier: 'Rare', sortie: 'deep:monastery', desc: 'When an enemy spell targets this model or a friendly unit within 12", roll one die. On a 4+ the spell has no effect.' },
  { name: 'Wreck-Core Reactor', tier: 'Rare', sortie: 'deep:wreck', desc: "When activated, pick one: this model and its unit move +3\" this activation, or this unit's ranged weapons get AP(+1) this activation." },
  { name: 'Grudgebreaker', tier: 'Rare', sortie: 'nemesis', profile: 'Melee, A3, AP(1), Deadly(3), Bane' },
  { name: 'Red Harvest Cleaver', tier: 'Legendary', sortie: 'lord:butcher', profile: 'Melee, A4, AP(3), Mounting Rage' },
  { name: 'The Carrion Crown', tier: 'Legendary', sortie: 'lord:horror', desc: 'This model and its unit get Flying. After this unit charges, each enemy unit within 3" takes D3 hits with AP(1).' },
  { name: 'Choir-Throat Torc', tier: 'Legendary', sortie: 'lord:screecher', desc: 'Once per round, when activated, every enemy unit within 12" gets -1 to hit rolls until the end of the round.' },
  { name: 'Heart of the Blind Mountain', tier: 'Legendary', sortie: 'lord:behemoth', desc: 'This model gets Tough(+3). Once per round, when activated, every enemy unit within 6" takes 3 hits with AP(1).' },
  { name: "Vashkar's Dread Mask", tier: 'Legendary', sortie: 'lord:terror', desc: 'Enemy units within 12" get -1 to morale tests. Once per game, when activated, every enemy unit within 12" must take a morale test.' },
  { name: 'The Hollow Crown', tier: 'Legendary', sortie: 'lord:ascended', note: 'Casters only', desc: 'Gets Caster(+2). Once per round, after this model casts a spell, it may cast the same spell again, at the same or another target.' },
  { name: 'Shadesplinter Cloak', tier: 'Common', nexus: true, desc: 'After this model and its unit use an Advance action, they count as being in cover.' },
  { name: 'Umbra Echo Plating', tier: 'Common', nexus: true, desc: "Once per round, when this model's unit takes wounds, ignore D3 of them." },
  { name: 'Warp-infusion', tier: 'Common', nexus: true, desc: 'Pick one non-relic melee weapon, which gets Quake.' },
  { name: 'Null Zone Projector', tier: 'Common', nexus: true, desc: 'All casting rolls within 12" get -1, including friendly ones. If the bearer is destroyed, the area stays until the end of the game.' },
  { name: 'Shard-Lens Scope', tier: 'Common', nexus: true, desc: 'Pick one non-relic ranged weapon, which gets +6" range and Ignores Cover.' },
  { name: 'Umbral Standard', tier: 'Common', nexus: true, desc: "This model's unit gets +1 to morale tests. Once per game, when it fails a morale test, it counts as passed instead." },
  { name: 'Phase-Step Harness', tier: 'Common', nexus: true, desc: 'This model and its unit move +2" when using Rush or Charge actions.' },
  { name: 'Shadow Veil Emitter', tier: 'Common', nexus: true, desc: 'This model and its unit get Stealth.' },
  { name: 'Whispering Shard', tier: 'Common', nexus: true, note: 'Casters only', desc: 'Once per round, when this model fails a casting roll, it may re-roll it.' },
  { name: 'Void Lantern', tier: 'Common', nexus: true, desc: "Enemy units within 9\" lose Stealth, and this model's unit ignores cover when shooting at them." },
  { name: 'Blackstone Shard Amulet', tier: 'Rare', nexus: true, desc: "This model's unit can't be targeted or affected by spells, and can't cast spells." },
  { name: 'Ancient Quantum Shielding', tier: 'Rare', nexus: true, desc: "When this model's unit blocks melee hits, the attacking unit takes 1 wound for each unmodified Defense result of 6." },
  { name: 'Umbra Claw', tier: 'Rare', profile: 'Melee, A5, AP(2), Bane', nexus: true },
  { name: 'Shard-Crown of Command', tier: 'Rare', nexus: true, desc: 'Friendly units within 12" get +1 to morale tests. Once per game, when activated, one friendly Shaken unit within 12" stops being Shaken.' },
  { name: 'Echoing Grimoire', tier: 'Rare', nexus: true, note: 'Casters only', desc: 'Gets Caster(+1). Once per round, when it fails a casting roll, the spell tokens are not spent.' },
  { name: 'Umbral Tether', tier: 'Rare', nexus: true, desc: 'Once per activation, pick one enemy unit within 12". Until the end of the round, it moves -2" when using Advance and -4" when using Rush or Charge.' },
  { name: 'Oblivion Orb', tier: 'Legendary', nexus: true, desc: 'Once per game, pick a point within 24". Every unit, friend or foe, within 6" of it takes 2D6 hits with AP(2).' },
  { name: 'Nexus Resonator', tier: 'Legendary', nexus: true, desc: 'Once per game, when activated, every enemy unit within 12" takes 6 hits with AP(1).' },
];

/** Homebrew special rules used in relic weapon profiles. */
export const RELIC_WEAPON_RULES: TableEntry[] = [
  { name: 'Beam', desc: 'On unmodified results of 6 to hit, this weapon deals 2 extra hits (only the original hit counts as a 6 for special rules).' },
  { name: 'Temporal Rift', desc: 'Each time this weapon wounds a target, roll one die. On a 5+, at the end of that melee the target is moved to a random quarter of the table, over 9" away from enemy units.' },
  { name: 'Soul Harvest', desc: 'Each time this weapon kills an enemy model in melee, remove 1 wound from the bearer, and this weapon gets +1 attack for the rest of the game.' },
  { name: 'Mounting Rage', desc: 'Gets +1 attack in the second round of the game, +2 in the third and +3 from the fourth on.' },
  { name: 'Black Hole', desc: 'If this weapon hits, roll one die for each model in the target unit. On a 5+ that model is killed, whatever its Tough value.' },
];

export const NEXUS_TRAITS: Record<Category, TableEntry[]> = {
  Hero: [
    { name: 'Shadowmeld', desc: 'This model and its unit get Stealth.' },
    { name: 'Chrono-Distortion', desc: 'Gets +1 to Defense rolls against shooting, and +1 to hit rolls in melee.' },
    { name: 'Voidwalk', desc: 'This model and its unit get Bounding: when activated, they may first be placed anywhere within D3+1" of their position.' },
    { name: 'Umbral Command', desc: 'Once per game, when activated, pick one friendly unit within 12" that has not activated this round. It activates right after this unit.' },
    { name: 'Soul Siphon', desc: 'Once per activation, when this model kills an enemy model in melee, it removes 1 wound.' },
    { name: 'Dread Presence', desc: `Enemy units within 6" of this model get -1 to morale test rolls, and units that charge this model's unit get -1 to hit rolls in that melee.` },
  ],
  Infantry: [
    { name: 'Umbral Veil', desc: 'After using a Hold action, this unit can not be targeted by enemy units over 18" away until the end of the round.' },
    { name: 'Temporal Surge', desc: 'Once per game, for one activation this unit moves +2" when using Advance and +4" when using Rush/Charge.' },
    { name: 'Shard-Laced Armour', desc: 'Gets +1 to Defense rolls against shooting from over 12" away.' },
    { name: 'Void Resilience', desc: 'Ignores wounds on unmodified rolls of 6 (roll one die per wound).' },
    { name: 'Phase Assault', desc: "When this unit charges, enemy Counter and strike-first effects don't work against it, and it gets +1 to hit rolls in that melee." },
    { name: 'Umbral Rally', desc: 'When activated while Shaken, roll one die. On a 4+ it stops being Shaken and activates as normal.' },
  ],
  Elite: [
    { name: 'Shard Infusion', desc: 'After it destroys an enemy unit in melee, it gets +1 to hit rolls when shooting until the end of its next activation. After it destroys one by shooting, it gets +1 to hit rolls in melee until the end of its next activation.' },
    { name: 'Shroud of Despair', desc: 'Twice per game, when activated, pick one enemy unit within 12" of this model, which must take a morale test. If it fails, it takes 3 hits with no AP.' },
    { name: 'Wraithstep', desc: 'Gets Strider, and moves +2" when using Rush or Charge.' },
    { name: 'Null Aura', desc: 'Enemy spells that target this unit get -2 to casting rolls.' },
    { name: "Hunter's Mark", desc: 'Once per round, when activated, pick one enemy unit within 18" of this model and in line of sight. Until the end of the round, friendly units get +1 to hit rolls against it.' },
    { name: 'Shardborn Fury', desc: 'Once per game, when activated, this unit gets +1 attack with all its weapons until the end of that activation.' },
  ],
  'Vehicle/Monster': [
    { name: 'Shadowbound', desc: 'Once per game, when an enemy unit attacks this model, you may use this. Until the end of the round, each time this model would take wounds from an attack, it takes half of them instead (rounding up).' },
    { name: 'Nexus Amplification', desc: 'Once per round, may re-roll one failed hit or Defense roll.' },
    { name: 'Void-Forged Plating', desc: 'Gets +1 to Defense rolls against hits with AP(2) or more.' },
    { name: 'Shard-Spiked Bulk', desc: 'Gets Impact(3), or +3 to the Impact it already has.' },
    { name: 'Nexus Engine', desc: 'Moves +2" when using Advance and +4" when using Rush/Charge, and ignores Slow.' },
    { name: 'Echo Repair', desc: 'At the start of each round, removes D3 wounds.' },
  ],
  Aircraft: [
    { name: 'Umbral Bombardment', desc: 'Gets AP(+1) when attacking enemy units within 18" of this model.' },
    { name: 'Warp-Engine', desc: 'Once per game, when activated, may first be placed at any table edge, then continues its activation as normal.' },
    { name: 'Shadow Wake', desc: 'Enemy units this model moves over get -1 to hit rolls until the end of their next activation.' },
    { name: 'Phase Hull', desc: 'Enemy units get -1 to hit rolls when shooting at this model from over 18" away.' },
    { name: 'Shadow Strafe', desc: 'Once per activation, after moving, pick one enemy unit it moved over, which takes D3+1 hits with AP(1).' },
    { name: 'Interceptor Protocols', desc: 'Gets +1 to hit rolls and AP(+1) when shooting at Aircraft, units with Flying, and units that arrived from Ambush this round.' },
  ],
  Fortification: [
    { name: 'Warp-Anchor', desc: `Gets Repel Ambushers (enemy units using Ambush must be set up over 12" away from this model's unit), and enemy casters within 18" get -1 to casting rolls.` },
    { name: 'Nexus Resonance', desc: 'Friendly units within 12" of this model get +1 to morale test rolls, and enemy units within 12" of it get -1.' },
    { name: 'Umbral Battery', desc: 'Once per round, when activated, pick one enemy unit within 24" of this model and in line of sight, which takes D3 hits with AP(2).' },
    { name: 'Shard Bulwark', desc: 'Friendly units within 6" of this model count as being in cover against shooting.' },
    { name: 'Void Lattice', desc: 'Gets +1 to Defense rolls against shooting.' },
    { name: 'Recall Beacon', desc: 'Once per game, when activated, pick one friendly unit within 18" that is not in melee, and place it fully within 6" of this model.' },
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
  /** Umbra Shards. */
  us?: number;
  xp?: number;
  /** 'any' is a pool to distribute; the others go to a single unit. */
  xpTarget?: XpTarget;
  /** Remove a scar: 'battle' = one gained this battle, 'any' = any scar. */
  removeScar?: 'battle' | 'any';
  /** Free upgrade / relic applied on the unit sheet. */
  free?: string;
  /** Nexus trait tokens (Nexus Wars forces only). */
  traitTokens?: number;
  /** A free Combat Manipulation for the next match (Nexus Wars forces only). */
  manipulation?: boolean;
  /** Roll on this sub-table too. */
  subtable?: RewardTableKey;
}

export type RewardTableKey = 'winner' | 'winnerSpecial' | 'loser' | 'suffering' | 'ai' | 'aiSpecial';

/** D10 tables: the die is the table's length. */
export const REWARD_TABLES: Record<RewardTableKey, { label: string; entries: RewardEntry[] }> = {
  winner: {
    label: 'Winners table',
    entries: [
      { text: '6 XP to distribute; undo one scar from this battle', xp: 6, xpTarget: 'any', removeScar: 'battle' },
      { text: '+100 Supply Limit', supply: 100 },
      { text: '+150 Supply Limit', supply: 150 },
      { text: '1 extra RP', rp: 1 },
      { text: '+1 RP and +50 Supply Limit', rp: 1, supply: 50 },
      { text: '6 Umbra Shards', us: 6 },
      { text: '3 Umbra Shards and 4 XP to distribute', us: 3, xp: 4, xpTarget: 'any' },
      { text: 'A Nexus trait token', traitTokens: 1 },
      { text: '+1 RP and 3 Umbra Shards', rp: 1, us: 3 },
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
      { text: '9 Umbra Shards', us: 9 },
      { text: 'A free Combat Manipulation next match and 3 Umbra Shards', manipulation: true, us: 3 },
      { text: 'Two Nexus trait tokens', traitTokens: 2 },
      { text: 'Gain a Common relic', free: 'Common relic' },
      { text: 'Gain a Common Nexus relic', free: 'Common Nexus relic' },
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
      { text: '4 Umbra Shards', us: 4 },
      { text: '3 Umbra Shards and 3 XP to distribute', us: 3, xp: 3, xpTarget: 'any' },
      { text: 'A Nexus trait token', traitTokens: 1 },
      { text: 'A free Combat Manipulation next match', manipulation: true },
    ],
  },
  suffering: {
    label: 'Growth Through Suffering',
    entries: [
      { text: '2 XP to distribute', xp: 2, xpTarget: 'any' },
      { text: '2 XP to distribute', xp: 2, xpTarget: 'any' },
      { text: '3 XP to distribute', xp: 3, xpTarget: 'any' },
      { text: '4 XP to distribute', xp: 4, xpTarget: 'any' },
      { text: '4 XP to distribute', xp: 4, xpTarget: 'any' },
      { text: '5 XP to distribute', xp: 5, xpTarget: 'any' },
      { text: '6 XP to distribute', xp: 6, xpTarget: 'any' },
      { text: '3 XP to distribute and 3 Umbra Shards', xp: 3, xpTarget: 'any', us: 3 },
      { text: '8 XP to distribute', xp: 8, xpTarget: 'any' },
      { text: '6 XP to distribute and a Nexus trait token', xp: 6, xpTarget: 'any', traitTokens: 1 },
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
      { text: '3 Umbra Shards', us: 3 },
      { text: '+100 Supply Limit', supply: 100 },
      { text: '3 Umbra Shards and 3 XP to distribute', us: 3, xp: 3, xpTarget: 'any' },
      { text: 'A free Combat Manipulation next match', manipulation: true },
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
      { text: '6 Umbra Shards', us: 6 },
      { text: 'A Nexus trait token', traitTokens: 1 },
      { text: 'A free Combat Manipulation next match and 3 Umbra Shards', manipulation: true, us: 3 },
      { text: 'Gain a Common Nexus relic', free: 'Common Nexus relic' },
    ],
  },
};

/** Every this-many BP the winner has over the loser earns another Growth Through Suffering roll. */
export const SUFFERING_BP_STEP = 5;
/** Scar whose owner rolls two dice for future death rolls. */
export const LOWERED_CONSTITUTION = 'Lowered Constitution';
