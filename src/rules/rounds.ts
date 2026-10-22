import { uid } from '../model/factory';
import type { AssetUse, Campaign, CatalogBook, Force, ForceNexus, HeroOffer, Marauder, RoundSnapshot, Sector, TurnReport } from '../model/types';
import { CATEGORIES } from './data';
import { refreshSectors, type Rand } from './hexmap';
import {
  ECHOES, MANIPULATION_PREFIX, NEXUS_CRISIS, NEXUS_ROUNDS, PRODUCTION, STRATEGIC_ASSETS, activeCrisis, activeEvent, currentRound, emptyNexusPick, eventById, nexusEntry,
  WARLORDS, factionName, incomeItems, lordById, type NexusItem, type NexusPick,
} from './nexus';
import { crisisRound, placeCrisis, rollEvent, settleCrisis, type CrisisEnd } from './events';
import { pickSpread, spreadInto } from './voidspawn';
import { factionClaimedRound } from './detachments';
import { rateSectors } from './difficulty';
import { explore } from './fog';
import { regroup } from './movement';
import { moveMarauders, type Raid } from './marauders';
import { placeGuardians } from './guardians';
import { rollOffers } from './heroes';
import { accrueProduction, buildingsHeld, finishConstruction, warded } from './production';
import { accrueResearch } from './tech';
import { buildReport } from './report';
import { hasPerk, syncWarlords } from './warlords';
import { localDate } from '../model/date';

// Nexus Wars rounds. During a round players fight as many skirmishes as they like (no sector changes hands; a win earns
// a Strategic Asset, and one against the Echoes is a patrol). The round closes with the Battle: the sealed-order attacks.
// The GM then ends the round:
//  - every faction's holdings are noted, and each force claims that round's sector income whenever its player is ready,
//  - the Void Echoes' threat moves (up each round, down for every win against them), and they spread that many sectors,
//  - unspent Strategic Assets are lost,
//  - claimed space hulks and Lost Archives fade and new points of interest turn up (refreshSectors, hexmap.ts),
//  - every sector's difficulty is rescaled to the factions' current Supply, and AI garrisons roll new modifiers,
//  - the round's Nexus Crisis is settled, a Galactic Event is rolled for the next round, and a new Crisis rises if it's
//    time (events.ts),
//  - planets bank their Materials (production.ts), factions earn Research (tech.ts), every faction's map is explored (fog.ts), wandering heroes come and
//    go (heroes.ts) and AI-held sites get guardians (guardians.ts), given the forces and army books,
//  - and the round's turn report is written (report.ts).
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

/** Wins against the Void Echoes in a round: sector games, at the Voidspawn, and skirmishes (patrols), counted apart. */
export function echoWins(c: Campaign, round: number) {
  let wins = 0;
  let voidspawn = 0;
  let patrols = 0;
  for (const e of c.log) {
    if (e.spread || e.crisis || (e.round ?? 1) !== round || !e.winner || e.winner === ECHOES.id) continue;
    if (e.attacker !== ECHOES.id && e.defender !== ECHOES.id) continue;
    if (e.skirmish) patrols++;
    else if (c.sectors.find((s) => s.id === e.sectorId)?.type === 'voidspawn') voidspawn++;
    else wins++;
  }
  return { wins, voidspawn, patrols };
}

/** Where the threat is heading if the round ended now. */
export function nextThreat(c: Campaign) {
  const { wins, voidspawn, patrols } = echoWins(c, currentRound(c));
  const R = NEXUS_ROUNDS;
  const event = activeEvent(c)?.threat ?? 0;
  const spires = c.factions.reduce((n, f) => n + buildingsHeld(c, f.id, 'spire'), 0) * PRODUCTION.spire.threat;
  const threat = clamp(threatOf(c) + R.threatPerRound + event - wins * R.threatPerWin - voidspawn * R.threatPerVoidspawnWin - patrols * R.threatPerPatrolWin - spires, 0, R.threatMax);
  // The Crisis: a win pushes the Echoes back further; otherwise they rage at full threat.
  const crisis = activeCrisis(c);
  if (!crisis) return threat;
  return crisis.result === 'won' ? clamp(threat - NEXUS_CRISIS.threatDrop, 0, R.threatMax) : R.threatMax;
}

