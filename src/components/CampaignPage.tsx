import { Suspense, useEffect, useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { exportCampaign } from '../model/io';
import type { Campaign, Sector, SectorType } from '../model/types';
import { BENEFITS, ECHOES, SECTOR_TYPES, SECTOR_TYPE_KEYS, benefitOf, factionColor, factionName, ownedSectors, recordSectorGame, removeSectorGame, sectorEffect, sidesOf } from '../rules/nexus';
import { href } from '../route';
import { useCloud } from '../cloud/CloudSync';
import { logFor, type ChronicleEntry } from '../rules/chronicle';
import { placeGuardians, rerollGuardians } from '../rules/guardians';
import { reportFor } from '../rules/report';
import OrdersPanel, { OrdersLockStrip } from './NexusOrders';
import RoundPanel from './RoundPanel';
import TechTreePanel from './TechTree';
import WarlordsPanel from './Warlords';
import DuelsPanel from './Duels';
import JournalPanel from './Journal';
import ChroniclePanel from './Chronicle';
import GameNightPanel from './GameNight';
import BountyBoardPanel, { useBountyPayouts } from './BountyBoard';
import WarRoomPanel from './WarRoom';
import type { Focus } from './HexMap';
import { useImporter } from './importer';
import { BOUNTY } from '../rules/nexusData';
import { Dropzone, Loading, Panel, TextField, confirmAction, toast } from './ui';
import { localDate } from '../model/date';
import { Glyph, Icon } from './Icon';
import { lazyPage } from './lazyPage';

// The map is the page's heaviest part; it loads with the Map tab.
const HexMapPanel = lazyPage(() => import('./HexMap'));

const COLORS = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d', '#8e44ad', '#d35400', '#17a589', '#7f8c8d'];

export function newCampaign(): Campaign {
  return { id: uid(), name: 'Nexus Wars', updatedAt: nowIso(), factions: [], sectors: [], log: [] };
}

/**
 * The campaign page. Players (and the GM, by default) see the war through their faction's eyes: the fogged map, the
 * round, their turn report and the games they know of. The GM's page (gm, #/campaign/gm) has the whole map and every
 * editor and control.
 */
export default function CampaignPage({ gm = false, tab: openTab, at }: { gm?: boolean; tab?: string; at?: string }) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const importFiles = useImporter();
  const c = state.campaign;
  const [recordAt, setRecordAt] = useState<{ sectorId: string; n: number }>({ sectorId: '', n: 0 });
  const [pickedView, setViewAs] = useState<string>();
  const [tab, setTab] = useCampaignTab();
  const [logSeen, setLogSeen] = useState(tab === 'log');
  if (tab === 'log' && !logSeen) setLogSeen(true);
  const [focus, setFocus] = useState<Focus>();
  const showSector = (sectorId: string) => {
    setTab('map');
    setFocus((p) => ({ sectorId, n: (p?.n ?? 0) + 1 }));
  };
  const showGame = (id: string) => {
    setTab('log');
    setTimeout(() => {
      const el = document.getElementById(`log-${id}`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    }, 50);
  };
  const jump = (e: ChronicleEntry) => (e.eventId ? showGame(e.eventId) : e.sectorId && showSector(e.sectorId));
  // A link to a tab (#/campaign/:tab[/:at]): a game to show on the log, a sector on the map.
  useEffect(() => {
    if (!TABS.some((x) => x.id === openTab)) return;
    if (openTab === 'log' && at) showGame(at);
    else if (openTab === 'map' && at) showSector(at);
    else setTab(openTab as CampaignTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTab, at, !!state.campaign]);
  // Signed out, this browser is the GM's own copy.
  const canGm = cloud.isGm || !cloud.email;
  const mine = state.forces.find((f) => f.nexus?.factionId && (!f.owner || f.owner === cloud.email))?.nexus?.factionId;
  const myFaction = c?.factions.some((f) => f.id === mine) ? mine : undefined;
  // The player page's eyes: your faction's, or (for the GM only) any faction's or everything (''). '-' sees nothing.
  const viewAs = canGm ? pickedView ?? myFaction ?? '' : myFaction ?? '-';
  useBountyPayouts(BOUNTY.enabled ? c : undefined, canGm);

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
            <p className="muted">Import the campaign file your GM shared on Drive, then link your force to its faction on the force page.</p>
            {importer}
          </div>
          <div className="panel">
            <div className="panel-title"><h2>Game master</h2></div>
            <p className="muted">Start a campaign, add factions and sectors, and record games as players report them. Export <b>campaign.json</b> to Drive after each change — yours is the master copy.</p>
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
            if (!confirmAction(`Remove "${c.name}" from this browser? GM: export it first.`)) return;
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
          <p>Only the GM can open this page.</p>
          <a className="btn" href={href.campaign()}><Icon name="l:arrow-left" /> Back to the campaign</a>
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
            <div className="crumbs">Nexus Wars · updated {localDate(c.updatedAt)}</div>
            <h1>{c.name}</h1>
          </div>
          <div className="row">
            {canGm && (
              <label className="row small" style={{ gap: '0.35rem' }} data-tip="Whose fog of war the page shows">
                <span className="muted">Viewing as</span>
                <select value={viewAs} onChange={(e) => setViewAs(e.target.value)}>
                  <option value="">Everything</option>
                  {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </label>
            )}
            {canGm && <a className="btn primary" href={href.campaignGm()}>GM controls <Icon name="l:arrow-right" /></a>}
          </div>
        </div>
        <p className="muted small">
          {viewAs === '-'
            ? <>Link a force to a faction on its force page to see the war through its eyes.</>
            : <>The war as {viewAs ? <b>{factionName(c, viewAs)}</b> : 'the GM'} sees it.</>}
          {' '}Pick a sector to see what's known and <b>Start a battle here</b>. Full rules: <a href={href.rules('nexus')}>Rules</a>.
        </p>

        <RoundPanel c={c} gm={false} viewer={fog} />
        <OrdersLockStrip c={c} />
        <CampaignTabs tab={tab} setTab={setTab} />
        {tab === 'map' && (
          <>
            <ReportPanel c={c} viewer={fog} />
            <Suspense fallback={<Loading />}><HexMapPanel c={c} setC={setC} gm={false} fog={viewAs} focus={focus} /></Suspense>
            <OrdersPanel c={c} />
            {viewAs !== '-' && <TechTreePanel c={c} setC={setC} faction={viewAs || undefined} />}
          </>
        )}
        {tab === 'warlord' && (viewAs !== '-'
          ? <WarlordsPanel c={c} setC={setC} faction={viewAs || undefined} gm={canGm} />
          : <div className="panel"><p className="muted">Link a force to a faction on its force page to see your Warlord.</p></div>)}
        {tab === 'duels' && (
          <>
            <DuelsPanel c={c} setC={setC} me={viewAs && viewAs !== '-' ? viewAs : undefined} gm={canGm} />
            <JournalPanel c={c} setC={setC} me={viewAs && viewAs !== '-' ? viewAs : undefined} gm={canGm} />
          </>
        )}
        {tab === 'chronicle' && <ChroniclePanel c={c} viewer={fog} onJump={jump} />}
        {tab === 'night' && <GameNightPanel c={c} setC={setC} me={viewAs && viewAs !== '-' ? viewAs : undefined} gm={canGm} />}
        {tab === 'bounties' && <BountyBoardPanel c={c} setC={setC} gm={false} />}
        {tab === 'stats' && <WarRoomPanel c={c} />}
        {tab === 'log' && <LogPanel c={c} setC={setC} viewer={fog} />}
        {footer}
      </>
    );
  }

  const guard = () => {
    let placed: Sector[] = [];
    setC((d) => void (placed = placeGuardians(d, state.books, state.forces, Math.random, uid)));
    toast(placed.length
      ? `Guardians placed: ${placed.map((s) => s.name).join(', ')}.`
      : "No new guardians: every site has already rolled for one, or Void Echoes isn't imported.");
  };
  const reguard = () => {
    if (!confirmAction('Re-roll every guardian? Each AI-held site loses its guardian (and its relic) and rolls again.')) return;
    let placed: Sector[] = [];
    setC((d) => void (placed = rerollGuardians(d, state.books, state.forces, Math.random, uid)));
    toast(placed.length ? `Guardians re-rolled: ${placed.map((s) => s.name).join(', ')}.` : 'Guardians re-rolled: none this time.');
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Nexus Wars · GM · updated {localDate(c.updatedAt)}</div>
          <h1><TextField value={c.name} onCommit={(v) => setC((d) => void (d.name = v || 'Nexus Wars'))} /></h1>
        </div>
        <div className="row">
          <a className="btn" href={href.campaign()}><Icon name="l:arrow-left" /> Player view</a>
          <button onClick={guard} data-tip="Roll for a guardian at each AI-held planet, station, anomaly, void sector and Lost Archive that hasn't rolled yet (round end does this too)">Place guardians</button>
          <button onClick={reguard} data-tip="Remove every guardian and roll each AI-held site again">Re-roll guardians</button>
          <button className="primary" onClick={() => exportCampaign(c)}>Export campaign.json</button>
        </div>
      </div>
      <p className="muted small">
        Your campaign.json is the master copy: players import it and report games to you.
        End the round once the group has played; players then claim sector income on their force pages. Match rewards come with each recorded battle.
        Pick a sector and <b>Start a battle here</b>; the result goes into the log and the map.
        Full rules: <a href={href.rules('nexus')}>Rules</a>.
      </p>

      <RoundPanel c={c} />
      <OrdersLockStrip c={c} />
      <CampaignTabs tab={tab} setTab={setTab} />
      {tab === 'map' && (
        <>
          <ReportPanel c={c} />
          <FactionsPanel c={c} setC={setC} />
          <Suspense fallback={<Loading />}><HexMapPanel c={c} setC={setC} focus={focus} onRecord={(sectorId) => {
            setRecordAt((p) => ({ sectorId, n: p.n + 1 }));
            setTab('log');
            setTimeout(() => document.getElementById('record-game')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
          }} /></Suspense>
          <OrdersPanel c={c} />
          <TechTreePanel c={c} setC={setC} />
          <SectorsPanel c={c} setC={setC} />
        </>
      )}
      {tab === 'warlord' && <WarlordsPanel c={c} setC={setC} gm />}
      {tab === 'duels' && (
        <>
          <DuelsPanel c={c} setC={setC} gm />
          <JournalPanel c={c} setC={setC} gm />
        </>
      )}
      {tab === 'chronicle' && <ChroniclePanel c={c} onJump={jump} />}
      {tab === 'night' && <GameNightPanel c={c} setC={setC} gm />}
      {tab === 'bounties' && <BountyBoardPanel c={c} setC={setC} gm />}
      {tab === 'stats' && <WarRoomPanel c={c} />}
      {/* Kept mounted once opened, so a half-filled record survives a look at another tab. */}
      {logSeen && (
        <div className="cols-2" style={tab === 'log' ? undefined : { display: 'none' }}>
          <RecordPanel c={c} setC={setC} preset={recordAt} />
          <LogPanel c={c} setC={setC} />
        </div>
      )}
      {footer}
    </>
  );
}

type CampaignTab = 'map' | 'warlord' | 'duels' | 'bounties' | 'stats' | 'night' | 'chronicle' | 'log';
const TABS: { id: CampaignTab; label: string }[] = [
  { id: 'map', label: 'Map' },
  { id: 'warlord', label: 'Warlord' },
  { id: 'duels', label: 'Duels & Journal' },
  ...(BOUNTY.enabled ? [{ id: 'bounties' as const, label: 'Bounties' }] : []),
  { id: 'stats', label: 'War Room' },
  { id: 'night', label: 'Game night' },
  { id: 'chronicle', label: 'Chronicle' },
  { id: 'log', label: 'Log' },
];
const TAB_KEY = 'opr-campaign-tab';

/** The campaign page's open tab, remembered per device. */
function useCampaignTab(): [CampaignTab, (t: CampaignTab) => void] {
  const [tab, setTab] = useState<CampaignTab>(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      return TABS.some((x) => x.id === t) ? (t as CampaignTab) : 'map';
    } catch {
      return 'map';
    }
  });
  return [tab, (t) => {
    setTab(t);
    // A link's tab (#/campaign/:tab) would come back on a reload; the page's own tab wins from here.
    if (/^#\/campaign\/(?!gm)/.test(location.hash)) history.replaceState(null, '', href.campaign());
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {
      // Blocked storage: the tab still opens, it just isn't remembered.
    }
  }];
}

function CampaignTabs({ tab, setTab }: { tab: CampaignTab; setTab: (t: CampaignTab) => void }) {
  return (
    <div className="seg campaign-tabs" role="tablist">
      {TABS.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}</button>
      ))}
    </div>
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
            <li key={i} data-tip={sectorName(l.sectorId)}>
              <span className="report-icon" aria-hidden><Glyph g={l.icon} /></span>
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
              {c.factions.map((fa) => {
                const owned = ownedSectors(c, fa.id);
                const linked = state.forces.filter((f) => f.nexus?.factionId === fa.id);
                return (
                  <tr key={fa.id}>
                    <td className="s-end" data-label="Colour"><input type="color" value={fa.color} onChange={(e) => setC((d) => { const x = d.factions.find((y) => y.id === fa.id); if (x) x.color = e.target.value; })} /></td>
                    <td className="s-2" data-label="Faction"><TextField value={fa.name} onCommit={(v) => setC((d) => { const x = d.factions.find((y) => y.id === fa.id); if (x) x.name = v; })} /></td>
                    <td className="s-full" data-label="Player"><TextField value={fa.player} placeholder="Player" onCommit={(v) => setC((d) => { const x = d.factions.find((y) => y.id === fa.id); if (x) x.player = v; })} /></td>
                    <td className="small s-full" data-label="Sectors">
                      {owned.map((s) => <span key={s.id} className={`tag${s.type === 'home' ? ' gold' : ''}`} data-tip={benefitOf(s)?.desc ?? SECTOR_TYPES[s.type].desc}>{s.name}</span>)}
                    </td>
                    <td className="small s-full" data-label="Linked forces here">{linked.map((f) => <a key={f.id} href={href.force(f.id)}>{f.name} </a>)}</td>
                    <td className="s-tail">
                      <button className="ghost icon" aria-label="Remove faction" onClick={() => {
                        if (!confirmAction(`Remove ${fa.name}? Its sectors go unclaimed and its home is deleted.`)) return;
                        setC((d) => {
                          d.factions = d.factions.filter((x) => x.id !== fa.id);
                          d.sectors = d.sectors.filter((s) => !(s.type === 'home' && s.owner === fa.id));
                          for (const s of d.sectors) if (s.owner === fa.id) s.owner = undefined;
                        });
                      }}><Icon name="l:x" /></button>
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
  const setS = (id: string, fn: (s: Sector) => void) => setC((d) => {
    const s = d.sectors.find((x) => x.id === id);
    if (s) fn(s);
  });
  const add = () => setC((d) => void d.sectors.push({ id: uid(), name: `Sector ${d.sectors.length + 1}`, type: 'planet', notes: '' }));
  return (
    <Panel id="campaign.sectors" title="Sectors" extra={<button onClick={add}>+ Add sector</button>}>
      {c.sectors.length === 0 ? <p className="muted small">No sectors yet. Generate a map above, paint sectors on it, or add them here.</p> : (
        <div className="table-wrap">
          <table className="compact stack">
            <thead><tr><th>Name</th><th>Type</th><th>Benefit</th><th>Controlled by</th><th>Flags</th><th>Lore</th><th /></tr></thead>
            <tbody>
              {c.sectors.map((s) => {
                const benefits = BENEFITS.filter((b) => b.type === s.type);
                return (
                  <tr key={s.id}>
                    <td className="s-2" data-label="Name">
                      <TextField value={s.name} onCommit={(v) => setS(s.id, (d) => void (d.name = v))} />
                      {c.map && s.q == null && <span className="muted small" data-tip="Place it from the map"> · off map</span>}
                    </td>
                    <td data-label="Type">
                      <select value={s.type} data-tip={SECTOR_TYPES[s.type].desc} onChange={(e) => setS(s.id, (d) => {
                        d.type = e.target.value as SectorType;
                        if (!BENEFITS.some((b) => b.type === d.type && b.id === d.benefit)) d.benefit = undefined;
                        if (d.type === 'voidspawn') d.owner = ECHOES.id;
                      })}>
                        {SECTOR_TYPE_KEYS.map((t) => <option key={t} value={t}>{SECTOR_TYPES[t].label}</option>)}
                      </select>
                    </td>
                    <td className="s-2" data-label="Benefit">
                      {benefits.length > 0 ? (
                        <select value={s.benefit ?? ''} data-tip={benefitOf(s)?.desc} onChange={(e) => setS(s.id, (d) => void (d.benefit = e.target.value || undefined))}>
                          <option value="">— choose —</option>
                          {benefits.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                      ) : <span className="muted small">{SECTOR_TYPES[s.type].desc}</span>}
                    </td>
                    <td className="s-2" data-label="Controlled by">
                      <span className="row" style={{ flexWrap: 'nowrap' }}>
                        <span style={{ flex: 'none', width: 10, height: 10, borderRadius: 2, background: factionColor(c, s.owner) ?? 'transparent', border: '1px solid currentColor' }} />
                        <select value={s.owner ?? ''} disabled={s.type === 'voidspawn'} onChange={(e) => setS(s.id, (d) => void (d.owner = e.target.value || undefined))}>
                          <option value="">Unclaimed</option>
                          {sidesOf(c).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </span>
                    </td>
                    <td className="small" data-label="Flags">
                      <label className="row" data-tip="Reinforce Sector: +200 supply when defending"><input type="checkbox" checked={!!s.reinforced} onChange={(e) => setS(s.id, (d) => void (d.reinforced = e.target.checked || undefined))} /> Reinforced</label>
                      {s.type === 'void' && <label className="row" data-tip="One-off reward already taken"><input type="checkbox" checked={!!s.rewardClaimed} onChange={(e) => setS(s.id, (d) => void (d.rewardClaimed = e.target.checked || undefined))} /> Claimed</label>}
                    </td>
                    <td className="s-full" data-label="Lore"><TextField value={s.notes} placeholder="Lore, terrain…" onCommit={(v) => setS(s.id, (d) => void (d.notes = v))} /></td>
                    <td className="s-end"><button className="ghost icon" aria-label="Remove sector" onClick={() => setC((d) => void (d.sectors = d.sectors.filter((x) => x.id !== s.id)))}><Icon name="l:x" /></button></td>
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
  const blank = () => ({ date: localDate(), sectorId: '', attacker: '', defender: 'ai', winner: '', notes: '' });
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
          toast('Game recorded. Export campaign.json to share it.');
          setEv(blank());
        }}>Record</button>
      </div>
    </Panel>
  );
}

/** The games played. A player's log (viewer) only has the games their faction fought, or that it could see; '-' sees none. */
function LogPanel({ c, setC, viewer }: { c: Campaign; setC: SetC; viewer?: string }) {
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  const log = useMemo(() => logFor(c, viewer), [c, viewer]);
  return (
    <Panel id="campaign.log" title="Campaign log" extra={<span className="muted small">{log.length} game{log.length === 1 ? '' : 's'}</span>}>
      {log.length === 0 ? <p className="muted small">No games {viewer ? 'you know of ' : ''}yet.</p> : [...log].reverse().map((e) => (
        <div key={e.id} id={`log-${e.id}`} className="list-item small">
          <span className="muted" data-tip={`Round ${e.round ?? 1}`}>R{e.round ?? 1} · {e.date}</span>
          <span className="grow">
            {e.skirmish ? <><Icon name="g:crossed-swords" /> Skirmish: <b>{factionName(c, e.winner)} wins</b>{e.defender === ECHOES.id ? <> a patrol against the {ECHOES.name}</> : ''}</>
              : e.crisis ? <><Icon name="g:crowned-skull" /> Nexus Crisis at <b>{sectorName(e.sectorId)}</b>: {e.winner === ECHOES.id ? <b>the Echo Lord prevails</b> : <b>the factions defeat the Echo Lord</b>}</>
              : e.marauder ? <><Icon name="g:hood" /> <b>{sectorName(e.sectorId)}</b>: {factionName(c, e.attacker)} vs <b>{e.marauder.name}</b> ({e.marauder.strength} Supply) — {e.winner === e.attacker ? <b>the band is broken</b> : <b>the Marauders hold</b>}</>
              : e.spread ? <><Icon name="g:biohazard" /> <b>{factionName(c, e.winner)}</b> spread to <b>{sectorName(e.sectorId)}</b>{e.defender && <> from {factionName(c, e.defender)}</>}</> : <>
              <b>{sectorName(e.sectorId)}</b>: {factionName(c, e.attacker)} vs {factionName(c, e.defender)} —{' '}
              {e.winner ? <b>{factionName(c, e.winner)} wins</b> : 'draw'}
            </>}
            {e.loot && <span data-tip={`Guardian loot (rolled ${e.loot.roll})`}> · <Icon name="g:open-treasure-chest" /> {factionName(c, e.loot.factionId)} looted {e.loot.name}{e.loot.amount ? ` (+${e.loot.amount}${e.loot.id === 'research' ? ' Research' : ' Materials'})` : ''}</span>}
            {e.notes && <span className="muted"> · {e.notes}</span>}
            {e.stories?.map((x) => <div key={x} className="muted small"><Icon name="g:quill-ink" /> {x}</div>)}
          </span>
          {!viewer && <button className="ghost icon" aria-label="Delete log entry"
            data-tip={e.undo ? 'Delete and restore the sector, unless a later game changed it' : 'Delete the entry'}
            onClick={() => confirmAction(`Delete this ${e.crisis ? 'Nexus Crisis battle' : e.skirmish ? 'skirmish' : `${sectorName(e.sectorId)} ${e.spread ? 'spread' : 'game'}`} from the log?${e.undo ? ` The sector goes back to how the ${e.spread ? 'spread' : 'game'} found it.` : ''}`) && setC((d) => removeSectorGame(d, e.id))}><Icon name="l:x" /></button>}
        </div>
      ))}
    </Panel>
  );
}
