import { useMemo, useRef, useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { nowIso, uid } from '../../model/factory';
import { useStore } from '../../model/store';
import { useCloud } from '../../cloud/CloudSync';
import { bankOffTableXp, offTableKey } from '../../rules/downtime';
import { awardFeats, featFaction } from '../../rules/feats';
import { weekKey } from '../../rules/sortie';
import {
  bankRecords, bossesOf, clearWarpath, clock, DOCTRINES, hardOpen, heroesOf, loadWarpath, newerWarpath, newRun, saveWarpath, warpathFeats, warpathRepeats,
  warpathXp, weekBoard, weekTheme, WARPATH, type WarpathMode, type WarpathRun,
} from '../../rules/warpath';
import { FeatList } from '../Feats';
import { Icon } from '../Icon';
import { Modal, toast } from '../ui';
import { WarpathPlay } from './WarpathPlay';
import { useWarpathCloud } from './useWarpathCloud';

// Warpath, from the force page: pick a hero and a mode, play, and see the run's summary. What the run earns banks once
// at its end (XP under the off-table limit, feats, records); a run the bot played (Auto) banks nothing.

/** What the end of a run banked, for its summary. */
interface News { xp: string[]; feats: string[]; records: string[] }

export default function WarpathModal({ force, c, onClose }: { force: Force; c?: Campaign; onClose: () => void }) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const date = localDate();
  const week = weekKey(date);
  const theme = useMemo(() => weekTheme(state.books, week), [state.books, week]);
  const heroes = heroesOf(force);
  const [heroId, setHeroId] = useState(() => heroes[0]?.id ?? '');
  const [mode, setMode] = useState<WarpathMode>('normal');
  const cloudRun = useWarpathCloud(force.id);
  const [local, setLocal] = useState(() => loadWarpath(force.id));
  const saved = newerWarpath(local, cloudRun.saved);
  const [run, setRun] = useState<WarpathRun | null>(null);
  const [over, setOver] = useState<WarpathRun | null>(null);
  const [news, setNews] = useState<News | null>(null);
  const [auto, setAuto] = useState(false);
  const [replace, setReplace] = useState(false);
  const banked = useRef(false);
  const faction = c && force.nexus && c.factions.find((x) => x.id === force.nexus!.factionId);
  const palette = useMemo(() => ({ own: faction?.color ?? '#8fc7ff', foe: theme.name.toLowerCase().includes('echo') ? '#b78cff' : '#ff8a6a' }), [faction?.color, theme.name]);

  const save = (r: WarpathRun) => {
    const s = saveWarpath(r);
    if (s) setLocal(s);
    cloudRun.push(r);
  };

  const start = () => {
    const r = newRun({ force, heroId, books: state.books, campaign: c, mode, date });
    banked.current = false;
    setNews(null);
    setAuto(false);
    setRun(r);
    save(r);
    cloudRun.adopt(r);
  };
  const resume = () => {
    if (!saved) return;
    if (cloudRun.movedOn) toast('This run moved on on another device; picking up its newest save.');
    const r = saved.run;
    banked.current = !!r.banked;
    setAuto(!!r.auto);
    setRun(r);
    cloudRun.adopt(r);
  };

  /** Pay the run out to the force, once. */
  const bank = (r: WarpathRun) => {
    if (banked.current || r.banked) return;
    banked.current = true;
    r.banked = true;
    clearWarpath(force.id);
    setLocal(null);
    cloudRun.drop();
    if (r.auto) {
      toast(`${clock(r.t)} survived. Auto was used: nothing banked.`);
      setNews({ xp: [], feats: [], records: ['Auto was used: nothing banked.'] });
      return;
    }
    const out: News = { xp: [], feats: [], records: [] };
    update((d) => {
      const f = d.forces.find((x) => x.id === force.id);
      if (!f) return;
      const key = offTableKey(c, date);
      const xp = warpathXp(r);
      for (const [id, n] of Object.entries(xp)) {
        const u = f.units.find((x) => x.id === id);
        if (!u) continue;
        const got = bankOffTableXp(u, n, key);
        out.xp.push(`${u.name} +${got} XP${got < n ? ' (off-table limit)' : ''}`);
      }
      out.records = bankRecords(f, r, date);
      const fac = featFaction(f, d.forces, !!c);
      const ids = r.squads.map((s) => s.unitId);
      out.feats = [
        ...awardFeats(f, warpathFeats(r, f.warpath?.kills?.[r.mode] ?? 0), ids, date, uid, fac),
        ...awardFeats(f, warpathRepeats(r), ids, date, uid, fac, key),
      ];
      f.updatedAt = nowIso();
    });
    setNews(out);
    const lines = [...out.xp, ...out.feats, ...out.records];
    if (lines.length) toast(`Warpath: ${lines.join(' · ')}`);
  };

  const finish = (r: WarpathRun) => {
    bank(r);
    setOver(r);
    setRun(null);
  };

  if (run) {
    return (
      <WarpathPlay
        run={run}
        palette={palette}
        auto={auto}
        onAuto={cloud.isGm ? () => { run.auto = true; setAuto(!auto); } : undefined}
        onSave={save}
        onOver={finish}
        onLeave={(r) => { save(r); setRun(null); onClose(); }}
        onQuit={(r) => {
          r.phase = 'over';
          r.log.push(`${clock(r.t)} The run is given up.`);
          finish(r);
        }}
      />
    );
  }

  if (over) return <Summary run={over} news={news} onAgain={() => setOver(null)} onClose={onClose} />;

  const w = force.warpath;
  const board = weekBoard(state.forces, week).slice(0, 8);
  const canHard = hardOpen(force);
  return (
    <Modal title={<><Icon name="g:sprint" /> Warpath</>} onClose={onClose} wide>
      <p className="muted">
        Your hero walks; the force fights on its own. Level up to call units in (up to {WARPATH.cap.toLocaleString()} pts on the field, the hero counted),
        drill them or take doctrines. A captain comes every 5 minutes and an Echo Lord every 15. The run lasts until the hero falls.
      </p>
      <div className="warpath-start">
        <section>
          <h3>Hero</h3>
          {heroes.length === 0 && <p className="muted">No unit can lead: every unit is out of action.</p>}
          <div className="warpath-heroes">
            {heroes.map((u) => (
              <label key={u.id} className={`warpath-hero${u.id === heroId ? ' on' : ''}`}>
                <input type="radio" name="warpath-hero" checked={u.id === heroId} onChange={() => setHeroId(u.id)} />
                <b>{u.name}</b>
                <span className="muted small">Q{u.quality}+ D{u.defense}+{u.tough > 1 ? ` · Tough(${u.tough})` : ''} · {u.weapons.map((x) => x.name).join(', ')}</span>
              </label>
            ))}
          </div>
          <h3>Mode</h3>
          <div className="row">
            <button className={mode === 'normal' ? 'primary' : ''} onClick={() => setMode('normal')}>Normal</button>
            <button className={mode === 'hard' ? 'primary' : ''} disabled={!canHard} onClick={() => setMode('hard')}
              title={canHard ? 'Enemies take and deal 50% more, and come faster' : 'Slay an Echo Lord on Normal to open Hard'}>
              Hard {!canHard && <Icon name="l:lock" />}
            </button>
          </div>
          {!canHard && <p className="muted small">Hard opens once this force slays an Echo Lord on Normal.</p>}
          <p className="small"><b>This week's enemy:</b> {theme.name}</p>
          <div className="row">
            <button className="primary" disabled={!heroId} onClick={() => (saved && !replace ? setReplace(true) : start())}>
              <Icon name="l:play" /> {saved && replace ? 'Start new: the saved run is lost' : 'Start run'}
            </button>
            {saved && <button onClick={resume}><Icon name="l:history" /> Resume ({clock(saved.run.t)}, level {saved.run.level})</button>}
          </div>
        </section>
        <section>
          <h3>Records</h3>
          {(['normal', 'hard'] as const).map((m) => {
            const b = w?.best?.[m];
            return b ? (
              <p key={m} className="small">
                <b>{m === 'hard' ? 'Hard' : 'Normal'}:</b> {b.bosses} boss{b.bosses === 1 ? '' : 'es'}, {clock(b.t)}, {b.kills.toLocaleString()} kills, level {b.level} ({b.hero}, {b.date})
              </p>
            ) : null;
          })}
          {!w?.best && <p className="muted small">No runs yet.</p>}
          {w?.kills && <p className="muted small">Lifetime kills: {(w.kills.normal ?? 0).toLocaleString()}{w.kills.hard ? ` (Hard ${w.kills.hard.toLocaleString()})` : ''}</p>}
          <h3>This week: {theme.name}</h3>
          {board.length === 0 ? <p className="muted small">No runs this week yet.</p> : (
            <ol className="small warpath-board">
              {board.map((b) => (
                <li key={b.force.id} className={b.force.id === force.id ? 'me' : ''}>
                  <b>{b.force.name}</b> · {b.bosses} boss{b.bosses === 1 ? '' : 'es'}, {clock(b.t)}{b.mode === 'hard' ? ' (Hard)' : ''}
                </li>
              ))}
            </ol>
          )}
          <FeatList force={force} where="warpath" c={c} />
          <details className="small">
            <summary>Doctrines</summary>
            <ul>
              {Object.values(DOCTRINES).map((d) => <li key={d.name}><b>{d.name}</b>: {d.text}</li>)}
            </ul>
          </details>
        </section>
      </div>
    </Modal>
  );
}

