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
  follow: {
    ring: 3, ringPer: 0.55, lag: 4, heavyLag: 1.6, artilleryBack: 6, sallyMul: 0.5, sallyMin: 4,
    /** Squads drift: a new spot every `wanderMin`-`wanderMax` s, up to `wanderSway` radians off their slot, `wanderIn`-`wanderOut` x its ring. */
    wanderMin: 2, wanderMax: 5, wanderSway: 0.8, wanderIn: 0.7, wanderOut: 1.15,
    /** Infantry and lone heroes take cover within `coverSeek` of the hero (at most `coverShare` squads to a feature) and
     *  leave it once the hero is `coverLeash` away. Any body standing in cover gets +`coverDef` Defense; a squad in cover
     *  is also hit only `coverHit` as often. */
    coverSeek: 12, coverLeash: 18, coverShare: 3, coverDef: 1, coverHit: 0.2,
  },
  /** Squads as bodies: an enemy goes for a squad whose edge is within `aggro` and nearer than the hero. Wounds on a
   *  squad (x `squadDmg`) take its models, each with Tough x `squadHp` wounds; one strike fells at most one model, and
   *  what's left of it is lost. Lost models come back one per `regen` s. */
  losses: { aggro: 8, squadDmg: 1, squadHp: 2, regen: 10, regroup: 6, back: 0.5, safe: 4 },
  /** Flyers make straight strafing runs: `speed` inches a second at the thickest pack within `seek` of the hero, `over`
   *  past it and round again, firing `rate` x as fast (they're only over the target a moment). */
  air: { speed: 34, seek: 24, over: 18, rate: 1.4 },
  /** Rules in numbers. `far`: 9" of table, on this field. Regeneration ignores a wound on 5+, a ward on 6+; Shadowborn
   *  takes this much off what can reach it. */
  rules: { far: 5.4, regen: 1 / 3, ward: 1 / 6, shadowborn: 2.4, shadowBoost: 4.8 },
  /** Archetypes (ROLES below). */
  roles: {
    /** Gunline: stands and shoots until the hero's `holdLeash` off; a body still for `holdAfter` s fires `holdRate` faster. Artillery holds to `deployLeash`. */
    holdLeash: 13, holdAfter: 1, holdRate: 0.15, deployLeash: 18,
    /** Artillery: shells land `shellTime` s after firing, at least `shellBlast` across. */
    shellTime: 0.7, shellBlast: 1.5, shellCap: 200,
    /** Charger: a rush at `dash` x its speed (at least `rushMin`"/s) for up to `rushTime` s, `rushExtra`" out past the pack,
     *  at packs within `rushLeash`; it runs down up to `impactCap` bodies within `impactRadius`, fights `fight` s harder
     *  (melee `chargeRate` faster), and rushes again `rushCd` s later. */
    dash: 2.4, rushMin: 20, rushExtra: 5, rushLeash: 16, rushTime: 1.2, impactRadius: 2.5, impactCap: 24, fight: 4, chargeRate: 0.5, rushCd: 3,
    /** Phantom: every `blinkEvery` s it blinks into a knot of at least `knotMin` within `blinkSeek`, fights `blinkStay` s, blinks out. */
    blinkEvery: 9, blinkSeek: 18, blinkStay: 3, knotR: 5, knotMin: 3,
    /** Ambusher: off the field `ambushWait` s, then deploys on the flank of a pack within `deployLeash` for `ambushStay` s, its first blows `firstBlows` s charged. */
    ambushWait: 5, ambushStay: 10, firstBlows: 1.5,
    /** Reaver: wades into packs within `skirmishLeash`; with `crowdFew` or `crowdMany` bodies within `crowdR` a hit has this chance of another. */
    crowdR: 4, crowdFew: 5, crowdMany: 10, crowdFewOdds: 0.35, crowdManyOdds: 0.7,
    /** Skirmisher: `ahead` in front of the hero, backing off foes within `kite` of it. Hunter: after elites and bosses within `huntR`, hitting them `huntMul` as hard. */
    skirmishLeash: 16, ahead: 10, kite: 5, huntR: 26, huntMul: 1.25,
    /** Bulwark: `guardOut` from the hero on the side of the nearest foe within `guard`, stomping every `stompEvery` s, foes within `taunt` go for it first; Counter hits back. */
    guard: 14, guardOut: 6, stompEvery: 3, stompR: 3, taunt: 4, counter: 0.5,
    /** Support: `ferryReach` squads get models back `ferryRate` x as fast; a boon for `boonSecs` s on those within `boonReach` every `buffEvery` s. */
    ferryReach: 10, ferryRate: 2, boonSecs: 8, boonReach: 12, buffEvery: 8, mendReach: 10,
    /** Passive rules on a `pulseEvery` clock: Scout pulls Shards within `scoutPull`; Fear dazes foes within `fearR`. */
    pulseEvery: 0.5, scoutPull: 5, fearR: 5,
    /** What arrives out of nowhere (a blink, an ambush) hits all within `heroSwarm`. The hero's orders are in HERO_POWERS. */
    heroSwarm: 4,
    /** Fear on a squad: `shaken` s of firing at `shakenRate`. Boons: `speedBoon` x speed, +`reachBoon`" reach. */
    shaken: 2, shakenRate: 0.7, speedBoon: 1.3, reachBoon: 3.6,
  },
  /** How the horde's own rules play. */
  foes: {
    /** Impact and Fast bodies lunge: `lungeWind` s wind-up, `lungeMul` x speed for `lungeTime` s, from within `lungeFar`, every `lungeEvery` s. */
    lungeWind: 0.5, lungeMul: 2.5, lungeTime: 0.8, lungeFar: 12, lungeEvery: 4,
    /** Ambush bodies (from `ambushFrom` s) climb out `ambushNear`-`ambushFar` from the hero, `emerge` s after a warning; `ambushShare` of their packs. */
    ambushFrom: 45, ambushShare: 0.35, ambushNear: 12, ambushFar: 16, emerge: 1,
    /** Casters and menders hang `hang` off and act every `supportEvery` s: a blast of `castHits` x X within `castRadius`; mending `mendShare` of up to `mendMax` bodies within `mendReach`. */
    hang: 14, supportEvery: 6, castHits: 2, castRadius: 2.5, mendShare: 0.2, mendMax: 8, mendReach: 6,
    /** Share that stop to shoot: gun as strong as its melee, else not. Shooters back off inside `kite` of their reach. */
    gunFirst: 0.6, gunSide: 0.12, kite: 0.4,
    /** Tough this high (and every boss) slams: a marker at its feet, `slamFuse` s, `slamReach` past its body. */
    slamTough: 6, slamFuse: 0.7, slamReach: 2,
    /** Self-Destruct: a marker where it falls. Indirect guns lob a marker this wide. */
    fuseSecs: 0.55, fuseRadius: 3, lobRadius: 2,
  },
  /** Fortifications: land this far from the hero, hurt what they land on, come back after `respawn` + `perPts` × points
   *  s, lift off past `leash` and drop again near the hero `redrop` s later (keeping their wounds). `hpPerTough`: their HP. */
  fort: { land: 8, impact: 4, impactRadius: 3.5, respawn: 10, perPts: 0.1, leash: 36, redrop: 3, hpPerTough: 15, surcharge: 1 },
  /** Level-ups. Need for level n (from 1): base + lin × n + sq × n². */
  xp: { base: 10, lin: 1.5, sq: 0.85, gemMerge: 300 },
  /** Call-in cards only on every `callEvery`-th level-up (and one is then always offered if a unit fits). Doctrines already
   *  held, and partners of those held, show up `leanHeld` and `leanPair` times as often. */
  cards: { leanHeld: 1.8, leanPair: 2.2, callEvery: 3, offer: 3, rerolls: 3, skipHeal: 0.2, healAtMax: 0.15 },
  /** Units and the hero level to 5 (+1 a trait, −1 a scar); each level: attacks rate, reach, damage on even levels. */
  /** Per drill level: fire rate, reach, harder hits every `dmgEvery`, hero HP and speed; each model's wounds (and a
   *  turret's HP) ×`woundsMul`. */
  levels: { max: 5, rate: 0.14, reach: 0.1, dmgEvery: 2, hp: 0.12, speed: 0.03, woundsMul: 1.6, specAt: 1, specKills: 40 },
  /** Doctrine slots and levels. */
  doctrines: { slots: 6, max: 5 },
  /** Relics fire a golden volley on their own clock. */
  relics: { Common: 20, Rare: 12, Legendary: 6, attacks: 6 },
  /** Caster(X) casts every `every` / X s: a blast of `hits` × X at AP `ap` around the thickest knot of enemies. */
  caster: { every: 24, hits: 3, ap: 1, radius: 4, spellHits: 3, spellRadius: 3, reach: 20 },
  /** Heal and Shield rules: HP onto the hero for each wound the rule names, every `every` OPR rounds × `round` s. */
  ability: { round: 8, hpPer: 3, barrageRadius: 3 },
  /** Pickups: reach to collect, how far the pull goes, rations (a share of HP), beacons (pull every gem). */
  pickups: { reach: 1.4, pull: 6, pullSpeed: 30, ration: 0.25, rationEvery: 45, beaconEvery: 110, gemLife: 120 },
  /** Enemy spawning: the ring they come from (beyond the screen), per second at the start, + each minute; a cap on the
   *  field (bodies owed past it come in later folded into elites, so a full field still grows harder). */
  spawn: {
    ring: 48, perSec: 2.75, perMin: 1.05, maxField: 900,
    /** Wounds and damage grow by these shares each minute from the start. */
    hpPerMin: 0.24, dmgPerMin: 0.09,
    /** Every 5 min the mix steps tougher; the tiers by points a model (cheapest third, middle, dearest). */
    shiftEvery: 300,
    /** Past this many minutes, wounds and damage grow by these shares a minute. */
    lateFrom: 11, lateHp: 0.22, lateDmg: 0.17,
  },
  /** Enemy bodies: HP an unsaved wound takes off the hero, inches a second per inch of Advance, how close counts as touching, attack clocks. */
  enemy: { dmgPerWound: 3, heroDeadlyCap: 2, heroBlowCap: 0.35, speedPer: 0.85, touch: 1.1, meleeEvery: 1.1, hpPerTough: 1, windUp: 0.9, shotSpeed: 22, shotRadius: 0.9, blastRadius: 3, blastFuse: 1.2, shooterShare: 0.18 },
  /** Blast(X) covers a circle of X × `perX` inches radius (a gun's hit lands on everything inside, each saving on its
   *  own; an enemy's is its marker). Shrapnel splashes within `splash`. */
  blast: { perX: 1, splash: 2.2 },
  /** Site champions and captains come in softer: their attacks and Deadly start at `from` of full and reach it at
   *  `fullAt` minutes. Lords always hit in full. */
  guardian: { from: 0.25, fullAt: 12 },
  /** Bosses: attacks × blows (a lord × lordBlows) every `every` × the usual clock; a captain every 3 min, an Echo Lord every 15 (wounds at minute 5, + a share a minute). */
  /** `focus`: the share of shots that go to a boss in reach rather than the nearest body. Past `far` a boss closes at `closing` x its pace. */
  bosses: { focus: 0.5, far: 6, closing: 2, blows: 2, lordBlows: 3, every: 1.5, captainEvery: 180, lordEvery: 900, captainHp: 175, lordHp: 440, hpPerMin: 0.09, size: 3.2, lordSize: 4.4, drop: 1 },
  /** Elites (as in Training): from `from` s, a share of the swarm (+ perMin a minute, to max) with more wounds, harder
   *  blows, a bigger body and a gold rim; their Shard is worth `xp` times as much. */
  elite: { from: 60, share: 0.03, perMin: 0.012, max: 0.17, hp: 3, dmg: 1.5, size: 1.35, xp: 5 },
  /** Hordes: every `min`–`max` s (from `from`), after a `warn` s warning, a ring closes round the hero or a column
   *  charges from one side: `secs` seconds of the spawn rate at once (at least `least`), over the field cap by `over`.
   *  It lands `batch` bodies a step, so a big one comes in over a few frames rather than all in one. */
  horde: { from: 75, min: 50, max: 95, warn: 3, secs: 9, least: 24, over: 150, ringR: 30, batch: 40 },
  /** Sites round the map, to go out to: up to `live` at once, a new one every `every` s, `near`–`far` from the hero,
   *  gone past `lose`. A shrine is held `hold` s (within `radius`) for a Battle Hymn (fire `hymn` faster for `hymnSecs`);
   *  a cache gives a level-up and springs an elite ambush of `ambush`; a well heals the hero `heal` and brings every unit back to full strength; a champion (an elite ×`champHp`
   *  that holds its ground until the hero comes within `wake`) drops `champXp` XP of Shards. */
  sites: { live: 3, every: 35, first: 20, near: 34, far: 60, lose: 110, radius: 3.5, hold: 8, cacheHold: 5, wellHold: 3, hymn: 0.4, hymnSecs: 40, ambush: 8, ambushHpPerMin: 0.1, ambushHp: 2.5, heal: 0.6, champHp: 6, wake: 16, champXp: 60 },
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

