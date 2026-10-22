import type { Campaign, CampaignFaction, CrossroadsJournal, Force, JournalMark, JournalOption, JournalRoll, Unit } from '../model/types';
import { MAX_SCARS, SCAR_TABLE } from './data';
import { applyScar, hasRule, ruleRating } from './engine';
import { visibleTo } from './fog';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import {
  JOURNAL, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_CONTEXTS, JOURNAL_REWARDS, JOURNAL_SKILLS, JOURNAL_THREADS,
  JOURNAL_TWISTS, type JournalReward, type JournalSkillId,
} from './journalData';
import { positionOf } from './movement';
import { currentRound, homeOf } from './nexus';
import { NEXUS_ROUNDS } from './nexusData';
import { randomRelic } from './relicPick';
import { depositBanked, withdrawBanked } from './production';

// Crossroads Journal (Nexus Wars): once a round each faction's Warlord gets a vignette dealt from the tables in
// journalData.ts. The player picks an approach (a check), answers the complication (a risky choice is a check too) and
// rolls the climax. The successes set the best reward tier on offer; four rewards from the loot tables are offered as
// endings A–D (Claude writes them when the proxy can reach it, see journalAi.ts; otherwise the tables do), at least one
// of them nothing or worse. The player picks one: campaign effects apply at once, the Warlord's own (Umbra Shards, XP,
// relics, scars, trait tokens) when its owner's app next loads the force (journalsOwed / payJournal).

export const skillById = (id: string | undefined) => JOURNAL_SKILLS.find((s) => s.id === id);
export const contextById = (id: string | undefined) => JOURNAL_CONTEXTS.find((x) => x.id === id);
export const catalystById = (id: string | undefined) => JOURNAL_CATALYSTS.find((x) => x.id === id);
export const complicationById = (id: string | undefined) => JOURNAL_COMPLICATIONS.find((x) => x.id === id);
export const rewardById = (id: string | undefined) => JOURNAL_REWARDS.find((x) => x.id === id);
export const twistById = (id: string | undefined) => JOURNAL_TWISTS.find((x) => x.id === id);
export const threadById = (id: string | undefined) => JOURNAL_THREADS.find((x) => x.id === id);

/** A journal text with the rival Warlord's name in place of `{rival}`. */
export const journalText = (j: CrossroadsJournal, text: string) => text.replace(/\{rival\}/g, j.rival?.name ?? 'a rival Warlord');

/** The beat of its faction's story thread the journal plays, if it plays one. */
export const threadBeat = (j: CrossroadsJournal) => {
  const t = threadById(j.thread?.id);
  return t && j.thread ? { name: t.name, step: j.thread.step, of: t.steps.length, text: journalText(j, t.steps[j.thread.step] ?? '') } : undefined;
};

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pick = <T>(xs: T[], rand: Rand): T => xs[Math.floor(rand() * xs.length)];

/** Pick by weight; anything with no weight only when nothing has any. */
function pickWeighted<T>(xs: T[], weight: (x: T) => number, rand: Rand): T {
  const ws = xs.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(xs, rand);
  let n = rand() * total;
  for (let i = 0; i < xs.length; i++) if ((n -= ws[i]) < 0 && ws[i] > 0) return xs[i];
  let last = 0;
  ws.forEach((w, i) => { if (w > 0) last = i; });
  return xs[last];
}

/** The pieces (`prefix` `ctx:`, `cat:`, `comp:` or `rew:`) the faction's last journals used, newest last. */
const lastSeen = (f: CampaignFaction | undefined, prefix: string, n: number) =>
  new Set((f?.journalSeen ?? []).filter((x) => x.startsWith(prefix)).slice(-n).map((x) => x.slice(prefix.length)));

function remember(f: CampaignFaction, ...ids: string[]) {
  f.journalSeen = [...(f.journalSeen ?? []), ...ids].slice(-JOURNAL.seenKeep);
}

/** Leave out the recently seen, unless that leaves nothing. */
const fresh = <T extends { id: string }>(xs: T[], seen: Set<string>) => {
  const left = xs.filter((x) => !seen.has(x.id));
  return left.length ? left : xs;
};

export type JournalCheck = 'approach' | 'choice' | 'climax' | 'twist';
export type JournalStatus = 'play' | 'offer' | 'done';

export const journalStatus = (j: CrossroadsJournal): JournalStatus => (j.picked != null ? 'done' : j.options ? 'offer' : 'play');

