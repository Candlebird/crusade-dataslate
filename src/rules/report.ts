import type { Campaign, CampaignEvent, HeroOffer, Sector, TurnReport, TurnReportLine } from '../model/types';
import { levelForXp } from './engine';
import { buildingById } from './production';
import { visibleTo } from './fog';
import type { Rand } from './hexmap';
import { ECHOES, NEXUS_ROUNDS, eventById, factionName } from './nexus';
import type { RoundEnd } from './rounds';
import { MARAUDER_ID } from './marauders';

// The turn report (Nexus Wars): what happened in a round, told like a war correspondent would, built when the GM ends
// the round. Each line says who may read it: a line about a sector goes to the factions that fought there and the ones
// that could see it when the round ended (fog of war, fog.ts); production and hero offers only go to their faction.
// The last NEXUS_ROUNDS.keepRounds reports are kept.

/** What else happened at round end, beside RoundEnd. */
export interface ReportExtras {
  production?: { sector: Sector; gained: number }[];
  research?: { factionId: string; gained: number }[];
  built?: { sector: Sector; building: string }[];
  offers?: { fresh: HeroOffer[]; gone: HeroOffer[] };
  guardians?: Sector[];
}

const say = (rand: Rand, lines: readonly string[], vars: Record<string, string | number>) =>
  lines[Math.floor(rand() * lines.length)].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));

const TEXT = {
  captured: [
    '{winner} stormed {sector} and tore {loser}\'s banners down.',
    '{sector} fell to {winner}. {loser} fled into the void.',
    'After a bitter fight, {winner} raised their colours over {sector}.',
  ],
  claimed: [
    '{winner} landed at {sector} and claimed it.',
    '{sector} is {winner}\'s now: the {echoes} garrison broke before them.',
    '{winner} cut through the {echoes} at {sector} and took it.',
  ],
  held: [
    '{defender} held {sector} against {attacker}.',
    '{attacker} threw themselves at {sector}, and {defender} threw them back.',
    'The walls of {sector} stood: {attacker} was beaten off by {defender}.',
  ],
  repelled: [
    'The {echoes} at {sector} beat {attacker} back.',
    '{attacker} reached {sector}, but the {echoes} would not yield.',
  ],
  draw: ['{sector} is a field of wrecks: neither {attacker} nor {defender} could claim it.'],
  guardianSlain: ['{winner} slew {guardian} at {sector}, and took their relic.'],
  spread: [
    'The {echoes} swallowed {sector}{from}.',
    'Darkness rolled over {sector}{from}. The {echoes} hold it now.',
  ],
  threatUp: ['The {echoes} grow bolder: threat rose to {threat}.'],
  threatDown: ['The {echoes} falter: threat fell to {threat}.'],
  threatSame: ['The {echoes} watch and wait: threat holds at {threat}.'],
  hulkGone: ['The space hulk {sector} drifted back into the warp.'],
  archiveGone: ['{sector}, plundered of its last secrets, faded from every star chart.'],
  fresh: ['Scanners caught something new: {sector}.', 'A signal from the dark: {sector} has appeared.'],
  production: ['Your forges worked through the night: +{gained} Materials banked across {sites}.'],
  research: ['Your scholars pored over Nexus echoes: +{gained} Research ({total} to spend).'],
  built: [
    'The scaffolds came down at {sector}: the {building} is finished.',
    'Work crews at {sector} report the {building} complete and ready.',
    'The {building} at {sector} hums to life.',
  ],
  offer: [
    'A wandering hero, {unit} (level {level}{relic}), offers their service for {fee} Umbra Shards.',
    '{unit} (level {level}{relic}) arrived at your camp, looking for a war worth fighting. Their price: {fee} Umbra Shards.',
  ],
  offerGone: ['{unit} grew tired of waiting and moved on.'],
  bandBroken: [
    '{winner} broke {band} at {sector}.',
    '{band} were cut down at {sector}: {winner} left none standing.',
  ],
  bandHeld: ['{band} saw off {attacker} at {sector}, and grow fat on the spoils.'],
  bandNew: [
    'Marauders! {band} ({strength} Supply) came out of {sector}.',
    'Raider sails were sighted at {sector}: {band}, {strength} strong.',
  ],
  raid: [
    "{band} fell on {sector} and carried off {stolen} Materials. {owner}'s forges there stand cold this round.",
    '{sector} burns: {band} looted {stolen} Materials from {owner}, and nothing will be made there this round.',
  ],
  raidRepelled: [
    "{band} hit {sector}, but {owner}'s defenders threw them back.",
    'The defences of {sector} held: {band} limped off, bloodied.',
  ],
  guardian: [
    '{guardian}, a {tier} guardian, now stands watch over {sector}.',
    'Something stirs at {sector}: {guardian} ({tier}) guards it now.',
  ],
};

