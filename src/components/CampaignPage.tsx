import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { exportCampaign } from '../model/io';
import type { Campaign, Sector, SectorType } from '../model/types';
import { BENEFITS, ECHOES, SECTOR_TYPES, SECTOR_TYPE_KEYS, benefitOf, factionColor, factionName, ownedSectors, recordSectorGame, removeSectorGame, sectorEffect, sidesOf } from '../rules/nexus';
import { href } from '../route';
import { useCloud } from '../cloud/CloudSync';
import { rememberedBy, visibleTo } from '../rules/fog';
import { placeGuardians } from '../rules/guardians';
import { reportFor } from '../rules/report';
import HexMapPanel from './HexMap';
import OrdersPanel from './NexusOrders';
import RoundPanel from './RoundPanel';
import TechTreePanel from './TechTree';
import WarlordsPanel from './Warlords';
import DuelsPanel from './Duels';
import { useImporter } from './importer';
import { Dropzone, Panel, TextField, confirmAction, toast } from './ui';

const COLORS = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d', '#8e44ad', '#d35400', '#17a589', '#7f8c8d'];

export function newCampaign(): Campaign {
  return { id: uid(), name: 'Nexus Wars', updatedAt: nowIso(), factions: [], sectors: [], log: [] };
}

/**
 * The campaign page. Players (and the GM, by default) see the war through their faction's eyes: the fogged map, the
 * round, their turn report and the games they know of. The GM's page (gm, #/campaign/gm) has the whole map and every
 * editor and control.
 */
