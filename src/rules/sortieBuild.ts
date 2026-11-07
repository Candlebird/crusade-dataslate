import { SORTIE, SORTIE_BOONS, type SortieBoonId, type SortieBoonTier } from './downtimeData';
import {
  bossOf, boonDrawText, boonLabel, goalText, heldBoon, isSpecial, omensRead, roleOfMember, sigWeaker, specChoices, specDue, stratagemsDue,
  unitSheet, type SortieRun, type SortieSheet,
} from './sortie';

// The Sortie build panel's numbers: each unit with its boons on, the stratagems the party holds or is building, its
// boons, and what it knows of the lord. Open from the map or a fight.

export type SortiePairStatus = 'active' | 'ready' | 'building' | 'missed' | 'locked';

export interface SortieBuild {
  units: (SortieSheet & { role: string; due: boolean; choices: string[] })[];
  boons: { id: SortieBoonId; label: string; tier: SortieBoonTier; text: string; curse: boolean; kind: 'boon' | 'stratagem' | 'trophy' }[];
  pairs: { id: SortieBoonId; name: string; text: string; status: SortiePairStatus; needs: { name: string; held: boolean }[]; lock?: string }[];
  lord: { name: string; sig: string; text: string; weaker: number; omens: string[]; need: number };
  rerolls: number;
}

export const PAIR_STATUS: Record<SortiePairStatus, string> = {
  active: 'Active', ready: 'Ready: in your next offer', building: 'Building', missed: 'Passed over', locked: 'Locked',
};

export function buildOf(run: SortieRun): SortieBuild {
  const held = (id: SortieBoonId) => run.boons.includes(id);
  const due = specDue(run);
  const units = run.party.map((m, i) => ({ ...unitSheet(run, i), role: roleOfMember(m), due: due === i, choices: specChoices(m) }));
  const boons = run.boons.map((id) => {
    const d = heldBoon(run, id);
    const b = SORTIE_BOONS[id];
    return { id, label: boonLabel(run, d), tier: d.tier, text: boonDrawText(run, d), curse: !!b.curse, kind: b.pair ? 'stratagem' as const : b.spoil ? 'trophy' as const : 'boon' as const };
  });
  const ready = stratagemsDue(run);
  // A pair shows once the party holds either half of it.
  const pairs = (Object.keys(SORTIE_BOONS) as SortieBoonId[]).flatMap((id) => {
    const b = SORTIE_BOONS[id];
    if (!b.pair || !b.pair.some(held)) return [];
    const locked = !!run.unlocked && !run.unlocked.includes(id);
    const status: SortiePairStatus = held(id) ? 'active' : locked ? 'locked' : ready.includes(id) ? 'ready' : run.paired?.includes(id) ? 'missed' : 'building';
    const u = SORTIE.unlocks[id];
    return [{
      id, name: b.name, text: b.tiers.Legendary ?? '', status, needs: b.pair.map((x) => ({ name: SORTIE_BOONS[x].name, held: held(x) })),
      ...(locked && u ? { lock: goalText(u.goal, u.n) } : {}),
    }];
  });
  const order: SortiePairStatus[] = ['active', 'ready', 'building', 'locked', 'missed'];
  pairs.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const boss = bossOf(run);
  const read = omensRead(run);
  return {
    units, boons: boons.sort((a, b) => Number(isSpecial(b.id)) - Number(isSpecial(a.id))), pairs, rerolls: run.rerolls ?? 0,
    lord: { name: boss.name, sig: boss.sig.name, text: boss.sig.text, weaker: sigWeaker(run, boss.sig.id), omens: boss.omens.slice(0, read), need: SORTIE.omens.need },
  };
}
