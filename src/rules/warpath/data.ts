// Warpath's numbers in one place, for tuning after playtests. Distances are inches on an endless field; times are seconds.

export const WARPATH = {
  /** Most points on the field, the hero included (real OPR points). */
  cap: 1500,
  /** The fixed step the sim runs at. */
  step: 1 / 60,
  /** A listed range in inches becomes this many inches on the field (so a 24" gun reaches about a third of the screen). */
  rangeMul: 0.6,
  /** Shortest and longest a gun reaches on the field. */
  minReach: 6,
  maxReach: 30,
  /** The volley clock (shots.ts), at Training's pace: a volley every this many seconds at rate 1. */
  pace: { shootEvery: 0.9, meleeEvery: 0.6, volleySpread: 0.5 },
  /** Hero: inches a second for each inch of Advance (6" → 7.2"/s); HP = hpMin + hpPerTough × Tough. */
  hero: { speedPer: 1.2, hpPerTough: 5, hpMin: 40, iframes: 0.3 },
  /** Followers: anchors trail the hero this far out (more for each squad), heavy ones turn this slowly. */
  follow: { ring: 5, ringPer: 0.9, lag: 4, heavyLag: 1.6, artilleryBack: 9, sallyMul: 0.5, sallyMin: 4 },
  /** Model losses: a share of each wound on the hero spreads to squads within `radius`. Models come back one per `regen` s. */
  losses: { share: 0.6, radius: 16, regen: 10 },
  /** Aircraft fly loops this far out at this many inches a second. */
  air: { radius: 22, speed: 26 },
  /** Fortifications: land this far from the hero, hurt what they land on, come back after `respawn` + `perPts` × points
   *  s, lift off past `leash` and drop again near the hero `redrop` s later (keeping their wounds). `hpPerTough`: their HP. */
  fort: { land: 8, impact: 4, impactRadius: 3.5, respawn: 10, perPts: 0.1, leash: 36, redrop: 3, hpPerTough: 15, surcharge: 1 },
  /** Level-ups. Need for level n (from 1): base + lin × n + sq × n². */
  xp: { base: 10, lin: 1.5, sq: 0.55, gemMerge: 300 },
  /** Call-in cards only on every `callEvery`-th level-up (and one is then always offered if a unit fits). */
  cards: { callEvery: 3, offer: 3, rerolls: 3, skipHeal: 0.2, healAtMax: 0.15 },
  /** Units and the hero level to 5 (+1 a trait, −1 a scar); each level: attacks rate, reach, damage on even levels. */
  levels: { max: 5, rate: 0.14, reach: 0.1, dmgEvery: 2, hp: 0.12, speed: 0.03 },
  /** Doctrine slots and levels. */
  doctrines: { slots: 6, max: 5 },
  /** Relics fire a golden volley on their own clock. */
  relics: { Common: 20, Rare: 12, Legendary: 6, attacks: 6 },
  /** Caster(X) casts every `every` / X s: a blast of `hits` × X at AP `ap` around the thickest knot of enemies. */
  caster: { every: 24, hits: 3, ap: 1, radius: 4 },
  /** Heal and Shield rules: HP onto the hero for each wound the rule names, every `every` OPR rounds × `round` s. */
  ability: { round: 8, hpPer: 3, barrageRadius: 3 },
  /** Pickups: reach to collect, how far the pull goes, rations (a share of HP), beacons (pull every gem). */
  pickups: { reach: 1.4, pull: 6, pullSpeed: 30, ration: 0.25, rationEvery: 45, beaconEvery: 110, gemLife: 120 },
  /** Enemy spawning: the ring they come from (beyond the screen), per second at the start, + each minute; a cap on the field. */
  spawn: {
    ring: 42, perSec: 2.75, perMin: 1.05, maxField: 1400,
    /** Wounds and damage grow by these shares each minute from the start. */
    hpPerMin: 0.11, dmgPerMin: 0.03,
    /** Every 5 min the mix steps tougher; the tiers by points a model (cheapest third, middle, dearest). */
    shiftEvery: 300,
    /** Past this many minutes, wounds and damage grow by these shares a minute. */
    lateFrom: 30, lateHp: 0.05, lateDmg: 0.035,
  },
  /** Enemy bodies: HP an unsaved wound takes off the hero, inches a second per inch of Advance, how close counts as touching, attack clocks. */
  enemy: { dmgPerWound: 3, heroDeadlyCap: 2, heroBlowCap: 0.35, speedPer: 0.85, touch: 1.1, meleeEvery: 1.1, hpPerTough: 1, windUp: 0.9, shotSpeed: 22, shotRadius: 0.9, blastRadius: 3, blastFuse: 1.2, shooterShare: 0.18 },
  /** Bosses: attacks × blows (a lord × lordBlows) every `every` × the usual clock; a captain every 3 min, an Echo Lord every 15 (wounds at minute 5, + a share a minute). */
  bosses: { blows: 2, lordBlows: 3, every: 1.5, captainEvery: 180, lordEvery: 900, captainHp: 175, lordHp: 440, hpPerMin: 0.09, size: 3.2, lordSize: 4.4, drop: 1 },
  /** Elites (as in Training): from `from` s, a share of the swarm (+ perMin a minute, to max) with more wounds, harder
   *  blows, a bigger body and a gold rim; their Shard is worth `xp` times as much. */
  elite: { from: 60, share: 0.03, perMin: 0.012, max: 0.17, hp: 3, dmg: 1.5, size: 1.35, xp: 5 },
  /** Hordes: every `min`–`max` s (from `from`), after a `warn` s warning, a ring closes round the hero or a column
   *  charges from one side: `secs` seconds of the spawn rate at once (at least `least`), over the field cap by `over`. */
  horde: { from: 75, min: 50, max: 95, warn: 3, secs: 9, least: 24, over: 250, ringR: 30 },
  /** Sites round the map, to go out to: up to `live` at once, a new one every `every` s, `near`–`far` from the hero,
   *  gone past `lose`. A shrine is held `hold` s (within `radius`) for a Battle Hymn (fire `hymn` faster for `hymnSecs`);
   *  a cache gives a level-up and springs an elite ambush of `ambush`; a well heals `heal`; a champion (an elite ×`champHp`
   *  that holds its ground until the hero comes within `wake`) drops `champXp` XP of Shards. */
  sites: { live: 3, every: 35, first: 20, near: 34, far: 60, lose: 110, radius: 3.5, hold: 8, cacheHold: 5, wellHold: 3, hymn: 0.4, hymnSecs: 40, ambush: 8, ambushHp: 2.5, heal: 0.6, champHp: 6, wake: 16, champXp: 60 },
  /** Hard mode: enemy wounds and damage, and how much faster they come. */
  hard: { hp: 1.5, dmg: 1.5, spawn: 1.3 },
  /** Score once everything is maxed. */
  score: { level: 250, boss: 5000, lord: 15000 },
  /** XP (under the off-table limit): the hero 1 a boss, a unit 1 if it did this share of the damage in a run with a boss kill. */
  xpShare: 0.1,
  /** Save to the cloud this often while playing (and at each level-up). */
  cloudEvery: 60,
  /** A world chunk (terrain is laid out a chunk at a time from the run's seed). */
  chunk: 48,
} as const;

