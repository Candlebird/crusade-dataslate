import { useState, type ReactNode } from 'react';
import type { Campaign } from '../model/types';
import { BUILDINGS, NEXUS_TECH, TECH_BRANCHES, type Building } from '../rules/nexusData';
import { research, researchBlock, researchRate, techCost, techStatus, type ResearchVia } from '../rules/tech';
import { Panel, confirmAction, toast } from './ui';
import { Glyph, Icon } from './Icon';

type SetC = (fn: (c: Campaign) => void) => void;

const TIERS = [1, 2, 3] as const;
const nameOf = (id: string) => BUILDINGS.find((b) => b.id === id)?.name ?? id;

/**
 * The tech tree (Nexus Wars): every building is a tech, laid out by branch (columns) and tier (rows). A faction researches
 * a tier 2 or 3 building with Research, or a Blueprint, once its requirements are known; an Archive unlock researches any. `faction` is whose tree it is;
 * with none (the GM seeing everything) the panel picks one.
 */
export default function TechTreePanel({ c, setC, faction }: { c: Campaign; setC: SetC; faction?: string }) {
  const [picked, setPicked] = useState<string>();
  const fid = faction ?? (c.factions.some((f) => f.id === picked) ? picked : c.factions[0]?.id);
  const f = c.factions.find((x) => x.id === fid);
  if (!f) return null;
  const known = BUILDINGS.filter((b) => techStatus(f, b) === 'known').length;

  const go = (b: Building, via: ResearchVia) => {
    if (via !== 'research' && !confirmAction(`Spend ${via === 'archive' ? 'an Archive unlock' : 'a Blueprint'} to research ${b.name}?`)) return;
    let ok = false;
    setC((d) => void (ok = research(d, f.id, b.id, via)));
    toast(ok ? `${f.name} researched ${b.icon} ${b.name}. Build it at any of its sectors.` : researchBlock(f, b.id, via) ?? 'Not researched.');
  };

  return (
    <Panel id="campaign.tech" title="Research" collapsed extra={faction === undefined && c.factions.length > 1 && (
      <select value={f.id} onChange={(e) => setPicked(e.target.value)} aria-label="Whose tech tree">
        {c.factions.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
    )} lead={
      <div className="tech-head">
        <span className="stat"><b>{f.research ?? 0}</b><span className="muted small">Research</span></span>
        <span className="stat" title="Earned at round end: base, research stations and Nexus Observatories">
          <b>+{researchRate(c, f.id)}</b><span className="muted small">a round</span>
        </span>
        <span className="stat" title="Guardian loot: research any open tech for free"><b>{f.blueprints ?? 0}</b><span className="muted small">Blueprints</span></span>
        {(f.archives ?? 0) > 0 && (
          <span className="stat" title="From a Lost Archive: research any one tech for free, ignoring its requirements"><b>{f.archives}</b><span className="muted small">Archive unlocks</span></span>
        )}
        <span className="stat" title="Guardian loot: install on a planet from its map panel"><b>{f.cores ?? 0}</b><span className="muted small">Building Expansions</span></span>
        <span className="stat"><b>{known}/{BUILDINGS.length}</b><span className="muted small">buildings known</span></span>
      </div>
    }>
      <p className="muted small">
        Tier 1 buildings are known from the start. A tier 2 building costs {NEXUS_TECH.cost[2]} Research and tier 3 costs {NEXUS_TECH.cost[3]},
        once the buildings it needs are known. Build researched buildings at any of {f.name}'s sectors from the sector's map panel.
      </p>
      <div className="tech-tree" style={{ gridTemplateColumns: `3rem repeat(${TECH_BRANCHES.length}, minmax(10rem, 1fr))` }}>
        <span />
        {TECH_BRANCHES.map((br) => (
          <div key={br.id} className="tech-branch" title={br.desc}><span className="tech-icon"><Glyph g={br.icon} /></span> {br.name}</div>
        ))}
        {TIERS.map((tier) => (
          <TierRow key={tier} tier={tier}>
            {TECH_BRANCHES.map((br) => (
              <div key={br.id} className="tech-cell">
                {BUILDINGS.filter((b) => b.branch === br.id && b.tier === tier).map((b) => {
                  const st = techStatus(f, b);
                  const why = researchBlock(f, b.id);
                  const whyBp = researchBlock(f, b.id, 'blueprint');
                  const archive = st !== 'known' && (f.archives ?? 0) > 0;
                  return (
                    <div key={b.id} className={`tech-card ${st}`}>
                      <div className="tech-name">
                        <span><Glyph g={b.icon} /> {b.name}</span>
                        {st === 'known' ? <span className="tag green">known</span> : st === 'open' ? <span className="tag gold">{techCost(b)} <Icon name="g:microscope" /></span> : <span className="tag"><Icon name="l:lock" /></span>}
                      </div>
                      <div className="small">{b.desc}</div>
                      <div className="tech-tags">
                        <span className="tag">{b.cost} Materials{b.shards ? ` + ${b.shards} US` : ''}</span>
                        {b.homeOnly && <span className="tag cyan" title="Can only be built at a home">home only</span>}
                        {b.rule === 'table' && <span className="tag" title="Not applied by the app: remember it at the table">at the table</span>}
                      </div>
                      {st !== 'known' && !!b.requires?.length && (
                        <div className="muted small">Needs {b.requires.map((r) => (
                          <span key={r} className={techStatus(f, BUILDINGS.find((x) => x.id === r)!) === 'known' ? 'tech-met' : undefined}>{nameOf(r)}</span>
                        )).reduce<ReactNode[]>((a, x, i) => (i ? [...a, ' and ', x] : [x]), [])}</div>
                      )}
                      {(st === 'open' || archive) && (
                        <div className="row tech-actions">
                          {st === 'open' && <button className="primary" disabled={!!why} title={why} onClick={() => go(b, 'research')}>Research</button>}
                          {st === 'open' && (f.blueprints ?? 0) > 0 && <button disabled={!!whyBp} title={whyBp ?? 'Spend a Blueprint'} onClick={() => go(b, 'blueprint')}>Blueprint</button>}
                          {archive && <button title="Spend an Archive unlock: ignores requirements" onClick={() => go(b, 'archive')}>Archive</button>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </TierRow>
        ))}
      </div>
    </Panel>
  );
}

function TierRow({ tier, children }: { tier: number; children: ReactNode }) {
  return (
    <>
      <div className="tech-tier" title={tier === 1 ? 'Known from the start' : `${NEXUS_TECH.cost[tier as 2 | 3]} Research each`}>
        <span>Tier</span><b>{'I'.repeat(tier)}</b>
      </div>
      {children}
    </>
  );
}
