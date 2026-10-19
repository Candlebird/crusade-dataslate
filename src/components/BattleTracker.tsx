import { useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import type { Force } from '../model/types';
import { href } from '../route';
import { AGENDAS, MAX_AGENDAS } from '../rules/data';
import { COMBAT_MANIPULATIONS, MANIPULATION_PREFIX, SECTOR_TYPES } from '../rules/nexus';
import { SEIZE_RULE, allMissions, type MissionDef } from '../rules/missions';
import {
  SIDES,
  cycleHolder,
  held,
  loadForce,
  newBattle,
  nexusNotes,
  nextRound,
  other,
  prevRound,
  roundRules,
  rollObjectives,
  score,
  setHolder,
  setObjectives,
  winner,
  type Holder,
  type SideKey,
  type TrackedBattle,
  type TrackerSide,
  type TrackerUnit,
} from '../rules/tracker';
import { Stepper, TextArea, TextField, confirmAction } from './ui';

const HOLDER_LABEL: Record<Holder, string> = { '': 'Nobody', a: '', b: '', x: 'Contested' };

export default function BattleTracker() {
  const { state, update } = useStore();
  const b = state.battle;
  if (!b) return <StartBattle />;

  const set = (fn: (d: TrackedBattle) => void) => update((s) => void (s.battle && fn(s.battle)));
  const sc = score(b);
  const w = winner(b);
  const last = b.round >= b.mission.rounds;
  const notes = nexusNotes(b, state.campaign, state.forces);
  const holderName = (h: Holder) => (h === 'a' || h === 'b' ? b.sides[h].name : HOLDER_LABEL[h]);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumbs">Battle · {b.mission.source} · started {b.startedAt.slice(0, 10)}</div>
          <h1>{b.mission.name}</h1>
        </div>
        <div className="row">
          <a className="btn" href={href.missions()}>Mission library</a>
          {!b.ended && <button className="primary" onClick={() => set((d) => void (d.ended = true))}>End battle</button>}
          <button className="danger" onClick={() => confirmAction('Throw away this battle?') && update((s) => void delete s.battle)}>Discard</button>
        </div>
      </div>

      {b.ended && <Result b={b} set={set} />}

      <div className="panel scoreboard">
        {SIDES.map((k) => (
          <div key={k} className={`score-side side-${k}${w === k ? ' leading' : ''}`}>
            <div className="small muted">{b.sides[k].name}</div>
            <div className="score-vp">{sc[k].total}</div>
            <div className="small muted">
              VP · {sc[k].objectives} obj{sc[k].counters ? ` · ${sc[k].counters} other` : ''}{b.sides[k].vpAdjust ? ` · ${b.sides[k].vpAdjust > 0 ? '+' : ''}${b.sides[k].vpAdjust} adj` : ''}
            </div>
          </div>
        ))}
        <div className="score-round">
          <div className="small muted">Round</div>
          <div className="score-vp">{b.round}<span className="muted small"> / {b.mission.rounds}</span></div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button disabled={b.round <= 1} onClick={() => set(prevRound)} aria-label="Previous round">◀</button>
            <button className={last ? '' : 'primary'} onClick={() => set(nextRound)}>{last ? 'Extra round' : 'Next round ▶'}</button>
          </div>
        </div>
      </div>

      <div className="cols-main">
        <div className="panel">
          <div className="panel-title">
            <h2>Objectives</h2>
            <span className="row small">
              Markers
              <Stepper value={b.objectives} min={0} onChange={(n) => set((d) => setObjectives(d, n))} />
              {b.mission.objectives === 'D3+2' && <button className="ghost small" onClick={() => set((d) => setObjectives(d, rollObjectives()))} title="Reroll D3+2">🎲</button>}
            </span>
          </div>
          <p className="muted small">
            Tap a marker to change who holds it at the end of round {b.round}. Scored {b.mission.scoring.when === 'every' ? `every round, ${b.mission.scoring.objectiveVp} VP each` : `at the end of the game${b.mission.scoring.objectiveVp !== 1 ? `, ${b.mission.scoring.objectiveVp} VP each` : ''}`}.
          </p>
          <div className="markers">
            {(b.control[b.round - 1] ?? []).map((h, i) => (
              <button key={i} className={`marker holder-${h || 'none'}`} onClick={() => set((d) => setHolder(d, i, cycleHolder(h)))}>
                <span className="marker-n">{i + 1}</span>
                <span className="small">{holderName(h)}</span>
              </button>
            ))}
          </div>
          {b.round > 1 && b.objectives > 0 && (
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Round</th>{SIDES.map((k) => <th key={k} className="num">{b.sides[k].name}</th>)}</tr></thead>
                <tbody>
                  {b.control.slice(0, b.round).map((row, r) => (
                    <tr key={r}><td>{r + 1}</td>{SIDES.map((k) => <td key={k} className="num">{held(row, k)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(b.mission.counters ?? []).length > 0 && (
            <>
              <h3>Mission tallies</h3>
              {b.mission.counters!.map((c) => (
                <div key={c.id} className="tally">
                  <span className="grow">{c.label} <span className="muted small">{c.vp} VP each{c.max ? `, max ${c.max}` : ''}</span></span>
                  {SIDES.map((k) => (
                    <span key={k} className={`side-${k}`}>
                      <Stepper value={b.sides[k].counters[c.id] ?? 0} min={0} onChange={(n) => set((d) => void (d.sides[k].counters[c.id] = c.max ? Math.min(c.max, n) : n))} />
                    </span>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title"><h2>Mission</h2></div>
          <p>{b.mission.summary}</p>
          {b.mission.deployment && <p className="small"><b>Deployment.</b> {b.mission.deployment}</p>}
          {roundRules(b).map((r, i) => (
            <p key={i} className="small"><b>{r.title}{r.round ? ` (round ${r.round})` : ''}.</b> {r.text}</p>
          ))}
          {b.objectives > 0 && !(b.mission.rules ?? []).some((r) => r.text === SEIZE_RULE) && <p className="small muted"><b>Seizing.</b> {SEIZE_RULE}</p>}
          {notes.length > 0 && (
            <>
              <h3>Nexus Wars</h3>
              {notes.map((n) => <p key={n} className="small">{n}</p>)}
            </>
          )}
        </div>
      </div>

      <div className="cols-2">
        {SIDES.map((k) => <SidePanel key={k} k={k} b={b} set={set} forces={state.forces} />)}
      </div>

      <div className="panel">
        <div className="panel-title"><h2>Setup</h2></div>
        <div className="fields">
          <label className="field">
            <span>Opponent</span>
            <label className="row"><input type="checkbox" checked={b.vsAi} onChange={(e) => set((d) => void (d.vsAi = e.target.checked))} /> Player 2 is the AI</label>
          </label>
          {state.campaign && (
            <>
              <label className="field">
                <span>Nexus sector fought over</span>
                <select value={b.sectorId ?? ''} onChange={(e) => set((d) => void (d.sectorId = e.target.value || undefined))}>
                  <option value="">None</option>
                  {state.campaign.sectors.map((s) => <option key={s.id} value={s.id}>{s.name} ({SECTOR_TYPES[s.type].label})</option>)}
                </select>
              </label>
              <label className="field">
                <span>Attacker</span>
                <select value={b.attacker ?? ''} onChange={(e) => set((d) => void (d.attacker = (e.target.value || undefined) as SideKey | undefined))}>
                  <option value="">—</option>
                  {SIDES.map((k) => <option key={k} value={k}>{b.sides[k].name}</option>)}
                </select>
              </label>
            </>
          )}
          <label className="field span-all">
            <span>Notes</span>
            <TextArea value={b.notes} onCommit={(v) => set((d) => void (d.notes = v))} placeholder="Twists, house rules, memorable moments…" />
          </label>
        </div>
      </div>
    </div>
  );
}

type Set = (fn: (d: TrackedBattle) => void) => void;

function StartBattle() {
  const { state, update } = useStore();
  const missions = allMissions(state.customMissions);
  const [id, setId] = useState(missions[0]?.id ?? '');
  const m = missions.find((x) => x.id === id) ?? missions[0];
  const start = (mission: MissionDef) => update((s) => void (s.battle = newBattle(mission, uid(), nowIso())));
  return (
    <div>
      <div className="page-head">
        <div><h1>Battle</h1></div>
        <div className="row"><a className="btn" href={href.missions()}>Mission library</a></div>
      </div>
      <div className="panel">
        <div className="panel-title"><h2>Start a battle</h2></div>
        <p className="muted">Pick a mission, then load each side's force on the next screen. The battle is kept on this device until you discard it.</p>
        <div className="mission-pick">
          {missions.map((x) => (
            <label key={x.id} className={`shop-item${x.id === m?.id ? ' selected' : ''}`}>
              <input type="radio" name="mission" checked={x.id === m?.id} onChange={() => setId(x.id)} />
              <div className="grow">
                <b>{x.name}</b> <span className="tag">{x.source}</span>
                <div className="muted small">{x.summary}</div>
              </div>
            </label>
          ))}
        </div>
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button className="primary" disabled={!m} onClick={() => m && start(m)}>Start battle</button>
        </div>
      </div>
    </div>
  );
}

function Result({ b, set }: { b: TrackedBattle; set: Set }) {
  const sc = score(b);
  const w = winner(b);
  return (
    <div className="panel result-panel">
      <div className="panel-title">
        <h2>{w === 'draw' ? 'Draw' : `${b.sides[w].name} wins`} · {sc.a.total}–{sc.b.total}</h2>
        <button className="ghost" onClick={() => set((d) => void (d.ended = false))}>Resume</button>
      </div>
      <p className="muted small">Record the result in each crusade force's log. The wizard is filled in from this battle: check it, then apply.</p>
      <div className="row">
        {SIDES.map((k) => {
          const s = b.sides[k];
          if (!s.forceId) return <span key={k} className="muted small">{s.name}: no force loaded.</span>;
          if (b.recorded.includes(k)) return <span key={k} className="tag green">{s.name} recorded ✓</span>;
          return <a key={k} className="btn primary" href={href.battle(s.forceId)}>⚔ Record battle for {s.name}</a>;
        })}
      </div>
    </div>
  );
}

function SidePanel({ k, b, set, forces }: { k: SideKey; b: TrackedBattle; set: Set; forces: Force[] }) {
  const { state } = useStore();
  const side = b.sides[k];
  const setSide = (fn: (s: TrackerSide) => void) => set((d) => fn(d.sides[k]));
  const setUnit = (id: string, fn: (u: TrackerUnit) => void) => setSide((s) => { const u = s.units.find((x) => x.id === id); if (u) fn(u); });
  const force = forces.find((f) => f.id === side.forceId);
  const taken = new Set(side.agendas.map((a) => a.name));
  const alive = side.units.filter((u) => !u.destroyed).length;
  const takenForce = b.sides[other(k)].forceId;
  const [adding, setAdding] = useState('');
  const addUnit = () => {
    const name = adding.trim();
    if (!name) return;
    setAdding('');
    setSide((s) => void s.units.push({ id: uid(), name, maxWounds: 1, wounds: 1, shaken: false, activated: false, destroyed: false, kills: 0 }));
  };

  const pickForce = (forceId: string, listId: string) => {
    const f = forces.find((x) => x.id === forceId);
    if (!f) return setSide((s) => Object.assign(s, { forceId: undefined, listId: undefined, units: [], bp: 0, manipulations: [] }));
    set((d) => loadForce(d.sides[k], f, f.lists?.find((l) => l.id === listId), state.settings));
  };

  return (
    <div className={`panel side-panel side-${k}`}>
      <div className="panel-title">
        <h2><TextField value={side.name} onCommit={(v) => setSide((s) => void (s.name = v || (k === 'a' ? 'Player 1' : 'Player 2')))} /></h2>
        <span className="small muted">{side.bp ? `${side.bp} BP · ` : ''}{alive}/{side.units.length} units</span>
      </div>

      <div className="fields">
        <label className="field">
          <span>Crusade force</span>
          <select value={side.forceId ?? ''} onChange={(e) => pickForce(e.target.value, '')}>
            <option value="">None / not tracked</option>
            {forces.map((f) => <option key={f.id} value={f.id} disabled={f.id === takenForce}>{f.name}</option>)}
          </select>
        </label>
        {force && (force.lists ?? []).length > 0 && (
          <label className="field">
            <span>Army list</span>
            <select value={side.listId ?? ''} onChange={(e) => pickForce(force.id, e.target.value)}>
              <option value="">Every active unit</option>
              {force.lists!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>VP adjustment</span>
          <Stepper value={side.vpAdjust} onChange={(n) => setSide((s) => void (s.vpAdjust = n))} />
        </label>
      </div>

      <h3>Agendas <span className="muted small">{side.agendas.length} / {MAX_AGENDAS}</span></h3>
      {side.agendas.map((a, i) => (
        <div key={a.name} className="tally">
          <label className="row grow">
            <input type="checkbox" checked={a.done} onChange={(e) => setSide((s) => void (s.agendas[i].done = e.target.checked))} />
            <span>
              <b>{a.name}</b>
              <div className="muted small">{AGENDAS.find((x) => x.name === a.name)?.desc}</div>
            </span>
          </label>
          <Stepper value={a.count} min={0} onChange={(n) => setSide((s) => void (s.agendas[i].count = n))} />
          <button className="ghost icon" aria-label="Remove agenda" onClick={() => setSide((s) => void s.agendas.splice(i, 1))}>✕</button>
        </div>
      ))}
      {side.agendas.length < MAX_AGENDAS && (
        <select value="" onChange={(e) => e.target.value && setSide((s) => void s.agendas.push({ name: e.target.value, count: 0, done: false }))}>
          <option value="">+ Add an agenda…</option>
          {AGENDAS.filter((a) => !taken.has(a.name)).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
      )}

      <h3>Nexus effects</h3>
      {side.manipulations.length === 0 && <p className="muted small">None this match.</p>}
      {side.manipulations.map((m, i) => (
        <div key={i} className="tally">
          <label className={`row grow${m.used ? ' muted' : ''}`}>
            <input type="checkbox" checked={m.used} onChange={(e) => setSide((s) => void (s.manipulations[i].used = e.target.checked))} />
            <span style={m.used ? { textDecoration: 'line-through' } : undefined}>
              {m.text}
              <div className="muted small">{COMBAT_MANIPULATIONS.find((c) => m.text.includes(c.name))?.desc}</div>
            </span>
          </label>
          <button className="ghost icon" aria-label="Remove" onClick={() => setSide((s) => void s.manipulations.splice(i, 1))}>✕</button>
        </div>
      ))}
      <select value="" onChange={(e) => e.target.value && setSide((s) => void s.manipulations.push({ text: `${MANIPULATION_PREFIX}: ${e.target.value}`, used: false }))}>
        <option value="">+ Add a Combat Manipulation…</option>
        {COMBAT_MANIPULATIONS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>

      <h3>Units</h3>
      {side.units.length === 0 && <p className="muted small">Load a crusade force above, or add units by hand.</p>}
      {side.units.length > 0 && (
        <div className="table-wrap">
          <table className="compact stack tracker-units">
            <thead><tr><th>Unit</th><th className="num">Wounds</th><th>Shaken</th><th>Activated</th><th className="num">Kills</th><th>Destroyed</th></tr></thead>
            <tbody>
              {side.units.map((u) => (
                <tr key={u.id} className={u.destroyed ? 'dead' : u.activated ? 'done' : ''}>
                  <td className="s-2"><b>{u.name}</b></td>
                  <td className="num s-end" data-label="Wounds">
                    <Stepper value={u.wounds} min={0} onChange={(n) => setUnit(u.id, (x) => { if (!x.unitId) x.maxWounds = Math.max(x.maxWounds, n); x.wounds = Math.min(x.maxWounds, n); x.destroyed = x.wounds === 0; })} />
                    <span className="small muted"> / {u.maxWounds}</span>
                  </td>
                  <td data-label="Shaken"><input type="checkbox" checked={u.shaken} onChange={(e) => setUnit(u.id, (x) => void (x.shaken = e.target.checked))} /></td>
                  <td data-label="Activated"><input type="checkbox" checked={u.activated} onChange={(e) => setUnit(u.id, (x) => void (x.activated = e.target.checked))} /></td>
                  <td className="num" data-label="Kills"><Stepper value={u.kills} min={0} onChange={(n) => setUnit(u.id, (x) => void (x.kills = n))} /></td>
                  <td data-label="Destroyed"><input type="checkbox" checked={u.destroyed} onChange={(e) => setUnit(u.id, (x) => { x.destroyed = e.target.checked; if (!x.destroyed && x.wounds === 0) x.wounds = x.maxWounds; })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <input value={adding} placeholder="+ Add a unit by name" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUnit()} onBlur={addUnit} />
        {side.units.some((u) => u.activated) && <button className="ghost small" onClick={() => setSide((s) => s.units.forEach((u) => (u.activated = false)))}>Clear activations</button>}
      </div>
    </div>
  );
}