/** The archetypes, for the screens: what a unit is and how it plays. */
export const ROLES = {
  fortress: { name: 'Fortress', icon: 'g:castle', color: '#c9b78a', text: 'Drops in as a turret and holds the spot.' },
  flyer: { name: 'Flyer', icon: 'g:jet-fighter', color: '#8fd0ff', text: 'Strafes straight over the thickest pack; terrain means nothing.' },
  artillery: { name: 'Artillery', icon: 'g:mortar', color: '#ffb347', text: 'Hangs back and lobs shells into clusters.' },
  phantom: { name: 'Phantom', icon: 'g:hooded-figure', color: '#b79cff', text: 'Blinks into a pack, hits it, and blinks out.' },
  mystic: { name: 'Mystic', icon: 'g:star-swirl', color: '#c9a6ff', text: 'Casts its book\'s spells on a clock.' },
  charger: { name: 'Charger', icon: 'g:charging-bull', color: '#ff8a5c', text: 'Rushes through packs, untouchable, running down all it passes.' },
  ambusher: { name: 'Ambusher', icon: 'g:ninja-mask', color: '#7ee0a8', text: 'Waits off the field, then deploys on a pack\'s flank.' },
  support: { name: 'Support', icon: 'g:medical-pack', color: '#7ee07e', text: 'Stays by hurt squads, mends them and hands out boons.' },
  hunter: { name: 'Hunter', icon: 'g:archery-target', color: '#ffd166', text: 'Ignores the swarm and goes after elites and bosses.' },
  skirmisher: { name: 'Skirmisher', icon: 'g:running-ninja', color: '#6fd3ff', text: 'Ranges ahead of the hero, shooting on the move and pulling Shards in.' },
  bulwark: { name: 'Bulwark', icon: 'g:checked-shield', color: '#9fb4ff', text: 'Guards the hero: foes go for it first, and it stomps them back.' },
  reaver: { name: 'Reaver', icon: 'g:crossed-swords', color: '#ff6a6a', text: 'Wades into the thickest crowd; the more around it, the more it hits.' },
  gunline: { name: 'Gunline', icon: 'g:bullets', color: '#d8d8d8', text: 'Stands and shoots; a steady aim fires faster.' },
} as const;

