import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { nowIso, uid } from '../../model/factory';
import { useStore } from '../../model/store';
import { useCloud } from '../../cloud/CloudSync';
import { bankOffTableXp, offTableKey } from '../../rules/downtime';
import { awardFeats, featFaction } from '../../rules/feats';
import { weekKey } from '../../rules/sortie';
import { unitName } from '../../rules/battle';
import { unitPortrait } from '../../model/emblem';
import {
  bankRecords, bossesOf, clearWarpath, clock, DOCTRINES, hardOpen, heroesOf, loadWarpath, newerWarpath, newRun, saveWarpath, warpathFeats, warpathRepeats,
  warpathXp, weekBoard, weekTheme, WARPATH, type WarpathMode, type WarpathRun,
  BRANCHES, BRANCH_IDS, TREE, NODE_IDS, RENOWN, PRESTIGE, HONOURS, metaOf, nodeCost, nodeState, cantTake, takeNode, resetTree, resetValue, bankRenown, laurelsFor,
  prestige, renownLine, type NodeId, type BranchId,
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
  // Each unit is drawn with the emblem its player made for it (as on Training's board).
  const faces = useMemo(() => Object.fromEntries(force.units.map((u) => [u.id, unitPortrait(u, force)])), [force]);
  const palette = useMemo(() => ({ own: faction?.color ?? '#8fc7ff', foe: theme.name.toLowerCase().includes('echo') ? '#b78cff' : '#ff8a6a', faces }), [faction?.color, theme.name, faces]);

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
        out.xp.push(`${unitName(u)} +${got} XP${got < n ? ' (off-table limit)' : ''}`);
      }
      out.records = bankRecords(f, r, date);
      const renown = bankRenown(f, r);
      if (renown > 0) out.records.push(renownLine(renown, f.warpath?.meta?.laurels ?? 0));
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
        onAuto={cloud.isGm || import.meta.env.DEV ? () => { run.auto = true; setAuto(!auto); } : undefined}
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
        Your hero walks; the force fights on its own. Every third level-up calls a unit in (up to {WARPATH.cap.toLocaleString()} pts on the field, the hero counted),
        drill them or take doctrines. A captain comes every 3 minutes and an Echo Lord every 15. Hordes close in without much warning, gold-rimmed elites hit harder, and shrines, caches, aid stations and champions turn up out in the field. The run lasts until the hero falls.
      </p>
      <div className="warpath-start">
        <section>
          <h3>Hero</h3>
          {heroes.length === 0 && <p className="muted">No unit can lead: every unit is out of action.</p>}
          <div className="warpath-heroes">
            {heroes.map((u) => (
              <label key={u.id} className={`warpath-hero${u.id === heroId ? ' on' : ''}`}>
                <input type="radio" name="warpath-hero" checked={u.id === heroId} onChange={() => setHeroId(u.id)} />
                <b>{unitName(u)}</b>
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
      <Armoury force={force} />
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
        <span>{run.points.toLocaleString()} / {WARPATH.cap.toLocaleString()} pts on the field</span>
        {run.mode === 'hard' && <span className="tag red">Hard</span>}
      </div>
      <h3>Damage</h3>
      <div className="warpath-meter">
        {rows.map((s) => (
          <div key={s.unitId} className="warpath-meter-row">
            <span className="warpath-meter-name">{s.name}{s.kind === 'hero' ? ' (hero)' : ''}<span className="muted small">lvl {s.level} · {s.kills.toLocaleString()} kills</span></span>
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

/** The tier captions down a branch. */
const TIER_CAPTION = ['', 'Ranked', 'Ranked', 'Choose one', 'Keystone', 'Capstone · choose one'];

/** The War Council: Renown buys nodes in a four-branch skill tree for this force's Warpath runs; prestige trades the
 *  tree for Laurels and opens its deep tiers. */
function Armoury({ force }: { force: Force }) {
  const { update } = useStore();
  const m = metaOf(force);
  const [pick, setPick] = useState<NodeId>('edge');
  const [sure, setSure] = useState<'' | 'prestige' | 'reset'>('');
  const gain = laurelsFor(m.cycle);
  const back = resetValue(m);
  const edit = (f: (x: Force) => void) => update((d) => {
    const x = d.forces.find((y) => y.id === force.id);
    if (!x) return;
    f(x);
    x.updatedAt = nowIso();
  });
  const take = (id: NodeId) => edit((x) => { takeNode(x, id); });
  const doPrestige = () => {
    setSure('');
    edit((x) => {
      const n = prestige(x);
      if (n) toast(`Prestige ${metaOf(x).prestige}: +${n} Laurel${n === 1 ? '' : 's'}. The War Council starts over.`);
    });
  };
  const doReset = () => {
    setSure('');
    edit((x) => { const n = resetTree(x); toast(`The tree is cleared: ${n.toLocaleString()} Renown back.`); });
  };
  const ranksIn = (b: BranchId) => NODE_IDS.filter((id) => TREE[id].branch === b).reduce((n, id) => n + (m.nodes[id] ?? 0), 0);
  const tint = (b: BranchId) => ({ '--branch': BRANCHES[b].color }) as CSSProperties;
  const node = (id: NodeId) => {
    const t = TREE[id];
    const st = nodeState(m, id);
    const n = m.nodes[id] ?? 0;
    return (
      <button
        type="button"
        className={`wt-node st-${st}${t.key ? ' key' : ''}${pick === id ? ' picked' : ''}`}
        onClick={() => setPick(id)}
        title={`${t.name}: ${t.text(Math.max(1, n))}`}
      >
        <span className="wt-icon"><Icon name={st === 'sealed' ? 'l:lock' : t.icon} /></span>
        <span className="wt-name">{t.name}</span>
        {t.ranks > 1 && <span className="wt-pips">{Array.from({ length: t.ranks }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>}
      </button>
    );
  };
  const p = TREE[pick];
  const pn = m.nodes[pick] ?? 0;
  const why = cantTake(m, pick);
  return (
    <section className="warpath-armoury">
      <h3><Icon name="g:knight-banner" /> War Council</h3>
      <p className="small">
        <b>{m.renown.toLocaleString()} Renown</b>
        {m.prestige > 0 && <> · Prestige {m.prestige} · {m.laurels} Laurel{m.laurels === 1 ? '' : 's'} (+{Math.round(RENOWN.laurel * m.laurels * 100)}% Renown) · Honours +{Math.round(HONOURS.dmg * Math.min(HONOURS.max, m.prestige) * 100)}% damage and hero HP</>}
        <span className="muted"> · Runs earn Renown by minutes, kills and bosses ({RENOWN.hard}× on Hard). The tree only touches this force's Warpath runs.</span>
      </p>
      <div className="wt-tree">
        {BRANCH_IDS.map((b) => (
          <div key={b} className="wt-branch" style={tint(b)}>
            <div className="wt-branch-head">
              <Icon name={BRANCHES[b].icon} /> <b>{BRANCHES[b].name}</b>{ranksIn(b) > 0 && <span className="small"> · {ranksIn(b)}</span>}
              <div className="muted small">{BRANCHES[b].text}</div>
            </div>
            {[1, 2, 3, 4, 5].map((tier) => {
              const ids = NODE_IDS.filter((id) => TREE[id].branch === b && TREE[id].tier === tier);
              const lit = NODE_IDS.some((id) => TREE[id].branch === b && TREE[id].tier === tier - 1 && (m.nodes[id] ?? 0) > 0);
              return (
                <div key={tier} className={`wt-tier${tier > 1 ? ' linked' : ''}${lit ? ' lit' : ''}`}>
                  {tier >= 3 && <span className="wt-caption">{TIER_CAPTION[tier]}</span>}
                  <div className="wt-row">
                    {ids.map((id, i) => <span key={id} className="wt-slot">{i > 0 && <span className="wt-or">or</span>}{node(id)}</span>)}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="wt-detail" style={tint(p.branch)}>
        <div className="wt-detail-head">
          <Icon name={p.icon} /> <b>{p.name}</b>
          <span className="muted small"> · {BRANCHES[p.branch].name}, {TIER_CAPTION[p.tier].toLowerCase()}{p.ranks > 1 ? ` · rank ${pn}/${p.ranks}` : ''}</span>
        </div>
        <div>
          {pn > 0 ? <>Now: <b>{p.text(pn)}</b>{pn < p.ranks && <>. Next rank: {p.text(pn + 1)}</>}.</> : <>{p.text(1)}{p.ranks > 1 ? ' (first rank)' : ''}.</>}
        </div>
        {p.rival && <div className="small muted">A choice: taking it shuts {TREE[p.rival].name} until the tree is reset.</div>}
        <div className="row">
          <button className="primary" disabled={!!why} onClick={() => take(pick)}>
            {pn >= p.ranks ? 'Taken' : `Take for ${nodeCost(pick, pn).toLocaleString()} Renown`}
          </button>
          {why && pn < p.ranks && <span className="small muted">{why}</span>}
        </div>
      </div>
      <p className="small">
        <b>Reset the tree</b> to choose again: {Math.round(PRESTIGE.refund * 100)}% of the Renown spent comes back{back > 0 ? ` (${back.toLocaleString()})` : ''}.
        {' '}<b>Prestige:</b> wipe the tree and the Renown in hand for Laurels. Each Laurel adds {Math.round(RENOWN.laurel * 100)}% to every run's Renown for good; each prestige also gives Honours, +{Math.round(HONOURS.dmg * 100)}% damage and hero HP for good (to prestige {HONOURS.max}). Prestige 1 opens the keystones, prestige 2 the capstones.
        {' '}This cycle: {m.cycle.toLocaleString()} Renown earned{gain > 0 ? `, worth ${gain} Laurel${gain === 1 ? '' : 's'}` : ` (needs ${PRESTIGE.min.toLocaleString()})`}.
      </p>
      <div className="row">
        {sure === 'reset'
          ? <><button className="danger" onClick={doReset}>Clear the tree for {back.toLocaleString()} Renown</button><button onClick={() => setSure('')}>Cancel</button></>
          : sure === 'prestige'
            ? <><button className="danger" onClick={doPrestige}>Prestige: lose the tree and Renown for {gain} Laurel{gain === 1 ? '' : 's'}</button><button onClick={() => setSure('')}>Cancel</button></>
            : <>
              <button disabled={back <= 0} onClick={() => setSure('reset')}>Reset tree</button>
              {gain > 0 && <button onClick={() => setSure('prestige')}><Icon name="g:crown" /> Prestige</button>}
            </>}
      </div>
    </section>
  );
}
