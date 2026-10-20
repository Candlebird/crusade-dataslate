// Downtime between games: Expeditions (a short dice story into the Nexus) and the bookkeeping for solo patrols.
import type { Force, Unit } from '../model/types';
import { SCAR_TABLE } from './data';
import { EXPEDITION, EXPEDITION_SITES, type ExpeditionEncounter, type ExpeditionReward, type ExpeditionSite } from './downtimeData';
import { applyScar, levelForXp } from './engine';

type Rand = () => number;

const d6 = (rand: Rand) => 1 + Math.floor(rand() * 6);

export type ExpeditionPhase = 'encounter' | 'crossroads' | 'done';

/** What happened to a squad unit on the way: a battle scar, or Lost (sits out the next battle). */
export interface ExpeditionInjury {
  unitId: string;
  scar?: string;
}

export interface Expedition {
  site: string;
  squad: string[];
  /** Encounter ids, in the order the squad meets them. */
  deck: string[];
  /** Index of the current encounter in the deck. */
  stage: number;
  phase: ExpeditionPhase;
  haul: Required<ExpeditionReward>;
  danger: number;
  injuries: ExpeditionInjury[];
  log: string[];
  /** Made it through every encounter. */
  finished: boolean;
}

export const expeditionSite = (id: string): ExpeditionSite | undefined => EXPEDITION_SITES.find((s) => s.id === id);

export function currentEncounter(e: Expedition): ExpeditionEncounter | undefined {
  return expeditionSite(e.site)?.encounters.find((x) => x.id === e.deck[e.stage]);
}

/** +1 to the squad's rolls when one of its units is a veteran. */
export function squadBonus(units: Unit[]): number {
  return units.some((u) => levelForXp(u.xp) >= EXPEDITION.veteranLevel) ? 1 : 0;
}

/** A reward scaled by how deep the squad is: XP and Supply grow, RP and shards don't. */
export function scaledReward(r: ExpeditionReward, stage: number): Required<ExpeditionReward> {
  const m = EXPEDITION.depth[Math.min(stage, EXPEDITION.depth.length - 1)];
  return {
    xp: Math.floor((r.xp ?? 0) * m),
    supply: Math.round(((r.supply ?? 0) * m) / 5) * 5,
    rp: r.rp ?? 0,
    us: r.us ?? 0,
  };
}

export function rewardText(r: ExpeditionReward): string {
  const parts = [r.xp ? `+${r.xp} XP each` : '', r.supply ? `+${r.supply} Supply` : '', r.rp ? `+${r.rp} RP` : '', r.us ? `+${r.us} US` : ''];
  return parts.filter(Boolean).join(', ') || 'nothing';
}

const addReward = (a: Required<ExpeditionReward>, b: ExpeditionReward) => {
  a.xp += b.xp ?? 0;
  a.supply += b.supply ?? 0;
  a.rp += b.rp ?? 0;
  a.us += b.us ?? 0;
};

