import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { exportCampaign } from '../model/io';
import type { Campaign, Sector, SectorType } from '../model/types';
import { BENEFITS, SECTOR_TYPES, SECTOR_TYPE_KEYS, benefitOf, ownedSectors, recordSectorGame } from '../rules/nexus';
import { href } from '../route';
import HexMapPanel from './HexMap';
import { useImporter } from './importer';
import { Dropzone, TextField, confirmAction, toast } from './ui';

const COLORS = ['#c0392b', '#2e86c1', '#27ae60', '#d4ac0d', '#8e44ad', '#d35400', '#17a589', '#7f8c8d'];

export function newCampaign(): Campaign {
  return { id: uid(), name: 'Nexus Wars', updatedAt: nowIso(), factions: [], sectors: [], log: [] };
}

export default function CampaignPage() {
  const { state, update } = useStore();
  const importFiles = useImporter();
  const c = state.campaign;
  const [recordAt, setRecordAt] = useState<{ sectorId: string; n: number }>({ sectorId: '', n: 0 });

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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Nexus Wars · updated {c.updatedAt.slice(0, 10)}</div>
          <h1><TextField value={c.name} onCommit={(v) => setC((d) => void (d.name = v || 'Nexus Wars'))} /></h1>
        </div>
        <div className="row">
          <button className="primary" onClick={() => exportCampaign(c)}>Export campaign.json</button>
        </div>
      </div>
      <p className="muted small">
        The GM's campaign.json is authoritative: players import the latest copy and report sector games to the GM.
        Benefits from your sectors are applied when you record a battle with a linked force.
      </p>

      <FactionsPanel c={c} setC={setC} />
      <HexMapPanel c={c} setC={setC} onRecord={(sectorId) => {
        setRecordAt((p) => ({ sectorId, n: p.n + 1 }));
        setTimeout(() => document.getElementById('record-game')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      }} />
      <SectorsPanel c={c} setC={setC} />
      <div className="cols-2">
        <RecordPanel c={c} setC={setC} preset={recordAt} />
        <LogPanel c={c} setC={setC} />
      </div>

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
    </>
  );
}

type SetC = (fn: (c: Campaign) => void) => void;

export const factionName = (c: Campaign, id: string | undefined) =>
  id === 'ai' ? 'AI' : c.factions.find((f) => f.id === id)?.name ?? (id ? 'Unknown faction' : 'Unclaimed');

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
    <div className="panel">
      <div className="panel-title">
        <h2>Factions</h2>
        <button onClick={add}>+ Add faction</button>
      </div>
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
    </div>
  );
}

function SectorsPanel({ c, setC }: { c: Campaign; setC: SetC }) {
  const setS = (i: number, fn: (s: Sector) => void) => setC((d) => fn(d.sectors[i]));
  const add = () => setC((d) => void d.sectors.push({ id: uid(), name: `Sector ${d.sectors.length + 1}`, type: 'planet', notes: '' }));
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Sectors</h2>
        <button onClick={add}>+ Add sector</button>
      </div>
      {c.sectors.length === 0 ? <p className="muted small">No sectors yet. Generate a map above, paint sectors onto it, or add them here.</p> : (
        <div className="table-wrap">
          <table className="compact stack">
            <thead><tr><th>Name</th><th>Type</th><th>Benefit</th><th>Controlled by</th><th>Flags</th><th>Lore</th><th /></tr></thead>
            <tbody>
              {c.sectors.map((s, i) => {
                const owner = c.factions.find((f) => f.id === s.owner);
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
                        <span style={{ flex: 'none', width: 10, height: 10, borderRadius: 2, background: owner?.color ?? 'transparent', border: '1px solid currentColor' }} />
                        <select value={s.owner ?? ''} onChange={(e) => setS(i, (d) => void (d.owner = e.target.value || undefined))}>
                          <option value="">Unclaimed</option>
                          {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
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
    </div>
  );
}

function RecordPanel({ c, setC, preset }: { c: Campaign; setC: SetC; preset: { sectorId: string; n: number } }) {
  const blank = () => ({ date: new Date().toISOString().slice(0, 10), sectorId: '', attacker: '', defender: 'ai', winner: '', notes: '' });
  const [ev, setEv] = useState(blank);
  useEffect(() => {
    if (preset.n) setEv((e) => ({ ...e, sectorId: preset.sectorId, defender: c.sectors.find((s) => s.id === preset.sectorId)?.owner ?? 'ai', winner: '' }));
  }, [preset.n]);
  const sector = c.sectors.find((s) => s.id === ev.sectorId);
  const sides = [...c.factions.map((f) => ({ id: f.id, name: f.name })), { id: 'ai', name: 'AI' }];
  const set = (p: Partial<typeof ev>) => setEv({ ...ev, ...p });
  const ready = sector && ev.attacker && ev.defender !== ev.attacker;

  let effect = '';
  if (sector && ev.winner && ev.winner !== 'ai') {
    if (sector.type === 'home') effect = `${factionName(c, ev.winner)} wins the home-sector challenge: the winner gains the loser's faction benefits once; the loser forfeits Nexus benefits for that match. ${sector.name} does not change hands.`;
    else effect = `${factionName(c, ev.winner)} takes control of ${sector.name}.`;
  }

  return (
    <div className="panel" id="record-game">
      <div className="panel-title"><h2>Record a sector game</h2></div>
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
    </div>
  );
}

function LogPanel({ c, setC }: { c: Campaign; setC: SetC }) {
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  return (
    <div className="panel">
      <div className="panel-title"><h2>Campaign log</h2><span className="muted small">{c.log.length} game{c.log.length === 1 ? '' : 's'}</span></div>
      {c.log.length === 0 ? <p className="muted small">No sector games yet.</p> : [...c.log].reverse().map((e) => (
        <div key={e.id} className="list-item small">
          <span className="muted">{e.date}</span>
          <span className="grow">
            <b>{sectorName(e.sectorId)}</b>: {factionName(c, e.attacker)} vs {factionName(c, e.defender)} —{' '}
            {e.winner ? <b>{factionName(c, e.winner)} wins</b> : 'draw'}
            {e.notes && <span className="muted"> · {e.notes}</span>}
          </span>
          <button className="ghost icon" aria-label="Delete log entry" title="Removes the entry only; sector control is not reverted"
            onClick={() => setC((d) => void (d.log = d.log.filter((x) => x.id !== e.id)))}>✕</button>
        </div>
      ))}
    </div>
  );
}
