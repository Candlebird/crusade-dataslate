import type { Campaign, Force, Siege } from '../model/types';
import { currentRound } from './nexus';
import { foughtFor, type Attack } from './orders';
import { attackTableOnly } from './zone/eligible';

// Sieges: an attack that has to be played at the table (the Voidspawn, a home challenge, a battle between players) and
// isn't played in its round doesn't lapse straight away. Its detachment stays pinned outside the sector, attacking it
// again every round, until it's fought or SIEGE.rounds rounds have gone by. Any other attack is fought in its round
// (at the table or as a zone battle) or lapses.

export const SIEGE = {
  /** How many rounds a siege lasts: the round it opens and the next ones. */
  rounds: 3,
};

/** The sieges still standing this round. */
export const activeSieges = (c: Campaign): Siege[] => (c.sieges ?? []).filter((s) => s.until >= currentRound(c));

/** The siege this detachment is pinned to, if any. */
export const siegeOf = (c: Campaign, forceId: string | undefined) => (forceId ? activeSieges(c).find((s) => s.forceId === forceId) : undefined);

/**
 * Open a siege for each revealed attack that's for the table (and has a detachment), unless one stands already.
 * Returns the sieges opened. Safe to call again: it never opens the same siege twice.
 */
export function openSieges(c: Campaign, attacks: Attack[], forces: Force[]): Siege[] {
  const round = currentRound(c);
  const out: Siege[] = [];
  for (const a of attacks) {
    if (!a.forceId || siegeOf(c, a.forceId) || foughtFor(c, a, round) || !attackTableOnly(c, a, forces)) continue;
    const s: Siege = { forceId: a.forceId, factionId: a.factionId, sectorId: a.sectorId, since: round, until: round + SIEGE.rounds - 1 };
    c.sieges = [...(c.sieges ?? []), s];
    out.push(s);
  }
  return out;
}

/** The sieges that need opening for these attacks (what `openSieges` would do), without changing anything. */
export const siegesToOpen = (c: Campaign, attacks: Attack[], forces: Force[]) =>
  attacks.filter((a) => a.forceId && !siegeOf(c, a.forceId) && !foughtFor(c, a, currentRound(c)) && attackTableOnly(c, a, forces));

/**
 * As a round ends: a siege whose battle was fought this round ends, as does one whose sector its faction now holds or
 * whose detachment is gone; a siege past its last round lapses. Returns the sieges that lapsed unfought.
 */
export function endSieges(c: Campaign, forces?: Force[]): Siege[] {
  const round = currentRound(c);
  const lapsed: Siege[] = [];
  c.sieges = (c.sieges ?? []).filter((s) => {
    const sector = c.sectors.find((x) => x.id === s.sectorId);
    if (!sector || sector.owner === s.factionId) return false;
    if (forces && !forces.some((f) => f.id === s.forceId)) return false;
    if (foughtFor(c, s, round)) return false;
    if (s.until <= round) {
      lapsed.push(s);
      return false;
    }
    return true;
  });
  if (!c.sieges.length) delete c.sieges;
  return lapsed;
}

/** A standing siege as this round's attack, for a detachment that didn't declare anything else it may. */
export const siegeAttack = (c: Campaign, s: Siege, email: string): Attack => {
  const sector = c.sectors.find((x) => x.id === s.sectorId);
  const left = s.until - currentRound(c);
  return {
    email, factionId: s.factionId, forceId: s.forceId, sectorId: s.sectorId, defender: sector?.owner ?? '',
    flags: [`Siege since round ${s.since}: ${left > 0 ? `${left + 1} rounds left, this one too` : 'its last round'}`],
  };
};
