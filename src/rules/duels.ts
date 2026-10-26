import { grantRelic, grantText } from './relicVault';
import type { Campaign, DuelSide, DuelWager, Force, NexusDuel, Unit } from '../model/types';
import { currentRound } from './nexus';
import { NEXUS_DUELS } from './nexusData';
import { depositBanked, withdrawBanked } from './production';

// Nexus Duels: two players agree to fight with their own armies, away from the map, for a wager. Either player can
// change either wager while the duel is open; any change clears both agreements, and the result can only be recorded
// once both sides agree. The loser's faction stakes (Materials, Research, Blueprints, Building Expansions, Archive
// unlocks) move as soon as the result is recorded. Umbra Shards and relics live on forces, which only their owner can
// change, so each player's app pays or collects its own force's part (`payDuel`), as with round income. The force
// remembers it did (`nexus.duelsPaid`), so a stale copy of the campaign can't make it pay twice.

export type DuelRole = 'challenger' | 'challenged';

/** The faction stakes, in the order they're shown. */
export const FACTION_STAKES = [
  { key: 'research', name: 'Research' },
  { key: 'blueprints', name: 'Blueprints' },
  { key: 'cores', name: 'Building Expansions' },
  { key: 'archives', name: 'Archive unlocks' },
] as const;

export const roleOf = (d: NexusDuel, factionId: string | undefined): DuelRole | undefined =>
  !factionId ? undefined : d.challenger.factionId === factionId ? 'challenger' : d.challenged.factionId === factionId ? 'challenged' : undefined;
export const otherRole = (r: DuelRole): DuelRole => (r === 'challenger' ? 'challenged' : 'challenger');

/** Both sides agree to the wagers: the battle can be fought and its result recorded. */
export const duelReady = (d: NexusDuel) => d.status === 'open' && !!d.challenger.agreed && !!d.challenged.agreed;

/** The side that lost a settled duel (none for a draw or an open duel). */
export function loserOf(d: NexusDuel): DuelSide | undefined {
  if (d.status !== 'settled' || !d.winner) return undefined;
  return d.winner === d.challenger.factionId ? d.challenged : d.challenger;
}

/** Nothing staked at all. */
export const emptyWager = (w: DuelWager) =>
  !w.shards && !w.materials && !w.research && !w.blueprints && !w.cores && !w.archives && !w.relics?.length && !w.note?.trim();

/** The wager with zeros and blanks left out. */
export function cleanWager(w: DuelWager): DuelWager {
  const out: DuelWager = {};
  for (const k of ['shards', 'materials', 'research', 'blueprints', 'cores', 'archives'] as const) {
    const n = Math.max(0, Math.floor(w[k] ?? 0));
    if (n) out[k] = n;
  }
  if (w.relics?.length) out.relics = w.relics.map((r) => ({ ...r }));
  if (w.note?.trim()) out.note = w.note.trim();
  return out;
}

/** The wager in a few words: "3 US, 40 Materials, Blade of Ages". */
export function wagerText(w: DuelWager): string {
  const parts: string[] = [];
  if (w.shards) parts.push(`${w.shards} US`);
  if (w.materials) parts.push(`${w.materials} Materials`);
  for (const s of FACTION_STAKES) if (w[s.key]) parts.push(`${w[s.key]} ${s.name}`);
  for (const r of w.relics ?? []) parts.push(r.name);
  if (w.note?.trim()) parts.push(`“${w.note.trim()}”`);
  return parts.join(', ') || 'nothing';
}

/** Ask another faction for a duel. Both wagers start empty; neither side has agreed yet. The challenged force can be left
 * blank ('') for its player to pick. */
export function newDuel(c: Campaign, from: Pick<DuelSide, 'factionId' | 'forceId'>, to: Pick<DuelSide, 'factionId' | 'forceId'>, id: string, date: string): NexusDuel {
  const d: NexusDuel = {
    id, date, round: currentRound(c), status: 'open',
    challenger: { ...from, wager: {} },
    challenged: { ...to, wager: {} },
  };
  (c.duels ??= []).push(d);
  return d;
}