// ---- skirmishes and Strategic Assets ----

/** Skirmishes a faction has won this round. */
export const skirmishWins = (c: Campaign, factionId: string) =>
  c.log.filter((e) => e.skirmish && e.winner === factionId && (e.round ?? 1) === currentRound(c)).length;

/** Strategic Assets a faction has this round: earned (one per skirmish win, capped), spent, and left. */
export function assetsOf(c: Campaign, factionId: string) {
  // A Strategium gives one more, won skirmish or not, and so does a Warmaster Warlord's Strategist.
  const earned = Math.min(NEXUS_ROUNDS.assetsMax, skirmishWins(c, factionId)) + Math.min(1, buildingsHeld(c, factionId, 'strategium'))
    + (hasPerk(c, factionId, 'strategist') ? WARLORDS.assets : 0);
  const spent = (c.assetsSpent ?? []).filter((a) => a.factionId === factionId && a.round === currentRound(c));
  return { earned, spent, left: Math.max(0, earned - spent.length) };
}

export const assetName = (key: string) => STRATEGIC_ASSETS.find((a) => a.key === key)?.name ?? key;

/** Spend one of a faction's Strategic Assets this round. False when it has none left. */
export function spendAsset(c: Campaign, factionId: string, asset: string, id: string, date: string, forceId?: string): boolean {
  if (assetsOf(c, factionId).left < 1) return false;
  const use: AssetUse = { id, round: currentRound(c), factionId, asset, date, ...(forceId ? { forceId } : {}) };
  c.assetsSpent = [...(c.assetsSpent ?? []), use];
  return true;
}

/** Take back a spent Asset (it was spent by mistake). */
export function refundAsset(c: Campaign, id: string) {
  c.assetsSpent = (c.assetsSpent ?? []).filter((a) => a.id !== id);
}

export interface RoundEnd {
  round: number;
  threatBefore: number;
  threat: number;
  wins: number;
  voidspawnWins: number;
  patrols: number;
  spread: Sector[];
  /** The new range of sector ratings, when the forces were given to rescale them. */
  difficulty?: { min: number; max: number };
  /** Claimed space hulks and Lost Archives that faded, as they were. */
  cleared: Sector[];
  /** New points of interest. */
  fresh: Sector[];
  /** The Galactic Event of the round that ended. */
  event?: string;
  /** The round's Nexus Crisis, settled. */
  crisis?: CrisisEnd;
  /** The Galactic Event rolled for the next round. */
  nextEvent?: string;
  /** A Nexus Crisis rose for the next round: the Lord and where. */
  newCrisis?: { lord: string; sectorName: string };
  /** Materials banked by each sector. */
  production: { sector: Sector; gained: number }[];
  /** Research each faction earned. */
  research: { factionId: string; gained: number }[];
  built: { sector: Sector; building: string }[];
  /** Hero offers that turned up and that left (needs the forces and books). */
  offers?: { fresh: HeroOffer[]; gone: HeroOffer[] };
  /** Sectors that got a new guardian (needs the forces and books). */
  guardians: Sector[];
  /** What the Marauders did: raids (and raids thrown back), and bands that turned up. */
  marauders: { raids: Raid[]; spawned: Marauder[] };
  /** Warlords lost and levelled (when the forces were given). */
  warlords?: ReturnType<typeof syncWarlords>;
  report: TurnReport;
}

/**
 * End the current round: note holdings for income, move the threat, spread the Echoes, start the next round. With the
 * campaign's forces, sector difficulty is rescaled to their Supply too.
 */
