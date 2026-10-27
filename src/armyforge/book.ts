import type { CatalogBook, CatalogOption, CatalogSection, CatalogUnit, Force, Gain, Unit, Weapon } from '../model/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = any;

const GAME_SYSTEM = 2; // Grimdark Future

/** Extract the army book uid from an Army Forge link (army-info or army-books API) or a bare uid. */
export function parseBookUid(input: string): string | null {
  const s = input.trim();
  if (/^[A-Za-z0-9_-]{8,}$/.test(s)) return s;
  const m = s.match(/army-info\/[^/]+\/([A-Za-z0-9_-]+)/) ?? s.match(/army-books\/([A-Za-z0-9_-]+)/);
  return m ? m[1] : null;
}

const ARMY_FORGE = 'https://army-forge.onepagerules.com';

export function bookApiUrl(uid: string): string {
  return `${ARMY_FORGE}/api/army-books/${uid}?gameSystem=${GAME_SYSTEM}`;
}

/** The human-readable army page on Army Forge. */
export function bookPageUrl(uid: string, name?: string): string {
  return `${ARMY_FORGE}/army-info/grimdark-future/${uid}${name ? `?armyName=${encodeURIComponent(name)}` : ''}`;
}

/** Army Forge page for the book a unit was built from (older units only know the book's name). */
export function unitBookUrl(u: Unit, books: CatalogBook[]): string | null {
  const book = books.find((b) => b.uid === u.bookUid) ?? books.find((b) => b.name === u.bookName);
  const uid = u.bookUid ?? book?.uid;
  return uid ? bookPageUrl(uid, book?.name ?? u.bookName) : null;
}

