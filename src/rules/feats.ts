// Feats: the hardest Sortie and Training challenges. A unique feat pays a real reward once, for the whole faction in a
// campaign (once per force outside one); a repeatable feat pays a smaller one, once a round for the faction (once a week
// for the force outside a campaign).

import type { Force } from '../model/types';

export type FeatId =
  | 'sortieTop' | 'sortieFlawless' | 'sortieAsc4' | 'sortieAsc8' | 'sortieHeat' | 'sortieNemesis'
  | 'train20' | 'train25' | 'train30' | 'trainLord' | 'trainWin' | 'trainBosses' | 'trainEndless' | 'trainFinal40'
  | 'trainFinal50' | 'trainAllLords' | 'siege6' | 'siege10' | 'siege15' | 'siege20' | 'siege25'
  | 'sortieRepTop' | 'sortieRepWhole' | 'trainRep20' | 'trainRepLord' | 'trainRepWin' | 'siegeRep';

/** What a feat pays: Requisition, Supply and Umbra Shards to the force, XP to each unit that took part, and a relic
 *  (by name: a Training-only one, RelicDef.training) any unit of the force may then take for free. */
export interface FeatReward { rp?: number; supply?: number; us?: number; xp?: number; relic?: string }

/** `hard`: listed under the hard feats. `repeat`: repeatable, once a round (rewards stay small: Umbra Shards only). */
export interface Feat { id: FeatId; where: 'sortie' | 'training'; name: string; text: string; reward: FeatReward; hard?: boolean; repeat?: boolean }

