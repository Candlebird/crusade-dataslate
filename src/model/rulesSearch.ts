import type { RulesSub } from '../route';
import {
  AGENDAS, CATEGORIES, CATEGORY_HINT, NEXUS_TRAITS, RELICS, RELIC_WEAPON_RULES, REQUISITIONS, REWARD_TABLES, SCAR_TABLE,
  TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES, type RewardTableKey,
} from '../rules/data';
import {
  ANOMALY_TABLE, BENEFITS, BUILDINGS, COMBAT_MANIPULATIONS, ECHO_LORDS, GALACTIC_EVENTS, SECTOR_MODIFIERS, STRATEGIC_ASSETS,
  UMBRA_SHOP, VOID_TABLE, WARLORDS,
} from '../rules/nexusData';
import { CRUSADE_TEXT, NEXUS_TEXT } from '../rules/rulesText';
import { EXPEDITION_SITES } from '../rules/downtimeData';

/** One searchable piece of the rules: where it lives (sub-page + section anchor) and its words. */
export interface RuleHit {
  page?: RulesSub;
  /** The section's element id on that page ('' = top of the page). */
  anchor: string;
  /** Section name, shown with the hit. */
  section: string;
  /** A trait, relic or table entry name; unset for a paragraph of rules text. */
  title?: string;
  text: string;
  /** The element id of the exact entry (a paragraph, a table row, a relic card) on the page: see entryId. */
  entry: string;
}

/**
 * A stable element id for one entry on a rules page, from its section anchor and its key: its name, or for a paragraph or
 * a roll-table row its text (a reward-table row is "<table>: <text>", as the same result sits in several tables). The
 * rules pages give each entry this id, so a search hit can scroll to it. Rows of tables that share names (the trait and
 * weapon tables, the Anomaly and Void tables) are keyed "<table>: <name>" too.
 */
export function entryId(anchor: string, key: string): string {
  let h = 5381;
  for (const ch of `${anchor}|${key}`) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `rule-${anchor || 'top'}-${h.toString(36)}`;
}

const CRUSADE_SECTIONS: Record<keyof typeof CRUSADE_TEXT, [RulesSub | undefined, string, string]> = {
  overview: [undefined, '', 'Crusade rules'],
  starting: [undefined, 'r-start', 'Starting a force'],
  experience: [undefined, 'r-xp', 'Gaining experience'],
  requisitions: [undefined, 'r-req', 'Requisitions'],
  deaths: [undefined, 'r-deaths', 'Deaths & battle scars'],
  upgrades: [undefined, 'r-upgrades', 'Upgrades'],
  blessings: [undefined, 'r-bp', 'Battle Points & Blessings'],
  relics: ['relics', '', 'Relics'],
  nexusRelics: ['relics', 'x-nexus', 'Nexus relics'],
};

const NEXUS_SECTIONS: Record<keyof typeof NEXUS_TEXT, [string, string]> = {
  overview: ['', 'Nexus Wars'],
  map: ['n-map', 'The map'],
  difficulty: ['n-danger', 'Difficulty & sector modifiers'],
  rounds: ['n-rounds', 'Rounds & income'],
  skirmishes: ['n-skirmish', 'Skirmishes & Strategic Assets'],
  attacking: ['n-attack', 'The Battle'],
  detachments: ['n-detach', 'Detachments'],
  home: ['n-home', 'Home-sector challenges'],
  echoes: ['n-echoes', 'Echoes'],
  events: ['n-events', 'Galactic Events'],
  crisis: ['n-crisis', 'The Nexus Crisis'],
  downtime: ['n-downtime', 'Downtime'],
  fog: ['n-fog', 'Fog of war'],
  reports: ['n-fog', 'Turn reports & the Chronicle'],
  production: ['n-production', 'Production & buildings'],
  tech: ['n-tech', 'Tech tree'],
  heroes: ['n-heroes', 'Wandering heroes'],
  guardians: ['n-heroes', 'Guardians'],
  marauders: ['n-marauders', 'Marauders'],
  warlords: ['n-warlords', 'Warlords'],
  duels: ['n-duels', 'Nexus Duels'],
  gameNight: ['n-night', 'Game night'],
  warRoom: ['n-warroom', 'War Room'],
  catchUp: ['n-catchup', 'Catching up'],
  shop: ['n-shop', 'Umbra Shard shop'],
};

type Named = { name: string; desc?: string };
type Hit = Omit<RuleHit, 'entry'> & { entry?: string };
/** Named entries of one table; grouped, each is keyed by the table as well as its name (see entryId). */
const named = (page: RulesSub | undefined, anchor: string, section: string, list: Named[], grouped = false): Hit[] =>
  list.map((e) => ({ page, anchor, section, title: e.name, text: e.desc ?? '', ...(grouped ? { entry: entryId(anchor, `${section}: ${e.name}`) } : {}) }));

let cache: RuleHit[] | null = null;

