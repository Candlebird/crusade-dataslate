import type { MouseEvent, ReactNode } from 'react';
import { href, type RulesSub } from '../route';
import { useStore } from '../model/store';
import {
  AGENDAS, CATEGORIES, CATEGORY_HINT, LEVEL_THRESHOLDS, NEXUS_TRAITS, RELICS, RELIC_SLOTS, RELIC_TIER_MIN_XP, RELIC_WEAPON_RULES,
  REQUISITIONS, REWARD_TABLES, SCAR_TABLE, TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES,
  type RelicDef, type RelicTier, type RewardTableKey, type TableEntry,
} from '../rules/data';
import {
  ANOMALY_TABLE, BENEFITS, BOUNTY, BOUNTY_KINDS, BUILDINGS, GUARDIAN_LOOT, NEXUS_TECH, TECH_BRANCHES, COMBAT_MANIPULATIONS, ECHOES, ECHO_LORDS, GALACTIC_EVENTS, NEXUS_ROUNDS, SECTOR_MODIFIERS, SECTOR_TYPES, STRATEGIC_ASSETS, UMBRA_SHOP, VOID_TABLE, WARLORDS,
} from '../rules/nexusData';
import { CRUSADE_TEXT, NEXUS_TEXT } from '../rules/rulesText';
import { EXPEDITION_SITES } from '../rules/downtimeData';
import { rewardText } from '../rules/downtime';
import { relicHolderText, relicHolders } from '../rules/engine';
import { Panel } from './ui';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.querySelector(e.currentTarget.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth' });
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Panel id={`rules.${id}`} domId={id} title={title}>
      {children}
    </Panel>
  );
}

function Prose({ lines }: { lines: string[] }) {
  return <>{lines.map((l, i) => <p key={i} style={i ? undefined : { marginTop: 0 }}>{l}</p>)}</>;
}

