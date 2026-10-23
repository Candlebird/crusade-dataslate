import type { Campaign, Force, Settings, Unit, Weapon } from '../model/types';
import {
  type Category,
  type RelicTier,
  LEVEL_THRESHOLDS,
  LOWERED_CONSTITUTION,
  MAX_NORMAL_TRAITS,
  MAX_SCARS,
  MAX_UNIQUE_TRAITS,
  MAX_WEAPON_TRAITS,
  POST_MAX_REPLACE_STEP,
  RELIC_SLOTS,
  RELIC_TIER_MIN_XP,
  REQUISITIONS,
  SUFFERING_BP_STEP,
} from './data';

export function levelForXp(xp: number): number {
  return LEVEL_THRESHOLDS.filter((t) => xp >= t).length;
}

export interface XpProgress {
  level: number;
  /** XP at the start of the current bracket. */
  floor: number;
  /** XP needed for the next level, or null at max level. */
  next: number | null;
  /** 0..1 progress through the current bracket. */
  pct: number;
  /** Upgrade replacements unlocked past the final threshold. */
  replacements: number;
}

export function xpProgress(xp: number): XpProgress {
  const level = levelForXp(xp);
  const floor = level === 0 ? 0 : LEVEL_THRESHOLDS[level - 1];
  const max = LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
  if (level >= LEVEL_THRESHOLDS.length) {
    const replacements = Math.floor((xp - max) / POST_MAX_REPLACE_STEP);
    const into = (xp - max) % POST_MAX_REPLACE_STEP;
    return { level, floor, next: null, pct: into / POST_MAX_REPLACE_STEP, replacements };
  }
  const next = LEVEL_THRESHOLDS[level];
  return { level, floor, next, pct: (xp - floor) / (next - floor), replacements: 0 };
}

export function relicSlots(xp: number): number {
  let slots = 0;
  for (const [min, s] of RELIC_SLOTS) if (xp >= min) slots = s;
  return slots;
}

/** RP a relic of this tier costs: the price of its "<tier> Relic" requisition. */
export function relicCost(tier: RelicTier): number {
  return REQUISITIONS.find((r) => r.name === `${tier} Relic`)?.cost ?? 0;
}

export function relicTierAllowed(tier: RelicTier, xp: number): boolean {
  return xp >= RELIC_TIER_MIN_XP[tier];
}

/** Can this unit carry relics: a Hero, or a unit with Heroic Rise. */
export const relicBearer = (u: Unit | undefined) => !!u && (u.category === 'Hero' || !!u.heroicRise);

export interface RelicHolder {
  forceId: string;
  unitId: string;
  unit: string;
  force: string;
  /** The force's Nexus Wars faction, else its army's faction ('' if neither). */
  faction: string;
}

/** Who carries each relic, by relic name. Only one copy of a relic can exist, so a held relic can't be taken again; a removed unit releases its relics. */
export function relicHolders(forces: Force[], campaign?: Campaign): Map<string, RelicHolder[]> {
  const held = new Map<string, RelicHolder[]>();
  for (const f of forces) {
    const nexus = f.nexus && campaign?.factions.find((x) => x.id === f.nexus!.factionId)?.name;
    const faction = nexus || f.faction || '';
    for (const u of f.units.filter((x) => x.status !== 'removed'))
      for (const r of u.relics) {
        const h = { forceId: f.id, unitId: u.id, unit: u.name || u.unitType || 'Unnamed unit', force: f.name, faction };
        held.set(r.name, [...(held.get(r.name) ?? []), h]);
      }
  }
  return held;
}

/** "Rhys — Alvaris (Iron Wolves)": the unit, its force, and the faction when that says something more. */
export function relicHolderText(h: RelicHolder): string {
  return `${h.unit} — ${h.force}${h.faction && h.faction !== h.force ? ` (${h.faction})` : ''}`;
}

/** Why a relic can't be taken, if someone already carries it. */
export function relicTaken(held: Map<string, RelicHolder[]>, name: string): string | undefined {
  const by = held.get(name);
  return by?.length ? `Held by ${by.map(relicHolderText).join(', ')}` : undefined;
}

/** Parse a rule label like "Tough(6)" -> 6. */
export function ruleRating(rules: string[], name: string): number | null {
  for (const r of rules) {
    const m = r.match(/^(.+?)\s*\((\d+)\)$/);
    if (m && m[1].trim().toLowerCase() === name.toLowerCase()) return Number(m[2]);
  }
  return null;
}

export function hasRule(rules: string[], name: string): boolean {
  const n = name.toLowerCase();
  return rules.some((r) => r.replace(/\s*\(.*\)$/, '').trim().toLowerCase() === n);
}