export function endRound(
  c: Campaign, rand: Rand = Math.random, date = localDate(), forces?: Force[], books?: CatalogBook[],
): RoundEnd {
  const round = currentRound(c);
  // Warlords' levels are brought up to date, and fallen ones lost, before their perks count.
  const warlords = forces ? syncWarlords(c, forces) : undefined;
  const holdings: RoundSnapshot['holdings'] = {};
  for (const f of c.factions) holdings[f.id] = c.sectors.filter((s) => s.owner === f.id).map((s) => s.id);
  const snapshot: RoundSnapshot = { round, date, holdings, underdog: underdogBonus(c) };
  const event = activeEvent(c);
  if (event) snapshot.event = event.id;

  // Income is noted from what was held; production is banked the same way.
  const production = accrueProduction(c);
  const research = accrueResearch(c);
  // Buildings going up are finished; they work from the next round (so a new Barracks didn't bank this round's 500).
  const built = finishConstruction(c);

  const threatBefore = threatOf(c);
  const { wins, voidspawn, patrols } = echoWins(c, round);
  const threat = nextThreat(c);
  // The Crisis, unless it was won, takes a sector from everyone.
  const crisis = settleCrisis(c, date);

  // The Echoes go for whoever is ahead; while the campaign is young, they only take unclaimed space.
  const ahead = new Set(leaders(c));
  // An Umbral Spire draws them to its owner; an Echo Ward keeps them out.
  const weight = (s: Sector) =>
    (s.owner && ahead.has(s.owner) ? NEXUS_ROUNDS.leaderWeight : 1) * (s.owner && buildingsHeld(c, s.owner, 'spire') ? PRODUCTION.spire.weight : 1);
  const only = (s: Sector) => (!inGrace(c) || !s.owner) && !warded(c, s);
  const spread: Sector[] = [];
  for (let i = 0; i < Math.max(0, spreadsAt(threat) + (event?.spread ?? 0)); i++) {
    const target = pickSpread(c, rand, weight, only);
    if (!target || !spreadInto(c, target.id, date)) break;
    spread.push(target);
  }

  c.rounds = [...(c.rounds ?? []), snapshot].slice(-NEXUS_ROUNDS.keepRounds);
  c.threat = threat;
  c.round = round + 1;
  // Strategic Assets don't carry over.
  delete c.assetsSpent;
  // The map moves on: claimed hulks and archives fade and new points of interest turn up. The round's income still counts the hulks.
  const { cleared, fresh } = refreshSectors(c, rand, event?.hulks ?? 0);
  const held = new Set(Object.values(holdings).flat());
  const was = cleared.filter((s) => held.has(s.id));
  if (was.length) snapshot.was = was;
  const difficulty = forces ? rateSectors(c, forces, rand, { reroll: true }) : undefined;
  // What the next round brings.
  rollEvent(c, rand);
  let newCrisis: RoundEnd['newCrisis'];
  if (crisisRound(c.round) && placeCrisis(c, rand))
    newCrisis = { lord: lordById(c.crisis!.lord)?.name ?? '', sectorName: c.sectors.find((s) => s.id === c.crisis!.sectorId)?.name ?? '' };
  // Detachments in sectors that drifted off or changed hands fall back.
  regroup(c);
  explore(c);
  const marauders = moveMarauders(c, threat, rand, uid, forces);
  const offers = forces && books ? rollOffers(c, books, forces, rand, uid) : undefined;
  const guardians = forces && books ? placeGuardians(c, books, forces, rand, uid) : [];
  const end: Omit<RoundEnd, 'report'> = {
    round, threatBefore, threat, wins, voidspawnWins: voidspawn, patrols, spread, difficulty, cleared, fresh,
    event: event?.id, crisis, nextEvent: c.event?.id, newCrisis, production, research, built, offers, guardians, marauders, warlords,
  };
  const report = buildReport(c, end, { production, research, built, offers, guardians }, date, rand);
  return { ...end, report };
}