/** Who may read a line about this sector: the factions involved, and every faction that could see it. */
function watchers(c: Campaign, sectorId: string, involved: (string | undefined)[], sight: Map<string, Set<string>>) {
  const out = new Set(involved.filter((id): id is string => !!id && c.factions.some((f) => f.id === id)));
  for (const f of c.factions) if (sight.get(f.id)?.has(sectorId)) out.add(f.id);
  return out.size === c.factions.length ? undefined : [...out];
}

const lootText = (e: CampaignEvent) =>
  e.loot ? ` Among its remains: ${e.loot.name}${e.loot.amount ? ` (+${e.loot.amount}${e.loot.id === 'research' ? ' Research' : ' Materials'})` : ''}.` : '';

function battleLine(c: Campaign, e: CampaignEvent, name: (id: string) => string, rand: Rand): TurnReportLine {
  const vars = {
    sector: name(e.sectorId), echoes: ECHOES.name,
    attacker: factionName(c, e.attacker), defender: factionName(c, e.defender), winner: factionName(c, e.winner),
    loser: factionName(c, e.winner === e.attacker ? e.defender : e.attacker), guardian: e.undo?.guardian?.name ?? '',
  };
  if (e.marauder) {
    const band = { ...vars, band: e.marauder.name };
    if (e.winner === MARAUDER_ID || !e.winner) return { icon: '🏴', text: say(rand, TEXT.bandHeld, band) };
    return { icon: '⚔', text: `${say(rand, TEXT.bandBroken, band)}${lootText(e)}` };
  }
  const echoes = !e.defender || e.defender === ECHOES.id || e.defender === 'ai';
  if (!e.winner) return { icon: '⚖', text: say(rand, TEXT.draw, vars) };
  if (e.winner !== e.attacker) return { icon: '🛡', text: say(rand, echoes ? TEXT.repelled : TEXT.held, vars) };
  if (e.undo?.guardian) {
    return { icon: '⚔', text: `${say(rand, echoes ? TEXT.claimed : TEXT.captured, vars)} ${say(rand, TEXT.guardianSlain, vars)}${lootText(e)}` };
  }
  return { icon: '⚔', text: say(rand, echoes ? TEXT.claimed : TEXT.captured, vars) };
}