/** The doctrines: army-wide rules picked on level-up cards, 5 levels each. Per level unless noted. */
export const DOCTRINES = {
  relentless: { name: 'Relentless', icon: 'g:bullets', text: 'Shooting attacks come 8% faster.', rate: 0.08 },
  furious: { name: 'Furious', icon: 'g:crossed-swords', text: 'Melee attacks come 10% faster.', rate: 0.1 },
  goodShot: { name: 'Good Shot', icon: 'g:archery-target', text: '+5% to hit.', hit: 0.3 },
  holdLine: { name: 'Hold the Line', icon: 'g:checked-shield', text: 'The hero takes 7% less damage; squads shrug off 10% of wounds.', dmg: 0.07, losses: 0.1 },
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
  whirlingBlades: { name: 'Whirling Blades', icon: 'g:spinning-blades', text: 'One more blade circles the hero, cutting whatever it touches. Armour is no help.', radius: 5, spin: 2.6, tick: 0.25, width: 1.5, most: 5, dmg: 1.5, grow: 0.2 },
  bloodTithe: { name: 'Blood Tithe', icon: 'g:blood', text: "The hero's own kills each mend 0.15 HP.", heal: 0.15 },
  killingSpree: { name: 'Killing Spree', icon: 'g:bloody-sword', text: 'Each kill speeds every attack by 0.4%, up to 20 kills. It fades after 2.5s without one.', rate: 0.004, stacks: 20, secs: 2.5 },
  fireMission: { name: 'Fire Mission', icon: 'g:artillery-shell', text: 'Every 12s one more shell lands on a thick knot of enemies.', every: 12, reach: 30, radius: 5, hits: 12, ap: 1, quality: 3 },
  volatileShards: { name: 'Volatile Shards', icon: 'g:crystal-shine', text: 'Every 30th Shard you pick up goes off round the hero, wider and harder each level.', every: 30, radius: 5, hits: 6, perLevel: 4, ap: 1 },
  martyrdom: { name: 'Martyrdom', icon: 'g:martyr-memorial', text: 'A model that falls takes the enemy with it: 4 more hits in a blast where it stood.', radius: 4, hits: 4, ap: 1 },
  manoeuvre: { name: 'Fire and Manoeuvre', icon: 'g:dodging', text: 'Keep moving: every attack comes 5% faster. Stand still: the hero takes 6% less damage.', rate: 0.05, guard: 0.06, after: 1 },
  giantSlayer: { name: 'Giant Slayer', icon: 'g:giant', text: 'Elites, champions and bosses take 12% more damage.', dmg: 0.12 },
  rallyingCry: { name: 'Rallying Cry', icon: 'g:bugle-call', text: 'Each level-up throws enemies 2.5" further back from the hero and mends 1.5% HP.', push: 2.5, reach: 10, heal: 0.015 },
} as const;

