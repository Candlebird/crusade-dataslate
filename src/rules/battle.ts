import type { BattleResult, Force, Unit } from '../model/types';
import {
  BATTLE_RP,
  MARKED_XP,
  NO_AGENDA_XP,
  PARTICIPATION_XP,
  REWARD_TABLES,
  SCAR_TABLE,
  type RewardEntry,
  type RewardTableKey,
} from './data';
import { applyScar, levelForXp, previousBracketXp, sufferingRolls, type DeathOutcome, type ScarResult } from './engine';

// Post-battle resolution ("Gaining Experience", "Gaining RP", "Deaths").
// resolveBattle() mutates a force draft, so the wizard can preview on a clone and apply the same code for real.

export const RISKY_GAMBLE = 'Risky Gamble';
export const RESULT_LABEL: Record<BattleResult, string> = { win: 'Victory', loss: 'Defeat', draw: 'Draw' };

export interface UnitBattle {
  in: boolean;
  destroyed: boolean;
  marked: boolean;
  /** Holding an objective at the end (for "unit holding a point" rewards). */
  holding: boolean;
  kills: number;
  /** Wounds of the models it destroyed (½ per model in 10+ model, 1-wound units). */
  killXp: number;
  /** Agenda and other bonus XP. */
  bonusXp: number;
  death: { dice: number[]; outcome: DeathOutcome } | null;
  /** How a scar was resolved: "scar:<name>" or "trait:<upgradeId>" (lose a trait instead). */
  scar: string;
}

export interface RewardPick {
  /** 1-based roll on the row's table. */
  roll: number | null;
  /** XP distributed per unit, for "to distribute" rewards. */
  alloc: Record<string, number>;
  /** Unit id for single-unit rewards; "<unitId>:<scarId>" or "<unitId>:battle" for scar removal. */
  target: string;
}

export interface BattleInput {
  date: string;
  opponent: string;
  result: BattleResult;
  vsAi: boolean;
  agendas: string[];
  myBp: number;
  oppBp: number;
  notes: string;
  /** Override for the result table ('' = by result). */
  table: RewardTableKey | '';
  /** Extra RP from agendas (Priority Target, Overwhelming Victory, ...). */
  agendaRp: number;
  units: Record<string, UnitBattle>;
  rewards: Record<string, RewardPick>;
}

export interface RewardRow {
  key: string;
  table: RewardTableKey;
  source: string;
  entry: RewardEntry | null;
  /** Not rolled — granted outright (e.g. Risky Gamble). */
  fixed?: boolean;
}

export const emptyPick = (): RewardPick => ({ roll: null, alloc: {}, target: '' });

export function emptyUnitBattle(u: Unit): UnitBattle {
  return { in: u.status === 'active', destroyed: false, marked: false, holding: false, kills: 0, killXp: 0, bonusXp: 0, death: null, scar: '' };
}

export const unitName = (u: Unit) => u.name || u.unitType || 'Unnamed unit';

export function mainTable(input: BattleInput): RewardTableKey {
  if (input.table) return input.table;
  if (input.vsAi) return 'ai';
  return input.result === 'win' ? 'winner' : 'loser';
}

export function participationXp(input: BattleInput): number {
  if (input.agendas.includes(RISKY_GAMBLE) && input.result !== 'win') return 0;
  return input.agendas.length === 0 ? NO_AGENDA_XP : PARTICIPATION_XP;
}

export function sufferingCount(input: BattleInput): number {
  return input.result === 'loss' && !input.vsAi ? sufferingRolls(input.myBp, input.oppBp) : 0;
}

/** Every reward roll this battle earns, with special-table follow-ups inserted after their parent. */
export function rewardRows(input: BattleInput): RewardRow[] {
  const entryOf = (key: string, table: RewardTableKey) => {
    const roll = input.rewards[key]?.roll;
    return roll ? REWARD_TABLES[table].entries[roll - 1] ?? null : null;
  };
  const base: RewardRow[] = [];
  const main = mainTable(input);
  base.push({ key: 'main', table: main, source: REWARD_TABLES[main].label, entry: entryOf('main', main) });
  if (input.agendas.includes(RISKY_GAMBLE) && input.result === 'win')
    base.push({ key: 'gamble', table: main, source: RISKY_GAMBLE, fixed: true, entry: { text: '12 XP to distribute and +1 RP', xp: 12, xpTarget: 'any', rp: 1 } });
  const n = sufferingCount(input);
  for (let i = 0; i < n; i++)
    base.push({ key: `suffer${i}`, table: 'suffering', source: `Growth Through Suffering${n > 1 ? ` ${i + 1}/${n}` : ''}`, entry: entryOf(`suffer${i}`, 'suffering') });

  const rows: RewardRow[] = [];
  for (const r of base) {
    rows.push(r);
    const sub = r.entry?.subtable;
    if (sub) rows.push({ key: `${r.key}/sub`, table: sub, source: REWARD_TABLES[sub].label, entry: entryOf(`${r.key}/sub`, sub) });
  }
  return rows;
}