/** Build the round's report (call it after endRound, once fog has been explored) and keep it on the campaign. */
export function buildReport(c: Campaign, r: Omit<RoundEnd, 'report'>, x: ReportExtras, date: string, rand: Rand = Math.random): TurnReport {
  const sight = new Map(c.factions.map((f) => [f.id, visibleTo(c, f.id)]));
  const gone = new Map([...r.cleared, ...r.spread].map((s) => [s.id, s.name]));
  const name = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? gone.get(id) ?? 'an unknown sector';
  const lines: TurnReportLine[] = [];
  const at = (sectorId: string, involved: (string | undefined)[], line: TurnReportLine) => {
    const factions = watchers(c, sectorId, involved, sight);
    lines.push({ ...line, sectorId, ...(factions ? { factions } : {}) });
  };

  // The war.
  for (const e of c.log) {
    if ((e.round ?? 1) !== r.round || e.spread || e.skirmish || e.crisis) continue;
    // Marauders are news everywhere.
    if (e.marauder) lines.push({ sectorId: e.sectorId, eventId: e.id, ...battleLine(c, e, name, rand) });
    else at(e.sectorId, [e.attacker, e.defender], { ...battleLine(c, e, name, rand), eventId: e.id });
  }
  if (r.crisis)
    lines.push({
      icon: '☄',
      text: r.crisis.result === 'won'
        ? `The Nexus Crisis is over: ${r.crisis.lord} was beaten at ${r.crisis.sectorName}.`
        : `${r.crisis.lord} could not be stopped. The Echoes took ${r.crisis.lost.map((s) => s.name).join(', ') || 'nothing, this time'}.`,
    });

  // The Echoes.
  const threat = r.threat > r.threatBefore ? TEXT.threatUp : r.threat < r.threatBefore ? TEXT.threatDown : TEXT.threatSame;
  lines.push({ icon: '☠', text: say(rand, threat, { echoes: ECHOES.name, threat: r.threat }) });
  for (const s of r.spread) {
    const lost = c.log.find((e) => e.spread && e.sectorId === s.id && (e.round ?? 1) === r.round)?.undo?.owner;
    const from = lost && lost !== ECHOES.id ? ` from ${factionName(c, lost)}` : '';
    at(s.id, [lost], { icon: '☠', text: say(rand, TEXT.spread, { echoes: ECHOES.name, sector: s.name, from }) });
  }
  for (const s of x.guardians ?? [])
    at(s.id, [], { icon: '♛', text: say(rand, TEXT.guardian, { guardian: s.guardian!.name, tier: s.guardian!.tier, sector: s.name }) });

  // The Marauders, seen by all.
  for (const x of r.marauders?.raids ?? [])
    lines.push({
      icon: '🏴', sectorId: x.sectorId,
      text: say(rand, x.repelled ? TEXT.raidRepelled : TEXT.raid, { band: x.band, sector: x.sector, stolen: x.stolen, owner: factionName(c, x.owner) }),
    });
  for (const m of r.marauders?.spawned ?? [])
    lines.push({ icon: '🏴', sectorId: m.sectorId, text: say(rand, TEXT.bandNew, { band: m.name, strength: m.strength, sector: name(m.sectorId) }) });

  // The map.
  for (const s of r.cleared) at(s.id, [], { icon: '✧', text: say(rand, s.type === 'archive' ? TEXT.archiveGone : TEXT.hulkGone, { sector: s.name }) });
  for (const s of r.fresh) at(s.id, [], { icon: '✦', text: say(rand, TEXT.fresh, { sector: s.name }) });

  // Each faction's own news.
  for (const f of c.factions) {
    const made = (x.production ?? []).filter((p) => p.sector.owner === f.id);
    if (made.length) {
      const gained = made.reduce((n, p) => n + p.gained, 0);
      const sites = made.length === 1 ? made[0].sector.name : `${made.length} worlds`;
      lines.push({ icon: '⚒', text: say(rand, TEXT.production, { gained, sites }), factions: [f.id] });
    }
    const learnt = (x.research ?? []).find((y) => y.factionId === f.id);
    if (learnt?.gained) lines.push({ icon: '🔬', text: say(rand, TEXT.research, { gained: learnt.gained, total: f.research ?? 0 }), factions: [f.id] });
    for (const b of (x.built ?? []).filter((y) => y.sector.owner === f.id)) {
      const name = buildingById(b.building)?.name ?? b.building;
      lines.push({ icon: '🏗', sectorId: b.sector.id, text: say(rand, TEXT.built, { sector: b.sector.name, building: name }), factions: [f.id] });
    }
  }
  for (const o of x.offers?.fresh ?? []) {
    const relic = o.unit.relics[0] ? `, carrying ${o.unit.relics[0].name}` : '';
    lines.push({
      icon: '★', factions: [o.factionId],
      text: say(rand, TEXT.offer, { unit: o.unit.unitType, level: levelForXp(o.unit.xp), relic, fee: o.fee }),
    });
  }
  for (const o of x.offers?.gone ?? []) lines.push({ icon: '☆', factions: [o.factionId], text: say(rand, TEXT.offerGone, { unit: o.unit.unitType }) });

  // What's coming.
  if (r.nextEvent) lines.push({ icon: '✺', text: `Galactic event: ${eventById(r.nextEvent)?.name ?? r.nextEvent}.` });
  if (r.newCrisis) lines.push({ icon: '☄', text: `Nexus Crisis! ${r.newCrisis.lord} rises at ${r.newCrisis.sectorName}.` });

  const report: TurnReport = { round: r.round, date, lines };
  c.reports = [...(c.reports ?? []), report].slice(-NEXUS_ROUNDS.keepRounds);
  return report;
}

/** The lines a faction may read (all of them for the GM, with no faction). */
export const reportFor = (report: TurnReport, factionId: string | undefined) =>
  factionId ? report.lines.filter((l) => !l.factions || l.factions.includes(factionId)) : report.lines;