/** The 14 doctrines: army-wide rules picked on level-up cards, 5 levels each. Per level unless noted. */
export const DOCTRINES = {
  relentless: { name: 'Relentless', icon: 'g:bullets', text: 'Shooting attacks come 8% faster.', rate: 0.08 },
  furious: { name: 'Furious', icon: 'g:crossed-swords', text: 'Melee attacks come 10% faster.', rate: 0.1 },
  goodShot: { name: 'Good Shot', icon: 'g:archery-target', text: '+5% to hit.', hit: 0.3 },
  holdLine: { name: 'Hold the Line', icon: 'g:checked-shield', text: 'The hero takes 7% less damage; squads lose 10% fewer models.', dmg: 0.07, losses: 0.1 },
  rapidAdvance: { name: 'Rapid Advance', icon: 'g:running-ninja', text: 'The hero moves 6% faster.', speed: 0.06 },
  fieldMedics: { name: 'Field Medics', icon: 'g:medical-pack', text: 'The hero mends 0.25 HP a second.', regen: 0.25 },
  reinforcements: { name: 'Reinforcements', icon: 'g:backup', text: 'Lost models come back 15% sooner.', regen: 0.15 },
  shrapnel: { name: 'Shrapnel', icon: 'g:spiky-explosion', text: 'Each hit has a 6% chance to splash one enemy close by.', splash: 0.06 },
  armourPiercing: { name: 'Armour Piercing', icon: 'g:pierced-body', text: '+AP(1) on one hit in three.', ap: 0.34 },
  deadlyStrikes: { name: 'Deadly Strikes', icon: 'g:skull-crossed-bones', text: '10% more damage.', dmg: 0.1 },
  shardLure: { name: 'Shard Lure', icon: 'g:magnet', text: 'Shards are pulled from 25% further and give 5% more XP.', pull: 0.25, xp: 0.05 },
  veteranDrills: { name: 'Veteran Drills', icon: 'g:upgrade', text: 'Guns reach 7% further.', reach: 0.07 },
  fearTactics: { name: 'Fear Tactics', icon: 'g:screaming', text: 'Enemies within 8" of the hero move 6% slower.', slow: 0.06, radius: 8 },
  arcaneFocus: { name: 'Arcane Focus', icon: 'g:star-swirl', text: 'Spells, relics and timed rules come 10% sooner.', cd: 0.1 },
} as const;

export type DoctrineId = keyof typeof DOCTRINES;
export const DOCTRINE_IDS = Object.keys(DOCTRINES) as DoctrineId[];