/** The faction's journal for a round (this one by default), or one from an earlier round it hasn't finished yet. */
export const journalOf = (c: Campaign, factionId: string, round = currentRound(c)) => {
  const own = (c.journals ?? []).filter((j) => j.factionId === factionId);
  return own.find((j) => j.round === round) ?? own.filter((j) => j.round < round && j.picked == null).pop();
};

/** Why a journal can't be dealt to the faction now, if it can't. */
export function journalBlock(c: Campaign, factionId: string): string | undefined {
  const f = c.factions.find((x) => x.id === factionId);
  if (!f) return 'Unknown faction';
  if (!f.warlord) return 'It has no Warlord';
  const j = journalOf(c, factionId);
  if (j) return j.round === currentRound(c) ? 'Its Warlord already has a journal this round' : 'Its Warlord has a journal to finish first';
  return undefined;
}

/** The Warlord the journal is about, when its force is loaded and it's still in play. */
export function journalUnit(j: CrossroadsJournal, forces: Force[]): Unit | undefined {
  const u = forces.find((f) => f.id === j.forceId)?.units.find((x) => x.id === j.unitId);
  return u && u.status !== 'removed' ? u : undefined;
}

/** +1 for each special rule that helps the skill, up to JOURNAL.maxBonus; Command gets +1 from a seasoned Warlord. */
export function skillBonus(u: Unit, skill: JournalSkillId, level: number): number {
  const s = skillById(skill);
  if (!s) return 0;
  const rules = s.bonuses.filter((b) => (b.min == null ? hasRule(u.rules, b.rule) : (ruleRating(u.rules, b.rule) ?? 0) >= b.min)).length;
  const command = skill === 'command' && level >= JOURNAL.commandLevel ? 1 : 0;
  return Math.min(rules + command, JOURNAL.maxBonus);
}

/** What a check needs on a D6: the skill's stat, less the bonus, plus any penalty (2+ at best, 6+ at worst). */
export function checkTarget(u: Unit, skill: JournalSkillId, level: number, penalty = 0): number {
  const s = skillById(skill);
  const stat = s?.stat === 'defense' ? u.defense : u.quality;
  return clamp(stat - skillBonus(u, skill, level) + penalty, 2, 6);
}

function roll(skill: string, target: number, rand: Rand): JournalRoll {
  const r = 1 + Math.floor(rand() * 6);
  return { skill, target, rolls: [r], pass: r >= target };
}

/**
 * Deal a journal to a faction's Warlord. The context suits where its detachment stands (and the Warlord's special rules),
 * and none of the pieces is one the faction has seen lately. Now and then a twist, a rival Warlord or the faction's story
 * thread comes into it.
 */