/** Units eligible for a single-unit XP reward. */
export function xpCandidates(units: Unit[], input: BattleInput, target: RewardEntry['xpTarget']): Unit[] {
  return units.filter((u) => {
    const r = input.units[u.id];
    if (!r?.in) return false;
    if (target === 'survivor') return !r.destroyed;
    if (target === 'holder') return r.holding;
    if (target === 'dead') return r.destroyed;
    return true;
  });
}

/** Scars gained this battle (death rolls resolved as a scar, not Comatose). */
export function battleScarUnits(units: Unit[], input: BattleInput): Unit[] {
  return units.filter((u) => {
    const r = input.units[u.id];
    return r?.in && r.destroyed && r.death?.outcome === 'scar' && r.scar.startsWith('scar:') && r.scar !== 'scar:Comatose';
  });
}

export interface UnitOutcome {
  unitId: string;
  name: string;
  played: boolean;
  parts: { label: string; xp: number }[];
  gain: number;
  xpBefore: number;
  xpAfter: number;
  levelsGained: number;
  scarName?: string;
  scarResult?: ScarResult;
  scarUndone?: boolean;
  lostTrait?: string;
  removedScars: string[];
  free: string[];
  wokeUp: boolean;
}

export interface BattleOutcome {
  units: UnitOutcome[];
  ledger: { label: string; rp: number; supply: number }[];
  rp: number;
  supply: number;
  warnings: string[];
  summary: string[];
}