/** A force's Army Forge link: the one set by hand, else the book most of its units come from. */
export function forceArmyUrl(f: Force, books: CatalogBook[]): string | null {
  if (f.armyLink) return f.armyLink;
  const counts = new Map<string, number>();
  for (const u of f.units) {
    const url = unitBookUrl(u, books);
    if (url) counts.set(url, (counts.get(url) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function ruleLabel(r: Raw): string {
  if (r.label) return r.label;
  return r.rating != null && r.rating !== '' ? `${r.name}(${r.rating})` : r.name;
}

function normWeapon(w: Raw): Omit<Weapon, 'id' | 'traits'> {
  return {
    name: w.name,
    count: w.count ?? 1,
    range: w.range ?? 0,
    attacks: w.attacks ?? 1,
    rules: (w.specialRules ?? []).map(ruleLabel),
  };
}

function normGain(g: Raw): Gain {
  if (g.type === 'ArmyBookWeapon') return { kind: 'weapon', weapon: normWeapon(g) };
  if (g.type === 'ArmyBookItem')
    return { kind: 'item', name: g.name, label: g.label ?? g.name, rules: (g.content ?? []).filter((c: Raw) => c.type !== 'ArmyBookWeapon').map(ruleLabel) };
  return { kind: 'rule', label: ruleLabel(g) };
}

function normSection(s: Raw, unitId: string): CatalogSection {
  const options: CatalogOption[] = (s.options ?? []).map((o: Raw) => {
    const specific = (o.costs ?? []).find((c: Raw) => c.unitId === unitId);
    return {
      id: o.uid ?? o.id,
      label: o.label,
      cost: specific ? specific.cost : (o.cost ?? 0),
      gains: (o.gains ?? []).map(normGain),
    };
  });
  return {
    id: s.uid ?? s.id,
    label: s.label,
    variant: s.variant === 'replace' ? 'replace' : 'upgrade',
    targets: s.targets ?? [],
    affectsAll: s.affects?.type === 'all',
    pickOne: s.select?.type === 'exactly' || (s.variant === 'replace' && s.affects?.type === 'exactly'),
    perModel: !!s.model || s.affects?.type === 'any' || s.select?.type === 'any',
    options,
  };
}

/** Normalize a raw Army Forge army-book JSON into our catalog shape. */
export function normalizeBook(raw: Raw): CatalogBook {
  if (!raw || !Array.isArray(raw.units)) throw new Error('Not an Army Forge army book (no "units" list).');
  const packages = new Map<string, Raw>((raw.upgradePackages ?? []).map((p: Raw) => [p.uid, p]));
  const units: CatalogUnit[] = raw.units.map((u: Raw) => {
    const disabled = new Set<string>(u.disabledUpgradeSections ?? []);
    const sections: CatalogSection[] = [];
    for (const pid of u.upgrades ?? []) {
      const pkg = packages.get(pid);
      if (!pkg) continue;
      for (const s of pkg.sections ?? []) {
        if (disabled.has(s.uid) || disabled.has(s.id)) continue;
        sections.push(normSection(s, u.id));
      }
    }
    return {
      id: u.id,
      name: String(u.name).trim(),
      cost: u.cost ?? 0,
      size: u.size ?? 1,
      quality: u.quality ?? 4,
      defense: u.defense ?? 4,
      rules: (u.rules ?? []).map(ruleLabel),
      weapons: (u.weapons ?? u.loadout ?? []).map(normWeapon),
      sections,
    };
  });
  return {
    uid: raw.uid ?? crypto.randomUUID(),
    name: raw.name ?? 'Unnamed Army',
    faction: raw.factionName ?? raw.genericName ?? raw.name ?? '',
    version: raw.versionString ?? '',
    importedAt: new Date().toISOString(),
    units,
    // A book's renamed rules (Heal for Mend and the like) sit in customRules, with the rule they stand for.
    rules: [
      ...(raw.specialRules ?? []).map((r: Raw) => ({ name: r.name, desc: r.description ?? '' })),
      ...(raw.customRules ?? []).map((r: Raw) => ({ name: r.name, desc: r.description ?? '', ...(r.originalName ? { alias: r.originalName } : {}) })),
    ],
    spells: (raw.spells ?? []).map((s: Raw) => ({ name: s.name, threshold: s.threshold ?? 0, effect: s.effect ?? '' })),
  };
}

/**
 * The group's CORS proxy (proxy/worker.js deployed as a Cloudflare Worker). Army Forge sends no
 * CORS headers, so the browser can only fetch books through it. Settings can override it per device.
 */
export const DEFAULT_PROXY = 'https://crusade-dataslate-proxy.brestel-jason-e99.workers.dev';

export const proxyOf = (s: { armyForgeProxy: string }) => s.armyForgeProxy || DEFAULT_PROXY;

const viaProxy = (target: string, proxy: string) => `${proxy.replace(/\/$/, '')}/?url=${encodeURIComponent(target)}`;

/** Fetch a book from Army Forge through the proxy. */
export async function fetchBook(uid: string, proxy: string): Promise<CatalogBook> {
  if (!proxy) throw new Error('No Army Forge proxy is set up (see Settings)');
  const res = await fetch(viaProxy(bookApiUrl(uid), proxy));
  // Army Forge answers 500 for a book only its creator may see.
  if (!res.ok)
    throw new Error(res.status >= 500 || res.status === 404 || res.status === 403
      ? "Army Forge won't share this book. It may be private; its creator can make it public or unlisted in the book editor"
      : `Army Forge returned ${res.status}`);
  return normalizeBook(await res.json());
}

/** OPR core rule descriptions for Grimdark Future. */
export const CORE_RULES_URL = 'https://army-forge.onepagerules.com/api/rules/common/2';

export async function fetchCoreRules(proxy: string): Promise<unknown> {
  if (!proxy) throw new Error('No Army Forge proxy is set up (see Settings)');
  const res = await fetch(viaProxy(CORE_RULES_URL, proxy));
  if (!res.ok) throw new Error(`Army Forge returned ${res.status}`);
  return res.json();
}

// ---- Applying upgrade options to a catalog unit ----

/** Selected option quantities, keyed by `${sectionId}:${optionId}`. */
export type Selection = Record<string, number>;

/**
 * The forms a weapon name may take in an upgrade target: Army Forge writes targets in the plural and sometimes with a
 * count ("Rifles", "2x Hail Missile Arrays", "Druidic Talismen") while the weapon itself is "Rifle".
 */
const nameForms = (s: string) => {
  const n = s.toLowerCase().trim().replace(/^\d+\s*x\s*/, '');
  return [n, n.replace(/s$/, ''), n.replace(/es$/, ''), n.replace(/men$/, 'man')];
};
/** Whether an upgrade target names this weapon. */
export const matchesTarget = (weaponName: string, target: string) => {
  const t = nameForms(target);
  return nameForms(weaponName).some((x) => t.includes(x));
};
const matches = matchesTarget;

export interface Loadout {
  cost: number;
  rules: string[];
  weapons: Omit<Weapon, 'id' | 'traits'>[];
}

/**
 * Best-effort application of upgrade picks: adds cost and gains, removes replaced weapons,
 * and folds "upgrade X with item" rules onto the targeted weapons.
 */
export function applySelection(unit: CatalogUnit, sel: Selection): Loadout {
  let cost = unit.cost;
  const rules = [...unit.rules];
  let weapons = unit.weapons.map((w) => ({ ...w, rules: [...w.rules] }));

  for (const sec of unit.sections) {
    for (const opt of sec.options) {
      const qty = sel[`${sec.id}:${opt.id}`] ?? 0;
      if (qty <= 0) continue;
      cost += opt.cost * qty;

      if (sec.variant === 'replace') {
        for (const t of sec.targets) {
          const w = weapons.find((x) => matches(x.name, t) && x.count > 0);
          if (!w) continue;
          w.count = sec.affectsAll && !sec.perModel ? 0 : Math.max(0, w.count - qty);
        }
      }

      for (const g of opt.gains) {
        if (g.kind === 'weapon') {
          const count = sec.affectsAll && !sec.perModel && sec.variant === 'replace'
            ? Math.max(1, unit.size) * g.weapon.count
            : g.weapon.count * qty;
          const existing = weapons.find((w) => w.name === g.weapon.name);
          if (existing) existing.count += count;
          else weapons.push({ ...g.weapon, rules: [...g.weapon.rules], count });
        } else if (g.kind === 'item' && sec.variant === 'upgrade' && sec.targets.length) {
          for (const w of weapons)
            if (sec.targets.some((t) => matches(w.name, t))) w.rules = [...w.rules, ...g.rules];
        } else if (g.kind === 'item') {
          rules.push(g.label);
        } else {
          rules.push(g.label);
        }
      }
    }
  }
  weapons = weapons.filter((w) => w.count > 0);
  return { cost, rules, weapons };
}

// ---- Text list fallback ----

/** Split on commas that are not inside parentheses. */
export function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const ATTACKS = /^A(\d+|D\d[\d+]*)$/;

/** Parse a weapon like `2x Heavy Rifle (24", A1, AP(1))`. */
export function parseWeaponText(s: string): Omit<Weapon, 'id' | 'traits'> | null {
  const m = s.match(/^(?:(\d+)\s*x\s*)?(.+?)\s*\((.*)\)$/);
  if (!m) return null;
  const parts = splitTopLevel(m[3]);
  let range = 0;
  let attacks: number | string = 1;
  const rules: string[] = [];
  for (const p of parts) {
    const r = p.match(/^(\d+)"$/);
    const a = p.match(ATTACKS);
    if (r) range = Number(r[1]);
    else if (a) attacks = isNaN(Number(a[1])) ? a[1] : Number(a[1]);
    else rules.push(p);
  }
  if (!parts.some((p) => ATTACKS.test(p))) return null;
  return { name: m[2].trim(), count: m[1] ? Number(m[1]) : 1, range, attacks, rules };
}

export interface TextUnit {
  name: string;
  size: number;
  quality: number;
  defense: number;
  cost: number;
  rules: string[];
  weapons: Omit<Weapon, 'id' | 'traits'>[];
}

/**
 * Parse Army Forge's plain-text list export. Unit header lines look like
 * `Force Commander [1] Q3+ D3+ | 65pts | Hero, Tough(3)`; the following line(s) hold weapons.
 */
export function parseTextList(text: string): TextUnit[] {
  const units: TextUnit[] = [];
  let cur: TextUnit | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('++')) continue;
    const head = line.match(/^(.+?)\s*\[(\d+)\]\s*Q(\d)\+\s*D(\d)\+(.*)$/);
    if (head) {
      const rest = head[5];
      const pts = rest.match(/(\d+)\s*pts/);
      const segs = rest.split('|').map((x) => x.trim()).filter(Boolean);
      const ruleSeg = segs.filter((x) => !/^\d+\s*pts$/.test(x)).join(', ');
      cur = {
        name: head[1].replace(/^\d+x\s*/, '').trim(),
        size: Number(head[2]),
        quality: Number(head[3]),
        defense: Number(head[4]),
        cost: pts ? Number(pts[1]) : 0,
        rules: splitTopLevel(ruleSeg),
        weapons: [],
      };
      units.push(cur);
      continue;
    }
    if (cur) {
      for (const part of splitTopLevel(line)) {
        const w = parseWeaponText(part.replace(/^\|\s*/, ''));
        if (w) cur.weapons.push(w);
      }
    }
  }
  return units;
}