/** The run's end: time, bosses and kills, each squad's damage, what banked, and the log. */
function Summary({ run, news, onAgain, onClose }: { run: WarpathRun; news: News | null; onAgain: () => void; onClose: () => void }) {
  const total = Math.max(1, run.squads.reduce((n, s) => n + s.dealt, 0));
  const rows = [...run.squads].sort((a, b) => b.dealt - a.dealt);
  return (
    <Modal title={<><Icon name="g:sprint" /> Warpath: the run is over</>} onClose={onClose} wide
      footer={<><button onClick={onClose}>Close</button><button className="primary" onClick={onAgain}>Another run</button></>}>
      <div className="warpath-summary-top">
        <span><Icon name="g:sands-of-time" /> <b>{clock(run.t)}</b></span>
        <span><Icon name="g:crowned-skull" /> <b>{bossesOf(run)}</b> boss{bossesOf(run) === 1 ? '' : 'es'} ({run.lordKills} lord{run.lordKills === 1 ? '' : 's'})</span>
        <span><Icon name="g:skull-crossed-bones" /> <b>{run.kills.toLocaleString()}</b> kills</span>
        <span>Level <b>{run.level}</b></span>
        <span>{run.points}/{WARPATH.cap} pts</span>
        {run.mode === 'hard' && <span className="tag red">Hard</span>}
      </div>
      <h3>Damage</h3>
      <div className="warpath-meter">
        {rows.map((s) => (
          <div key={s.unitId} className="warpath-meter-row">
            <span className="grow">{s.name}{s.kind === 'hero' ? ' (hero)' : ''} <span className="muted small">lvl {s.level} · {s.kills.toLocaleString()} kills</span></span>
            <div className="warpath-meter-bar"><div style={{ width: `${(s.dealt / total) * 100}%` }} /></div>
            <span className="warpath-meter-n">{Math.round(s.dealt).toLocaleString()} ({Math.round((s.dealt / total) * 100)}%)</span>
          </div>
        ))}
      </div>
      {news && (news.xp.length > 0 || news.feats.length > 0 || news.records.length > 0) && (
        <>
          <h3>Banked</h3>
          <ul className="small">
            {[...news.xp, ...news.feats, ...news.records].map((l) => <li key={l}>{l}</li>)}
          </ul>
        </>
      )}
      {news && !news.xp.length && !run.auto && <p className="muted small">No XP: XP comes from slaying bosses (the hero 1 a boss; a unit 1 if it did {Math.round(WARPATH.xpShare * 100)}% of the damage).</p>}
      <details className="small">
        <summary>Run log</summary>
        <ul className="warpath-log">{run.log.map((l, i) => <li key={i}>{l}</li>)}</ul>
      </details>
    </Modal>
  );
}