export const FEATS: Feat[] = [
  { id: 'sortieTop', where: 'sortie', name: 'Peak of the Road', text: 'Win a Sortie at the top tier.', reward: { rp: 5, supply: 100 } },
  { id: 'sortieFlawless', where: 'sortie', name: 'Not One Lost', text: 'Win a Sortie at the top tier with no unit wiped out.', reward: { rp: 5, xp: 2 } },
  { id: 'sortieAsc4', where: 'sortie', name: 'Ascendant', text: 'Win a Sortie at Ascension 4 or higher.', reward: { rp: 5, us: 3 } },
  { id: 'sortieAsc8', where: 'sortie', name: 'Beyond the Curses', text: 'Win a Sortie with every Ascension curse.', reward: { rp: 10, us: 6 } },
  { id: 'sortieHeat', where: 'sortie', name: 'Pactbreaker', text: 'Slay an Echo lord under 6 or more pact heat.', reward: { us: 3, xp: 1 } },
  { id: 'sortieNemesis', where: 'sortie', name: 'Old Debts', text: 'Slay an Echo lord that holds the deepest grudge against the force.', reward: { rp: 5, supply: 50 } },
  { id: 'train20', where: 'training', name: 'Iron Line', text: 'Clear 20 waves in one training run.', reward: { rp: 1 } },
  { id: 'train25', where: 'training', name: 'Unbroken', text: 'Clear 25 waves in one training run.', reward: { rp: 1, supply: 50 } },
  { id: 'train30', where: 'training', name: 'The Last Wall', text: 'Clear 30 waves in one training run.', reward: { us: 3, xp: 1 } },
  { id: 'trainLord', where: 'training', name: 'Lordfall', text: 'Slay an Echo Lord in a training run: any Final wave’s lord, the nemesis, or one of the Nexus’s own.', reward: { rp: 1 } },
  { id: 'trainWin', where: 'training', name: 'First Victory', text: 'Win a Final wave (25 or later).', reward: { rp: 1 } },
  { id: 'trainBosses', where: 'training', name: 'Bosshunter', text: 'Slay 5 boss waves’ bosses in one training run.', reward: { us: 2 } },
  { id: 'trainEndless', where: 'training', name: 'Into the Dark', text: 'Clear 5 Endless waves past a Final.', reward: { us: 2 } },
  { id: 'siege6', where: 'training', name: 'Chip the Giant', text: 'Deal 6,000 damage to the Weekly Siege’s colossus.', reward: { us: 3 } },
  { id: 'trainFinal40', where: 'training', name: 'Deeper Still', text: 'Open the Final at 40 waves.', reward: { us: 6 }, hard: true },
  { id: 'trainFinal50', where: 'training', name: 'The Last Lord', text: 'Open the Final at 50 waves.', reward: { relic: 'Crown of the Last Lord', rp: 3, supply: 500 }, hard: true },
  { id: 'trainAllLords', where: 'training', name: 'Every Crown Broken', text: 'Slay every Final lord: win the Final at 25, 30, 35, 40, 45 and 50 waves (across runs).', reward: { rp: 3, supply: 500 }, hard: true },
  { id: 'siege10', where: 'training', name: 'Giant’s Bane', text: 'Deal 10,000 damage to the Weekly Siege’s colossus.', reward: { rp: 2 }, hard: true },
  { id: 'siege15', where: 'training', name: 'Felling Blow', text: 'Deal 15,000 damage to the Weekly Siege’s colossus.', reward: { us: 6 }, hard: true },
  { id: 'siege20', where: 'training', name: 'Mountain Breaker', text: 'Deal 20,000 damage to the Weekly Siege’s colossus.', reward: { rp: 3, supply: 500 }, hard: true },
  { id: 'siege25', where: 'training', name: 'Colossus Slayer', text: 'Deal 25,000 damage to the Weekly Siege’s colossus.', reward: { relic: 'Colossus Splinter' }, hard: true },
  { id: 'sortieRepTop', where: 'sortie', name: 'Glory Road', text: 'Win a Sortie at the top tier.', reward: { us: 2 }, repeat: true },
  { id: 'sortieRepWhole', where: 'sortie', name: 'All Come Home', text: 'Win a Sortie with no unit wiped out.', reward: { us: 1 }, repeat: true },
  { id: 'trainRep20', where: 'training', name: 'Hold Fast', text: 'Clear 20 waves in one training run.', reward: { us: 1 }, repeat: true },
  { id: 'trainRepLord', where: 'training', name: 'Crownbreaker', text: 'Slay an Echo Lord in a training run.', reward: { us: 1 }, repeat: true },
  { id: 'trainRepWin', where: 'training', name: 'Final Honours', text: 'Win a Final wave.', reward: { us: 1 }, repeat: true },
  { id: 'siegeRep', where: 'training', name: 'Siege Breaker', text: 'Deal 10,000 damage to the Weekly Siege’s colossus.', reward: { us: 2 }, repeat: true },
];

export const featInfo = (id: string) => FEATS.find((f) => f.id === id);

export const hasFeat = (force: Force, id: FeatId) => !!force.feats?.[id];

/** The forces a feat is counted across: the force's faction in a campaign (`forces`: every force there is), else the
 *  force alone. */
export const featFaction = (force: Force, forces?: Force[], inCampaign = true): Force[] =>
  inCampaign && force.nexus?.factionId && forces
    ? [force, ...forces.filter((f) => f.id !== force.id && f.nexus?.factionId === force.nexus!.factionId)]
    : [force];

/** Who earned the unique feat: the force or another of its faction (`faction` from featFaction). */
export const featHolder = (faction: Force[], id: string) => faction.find((f) => f.feats?.[id]);

/** Who did the repeatable feat this round or week (`key`, from offTableKey), if any of the faction did. */
export const repeatHolder = (faction: Force[], id: string, key: string) => faction.find((f) => f.featRepeats?.[id]?.key === key);

export function rewardText(r: FeatReward): string {
  return [
    r.rp ? `${r.rp} RP` : '',
    r.supply ? `${r.supply} Supply` : '',
    r.us ? `${r.us} Umbra Shard${r.us === 1 ? '' : 's'}` : '',
    r.xp ? `+${r.xp} XP each` : '',
    r.relic ? `the relic ${r.relic}` : '',
  ].filter(Boolean).join(', ');
}

