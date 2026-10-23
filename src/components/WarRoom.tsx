import { useMemo, useState } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import { factionColor, factionName } from '../rules/nexus';
import { forceStats, played, type ForceStats, type Record3 } from '../rules/warRoom';
import { href } from '../route';
import { Panel } from './ui';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const vp = (n?: number) => (n === undefined ? '—' : String(Math.round(n * 10) / 10));
const wld = (r: Record3) => `${r.win}–${r.loss}–${r.draw}`;

/** The War Room: every campaign force's record side by side, and one force's full stats (yours to start with). */
export default function WarRoomPanel({ c }: { c: Campaign }) {
  const { state } = useStore();
  const cloud = useCloud();
  const forces = useMemo(
    () => state.forces.filter((f) => f.nexus && c.factions.some((x) => x.id === f.nexus!.factionId)),
    [state.forces, c.factions],
  );
  const stats = useMemo(
    () => new Map(forces.map((f) => [f.id, forceStats(f, state.battleHistory)])),
    [forces, state.battleHistory],
  );
  const league = [...forces].sort((a, b) => {
    const x = stats.get(a.id)!, y = stats.get(b.id)!;
    return y.winRate - x.winRate || y.record.win - x.record.win || a.name.localeCompare(b.name);
  });
  const mine = forces.find((f) => !f.owner || f.owner === cloud.email);
  const [picked, setPicked] = useState<string>();
  const shown = forces.find((f) => f.id === picked) ?? mine ?? league[0];

  if (forces.length === 0) {
    return <div className="panel"><p className="muted">No force is fighting in this campaign yet: link one to a faction on its force page.</p></div>;
  }
  return (
    <>
      <Panel id="campaign.league" title="War Room">
        <p className="muted small">
          Every force's record from its battle log (patrols aside). VP and unit lines come from games played on the battle tracker.
        </p>
        <div className="table-wrap">
          <table className="compact">
            <thead>
              <tr><th>Force</th><th>Faction</th><th className="num">Games</th><th className="num">W–L–D</th><th className="num">Win rate</th><th className="num" title="Average VP over tracked games">Avg VP</th><th>MVP</th></tr>
            </thead>
            <tbody>
              {league.map((f) => {
                const s = stats.get(f.id)!;
                return (
                  <tr key={f.id} className={f.id === shown?.id ? 'selected' : undefined} style={{ cursor: 'pointer' }} onClick={() => setPicked(f.id)}>
                    <td data-label="Force"><b>{f.name}</b></td>
                    <td data-label="Faction"><span className="swatch" style={{ background: factionColor(c, f.nexus!.factionId) }} /> {factionName(c, f.nexus!.factionId)}</td>
                    <td className="num" data-label="Games">{s.games}</td>
                    <td className="num" data-label="W–L–D">{wld(s.record)}</td>
                    <td className="num" data-label="Win rate">{s.games ? pct(s.winRate) : '—'}</td>
                    <td className="num" data-label="Avg VP">{vp(s.avgVp)}</td>
                    <td data-label="MVP">{s.mvp ? `${s.mvp.name} (${s.mvp.kills})` : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      {shown && (
        <Panel id="campaign.warroom" title={<>{shown.name}</>} extra={
          <span className="row">
            <select value={shown.id} onChange={(e) => setPicked(e.target.value)} aria-label="Force">
              {league.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <a className="btn" href={href.force(shown.id)}>Force page →</a>
          </span>
        }>
          <ForceDetail s={stats.get(shown.id)!} />
        </Panel>
      )}
    </>
  );
}

function ForceDetail({ s }: { s: ForceStats }) {
  if (s.games === 0) return <p className="muted">No battles logged yet.</p>;
  return (
    <>
      <div className="stats">
        <div className="stat"><b>{s.games}</b><span>Games</span></div>
        <div className="stat"><b>{wld(s.record)}</b><span>W–L–D</span></div>
        <div className="stat"><b>{pct(s.winRate)}</b><span>Win rate</span></div>
        <div className="stat" title={`Over ${s.tracked} tracked game${s.tracked === 1 ? '' : 's'}`}><b>{vp(s.avgVp)}</b><span>Avg VP</span></div>
        <div className="stat" title="The best opponent's VP, averaged"><b>{vp(s.avgOppVp)}</b><span>Opp. VP</span></div>
      </div>
      {s.mvp && (
        <p>🏅 <b>MVP: {s.mvp.name}</b> <span className="muted">— {s.mvp.kills} kills in {s.mvp.games} game{s.mvp.games === 1 ? '' : 's'}, wiped {s.mvp.wiped}×</span></p>
      )}

      <div className="cols-2">
        <RecordTable title="By opponent" rows={s.byOpponent} />
        <RecordTable title="By mission" rows={s.byMission} empty="No tracked games yet." />
      </div>

      <h3>Units</h3>
      {s.units.length === 0
        ? <p className="muted small">Unit lines come from games played on the battle tracker.</p>
        : (
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr><th>Unit</th><th className="num">Games</th><th className="num" title="Kill XP from the tracker (kills, in older battles)">Kills</th><th className="num">Wiped</th><th className="num">Kills / game</th></tr>
              </thead>
              <tbody>
                {s.units.map((u) => (
                  <tr key={u.unitId}>
                    <td data-label="Unit">{u.unitId === s.mvp?.unitId ? '🏅 ' : ''}{u.name}</td>
                    <td className="num" data-label="Games">{u.games}</td>
                    <td className="num" data-label="Kills">{u.kills}</td>
                    <td className="num" data-label="Wiped">{u.wiped}</td>
                    <td className="num" data-label="Kills / game">{(u.kills / u.games).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </>
  );
}

function RecordTable({ title, rows, empty }: { title: string; rows: { name: string; record: Record3 }[]; empty?: string }) {
  return (
    <div>
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="muted small">{empty ?? 'Nothing yet.'}</p> : (
        <table className="compact">
          <thead><tr><th /><th className="num">W–L–D</th><th className="num">Win rate</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="num">{wld(r.record)}</td>
                <td className="num">{pct(r.record.win / played(r.record))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
