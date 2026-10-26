import type { Bounty, BountyKind, BountyReward, Campaign, CampaignEvent, Force, Sector } from '../model/types';
import type { RelicTier } from './data';
import { relicCarriers } from './duels';
import { rng, type Rand } from './hexmap';
import { effectValue, type JournalEffect } from './journalData';
import { isHero } from './lists';
import { marauderTier } from './marauders';
import { currentRound, factionName } from './nexus';
import { BOUNTY, BOUNTY_KINDS, STRONGHOLDS } from './nexusData';
import { depositNearest, depositText, rewardOrigin } from './production';
import { randomRelic } from './relicPick';
import { grantRelic, grantText } from './relicVault';
import type { FinishedBattle } from './tracker';
import { resultFor } from './tracker';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];
const pick = <T,>(rand: Rand, xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const isFaction = (c: Campaign, id: string | undefined) => !!id && c.factions.some((f) => f.id === id);
export const kindById = (id: BountyKind) => BOUNTY_KINDS.find((k) => k.id === id)!;

/** What a reward is worth, in Umbra Shards. */
export const rewardWorth = (r: BountyReward) => effectValue(r as JournalEffect);

/** Rewards worth about the difficulty's budget: one or two kinds, each in whole steps. */
export function rollRewards(difficulty: number, rand: Rand): BountyReward[] {
  const budget = BOUNTY.budget[Math.max(1, Math.min(3, difficulty))];
  const count = difficulty <= 1 ? 1 : 1 + Math.floor(rand() * BOUNTY.maxRewards);
  const out: BountyReward[] = [];
  let left = budget;
  for (let i = 0; i < count && left > 0; i++) {
    const part = i === count - 1 ? left : left * (0.4 + rand() * 0.2);
    const kinds = BOUNTY.rewards.filter((k) => !out.some((r) => r.kind === k.kind) && worth(k.kind, k.step) <= part + 0.5);
    if (!kinds.length) break;
    const k = pick(rand, [...kinds]);
    let r: BountyReward;
    if (k.kind === 'relic') {
      const tier = [...TIERS].reverse().find((t) => worth('relic', 1, t) <= part + 0.5) ?? 'Common';
      r = { kind: 'relic', tier };
    } else {
      r = { kind: k.kind, n: Math.max(1, Math.round(part / worth(k.kind, k.step))) * k.step };
    }
    out.push(r);
    left -= rewardWorth(r);
  }
  return out;
}

const worth = (kind: BountyReward['kind'], n: number, tier: RelicTier = 'Common') =>
  rewardWorth(kind === 'relic' ? { kind, tier } : { kind, n });

const REWARD_NAMES: Record<BountyReward['kind'], [string, string]> = {
  materials: ['Materials', 'Materials'], research: ['Research', 'Research'], blueprints: ['Blueprint', 'Blueprints'],
  cores: ['Building Expansion', 'Building Expansions'], archives: ['Archive unlock', 'Archive unlocks'],
  shards: ['Umbra Shard', 'Umbra Shards'], traitToken: ['trait token', 'trait tokens'], relic: ['relic', 'relics'],
};

export const rewardText = (r: BountyReward) =>
  r.kind === 'relic' ? `a ${r.tier} relic` : `${r.n} ${REWARD_NAMES[r.kind][r.n === 1 ? 0 : 1]}`;

/** Paid to a force rather than the faction. */
export const forceReward = (r: BountyReward) => r.kind === 'shards' || r.kind === 'relic' || r.kind === 'traitToken';

/** A choice of target for a kind: what it sets on the bounty, and how hard it is. */
export interface BountyTarget {
  key: string;
  label: string;
  difficulty: number;
  set: Partial<Pick<Bounty, 'sectorId' | 'bandId' | 'bandName' | 'factionId'>>;
}

const sectorCount = (c: Campaign, id: string) => c.sectors.filter((s) => s.owner === id).length;
const tierLevel = (t: RelicTier) => TIERS.indexOf(t) + 1;
const contestable = (s: Sector) => !STRONGHOLDS.includes(s.type);

/** The targets a kind of bounty can have now (none: it can't be dealt). */
export function targets(c: Campaign, kind: BountyKind): BountyTarget[] {
  const sector = (s: Sector, difficulty: number): BountyTarget => ({ key: s.id, label: s.name, difficulty, set: { sectorId: s.id } });
  switch (kind) {
    case 'band':
      return (c.marauders ?? []).map((m) => ({
        key: m.id, label: m.name, difficulty: tierLevel(marauderTier(m)), set: { bandId: m.id, bandName: m.name },
      }));
    case 'hold':
      return c.sectors.filter((s) => contestable(s) && !isFaction(c, s.owner)).map((s) => sector(s, 2));
    case 'take':
      return c.sectors.filter((s) => contestable(s) && !!s.owner).map((s) => sector(s, isFaction(c, s.owner) ? 2 : 1));
    case 'guardian':
      return c.sectors.filter((s) => s.guardian).map((s) => ({ ...sector(s, tierLevel(s.guardian!.tier)), label: `${s.guardian!.name} (${s.name})` }));
    case 'void':
      return c.sectors.filter((s) => s.type === 'voidspawn').map((s) => sector(s, 3));
    case 'topple': {
      if (c.factions.length < 2) return [];
      const top = Math.max(...c.factions.map((f) => sectorCount(c, f.id)));
      return c.factions
        .map((f) => ({ key: f.id, label: f.name, difficulty: sectorCount(c, f.id) === top ? 3 : 2, set: { factionId: f.id } }))
        .sort((a, b) => b.difficulty - a.difficulty);
    }
    case 'noHero':
      return [{ key: '', label: 'Any game', difficulty: 2, set: {} }];
  }
}

const targetKey = (b: Bounty) => b.bandId ?? b.sectorId ?? b.factionId ?? '';

/** Is the bounty's target still there? */
export const targetLive = (c: Campaign, b: Bounty) => b.kind === 'noHero' || targets(c, b.kind).some((t) => t.key === targetKey(b));

/**
 * Deal a bounty: a kind not on the board yet (any kind once they all are), a target not already on it, and rewards for
 * its difficulty. `kind` asks for one kind. Undefined when nothing can be dealt.
 */
export function dealBounty(c: Campaign, rand: Rand, id: string, kind?: BountyKind, board: Bounty[] = c.bounties ?? []): Bounty | undefined {
  const open = board.filter((b) => !b.claimed);
  const taken = new Set(open.map((b) => `${b.kind}:${targetKey(b)}`));
  const options = (k: BountyKind) => targets(c, k).filter((t) => k === 'noHero' ? !taken.has('noHero:') : !taken.has(`${k}:${t.key}`));
  const kinds = kind ? [kind] : BOUNTY_KINDS.map((k) => k.id).filter((k) => options(k).length);
  const fresh = kinds.filter((k) => !open.some((b) => b.kind === k));
  const k = kind ?? (fresh.length ? pick(rand, fresh) : kinds.length ? pick(rand, kinds) : undefined);
  if (!k) return undefined;
  const t = options(k).length ? pick(rand, options(k)) : kind ? targets(c, k)[0] : undefined;
  if (!t) return undefined;
  const difficulty = kindById(k).difficulty ?? (k === 'hold' ? 1 + Math.floor(rand() * 3) : t.difficulty);
  const round = currentRound(c);
  const b: Bounty = {
    id, kind: k, difficulty, ...t.set, rewards: rollRewards(difficulty, rand), round,
    skip: c.log.filter((e) => (e.round ?? 0) >= round).map((e) => e.id),
  };
  if (k === 'hold') b.rounds = BOUNTY.holdRounds[difficulty];
  return b;
}

/** Fill the board up to BOUNTY.slots. Returns the bounties posted. */
export function fillBoard(c: Campaign, rand: Rand, newId: () => string): Bounty[] {
  const board = c.bounties ?? [];
  const posted: Bounty[] = [];
  while (board.length < BOUNTY.slots) {
    const b = dealBounty(c, rand, newId(), undefined, board);
    if (!b) break;
    board.push(b);
    posted.push(b);
  }
  c.bounties = board;
  return posted;
}

/** Deal a new bounty into a slot (of `kind`, when asked). False when there's nothing to deal. */
export function regenerate(c: Campaign, index: number, rand: Rand, newId: () => string, kind?: BountyKind): boolean {
  const board = c.bounties ?? [];
  if (!board[index]) return false;
  const b = dealBounty(c, rand, newId(), kind, board.filter((_, i) => i !== index));
  if (!b) return false;
  shelve(c, [board[index]]);
  board[index] = b;
  return true;
}

/** Point a bounty at another target. */
export function retarget(c: Campaign, index: number, key: string) {
  const b = c.bounties?.[index];
  const t = b && targets(c, b.kind).find((x) => x.key === key);
  if (!b || !t || b.claimed) return;
  delete b.sectorId; delete b.bandId; delete b.bandName; delete b.factionId; delete b.holder;
  Object.assign(b, t.set);
}

/** A new difficulty: the rewards (and how long a hold takes) are rolled again for it. */
export function setDifficulty(c: Campaign, index: number, difficulty: number, rand: Rand) {
  const b = c.bounties?.[index];
  if (!b || b.claimed) return;
  b.difficulty = difficulty;
  b.rewards = rollRewards(difficulty, rand);
  if (b.kind === 'hold') b.rounds = BOUNTY.holdRounds[difficulty];
}

/** What the bounty asks, in words. */
export function bountyText(c: Campaign, b: Bounty): string {
  const s = c.sectors.find((x) => x.id === b.sectorId);
  const n = b.rounds ?? 1;
  return kindById(b.kind).desc
    .replace('{band}', b.bandName ?? 'the band')
    .replace('{sector}', s?.name ?? 'a lost sector')
    .replace('{guardian}', s?.guardian?.name ?? 'its guardian')
    .replace('{faction}', b.factionId ? factionName(c, b.factionId) : 'the leader')
    .replace('{rounds}', `${n} round end${n === 1 ? '' : 's'}`);
}

/** The side of a tracked battle that won it for the faction with no Hero in its army, if any. */
function heroless(e: CampaignEvent, history: FinishedBattle[], forces: Force[]): string | undefined {
  const battle = e.battleId ? history.find((x) => x.id === e.battleId) : undefined;
  if (!battle) return undefined;
  for (const side of battle.sides) {
    const f = forces.find((x) => x.id === side.forceId);
    if (!f || f.nexus?.factionId !== e.winner || resultFor(battle, side.id) !== 'win' || !side.units.length) continue;
    const pool = side.roster ?? f.units;
    if (!side.units.some((u) => { const unit = pool.find((x) => x.id === u.unitId); return !!unit && isHero(unit); })) return f.id;
  }
  return undefined;
}

/** The game that claims a bounty, and the force that won it (if known). */
export function bountyHit(c: Campaign, b: Bounty, history: FinishedBattle[] = [], forces: Force[] = []): { event: CampaignEvent; forceId?: string } | undefined {
  if (b.claimed || b.kind === 'hold') return undefined;
  for (const e of c.log) {
    if (e.spread || (e.round ?? 0) < b.round || b.skip?.includes(e.id) || !isFaction(c, e.winner)) continue;
    const won = e.winner === e.attacker && !e.marauder && !e.skirmish && !e.crisis && e.sectorId === b.sectorId;
    let forceId: string | undefined = e.forceId;
    switch (b.kind) {
      case 'band': if (e.marauder?.id !== b.bandId) continue; break;
      case 'take': case 'void': if (!won) continue; break;
      case 'guardian': if (!won || !e.undo?.guardian) continue; break;
      case 'topple': if (e.winner === b.factionId || (e.attacker !== b.factionId && e.defender !== b.factionId)) continue; break;
      case 'noHero': if (!(forceId = heroless(e, history, forces))) continue; break;
    }
    return { event: e, forceId };
  }
  return undefined;
}

/** Mark a bounty claimed by a faction and pay the faction's share now; a force's share waits for its owner (payBounty). */
export function claimBounty(c: Campaign, b: Bounty, factionId: string, forces: Force[], date: string, forceId?: string, eventId?: string): string {
  const f = c.factions.find((x) => x.id === factionId)!;
  // A force's share goes to the force that won it, or else the faction's first force.
  const force = forces.find((x) => x.id === forceId && x.nexus?.factionId === factionId) ?? forces.find((x) => x.nexus?.factionId === factionId);
  b.claimed = { factionId, round: currentRound(c), date, ...(force ? { forceId: force.id } : {}), ...(eventId ? { eventId } : {}) };
  delete b.holder;
  const bits: string[] = [];
  for (const r of b.rewards) {
    if (r.kind === 'materials') {
      const at = c.log.find((e) => e.id === eventId)?.sectorId;
      bits.push(depositText(r.n, depositNearest(c, factionId, r.n, rewardOrigin(c, force, at))));
    } else if (r.kind === 'research' || r.kind === 'blueprints' || r.kind === 'cores' || r.kind === 'archives') {
      f[r.kind] = (f[r.kind] ?? 0) + r.n;
      bits.push(`+${rewardText(r)}`);
    } else if (force) {
      bits.push(`${rewardText(r)} for ${force.name}`);
    }
  }
  return `${f.name} claimed the bounty “${bountyText(c, b)}”${bits.length ? `: ${bits.join(', ')}` : ''}.`;
}

/** Claim every bounty a logged game has earned. Returns a line for each. */
export function claimBounties(c: Campaign, history: FinishedBattle[], forces: Force[], date: string): string[] {
  const out: string[] = [];
  for (const b of c.bounties ?? []) {
    const hit = bountyHit(c, b, history, forces);
    if (hit) out.push(claimBounty(c, b, hit.event.winner, forces, date, hit.forceId, hit.event.id));
  }
  return out;
}

/** A round ends: whoever holds a hold bounty's sector holds it one round end longer (or starts over), and claims it when it's done. */
export function holdBounties(c: Campaign, holdings: Record<string, string[]>, round: number, forces: Force[], date: string): string[] {
  const out: string[] = [];
  for (const b of c.bounties ?? []) {
    if (b.kind !== 'hold' || b.claimed || b.round > round || !b.sectorId) continue;
    const owner = Object.keys(holdings).find((id) => holdings[id].includes(b.sectorId!));
    if (!owner) { delete b.holder; continue; }
    b.holder = { factionId: owner, ends: b.holder?.factionId === owner ? b.holder.ends + 1 : 1 };
    if (b.holder.ends >= (b.rounds ?? 1)) out.push(claimBounty(c, b, owner, forces, date));
  }
  return out;
}

/** The round is over: claimed bounties (and ones whose target is gone) make way for new ones. Returns those posted. */
export function refreshBounties(c: Campaign, rand: Rand, newId: () => string): Bounty[] {
  if (!c.bounties) return [];
  shelve(c, c.bounties.filter((b) => b.claimed));
  c.bounties = c.bounties.filter((b) => !b.claimed && targetLive(c, b));
  return fillBoard(c, rand, newId);
}

/** Claimed bounties leaving the board are kept, so their forces are still paid. */
function shelve(c: Campaign, gone: Bounty[]) {
  const claimed = gone.filter((b) => b.claimed);
  if (claimed.length) c.claimedBounties = [...(c.claimedBounties ?? []), ...claimed].slice(-BOUNTY.keepClaimed);
}

/** Claimed bounties whose force share this force hasn't taken yet. */
export const bountiesOwed = (c: Campaign, f: Force): Bounty[] =>
  [...(c.bounties ?? []), ...(c.claimedBounties ?? [])].filter((b) => b.claimed?.forceId === f.id && !!f.nexus && !f.nexus.bountiesPaid?.includes(b.id) && b.rewards.some(forceReward));

/** Give the force its share of a claimed bounty: Umbra Shards, the relic (to a Hero, if it has one), trait tokens. */
export function payBounty(c: Campaign, b: Bounty, f: Force, date: string, newId: () => string): string | undefined {
  if (!f.nexus || b.claimed?.forceId !== f.id || f.nexus.bountiesPaid?.includes(b.id)) return undefined;
  const label = `Bounty: ${bountyText(c, b)}`;
  const bits: string[] = [];
  // Seeded, so the same relic comes up however often this runs.
  const rand = rng(`bounty:${b.id}`);
  for (const r of b.rewards) {
    if (r.kind === 'shards') {
      f.umbraShards += r.n;
      f.ledger.push({ id: newId(), date, label, rp: 0, supply: 0, us: r.n });
      bits.push(`+${r.n} Umbra Shards`);
    } else if (r.kind === 'traitToken') {
      f.nexus.traitTokens += r.n;
      bits.push(`+${rewardText(r)}`);
    } else if (r.kind === 'relic') {
      const taken = new Set([...f.units.flatMap((u) => u.relics), ...(f.relicVault ?? [])].map((x) => x.name));
      const u = [...relicCarriers(f)].sort((a, b) => a.relics.length - b.relics.length)[0];
      const relic = u && randomRelic(u, r.tier, taken, rand, newId());
      if (u && relic) bits.push(grantText(relic, u, grantRelic(f, u, relic)));
    }
  }
  (f.nexus.bountiesPaid ??= []).push(b.id);
  return `${label}${bits.length ? ` — ${bits.join(', ')}` : ''}.`;
}
