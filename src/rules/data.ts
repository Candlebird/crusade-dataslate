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

/** Regular unit trait tables (d6). Infantry has two branches. */
export const TRAIT_TABLES: Record<string, TableEntry[]> = {
  Hero: [
    { name: 'Aura of Blinding' },
    { name: 'Aura of Swiftness' },
    { name: 'Quick Shot' },
    { name: 'Takedown' },
    { name: 'March Order' },
    { name: 'Tough +3' },
  ],
  'Infantry (Utility)': [
    { name: 'Fast' },
    { name: 'Stealth' },
    { name: 'Protected', desc: 'Reduce AP of incoming attacks by 1.' },
    { name: 'Strider' },
    { name: 'Scout 9"' },
    { name: 'Regeneration' },
  ],
  'Infantry (Aggressive)': [
    { name: 'Trench Warfare' },
    { name: 'Furious' },
    { name: 'Relentless' },
    { name: 'Mutations' },
    { name: 'Ambush' },
    { name: 'Devour' },
  ],
  Elite: [
    { name: 'No Retreat' },
    { name: 'Tough +3' },
    { name: 'Protected', desc: 'Reduce AP of incoming attacks by 1.' },
    { name: 'Caster +1' },
    { name: 'Ambush' },
    { name: 'Relentless' },
  ],
  'Vehicle/Monster': [
    { name: 'AP +1 when holding' },
    { name: 'No Retreat' },
    { name: 'Survey Vehicle' },
    { name: 'Fast', desc: 'Very Fast if already Fast.' },
    { name: 'Auto-Repair' },
    { name: 'Tough +3' },
  ],
  Aircraft: [
    { name: 'Evasive Maneuvers' },
    { name: 'Air Break' },
    { name: 'Strafing Run' },
    { name: 'Covering Fire' },
    { name: 'Assault Bomb' },
    { name: 'Hover' },
  ],
  Fortification: [
    { name: 'Deploy Cover' },
    { name: 'Self-Repair', desc: '6+ to ignore wounds.' },
    { name: 'Overwatch' },
    { name: 'Battlements' },
    { name: 'Orbital Drop' },
    { name: 'Tough +3' },
  ],
};

export const UNIQUE_TRAIT_TABLES: Record<Category, TableEntry[]> = {
  Hero: [
    { name: 'Extreme Motivation' },
    { name: 'Crazed' },
    { name: 'Bitter Rivalry' },
    { name: 'Toughened Scars' },
    { name: 'Swift' },
    { name: 'Heroic Presence' },
  ],
  Infantry: [
    { name: 'Ghostly' },
    { name: 'Heavy Training' },
    { name: 'Berserkers' },
    { name: 'Specialists' },
    { name: 'Resilient' },
    { name: 'Lucky' },
  ],
  Elite: [
    { name: 'Impact +3' },
    { name: 'Counter in melee / Rending when shooting' },
    { name: 'Fear +3' },
    { name: 'Inspiring Aura' },
    { name: 'Enhanced' },
    { name: 'Elite' },
  ],
  'Vehicle/Monster': [
    { name: 'Transport +6' },
    { name: 'Fly + Fast' },
    { name: 'Impact +6' },
    { name: 'Quick-Shot' },
    { name: 'Bulldoze' },
    { name: 'Ambush' },
  ],
  Aircraft: [
    { name: 'Explosive Exit' },
    { name: 'Sky Suppression' },
    { name: 'Combat Turn' },
    { name: 'Supply Drop' },
    { name: 'Ignore Cover' },
    { name: 'Aerial Scan' },
  ],
  Fortification: [
    { name: 'Sensor Array' },
    { name: 'Command Bastion' },
    { name: 'Enhanced Orbital Drop' },
    { name: 'Shield Generator' },
    { name: 'Repair Bay' },
    { name: 'Psychic Barrier' },
  ],
};

export const WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    { name: 'First Strike' },
    { name: '+1 A' },
    { name: '+1 AP' },
    { name: 'Counter' },
    { name: 'Lance' },
    { name: 'Rending' },
  ],
  Ranged: [
    { name: '+6" range' },
    { name: '+1 A' },
    { name: '+1 AP' },
    { name: 'Lock-On' },
    { name: 'Sniper' },
    { name: 'Flux' },
  ],
};

export const UNIQUE_WEAPON_TRAIT_TABLES: Record<'Melee' | 'Ranged', TableEntry[]> = {
  Melee: [
    { name: 'Warp' },
    { name: 'Poison' },
    { name: 'Bleed' },
    { name: 'Shock' },
    { name: 'Well Balanced' },
    { name: 'Duplicate', desc: 'Duplicate a trait, or pick from the normal table.' },
  ],
  Ranged: [
    { name: 'Warp' },
    { name: 'Indirect' },
    { name: 'Slowing Strike' },
    { name: 'Magma' },
    { name: 'Well Balanced' },
    { name: 'Duplicate', desc: 'Duplicate a trait, or pick from the normal table.' },
  ],
};

