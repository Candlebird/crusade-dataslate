// Downtime between games: Expeditions (a short dice story into the Nexus) and the bookkeeping for solo patrols.
import type { Campaign, Force, SortieBoardEntry, Unit } from '../model/types';
import { SCAR_TABLE } from './data';
import { EXPEDITION, EXPEDITION_SITES, OFF_TABLE_XP, SOLO_PATROL, SORTIE, SORTIE_BOONS, SORTIE_QUIRKS, type ExpeditionCheck, type ExpeditionReward, type ExpeditionSite, type ExpeditionVariant } from './downtimeData';
import { applyScar, levelForXp } from './engine';
import { awardFeats, type FeatId } from './feats';
import { currentRound } from './nexus';
import { addQuirk, beastInfo, bossOf, bountyOf, fallenUnits, keepsHaul, memberName, memberUp, memberXp, quirkInfo, regionName, regionOf, relicsOf, runXp, threadDone, tierOf, trinketInfo, unlockedBoons, markHeat, veteranTitle, weekKey, weeklyScore, type SortieRun } from './sortie';

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

/** What the off-table XP limit counts over: the campaign's round, or outside a campaign the week. */
export const offTableKey = (c: Campaign | undefined, date: string) => (c ? `round-${currentRound(c)}` : weekKey(date));

/** Off-table XP the unit can still bank in this round (or week). */
export const offTableLeft = (u: Unit, key: string) =>
  Math.max(0, OFF_TABLE_XP.perRound - (u.offTableXp?.key === key ? u.offTableXp.n : 0));

/** Bank up to n XP from a free Sortie or a Training run, as far as the off-table limit allows. Returns what it got. */
export function bankOffTableXp(u: Unit, n: number, key: string): number {
  const left = offTableLeft(u, key);
  const got = Math.max(0, Math.min(n, left));
  u.offTableXp = { key, n: OFF_TABLE_XP.perRound - left + got };
  u.xp += got;
  return got;
}

/**
 * Pay a finished Sortie to the force: the XP (up to the run's cap) to each unit of the party, a Shard run's haul if it
 * got home, and on a Shard run each unit wiped out takes a battle scar or is Lost. A free run's XP counts toward the
 * off-table limit for the round (`key`, from offTableKey). Returns a one-line summary.
 */
