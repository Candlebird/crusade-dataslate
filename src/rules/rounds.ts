import type { Campaign, Force, ForceNexus, RoundSnapshot, Sector } from '../model/types';
import { CATEGORIES } from './data';
import type { Rand } from './hexmap';
import {
  ANOMALY_TABLE, ECHOES, MANIPULATION_PREFIX, NEXUS_ROUNDS, currentRound, emptyNexusPick, factionName, incomeItems,
  type NexusItem, type NexusPick,
} from './nexus';
import { pickSpread, spreadInto } from './voidspawn';

// Nexus Wars rounds. The GM ends a round when the group has played what it's going to play; then:
//  - every faction's holdings are noted, and each force claims that round's sector income whenever its player is ready,
//  - the Void Echoes' threat moves (up each round, down for every win against them), and they spread that many sectors.
// Values live in NEXUS_ROUNDS (nexusData.ts).

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const threatOf = (c: Campaign) => c.threat ?? NEXUS_ROUNDS.threatStart;
export const spreadsAt = (threat: number) => NEXUS_ROUNDS.spreadsByThreat[clamp(threat, 0, NEXUS_ROUNDS.spreadsByThreat.length - 1)];
/** The first rounds: no home-sector challenges, and the Echoes only spread into unclaimed space. */
export const inGrace = (c: Campaign) => currentRound(c) <= NEXUS_ROUNDS.graceRounds;

/** Sectors each faction holds, not counting its home. */
export function sectorCounts(c: Campaign): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of c.factions) out[f.id] = c.sectors.filter((s) => s.owner === f.id && s.type !== 'home').length;
  return out;
}

/** The faction(s) holding the most sectors, when anyone is ahead at all. */
export function leaders(c: Campaign): string[] {
  const counts = sectorCounts(c);
  const values = Object.values(counts);
  if (!values.length) return [];
  const top = Math.max(...values);
  if (top === Math.min(...values)) return [];
  return Object.keys(counts).filter((id) => counts[id] === top);
}

/** Catch-up Umbra Shards per faction: so many per sectors behind the leader. */
export function underdogBonus(c: Campaign): Record<string, number> {
  const counts = sectorCounts(c);
  const top = Math.max(0, ...Object.values(counts));
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts)) out[id] = Math.min(NEXUS_ROUNDS.underdogMax, Math.floor((top - n) / NEXUS_ROUNDS.underdogStep));
  return out;
}

/** Wins against the Void Echoes in a round (at the Voidspawn counted apart). */
export function echoWins(c: Campaign, round: number) {
  let wins = 0;
  let voidspawn = 0;
  for (const e of c.log) {
    if (e.spread || (e.round ?? 1) !== round || !e.winner || e.winner === ECHOES.id) continue;
    if (e.attacker !== ECHOES.id && e.defender !== ECHOES.id) continue;
    if (c.sectors.find((s) => s.id === e.sectorId)?.type === 'voidspawn') voidspawn++;
    else wins++;
  }
  return { wins, voidspawn };
}

/** Where the threat is heading if the round ended now. */
export function nextThreat(c: Campaign) {
  const { wins, voidspawn } = echoWins(c, currentRound(c));
  const R = NEXUS_ROUNDS;
  return clamp(threatOf(c) + R.threatPerRound - wins * R.threatPerWin - voidspawn * R.threatPerVoidspawnWin, 0, R.threatMax);
}

export interface RoundEnd {
  round: number;
  threatBefore: number;
  threat: number;
  wins: number;
  voidspawnWins: number;
  spread: Sector[];
}

/** End the current round: note holdings for income, move the threat, spread the Echoes, start the next round. */
export function endRound(c: Campaign, rand: Rand = Math.random, date = new Date().toISOString().slice(0, 10)): RoundEnd {
  const round = currentRound(c);
  const holdings: RoundSnapshot['holdings'] = {};
  for (const f of c.factions) holdings[f.id] = c.sectors.filter((s) => s.owner === f.id).map((s) => s.id);
  const snapshot: RoundSnapshot = { round, date, holdings, underdog: underdogBonus(c) };

  const threatBefore = threatOf(c);
  const { wins, voidspawn } = echoWins(c, round);
  const threat = nextThreat(c);

  // The Echoes go for whoever is ahead; while the campaign is young, they only take unclaimed space.
  const ahead = new Set(leaders(c));
  const weight = (s: Sector) => (s.owner && ahead.has(s.owner) ? NEXUS_ROUNDS.leaderWeight : 1);
  const only = inGrace(c) ? (s: Sector) => !s.owner : () => true;
  const spread: Sector[] = [];
  for (let i = 0; i < spreadsAt(threat); i++) {
    const target = pickSpread(c, rand, weight, only);
    if (!target || !spreadInto(c, target.id, date)) break;
    spread.push(target);
  }

  c.rounds = [...(c.rounds ?? []), snapshot].slice(-NEXUS_ROUNDS.keepRounds);
  c.threat = threat;
  c.round = round + 1;
  return { round, threatBefore, threat, wins, voidspawnWins: voidspawn, spread };
}