export function startExpedition(siteId: string, squad: string[], rand: Rand = Math.random): Expedition {
  const site = expeditionSite(siteId);
  if (!site) throw new Error(`Unknown expedition site ${siteId}`);
  const deck = site.encounters.map((x) => x.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return {
    site: siteId, squad: squad.slice(0, EXPEDITION.squadMax), deck: deck.slice(0, EXPEDITION.encounters), stage: 0, phase: 'encounter',
    haul: { xp: 0, supply: 0, rp: 0, us: 0 }, danger: 0, injuries: [], log: [], finished: false,
  };
}

export interface ChoiceResult {
  /** The D6 rolled (undefined when the choice needs no roll). */
  roll?: number;
  success: boolean;
  text: string;
  gained: Required<ExpeditionReward>;
}

/** Take one of the current encounter's choices: roll a D6 (+bonus) against its target. A natural 1 always fails. */
export function chooseOption(e: Expedition, index: number, bonus = 0, rand: Rand = Math.random): ChoiceResult | undefined {
  const enc = currentEncounter(e);
  const choice = enc?.choices[index];
  if (!enc || !choice || e.phase !== 'encounter') return undefined;
  const roll = choice.target ? d6(rand) : undefined;
  const success = roll === undefined || (roll !== 1 && roll + bonus >= choice.target);
  const gained = success ? scaledReward(choice.reward, e.stage) : { xp: 0, supply: 0, rp: 0, us: 0 };
  if (success) addReward(e.haul, gained);
  else e.danger += roll === 1 ? EXPEDITION.fumbleDanger : EXPEDITION.failDanger;
  const text = success ? choice.win : choice.lose;
  const rolled = roll === undefined ? '' : ` (rolled ${roll}${bonus ? `+${bonus}` : ''}, needed ${choice.target}+)`;
  e.log.push(`${enc.title} — ${choice.label}${rolled}: ${text}${success && rewardText(gained) !== 'nothing' ? ` ${rewardText(gained)}.` : ''}`);
  if (e.stage >= e.deck.length - 1) finish(e);
  else e.phase = 'crossroads';
  return { roll, success, text, gained };
}

function finish(e: Expedition) {
  const site = expeditionSite(e.site)!;
  addReward(e.haul, site.finish.reward);
  e.log.push(`${site.finish.text} ${rewardText(site.finish.reward)}.`);
  e.finished = true;
  e.phase = 'done';
}

/** Turn back with what the squad has: always safe. */
export function headHome(e: Expedition) {
  if (e.phase === 'done') return;
  e.log.push('The squad heads home with its haul.');
  e.phase = 'done';
}

export interface PressOnResult {
  roll: number;
  ambush?: ExpeditionInjury;
}

/** Go deeper: roll a D6, and if it's no higher than the danger the squad is ambushed and one of its units is hurt. */
export function pressOn(e: Expedition, rand: Rand = Math.random): PressOnResult | undefined {
  if (e.phase !== 'crossroads') return undefined;
  const roll = d6(rand);
  let ambush: ExpeditionInjury | undefined;
  if (roll <= e.danger && e.squad.length) {
    const unitId = e.squad[Math.floor(rand() * e.squad.length)];
    if (d6(rand) <= EXPEDITION.ambushScarOn) {
      const scars = SCAR_TABLE.filter((s) => s.name !== 'Comatose');
      ambush = { unitId, scar: scars[Math.floor(rand() * scars.length)].name };
    } else ambush = { unitId };
    e.injuries.push(ambush);
  }
  e.log.push(`The squad presses on (rolled ${roll}, danger ${e.danger})${ambush ? ': ambushed!' : '.'}`);
  e.stage++;
  e.phase = 'encounter';
  return { roll, ambush };
}

/** Pay the haul and the injuries to the force. Returns a one-line summary. */
export function applyExpedition(force: Force, e: Expedition, date: string, newId: () => string): string {
  const site = expeditionSite(e.site)!;
  const squad = force.units.filter((u) => e.squad.includes(u.id) && u.status !== 'removed');
  for (const u of squad) u.xp += e.haul.xp;
  const hurt: string[] = [];
  for (const inj of e.injuries) {
    const u = force.units.find((x) => x.id === inj.unitId);
    if (!u || u.status === 'removed') continue;
    if (inj.scar) {
      const r = applyScar(u, { id: newId(), name: inj.scar, desc: SCAR_TABLE.find((s) => s.name === inj.scar)?.desc });
      hurt.push(`${u.name}: ${inj.scar}${r === 'removed' ? ' (removed)' : ''}`);
    } else {
      u.status = 'comatose';
      hurt.push(`${u.name}: Lost, sits out the next battle`);
    }
  }
  force.umbraShards += e.haul.us;
  const summary = [`Expedition — ${site.name}${e.finished ? ' (completed)' : ''}: ${rewardText(e.haul)}`, ...hurt].join('; ');
  force.ledger.push({ id: newId(), date, label: summary, rp: e.haul.rp, supply: e.haul.supply, ...(e.haul.us ? { us: e.haul.us } : {}) });
  return summary;
}