/** Battle scars (d10). */
export const SCAR_TABLE: TableEntry[] = [
  { name: 'Crippling Injury', desc: 'Gains [Slow], or [Very Slow].' },
  { name: 'Damaged Equipment', desc: '-1 Quality when shooting.' },
  { name: 'Weakened Armor', desc: '-1 Defense.' },
  { name: 'Weak Spot', desc: 'Defense rolls of 1 take an extra mortal wound.' },
  { name: 'Faulty Aim', desc: 'Re-roll hit rolls of 6.' },
  { name: 'Fear of Death', desc: '-1 Quality on battleshock tests.' },
  { name: 'Dishonorable', desc: 'Can no longer attach to another unit.' },
  { name: 'Weakened Muscles', desc: '-1 Quality in melee.' },
  { name: 'Lowered Constitution', desc: 'Future death rolls use 2 dice.' },
  { name: 'Comatose', desc: 'No scar, but sits out the next game.' },
];

export interface RelicDef {
  name: string;
  tier: RelicTier;
  profile?: string;
  note?: string;
  nexus?: boolean;
}

export const RELICS: RelicDef[] = [
  { name: 'Common Weapon (Artificer)', tier: 'Common' },
  { name: 'Artisan Bionics', tier: 'Common' },
  { name: 'Conversion Field', tier: 'Common' },
  { name: 'Disruption Shielding', tier: 'Common' },
  { name: 'Terminus Eye', tier: 'Common', profile: '9", A1, AP(3), Deadly(3)' },
  { name: 'Fang of the River Goul', tier: 'Common', profile: 'Melee, A6, AP(2), Magma' },
  { name: "Shadow's Touch", tier: 'Common', profile: 'Melee, A3, AP(1), Warp', note: 'Casters only' },
  { name: 'Graviton Handcannon', tier: 'Common', profile: '18", A2, AP(2), Deadly(3), Ignores Cover' },
  { name: 'Dark Age Grenade Belt', tier: 'Common', profile: '12", A1, AP(1), Blast(6), Limited' },
  { name: 'Dark Age Jump Pack', tier: 'Common' },
  { name: 'Temporal Displacer Gauntlet', tier: 'Common' },
  { name: 'Null Zone Projector', tier: 'Common' },
  { name: 'Nanite Infusion Injector', tier: 'Common' },
  { name: 'Dimensional Anchor', tier: 'Rare' },
  { name: 'Ethereal Capacitor', tier: 'Rare' },
  { name: 'Archeotech Nano-med', tier: 'Rare' },
  { name: 'Dark Age Displacer Belt', tier: 'Rare' },
  { name: 'Enhanced Eye', tier: 'Rare' },
  { name: 'Xenotech Digital Laser', tier: 'Rare', profile: '12", A2, AP(4), Beam' },
  { name: 'Unstable Matter Projector', tier: 'Rare' },
  { name: 'Archeotech Combat Restoratives', tier: 'Rare' },
  { name: 'Mobius Repeater', tier: 'Rare' },
  { name: 'Null-field Disruptor', tier: 'Rare' },
  { name: 'Vortex Grenade', tier: 'Rare', profile: '12", A1, AP(4), Deadly(3), Blast(3), Limited' },
  { name: 'Chrono-Phase Blade', tier: 'Legendary', profile: 'Melee, A4, AP(4), Temporal Rift' },
  { name: 'Soulforge Glaive', tier: 'Legendary', profile: 'Melee, A D3+1, AP(3), Soul Harvest' },
  { name: 'Nanite Hive Field', tier: 'Legendary' },
  { name: 'Singularity Cannon', tier: 'Legendary', profile: '36", A1, AP(4), Limited, Black Hole' },
  { name: 'Chrono-Disruptor Matrix', tier: 'Legendary' },
  { name: 'Celestial Nullification Matrix', tier: 'Legendary' },
  // Nexus Wars relics
  { name: 'Shadesplinter Cloak', tier: 'Common', nexus: true },
  { name: 'Umbra Echo Plating', tier: 'Common', nexus: true },
  { name: 'Warp-infusion', tier: 'Common', nexus: true },
  { name: 'Blackstone Shard Amulet', tier: 'Rare', nexus: true },
  { name: 'Ancient Quantum Shielding', tier: 'Rare', nexus: true },
  { name: 'Umbra Claw', tier: 'Rare', profile: 'Melee, A6, AP(1), Radiation', nexus: true },
  { name: 'Oblivion Orb', tier: 'Legendary', nexus: true },
  { name: 'Nexus Resonator', tier: 'Legendary', nexus: true },
];

export const NEXUS_TRAITS: Record<Category, string[]> = {
  Hero: ['Shadowmeld', 'Chrono-Distortion', 'Voidwalk'],
  Infantry: ['Umbral Veil', 'Temporal Surge'],
  Elite: ['Shard Infusion', 'Shroud of Despair'],
  'Vehicle/Monster': ['Shadowbound', 'Nexus Amplification'],
  Aircraft: ['Umbral Bombardment', 'Warp-Engine'],
  Fortification: ['Warp-Anchor', 'Nexus Resonance'],
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