/** One line for the log / a toast. */
export function roundEndText(c: Campaign, r: RoundEnd) {
  const gone = (type: string, what: string, did: string) => {
    const g = r.cleared.filter((s) => s.type === type);
    return g.length ? ` ${what}${g.length === 1 ? '' : 's'} ${did}: ${g.map((s) => s.name).join(', ')}.` : '';
  };
  const where = r.spread.length ? `spread to ${r.spread.map((s) => s.name).join(', ')}` : 'did not spread';
  const crisis = !r.crisis ? ''
    : r.crisis.result === 'won' ? ` The Nexus Crisis was won: ${r.crisis.lord} is beaten.`
    : ` The Nexus Crisis was lost: ${r.crisis.lord} took ${r.crisis.lost.map((s) => s.name).join(', ') || 'nothing'}.`;
  const next = `${r.nextEvent ? ` Galactic event: ${eventById(r.nextEvent)?.name}.` : ''}${r.newCrisis ? ` Nexus Crisis! ${r.newCrisis.lord} rises at ${r.newCrisis.sectorName}.` : ''}`;
  const sector = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'the map edge';
  const raids = r.marauders.raids.map((x) => x.repelled ? ` ${x.band} were thrown back from ${x.sector}.` : ` ${x.band} raided ${x.sector} (−${x.stolen} Materials).`).join('');
  const bands = r.marauders.spawned.map((m) => ` Marauders! ${m.name} (${m.strength} Supply) turned up at ${sector(m.sectorId)}.`).join('');
  const lords = (r.warlords?.lost ?? []).map((w) => ` ${factionName(c, w.factionId)} lost its Warlord, ${w.name}.`).join('');
  return `Round ${r.round} ended.${crisis} ${ECHOES.name} threat ${r.threatBefore} → ${r.threat}; they ${where}.${gone('void', 'Space hulk', 'drifted off')}${gone('archive', 'Lost Archive', 'faded')}${r.fresh.length ? ` New point${r.fresh.length === 1 ? '' : 's'} of interest: ${r.fresh.map((s) => s.name).join(', ')}.` : ''}${r.difficulty ? ` Sectors rescaled to ${r.difficulty.min}–${r.difficulty.max} Supply.` : ''}${raids}${bands}${lords} Round ${currentRound(c)} begins.${next}`;
}

/**
 * Ended rounds this force's faction hasn't claimed income for. Income is the faction's, so a claim by any of its
 * detachments (in `forces`) counts. A faction new to the campaign starts from the latest round.
 */
export function claimableRounds(c: Campaign, n: ForceNexus, forces: Force[] = []): RoundSnapshot[] {
  const rounds = c.rounds ?? [];
  if (!rounds.length || !c.factions.some((f) => f.id === n.factionId)) return [];
  const claimed = [n.claimedRound, factionClaimedRound(forces, n.factionId)].filter((r): r is number => r !== undefined);
  const from = claimed.length ? Math.max(...claimed) : rounds[rounds.length - 1].round - 1;
  return rounds.filter((r) => r.round > from);
}

/** Everything a faction's holdings paid in an ended round. Keys are prefixed with the round. */
export function roundIncomeItems(c: Campaign, factionId: string, snap: RoundSnapshot): NexusItem[] {
  const items: NexusItem[] = [];
  for (const id of snap.holdings[factionId] ?? []) {
    const s = snap.was?.find((x) => x.id === id) ?? c.sectors.find((x) => x.id === id);
    if (s) items.push(...incomeItems(s, `r${snap.round}:`));
  }
  const behind = snap.underdog[factionId] ?? 0;
  if (behind > 0) items.push({ key: `r${snap.round}:underdog`, kind: 'us', source: 'Catch-up bonus', us: behind });
  const event = eventById(snap.event);
  if (event?.income?.us) items.push({ key: `r${snap.round}:eventUs`, kind: 'us', source: event.name, us: event.income.us });
  if (event?.income?.supply) items.push({ key: `r${snap.round}:eventSupply`, kind: 'supply', source: event.name, supply: event.income.supply });
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
      case 'medicae':
      case 'anomaly': {
        const e = nexusEntry(item, pick);
        if (!e) {
          out.warnings.push(`${src}: not rolled yet.`);
          break;
        }
        const label = `${src}${pick.roll && item.kind !== 'medicae' ? ` (${pick.roll})` : ''}: ${e.text}`;
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
