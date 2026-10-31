import { createContext, useContext, useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { href, type RulesSub } from '../route';
import { useStore } from '../model/store';
import {
  AGENDAS, CATEGORIES, CATEGORY_HINT, LEVEL_THRESHOLDS, NEXUS_TRAITS, RELICS, RELIC_SLOTS, RELIC_TIER_MIN_XP, RELIC_WEAPON_RULES,
  REQUISITIONS, REWARD_TABLES, SCAR_TABLE, TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES,
  type RelicDef, type RelicTier, type RewardTableKey, type TableEntry,
} from '../rules/data';
import {
  ANOMALY_TABLE, BENEFITS, BUILDINGS, GUARDIAN_LOOT, NEXUS_TECH, TECH_BRANCHES, COMBAT_MANIPULATIONS, ECHOES, ECHO_LORDS, GALACTIC_EVENTS, NEXUS_ROUNDS, SECTOR_MODIFIERS, SECTOR_TYPES, STRATEGIC_ASSETS, UMBRA_SHOP, VOID_TABLE, WARLORDS,
} from '../rules/nexusData';
import { CRUSADE_TEXT, NEXUS_TEXT } from '../rules/rulesText';
import { EXPEDITION_SITES } from '../rules/downtimeData';
import { rewardText } from '../rules/downtime';
import { relicSource } from '../rules/sortie';
import { featInfo } from '../rules/feats';
import { relicHolderText, relicHolders } from '../rules/engine';
import { Panel, UsAbbr } from './ui';
import { entryId, searchRules, type RuleHit } from '../model/rulesSearch';
import { IconText } from './Icon';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.querySelector(e.currentTarget.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth' });
}

/** The section an entry sits in ('' = outside any), for its element id (entryId), so a search hit can scroll to it. */
const SectionAnchor = createContext('');
/** The element id of an entry in the current section. */
const useEntryId = () => {
  const anchor = useContext(SectionAnchor);
  return (key: string) => entryId(anchor, key);
};

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Panel id={`rules.${id}`} domId={id} title={title}>
      <SectionAnchor.Provider value={id}>{children}</SectionAnchor.Provider>
    </Panel>
  );
}

function Prose({ lines }: { lines: string[] }) {
  const idOf = useEntryId();
  return <>{lines.map((l, i) => <p key={i} id={idOf(l)} style={i ? undefined : { marginTop: 0 }}>{l}</p>)}</>;
}

/**
 * A named table: trait, scar or relic-rule entries. An entry's key (for its element id, idKey) is its name unless given, and
 * "<group>: <name>" with a group (tables that share names, as the search index keys them).
 */