/** Auto-assign the upgrade category from a unit's profile (Upgrade Tables, "Starting a force"). */
export function detectCategory(u: { rules: string[]; size: number; tough?: number; name?: string }): Category {
  const tough = u.tough ?? ruleRating(u.rules, 'Tough') ?? 1;
  if (hasRule(u.rules, 'Hero')) return 'Hero';
  if (hasRule(u.rules, 'Aircraft')) return 'Aircraft';
  if (hasRule(u.rules, 'Immobile')) return 'Fortification';
  if (u.size > 1) return 'Infantry';
  // Elite (single model, Tough <= 9) and Vehicle/Monster (Tough 6+) overlap at Tough 6-9;
  // in that band, vehicle-ish rules tip it to Vehicle/Monster.
  if (tough > 9) return 'Vehicle/Monster';
  if (tough >= 6 && (hasVehicleHint(u.rules) || VEHICLE_NAME.test(u.name ?? ''))) return 'Vehicle/Monster';
  return 'Elite';
}

const VEHICLE_NAME = /walker|tank|turret|vehicle|speeder|gunship|bike|quad|cannon|dreadnought|monster|beast|carnifex|tyrant/i;

function hasVehicleHint(rules: string[]): boolean {
  return ['Transport', 'Fly', 'Flying', 'Impact', 'Walker', 'Vehicle', 'Monster'].some((r) => hasRule(rules, r));
}

/** Number of weapon "upgrades" spent on a weapon's traits (infantry upgrades grant 2 traits each). */
function weaponUpgradeCount(w: Weapon, infantry: boolean, unique: boolean): number {
  const n = w.traits.filter((t) => t.unique === unique && !t.free).length;
  return infantry ? Math.ceil(n / 2) : n;
}

function weaponTraitBp(w: Weapon, infantry: boolean, s: Settings): number {
  const per = (unique: boolean) => {
    const n = w.traits.filter((t) => t.unique === unique).length;
    return infantry ? Math.ceil(n / 2) : n;
  };
  return per(false) * s.bp.normal + per(true) * s.bp.unique;
}

/** Levels spent on upgrades, weapon upgrades and relics (free ones excluded). */
export function upgradesUsed(u: Unit): number {
  const infantry = u.category === 'Infantry';
  const unitUps = u.upgrades.filter((x) => !x.free).length;
  const weaponUps = u.weapons.reduce(
    (sum, w) => sum + weaponUpgradeCount(w, infantry, false) + weaponUpgradeCount(w, infantry, true),
    0,
  );
  return unitUps + weaponUps + u.relics.length;
}

/** Levels earned but not yet spent on an upgrade: the unit still has to finish levelling up. Fallen units have none. */
export function pendingLevels(u: Unit): number {
  if (u.status === 'removed') return 0;
  return Math.max(0, levelForXp(u.xp) - upgradesUsed(u));
}

export function battlePoints(u: Unit, s: Settings): number {
  const infantry = u.category === 'Infantry';
  let bp = 0;
  for (const up of u.upgrades) bp += up.unique ? s.bp.unique : s.bp.normal;
  for (const w of u.weapons) bp += weaponTraitBp(w, infantry, s);
  for (const r of u.relics) bp += s.bp[r.tier];
  bp += u.scars.length * s.bp.scar;
  return bp + u.bpAdjust;
}

export interface Issue {
  level: 'error' | 'warn' | 'info';
  text: string;
}

