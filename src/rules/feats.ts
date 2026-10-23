// Feats: the hardest Sortie and Training challenges, each paying a real reward once per force.

import type { Force } from '../model/types';

export type FeatId =
  | 'sortieTop' | 'sortieFlawless' | 'sortieAsc4' | 'sortieAsc8' | 'sortieHeat' | 'sortieNemesis'
  | 'train20' | 'train25' | 'train30';

/** What a feat pays: Requisition, Supply and Umbra Shards to the force, XP to each unit that took part. */
export interface FeatReward { rp?: number; supply?: number; us?: number; xp?: number }

export interface Feat { id: FeatId; where: 'sortie' | 'training'; name: string; text: string; reward: FeatReward }

export const FEATS: Feat[] = [
  { id: 'sortieTop', where: 'sortie', name: 'Peak of the Road', text: 'Win a Sortie at the top tier.', reward: { rp: 5, supply: 100 } },
  { id: 'sortieFlawless', where: 'sortie', name: 'Not One Lost', text: 'Win a Sortie at the top tier with no unit wiped out.', reward: { rp: 5, xp: 2 } },
  { id: 'sortieAsc4', where: 'sortie', name: 'Ascendant', text: 'Win a Sortie at Ascension 4 or higher.', reward: { rp: 5, us: 3 } },
  { id: 'sortieAsc8', where: 'sortie', name: 'Beyond the Curses', text: 'Win a Sortie with every Ascension curse.', reward: { rp: 10, us: 6 } },
  { id: 'sortieHeat', where: 'sortie', name: 'Pactbreaker', text: 'Slay an Echo lord under 6 or more pact heat.', reward: { us: 3, xp: 1 } },
  { id: 'sortieNemesis', where: 'sortie', name: 'Old Debts', text: 'Slay an Echo lord that holds the deepest grudge against the force.', reward: { rp: 5, supply: 50 } },
  { id: 'train20', where: 'training', name: 'Iron Line', text: 'Clear 20 waves in one training run.', reward: { rp: 3 } },
  { id: 'train25', where: 'training', name: 'Unbroken', text: 'Clear 25 waves in one training run.', reward: { rp: 3, supply: 100 } },
  { id: 'train30', where: 'training', name: 'The Last Wall', text: 'Clear 30 waves in one training run.', reward: { us: 3, xp: 1 } },
];

export const featInfo = (id: string) => FEATS.find((f) => f.id === id);

export const hasFeat = (force: Force, id: FeatId) => !!force.feats?.[id];

export function rewardText(r: FeatReward): string {
  return [
    r.rp ? `${r.rp} RP` : '',
    r.supply ? `${r.supply} Supply` : '',
    r.us ? `${r.us} Umbra Shard${r.us === 1 ? '' : 's'}` : '',
    r.xp ? `+${r.xp} XP each` : '',
  ].filter(Boolean).join(', ');
}

/** The training feats a run of `cleared` waves earns. */
export const trainingFeats = (cleared: number): FeatId[] =>
  ([['train20', 20], ['train25', 25], ['train30', 30]] as [FeatId, number][]).filter(([, n]) => cleared >= n).map(([id]) => id);

/**
 * Pay the feats the force hasn't earned before: Umbra Shards and XP straight away, RP and Supply on the ledger.
 * Returns a line for each feat paid.
 */
export function awardFeats(force: Force, ids: FeatId[], unitIds: string[], date: string, newId: () => string): string[] {
  const out: string[] = [];
  for (const id of ids) {
    const feat = featInfo(id);
    if (!feat || hasFeat(force, id)) continue;
    (force.feats ??= {})[id] = date;
    const r = feat.reward;
    if (r.us) force.umbraShards += r.us;
    if (r.xp) for (const u of force.units) if (unitIds.includes(u.id) && u.status !== 'removed') u.xp += r.xp;
    const line = `Feat — ${feat.name}: ${rewardText(r)}`;
    force.ledger.push({ id: newId(), date, label: line, rp: r.rp ?? 0, supply: r.supply ?? 0, ...(r.us ? { us: r.us } : {}) });
    out.push(line);
  }
  return out;
}
