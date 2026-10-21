import type { Campaign, CampaignFaction, Force, Unit } from '../model/types';
import { hasRule, levelForXp } from './engine';
import { currentRound } from './nexus';
import { WARLORDS, type WarlordPathId, type WarlordPerkId } from './nexusData';

// Warlords (Nexus Wars): each faction names one Hero from its forces its Warlord and picks a Path for it, for good.
// The Path's three perks unlock at Warlord levels 1, 3 and 5 (WARLORDS.levels). The Warlord's level is kept on the
// faction, so campaign-only rules (sight, research, slots) can read it without the forces. Lose the Warlord (removed
// for good, or its force leaves the faction) and the perks go; a new Warlord can be named WARLORDS.replaceAfter rounds on.

export const pathById = (id: string | undefined) => WARLORDS.paths.find((p) => p.id === id);

const factionOf = (c: Campaign | undefined, factionId: string | undefined) =>
  factionId ? c?.factions.find((f) => f.id === factionId) : undefined;

/** The perks a faction's Warlord has unlocked, with the level each needs. */
export function perksOf(f: CampaignFaction | undefined): WarlordPerkId[] {
  const path = pathById(f?.path);
  if (!f?.warlord || !path) return [];
  return path.perks.filter((_, i) => f.warlord!.level >= WARLORDS.levels[i]).map((p) => p.id);
}

/** Does the faction's Warlord have this perk? */
export const hasPerk = (c: Campaign | undefined, factionId: string | undefined, perk: WarlordPerkId) =>
  perksOf(factionOf(c, factionId)).includes(perk);

/** Is this force the one its faction's Warlord leads, with the perk? */
export function leadsWith(c: Campaign | undefined, force: Force, perk: WarlordPerkId) {
  const f = factionOf(c, force.nexus?.factionId);
  return f?.warlord?.forceId === force.id && perksOf(f).includes(perk);
}

/** Heroes a faction can name as its Warlord: still in play, in one of its forces. */
export function warlordCandidates(c: Campaign, forces: Force[], factionId: string): { force: Force; unit: Unit }[] {
  if (!c.factions.some((f) => f.id === factionId)) return [];
  return forces
    .filter((f) => f.nexus?.factionId === factionId)
    .flatMap((force) => force.units.filter((u) => u.status !== 'removed' && hasRule(u.rules, 'Hero')).map((unit) => ({ force, unit })));
}

/** Why the faction can't name a Warlord now, if it can't. */
export function warlordBlock(c: Campaign, factionId: string): string | undefined {
  const f = factionOf(c, factionId);
  if (!f) return 'Unknown faction';
  if (f.warlord) return `${f.warlord.name} is already its Warlord`;
  const ready = (f.warlordLost ?? -Infinity) + WARLORDS.replaceAfter;
  if (currentRound(c) < ready) return `Its Warlord was lost this round: a new one can be named from round ${ready}`;
  return undefined;
}

/** Name a faction's Warlord (and, with its first, its Path). False when it can't. */
export function chooseWarlord(c: Campaign, factionId: string, force: Force, unit: Unit, path?: WarlordPathId): boolean {
  const f = factionOf(c, factionId);
  if (!f || warlordBlock(c, factionId) || force.nexus?.factionId !== factionId || !force.units.includes(unit)) return false;
  if (unit.status === 'removed' || !hasRule(unit.rules, 'Hero')) return false;
  if (!f.path) {
    if (!pathById(path)) return false;
    f.path = path;
  }
  f.warlord = { forceId: force.id, unitId: unit.id, name: unit.name, level: levelForXp(unit.xp), since: currentRound(c) };
  delete f.warlordLost;
  return true;
}

/** The Warlord steps down, or is gone some way the app can't see: its perks go, and the wait for a new one starts. */
export function loseWarlord(c: Campaign, factionId: string) {
  const f = factionOf(c, factionId);
  if (!f?.warlord) return;
  delete f.warlord;
  f.warlordLost = currentRound(c);
}

/**
 * Bring each Warlord up to date with its force: its level from its XP, and it's lost when the unit is removed for good
 * or its force left the faction. A force that isn't in `forces` is left alone (it may just not be loaded). Returns the
 * Warlords lost and those whose level changed; mutates `c` only when something did.
 */
export function syncWarlords(c: Campaign, forces: Force[]) {
  const lost: { factionId: string; name: string }[] = [];
  const levelled: { factionId: string; name: string; level: number }[] = [];
  for (const f of c.factions) {
    const w = f.warlord;
    const force = w && forces.find((x) => x.id === w.forceId);
    if (!w || !force) continue;
    const unit = force.units.find((u) => u.id === w.unitId);
    if (!unit || unit.status === 'removed' || force.nexus?.factionId !== f.id) {
      lost.push({ factionId: f.id, name: w.name });
      loseWarlord(c, f.id);
      continue;
    }
    const level = levelForXp(unit.xp);
    if (level !== w.level || unit.name !== w.name) {
      if (level !== w.level) levelled.push({ factionId: f.id, name: unit.name, level });
      f.warlord = { ...w, level, name: unit.name };
    }
  }
  return { lost, levelled };
}

/** Would syncing change anything? (So the page only writes the campaign when it must.) */
export function warlordsStale(c: Campaign, forces: Force[]) {
  const copy: Campaign = { ...c, factions: c.factions.map((f) => ({ ...f })) };
  const r = syncWarlords(copy, forces);
  return r.lost.length > 0 || copy.factions.some((f, i) => f.warlord?.name !== c.factions[i].warlord?.name || f.warlord?.level !== c.factions[i].warlord?.level);
}