export type DoctrineId = keyof typeof DOCTRINES;
export const DOCTRINE_IDS = Object.keys(DOCTRINES) as DoctrineId[];

/** The level both doctrines need before their stratagem can turn up. */
export const STRATAGEM_LEVEL = 2;

/** Stratagems: two doctrines that belong together, both at STRATAGEM_LEVEL, open a one-off card that changes how they work. */
export const STRATAGEMS = {
  stormOfSteel: { name: 'Storm of Steel', icon: 'g:sword-spin', needs: ['whirlingBlades', 'relentless'], text: 'Blades spin 40% faster and circle 2" wider.', spin: 1.4, reach: 2 },
  bloodFrenzy: { name: 'Blood Frenzy', icon: 'g:bloody-stash', needs: ['bloodTithe', 'killingSpree'], text: "Every unit's kills pay a third of the Blood Tithe.", share: 1 / 3 },
  dangerClose: { name: 'Danger Close', icon: 'g:missile-swarm', needs: ['fireMission', 'shrapnel'], text: 'Every shell of a Fire Mission lands twice.' },
  chainReaction: { name: 'Chain Reaction', icon: 'g:explosive-materials', needs: ['volatileShards', 'martyrdom'], text: 'Shard and martyr blasts are half as big again, with half as many hits again.', mul: 1.5 },
  hitAndRun: { name: 'Hit and Run', icon: 'g:run', needs: ['manoeuvre', 'rapidAdvance'], text: 'Both halves of Fire and Manoeuvre work all the time.' },
  lastLine: { name: 'The Last Line', icon: 'g:trumpet-flag', needs: ['rallyingCry', 'holdLine'], text: 'Each Rallying Cry also shields the hero for 8% HP.', shield: 0.08 },
  giantKiller: { name: 'Giant Killer', icon: 'g:thunder-blade', needs: ['giantSlayer', 'armourPiercing'], text: 'Giant Slayer counts double.', mul: 2 },
  butchersBill: { name: "Butcher's Bill", icon: 'g:bloody-sword', needs: ['furious', 'deadlyStrikes'], text: 'Melee attacks do 30% more damage.', mul: 1.3 },
  marksmen: { name: 'Marksmen', icon: 'g:high-shot', needs: ['goodShot', 'veteranDrills'], text: 'Shots from past 5" ignore cover and gain AP(1).', ap: 1 },
  triage: { name: 'Triage', icon: 'g:crowned-heart', needs: ['fieldMedics', 'reinforcements'], text: 'Every 6s a model comes back on your most hurt unit.', every: 6 },
  leyLines: { name: 'Ley Lines', icon: 'g:floating-crystal', needs: ['shardLure', 'arcaneFocus'], text: "Every Shard you pick up takes 0.1s off the hero's order.", cut: 0.1 },
  reignOfTerror: { name: 'Reign of Terror', icon: 'g:dread-skull', needs: ['fearTactics', 'killingSpree'], text: 'Fear Tactics reaches twice as far, and dazed enemies take 20% more damage.', reach: 2, dmg: 1.2 },
} as const;