export function dealJournal(c: Campaign, factionId: string, forces: Force[], rand: Rand, id: string, date: string): CrossroadsJournal | undefined {
  const f = c.factions.find((x) => x.id === factionId);
  const w = f?.warlord;
  if (!f || !w || journalBlock(c, factionId)) return undefined;
  const force = forces.find((x) => x.id === w.forceId);
  const at = (force && positionOf(c, force)) || homeOf(c, factionId);
  const near = new Set(at && isPlaced(at) ? c.sectors.filter((s) => isPlaced(s) && hexDistance(s as Hex, at as Hex) <= 2).map((s) => s.type) : []);
  const unit = force?.units.find((u) => u.id === w.unitId);
  const suits = (rules: string[] | undefined) => !!unit && !!rules?.some((r) => hasRule(unit.rules, r));
  const round = currentRound(c);
  const context = pickWeighted(fresh(JOURNAL_CONTEXTS, lastSeen(f, 'ctx:', JOURNAL.avoid.ctx)), (x) => {
    const where = !x.types ? 1 : at?.type && x.types.includes(at.type) ? 4 : x.types.some((t) => near.has(t)) ? 2 : 0;
    return where * (suits(x.rules) ? 3 : 1);
  }, rand);
  // Not a catalyst another faction drew this round, nor one of this faction's lately.
  const recent = lastSeen(f, 'cat:', JOURNAL.avoid.cat);
  (c.journals ?? []).filter((j) => j.round === round || j.factionId === factionId).forEach((j) => recent.add(j.catalyst));
  const catalyst = pick(fresh(JOURNAL_CATALYSTS, recent), rand);
  const j: CrossroadsJournal = {
    id, factionId, round, date, forceId: w.forceId, unitId: w.unitId, warlord: w.name, context: context.id, catalyst: catalyst.id, complication: '',
  };
  if (at?.id) j.sectorId = at.id;
  const rivals = c.factions.filter((x) => x.id !== factionId && x.warlord);
  const rivalOf = (fid: string | undefined) => {
    const r = c.factions.find((x) => x.id === fid);
    return r && { factionId: r.id, name: r.warlord?.name ?? r.name };
  };
  // The faction's story thread: an open one comes back half the time; with none, now and then one starts.
  if (f.thread && threadById(f.thread.id)) {
    if (rand() < JOURNAL.threadResume) {
      const t = threadById(f.thread.id)!;
      const step = Math.min(f.thread.step + 1, t.steps.length - 1);
      j.thread = { id: t.id, step, last: step === t.steps.length - 1, ...(f.thread.factionId ? { factionId: f.thread.factionId } : {}) };
    }
  } else if (rand() < JOURNAL.threadStart) {
    const t = pick(JOURNAL_THREADS.filter((x) => !x.rival || rivals.length), rand);
    const rival = t.rival ? pick(rivals, rand) : undefined;
    j.thread = { id: t.id, step: 0, last: false, ...(rival ? { factionId: rival.id } : {}) };
  }
  const threadRival = rivalOf(j.thread?.factionId);
  if (threadRival) j.rival = threadRival;
  else if (rivals.length && rand() < JOURNAL.rivalChance) j.rival = rivalOf(pick(rivals, rand).id);
  const comps = JOURNAL_COMPLICATIONS.filter((x) => !x.rival || j.rival);
  // A rival in the scene shows up in the complication when there's one for it.
  const rivalComps = j.rival && !threadRival ? comps.filter((x) => x.rival) : [];
  j.complication = pick(fresh(rivalComps.length ? rivalComps : comps.filter((x) => !x.rival || !j.rival || threadRival), lastSeen(f, 'comp:', JOURNAL.avoid.comp)), rand).id;
  if (rand() < JOURNAL.twistChance) j.twist = { id: pick(JOURNAL_TWISTS, rand).id };
  remember(f, `ctx:${j.context}`, `cat:${j.catalyst}`, `comp:${j.complication}`);
  (c.journals ??= []).push(j);
  return j;
}

/** GM: swap a piece of the scene, or set its framing note, until the first check is rolled. */
export function reframeJournal(j: CrossroadsJournal, next: Partial<Pick<CrossroadsJournal, 'context' | 'catalyst' | 'complication' | 'note'>>): boolean {
  if (j.approach) return false;
  if (next.context !== undefined && !contextById(next.context)) return false;
  if (next.catalyst !== undefined && !catalystById(next.catalyst)) return false;
  if (next.complication !== undefined && (!complicationById(next.complication) || (complicationById(next.complication)!.rival && !j.rival))) return false;
  Object.assign(j, next);
  if (j.note !== undefined && !j.note.trim()) delete j.note;
  return true;
}

/** The first check: how the Warlord takes the catalyst on. */
export function rollApproach(j: CrossroadsJournal, approachId: string, u: Unit, level: number, rand: Rand): boolean {
  const a = catalystById(j.catalyst)?.approaches.find((x) => x.id === approachId);
  if (!a || j.approach) return false;
  j.approach = { id: a.id, roll: roll(a.skill, checkTarget(u, a.skill, level), rand) };
  return true;
}

/** Answer the complication: the risky choice is a check, the safe one isn't. */
export function chooseComplication(j: CrossroadsJournal, choiceId: string, u: Unit, level: number, rand: Rand): boolean {
  const ch = complicationById(j.complication)?.choices.find((x) => x.id === choiceId);
  if (!ch || !j.approach || j.choice) return false;
  j.choice = ch.skill ? { id: ch.id, roll: roll(ch.skill, checkTarget(u, ch.skill, level), rand) } : { id: ch.id };
  return true;
}

/** A risky choice that failed makes the climax harder. */
export const climaxPenalty = (j: CrossroadsJournal) => (j.choice?.roll && !j.choice.roll.pass ? 1 : 0);