/** What a finished training run (and the force's Final ladder after it) did, beyond its waves and campaign lords
 *  (training/featFacts.ts). */
export interface TrainingFeatFacts {
  /** A Final wave's lord or the nemesis slain. */
  finalLord?: boolean;
  /** The run won its Final. */
  won?: boolean;
  /** Bosses slain this run. */
  bosses?: number;
  /** Endless waves cleared past the Final. */
  endless?: number;
  /** The Final the force has open now. */
  open?: number;
  /** Every Final the force has won. */
  wins?: number[];
  /** A siege's damage to the colossus. */
  siege?: number;
}

const SIEGE_FEATS: [FeatId, number][] = [['siege6', 6000], ['siege10', 10000], ['siege15', 15000], ['siege20', 20000], ['siege25', 25000]];
const ALL_FINALS = [25, 30, 35, 40, 45, 50];

/** The training feats a run of `cleared` waves earns, slaying `lords` of the campaign's real Echo Lords, and what else
 *  it and the force's ladder did (`more`). */
export const trainingFeats = (cleared: number, lords = 0, more: TrainingFeatFacts = {}): FeatId[] => [
  ...([['train20', 20], ['train25', 25], ['train30', 30]] as [FeatId, number][]).filter(([, n]) => cleared >= n).map(([id]) => id),
  ...(lords > 0 || more.finalLord ? ['trainLord' as const] : []),
  ...(more.won ? ['trainWin' as const] : []),
  ...((more.bosses ?? 0) >= 5 ? ['trainBosses' as const] : []),
  ...((more.endless ?? 0) >= 5 ? ['trainEndless' as const] : []),
  ...((more.open ?? 0) >= 40 ? ['trainFinal40' as const] : []),
  ...((more.open ?? 0) >= 50 ? ['trainFinal50' as const] : []),
  ...(ALL_FINALS.every((n) => more.wins?.includes(n)) ? ['trainAllLords' as const] : []),
  ...SIEGE_FEATS.filter(([, n]) => (more.siege ?? 0) >= n).map(([id]) => id),
];

/** The repeatable training feats the same run earns (see trainingFeats). */
export const trainingRepeats = (cleared: number, lords = 0, more: TrainingFeatFacts = {}): FeatId[] => [
  ...(cleared >= 20 ? ['trainRep20' as const] : []),
  ...(lords > 0 || more.finalLord ? ['trainRepLord' as const] : []),
  ...(more.won ? ['trainRepWin' as const] : []),
  ...((more.siege ?? 0) >= 10000 ? ['siegeRep' as const] : []),
];

/**
 * Pay the feats: a unique one only if no force of `faction` (featFaction; the force alone if left out) has earned it,
 * a repeatable one only if none did it this round or week (`key`, from offTableKey; without a key none is paid). Umbra
 * Shards and XP straight away, RP and Supply on the ledger. Returns a line for each feat paid.
 */
export function awardFeats(force: Force, ids: FeatId[], unitIds: string[], date: string, newId: () => string, faction: Force[] = [force], key?: string): string[] {
  const out: string[] = [];
  const all = faction.includes(force) ? faction : [force, ...faction];
  for (const id of ids) {
    const feat = featInfo(id);
    if (!feat) continue;
    if (feat.repeat) {
      if (!key || repeatHolder(all, id, key)) continue;
      const rec = (force.featRepeats ??= {})[id];
      force.featRepeats[id] = { key, n: (rec?.n ?? 0) + 1, last: date };
    } else {
      if (featHolder(all, id)) continue;
      (force.feats ??= {})[id] = date;
    }
    const r = feat.reward;
    if (r.us) force.umbraShards += r.us;
    if (r.xp) for (const u of force.units) if (unitIds.includes(u.id) && u.status !== 'removed') u.xp += r.xp;
    if (r.relic && !force.trainingRelics?.includes(r.relic)) (force.trainingRelics ??= []).push(r.relic);
    const line = `${feat.repeat ? 'Repeatable feat' : 'Feat'} — ${feat.name}: ${rewardText(r)}`;
    force.ledger.push({ id: newId(), date, label: line, rp: r.rp ?? 0, supply: r.supply ?? 0, ...(r.us ? { us: r.us } : {}) });
    out.push(line);
  }
  return out;
}