export function resolveBattle(force: Force, input: BattleInput, newId: () => string): BattleOutcome {
  const units = force.units.filter((u) => u.status !== 'removed' && input.units[u.id]);
  const warnings: string[] = [];
  const extra: Record<string, { label: string; xp: number }[]> = {};
  const addXp = (id: string, label: string, xp: number) => void (extra[id] ??= []).push({ label, xp });
  const undoBattleScar = new Set<string>();
  const removeScars: Record<string, string[]> = {};
  const free: Record<string, string[]> = {};
  const byId = new Map(units.map((u) => [u.id, u]));

  const ledger = [{
    label: `Battle vs ${input.opponent || 'unknown'} — ${RESULT_LABEL[input.result]}${input.vsAi ? ' (AI)' : ''}`,
    rp: BATTLE_RP + input.agendaRp,
    supply: 0,
  }];

  if (units.filter((u) => input.units[u.id].in && input.units[u.id].marked).length > 1)
    warnings.push('Only one unit can be Marked for Greatness.');

  for (const row of rewardRows(input)) {
    const e = row.entry;
    const pick = input.rewards[row.key] ?? emptyPick();
    if (!e) {
      warnings.push(`${row.source}: not rolled yet.`);
      continue;
    }
    if (e.rp || e.supply) ledger.push({ label: `${row.source}: ${e.text}`, rp: e.rp ?? 0, supply: e.supply ?? 0 });
    if (e.xp) {
      if (e.xpTarget === 'any') {
        let given = 0;
        for (const [id, xp] of Object.entries(pick.alloc)) {
          if (xp > 0 && byId.has(id) && input.units[id].in) {
            addXp(id, row.source, xp);
            given += xp;
          }
        }
        if (given < e.xp) warnings.push(`${row.source}: ${e.xp - given} of ${e.xp} XP not distributed.`);
        if (given > e.xp) warnings.push(`${row.source}: ${given} XP distributed but only ${e.xp} available.`);
      } else if (pick.target && xpCandidates(units, input, e.xpTarget).some((u) => u.id === pick.target)) {
        addXp(pick.target, row.source, e.xp);
      } else {
        warnings.push(`${row.source}: choose a unit for ${e.xp} XP.`);
      }
    }
    if (e.removeScar) {
      const [id, scarId] = pick.target.split(':');
      const noBattleScars = e.removeScar === 'battle' && battleScarUnits(units, input).length === 0;
      if (!id || !byId.has(id)) {
        // Winners 1 still gives its XP without a scar to undo; a scar-only reward is re-rolled.
        if (!noBattleScars) warnings.push(`${row.source}: choose a scar to remove.`);
        else if (!e.xp) warnings.push(`${row.source}: no scars were gained this battle — re-roll.`);
      }
      else if (scarId === 'battle') undoBattleScar.add(id);
      else (removeScars[id] ??= []).push(scarId);
    }
    if (e.free) {
      if (byId.has(pick.target)) (free[pick.target] ??= []).push(e.free);
      else warnings.push(`${row.source}: choose a unit for the ${e.free.toLowerCase()}.`);
    }
  }

  const part = participationXp(input);
  const outcomes: UnitOutcome[] = [];
  for (const u of units) {
    const r = input.units[u.id];
    const name = unitName(u);
    const xpBefore = u.xp;
    const parts: { label: string; xp: number }[] = [];
    const wokeUp = u.status === 'comatose';
    if (wokeUp) u.status = 'active';

    if (r.in) {
      u.battles += 1;
      u.kills += r.kills;
      if (part) parts.push({ label: 'Participation', xp: part });
      if (r.marked) parts.push({ label: 'Marked for Greatness', xp: MARKED_XP });
      if (r.killXp) parts.push({ label: 'Kills', xp: r.killXp });
      if (r.bonusXp) parts.push({ label: 'Agendas / bonus', xp: r.bonusXp });
      if (r.destroyed && r.death?.outcome === 'xp') parts.push({ label: 'Death roll', xp: 1 });
    }
    parts.push(...(extra[u.id] ?? []));

    const o: UnitOutcome = { unitId: u.id, name, played: r.in, parts, gain: 0, xpBefore, xpAfter: 0, levelsGained: 0, removedScars: [], free: free[u.id] ?? [], wokeUp };

    const drop = removeScars[u.id] ?? [];
    o.removedScars = u.scars.filter((s) => drop.includes(s.id)).map((s) => s.name);
    u.scars = u.scars.filter((s) => !drop.includes(s.id));

    if (r.in && r.destroyed) {
      if (!r.death) warnings.push(`${name}: death roll not made.`);
      else if (r.death.outcome === 'scar') {
        if (r.scar.startsWith('trait:')) {
          const up = u.upgrades.find((x) => `trait:${x.id}` === r.scar);
          if (up) {
            u.upgrades = u.upgrades.filter((x) => x !== up);
            u.xp = previousBracketXp(u.xp);
            o.lostTrait = up.name;
          } else warnings.push(`${name}: the trait to lose no longer exists.`);
        } else if (r.scar.startsWith('scar:')) {
          o.scarName = r.scar.slice(5);
          if (undoBattleScar.has(u.id)) o.scarUndone = true;
          else o.scarResult = applyScar(u, { id: newId(), name: o.scarName, desc: SCAR_TABLE.find((s) => s.name === o.scarName)?.desc });
        } else warnings.push(`${name}: scar not resolved.`);
      }
    }

    o.gain = parts.reduce((n, p) => n + p.xp, 0);
    u.xp += o.gain;
    o.xpAfter = u.xp;
    o.levelsGained = levelForXp(u.xp) - levelForXp(xpBefore);
    outcomes.push(o);
  }

  force.battles += 1;
  if (input.result === 'win') force.wins += 1;
  for (const l of ledger) force.ledger.push({ id: newId(), date: input.date, ...l });

  const summary: string[] = [];
  for (const o of outcomes) {
    const bits: string[] = [];
    if (o.gain || o.played) bits.push(`+${o.gain} XP (${o.xpBefore} → ${o.xpAfter})`);
    if (o.levelsGained > 0) bits.push(`level ${levelForXp(o.xpAfter)}!`);
    if (o.lostTrait) bits.push(`lost ${o.lostTrait} instead of a scar`);
    if (o.scarUndone) bits.push(`${o.scarName} scar undone`);
    else if (o.scarResult === 'comatose') bits.push('comatose — sits out next game');
    else if (o.scarResult === 'removed') bits.push(`${o.scarName} — 4th scar, removed from the army`);
    else if (o.scarResult) bits.push(`scar: ${o.scarName}`);
    for (const s of o.removedScars) bits.push(`${s} removed`);
    for (const fr of o.free) bits.push(fr);
    if (bits.length) summary.push(`${o.name}: ${bits.join('; ')}`);
  }
  const rp = ledger.reduce((n, l) => n + l.rp, 0);
  const supply = ledger.reduce((n, l) => n + l.supply, 0);
  summary.push(`Force: +${rp} RP${supply ? `, +${supply} Supply Limit` : ''}`);

  force.battleLog ??= [];
  force.battleLog.push({
    id: newId(), date: input.date, opponent: input.opponent, result: input.result, vsAi: input.vsAi,
    agendas: input.agendas, myBp: input.myBp, oppBp: input.oppBp, summary, notes: input.notes,
  });

  return { units: outcomes, ledger, rp, supply, warnings, summary };
}