export type StratagemId = keyof typeof STRATAGEMS;
export const STRATAGEM_IDS = Object.keys(STRATAGEMS) as StratagemId[];

/** The hero's order, by archetype: the button (Space) and how often it comes back. */
export const HERO_POWERS = {
  rush: { name: 'Charge', text: 'Rush through the enemy, untouchable, running down all you pass.', every: 10, len: 16 },
  strafe: { name: 'Strafe', text: 'A long, untouchable run over the enemy, hitting all you pass.', every: 12, len: 24 },
  blink: { name: 'Blink', text: 'Jump ahead, hurting what stands at both ends.', every: 10, len: 10, safe: 0.4 },
  vanish: { name: 'Vanish', text: 'Drop out of sight, reappear far ahead and hit all round you.', every: 13, len: 18, safe: 1.2 },
  whirl: { name: 'Whirlwind', text: 'Cut twice at everything round you, briefly untouchable.', every: 9, radius: 8, safe: 0.5 },
  nova: { name: 'Nova', text: 'A blast round the hero that throws the crowd back.', every: 12, radius: 9, hits: 22, ap: 1, push: 5 },
  barrage: { name: 'Barrage', text: 'Five shells land on the thickest packs in reach.', every: 14, shells: 5, reach: 30, radius: 4, hits: 9, ap: 1 },
  volley: { name: 'Volley', text: 'Every unit fires 50% faster for 4s.', every: 14, secs: 4, rate: 1.5 },
  mark: { name: 'Mark Prey', text: 'Elites and bosses in reach, and everything close by, take 25% more damage for 8s.', every: 12, reach: 26, near: 10, secs: 8 },
  sprint: { name: 'Sprint', text: 'Run 60% faster for 3s and pull in the Shards around you.', every: 11, secs: 3, speed: 1.6, pull: 20 },
  brace: { name: 'Brace', text: 'Throw back what is round the hero and take 65% less damage for 4s.', every: 13, secs: 4, cut: 0.35, reach: 8, push: 5 },
  rally: { name: 'Rally', text: "Mend 12% HP, put a model back on every unit, and steady everyone's aim for 6s.", every: 16, heal: 0.12, secs: 6 },
} as const;
export type PowerId = keyof typeof HERO_POWERS;