/**
 * Change the wagers (and which forces fight). Clears both agreements; the side making the change (`by`, a faction
 * id) agrees to what it proposed. A new force drops the relics staked from the old one.
 */
export function setWagers(d: NexusDuel, next: Record<DuelRole, Pick<DuelSide, 'forceId' | 'wager'>>, by?: string): boolean {
  if (d.status !== 'open') return false;
  for (const role of ['challenger', 'challenged'] as const) {
    const side = d[role];
    const wager = cleanWager(next[role].wager);
    if (next[role].forceId !== side.forceId) delete wager.relics;
    side.forceId = next[role].forceId;
    side.wager = wager;
    side.agreed = roleOf(d, by) === role && !!side.forceId;
  }
  return true;
}

/** A side agrees (or takes back its agreement) to the wagers as they stand. It must have picked its force first. */
export function agreeDuel(d: NexusDuel, factionId: string, agreed = true): boolean {
  const role = roleOf(d, factionId);
  if (d.status !== 'open' || !role || (agreed && !d[role].forceId)) return false;
  d[role].agreed = agreed;
  return true;
}

/** Call off an open duel (declined or cancelled): it's simply removed. */
export function cancelDuel(c: Campaign, id: string) {
  c.duels = (c.duels ?? []).filter((d) => d.id !== id || d.status !== 'open');
  if (!c.duels.length) delete c.duels;
}

/** Materials the faction has banked, over all its sectors. */
export const banked = (c: Campaign, factionId: string) => c.sectors.reduce((n, s) => n + (s.owner === factionId ? s.bank ?? 0 : 0), 0);

/** What the side couldn't pay right now if it lost (it pays what it has). */
export function wagerIssues(c: Campaign, forces: Force[], side: DuelSide): string[] {
  const w = side.wager;
  const out: string[] = [];
  const f = forces.find((x) => x.id === side.forceId);
  const fa = c.factions.find((x) => x.id === side.factionId);
  if (!side.forceId) out.push('No force picked yet.');
  else if (!f) out.push('Its force is missing.');
  if (f && (w.shards ?? 0) > f.umbraShards) out.push(`${f.name} has only ${f.umbraShards} Umbra Shards.`);
  if ((w.materials ?? 0) > banked(c, side.factionId)) out.push(`Only ${banked(c, side.factionId)} Materials are banked.`);
  for (const s of FACTION_STAKES) if ((w[s.key] ?? 0) > (fa?.[s.key] ?? 0)) out.push(`Only ${fa?.[s.key] ?? 0} ${s.name} to give.`);
  for (const r of w.relics ?? []) if (f && !f.units.some((u) => u.relics.some((x) => x.id === r.id))) out.push(`${r.name} is no longer carried by ${f.name}.`);
  return out;
}

/** Move the loser's faction stakes to the winner, as far as the loser has them. Materials go to the winner's banks with room, home first. */
function moveFactionStakes(c: Campaign, from: string, to: string, w: DuelWager) {
  const F = c.factions.find((x) => x.id === from);
  const T = c.factions.find((x) => x.id === to);
  if (!F || !T) return;
  for (const { key } of FACTION_STAKES) {
    const n = Math.min(w[key] ?? 0, F[key] ?? 0);
    if (!n) continue;
    F[key] = (F[key] ?? 0) - n;
    if (!F[key]) delete F[key];
    T[key] = (T[key] ?? 0) + n;
  }
  depositBanked(c, to, withdrawBanked(c, from, w.materials ?? 0));
}

