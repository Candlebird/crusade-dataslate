import {
  BATTLE_RP, LEVEL_THRESHOLDS, MARKED_XP, MAX_AGENDAS, MAX_NORMAL_TRAITS, MAX_SCARS, MAX_UNIQUE_TRAITS, MAX_WEAPON_TRAITS,
  NO_AGENDA_XP, PARTICIPATION_XP, POST_MAX_REPLACE_STEP, STARTING_SUPPLY, SUFFERING_BP_STEP,
} from './data';
import { ECHOES, DIFFICULTY_LEVELS, NEXUS_CRISIS, NEXUS_DETACHMENTS, NEXUS_DIFFICULTY, NEXUS_MAP, NEXUS_REINFORCE_BONUS, NEXUS_ROUNDS, UMBRA_SHOP } from './nexusData';
import { EXPEDITION, SOLO_PATROL, type ExpeditionCheck } from './downtimeData';

// The prose of the Rules page: the group's Crusade and Nexus Wars docs, reworded where the app's rules have moved on.
// The tables on that page come straight from data.ts and nexusData.ts; this file holds only the text around them,
// and reads its numbers from those files so the two never disagree.

const R = NEXUS_ROUNDS;
const D = NEXUS_DETACHMENTS;
const MAX_LEVEL = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

export const CRUSADE_TEXT = {
  overview: [
    'A homebrew Crusade system for One Page Rules: a mix of 40K Crusade and OPR\'s own campaign rules. Units gain experience from battles and level up, earning traits, weapon upgrades and relics, and every unit category has its own upgrade path.',
  ],
  starting: [
    `A force starts with a Supply Limit of ${STARTING_SUPPLY} points: you can add up to that many points of units to it. Once a unit is in your force it can gain experience and level up. A unit removed from the force loses all of its experience, relics and upgrades.`,
    'When you add a unit, pick the category whose upgrade tables it will use, and stick with it.',
    'The Supply Limit goes up through battle rewards and Requisition Points. In games with a higher points limit than your force, you may add units from outside the force; they gain no experience.',
  ],
  experience: [
    'Units gain XP for every model they destroy, equal to that model\'s wounds (a Tough(3) model is worth 3 XP). Models in units of 10 or more single-wound models are worth ½ XP each.',
    `Once per battle you may mark one of your units for Greatness: it gains ${MARKED_XP} extra XP. You also mark one of your opponent's units.`,
    `Every unit that takes part in a battle gains ${PARTICIPATION_XP} XP.`,
    `Pick up to ${MAX_AGENDAS} agendas at the start of the game for more XP. If you'd rather not, every participating unit gains ${NO_AGENDA_XP} XP instead of ${PARTICIPATION_XP}. You may swap a core agenda for a special one: they're harder, but pay better.`,
  ],
  requisitions: [
    `You gain ${BATTLE_RP} RP for every match you play. The winner and loser also roll on their table below. Against an AI opponent, use the AI table whether you win or lose.`,
    `Growth Through Suffering: if you lose to an opponent with more Battle Points than you, roll once on that table for every ${SUFFERING_BP_STEP} BP they have over you (at least once).`,
  ],
  deaths: [
    'When a unit dies in battle, roll a D6 straight away. On a 1 it gains a battle scar; on a 6 it gains 1 XP.',
    `A unit with ${MAX_SCARS} scars that gains another is removed from your force. Each scar lowers the unit's Battle Points by 1.`,
    'Instead of taking a scar, you may remove one of the unit\'s traits and drop it back to its previous XP level. Otherwise roll on the scar table.',
  ],
  upgrades: [
    `Units level up at ${LEVEL_THRESHOLDS.join(' / ')} XP. Above ${MAX_LEVEL} XP, every ${POST_MAX_REPLACE_STEP} XP lets you replace a previous upgrade.`,
    `On a level up, pick a trait from the unit's category table or upgrade one weapon. An infantry weapon upgrade gives 2 weapon traits; any other gives 1. A weapon holds at most ${MAX_WEAPON_TRAITS} traits.`,
    `A unit can have at most ${MAX_NORMAL_TRAITS} normal traits and ${MAX_UNIQUE_TRAITS} unique traits, and no duplicates unless a trait says so.`,
    'Overflow XP: a unit can only gain enough XP to level up once per battle. The rest is halved (rounding up) and handed out to other units that took part. For example, a unit at 9 XP gains 20: it takes 1 and levels up at 10, and the other 19 becomes 10 XP for the rest of the force.',
  ],
  blessings: [
    'Blessings: for every point of Battle Points difference between the two forces, the underdog gets 1 re-roll. Each unit can use at most one re-roll per round.',
  ],
  relics: [
    'Only heroes can carry relics. Instead of taking an upgrade, a hero may take a relic of a tier its XP allows (buying it with RP as a requisition), as long as it has a free relic slot.',
    'Stealing Relics (optional, both players must agree): if your hero kills a hero that carries a relic, on a 3+ yours takes one of its relics. The hero who lost it gets +1 to hit against the thief. Only one copy of each relic can exist at a time, and players may also trade relics.',
    'Wagering Relics (optional, both players must agree): players may bet relics on a match. The winner takes them and assigns them under the normal relic rules; the loser removes them and adjusts BP.',
  ],
  nexusRelics: [
    `Nexus relics are only found in the Nexus Umbra. Buy one in the Umbra Shard shop (${UMBRA_SHOP.find((x) => x.key === 'relic')?.cost} US on top of the normal relic requisition, ${NEXUS_ROUNDS.relicCollectorDiscount} US less with a Relic Collector home), or roll a 6 on the Void table. Otherwise they follow the normal relic rules.`,
  ],
};