export default function CampaignPage({ gm = false }: { gm?: boolean }) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const importFiles = useImporter();
  const c = state.campaign;
  const [recordAt, setRecordAt] = useState<{ sectorId: string; n: number }>({ sectorId: '', n: 0 });
  const [pickedView, setViewAs] = useState<string>();
  // Signed out, this browser is the GM's own copy.
  const canGm = cloud.isGm || !cloud.email;
  const mine = state.forces.find((f) => f.nexus?.factionId && (!f.owner || f.owner === cloud.email))?.nexus?.factionId;
  const myFaction = c?.factions.some((f) => f.id === mine) ? mine : undefined;
  // The player page's eyes: your faction's, or (for the GM only) any faction's or everything (''). '-' sees nothing.
  const viewAs = canGm ? pickedView ?? myFaction ?? '' : myFaction ?? '-';

  const importer = (
    <Dropzone accept=".json,application/json" onFiles={importFiles}>
      Drop the GM's <b>campaign.json</b> here, or click to choose it.
    </Dropzone>
  );

  if (!c) {
    return (
      <>
        <div className="page-head"><div><h1>Nexus Wars</h1></div></div>
        <div className="cols-2">
          <div className="panel">
            <div className="panel-title"><h2>Player</h2></div>
            <p className="muted">Import the campaign file your GM shared on Drive. Then link your force to its faction on the force page.</p>
            {importer}
          </div>
          <div className="panel">
            <div className="panel-title"><h2>Game master</h2></div>
            <p className="muted">Start a campaign, add the factions and sectors, and record sector games as players report them. Export <b>campaign.json</b> to Drive after each change — your copy is the authoritative one.</p>
            <button className="primary" onClick={() => update((d) => void (d.campaign = newCampaign()))}>New campaign</button>
          </div>
        </div>
      </>
    );
  }

  const setC = (fn: (c: Campaign) => void) =>
    update((d) => {
      if (!d.campaign) return;
      fn(d.campaign);
      d.campaign.updatedAt = nowIso();
    });

  const footer = (
    <div className="cols-2">
      <div className="panel">
        <div className="panel-title"><h3>Update from the GM</h3></div>
        {importer}
      </div>
      <div className="panel">
        <div className="panel-title"><h3>Danger zone</h3></div>
        <button
          className="danger"
          onClick={() => {
            if (!confirmAction(`Remove "${c.name}" from this browser? Export it first if you are the GM.`)) return;
            update((d) => {
              d.campaign = undefined;
              for (const f of d.forces) f.nexus = undefined;
            });
            toast('Campaign removed.');
          }}
        >
          Remove campaign
        </button>
      </div>
    </div>
  );

  if (gm && !canGm) {
    return (
      <>
        <div className="page-head"><div><h1>{c.name}</h1></div></div>
        <div className="panel">
          <p>Only the GM can open the GM's side of the campaign.</p>
          <a className="btn" href={href.campaign()}>← Back to the campaign</a>
        </div>
      </>
    );
  }

  if (!gm) {
    const fog = viewAs || undefined;
    return (
      <>
        <div className="page-head">
          <div>
            <div className="crumbs">Nexus Wars · updated {c.updatedAt.slice(0, 10)}</div>
            <h1>{c.name}</h1>
          </div>
          <div className="row">
            {canGm && (
              <label className="row small" style={{ gap: '0.35rem' }} title="Whose fog of war the page shows">
                <span className="muted">Viewing as</span>
                <select value={viewAs} onChange={(e) => setViewAs(e.target.value)}>
                  <option value="">Everything</option>
                  {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            {canGm && <a className="btn primary" href={href.campaignGm()}>GM controls →</a>}
          </div>
        </div>
        <p className="muted small">
          {viewAs === '-'
            ? <>Link one of your forces to a faction (on its force page) to see the war through its eyes.</>
            : <>The war as {viewAs ? <b>{factionName(c, viewAs)}</b> : 'the GM'} sees it.</>}
          {' '}Pick a sector on the map to see what's known of it, and <b>Start a battle here</b>. The full rules are on the <a href={href.rules('nexus')}>Rules</a> page.
        </p>

        <RoundPanel c={c} gm={false} viewer={fog} />
        <ReportPanel c={c} viewer={fog} />
        <HexMapPanel c={c} setC={setC} gm={false} fog={viewAs} />
        {viewAs !== '-' && <TechTreePanel c={c} setC={setC} faction={viewAs || undefined} />}
        {viewAs !== '-' && <WarlordsPanel c={c} setC={setC} faction={viewAs || undefined} />}
        <DuelsPanel c={c} setC={setC} me={viewAs && viewAs !== '-' ? viewAs : undefined} gm={canGm} />
        <OrdersPanel c={c} />
        <LogPanel c={c} setC={setC} viewer={fog} />
        {footer}
      </>
    );
  }

  const guard = () => {
    let placed: Sector[] = [];
    setC((d) => void (placed = placeGuardians(d, state.books, state.forces, Math.random, uid)));
    toast(placed.length
      ? `Guardians now watch over ${placed.map((s) => s.name).join(', ')}.`
      : "No new guardians: every guardable sector has one, or the Void Echoes book isn't imported.");
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Nexus Wars · GM · updated {c.updatedAt.slice(0, 10)}</div>
          <h1><TextField value={c.name} onCommit={(v) => setC((d) => void (d.name = v || 'Nexus Wars'))} /></h1>
        </div>
        <div className="row">
          <a className="btn" href={href.campaign()}>← Player view</a>
          <button onClick={guard} title="Give every AI-held planet, station, anomaly, void sector and Lost Archive without one a guardian (the round's end does this too)">Place guardians</button>
          <button className="primary" onClick={() => exportCampaign(c)}>Export campaign.json</button>
        </div>
      </div>
      <p className="muted small">
        The GM's campaign.json is authoritative: players import the latest copy and report sector games to the GM.
        The GM ends each round when the group has played; each player then claims their faction's sector income on their force page, and match rewards come with each battle you record.
        The full rules are on the <a href={href.rules('nexus')}>Rules</a> page.
        Pick a sector on the map and <b>Start a battle here</b>: when the battle is finished, its result goes into the log and the map.
      </p>

      <RoundPanel c={c} />
      <ReportPanel c={c} />
      <FactionsPanel c={c} setC={setC} />
      <HexMapPanel c={c} setC={setC} onRecord={(sectorId) => {
        setRecordAt((p) => ({ sectorId, n: p.n + 1 }));
        setTimeout(() => document.getElementById('record-game')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }} />
      <OrdersPanel c={c} />
      <TechTreePanel c={c} setC={setC} />
      <WarlordsPanel c={c} setC={setC} />
      <DuelsPanel c={c} setC={setC} gm />
      <SectorsPanel c={c} setC={setC} />
      <div className="cols-2">
        <RecordPanel c={c} setC={setC} preset={recordAt} />
        <LogPanel c={c} setC={setC} />
      </div>
      {footer}
    </>
  );
}

/** The turn reports: what happened each round, the lines the viewer may read (all of them, with no viewer). */
function ReportPanel({ c, viewer }: { c: Campaign; viewer?: string }) {
  const reports = c.reports ?? [];
  const [pick, setPick] = useState<number>();
  const report = reports.find((r) => r.round === pick) ?? reports[reports.length - 1];
  if (!report) return null;
  const lines = viewer === '-' ? [] : reportFor(report, viewer);
  const sectorName = (id?: string) => (id ? c.sectors.find((s) => s.id === id)?.name : undefined);
  return (
    <Panel id="campaign.report" title={`Turn report: round ${report.round}`} extra={reports.length > 1 && (
      <select value={report.round} onChange={(e) => setPick(Number(e.target.value))} aria-label="Round">
        {[...reports].reverse().map((r) => <option key={r.round} value={r.round}>Round {r.round}</option>)}
      </select>
    )}>
      <div className="muted small">Dispatches from the front, {report.date}{viewer ? ': what your faction saw and did.' : '.'}</div>
      {lines.length === 0 ? <p className="muted small">No news reached you this round.</p> : (
        <ul className="report">
          {lines.map((l, i) => (
            <li key={i} title={sectorName(l.sectorId)}>
              <span className="report-icon" aria-hidden>{l.icon}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

type SetC = (fn: (c: Campaign) => void) => void;

function FactionsPanel({ c, setC }: { c: Campaign; setC: SetC }) {
  const { state } = useStore();
  const add = () =>
    setC((d) => {
      const id = uid();
      const name = `Faction ${d.factions.length + 1}`;
      d.factions.push({ id, name, player: '', color: COLORS[d.factions.length % COLORS.length] });
      d.sectors.push({ id: uid(), name: `${name} Home`, type: 'home', owner: id, notes: '' });
    });
  return (
    <Panel id="campaign.factions" title="Factions" extra={<button onClick={add}>+ Add faction</button>}>
      {c.factions.length === 0 ? <p className="muted small">No factions yet. Each one gets a home sector.</p> : (
        <div className="table-wrap">
          <table className="compact stack">
            <thead><tr><th /><th>Faction</th><th>Player</th><th>Sectors</th><th>Linked forces here</th><th /></tr></thead>
            <tbody>
              {c.factions.map((fa, i) => {
                const owned = ownedSectors(c, fa.id);
                const linked = state.forces.filter((f) => f.nexus?.factionId === fa.id);
                return (
                  <tr key={fa.id}>
                    <td className="s-end" data-label="Colour"><input type="color" value={fa.color} onChange={(e) => setC((d) => void (d.factions[i].color = e.target.value))} /></td>
                    <td className="s-2" data-label="Faction"><TextField value={fa.name} onCommit={(v) => setC((d) => void (d.factions[i].name = v))} /></td>
                    <td className="s-full" data-label="Player"><TextField value={fa.player} placeholder="Player" onCommit={(v) => setC((d) => void (d.factions[i].player = v))} /></td>
                    <td className="small s-full" data-label="Sectors">
                      {owned.map((s) => <span key={s.id} className={`tag${s.type === 'home' ? ' gold' : ''}`} title={benefitOf(s)?.desc ?? SECTOR_TYPES[s.type].desc}>{s.name}</span>)}
                    </td>
                    <td className="small s-full" data-label="Linked forces here">{linked.map((f) => <a key={f.id} href={href.force(f.id)}>{f.name} </a>)}</td>
                    <td className="s-tail">
                      <button className="ghost icon" aria-label="Remove faction" onClick={() => {
                        if (!confirmAction(`Remove ${fa.name}? Its sectors become unclaimed and its home sector is deleted.`)) return;
                        setC((d) => {
                          d.factions = d.factions.filter((x) => x.id !== fa.id);
                          d.sectors = d.sectors.filter((s) => !(s.type === 'home' && s.owner === fa.id));
                          for (const s of d.sectors) if (s.owner === fa.id) s.owner = undefined;
                        });
                      }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function SectorsPanel({ c, setC }: { c: Campaign; setC: SetC }) {
  const setS = (i: number, fn: (s: Sector) => void) => setC((d) => fn(d.sectors[i]));
  const add = () => setC((d) => void d.sectors.push({ id: uid(), name: `Sector ${d.sectors.length + 1}`, type: 'planet', notes: '' }));
  return (
    <Panel id="campaign.sectors" title="Sectors" extra={<button onClick={add}>+ Add sector</button>}>
      {c.sectors.length === 0 ? <p className="muted small">No sectors yet. Generate a map above, paint sectors onto it, or add them here.</p> : (
        <div className="table-wrap">
          <table className="compact stack">
            <thead><tr><th>Name</th><th>Type</th><th>Benefit</th><th>Controlled by</th><th>Flags</th><th>Lore</th><th /></tr></thead>
            <tbody>
              {c.sectors.map((s, i) => {
                const benefits = BENEFITS.filter((b) => b.type === s.type);
                return (
                  <tr key={s.id}>
                    <td className="s-2" data-label="Name">
                      <TextField value={s.name} onCommit={(v) => setS(i, (d) => void (d.name = v))} />
                      {c.map && s.q == null && <span className="muted small" title="Place it from the map"> · off map</span>}
                    </td>
                    <td data-label="Type">
                      <select value={s.type} title={SECTOR_TYPES[s.type].desc} onChange={(e) => setS(i, (d) => {
                        d.type = e.target.value as SectorType;
                        if (!BENEFITS.some((b) => b.type === d.type && b.id === d.benefit)) d.benefit = undefined;
                        if (d.type === 'voidspawn') d.owner = ECHOES.id;
                      })}>
                        {SECTOR_TYPE_KEYS.map((t) => <option key={t} value={t}>{SECTOR_TYPES[t].label}</option>)}
                      </select>
                    </td>
                    <td className="s-2" data-label="Benefit">
                      {benefits.length > 0 ? (
                        <select value={s.benefit ?? ''} title={benefitOf(s)?.desc} onChange={(e) => setS(i, (d) => void (d.benefit = e.target.value || undefined))}>
                          <option value="">— choose —</option>
                          {benefits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : <span className="muted small">{SECTOR_TYPES[s.type].desc}</span>}
                    </td>
                    <td className="s-2" data-label="Controlled by">
                      <span className="row" style={{ flexWrap: 'nowrap' }}>
                        <span style={{ flex: 'none', width: 10, height: 10, borderRadius: 2, background: factionColor(c, s.owner) ?? 'transparent', border: '1px solid currentColor' }} />
                        <select value={s.owner ?? ''} disabled={s.type === 'voidspawn'} onChange={(e) => setS(i, (d) => void (d.owner = e.target.value || undefined))}>
                          <option value="">Unclaimed</option>
                          {sidesOf(c).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </span>
                    </td>
                    <td className="small" data-label="Flags">
                      <label className="row" title="Reinforce Sector: +200 supply when defending"><input type="checkbox" checked={!!s.reinforced} onChange={(e) => setS(i, (d) => void (d.reinforced = e.target.checked || undefined))} /> Reinforced</label>
                      {s.type === 'void' && <label className="row" title="One-off reward already taken"><input type="checkbox" checked={!!s.rewardClaimed} onChange={(e) => setS(i, (d) => void (d.rewardClaimed = e.target.checked || undefined))} /> Claimed</label>}
                    </td>
                    <td className="s-full" data-label="Lore"><TextField value={s.notes} placeholder="Lore, terrain…" onCommit={(v) => setS(i, (d) => void (d.notes = v))} /></td>
                    <td className="s-end"><button className="ghost icon" aria-label="Remove sector" onClick={() => setC((d) => void d.sectors.splice(i, 1))}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function RecordPanel({ c, setC, preset }: { c: Campaign; setC: SetC; preset: { sectorId: string; n: number } }) {
  const blank = () => ({ date: new Date().toISOString().slice(0, 10), sectorId: '', attacker: '', defender: 'ai', winner: '', notes: '' });
  const [ev, setEv] = useState(blank);
  useEffect(() => {
    if (preset.n) setEv((e) => ({ ...e, sectorId: preset.sectorId, defender: c.sectors.find((s) => s.id === preset.sectorId)?.owner ?? 'ai', winner: '' }));
  }, [preset.n]);
  const sector = c.sectors.find((s) => s.id === ev.sectorId);
  const sides = sidesOf(c);
  const set = (p: Partial<typeof ev>) => setEv({ ...ev, ...p });
  const ready = sector && ev.attacker && ev.defender !== ev.attacker;

  const effect = sectorEffect(c, ev);

  return (
    <Panel id="campaign.record" domId="record-game" title="Record a sector game">
      <div className="fields">
        <label className="field">Date<input type="date" value={ev.date} onChange={(e) => set({ date: e.target.value })} /></label>
        <label className="field">
          Sector
          <select value={ev.sectorId} onChange={(e) => {
            const s = c.sectors.find((x) => x.id === e.target.value);
            set({ sectorId: e.target.value, defender: s?.owner ?? 'ai', winner: '' });
          }}>
            <option value="">— choose —</option>
            {c.sectors.map((s) => <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)})</option>)}
          </select>
        </label>
        <label className="field">
          Attacker
          <select value={ev.attacker} onChange={(e) => set({ attacker: e.target.value, winner: '' })}>
            <option value="">— choose —</option>
            {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </label>
        <label className="field">
          Defender
          <select value={ev.defender} onChange={(e) => set({ defender: e.target.value, winner: '' })}>
            {sides.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="field span-all">
          Winner
          <select value={ev.winner} onChange={(e) => set({ winner: e.target.value })} disabled={!ready}>
            <option value="">Draw / no change</option>
            {ready && [ev.attacker, ev.defender].map((id) => <option key={id} value={id}>{factionName(c, id)}</option>)}
          </select>
        </label>
        <label className="field span-all">Notes<input value={ev.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      {effect && <p className="small">{effect}</p>}
      <div className="row">
        <span className="spacer" />
        <button className="primary" disabled={!ready} onClick={() => {
          setC((d) => recordSectorGame(d, { id: uid(), ...ev }));
          toast('Sector game recorded. Export campaign.json to share it.');
          setEv(blank());
        }}>Record</button>
      </div>
    </Panel>
  );
}

/** The games played. A player's log (viewer) only has the games their faction fought, or that it could see; '-' sees none. */
function LogPanel({ c, setC, viewer }: { c: Campaign; setC: SetC; viewer?: string }) {
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  const known = useMemo(() => {
    if (!viewer || viewer === '-') return undefined;
    const seen = visibleTo(c, viewer);
    return new Set([...seen, ...rememberedBy(c, viewer, seen)]);
  }, [c, viewer]);
  const log = viewer === '-' ? [] : !known ? c.log
    : c.log.filter((e) => e.crisis || e.marauder || e.attacker === viewer || e.defender === viewer || e.winner === viewer || known.has(e.sectorId));
  return (
    <Panel id="campaign.log" title="Campaign log" extra={<span className="muted small">{log.length} game{log.length === 1 ? '' : 's'}</span>}>
      {log.length === 0 ? <p className="muted small">No games {viewer ? 'you know of ' : ''}yet.</p> : [...log].reverse().map((e) => (
        <div key={e.id} className="list-item small">
          <span className="muted" title={`Round ${e.round ?? 1}`}>R{e.round ?? 1} · {e.date}</span>
          <span className="grow">
            {e.skirmish ? <>⚔ Skirmish: <b>{factionName(c, e.winner)} wins</b>{e.defender === ECHOES.id ? <> a patrol against the {ECHOES.name}</> : ''}</>
              : e.crisis ? <>☠ Nexus Crisis at <b>{sectorName(e.sectorId)}</b>: {e.winner === ECHOES.id ? <b>the Echo Lord prevails</b> : <b>the factions defeat the Echo Lord</b>}</>
              : e.marauder ? <>🏴 <b>{sectorName(e.sectorId)}</b>: {factionName(c, e.attacker)} vs <b>{e.marauder.name}</b> ({e.marauder.strength} Supply) — {e.winner === e.attacker ? <b>the band is broken</b> : <b>the Marauders hold</b>}</>
              : e.spread ? <>☣ <b>{factionName(c, e.winner)}</b> spread to <b>{sectorName(e.sectorId)}</b>{e.defender && <> from {factionName(c, e.defender)}</>}</> : <>
              <b>{sectorName(e.sectorId)}</b>: {factionName(c, e.attacker)} vs {factionName(c, e.defender)} —{' '}
              {e.winner ? <b>{factionName(c, e.winner)} wins</b> : 'draw'}
            </>}
            {e.loot && <span title={`Guardian loot (rolled ${e.loot.roll})`}> · 🎁 {factionName(c, e.loot.factionId)} looted {e.loot.name}{e.loot.amount ? ` (+${e.loot.amount}${e.loot.id === 'research' ? ' Research' : ' Materials'})` : ''}</span>}
            {e.notes && <span className="muted"> · {e.notes}</span>}
          </span>
          {!viewer && <button className="ghost icon" aria-label="Delete log entry"
            title={e.undo ? 'Delete the entry and put the sector back, unless a later game changed it' : 'Delete the entry'}
            onClick={() => confirmAction(`Delete this ${e.crisis ? 'Nexus Crisis battle' : e.skirmish ? 'skirmish' : `${sectorName(e.sectorId)} ${e.spread ? 'spread' : 'game'}`} from the log?${e.undo ? ` The sector goes back to how the ${e.spread ? 'spread' : 'game'} found it.` : ''}`) && setC((d) => removeSectorGame(d, e.id))}>✕</button>}
        </div>
      ))}
    </Panel>
  );
}