/** Bump when feat rewards drop again and feats already paid must give the difference back (clawbackFeats). */
export const FEATS_VERSION = 2;

/** What feats paid before version 2 cut them. */
const PAID_V1: Partial<Record<FeatId, FeatReward>> = { train20: { rp: 3 }, train25: { rp: 3, supply: 100 }, trainLord: { rp: 3 } };

/**
 * Once a force (force.featsV): take back what feats paid over their new rewards. Only a feat whose ledger line shows
 * the old pay gives anything back, and the balance may go negative. The store runs it on every force this device may
 * change; a feat paid at the new rewards shows them in its line, so gives nothing back. Returns the one ledger line it adds, or null.
 */
export function clawbackFeats(force: Force, date: string, newId: () => string): string | null {
  // A force that never claimed one of them has nothing to give back, and is left untouched.
  if ((force.featsV ?? 1) >= FEATS_VERSION || !Object.keys(PAID_V1).some((id) => force.feats?.[id])) return null;
  force.featsV = FEATS_VERSION;
  let rp = 0;
  let supply = 0;
  const names: string[] = [];
  for (const [id, old] of Object.entries(PAID_V1) as [FeatId, FeatReward][]) {
    const feat = featInfo(id)!;
    if (!force.feats?.[id]) continue;
    const paid = force.ledger.some((l) => l.label.startsWith(`Feat — ${feat.name}:`) && l.rp === (old.rp ?? 0) && l.supply === (old.supply ?? 0));
    if (!paid) continue;
    rp += (old.rp ?? 0) - (feat.reward.rp ?? 0);
    supply += (old.supply ?? 0) - (feat.reward.supply ?? 0);
    names.push(feat.name);
  }
  if (!names.length) return null;
  const line = `Feats rebalanced — ${names.join(', ')} now pay less, and the difference goes back`;
  force.ledger.push({ id: newId(), date, label: line, rp: -rp, supply: -supply });
  return line;
}

/**
 * A unique feat a second force of the faction earned again, before feats counted once for the whole faction: it goes
 * back to the force that earned it first (the earlier date; on the same day, the force listed first in `forces`), and
 * the later one gives back the RP, Supply and Umbra Shards its ledger line shows. XP stays. Runs each time the store
 * tidies a force this device may change; once a duplicate is gone there's nothing more to do. Returns the ledger line it adds, or null.
 */
export function clawbackDuplicateFeats(force: Force, forces: Force[], date: string, newId: () => string): string | null {
  if (!force.feats || !force.nexus?.factionId) return null;
  const mine = forces.indexOf(force);
  const others = featFaction(force, forces).filter((f) => f !== force);
  let rp = 0;
  let supply = 0;
  let us = 0;
  const names: string[] = [];
  for (const [id, on] of Object.entries(force.feats) as [FeatId, string][]) {
    const first = others.some((f) => {
      const at = f.feats?.[id];
      return at && (at < on || (at === on && forces.indexOf(f) < mine));
    });
    const feat = featInfo(id);
    if (!first || !feat || feat.repeat) continue;
    delete force.feats[id];
    const paid = [...force.ledger].reverse().find((l) => l.label.startsWith(`Feat — ${feat.name}:`));
    rp += paid?.rp ?? 0;
    supply += paid?.supply ?? 0;
    us += paid?.us ?? 0;
    names.push(feat.name);
  }
  if (!names.length) return null;
  force.umbraShards -= us;
  const line = `Feats already earned by your faction — ${names.join(', ')}: each pays once for the faction, so this force gives them back`;
  force.ledger.push({ id: newId(), date, label: line, rp: -rp, supply: -supply, ...(us ? { us: -us } : {}) });
  return line;
}
