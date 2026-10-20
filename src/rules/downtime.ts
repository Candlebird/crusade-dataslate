// Downtime between games: Expeditions (a short dice story into the Nexus) and the bookkeeping for solo patrols.
import type { Force, Unit } from '../model/types';
import { SCAR_TABLE } from './data';
import { EXPEDITION, EXPEDITION_SITES, SOLO_PATROL, type ExpeditionCheck, type ExpeditionReward, type ExpeditionSite, type ExpeditionVariant } from './downtimeData';
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
  /** Which variant of each encounter in the deck the squad meets. */
  variants?: number[];
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

/** The encounter the squad is at, in the variant it drew. */
export function currentEncounter(e: Expedition): (ExpeditionVariant & { id: string }) | undefined {
  const enc = expeditionSite(e.site)?.encounters.find((x) => x.id === e.deck[e.stage]);
  if (!enc) return undefined;
  return { id: enc.id, ...(enc.variants[e.variants?.[e.stage] ?? 0] ?? enc.variants[0]) };
}

/** Added to the squad's rolls: +1 for each unit after the first, and +1 for every few levels across the squad. */
export function squadBonus(units: Unit[]): number {
  if (!units.length) return 0;
  const levels = units.reduce((n, u) => n + levelForXp(u.xp), 0);
  return Math.min(EXPEDITION.bonusCap, units.length - 1 + Math.floor(levels / EXPEDITION.levelsPerBonus));
}

/** A check's dice and target, written the way the dice are rolled: "3D6, 12+". */
export function checkText(check: ExpeditionCheck): string {
  const c = EXPEDITION.checks[check];
  return `${c.dice}D6, ${c.target}+`;
}

/** Chance (0-1) of passing a check with this bonus. */
export function checkOdds(check: ExpeditionCheck, bonus: number): number {
  const { dice, target } = EXPEDITION.checks[check];
  // Ways to roll each total on the dice, built up one die at a time.
  let ways = [1];
  for (let d = 0; d < dice; d++) {
    const next = new Array(ways.length + 6).fill(0);
    ways.forEach((w, t) => { for (let f = 1; f <= 6; f++) next[t + f] += w; });
    ways = next;
  }
  const pass = ways.reduce((n, w, t) => (t > dice && t + bonus >= target ? n + w : n), 0);
  return pass / 6 ** dice;
}

/** A reward scaled by how deep the squad is: XP and Supply grow, RP and shards don't. */
export function scaledReward(r: ExpeditionReward, stage: number): Required<ExpeditionReward> {
  const m = EXPEDITION.depth[Math.min(stage, EXPEDITION.depth.length - 1)];
  return {
    xp: Math.round((r.xp ?? 0) * m),
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
  const all = site.encounters.map((x) => x.id);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const deck = all.slice(0, EXPEDITION.encounters);
  const variants = deck.map((id) => Math.floor(rand() * site.encounters.find((x) => x.id === id)!.variants.length));
  return {
    site: siteId, squad: squad.slice(0, EXPEDITION.squadMax), deck, variants, stage: 0, phase: 'encounter',
    haul: { xp: 0, supply: 0, rp: 0, us: 0 }, danger: 0, injuries: [], log: [], finished: false,
  };
}

export interface ChoiceResult {
  /** The dice rolled (undefined when the choice needs no roll). */
  dice?: number[];
  /** Missed badly: all 1s, or short by a lot. */
  fumble?: boolean;
  success: boolean;
  text: string;
  gained: Required<ExpeditionReward>;
}

/** Take one of the current encounter's choices: roll its check's dice (+bonus) against the target. All 1s always fails. */
export function chooseOption(e: Expedition, index: number, bonus = 0, rand: Rand = Math.random): ChoiceResult | undefined {
  const enc = currentEncounter(e);
  const choice = enc?.choices[index];
  if (!enc || !choice || e.phase !== 'encounter') return undefined;
  const check = choice.check ? EXPEDITION.checks[choice.check] : undefined;
  const dice = check ? Array.from({ length: check.dice }, () => d6(rand)) : undefined;
  const total = dice ? dice.reduce((a, b) => a + b, 0) + bonus : 0;
  const allOnes = !!dice && dice.every((x) => x === 1);
  const success = !check || (!allOnes && total >= check.target);
  const fumble = !!check && !success && (allOnes || total <= check.target - EXPEDITION.fumbleMiss);
  const gained = success ? scaledReward(choice.reward, e.stage) : { xp: 0, supply: 0, rp: 0, us: 0 };
  if (success) addReward(e.haul, gained);
  else e.danger += fumble ? EXPEDITION.fumbleDanger : EXPEDITION.failDanger;
  const text = success ? choice.win : choice.lose;
  const rolled = !dice || !check ? '' : ` (rolled ${dice.join('+')}${bonus ? ` +${bonus}` : ''} = ${total}, needed ${check.target}${fumble ? ': fumble' : ''})`;
  e.log.push(`${enc.title} — ${choice.label}${rolled}: ${text}${success && rewardText(gained) !== 'nothing' ? ` ${rewardText(gained)}.` : ''}`);
  if (e.stage >= e.deck.length - 1) finish(e);
  else e.phase = 'crossroads';
  return { dice, fumble, success, text, gained };
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

/** The size of the enemy a solo patrol runs into. */
export function rollPatrolEnemy(rand: Rand = Math.random): number {
  const steps = Math.floor((SOLO_PATROL.enemyMax - SOLO_PATROL.enemyMin) / SOLO_PATROL.enemyStep);
  return SOLO_PATROL.enemyMin + Math.min(steps, Math.floor(rand() * (steps + 1))) * SOLO_PATROL.enemyStep;
}

/** A patrol that turns the fight down: each unit still gets a little XP for spotting the enemy. Returns a one-line summary. */
export function declinePatrol(force: Force, unitIds: string[], enemyPoints: number, date: string, newId: () => string): string {
  const units = force.units.filter((u) => unitIds.includes(u.id) && u.status === 'active');
  for (const u of units) u.xp += SOLO_PATROL.declineXp;
  const summary = `Solo patrol — turned down a ${enemyPoints} pts enemy: +${SOLO_PATROL.declineXp} XP to ${units.map((u) => u.name || u.unitType).join(', ')}`;
  force.ledger.push({ id: newId(), date, label: summary, rp: 0, supply: 0 });
  return summary;
}