/** Which order each archetype gives its hero. */
export const POWER_OF: Record<keyof typeof ROLES, PowerId> = {
  charger: 'rush', flyer: 'strafe', phantom: 'blink', ambusher: 'vanish', reaver: 'whirl', mystic: 'nova', artillery: 'barrage',
  gunline: 'volley', hunter: 'mark', skirmisher: 'sprint', bulwark: 'brace', fortress: 'brace', support: 'rally',
};

/** Specialisations: at drill level `levels.specAt`, or `levels.specKills` kills, a unit (not the hero) picks one of its archetype's two, for good. */
export const SPECS = {
  firingLine: { role: 'gunline', name: 'Firing Line', text: 'Settles in half the time, and a steady aim fires 45% faster instead of 15%.', after: 0.5, rate: 0.45 },
  suppressing: { role: 'gunline', name: 'Suppressing Fire', text: 'Every enemy it hits at range is slowed.' },
  creeping: { role: 'artillery', name: 'Creeping Barrage', text: 'Each shell lands twice, the second further on.', step: 5, wait: 0.35 },
  heavyShells: { role: 'artillery', name: 'Heavy Shells', text: 'Shells burst 1.5" wider and gain AP(1).', blast: 1.5, ap: 1 },
  overwatch: { role: 'fortress', name: 'Overwatch', text: 'Reaches 30% further and fires 25% faster.', reach: 1.3, rate: 1.25 },
  strongpoint: { role: 'fortress', name: 'Strongpoint', text: 'Twice the HP, and enemies nearby go for it first.', hp: 2, taunt: 6 },
  gunship: { role: 'flyer', name: 'Gunship', text: 'Fires 50% faster on its runs.', rate: 1.5 },
  bombRun: { role: 'flyer', name: 'Bomb Run', text: 'Drops a bomb on the pack at the heart of each pass.', radius: 4.5, hits: 10, ap: 1 },
  momentum: { role: 'charger', name: 'Momentum', text: 'Rushes again in half the time.', cd: 0.5 },
  trample: { role: 'charger', name: 'Trample', text: 'A rush runs down a path 60% wider and hits all it meets twice.', radius: 1.6 },
  reaper: { role: 'phantom', name: 'Reaper', text: 'Blinks nearly twice as often.', every: 0.55 },
  wraith: { role: 'phantom', name: 'Wraith', text: 'Stays in the pack twice as long, and hits all round it again as it leaves.', stay: 2 },
  deepStrike: { role: 'ambusher', name: 'Deep Strike', text: 'Back on the field in under half the time.', wait: 0.4 },
  alphaStrike: { role: 'ambusher', name: 'Alpha Strike', text: 'Its landing hits twice, and its fury lasts 5s.', fury: 5 },
  adept: { role: 'mystic', name: 'Adept', text: 'Casts about half again as often.', pace: 0.65 },
  massSpell: { role: 'mystic', name: 'Mass Spell', text: 'Spells reach 50% wider and land 50% more hits.', radius: 1.5, hits: 1.5 },
  fieldSurgeon: { role: 'support', name: 'Field Surgeon', text: 'Every 5s a model back on a unit near it, and the hero mends 1.5% HP.', every: 5, heal: 0.015 },
  warBanner: { role: 'support', name: 'War Banner', text: 'Its boons come 40% sooner and reach twice as far.', every: 0.6, reach: 2 },
  marksman: { role: 'hunter', name: 'Marksman', text: 'Hits elites and bosses 75% harder instead of 25%.', mul: 1.75 },
  spotter: { role: 'hunter', name: 'Spotter', text: 'What it hits is marked: everyone does 25% more damage to it.' },
  outrider: { role: 'skirmisher', name: 'Outrider', text: 'Pulls Shards in from three times as far.', pull: 3 },
  harrier: { role: 'skirmisher', name: 'Harrier', text: 'Slows what it hits, and fires 30% faster on the move.', rate: 1.3 },
  shieldWall: { role: 'bulwark', name: 'Shield Wall', text: 'The hero takes 20% less damage within 7" of it.', reach: 7, cut: 0.8 },
  retribution: { role: 'bulwark', name: 'Retribution', text: 'Stomps twice as often and 50% wider.', every: 0.5, radius: 1.5 },
  bloodbath: { role: 'reaver', name: 'Bloodbath', text: 'Its kills heal its wounds; every 4th brings a model back.', every: 4 },
  frenzy: { role: 'reaver', name: 'Frenzy', text: 'Its extra attacks start at 3 foes round it, and come more often.', few: 3, many: 6, fewOdds: 0.5, manyOdds: 0.9 },
} as const;
export type SpecId = keyof typeof SPECS;
export const SPEC_IDS = Object.keys(SPECS) as SpecId[];