/** The last check, with one of the catalyst's climax skills. */
export function rollClimax(j: CrossroadsJournal, skill: JournalSkillId, u: Unit, level: number, rand: Rand): boolean {
  const cat = catalystById(j.catalyst);
  if (!cat?.climax.skills.includes(skill) || !j.choice || j.climax) return false;
  j.climax = roll(skill, checkTarget(u, skill, level, climaxPenalty(j)), rand);
  return true;
}

/** The twist, after the climax: one more check, with one of the twist's skills. */
export function rollTwist(j: CrossroadsJournal, skill: JournalSkillId, u: Unit, level: number, rand: Rand): boolean {
  const t = twistById(j.twist?.id);
  if (!t || !j.twist || !t.skills.includes(skill) || !j.climax || j.twist.roll) return false;
  j.twist.roll = roll(skill, checkTarget(u, skill, level), rand);
  return true;
}

const rollOf = (j: CrossroadsJournal, which: JournalCheck) =>
  which === 'approach' ? j.approach?.roll : which === 'choice' ? j.choice?.roll : which === 'twist' ? j.twist?.roll : j.climax;

/** Can this check be re-rolled (once, before the endings are offered)? */
export function canReroll(j: CrossroadsJournal, which: JournalCheck): boolean {
  const r = rollOf(j, which);
  // The climax target already counts a failed risky choice, so the choice can't be re-rolled once the climax is.
  return !!r && r.rolls.length === 1 && !j.options && !(which === 'choice' && j.climax);
}

/** Re-roll a check; the new roll stands. (The caller takes JOURNAL.rerollCost Umbra Shards from the Warlord's force.) */
export function rerollCheck(j: CrossroadsJournal, which: JournalCheck, rand: Rand): boolean {
  const r = rollOf(j, which);
  if (!r || !canReroll(j, which)) return false;
  const n = 1 + Math.floor(rand() * 6);
  r.rolls.push(n);
  r.pass = n >= r.target;
  return true;
}

/** Are the checks done, so the endings can be offered? */
export const checksDone = (j: CrossroadsJournal) => !!j.climax && (!j.twist || !!j.twist.roll);

/** Checks passed (0–4 with a twist). */
export const successes = (j: CrossroadsJournal) => [j.approach?.roll, j.choice?.roll, j.climax, j.twist?.roll].filter((r) => r?.pass).length;

/** The best reward tier the journal can offer (3 at most, twist or not). */
export const tierCap = (j: CrossroadsJournal) => Math.min(3, Math.max(JOURNAL.minTier, successes(j)));

/** How many of the endings must give nothing or worse: two after a total failure, else one; one more for a failed twist. */
export const minNothing = (j: CrossroadsJournal) => (successes(j) === 0 ? 2 : 1) + (j.twist?.roll && !j.twist.roll.pass ? 1 : 0);

/** The thread payoff the journal must offer: on the last beat of its faction's story thread. */
export const requiredReward = (j: CrossroadsJournal) => (j.thread?.last ? threadById(j.thread.id)?.payoff : undefined);

/** The themes of the scene and the player's choices, for matching rewards. */
export function journalTags(j: CrossroadsJournal): string[] {
  const cat = catalystById(j.catalyst);
  const tags = [
    ...(contextById(j.context)?.tags ?? []),
    ...(cat?.tags ?? []),
    ...(cat?.approaches.find((a) => a.id === j.approach?.id)?.tags ?? []),
    ...(complicationById(j.complication)?.choices.find((x) => x.id === j.choice?.id)?.tags ?? []),
  ];
  return [...new Set(tags)];
}

/** Relic names already held in the loaded forces (relics are unique). */
const heldRelics = (forces: Force[]) => new Set(forces.flatMap((f) => f.units.flatMap((u) => u.relics.map((r) => r.name))));

const scarPool = (u: Unit) => SCAR_TABLE.filter((s) => s.name !== 'Comatose' && !u.scars.some((x) => x.name === s.name));

/** Rewards the journal may offer: up to its tier cap, and only what the Warlord can actually take. */
export function eligibleRewards(j: CrossroadsJournal, u: Unit, forces: Force[]): JournalReward[] {
  const cap = tierCap(j);
  const taken = heldRelics(forces);
  const payoff = requiredReward(j);
  return JOURNAL_REWARDS.filter((r) => (r.thread ? r.id === payoff : r.tier <= cap) && r.effects.every((e) => {
    if (e.kind === 'scar') return u.scars.length < MAX_SCARS && scarPool(u).length > 0;
    if (e.kind === 'relic') return !!randomRelic(u, e.tier, taken, () => 0, 'x');
    return true;
  }));
}