function Entries({ title, entries, roll, group }: { title?: string; entries: (TableEntry & { idKey?: string })[]; roll?: boolean; group?: string }) {
  const idOf = useEntryId();
  return (
    <>
      {title && <h3><IconText text={title} /></h3>}
      <table className="compact small">
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.name} id={idOf(group ? `${group}: ${e.idKey ?? e.name}` : e.idKey ?? e.name)}>
              {roll && <td className="muted">{i + 1}</td>}
              <td><b><IconText text={e.name} /></b></td>
              <td>{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** A D6 (or longer) roll table of text results. With a group, a row's key (for its element id) is "<group>: <text>". */
function Rolls({ title, entries, group }: { title: string; entries: { text: string }[]; group?: string }) {
  const idOf = useEntryId();
  return (
    <>
      <h3>{title}</h3>
      <table className="compact small">
        <tbody>
          {entries.map((e, i) => <tr key={i} id={idOf(group ? `${group}: ${e.text}` : e.text)}><td className="muted" style={{ width: '2rem' }}>{i + 1}</td><td>{e.text}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}

/** Relics as a display case: a card per relic, grouped by tier, with who carries it. */
function RelicCase({ relics, source }: { relics: RelicDef[]; source?: (r: RelicDef) => string }) {
  const { state } = useStore();
  const held = relicHolders(state.forces, state.campaign);
  const idOf = useEntryId();
  return (
    <>
      {TIERS.map((tier) => {
        const list = relics.filter((r) => r.tier === tier);
        return list.length ? (
          <div key={tier}>
            <h3 className={`relic-tier ${tier.toLowerCase()}`}>{tier} <span className="muted small">· hero XP {RELIC_TIER_MIN_XP[tier]}+</span></h3>
            <div className="relic-case">
              {list.map((r) => {
                const by = held.get(r.name) ?? [];
                return (
                  <div key={r.name} id={idOf(r.name)} className={`relic-card ${tier.toLowerCase()}`}>
                    <div className="relic-name">{r.name}</div>
                    {r.profile && <div className="relic-profile mono small">{r.profile}</div>}
                    {r.desc && <p className="small">{r.desc}</p>}
                    {r.note && <p className="small muted">{r.note}</p>}
                    {source && <p className="small muted">{source(r)}</p>}
                    <div className="relic-held small">
                      {by.length
                        ? <>Carried by {by.map((h, i) => <span key={i}>{i ? ', ' : ''}<a href={h.unitId ? href.unit(h.forceId, h.unitId) : href.force(h.forceId)}>{relicHolderText(h)}</a></span>)}</>
                        : <span className="muted">Unclaimed</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null;
      })}
    </>
  );
}

function Toc({ items }: { items: [string, string][] }) {
  return (
    <nav className="guide-toc small">
      {items.map(([id, label]) => <a key={id} href={`#${id}`} onClick={jump}>{label}</a>)}
    </nav>
  );
}

const PAGES: { sub?: RulesSub; tab: string; title: string }[] = [
  { tab: 'Crusade', title: 'Crusade rules' },
  { sub: 'traits', tab: 'Traits & weapons', title: 'Traits & weapon upgrades' },
  { sub: 'relics', tab: 'Relics', title: 'Relics' },
  { sub: 'nexus', tab: 'Nexus Wars', title: 'Nexus Wars' },
];

function Tabs({ sub, onPick }: { sub?: RulesSub | null; onPick: () => void }) {
  return (
    <div className="seg rules-tabs">
      {PAGES.map((p) => (
        <button key={p.tab} className={sub !== null && p.sub === sub ? 'on' : ''} onClick={() => { onPick(); window.location.hash = href.rules(p.sub); }}>{p.tab}</button>
      ))}
    </div>
  );
}

const RELIC_TAB_OF: Record<string, RelicPage> = { 'x-crusade': 'crusade', 'x-nexus': 'nexus', 'x-sortie': 'sortie', 'x-training': 'training' };

/** The campaign rules: the Crusade rules, with the trait tables, the relics and the Nexus Wars expansion on their own sub-pages. */
export default function RulesPage({ sub }: { sub?: RulesSub }) {
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<RuleHit | null>(null);
  const [relicTab, setRelicTab] = useState<{ page: RelicPage; n: number }>({ page: 'rules', n: 0 });
  const hits = query.trim().length > 1 ? searchRules(query) : null;

  // After opening a search hit, scroll to the entry that matched once the page has drawn, and flash it. A folded section
  // is opened first; if the entry still isn't there, its section will do.
  useEffect(() => {
    if (!target) return;
    const timers: number[] = [];
    const show = (retry: boolean) => {
      const el = document.getElementById(target.entry);
      const section = target.anchor ? document.getElementById(target.anchor) : null;
      if (!el && retry && section?.classList.contains('collapsed')) {
        section.querySelector<HTMLButtonElement>('button.fold')?.click();
        timers.push(window.setTimeout(() => show(false), 60));
        return;
      }
      setTarget(null);
      if (!el) {
        if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        else window.scrollTo(0, 0);
        return;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('rule-flash');
      void el.offsetWidth; // restart the animation when the same entry is opened twice
      el.classList.add('rule-flash');
      timers.push(window.setTimeout(() => el.classList.remove('rule-flash'), 2200));
    };
    timers.push(window.setTimeout(() => show(true), 120));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [target, sub]);

  const open = (h: RuleHit) => {
    setQuery('');
    if (h.page === 'relics') setRelicTab((r) => ({ page: RELIC_TAB_OF[h.anchor] ?? 'rules', n: r.n + 1 }));
    window.location.hash = href.rules(h.page);
    setTarget(h);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command · Rules</div>
          <h1>{hits ? 'Search the rules' : PAGES.find((p) => p.sub === sub)?.title}</h1>
        </div>
        <Tabs sub={hits ? null : sub} onPick={() => setQuery('')} />
      </div>
      <div className="rules-search">
        <input
          type="search"
          value={query}
          placeholder="Search all rules: a trait, relic, scar…"
          aria-label="Search the rules"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
        />
        {!hits && <div className="muted small">New to the app? <a href={href.guide()}>Getting started</a> walks you through making your first force.</div>}
      </div>
      {hits ? <SearchResults query={query} hits={hits} open={open} />
        : sub === 'traits' ? <TraitRules /> : sub === 'relics' ? <RelicRules key={relicTab.n} initial={relicTab.page} /> : sub === 'nexus' ? <NexusRules /> : <CrusadeRules />}
    </>
  );
}

/** Search hits from all four rules pages, each opening its page at its section. */
function SearchResults({ query, hits, open }: { query: string; hits: RuleHit[]; open: (h: RuleHit) => void }) {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!hits.length) return <div className="panel empty">Nothing in the rules matches “{query.trim()}”. Try a single word, like a trait or relic name.</div>;
  return (
    <div className="panel">
      <p className="muted small" style={{ marginTop: 0 }}>{hits.length === 40 ? 'The first 40 matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}. Pick one to open it in place.</p>
      {hits.map((h, i) => (
        <a key={i} className="rules-hit" href={href.rules(h.page)} onClick={(e) => { e.preventDefault(); open(h); }}>
          <span className="muted small">{PAGES.find((p) => p.sub === h.page)?.tab} · {h.section}</span>
          {h.title && <b><Highlight text={h.title} words={words} /></b>}
          {h.text && <span className="small"><Highlight text={snippet(h.text, words)} words={words} /></span>}
        </a>
      ))}
    </div>
  );
}

/** A window of the text around the first matching word. */
function snippet(text: string, words: string[], size = 220): string {
  if (text.length <= size) return text;
  const lower = text.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((n) => n >= 0), text.length);
  const start = Math.max(0, Math.min(at - 60, text.length - size));
  return `${start > 0 ? '…' : ''}${text.slice(start, start + size).trim()}${start + size < text.length ? '…' : ''}`;
}

function Highlight({ text, words }: { text: string; words: string[] }) {
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))}</>;
}

function CrusadeRules() {
  const { state } = useStore();
  const { bp, supplyPerRp } = state.settings;
  const rewardKeys: RewardTableKey[] = ['winner', 'winnerSpecial', 'loser', 'suffering', 'ai', 'aiSpecial'];

  return (
    <>
      <div className="panel">
        <Prose lines={CRUSADE_TEXT.overview} />
        <p className="small">
          The trait tables and weapon traits are on the <a href={href.rules('traits')}>Traits & weapons</a> page, the relics
          on the <a href={href.rules('relics')}>Relics</a> page. Playing Nexus Wars too? Its rules are on
          the <a href={href.rules('nexus')}>Nexus Wars</a> page.
        </p>
        <Toc items={[
          ['r-start', 'Starting a force'], ['r-xp', 'Experience'], ['r-agendas', 'Agendas'], ['r-req', 'Requisitions'],
          ['r-rewards', 'Reward tables'], ['r-deaths', 'Deaths & scars'], ['r-upgrades', 'Upgrades'], ['r-bp', 'Battle Points'],
        ]} />
      </div>

      <Section id="r-start" title="Starting a force">
        <Prose lines={CRUSADE_TEXT.starting} />
        <table className="compact small">
          <tbody>{CATEGORIES.map((c) => <tr key={c} id={entryId('r-start', c)}><td><b>{c}</b></td><td>{CATEGORY_HINT[c]}</td></tr>)}</tbody>
        </table>
      </Section>

      <Section id="r-xp" title="Gaining experience">
        <Prose lines={CRUSADE_TEXT.experience} />
      </Section>

      <Section id="r-agendas" title="Agendas">
        <Entries title="Core agendas" entries={AGENDAS.filter((a) => !a.special)} />
        <Entries title="Special agendas" entries={AGENDAS.filter((a) => a.special)} />
      </Section>

      <Section id="r-req" title="Requisitions">
        <Prose lines={CRUSADE_TEXT.requisitions} />
        <table className="compact small">
          <tbody>
            {REQUISITIONS.map((r) => (
              <tr key={r.name} id={entryId('r-req', r.name)}>
                <td><b>{r.name}</b></td>
                <td className="muted">{r.cost} RP</td>
                <td>{r.name === 'Increase Supply' ? `+${supplyPerRp} Supply Limit.` : r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="r-rewards" title="Reward tables">
        <p className="muted small" style={{ marginTop: 0 }}>Roll a D10. Umbra Shards, trait tokens and Combat Manipulations are Nexus Wars rewards; a force outside Nexus Wars re-rolls trait tokens and Combat Manipulations, and the record wizard's Roll button does that for it.</p>
        {rewardKeys.map((k) => <Rolls key={k} title={REWARD_TABLES[k].label} group={REWARD_TABLES[k].label} entries={REWARD_TABLES[k].entries} />)}
      </Section>

      <Section id="r-deaths" title="Deaths & battle scars">
        <Prose lines={CRUSADE_TEXT.deaths} />
        <Entries title="Scar table (D10)" entries={SCAR_TABLE} roll />
      </Section>

      <Section id="r-upgrades" title="Upgrades">
        <Prose lines={CRUSADE_TEXT.upgrades} />
        <p className="small muted">Level thresholds: {LEVEL_THRESHOLDS.map((t, i) => `L${i + 1} ${t}`).join(' · ')} XP.</p>
        <p className="small">The tables to pick from are on the <a href={href.rules('traits')}>Traits & weapons</a> page.</p>
      </Section>

      <Section id="r-bp" title="Battle Points & Blessings">
        <p style={{ marginTop: 0 }}>A force's Battle Points (BP) measure how upgraded it is:</p>
        <table className="compact small">
          <tbody>
            <tr><td>Normal upgrade (free ones too)</td><td>+{bp.normal}</td></tr>
            <tr><td>Unique upgrade</td><td>+{bp.unique}</td></tr>
            <tr><td>Battle scar</td><td>{bp.scar}</td></tr>
            {TIERS.map((t) => <tr key={t}><td>{t} relic</td><td>+{bp[t]}</td></tr>)}
          </tbody>
        </table>
        <Prose lines={CRUSADE_TEXT.blessings} />
      </Section>

    </>
  );
}

function TraitRules() {
  return (
    <>
      <div className="panel">
        <p style={{ marginTop: 0 }}>
          What a unit can pick on a level up: a trait from its category's table, or a weapon trait. Levelling is explained
          under Upgrades in the <a href={href.rules()}>Crusade rules</a>.
        </p>
        <Toc items={[['t-traits', 'Trait tables'], ['t-unique', 'Unique traits'], ['t-weapons', 'Weapon traits'], ['t-nexus', 'Nexus traits']]} />
      </div>

      <Section id="t-traits" title="Trait tables">
        {Object.entries(TRAIT_TABLES).map(([k, entries]) => <Entries key={k} title={k} group={`${k} traits`} entries={entries} />)}
      </Section>

      <Section id="t-unique" title="Unique traits">
        {CATEGORIES.map((c) => <Entries key={c} title={c} group={`Unique ${c} traits`} entries={UNIQUE_TRAIT_TABLES[c]} />)}
      </Section>

      <Section id="t-weapons" title="Weapon traits">
        <Entries title="Melee" group="Melee weapon traits" entries={WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged" group="Ranged weapon traits" entries={WEAPON_TRAIT_TABLES.Ranged} />
        <Entries title="Melee (unique)" group="Unique melee weapon traits" entries={UNIQUE_WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged (unique)" group="Unique ranged weapon traits" entries={UNIQUE_WEAPON_TRAIT_TABLES.Ranged} />
      </Section>

      <Section id="t-nexus" title="Nexus traits">
        <p className="muted small" style={{ marginTop: 0 }}>
          <a href={href.rules('nexus')}>Nexus Wars</a> only. Unlocked by Research stations, Research Station homes, Anomalies and the Void table.
        </p>
        {CATEGORIES.map((c) => <Entries key={c} title={c} group={`Nexus ${c} traits`} entries={NEXUS_TRAITS[c]} />)}
      </Section>
    </>
  );
}

const RELIC_PAGES = [
  ['rules', 'Rules'],
  ['crusade', 'Crusade Relics'],
  ['nexus', 'Nexus Relics'],
  ['sortie', 'Sortie Relics'],
  ['training', 'Training Relics'],
] as const;
type RelicPage = (typeof RELIC_PAGES)[number][0];

/** The relics page, split into the rules and one case per kind of relic. */
export function RelicRules({ initial = 'rules' }: { initial?: RelicPage }) {
  const [page, setPage] = useState<RelicPage>(initial);
  return (
    <>
      <div className="seg" style={{ marginBottom: '1rem' }}>
        {RELIC_PAGES.map(([id, label]) => <button key={id} className={page === id ? 'on' : ''} onClick={() => setPage(id)}>{label}</button>)}
      </div>
      {page === 'crusade' ? (
        <Section id="x-crusade" title="Crusade relics">
          <RelicCase relics={RELICS.filter((r) => !r.nexus && !r.sortie && !r.training)} />
        </Section>
      ) : page === 'nexus' ? (
        <Section id="x-nexus" title="Nexus relics">
          <Prose lines={CRUSADE_TEXT.nexusRelics} />
          <RelicCase relics={RELICS.filter((r) => r.nexus)} />
        </Section>
      ) : page === 'sortie' ? (
        <Section id="x-sortie" title="Sortie relics">
          <p className="small">Brought home from Sorties, each once per force: a region's story finished, its deep version won, a flawless win, a full grudge settled, and every Echo lord slain on a high tier. Any unit of the force that can carry a relic takes it for free.</p>
          <RelicCase relics={RELICS.filter((r) => r.sortie)} source={(r) => relicSource(r.sortie!)} />
        </Section>
      ) : page === 'training' ? (
        <Section id="x-training" title="Training relics">
          <p className="small">Won by the hardest Training feats, each once per force. Any unit of the force that can carry a relic takes it for free. In Training, a relic on a crafted unit goes off by itself, as every relic does.</p>
          <RelicCase relics={RELICS.filter((r) => r.training)} source={(r) => `Feat: ${featInfo(r.training!)?.name ?? r.training} (${featInfo(r.training!)?.text.replace(/\.$/, '') ?? ''}).`} />
        </Section>
      ) : <RelicBasics />}
    </>
  );
}

function RelicBasics() {
  return (
    <>
      <div className="panel">
        <Prose lines={CRUSADE_TEXT.relics} />
        <div className="row small" style={{ flexWrap: 'wrap', gap: '1.5rem', alignItems: 'flex-start' }}>
          <table className="compact" style={{ width: 'auto' }}>
            <thead><tr><th>Hero XP</th><th>Relic slots</th></tr></thead>
            <tbody>
              {RELIC_SLOTS.map(([xp, n], i) => {
                const next = RELIC_SLOTS[i + 1]?.[0];
                return <tr key={xp}><td>{next ? `${xp}–${next - 1}` : `${xp}+`}</td><td>{n}</td></tr>;
              })}
            </tbody>
          </table>
          <table className="compact" style={{ width: 'auto' }}>
            <thead><tr><th>Tier</th><th>Hero XP</th><th>Cost</th></tr></thead>
            <tbody>
              {TIERS.map((t) => (
                <tr key={t}>
                  <td>{t}</td>
                  <td>{RELIC_TIER_MIN_XP[t]}+</td>
                  <td>{REQUISITIONS.find((r) => r.name === `${t} Relic`)?.cost ?? '?'} RP</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Section id="x-rules" title="Relic weapon rules">
        <Entries entries={RELIC_WEAPON_RULES} />
      </Section>
    </>
  );
}

function NexusRules() {
  const R = NEXUS_ROUNDS;
  return (
    <>
      <div className="panel">
        <Prose lines={NEXUS_TEXT.overview} />
        <p className="small">
          The Nexus Wars build on the <a href={href.rules()}>Crusade rules</a>. The map and the round tracker are on
          the <a href={href.campaign()}>Nexus Wars</a> page.
        </p>
        <Toc items={[
          ['n-map', 'Sectors'], ['n-danger', 'Difficulty & modifiers'], ['n-benefits', 'Benefits'], ['n-rounds', 'Rounds & income'], ['n-skirmish', 'Skirmishes & Assets'], ['n-attack', 'The Battle'], ['n-detach', 'Detachments'],
          ['n-home', 'Home challenges'], ['n-echoes', ECHOES.name], ['n-events', 'Galactic Events'], ['n-crisis', 'Nexus Crisis'], ['n-downtime', 'Downtime'], ['n-fog', 'Fog of war & Chronicle'], ['n-night', 'Game night'], ['n-warroom', 'War Room'], ['n-production', 'Production'], ['n-tech', 'Tech tree'], ['n-heroes', 'Heroes & guardians'], ['n-marauders', 'Marauders'], ['n-warlords', 'Warlords'], ['n-duels', 'Nexus Duels'], ['n-catchup', 'Catching up'], ['n-tables', 'Anomaly & Void tables'],
          ['n-shop', 'Umbra Shard shop'],
        ]} />
        <p className="small">
          The Nexus traits are on the <a href={href.rules('traits')}>Traits & weapons</a> page and the Nexus relics on
          the <a href={href.rules('relics')}>Relics</a> page.
        </p>
      </div>

      <Section id="n-map" title="The map">
        <Prose lines={NEXUS_TEXT.map} />
        <table className="compact small">
          <tbody>{Object.values(SECTOR_TYPES).map((t) => <tr key={t.label}><td><b>{t.label}</b></td><td>{t.desc}</td></tr>)}</tbody>
        </table>
      </Section>

      <Section id="n-danger" title="Difficulty & sector modifiers">
        <Prose lines={NEXUS_TEXT.difficulty} />
        <Entries title="Sector modifiers" entries={SECTOR_MODIFIERS} />
      </Section>

      <Section id="n-benefits" title="Benefits">
        {(['home', 'planet'] as const).map((type) => (
          <Entries key={type} title={type === 'home' ? 'Home benefits (pick one)' : 'Planet benefits (one per planet)'}
            entries={BENEFITS.filter((b) => b.type === type)} />
        ))}
      </Section>

      <Section id="n-rounds" title="Rounds & income">
        <Prose lines={NEXUS_TEXT.rounds} />
      </Section>

      <Section id="n-skirmish" title="Skirmishes & Strategic Assets">
        <Prose lines={NEXUS_TEXT.skirmishes} />
        <Entries title="Strategic Assets" entries={STRATEGIC_ASSETS} />
      </Section>

      <Section id="n-attack" title="The Battle: attacking a sector">
        <Prose lines={NEXUS_TEXT.attacking} />
      </Section>

      <Section id="n-detach" title="Detachments">
        <Prose lines={NEXUS_TEXT.detachments} />
      </Section>

      <Section id="n-home" title="Home-sector challenges">
        <Prose lines={NEXUS_TEXT.home} />
      </Section>

      <Section id="n-echoes" title={`The ${ECHOES.name}`}>
        <Prose lines={NEXUS_TEXT.echoes} />
        <table className="compact small" style={{ width: 'auto' }}>
          <thead><tr><th>Threat</th>{R.spreadsByThreat.map((_, t) => <th key={t}>{t}</th>)}</tr></thead>
          <tbody><tr><td>Sectors spread into</td>{R.spreadsByThreat.map((n, t) => <td key={t}>{n}</td>)}</tr></tbody>
        </table>
      </Section>

      <Section id="n-events" title="Galactic Events">
        <Prose lines={NEXUS_TEXT.events} />
        <Entries title={`Galactic Events (D${GALACTIC_EVENTS.length})`} roll entries={GALACTIC_EVENTS.map((e) => ({ name: e.name, desc: e.battle ? `${e.desc} In every battle: ${e.battle}` : e.desc }))} />
      </Section>

      <Section id="n-crisis" title="The Nexus Crisis">
        <Prose lines={NEXUS_TEXT.crisis} />
        <Entries title={`Echo Lords (D${ECHO_LORDS.length})`} roll entries={ECHO_LORDS} />
      </Section>

      <Section id="n-downtime" title="Downtime: Expeditions & Solo patrols">
        <Prose lines={NEXUS_TEXT.downtime} />
        <Entries title="Expedition sites" entries={EXPEDITION_SITES.map((x) => ({ name: x.name, desc: `${x.desc} Make it all the way: ${rewardText(x.finish.reward)}.` }))} />
      </Section>

      <Section id="n-fog" title="Fog of war & turn reports & the Chronicle">
        <Prose lines={NEXUS_TEXT.fog} />
        <Prose lines={NEXUS_TEXT.reports} />
      </Section>

      <Section id="n-night" title="Game night">
        <Prose lines={NEXUS_TEXT.gameNight} />
      </Section>


      <Section id="n-warroom" title="War Room">
        <Prose lines={NEXUS_TEXT.warRoom} />
      </Section>

      <Section id="n-production" title="Production & buildings">
        <Prose lines={NEXUS_TEXT.production} />
      </Section>

      <Section id="n-tech" title="Tech tree & buildings">
        <Prose lines={NEXUS_TEXT.tech} />
        {TECH_BRANCHES.map((br) => (
          <Entries key={br.id} title={`${br.icon} ${br.name} — ${br.desc}`} entries={BUILDINGS.filter((b) => b.branch === br.id).map((b) => ({
            name: `${b.icon} ${b.name}`,
            idKey: b.name,
            desc: [
              `Tier ${b.tier}${b.tier > 1 ? ` (${NEXUS_TECH.cost[b.tier]} Research${b.requires?.length ? `, after ${b.requires.map((r) => BUILDINGS.find((x) => x.id === r)?.name ?? r).join(' and ')}` : ''})` : ''}.`,
              `${b.cost} Materials${b.shards ? ` + ${b.shards} Umbra Shard${b.shards === 1 ? '' : 's'}` : ''}${b.homeOnly ? ', home only' : ''}.`,
              b.desc,
              b.rule === 'table' ? '(At the table.)' : '',
            ].filter(Boolean).join(' '),
          }))} />
        ))}
      </Section>

      <Section id="n-heroes" title="Wandering heroes & guardians">
        <Prose lines={NEXUS_TEXT.heroes} />
        <Prose lines={NEXUS_TEXT.guardians} />
        <Entries title="Guardian loot (D10 + tier bonus)" roll entries={GUARDIAN_LOOT.table.map((l) => ({ name: l.name, desc: l.desc }))} />
      </Section>

      <Section id="n-marauders" title="Marauders">
        <Prose lines={NEXUS_TEXT.marauders} />
      </Section>

      <Section id="n-warlords" title="Warlords">
        <Prose lines={NEXUS_TEXT.warlords} />
        {WARLORDS.paths.map((p) => (
          <Entries key={p.id} title={`${p.icon} ${p.name}: ${p.desc}`} entries={p.perks.map((k, i) => ({ name: `Level ${WARLORDS.levels[i]}: ${k.name}`, idKey: k.name, desc: k.desc }))} />
        ))}
      </Section>

      <Section id="n-duels" title="Nexus Duels">
        <Prose lines={NEXUS_TEXT.duels} />
      </Section>

      <Section id="n-catchup" title="Catching up">
        <Prose lines={NEXUS_TEXT.catchUp} />
      </Section>

      <Section id="n-tables" title="Anomaly & Void tables">
        <Rolls title="Anomaly table (D10, each round)" group="Anomaly table" entries={ANOMALY_TABLE} />
        <Rolls title="Void / Space hulk table (D10, once, for beating the AI there)" group="Void table" entries={VOID_TABLE} />
      </Section>

      <Section id="n-shop" title="Umbra Shard shop">
        <Prose lines={NEXUS_TEXT.shop} />
        <table className="compact small">
          <tbody>
            {UMBRA_SHOP.map((s) => (
              <tr key={s.key} id={entryId('n-shop', s.name)}><td><b>{s.name}</b></td><td className="muted">{s.cost}{s.key === 'relic' || s.key === 'expansion' ? '+' : ''} <UsAbbr /></td><td>{s.desc}</td></tr>
            ))}
          </tbody>
        </table>
        <Entries title="Combat manipulations" entries={COMBAT_MANIPULATIONS} />
      </Section>

    </>
  );
}