/** A named table: trait, scar or relic-rule entries. */
function Entries({ title, entries, roll }: { title?: string; entries: TableEntry[]; roll?: boolean }) {
  return (
    <>
      {title && <h3>{title}</h3>}
      <table className="compact small">
        <tbody>
          {entries.map((e, i) => (
            <tr key={e.name}>
              {roll && <td className="muted">{i + 1}</td>}
              <td><b>{e.name}</b></td>
              <td>{e.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** A D6 (or longer) roll table of text results. */
function Rolls({ title, entries }: { title: string; entries: { text: string }[] }) {
  return (
    <>
      <h3>{title}</h3>
      <table className="compact small">
        <tbody>
          {entries.map((e, i) => <tr key={i}><td className="muted" style={{ width: '2rem' }}>{i + 1}</td><td>{e.text}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}

/** Relics as a display case: a card per relic, grouped by tier, with who carries it. */
function RelicCase({ relics }: { relics: RelicDef[] }) {
  const { state } = useStore();
  const held = relicHolders(state.forces, state.campaign);
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
                  <div key={r.name} className={`relic-card ${tier.toLowerCase()}`}>
                    <div className="relic-name">{r.name}</div>
                    {r.profile && <div className="relic-profile mono small">{r.profile}</div>}
                    {r.desc && <p className="small">{r.desc}</p>}
                    {r.note && <p className="small muted">{r.note}</p>}
                    <div className="relic-held small">
                      {by.length
                        ? <>Carried by {by.map((h, i) => <span key={i}>{i ? ', ' : ''}<a href={href.unit(h.forceId, h.unitId)}>{relicHolderText(h)}</a></span>)}</>
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

function Tabs({ sub }: { sub?: RulesSub }) {
  return (
    <div className="seg">
      {PAGES.map((p) => (
        <button key={p.tab} className={p.sub === sub ? 'on' : ''} onClick={() => (window.location.hash = href.rules(p.sub))}>{p.tab}</button>
      ))}
    </div>
  );
}

/** The campaign rules: the Crusade rules, with the trait tables, the relics and the Nexus Wars expansion on their own sub-pages. */
export default function RulesPage({ sub }: { sub?: RulesSub }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command · Rules</div>
          <h1>{PAGES.find((p) => p.sub === sub)?.title}</h1>
        </div>
        <Tabs sub={sub} />
      </div>
      {sub === 'traits' ? <TraitRules /> : sub === 'relics' ? <RelicRules /> : sub === 'nexus' ? <NexusRules /> : <CrusadeRules />}
    </>
  );
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
          <tbody>{CATEGORIES.map((c) => <tr key={c}><td><b>{c}</b></td><td>{CATEGORY_HINT[c]}</td></tr>)}</tbody>
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
              <tr key={r.name}>
                <td><b>{r.name}</b></td>
                <td className="muted">{r.cost} RP</td>
                <td>{r.name === 'Increase Supply' ? `+${supplyPerRp} Supply Limit.` : r.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section id="r-rewards" title="Reward tables">
        <p className="muted small" style={{ marginTop: 0 }}>Roll a D6.</p>
        {rewardKeys.map((k) => <Rolls key={k} title={REWARD_TABLES[k].label} entries={REWARD_TABLES[k].entries} />)}
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
          What a unit can pick when it levels up: a trait from its category's table, or a weapon trait. How levelling works is
          under Upgrades in the <a href={href.rules()}>Crusade rules</a>.
        </p>
        <Toc items={[['t-traits', 'Trait tables'], ['t-unique', 'Unique traits'], ['t-weapons', 'Weapon traits'], ['t-nexus', 'Nexus traits']]} />
      </div>

      <Section id="t-traits" title="Trait tables">
        {Object.entries(TRAIT_TABLES).map(([k, entries]) => <Entries key={k} title={k} entries={entries} />)}
      </Section>

      <Section id="t-unique" title="Unique traits">
        {CATEGORIES.map((c) => <Entries key={c} title={c} entries={UNIQUE_TRAIT_TABLES[c]} />)}
      </Section>

      <Section id="t-weapons" title="Weapon traits">
        <Entries title="Melee" entries={WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged" entries={WEAPON_TRAIT_TABLES.Ranged} />
        <Entries title="Melee (unique)" entries={UNIQUE_WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged (unique)" entries={UNIQUE_WEAPON_TRAIT_TABLES.Ranged} />
      </Section>

      <Section id="t-nexus" title="Nexus traits">
        <p className="muted small" style={{ marginTop: 0 }}>
          <a href={href.rules('nexus')}>Nexus Wars</a> only. Unlocked by Research stations, Research Station homes, Anomalies and the Void table.
        </p>
        {CATEGORIES.map((c) => <Entries key={c} title={c} entries={NEXUS_TRAITS[c]} />)}
      </Section>
    </>
  );
}

function RelicRules() {
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
        <Toc items={[['x-crusade', 'Crusade relics'], ['x-nexus', 'Nexus relics'], ['x-sortie', 'Sortie relics'], ['x-rules', 'Relic weapon rules']]} />
      </div>

      <Section id="x-crusade" title="Crusade relics">
        <RelicCase relics={RELICS.filter((r) => !r.nexus && !r.sortie)} />
      </Section>

      <Section id="x-nexus" title="Nexus relics">
        <Prose lines={CRUSADE_TEXT.nexusRelics} />
        <RelicCase relics={RELICS.filter((r) => r.nexus)} />
      </Section>

      <Section id="x-sortie" title="Sortie relics">
        <p className="small">One for each Sortie region, brought home by following its story thread to the end and getting back alive (or beating its lord). Any unit of the force that can carry a relic takes it for free.</p>
        <RelicCase relics={RELICS.filter((r) => r.sortie)} />
      </Section>

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
          ['n-home', 'Home challenges'], ['n-echoes', ECHOES.name], ['n-events', 'Galactic Events'], ['n-crisis', 'Nexus Crisis'], ['n-downtime', 'Downtime'], ['n-fog', 'Fog of war & Chronicle'], ['n-night', 'Game night'], ...(BOUNTY.enabled ? [['n-bounties', 'Bounty Board'] as [string, string]] : []), ['n-warroom', 'War Room'], ['n-production', 'Production'], ['n-tech', 'Tech tree'], ['n-heroes', 'Heroes & guardians'], ['n-marauders', 'Marauders'], ['n-warlords', 'Warlords'], ['n-duels', 'Nexus Duels'], ['n-catchup', 'Catching up'], ['n-tables', 'Anomaly & Void tables'],
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
        <Entries title="Galactic Events (D12)" roll entries={GALACTIC_EVENTS.map((e) => ({ name: e.name, desc: e.battle ? `${e.desc} In every battle: ${e.battle}` : e.desc }))} />
      </Section>

      <Section id="n-crisis" title="The Nexus Crisis">
        <Prose lines={NEXUS_TEXT.crisis} />
        <Entries title="Echo Lords (D6)" roll entries={ECHO_LORDS} />
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

      {BOUNTY.enabled && <Section id="n-bounties" title="Bounty Board">
        <Prose lines={NEXUS_TEXT.bounties} />
        <Entries title="Bounties" entries={BOUNTY_KINDS.map((k) => ({ name: k.name, desc: k.desc.replace(/\{(\w+)\}/g, (_, w: string) => (w === 'rounds' ? 'some rounds' : `a ${w}`)) }))} />
      </Section>}

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
        <Entries title="Guardian loot (D6 + tier bonus)" roll entries={GUARDIAN_LOOT.table.map((l) => ({ name: l.name, desc: l.desc }))} />
      </Section>

      <Section id="n-marauders" title="Marauders">
        <Prose lines={NEXUS_TEXT.marauders} />
      </Section>

      <Section id="n-warlords" title="Warlords">
        <Prose lines={NEXUS_TEXT.warlords} />
        {WARLORDS.paths.map((p) => (
          <Entries key={p.id} title={`${p.icon} ${p.name}: ${p.desc}`} entries={p.perks.map((k, i) => ({ name: `Level ${WARLORDS.levels[i]}: ${k.name}`, desc: k.desc }))} />
        ))}
      </Section>

      <Section id="n-duels" title="Nexus Duels">
        <Prose lines={NEXUS_TEXT.duels} />
      </Section>

      <Section id="n-catchup" title="Catching up">
        <Prose lines={NEXUS_TEXT.catchUp} />
      </Section>

      <Section id="n-tables" title="Anomaly & Void tables">
        <Rolls title="Anomaly table (each round)" entries={ANOMALY_TABLE} />
        <Rolls title="Void / Space hulk table (once, for beating the AI there)" entries={VOID_TABLE} />
      </Section>

      <Section id="n-shop" title="Umbra Shard shop">
        <Prose lines={NEXUS_TEXT.shop} />
        <table className="compact small">
          <tbody>
            {UMBRA_SHOP.map((s) => (
              <tr key={s.key}><td><b>{s.name}</b></td><td className="muted">{s.cost} US</td><td>{s.desc}</td></tr>
            ))}
          </tbody>
        </table>
        <Entries title="Combat manipulations" entries={COMBAT_MANIPULATIONS} />
      </Section>

    </>
  );
}