/** Record the result of an agreed duel: the winning faction, or '' for a draw. The loser's faction stakes move now. */
export function settleDuel(c: Campaign, id: string, winner: string, date: string): boolean {
  const d = c.duels?.find((x) => x.id === id);
  if (!d || !duelReady(d) || (winner && !roleOf(d, winner))) return false;
  d.status = 'settled';
  d.winner = winner;
  d.settledOn = date;
  const loser = loserOf(d);
  if (loser) moveFactionStakes(c, loser.factionId, winner, loser.wager);
  // Keep the newest settled duels. One whose forces may still have shards or relics to pay or collect is kept longer.
  const settled = c.duels!.filter((x) => x.status === 'settled');
  const owed = (x: NexusDuel) => { const l = loserOf(x); return !!l && forceStake(l.wager); };
  const newest = new Set(settled.slice(-NEXUS_DUELS.keep));
  const owedKept = new Set(settled.filter(owed).slice(-NEXUS_DUELS.keepOwed));
  const drop = new Set(settled.filter((x) => !newest.has(x) && !owedKept.has(x)).map((x) => x.id));
  c.duels = c.duels!.filter((x) => !drop.has(x.id));
  return true;
}

/** The loser's Umbra Shards and relics: what the two forces still have to pay or collect. */
const forceStake = (w: DuelWager) => !!w.shards || !!w.relics?.length;

/** Settled duels where this force still has its part to pay or collect. */
export function duelsOwed(c: Campaign, f: Force): NexusDuel[] {
  return (c.duels ?? []).filter((d) => {
    const loser = loserOf(d);
    return !!loser && forceStake(loser.wager) && (d.challenger.forceId === f.id || d.challenged.forceId === f.id) && !!f.nexus && !f.nexus.duelsPaid?.includes(d.id);
  });
}

/** Units that can carry a won relic: Heroes and units with Heroic Rise, or any active unit if the force has none. */
export function relicCarriers(f: Force): Unit[] {
  const active = f.units.filter((u) => u.status !== 'removed');
  const heroes = active.filter((u) => u.category === 'Hero' || u.heroicRise);
  return heroes.length ? heroes : active;
}

/**
 * Pay (the loser's force) or collect (the winner's) the Umbra Shards and relics of a settled duel, and note on the
 * force that it did. The loser pays what it still has; won relics go to `unitId` (or the first unit that can carry them).
 * Returns a line saying what happened, or undefined when there's nothing to do.
 */
export function payDuel(d: NexusDuel, f: Force, date: string, newId: () => string, unitId?: string): string | undefined {
  const loser = loserOf(d);
  if (!loser || !f.nexus || f.nexus.duelsPaid?.includes(d.id) || (d.challenger.forceId !== f.id && d.challenged.forceId !== f.id)) return undefined;
  const w = loser.wager;
  const won = loser.forceId !== f.id;
  const label = `Nexus Duel ${won ? 'won' : 'lost'}`;
  let line: string;
  if (won) {
    const unit = f.units.find((u) => u.id === unitId) ?? relicCarriers(f)[0];
    if (w.relics?.length && !unit) return undefined;
    f.umbraShards += w.shards ?? 0;
    const relics = (w.relics ?? []).map((r) => {
      const relic = { id: newId(), name: r.name, tier: r.tier, profile: r.profile, note: r.note };
      return grantText(relic, unit, grantRelic(f, unit, relic));
    }).join(', ');
    line = `${label}: ${[w.shards ? `+${w.shards} Umbra Shards` : '', relics].filter(Boolean).join(', ')}.`;
    if (w.shards) f.ledger.push({ id: newId(), date, label, rp: 0, supply: 0, us: w.shards });
  } else {
    const n = Math.min(w.shards ?? 0, Math.max(0, f.umbraShards));
    f.umbraShards -= n;
    const ids = new Set((w.relics ?? []).map((r) => r.id));
    for (const u of f.units) u.relics = u.relics.filter((r) => !ids.has(r.id));
    if (f.relicVault) f.relicVault = f.relicVault.filter((r) => !ids.has(r.id)); // stowed since it was staked
    line = `${label}: ${[n ? `−${n} Umbra Shards` : '', ...(w.relics ?? []).map((r) => `${r.name} handed over`)].filter(Boolean).join(', ')}.`;
    if (n) f.ledger.push({ id: newId(), date, label, rp: 0, supply: 0, us: -n });
  }
  (f.nexus.duelsPaid ??= []).push(d.id);
  return line;
}
