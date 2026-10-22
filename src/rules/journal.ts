import type { Campaign, CrossroadsJournal, Force, JournalOption, JournalRoll, Unit } from '../model/types';
import { MAX_SCARS, SCAR_TABLE } from './data';
import { applyScar, hasRule, ruleRating } from './engine';
import { visibleTo } from './fog';
import { hexDistance, isPlaced, type Hex, type Rand } from './hexmap';
import {
  JOURNAL, JOURNAL_CATALYSTS, JOURNAL_COMPLICATIONS, JOURNAL_CONTEXTS, JOURNAL_REWARDS, JOURNAL_SKILLS,
  type JournalReward, type JournalSkillId,
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

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const pick = <T>(xs: T[], rand: Rand): T => xs[Math.floor(rand() * xs.length)];

export type JournalCheck = 'approach' | 'choice' | 'climax';
export type JournalStatus = 'play' | 'offer' | 'done';

export const journalStatus = (j: CrossroadsJournal): JournalStatus => (j.picked != null ? 'done' : j.options ? 'offer' : 'play');

/** The faction's journal for a round (this one by default). */
export const journalOf = (c: Campaign, factionId: string, round = currentRound(c)) =>
  (c.journals ?? []).find((j) => j.factionId === factionId && j.round === round);

/** Why a journal can't be dealt to the faction now, if it can't. */
export function journalBlock(c: Campaign, factionId: string): string | undefined {
  const f = c.factions.find((x) => x.id === factionId);
  if (!f) return 'Unknown faction';
  if (!f.warlord) return 'It has no Warlord';
  if (journalOf(c, factionId)) return 'Its Warlord already has a journal this round';
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

/** Deal a journal to a faction's Warlord: a context to suit where its detachment stands, a catalyst it hasn't had lately. */
export function dealJournal(c: Campaign, factionId: string, forces: Force[], rand: Rand, id: string, date: string): CrossroadsJournal | undefined {
  const f = c.factions.find((x) => x.id === factionId);
  const w = f?.warlord;
  if (!w || journalBlock(c, factionId)) return undefined;
  const force = forces.find((x) => x.id === w.forceId);
  const type = (force && positionOf(c, force)?.type) ?? homeOf(c, factionId)?.type;
  const fits = JOURNAL_CONTEXTS.filter((x) => !x.types || (type && x.types.includes(type)));
  const round = currentRound(c);
  // Not one another faction drew this round, nor one of this faction's last few.
  const recent = new Set([
    ...(c.journals ?? []).filter((j) => j.round === round),
    ...(c.journals ?? []).filter((j) => j.factionId === factionId).slice(-4),
  ].map((j) => j.catalyst));
  const fresh = JOURNAL_CATALYSTS.filter((x) => !recent.has(x.id));
  const j: CrossroadsJournal = {
    id, factionId, round, date, forceId: w.forceId, unitId: w.unitId, warlord: w.name,
    context: pick(fits.length ? fits : JOURNAL_CONTEXTS, rand).id,
    catalyst: pick(fresh.length ? fresh : JOURNAL_CATALYSTS, rand).id,
    complication: pick(JOURNAL_COMPLICATIONS, rand).id,
  };
  (c.journals ??= []).push(j);
  return j;
}

/** GM: swap a piece of the scene, or set its framing note, until the first check is rolled. */
export function reframeJournal(j: CrossroadsJournal, next: Partial<Pick<CrossroadsJournal, 'context' | 'catalyst' | 'complication' | 'note'>>): boolean {
  if (j.approach) return false;
  if (next.context !== undefined && !contextById(next.context)) return false;
  if (next.catalyst !== undefined && !catalystById(next.catalyst)) return false;
  if (next.complication !== undefined && !complicationById(next.complication)) return false;
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

const rollOf = (j: CrossroadsJournal, which: JournalCheck) => (which === 'approach' ? j.approach?.roll : which === 'choice' ? j.choice?.roll : j.climax);

/** Can this check be re-rolled (once, before the endings are offered)? */
export function canReroll(j: CrossroadsJournal, which: JournalCheck): boolean {
  const r = rollOf(j, which);
  return !!r && r.rolls.length === 1 && !j.options;
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
export const checksDone = (j: CrossroadsJournal) => !!j.climax;

/** Checks passed (0–3). */
export const successes = (j: CrossroadsJournal) => [j.approach?.roll, j.choice?.roll, j.climax].filter((r) => r?.pass).length;

/** The best reward tier the journal can offer. */
export const tierCap = (j: CrossroadsJournal) => Math.max(JOURNAL.minTier, successes(j));

/** How many of the endings must give nothing or worse: two after a total failure, else one. */
export const minNothing = (j: CrossroadsJournal) => (successes(j) === 0 ? 2 : 1);

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
  return JOURNAL_REWARDS.filter((r) => r.tier <= cap && r.effects.every((e) => {
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
  return rs.filter((r) => r!.tier <= 0).length >= minNothing(j) && rs.some((r) => r!.tier === tierCap(j));
}

/** The tables' own pick of four rewards: the most fitting bad ones, the best fit at the cap, then the best of the rest. */
export function localOffer(j: CrossroadsJournal, u: Unit, forces: Force[], rand: Rand): string[] {
  const tags = new Set(journalTags(j));
  const tables = catalystById(j.catalyst)?.tables ?? [];
  const scored = eligibleRewards(j, u, forces)
    .map((r) => ({ r, score: r.tags.filter((t) => tags.has(t)).length + (tables.includes(r.table) ? 2 : 0) + rand() * 0.5 }))
    .sort((a, b) => b.score - a.score);
  const out: JournalReward[] = [];
  const take = (r: JournalReward | undefined) => r && !out.includes(r) && out.push(r);
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
    }
  }
  j.picked = index;
  j.pickedOn = date;
  // Keep the newest finished journals (and every one still in play).
  const done = c.journals!.filter((x) => x.picked != null);
  if (done.length > JOURNAL.keep) {
    const drop = new Set(done.slice(0, done.length - JOURNAL.keep));
    c.journals = c.journals!.filter((x) => !drop.has(x));
  }
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
      const n = e.n > 0 ? e.n : -Math.min(-e.n, f.umbraShards);
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