/** Does this set of reward ids make a fair offer? Four different, eligible ones, enough of them bad, one at the cap. */
export function validOffer(j: CrossroadsJournal, u: Unit, forces: Force[], ids: string[]): boolean {
  const ok = new Map(eligibleRewards(j, u, forces).map((r) => [r.id, r]));
  const rs = ids.map((id) => ok.get(id));
  if (ids.length !== 4 || new Set(ids).size !== 4 || rs.some((r) => !r)) return false;
  const payoff = requiredReward(j);
  if (payoff && ok.has(payoff) && !ids.includes(payoff)) return false;
  return rs.filter((r) => r!.tier <= 0).length >= minNothing(j) && rs.some((r) => r!.tier === tierCap(j));
}

/** Endings the faction has had lately (`journalSeen`), to offer less often. */
export const recentRewards = (c: Campaign, factionId: string) => lastSeen(c.factions.find((x) => x.id === factionId), 'rew:', JOURNAL.avoid.rew);

/**
 * The tables' own pick of four rewards: the thread's payoff if it's due, the most fitting bad ones, the best fit at the
 * cap, then the best of the rest. Fit: the scene's themes, the catalyst's tables, the Warlord's special rules; endings
 * in `seen` (had lately) fit less.
 */
export function localOffer(j: CrossroadsJournal, u: Unit, forces: Force[], rand: Rand, seen: Set<string> = new Set()): string[] {
  const tags = new Set(journalTags(j));
  const tables = catalystById(j.catalyst)?.tables ?? [];
  const scored = eligibleRewards(j, u, forces)
    .map((r) => ({
      r,
      score: r.tags.filter((t) => tags.has(t)).length + (tables.includes(r.table) ? 2 : 0) + (r.rules?.some((x) => hasRule(u.rules, x)) ? 1.5 : 0)
        - (seen.has(r.id) ? 2 : 0) + rand() * 0.5,
    }))
    .sort((a, b) => b.score - a.score);
  const out: JournalReward[] = [];
  const take = (r: JournalReward | undefined) => r && !out.includes(r) && out.push(r);
  take(scored.find((x) => x.r.id === requiredReward(j))?.r);
  scored.filter((x) => x.r.tier <= 0).slice(0, minNothing(j)).forEach((x) => take(x.r));
  take(scored.find((x) => x.r.tier === tierCap(j))?.r);
  while (out.length < 4) {
    const used = new Set(out.map((r) => r.table));
    const next = scored.filter((x) => !out.includes(x.r)).map((x) => ({ ...x, score: x.score - (used.has(x.r.table) ? 1.5 : 0) })).sort((a, b) => b.score - a.score)[0];
    if (!next) break;
    take(next.r);
  }
  return out.map((r) => r.id);
}

/**
 * Offer the endings: the four rewards with the words to go with them (Claude's, or the rewards' own). A relic or scar
 * an ending carries is drawn now, so the player sees exactly what they'd get. False when the offer isn't valid.
 */
export function makeOffer(
  j: CrossroadsJournal, picks: { rewardId: string; title?: string; text?: string }[], source: 'claude' | 'tables',
  u: Unit, forces: Force[], rand: Rand, newId: () => string,
): boolean {
  if (!checksDone(j) || j.options || !validOffer(j, u, forces, picks.map((p) => p.rewardId))) return false;
  const taken = heldRelics(forces);
  const options: JournalOption[] = picks.map((p) => {
    const r = rewardById(p.rewardId)!;
    const o: JournalOption = { rewardId: r.id, title: p.title?.trim() || r.name, text: p.text?.trim() || r.desc };
    for (const e of r.effects) {
      if (e.kind === 'relic') {
        o.relic = randomRelic(u, e.tier, taken, rand, newId());
        if (o.relic) taken.add(o.relic.name);
      }
      if (e.kind === 'scar') {
        const s = pick(scarPool(u), rand);
        o.scar = { id: newId(), name: s.name, desc: s.desc };
      }
    }
    return o;
  });
  j.options = options;
  j.source = source;
  return true;
}

