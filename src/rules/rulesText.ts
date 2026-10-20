import {
  BATTLE_RP, LEVEL_THRESHOLDS, MARKED_XP, MAX_AGENDAS, MAX_NORMAL_TRAITS, MAX_SCARS, MAX_UNIQUE_TRAITS, MAX_WEAPON_TRAITS,
  NO_AGENDA_XP, PARTICIPATION_XP, POST_MAX_REPLACE_STEP, STARTING_SUPPLY, SUFFERING_BP_STEP,
} from './data';
import { ECHOES, NEXUS_ROUNDS, UMBRA_SHOP } from './nexusData';

// The prose of the Rules page: the group's Crusade and Nexus Wars docs, reworded where the app's rules have moved on.
// The tables on that page come straight from data.ts and nexusData.ts; this file holds only the text around them,
// and reads its numbers from those files so the two never disagree.

const R = NEXUS_ROUNDS;
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
  ],
  rounds: [
    'The campaign is played in rounds. Play as many matches as your group manages in a round; when everyone is done, the GM ends it on the Nexus Wars page.',
    `When a round ends, what every faction holds is noted, and each player claims that round's sector income on their force page with "Claim round income". Income is paid once per round, however many games you played. Missed rounds wait for you: up to ${R.keepRounds} ended rounds can be claimed late.`,
    `Every match you play in a round also pays ${R.matchBonusUs} Umbra Shard, for up to ${R.matchBonusMax} matches a round, on top of the normal Crusade rewards.`,
    'Temporary unlocks (a Research station\'s table, an Anomaly\'s "all tables") last until your next round income.',
  ],
  attacking: [
    'Unclaimed sectors: challenge another player, and the winner takes the sector, or play a game against the AI.',
    'Claimed sectors: challenge the owner. The winner takes the sector.',
    'Reinforcements stay with the sector, not the faction: when a sector changes hands, any Reinforce Sector on it is lost.',
    'Games for a sector must be reported to the GM (or recorded in the app) so the map stays current.',
  ],
  home: [
    `A home sector can be challenged at most once per round, and not at all in the opening rounds (until round ${R.graceRounds + 1}).`,
    'Whoever wins a home-sector challenge, attacker or defender, gains one round of the loser\'s sector income on top of their own. The loser gets only the basic Crusade rewards and forfeits their Nexus rewards for that match. The home sector never changes hands.',
  ],
  echoes: [
    `The ${ECHOES.name} are the AI's faction. They hold the Voidspawn sectors, which can be attacked but never taken, and spread out from their territory into neighbouring sectors when a round ends.`,
    `Their threat starts at ${R.threatStart} and runs from 0 to ${R.threatMax}. When a round ends it rises by ${R.threatPerRound}, then falls by ${R.threatPerWin} for every win against the Echoes that round (${R.threatPerVoidspawnWin} for a win at a Voidspawn). The new threat sets how many sectors they spread into.`,
    `They go after whoever is ahead: sectors held by the faction with the most sectors are ${R.leaderWeight} times as likely to be hit. In the opening rounds (rounds 1–${R.graceRounds}) they only spread into unclaimed sectors.`,
    `Bounty: retaking a sector from the ${ECHOES.name} earns a free roll on the AI special table, on top of the match rewards.`,
  ],
  catchUp: [
    `Factions that fall behind get help: at each round's end, a faction gains +1 Umbra Shard for every ${R.underdogStep} sectors it's behind the faction holding the most (up to +${R.underdogMax}), paid with its round income.`,
  ],
  shop: [
    'Umbra Shards (US) come from sector income, match bonuses and rewards. Spend them on the Umbra Shard shop on your force page.',
    `A Relic Collector home makes Nexus Relics ${R.relicCollectorDiscount} US cheaper.`,
  ],
};