/** Everything on the four rules pages, flattened for searching. */
export function rulesIndex(): RuleHit[] {
  if (cache) return cache;
  const out: Hit[] = [];
  for (const [k, lines] of Object.entries(CRUSADE_TEXT) as [keyof typeof CRUSADE_TEXT, string[]][]) {
    const [page, anchor, section] = CRUSADE_SECTIONS[k] ?? [undefined, '', 'Crusade rules'];
    for (const text of lines) out.push({ page, anchor, section, text });
  }
  out.push(...named(undefined, 'r-start', 'Unit categories', CATEGORIES.map((c) => ({ name: c, desc: CATEGORY_HINT[c] }))));
  out.push(...named(undefined, 'r-agendas', 'Agendas', AGENDAS));
  out.push(...named(undefined, 'r-req', 'Requisitions', REQUISITIONS.map((r) => ({ name: r.name, desc: `${r.cost} RP. ${r.desc ?? ''}` }))));
  for (const k of Object.keys(REWARD_TABLES) as RewardTableKey[]) {
    const section = REWARD_TABLES[k].label;
    for (const e of REWARD_TABLES[k].entries) out.push({ anchor: 'r-rewards', section, text: e.text, entry: entryId('r-rewards', `${section}: ${e.text}`) });
  }
  out.push(...named(undefined, 'r-deaths', 'Scar table', SCAR_TABLE));

  for (const [k, list] of Object.entries(TRAIT_TABLES)) out.push(...named('traits', 't-traits', `${k} traits`, list, true));
  for (const c of CATEGORIES) out.push(...named('traits', 't-unique', `Unique ${c} traits`, UNIQUE_TRAIT_TABLES[c] ?? [], true));
  for (const k of ['Melee', 'Ranged'] as const) {
    out.push(...named('traits', 't-weapons', `${k} weapon traits`, WEAPON_TRAIT_TABLES[k], true));
    out.push(...named('traits', 't-weapons', `Unique ${k.toLowerCase()} weapon traits`, UNIQUE_WEAPON_TRAIT_TABLES[k], true));
  }
  for (const c of CATEGORIES) out.push(...named('traits', 't-nexus', `Nexus ${c} traits`, NEXUS_TRAITS[c] ?? [], true));

  for (const r of RELICS) {
    const [anchor, kind] = r.nexus ? ['x-nexus', 'Nexus'] : r.sortie ? ['x-sortie', 'Sortie'] : r.training ? ['x-training', 'Training'] : ['x-crusade', 'Crusade'];
    out.push({ page: 'relics', anchor, section: `${kind} relics · ${r.tier}`, title: r.name, text: [r.profile, r.desc, r.note].filter(Boolean).join(' ') });
  }
  out.push(...named('relics', 'x-rules', 'Relic weapon rules', RELIC_WEAPON_RULES));

  for (const [k, lines] of Object.entries(NEXUS_TEXT) as [keyof typeof NEXUS_TEXT, string[]][]) {
    const [anchor, section] = NEXUS_SECTIONS[k] ?? ['', 'Nexus Wars'];
    for (const text of lines) out.push({ page: 'nexus', anchor, section, text });
  }
  out.push(...named('nexus', 'n-danger', 'Sector modifiers', SECTOR_MODIFIERS));
  out.push(...named('nexus', 'n-benefits', 'Benefits', BENEFITS));
  out.push(...named('nexus', 'n-skirmish', 'Strategic Assets', STRATEGIC_ASSETS));
  out.push(...named('nexus', 'n-events', 'Galactic Events', GALACTIC_EVENTS.map((e) => ({ name: e.name, desc: e.battle ? `${e.desc} In every battle: ${e.battle}` : e.desc }))));
  out.push(...named('nexus', 'n-crisis', 'Echo Lords', ECHO_LORDS));
  out.push(...named('nexus', 'n-downtime', 'Expedition sites', EXPEDITION_SITES));
  out.push(...named('nexus', 'n-tech', 'Buildings', BUILDINGS));
  for (const p of WARLORDS.paths) out.push(...named('nexus', 'n-warlords', `Warlords: ${p.name}`, p.perks));
  for (const [section, list] of [['Anomaly table', ANOMALY_TABLE], ['Void table', VOID_TABLE]] as const)
    for (const e of list) out.push({ page: 'nexus', anchor: 'n-tables', section, text: e.text, entry: entryId('n-tables', `${section}: ${e.text}`) });
  out.push(...named('nexus', 'n-shop', 'Umbra Shard shop', UMBRA_SHOP));
  out.push(...named('nexus', 'n-shop', 'Combat manipulations', COMBAT_MANIPULATIONS));
  cache = out.map((h) => ({ ...h, entry: h.entry ?? entryId(h.anchor, h.title ?? h.text) }));
  return cache;
}

/** Hits holding every word of the query, names that match listed first. */
export function searchRules(query: string, limit = 40): RuleHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored: [number, RuleHit][] = [];
  for (const h of rulesIndex()) {
    const title = (h.title ?? '').toLowerCase();
    const all = `${title} ${h.section.toLowerCase()} ${h.text.toLowerCase()}`;
    if (!words.every((w) => all.includes(w))) continue;
    const score = words.filter((w) => title.includes(w)).length * 2 + words.filter((w) => h.section.toLowerCase().includes(w)).length;
    scored.push([score, h]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, h]) => h);
}