/** The n nearest placed sectors the faction has never seen, from where its Warlord stands. */
function unseenNear(c: Campaign, factionId: string, from: Hex | undefined, n: number): string[] {
  if (!from || n <= 0) return [];
  const seen = new Set([...(c.explored?.[factionId] ?? []), ...visibleTo(c, factionId)]);
  return c.sectors
    .filter((s) => isPlaced(s) && !seen.has(s.id))
    .sort((a, b) => hexDistance(from, a as Hex) - hexDistance(from, b as Hex))
    .slice(0, n)
    .map((s) => s.id);
}

/**
 * Pick an ending. Its campaign effects (Materials, Research, Blueprints, Building Expansions, Archive unlocks, threat,
 * revealed sectors) apply now; the Warlord's own wait for its force (payJournal). Returns a line saying what happened.
 */
export function pickOption(c: Campaign, id: string, index: number, forces: Force[], date: string): string | undefined {
  const j = (c.journals ?? []).find((x) => x.id === id);
  const o = j?.options?.[index];
  const f = j && c.factions.find((x) => x.id === j.factionId);
  const r = rewardById(o?.rewardId);
  if (!j || !o || !f || !r || j.picked != null) return undefined;
  const bits: string[] = [];
  for (const e of r.effects) {
    if (e.kind === 'materials') {
      const n = e.n > 0 ? depositBanked(c, f.id, e.n) : -withdrawBanked(c, f.id, -e.n);
      if (n) bits.push(`${n > 0 ? '+' : '−'}${Math.abs(n)} Materials`);
    } else if (e.kind === 'research' || e.kind === 'blueprints' || e.kind === 'cores' || e.kind === 'archives') {
      f[e.kind] = (f[e.kind] ?? 0) + e.n;
      bits.push(`+${e.n} ${{ research: 'Research', blueprints: 'Blueprint', cores: 'Building Expansion', archives: 'Archive unlock' }[e.kind]}`);
    } else if (e.kind === 'threat') {
      const was = c.threat ?? NEXUS_ROUNDS.threatStart;
      c.threat = clamp(was + e.n, 0, NEXUS_ROUNDS.threatMax);
      if (c.threat !== was) bits.push(`threat ${c.threat > was ? '+' : '−'}${Math.abs(c.threat - was)}`);
    } else if (e.kind === 'reveal') {
      const force = forces.find((x) => x.id === j.forceId);
      const from = (force && positionOf(c, force)) || homeOf(c, f.id);
      const ids = unseenNear(c, f.id, from && isPlaced(from) ? from : undefined, e.n);
      if (ids.length) {
        c.explored = { ...c.explored, [f.id]: [...(c.explored?.[f.id] ?? []), ...ids] };
        bits.push(`${ids.length} sector${ids.length === 1 ? '' : 's'} revealed`);
      }
    } else if (e.kind === 'mark') {
      const round = currentRound(c);
      const m: JournalMark = { id: `${j.id}-${f.marks?.length ?? 0}-${bits.length}`, journalId: j.id, kind: e.mark, name: e.name, text: e.text, good: e.good, from: round };
      if (e.mark === 'battle' || e.mark === 'order') Object.assign(m, { until: round + 1, forceId: j.forceId, unitId: j.unitId });
      if (e.mark === 'order') m.move = e.move ?? (e.good ? 1 : -1);
      if (e.mark === 'quirk') Object.assign(m, { forceId: j.forceId, unitId: j.unitId });
      if (e.mark === 'sector') {
        const force = forces.find((x) => x.id === j.forceId);
        const sid = j.sectorId ?? (force && positionOf(c, force))?.id;
        if (!sid) continue;
        Object.assign(m, { until: round + (e.rounds ?? JOURNAL.sectorRounds), sectorId: sid });
      }
      let marks = (f.marks ?? []).filter((x) => x.until == null || x.until >= round);
      if (e.mark === 'quirk') {
        const quirks = marks.filter((x) => x.kind === 'quirk' && x.unitId === j.unitId);
        if (quirks.length >= JOURNAL.maxQuirks) marks = marks.filter((x) => x !== quirks[0]);
      }
      f.marks = [...marks, m];
      bits.push(e.name === o.title ? e.text : e.name);
    }
  }
  // The story thread moves on a beat, or ends on its last.
  if (j.thread) {
    if (j.thread.last) delete f.thread;
    else f.thread = { id: j.thread.id, step: j.thread.step, since: f.thread?.since ?? j.round, ...(j.thread.factionId ? { factionId: j.thread.factionId } : {}) };
  }
  remember(f, `rew:${r.id}`);
  j.picked = index;
  j.pickedOn = date;
  // Keep the newest finished journals (and every one still in play). One whose force may not have taken its reward yet
  // is kept longer, up to JOURNAL.keepOwed.
  const done = c.journals!.filter((x) => x.picked != null);
  const owed = (x: CrossroadsJournal) => touchesForce(rewardById(x.options?.[x.picked!]?.rewardId));
  const newest = new Set(done.slice(-JOURNAL.keep));
  const owedKept = new Set(done.filter(owed).slice(-JOURNAL.keepOwed));
  const drop = new Set(done.filter((x) => !newest.has(x) && !owedKept.has(x)));
  if (drop.size) c.journals = c.journals!.filter((x) => !drop.has(x));
  return `${o.title}${bits.length ? `: ${bits.join(', ')}` : ''}.`;
}

