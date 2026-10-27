import type { Campaign, Force } from '../../model/types';
import { aiDefended } from '../difficulty';
import type { Attack } from '../orders';
import { defenderForce } from '../overrun';
import { teamsOf, type TrackedBattle } from '../tracker';
import { zoneBlock } from './setup';

// Which battles may be fought as zone battles (Command or Quick) instead of at the table. Overruns, garrisons,
// guardians, meetings and Marauders may; the Voidspawn, the Echo Lord, home challenges and every game between players
// are for the table.

/** Why this battle is for the table, if it is. */
export function tableOnly(b: TrackedBattle, c?: Campaign): string | undefined {
  if (b.crisis) return 'The Echo Lord is fought at the table';
  const s = c?.sectors.find((x) => x.id === b.sectorId);
  if (s?.type === 'voidspawn') return 'The Voidspawn is fought at the table';
  if (s?.type === 'home' && b.attacker) return 'Home-sector challenges are fought at the table';
  // A player on each side.
  const people = teamsOf(b).filter((t) => b.sides.some((x) => x.team === t && !x.ai && x.units.length > 0));
  if (people.length > 1) return 'Battles between players are fought at the table';
  return undefined;
}

/** Why this battle can't be fought as a zone battle right now, if it can't. */
export const zoneBattleBlock = (b: TrackedBattle, c?: Campaign) => tableOnly(b, c) ?? zoneBlock(b);

/** Why a declared attack is for the table, if it is: the same tests as `tableOnly`, before the battle is set up. */
export function attackTableOnly(c: Campaign, a: Attack, forces: Force[]): string | undefined {
  const s = c.sectors.find((x) => x.id === a.sectorId);
  if (!s) return 'The sector is gone';
  if (s.type === 'voidspawn') return 'The Voidspawn is fought at the table';
  if (s.type === 'home') return 'Home-sector challenges are fought at the table';
  if (!aiDefended(s) && defenderForce(c, a, forces)) return 'Battles between players are fought at the table';
  return undefined;
}