export function applySortie(force: Force, run: SortieRun, date: string, newId: () => string, rand: Rand = Math.random, key = weekKey(date)): string {
  const units = run.party.map((m) => force.units.find((x) => x.id === m.unit.id)).filter((u): u is Unit => !!u && u.status !== 'removed');
  if (!units.length) return '';
  const xp = runXp(run);
  const held: string[] = [];
  for (const m of run.party) {
    const u = units.find((x) => x.id === m.unit.id);
    if (!u) continue;
    const want = memberXp(run, m);
    if (run.mode === 'shard') u.xp += want;
    else {
      const got = bankOffTableXp(u, want, key);
      if (got < want) held.push(`${memberName(m)} +${got}`);
    }
  }
  const half = run.party.some((m) => !memberUp(m)) ? ` (${Math.floor(xp / 2)} for the units wiped out)` : '';
  const limit = held.length ? ` (off-table XP limit: ${held.join(', ')})` : '';
  const bits = [`Sortie (${run.mode === 'shard' ? 'Shard' : 'free'}, ${run.length}) in ${regionName(run)} against ${bossOf(run).name} — ${run.party.map(memberName).join(', ')}: ${OUTCOME[run.over ?? 'quit']}, +${xp} XP each${half}${limit}`];
  const haul = keepsHaul(run) ? run.haul : { supply: 0, rp: 0, us: 0 };
  if (keepsHaul(run)) {
    const got = [haul.supply ? `${haul.supply} Supply` : '', haul.rp ? `${haul.rp} RP` : '', haul.us ? `${haul.us} Umbra Shard${haul.us > 1 ? 's' : ''}` : ''].filter(Boolean);
    if (got.length) bits.push(got.join(', '));
    force.umbraShards += haul.us;
  } else if (run.mode === 'shard' && (run.haul.supply || run.haul.rp || run.haul.us)) bits.push('the haul was lost');
  for (const f of fallenUnits(run)) {
    const u = units.find((x) => x.id === f.id);
    if (!u) continue;
    if (d6(rand) <= EXPEDITION.ambushScarOn) {
      const scars = SCAR_TABLE.filter((s) => s.name !== 'Comatose');
      const scar = scars[Math.floor(rand() * scars.length)];
      const r = applyScar(u, { id: newId(), name: scar.name, desc: scar.desc });
      bits.push(`${u.name || u.unitType}: ${scar.name}${r === 'removed' ? ' (removed)' : ''}`);
    } else {
      u.status = 'comatose';
      bits.push(`${u.name || u.unitType}: Lost, sits out the next battle`);
    }
  }
  // What the force carries from run to run: grudges, deep regions and relics (rules/sortieStory.ts).
  const story = (force.sortie ??= {});
  // Counts for boon unlocks, seeded from the recaps for a force that ran before they were kept.
  const stats = (story.stats ??= {
    runs: story.recaps?.length ?? 0,
    wins: story.recaps?.filter((r) => r.over === 'won').length ?? 0,
    flawless: 0,
    deepest: Math.max(0, ...(story.recaps ?? []).map((r) => r.depth)),
  });
  const boonsBefore = unlockedBoons(story);
  stats.runs++;
  if (run.over === 'won') stats.wins++;
  if (run.over === 'won' && run.party.every(memberUp)) stats.flawless++;
  stats.deepest = Math.max(stats.deepest, run.depth);
  const grudge = { ...story.nemesis };
  const grudgeBefore = grudge[run.boss] ?? 0;
  const bounty = bountyOf(run);
  if (run.lordWon) {
    grudge[run.boss] = Math.min(SORTIE.nemesis.max, (grudge[run.boss] ?? 0) + 1);
    bits.push(`${bossOf(run).name} will remember this`);
  } else if (run.bossDown && grudge[run.boss]) {
    delete grudge[run.boss];
    if (bounty) bits.push(`a grudge settled: ${bounty} RP bounty`);
  }
  story.nemesis = grudge;
  if (threadDone(run) && !run.deep && !story.deep?.includes(run.region)) {
    story.deep = [...(story.deep ?? []), run.region];
    bits.push(`unlocked ${regionOf(run).deep.name}`);
  }
  for (const relic of relicsOf(run)) {
    if (story.relics?.includes(relic.sortie!)) continue;
    story.relics = [...(story.relics ?? []), relic.sortie!];
    bits.push(`brought home ${relic.name} (free for a unit that can carry a relic)`);
  }
  // Quirks: a unit still standing deep in may pick up a good habit, one wiped out a bad one.
  const goods = Object.keys(SORTIE_QUIRKS).filter((k) => SORTIE_QUIRKS[k].good);
  const bads = Object.keys(SORTIE_QUIRKS).filter((k) => !SORTIE_QUIRKS[k].good);
  for (const m of run.party) {
    const u = units.find((x) => x.id === m.unit.id);
    if (!u) continue;
    const up = memberUp(m);
    if (up && run.depth < SORTIE.quirks.depth) continue;
    if (rand() >= (up ? (run.over === 'won' ? SORTIE.quirks.goodWon : SORTIE.quirks.good) : SORTIE.quirks.bad)) continue;
    const id = rand() < SORTIE.quirks.region ? `${up ? 'native' : 'haunted'}:${run.region}` : (up ? goods : bads)[Math.floor(rand() * (up ? goods : bads).length)];
    if (addQuirk(u, id)) bits.push(`${u.name || u.unitType} is now ${quirkInfo(id)!.name}`);
  }
  // Every unit's Sortie record: runs it came back from standing, and lords slain; a new title is worth a line.
  for (const m of run.party) {
    const u = units.find((x) => x.id === m.unit.id);
    if (!u) continue;
    const before = veteranTitle(u);
    const rec = (u.sortieRecord ??= { runs: 0, lords: 0 });
    if (memberUp(m) && run.over !== 'fell') rec.runs++;
    if (run.bossDown) rec.lords++;
    const after = veteranTitle(u);
    if (after && after !== before) bits.push(`${u.name || u.unitType} is now known as ${after}`);
  }
  // The bestiary: every Echo met adds to the force's count, and the first one slain unlocks its lore.
  const beasts = (story.bestiary ??= {});
  const fresh: string[] = [];
  const learned: string[] = [];
  for (const [k, v] of Object.entries(run.met ?? {})) {
    const b = (beasts[k] ??= { met: 0, slain: 0 });
    if (!b.met && v.met) fresh.push(beastInfo(k).name);
    if (!b.slain && v.slain) learned.push(beastInfo(k).name);
    b.met += v.met;
    b.slain += v.slain;
  }
  // The most pact-mark heat a lord was slain under.
  const heat = markHeat(run);
  if (run.bossDown && heat) {
    const b = (beasts['lord:' + run.boss] ??= { met: 0, slain: 0 });
    if (heat > (b.mark ?? 0)) {
      b.mark = heat;
      bits.push(`slew ${bossOf(run).name} under ${heat} pact heat, its hardest yet`);
    }
  }
  // Battle scars are for the run only, but the recap names them.
  const scars = run.party.flatMap((m) => (m.scars ?? []).map((id) => `${memberName(m)} ${SORTIE.scars[id].name}`));
  if (scars.length) bits.push(`battle scars: ${scars.join(', ')}`);
  if (fresh.length) bits.push(`met ${fresh.join(', ')} for the first time`);
  if (learned.length) bits.push(`learned the lore of ${learned.join(', ')}`);
  // Winning at the top tier unlocks the next Ascension level.
  const asc = run.ascension ?? 0;
  if (run.over === 'won' && tierOf(run) === SORTIE.tiers.length - 1 && asc >= (story.ascension ?? 0) && asc < SORTIE.ascension.curses.length) {
    story.ascension = asc + 1;
    bits.push(`unlocked Ascension ${story.ascension}`);
  }
  // Winning at the hardest tier open unlocks the next.
  if (run.over === 'won' && tierOf(run) >= (story.tier ?? 0) && tierOf(run) < SORTIE.tiers.length - 1) {
    story.tier = tierOf(run) + 1;
    bits.push(`unlocked ${SORTIE.tiers[story.tier].name}`);
  }
  // Boons unlocked by what the force has done, this run and before.
  const boonsNew = unlockedBoons(story).filter((id) => !boonsBefore.includes(id));
  if (boonsNew.length) bits.push(`unlocked the boon${boonsNew.length === 1 ? '' : 's'} ${boonsNew.map((id) => SORTIE_BOONS[id].name).join(', ')}`);
  // Trinkets found come home whatever happened, into the force's spares (up to SORTIE.trinkets.spares).
  const found = (run.trinkets ?? []).slice(0, Math.max(0, SORTIE.trinkets.spares - (story.trinkets?.length ?? 0)));
  if (found.length) {
    story.trinkets = [...(story.trinkets ?? []), ...found];
    bits.push(`found ${found.map((t) => trinketInfo(t)?.name ?? t).join(', ')}`);
  }
  // Feats: the hardest runs pay a real reward, once per force.
  const won = run.over === 'won';
  const top = won && tierOf(run) === SORTIE.tiers.length - 1;
  const feats: FeatId[] = [
    ...(top ? ['sortieTop' as const] : []),
    ...(top && run.party.every(memberUp) ? ['sortieFlawless' as const] : []),
    ...(top && asc >= 4 ? ['sortieAsc4' as const] : []),
    ...(top && asc >= SORTIE.ascension.curses.length ? ['sortieAsc8' as const] : []),
    ...(run.bossDown && heat >= 6 ? ['sortieHeat' as const] : []),
    ...(run.bossDown && grudgeBefore >= SORTIE.nemesis.max ? ['sortieNemesis' as const] : []),
  ];
  bits.push(...awardFeats(force, feats, run.party.map((m) => m.unit.id), date, newId));
  const summary = bits.join('; ');
  // A recap of the run, to look back on from the force.
  story.recaps = [{
    id: newId(), date, region: regionName(run), lord: bossOf(run).name, over: run.over ?? 'quit', mode: run.mode,
    length: run.length, ...(run.tier ? { tier: run.tier } : {}), ...(run.ascension ? { ascension: run.ascension } : {}), depth: run.depth, won: run.won,
    party: run.party.map(memberName), lines: run.journal.map((l) => l.text), gained: bits.slice(1).join('; ') || `+${xp} XP each`,
    ...(run.weekly ? { weekly: run.weekly, score: weeklyScore(run) } : {}),
  }, ...(story.recaps ?? [])].slice(0, SORTIE.recaps);
  // The Shard paid at the start (startSortie) shows here, net of any brought home.
  const us = haul.us - (run.mode === 'shard' ? SORTIE.cost : 0);
  force.ledger.push({ id: newId(), date, label: summary, rp: haul.rp + bounty, supply: haul.supply, ...(us ? { us } : {}) });
  return summary;
}