export function validateUnit(u: Unit): Issue[] {
  const out: Issue[] = [];
  const normal = u.upgrades.filter((x) => !x.unique);
  const unique = u.upgrades.filter((x) => x.unique);
  if (normal.length > MAX_NORMAL_TRAITS)
    out.push({ level: 'error', text: `${normal.length}/${MAX_NORMAL_TRAITS} normal traits — over the limit.` });
  if (unique.length > MAX_UNIQUE_TRAITS)
    out.push({ level: 'error', text: `${unique.length}/${MAX_UNIQUE_TRAITS} unique traits — over the limit.` });

  const seen = new Set<string>();
  for (const up of u.upgrades) {
    const k = up.name.toLowerCase();
    if (seen.has(k)) out.push({ level: 'warn', text: `Duplicate trait "${up.name}" (only allowed if a rule says so).` });
    seen.add(k);
  }

  for (const w of u.weapons) {
    if (w.traits.length > MAX_WEAPON_TRAITS)
      out.push({ level: 'error', text: `${w.name} has ${w.traits.length} traits (max ${MAX_WEAPON_TRAITS}).` });
  }

  const slots = relicSlots(u.xp);
  if (u.relics.length > 0 && u.category !== 'Hero' && !u.heroicRise && u.bpAdjust <= 0)
    out.push({ level: 'warn', text: 'Relics are for Heroes only (or units with Heroic Rise).' });
  if (u.relics.length > slots)
    out.push({ level: 'error', text: `${u.relics.length} relics but only ${slots} relic slot(s) at ${u.xp} XP.` });
  for (const r of u.relics)
    if (!relicTierAllowed(r.tier, u.xp))
      out.push({ level: 'warn', text: `${r.name} is ${r.tier}; needs ${RELIC_TIER_MIN_XP[r.tier]}+ XP.` });

  const earned = levelForXp(u.xp);
  const used = upgradesUsed(u);
  if (used > earned)
    out.push({ level: 'warn', text: `${used} upgrades taken but only ${earned} level(s) earned.` });
  else if (used < earned)
    out.push({ level: 'info', text: `${earned - used} upgrade(s) available to pick.` });

  if (u.scars.length > MAX_SCARS)
    out.push({ level: 'error', text: `${u.scars.length} scars — a unit gaining a 4th scar is removed from the army.` });

  return out;
}

export interface ForceTotals {
  supplyLimit: number;
  pointsUsed: number;
  rp: number;
  bp: number;
  activeUnits: number;
}

export function forceTotals(f: Force, s: Settings): ForceTotals {
  const active = f.units.filter((u) => u.status !== 'removed');
  return {
    supplyLimit: f.startingSupply + f.ledger.reduce((n, e) => n + e.supply, 0),
    pointsUsed: active.reduce((n, u) => n + u.points, 0),
    rp: f.ledger.reduce((n, e) => n + e.rp, 0),
    bp: active.reduce((n, u) => n + battlePoints(u, s), 0),
    activeUnits: active.length,
  };
}

export function rollDie(sides = 6): number {
  return 1 + Math.floor(Math.random() * sides);
}

/**
 * Roll 1..sides, rerolling any result `taken` says is already had. Returns every roll in order (the last one stands),
 * or just the first when every face is taken, so there's nothing to reroll into.
 */
export function rollUntilNew(sides: number, taken: (face: number) => boolean, rand: () => number = Math.random): number[] {
  const roll = () => 1 + Math.floor(rand() * sides);
  const first = roll();
  if (!taken(first)) return [first];
  const open = Array.from({ length: sides }, (_, i) => i + 1).filter((x) => !taken(x));
  if (!open.length) return [first];
  const rolls = [first];
  for (let r = roll(); ; r = roll()) {
    rolls.push(r);
    if (!taken(r)) return rolls;
  }
}

export function rollDice(n: number, sides = 6): number[] {
  return Array.from({ length: n }, () => rollDie(sides));
}

// ---- Deaths & scars ----

export type DeathOutcome = 'scar' | 'xp' | 'none';

/** Units with Lowered Constitution roll two dice when they die. */
export function deathDiceCount(u: Unit): number {
  return u.scars.some((s) => s.name === LOWERED_CONSTITUTION) ? 2 : 1;
}

/** Death roll: any 1 = scar; otherwise a 6 = +1 XP. */
export function deathOutcome(dice: number[]): DeathOutcome {
  if (dice.some((d) => d === 1)) return 'scar';
  if (dice.some((d) => d === 6)) return 'xp';
  return 'none';
}

export type ScarResult = 'comatose' | 'scarred' | 'removed';

/** Give a unit a battle scar. "Comatose" adds no scar; a 4th scar removes the unit. */
export function applyScar(u: Unit, scar: { id: string; name: string; desc?: string }): ScarResult {
  if (scar.name === 'Comatose') {
    u.status = 'comatose';
    return 'comatose';
  }
  u.scars.push(scar);
  if (u.scars.length > MAX_SCARS) {
    u.status = 'removed';
    return 'removed';
  }
  return 'scarred';
}

/** XP after losing a trait instead of a scar: the start of the previous bracket. */
export function previousBracketXp(xp: number): number {
  const level = levelForXp(xp);
  return level <= 1 ? 0 : LEVEL_THRESHOLDS[level - 2];
}

/** Growth Through Suffering: one roll per 5 BP the opponent has over you (min 1), 0 if they don't. */
export function sufferingRolls(myBp: number, oppBp: number): number {
  const diff = oppBp - myBp;
  return diff > 0 ? Math.max(1, Math.floor(diff / SUFFERING_BP_STEP)) : 0;
}
