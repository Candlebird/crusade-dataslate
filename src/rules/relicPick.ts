import type { Relic, Unit } from '../model/types';
import type { RelicTier } from './data';
import { RELICS } from './data';
import { hasRule } from './engine';
import type { Rand } from './hexmap';

/** A random relic of the tier the unit can carry, skipping relics already taken (by name). */
export function randomRelic(u: Unit, tier: RelicTier, taken: Set<string>, rand: Rand, id: string): Relic | undefined {
  const caster = hasRule(u.rules, 'Caster');
  const pool = RELICS.filter((r) => r.tier === tier && !taken.has(r.name) && (caster || r.note !== 'Casters only'));
  if (!pool.length) return undefined;
  const r = pool[Math.floor(rand() * pool.length)];
  return { id, name: r.name, tier: r.tier, ...(r.profile ? { profile: r.profile } : {}), ...(r.note ? { note: r.note } : {}) };
}