/** Trophies: a boss's trick, won by felling it. Its supply drop offers the trophy as a card among the others. */
export const TROPHIES = {
  phaseAnchor: { name: 'Phase Anchor', icon: 'g:vortex', text: "The hero's order comes back 30% sooner.", cd: 0.7 },
  wardStone: { name: 'Ward Stone', icon: 'g:energy-shield', text: 'Every 15s the hero gains a shield of 10% HP.', every: 15, shield: 0.1 },
  warHorn: { name: 'War Horn', icon: 'g:trumpet-flag', text: "Elites' Shards are worth twice as much.", xp: 2 },
  burstCore: { name: 'Burst Core', icon: 'g:sun-radiations', text: 'When the hero is hit, a ring bursts out from it (every 6s at most).', every: 6, radius: 7, hits: 14, ap: 1 },
  stormcaller: { name: 'Stormcaller', icon: 'g:power-lightning', text: 'Every 8s lightning strikes the thickest pack near the hero.', every: 8, reach: 26, radius: 5, hits: 14, ap: 2 },
  livingHeart: { name: 'Living Heart', icon: 'g:crowned-heart', text: 'Below half HP, the hero mends 1.2% HP a second.', below: 0.5, heal: 0.012 },
} as const;
export type TrophyId = keyof typeof TROPHIES;
export const TROPHY_IDS = Object.keys(TROPHIES) as TrophyId[];