export const NEXUS_TEXT = {
  overview: [
    'Nexus Umbra, an uncharted region long sealed off by an impassable void, has opened. Its resources, ancient ruins and anomalies have drawn every faction in. This expansion to the Crusade rules has players fight over its sectors for extra resources, tactical advantages and unique upgrade paths.',
    `It's built to run for a long time: there's no final turn and no winner. Instead, the ${ECHOES.name} grow and recede, factions that fall behind get help catching up, and the leader becomes everyone's target.`,
  ],
  map: [
    'The Nexus is a hex map of sectors. Each faction starts with a home sector, which can be attacked but never taken, and picks one home benefit. Planets give their owner one benefit, picked when the planet is developed.',
    `Homes sit two sectors in from the edge of the map, with rival factions at opposite ends. Every faction gets the same mix of sectors around its home to expand into; the extra sectors gather in a contested middle around the ${ECHOES.name}' Voidspawn.`,
    `A new map is ${NEXUS_MAP.size}×${NEXUS_MAP.size} hexes (${NEXUS_MAP.perExtraFaction} more each way for every faction past two), about ${Math.round(NEXUS_MAP.fill * 100)}% of it filled with sectors. About ${Math.round(NEXUS_MAP.poiShare * 100)}% of those are points of interest (planets, research stations, void sites and Anomalies); the rest are clear space.`,
    `The map changes every round. When a round ends, any space hulk whose reward has been claimed drifts off, leaving clear space that its holder keeps (its Salvage still counts for that round). Then new points of interest appear: ${NEXUS_MAP.refreshPerFaction} in each faction's half of the map and ${NEXUS_MAP.refreshContested} in the contested middle, in unclaimed clear space where there is some, otherwise at the edge of the map's sectors. They never appear right next to a home.`,
  ],
  difficulty: [
    `Every sector except the homes has a difficulty, measured in Supply: the size of the AI garrison holding it. Ratings start around ${NEXUS_DIFFICULTY.min} next to the homes and climb to the biggest faction's total Supply × ${NEXUS_DIFFICULTY.maxFactor} (at least ${NEXUS_DIFFICULTY.min + NEXUS_DIFFICULTY.minSpread}) at the far reaches of the map and the Voidspawn, so the best prizes mean punching above your weight. Void sites and Anomalies rate a little higher than other sectors at the same distance; empty space a little lower.`,
    `On top of that, every sector's rating rolls up or down by up to ${NEXUS_DIFFICULTY.jitter} Supply, in steps of ${NEXUS_DIFFICULTY.step} (never below ${NEXUS_DIFFICULTY.floor}), so two sectors side by side can be very different fights: look for the soft targets and pick your battles. The Voidspawn is always the top of the scale.`,
    `The GM sets the campaign's difficulty next to Rescale sectors now on the Nexus Wars page: ${DIFFICULTY_LEVELS.map((l) => `${l.name} ×${l.scale}`).join(', ')}. It multiplies every rating (and the range they roll in), and changing it rescales the sectors straight away.`,
    "Difficulty is recalculated (and rerolled) at the end of every round, against each faction's total Supply across all its detachments, so the Nexus gets more dangerous as the factions grow.",
    `Each sector also has a modifier that helps whoever defends it (two when it's rated in the top ${Math.round((1 - NEXUS_DIFFICULTY.hardAt) * 100)}% of the scale). Sectors held by the AI roll new modifiers every round; a faction's sectors keep theirs.`,
    "Attacking an AI-held sector: play 1 v AI and generate the garrison at the sector's difficulty. Its modifiers apply to the AI side.",
  ],
  rounds: [
    'The campaign is played in rounds. Each round has two parts: skirmishes, played whenever you like, and then the Battle, where the sector attacks happen. When the Battle is done, the GM ends the round on the Nexus Wars page.',
    `When a round ends, what every faction holds is noted, and each player claims that round's sector income on their force page with "Claim round income". Income is paid once per round per faction, however many games or detachments you played. Missed rounds wait for you: up to ${R.keepRounds} ended rounds can be claimed late.`,
    `Every match you play in a round, skirmish or Battle, also pays ${R.matchBonusUs} Umbra Shard, for up to ${R.matchBonusMax} matches a round across all of a faction's detachments, on top of the normal Crusade rewards.`,
    `Temporary unlocks (a Research station's table, an Anomaly's "all tables") last until your next round income.`,
  ],
  skirmishes: [
    'Play as many skirmishes as you like during a round, against another player or the AI, with any mission. They earn the full Crusade rewards (XP, levels, reward rolls) and the match bonus, but no sector changes hands.',
    `Each skirmish your faction wins earns a Strategic Asset, up to ${R.assetsMax} a round. Spend them in the Battle (mark them on the Nexus Wars page so everyone can see). Unspent Assets are lost when the round ends.`,
    `Patrols: a skirmish won against the ${ECHOES.name} lowers their threat by ${R.threatPerPatrolWin} at the round's end.`,
    'Record a skirmish in the app by finishing the battle with "Skirmish (no sector)" picked: the win goes into the campaign log.',
  ],
  attacking: [
    "The Battle: each detachment secretly picks one sector to attack this round, or holds. The GM reveals everyone's orders at once, and then the attacks are played. Only Battle games take sectors, challenge home sectors or earn the Echoes bounty.",
    "Unclaimed sectors: the attacker plays the AI's garrison, at the sector's difficulty, unless another faction attacks it too: then the two fight each other for it. Claimed sectors: the owner defends. The winner takes the sector, and the sector's modifiers always favour its defender.",
    'Reinforcements stay with the sector, not the faction: when a sector changes hands, any Reinforce Sector on it is lost.',
    `Defender can't make it: the ${ECHOES.name} stand in. Play against the AI, with an army at the attacker's points (+${NEXUS_REINFORCE_BONUS} if the sector is Reinforced). If the Echoes win, the owner holds the sector; if the attacker wins, they take it.`,
    "Attacker can't make it: the attack lapses, and the faction keeps its orders slot: it may make the same attack next round.",
    'Battles over a sector must be reported to the GM (or recorded in the app) so the map stays current.',
  ],
  detachments: [
    'A faction can field more than one force. Its first force is its main army; every further force you link to the faction is a detachment. Each detachment declares its own attack in the Battle, so a faction with three forces can make three attacks a round.',
    `A detachment starts with ${D.startingSupply} Supply: it gets its Supply Limit from the faction's other forces. Once a round, for ${D.reorganiseCost} Umbra Shard${D.reorganiseCost === 1 ? '' : 's'}, a faction may reorganise: share out its forces' Supply Limit and Umbra Shards between them and move units from one to another. Units keep their XP, traits, scars and relics. Apart from the cost, the totals never change: reorganising only moves what the faction already has.`,
    "The faction's round income and the match bonus are paid once for the whole faction, not per detachment. Claim the income on any one of its forces; the match bonus cap counts every detachment's matches.",
    'Table unlocks, Combat Manipulations and other Nexus rewards stay with the force that earned them.',
  ],
  home: [
    `A home sector can be challenged at most once per round, and not at all in the opening rounds (until round ${R.graceRounds + 1}).`,
    'Whoever wins a home-sector challenge, attacker or defender, gains one round of the loser\'s sector income on top of their own. The loser gets only the basic Crusade rewards and forfeits their Nexus rewards for that match. The home sector never changes hands.',
  ],
  echoes: [
    `The ${ECHOES.name} are the AI's faction. They hold the Voidspawn sectors, which can be attacked but never taken, and spread out from their territory into neighbouring sectors when a round ends.`,
    `Their threat starts at ${R.threatStart} and runs from 0 to ${R.threatMax}. When a round ends it rises by ${R.threatPerRound}, then falls by ${R.threatPerWin} for every Battle won against the Echoes that round (${R.threatPerVoidspawnWin} for a win at a Voidspawn) and ${R.threatPerPatrolWin} for every patrol. The new threat sets how many sectors they spread into.`,
    `They go after whoever is ahead: sectors held by the faction with the most sectors are ${R.leaderWeight} times as likely to be hit. In the opening rounds (rounds 1–${R.graceRounds}) they only spread into unclaimed sectors.`,
    `Bounty: retaking a sector from the ${ECHOES.name} earns a free roll on the AI special table, on top of the match rewards.`,
  ],
  events: [
    'When the GM ends a round, a D12 is rolled on the Galactic Events table for the next round. Its effect lasts that one round. The GM can re-roll it or pick one from the table on the Nexus Wars page.',
    "Events that change the round's end (spread, threat, space hulks) apply when that round ends. Income from an event is paid with that round's sector income. A battle rule applies to every battle of the round.",
  ],
  crisis: [
    `Every ${NEXUS_CRISIS.everyRounds} rounds (rounds ${NEXUS_CRISIS.everyRounds}, ${NEXUS_CRISIS.everyRounds * 2}, ${NEXUS_CRISIS.everyRounds * 3}…) an Echo Lord rises in a random sector held by the ${ECHOES.name}. Every faction must fight it together, in one battle against the AI, before the round ends.`,
    `Start it from the round panel on the Nexus Wars page: one player per faction on the same team, against the ${ECHOES.name}. Generate their army to match your points. Their most expensive unit is the Echo Lord, with its special rule; destroying it is worth +${NEXUS_CRISIS.lordVp} VP. Only the first Crisis battle counts.`,
    `Win: the ${ECHOES.name}' threat falls by ${NEXUS_CRISIS.threatDrop} when the round ends, and every side claims +${NEXUS_CRISIS.winUs} Umbra Shards with its match rewards. The MVP, the side whose units earned the most XP in the tracker, also takes a ${NEXUS_CRISIS.mvpTier} relic.`,
    `Lose, draw, or don't fight it before the round ends: the threat goes to ${R.threatMax}, and the ${ECHOES.name} take each faction's sector nearest the Lord (not its home or a stronghold).`,
  ],
  downtime: [
    'Between games, each force linked to the campaign can go on any number of Expeditions and fight one Solo patrol per round, as long as each unit goes only once (below). Both refresh when the GM ends the round. They are worth about a quarter of a battle: something to do while the group cannot meet, never a substitute for playing.',
    "One fight per unit per round: each unit takes part in one side game a round, whether a skirmish, a Solo patrol or an Expedition. A unit that already has is greyed out on the Expedition and Solo patrol pickers, and sits out when the next skirmish is recorded, earning nothing from it. The round's main Battle (the sealed-orders attack on a sector, or a Nexus Crisis battle) doesn't count: every unit can fight in it and earn its full rewards, and fighting in it doesn't use a unit up. Every unit is free again when the GM ends the round.",
    `Expedition (Expedition… on your force page): send up to ${EXPEDITION.squadMax} active units to one of four sites for ${EXPEDITION.encounters} encounters, drawn from six per site, each in one of three variants. Each encounter offers a few choices; most need a check: ${(Object.keys(EXPEDITION.checks) as ExpeditionCheck[]).map((k) => `${k} ${EXPEDITION.checks[k].dice}D6 needing ${EXPEDITION.checks[k].target}+`).join(', ')}. Rolling all 1s always fails. The squad adds +1 to every roll for each unit after the first and +1 for every ${EXPEDITION.levelsPerBonus} levels across its units, up to +${EXPEDITION.bonusCap}, so a bigger, more experienced squad takes on the hard checks. Rewards deeper in are worth more: XP and Supply ×${EXPEDITION.depth.join(', ×')}.`,
    `After each encounter, head home with the haul (always safe) or press on. A failed roll raises the danger by ${EXPEDITION.failDanger}, or by ${EXPEDITION.fumbleDanger} on a fumble (all 1s, or missing by ${EXPEDITION.fumbleMiss} or more). Pressing on, roll a D6: equal to or under the danger, the squad is ambushed and one unit takes a battle scar (on a ${EXPEDITION.ambushScarOn === 1 ? '1' : `1–${EXPEDITION.ambushScarOn}`}) or is Lost and sits out the next battle. Make it through every encounter for the site's bonus.`,
    `Solo patrol (Start a solo patrol on the Battle page): up to ${SOLO_PATROL.points} pts of one force against the AI, a quick game of about 45 minutes. Record it like any battle: the units earn ${PARTICIPATION_XP} participation XP plus their kill XP, but no RP, reward rolls or Marked for Greatness. A win still counts as a patrol against the Echoes (lowering their threat) and earns a Strategic Asset.`,
  ],
  catchUp: [
    `Factions that fall behind get help: at each round's end, a faction gains +1 Umbra Shard for every ${R.underdogStep} sectors it's behind the faction holding the most (up to +${R.underdogMax}), paid with its round income.`,
  ],
  shop: [
    'Umbra Shards (US) come from sector income, match bonuses and rewards. Spend them on the Umbra Shard shop on your force page.',
    `A Relic Collector home makes Nexus Relics ${R.relicCollectorDiscount} US cheaper.`,
  ],
};