/** One line for the log / a toast. */
export function roundEndText(c: Campaign, r: RoundEnd) {
  const where = r.spread.length ? `spread to ${r.spread.map((s) => s.name).join(', ')}` : 'did not spread';
  return `Round ${r.round} ended. ${ECHOES.name} threat ${r.threatBefore} → ${r.threat}; they ${where}. Round ${currentRound(c)} begins.`;
}

/** Ended rounds this force hasn't claimed income for. A force new to the campaign starts from the latest one. */
export function claimableRounds(c: Campaign, n: ForceNexus): RoundSnapshot[] {
  const rounds = c.rounds ?? [];
  if (!rounds.length || !c.factions.some((f) => f.id === n.factionId)) return [];
  const from = n.claimedRound ?? rounds[rounds.length - 1].round - 1;
  return rounds.filter((r) => r.round > from);
}

/** Everything a faction's holdings paid in an ended round. Keys are prefixed with the round. */
export function roundIncomeItems(c: Campaign, factionId: string, snap: RoundSnapshot): NexusItem[] {
  const items: NexusItem[] = [];
  for (const id of snap.holdings[factionId] ?? []) {
    const s = c.sectors.find((x) => x.id === id);
    if (s) items.push(...incomeItems(s, `r${snap.round}:`));
  }
  const behind = snap.underdog[factionId] ?? 0;
  if (behind > 0) items.push({ key: `r${snap.round}:underdog`, kind: 'us', source: 'Catch-up bonus', us: behind });
  return items.map((i) => ({ ...i, source: `Round ${snap.round} — ${i.source.replace(/^Conquest — /, '')}` }));
}

export interface RoundIncomeOutcome {
  us: number;
  supply: number;
  lines: string[];
  warnings: string[];
}

/** Pay a force its round income. Last claim's temporary table unlocks end here. */
export function resolveRoundIncome(
  force: Force, c: Campaign, rounds: RoundSnapshot[], items: NexusItem[], picks: Record<string, NexusPick>, date: string, newId: () => string,
): RoundIncomeOutcome {
  const out: RoundIncomeOutcome = { us: 0, supply: 0, lines: [], warnings: [] };
  const n = force.nexus;
  if (!n || !rounds.length) return out;
  n.tempTables = [];
  const ledger = (label: string, supply: number, us?: number) => force.ledger.push({ id: newId(), date, label, rp: 0, supply, ...(us ? { us } : {}) });
  const addUs = (label: string, k: number) => {
    out.us += k;
    ledger(label, 0, k);
  };
  const addSupply = (label: string, k: number) => {
    out.supply += k;
    ledger(label, k);
  };
  for (const item of items) {
    const pick = picks[item.key] ?? emptyNexusPick();
    const src = item.source;
    switch (item.kind) {
      case 'us': addUs(src, item.us ?? 0); break;
      case 'supply': addSupply(src, item.supply ?? 0); break;
      case 'shardRoll':
        if (!pick.roll) out.warnings.push(`${src}: not rolled yet.`);
        else if (pick.roll >= NEXUS_ROUNDS.shardMineRoll) addUs(`${src} (rolled ${pick.roll})`, 1);
        else out.lines.push(`${src}: rolled ${pick.roll} — no shard.`);
        break;
      case 'research':
        if (!CATEGORIES.includes(pick.choice as never)) out.warnings.push(`${src}: choose a Nexus Traits table.`);
        else {
          if (n.tempTables !== 'all' && !n.tempTables.includes(pick.choice as never)) n.tempTables.push(pick.choice as never);
          out.lines.push(`${src}: ${pick.choice} Nexus traits unlocked until your next round income.`);
        }
        break;
      case 'manipulation':
        n.pending.push(`${MANIPULATION_PREFIX}: ${pick.choice || 'any'} (free)`);
        out.lines.push(`${src}: a free Combat Manipulation for your next match.`);
        break;
      case 'anomaly': {
        const e = pick.roll ? ANOMALY_TABLE[pick.roll - 1] : null;
        if (!e) {
          out.warnings.push(`${src}: not rolled yet.`);
          break;
        }
        const label = `${src} (${pick.roll}): ${e.text}`;
        if (e.us) addUs(label, e.us);
        if (e.supply) addSupply(label, e.supply);
        if (e.removeScar) {
          const [unitId, scarId] = pick.target.split(':');
          const u = force.units.find((x) => x.id === unitId && x.status !== 'removed');
          const scar = u?.scars.find((x) => x.id === scarId);
          if (u && scar) {
            u.scars = u.scars.filter((x) => x !== scar);
            out.lines.push(`${label} — ${scar.name} removed from ${u.name || u.unitType}.`);
          } else out.warnings.push(`${src}: choose a scar to remove.`);
        }
        if (e.unlockAll) n.tempTables = 'all';
        if (!e.us && !e.supply && !e.removeScar) out.lines.push(label);
        break;
      }
    }
  }
  n.claimedRound = Math.max(n.claimedRound ?? 0, ...rounds.map((r) => r.round));
  force.umbraShards += out.us;
  const which = rounds.length === 1 ? `round ${rounds[0].round}` : `rounds ${rounds[0].round}–${rounds[rounds.length - 1].round}`;
  out.lines.unshift(`${factionName(c, n.factionId)} income for ${which}: +${out.us} Umbra Shard${out.us === 1 ? '' : 's'}, +${out.supply} Supply.`);
  return out;
}