/**
 * Post a weekly challenge run to the campaign's board: a force keeps only its best run each week, and the board only
 * the last few weeks. Returns the new board.
 */
export function postWeekly(board: Campaign['sortieBoard'], force: Force, run: SortieRun, date: string): SortieBoardEntry[] {
  const list = [...(board ?? [])];
  if (!run.weekly) return list;
  const entry: SortieBoardEntry = {
    week: run.weekly, forceId: force.id, force: force.name, player: force.player, depth: run.depth, score: weeklyScore(run),
    over: run.over ?? 'quit', date,
  };
  const i = list.findIndex((e) => e.week === entry.week && e.forceId === force.id);
  if (i < 0) list.push(entry);
  else if (entry.score > list[i].score) list[i] = entry;
  const weeks = [...new Set(list.map((e) => e.week))].sort().reverse().slice(0, SORTIE.weekly.weeks);
  return list.filter((e) => weeks.includes(e.week));
}

/** A week's board, best first. */
export const weekBoard = (board: Campaign['sortieBoard'], week: string) =>
  (board ?? []).filter((e) => e.week === week).sort((a, b) => b.score - a.score || b.depth - a.depth);

const OUTCOME: Record<NonNullable<SortieRun['over']>, string> = {
  won: 'cleared the run', home: 'headed home', fell: 'wiped out', broke: 'broke and fled', quit: 'turned back',
};

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
