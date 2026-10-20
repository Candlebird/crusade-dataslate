import type { MouseEvent, ReactNode } from 'react';
import { href } from '../route';
import { useStore } from '../model/store';
import {
  AGENDAS, CATEGORIES, CATEGORY_HINT, LEVEL_THRESHOLDS, NEXUS_TRAITS, RELICS, RELIC_SLOTS, RELIC_TIER_MIN_XP, RELIC_WEAPON_RULES,
  REQUISITIONS, REWARD_TABLES, SCAR_TABLE, TRAIT_TABLES, UNIQUE_TRAIT_TABLES, UNIQUE_WEAPON_TRAIT_TABLES, WEAPON_TRAIT_TABLES,
  type RelicDef, type RelicTier, type RewardTableKey, type TableEntry,
} from '../rules/data';
import {
  ANOMALY_TABLE, BENEFITS, COMBAT_MANIPULATIONS, ECHOES, NEXUS_ROUNDS, SECTOR_TYPES, UMBRA_SHOP, VOID_TABLE,
} from '../rules/nexusData';
import { CRUSADE_TEXT, NEXUS_TEXT } from '../rules/rulesText';

const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

function jump(e: MouseEvent<HTMLAnchorElement>) {
  e.preventDefault();
  document.querySelector(e.currentTarget.getAttribute('href')!)?.scrollIntoView({ behavior: 'smooth' });
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section className="panel" id={id}>
      <div className="panel-title"><h2>{title}</h2></div>
      {children}
    </section>
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

function RelicTable({ relics }: { relics: RelicDef[] }) {
  return (
    <>
      {TIERS.map((tier) => {
        const list = relics.filter((r) => r.tier === tier);
        return list.length ? (
          <div key={tier}>
            <h3>{tier} relics</h3>
            <table className="compact small">
              <tbody>
                {list.map((r) => (
                  <tr key={r.name}>
                    <td><b>{r.name}</b></td>
                    <td>{[r.profile, r.desc, r.note].filter(Boolean).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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

function Tabs({ sub }: { sub?: 'nexus' }) {
  return (
    <div className="seg">
      <button className={sub ? '' : 'on'} onClick={() => (window.location.hash = href.rules())}>Crusade</button>
      <button className={sub ? 'on' : ''} onClick={() => (window.location.hash = href.rules('nexus'))}>Nexus Wars</button>
    </div>
  );
}

/** The campaign rules: the Crusade rules, and the Nexus Wars expansion on its own sub-page. */
export default function RulesPage({ sub }: { sub?: 'nexus' }) {
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command · Rules</div>
          <h1>{sub ? 'Nexus Wars' : 'Crusade rules'}</h1>
        </div>
        <Tabs sub={sub} />
      </div>
      {sub ? <NexusRules /> : <CrusadeRules />}
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
        <p className="small">Playing Nexus Wars too? Its rules are on the <a href={href.rules('nexus')}>Nexus Wars</a> page.</p>
        <Toc items={[
          ['r-start', 'Starting a force'], ['r-xp', 'Experience'], ['r-agendas', 'Agendas'], ['r-req', 'Requisitions'],
          ['r-rewards', 'Reward tables'], ['r-deaths', 'Deaths & scars'], ['r-upgrades', 'Upgrades'], ['r-bp', 'Battle Points'],
          ['r-traits', 'Trait tables'], ['r-weapons', 'Weapon traits'], ['r-relics', 'Relics'],
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

      <Section id="r-traits" title="Trait tables">
        {Object.entries(TRAIT_TABLES).map(([k, entries]) => <Entries key={k} title={k} entries={entries} />)}
        <h2 style={{ marginTop: '1.5rem' }}>Unique traits</h2>
        {CATEGORIES.map((c) => <Entries key={c} title={`${c} (unique)`} entries={UNIQUE_TRAIT_TABLES[c]} />)}
      </Section>

      <Section id="r-weapons" title="Weapon traits">
        <Entries title="Melee" entries={WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged" entries={WEAPON_TRAIT_TABLES.Ranged} />
        <Entries title="Melee (unique)" entries={UNIQUE_WEAPON_TRAIT_TABLES.Melee} />
        <Entries title="Ranged (unique)" entries={UNIQUE_WEAPON_TRAIT_TABLES.Ranged} />
      </Section>

      <Section id="r-relics" title="Relics">
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
        <RelicTable relics={RELICS.filter((r) => !r.nexus)} />
        <Entries title="Relic weapon rules" entries={RELIC_WEAPON_RULES} />
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
          ['n-map', 'Sectors'], ['n-benefits', 'Benefits'], ['n-rounds', 'Rounds & income'], ['n-attack', 'Attacking'],
          ['n-home', 'Home challenges'], ['n-echoes', ECHOES.name], ['n-catchup', 'Catching up'], ['n-tables', 'Anomaly & Void tables'],
          ['n-shop', 'Umbra Shard shop'], ['n-traits', 'Nexus traits'], ['n-relics', 'Nexus relics'],
        ]} />
      </div>

      <Section id="n-map" title="The map">
        <Prose lines={NEXUS_TEXT.map} />
        <table className="compact small">
          <tbody>{Object.values(SECTOR_TYPES).map((t) => <tr key={t.label}><td><b>{t.label}</b></td><td>{t.desc}</td></tr>)}</tbody>
        </table>
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

      <Section id="n-attack" title="Attacking a sector">
        <Prose lines={NEXUS_TEXT.attacking} />
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

      <Section id="n-traits" title="Nexus traits">
        <p className="muted small" style={{ marginTop: 0 }}>Unlocked by Research stations, Research Station homes, Anomalies and the Void table.</p>
        {CATEGORIES.map((c) => <Entries key={c} title={c} entries={NEXUS_TRAITS[c]} />)}
      </Section>

      <Section id="n-relics" title="Nexus relics">
        <RelicTable relics={RELICS.filter((r) => r.nexus)} />
      </Section>
    </>
  );
}