/** Does the reward do anything to the Warlord's force? */
export const touchesForce = (r: JournalReward | undefined) =>
  !!r?.effects.some((e) => e.kind === 'shards' || e.kind === 'xp' || e.kind === 'relic' || e.kind === 'scar' || e.kind === 'traitToken');

/** Finished journals whose Warlord rewards (or costs) this force hasn't taken yet. */
export function journalsOwed(c: Campaign, f: Force): CrossroadsJournal[] {
  return (c.journals ?? []).filter((j) =>
    j.picked != null && j.forceId === f.id && !!f.nexus && !f.nexus.journalsPaid?.includes(j.id) && touchesForce(rewardById(j.options?.[j.picked]?.rewardId)));
}

/**
 * Give the Warlord's force what its ending says: Umbra Shards (or take them, as far as it has them), XP, the relic, the
 * scar, trait tokens. Notes on the force that it did. Returns a line saying what happened, or undefined when there's
 * nothing to do.
 */
export function payJournal(j: CrossroadsJournal, f: Force, date: string, newId: () => string): string | undefined {
  const o = j.picked != null ? j.options?.[j.picked] : undefined;
  const r = rewardById(o?.rewardId);
  if (!o || !r || !f.nexus || j.forceId !== f.id || f.nexus.journalsPaid?.includes(j.id) || !touchesForce(r)) return undefined;
  const u = f.units.find((x) => x.id === j.unitId && x.status !== 'removed');
  const label = `Crossroads Journal: ${o.title}`;
  const bits: string[] = [];
  for (const e of r.effects) {
    if (e.kind === 'shards') {
      const n = e.n > 0 ? e.n : -Math.min(-e.n, Math.max(0, f.umbraShards));
      if (!n) continue;
      f.umbraShards += n;
      f.ledger.push({ id: newId(), date, label, rp: 0, supply: 0, us: n });
      bits.push(`${n > 0 ? '+' : '−'}${Math.abs(n)} Umbra Shards`);
    } else if (e.kind === 'traitToken') {
      f.nexus.traitTokens += e.n;
      bits.push(`+${e.n} trait token`);
    } else if (!u) {
      continue;
    } else if (e.kind === 'xp') {
      u.xp += e.n;
      bits.push(`${u.name} +${e.n} XP`);
    } else if (e.kind === 'relic' && o.relic) {
      u.relics.push({ ...o.relic });
      bits.push(`${o.relic.name} to ${u.name}`);
    } else if (e.kind === 'scar' && o.scar) {
      const res = applyScar(u, o.scar);
      bits.push(res === 'removed' ? `${u.name} is lost for good` : `${u.name} scarred: ${o.scar.name}`);
    }
  }
  (f.nexus.journalsPaid ??= []).push(j.id);
  return `${label}${bits.length ? ` — ${bits.join(', ')}` : ''}.`;
}

/** The marks journals left on the faction that hold in a round: on its Warlord, its detachment's order, or a sector. */
export const activeMarks = (c: Campaign, factionId: string, round: number): JournalMark[] =>
  (c.factions.find((x) => x.id === factionId)?.marks ?? []).filter((m) => m.from <= round && (m.until == null || m.until >= round));

/** Strike a mark off (spent in a battle, or the GM says so). */
export function dropMark(c: Campaign, factionId: string, markId: string): boolean {
  const f = c.factions.find((x) => x.id === factionId);
  if (!f?.marks?.some((m) => m.id === markId)) return false;
  f.marks = f.marks.filter((m) => m.id !== markId);
  return true;
}