/** Boss tricks: what a boss does on the field, and the trophy it leaves. Captains play theirs at `captainPace` x the
 *  clock, with blows at their guardian share. Nexus-only tricks fall in with the nearest trophy. */
export const BOSS_TRICKS = {
  captainPace: 1.6,
  deck: ['burst', 'summon', 'teleport', 'shield', 'storm', 'regen'],
  names: { teleport: 'the Phasing', shield: 'the Warded', summon: 'the Summoner', burst: 'the Burning', storm: 'the Stormbringer', regen: 'the Undying', fear: 'the Dread', armour: 'the Ironclad', stealth: 'the Unseen' },
  text: {
    teleport: 'It blinks to your side when you run.', shield: 'A ward soaks its damage, and comes back.', summon: 'It calls more bodies to its side.',
    burst: 'It throws out rings of fire.', storm: 'It calls blasts down round you.', regen: 'It mends itself as it fights.',
    fear: 'You run slower near it.', armour: 'It is harder to wound.', stealth: 'It is harder to shoot.',
  },
  trophy: { teleport: 'phaseAnchor', shield: 'wardStone', summon: 'warHorn', burst: 'burstCore', storm: 'stormcaller', regen: 'livingHeart', fear: 'warHorn', armour: 'wardStone', stealth: 'phaseAnchor' },
} as const;
