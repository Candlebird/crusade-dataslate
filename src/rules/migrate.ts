import type { Force, Unit } from '../model/types';
import { RELICS, SCAR_TABLE } from './data';

/** Bump when saved names need migrating again. Forces without a version predate the 2026 rules update. */
export const RULES_VERSION = 3;

/** Homebrew names that now match an official OPR rule (or were reworded). */
const UNIT_RENAMES: Record<string, string> = {
  Protected: 'Fortified',
  'Self-Repair': 'Protected',
  'Scout 9"': 'Scout',
  Fly: 'Flying',
  'Evasive Maneuvers': 'Evasive',
  'Quick-Shot': 'Quick Shot',
  'Ignore Cover': 'Ignores Cover',
  'Survey Vehicle': 'Precision Shooting Mark',
};

const WEAPON_RENAMES: Record<string, string> = {
  Lance: 'Thrust',
  'Lock-On': 'Unstoppable',
  Sniper: 'Takedown',
  Flux: 'Surge',
  Shock: 'Surge',
  Warp: 'Quake',
  Poison: 'Bane',
  Magma: 'Demolish',
  Radiation: 'Bane',
};

const RELIC_RENAMES: Record<string, string> = { 'Common Weapon (Artificer)': 'Common Weapon (Surge)' };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Renames whole words only (so Warp-infusion and Flying stay), all in one pass so renames don't chain. */
function renamer(map: Record<string, string>): (s: string) => string {
  const keys = Object.keys(map).sort((a, b) => b.length - a.length).map(escape);
  const re = new RegExp(`(?<![\\w-])(${keys.join('|')})(?![\\w-])`, 'g');
  return (s) => s.replace(re, (m) => map[m]);
}

const renameUnitTrait = renamer(UNIT_RENAMES);
const renameWeaponTrait = renamer(WEAPON_RENAMES);

function migrateUnit(u: Unit): Unit {
  return {
    ...u,
    // The old Hero "Takedown" was a one-off strike; core Takedown is a weapon rule, so it gets its own name.
    upgrades: u.upgrades.map((x) => ({ ...x, name: x.name === 'Takedown' ? 'Takedown Strike' : renameUnitTrait(x.name) })),
    weapons: u.weapons.map((w) => ({ ...w, traits: w.traits.map((t) => ({ ...t, name: renameWeaponTrait(t.name) })) })),
    relics: u.relics.map((r) => ({
      ...r,
      name: RELIC_RENAMES[r.name] ?? r.name,
      ...(r.profile ? { profile: renameWeaponTrait(r.profile) } : {}),
    })),
    scars: u.scars.map((x) => {
      const def = SCAR_TABLE.find((e) => e.name === x.name);
      return def?.desc ? { ...x, desc: def.desc } : x;
    }),
  };
}

/** Relics copy their profile and note when taken, so refresh them after a balance pass. */
function syncRelics(u: Unit): Unit {
  return {
    ...u,
    relics: u.relics.map((r) => {
      const def = RELICS.find((x) => x.name === r.name);
      return def ? { ...r, profile: def.profile ?? r.profile, note: def.note ?? r.note } : r;
    }),
  };
}

/** Bring a saved force's trait, relic and scar names up to the current rules. */
export function migrateForce(f: Force): Force {
  const version = f.rulesVersion ?? 1;
  if (version >= RULES_VERSION) return f;
  let units = f.units;
  if (version < 2) units = units.map(migrateUnit);
  if (version < 3) units = units.map(syncRelics);
  return { ...f, rulesVersion: RULES_VERSION, units };
}
