import type { ArmyList, CatalogBook, Force, RuleText, Settings, Unit, Weapon } from '../model/types';
import { NEXUS_TRAITS, RELIC_WEAPON_RULES, RELICS, SCAR_TABLE, TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES, type TableEntry } from './data';
import { battlePoints, hasRule, type Issue } from './engine';

export function newList(f: Force, id: string): ArmyList {
  const last = f.lists?.[f.lists.length - 1];
  return {
    id,
    name: `Battle list ${(f.lists?.length ?? 0) + 1}`,
    pointsLimit: last?.pointsLimit ?? 1000,
    unitIds: [],
    joins: {},
    notes: '',
    glossary: true,
    compact: false,
  };
}

/** Selected units in print order, each joined hero right after the unit it joins. */
export function listUnits(f: Force, l: ArmyList): Unit[] {
  const picked = l.unitIds.map((id) => f.units.find((u) => u.id === id)).filter((u): u is Unit => !!u);
  const ids = new Set(picked.map((u) => u.id));
  const joined = (u: Unit) => !!l.joins[u.id] && ids.has(l.joins[u.id]) && l.joins[u.id] !== u.id;
  const out: Unit[] = [];
  for (const u of picked) {
    if (joined(u)) continue;
    out.push(u);
    for (const h of picked) if (joined(h) && l.joins[h.id] === u.id) out.push(h);
  }
  return out;
}

/** The unit a hero joins in this list, if it is also selected. */
export function joinedTo(f: Force, l: ArmyList, u: Unit): Unit | undefined {
  const t = l.joins[u.id];
  return t && t !== u.id && l.unitIds.includes(t) ? f.units.find((x) => x.id === t) : undefined;
}

export interface ListTotals {
  points: number;
  bp: number;
  units: number;
  models: number;
}

export function listTotals(f: Force, l: ArmyList, s: Settings): ListTotals {
  const us = listUnits(f, l);
  return {
    points: us.reduce((n, u) => n + u.points, 0),
    bp: us.reduce((n, u) => n + battlePoints(u, s), 0),
    units: us.length,
    models: us.reduce((n, u) => n + u.size, 0),
  };
}

export function listIssues(f: Force, l: ArmyList, s: Settings): Issue[] {
  const out: Issue[] = [];
  const us = listUnits(f, l);
  const t = listTotals(f, l, s);
  const lim = l.pointsLimit;
  if (t.points > lim) out.push({ level: 'error', text: `Over the ${lim} pt limit by ${t.points - lim} pts.` });
  for (const u of us) {
    if (u.status === 'removed') out.push({ level: 'error', text: `${label(u)} has fallen (removed from the Order of Battle).` });
    if (u.status === 'comatose') out.push({ level: 'warn', text: `${label(u)} is comatose and must sit out the next game.` });
  }
  // Standard OPR army composition guidelines; warnings only, groups may ignore them.
  if (lim > 0) {
    const heroes = us.filter(isHero).length;
    const maxHeroes = Math.floor(lim / 375);
    if (heroes > maxHeroes) out.push({ level: 'warn', text: `${heroes} heroes; the standard limit is 1 per 375 pts (${maxHeroes}).` });
    const maxUnits = Math.floor(lim / 150);
    if (us.length > maxUnits) out.push({ level: 'warn', text: `${us.length} units; the standard limit is 1 per 150 pts (${maxUnits}).` });
    const maxCopies = 1 + Math.floor(lim / 750);
    const copies = new Map<string, number>();
    for (const u of us) if (u.unitType) copies.set(u.unitType, (copies.get(u.unitType) ?? 0) + 1);
    for (const [type, n] of copies)
      if (n > maxCopies) out.push({ level: 'warn', text: `${n}× ${type}; the standard limit is ${maxCopies} copies at this size.` });
    for (const u of us)
      if (u.points > lim * 0.35) out.push({ level: 'warn', text: `${label(u)} costs over 35% of the game size (${Math.floor(lim * 0.35)} pts).` });
  }
  return out;
}

export const isHero = (u: Unit) => u.category === 'Hero' || hasRule(u.rules, 'Hero');

export const label = (u: Unit) => u.name || u.unitType || 'Unnamed unit';

/** "AP(2)" -> "AP", "Tough(3)" -> "Tough", "Tough +3" -> "Tough". */
export function ruleName(s: string): string {
  return s.replace(/\(.*\)$/, '').replace(/\s*[+-]\d+$/, '').trim();
}

/** Split a weapon's rules into its AP value and the remaining special rules. */
export function weaponColumns(w: Weapon): { ap: string; special: string[] } {
  const ap = w.rules.find((r) => /^AP\(/.test(r));
  return { ap: ap ? ap.slice(3, -1) : '', special: w.rules.filter((r) => r !== ap) };
}

/** Rule names in a relic profile such as 'Melee, A6, AP(2), Demolish'. */
function profileRules(profile: string): string[] {
  return profile.split(',').map((p) => p.trim()).filter((p) => p && p !== 'Melee' && !/^\d+"$/.test(p) && !/^A\s?\S+$/.test(p));
}

export interface GlossaryEntry {
  name: string;
  desc: string;
}

/** Every rule, trait and scar on the listed units that has a known description. */
export function glossary(units: Unit[], books: CatalogBook[], coreRules: RuleText[] = []): GlossaryEntry[] {
  const names = new Set<string>();
  for (const u of units) {
    u.rules.forEach((r) => names.add(ruleName(r)));
    u.upgrades.forEach((x) => names.add(ruleName(x.name)));
    u.scars.forEach((x) => names.add(x.name));
    for (const w of u.weapons) {
      w.rules.forEach((r) => names.add(ruleName(r)));
      w.traits.forEach((x) => names.add(ruleName(x.name)));
    }
    for (const r of u.relics) {
      names.add(r.name);
      if (r.profile) profileRules(r.profile).forEach((x) => names.add(ruleName(x)));
    }
  }
  const descs = new Map<string, string>();
  const add = (name: string, desc?: string) => {
    const k = name.toLowerCase();
    if (desc && !descs.has(k)) descs.set(k, desc);
  };
  // The units' own books first, so their wording wins; then the core rules, then any other book.
  const own = new Set(units.map((u) => u.bookUid));
  books.filter((b) => own.has(b.uid)).forEach((b) => b.rules.forEach((r) => add(r.name, r.desc)));
  coreRules.forEach((r) => add(r.name, r.desc));
  books.filter((b) => !own.has(b.uid)).forEach((b) => b.rules.forEach((r) => add(r.name, r.desc)));
  const tables: TableEntry[][] = [
    ...Object.values(TRAIT_TABLES), ...Object.values(UNIQUE_TRAIT_TABLES),
    ...Object.values(WEAPON_TRAIT_TABLES), ...Object.values(UNIQUE_WEAPON_TRAIT_TABLES), SCAR_TABLE,
    RELIC_WEAPON_RULES, ...Object.values(NEXUS_TRAITS),
  ];
  for (const t of tables) t.forEach((e) => add(ruleName(e.name), e.desc));
  RELICS.forEach((r) => add(r.name, r.desc));
  return [...names]
    .filter((n) => descs.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, desc: descs.get(name.toLowerCase())! }));
}

/** Spells of the books that the listed casters come from. */
export function listSpells(units: Unit[], books: CatalogBook[]): CatalogBook['spells'] {
  const casters = units.filter((u) => hasRule(u.rules, 'Caster'));
  const uids = new Set(casters.map((u) => u.bookUid).filter(Boolean));
  return books.filter((b) => uids.has(b.uid)).flatMap((b) => b.spells);
}
