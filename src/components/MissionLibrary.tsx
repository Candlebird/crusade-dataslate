import { useState } from 'react';
import TableMap from './TableMap';
import { deploymentMap, suggestTable } from '../rules/tableMap';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { href } from '../route';
import { OBJECTIVE_ROLLS, SOURCES, allMissions, type MissionDef, type MissionSource, type ObjectiveRoll } from '../rules/missions';
import { Stepper, TextArea, TextField, confirmAction, toast } from './ui';
import { Icon } from './Icon';

// The group's missions. Built-ins come from rules/missions.ts; custom ones are saved here and shared with every player.

export default function MissionLibrary() {
  const { state, update } = useStore();
  const missions = allMissions(state.customMissions);
  const [openId, setOpenId] = useState<string | null>(null);

  const save = (m: MissionDef) => update((d) => {
    const list = (d.customMissions ??= []);
    const next = { ...m, updatedAt: nowIso() };
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = next;
    else list.push(next);
  });
  const duplicate = (m: MissionDef) => {
    const copy: MissionDef = { ...structuredClone(m), id: uid(), name: `${m.name} (copy)`, source: 'Custom' };
    save(copy);
    setOpenId(copy.id);
  };
  const create = () => {
    const m: MissionDef = { id: uid(), name: 'New mission', source: 'Custom', summary: '', rounds: 4, objectives: 'D3+2', scoring: { objectiveVp: 1, when: 'last' }, counters: [], rules: [] };
    save(m);
    setOpenId(m.id);
  };
  const remove = (m: MissionDef) => {
    if (!confirmAction(`Delete the mission "${m.name}" for every player?`)) return;
    update((d) => void (d.customMissions = (d.customMissions ?? []).filter((x) => x.id !== m.id)));
    toast('Mission deleted.');
  };

  const custom = missions.filter((m) => state.customMissions?.some((x) => x.id === m.id));
  // Built-ins in the same groups as the Start a battle list.
  const groups: [string, MissionDef[]][] = [];
  for (const x of missions.filter((m) => !custom.includes(m))) {
    const g = x.source === 'OPR' && x.group ? `OPR · ${x.group}` : x.source;
    const hit = groups.find(([k]) => k === g);
    if (hit) hit[1].push(x);
    else groups.push([g, [x]]);
  }
  const row = (m: MissionDef, mine: boolean) => {
    const editing = openId === m.id && mine;
    if (editing) return (
      <div key={m.id} className="panel">
        <div className="panel-title">
          <h2>{m.name} <span className="tag">{m.source}</span></h2>
          <span className="row">
            <button className="primary" onClick={() => setOpenId(null)}><Icon name="l:check" /> Done</button>
            <button className="danger" onClick={() => remove(m)}>Delete</button>
          </span>
        </div>
        <MissionForm m={m} onChange={save} />
      </div>
    );
    return (
      <details key={m.id} className="mission-row">
        <summary>
          <span className="grow">
            <b>{m.name}</b> <span className="tag">{m.source}</span>{m.roles && <span className="tag">Attacker / Defender</span>}
            <span className="muted small mission-row-sum">{m.summary || 'No summary yet.'}</span>
          </span>
          <span className="muted small">{m.rounds} rounds</span>
        </summary>
        <div className="mission-row-body">
          <div className="row">
            {mine && <button className="primary" onClick={() => setOpenId(m.id)}><Icon name="l:pencil" /> Edit</button>}
            <button onClick={() => duplicate(m)} data-tip={mine ? undefined : 'Make an editable copy of this mission'}>Duplicate{mine ? '' : ' to edit'}</button>
            {mine && <button className="danger" onClick={() => remove(m)}>Delete</button>}
          </div>
          <MissionSummary m={m} />
        </div>
      </details>
    );
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.tracker()}>Battle</a> ›</div>
          <h1>Mission library</h1>
        </div>
        <div className="row"><button className="primary" onClick={create}>+ New mission</button></div>
      </div>
      <p className="muted small">
        Tap a mission to read it. Built-in missions can't be changed: duplicate one to make your own version.
        Your missions are shared with every signed-in player, and a running battle keeps the copy it started with.
      </p>
      <h3 className="start-group">Your missions</h3>
      {custom.length ? custom.map((m) => row(m, true)) : <p className="muted small">None yet. Press + New mission, or duplicate a built-in one below.</p>}
      {groups.map(([group, list]) => (
        <div key={group}>
          <h3 className="start-group">{group}</h3>
          {list.map((m) => row(m, false))}
        </div>
      ))}
    </div>
  );
}

function MissionSummary({ m }: { m: MissionDef }) {
  const map = deploymentMap(m, 1);
  return (
    <>
      <p>{m.summary}</p>
      <p className="small muted">
        {m.rounds} rounds · {m.objectives} objectives · {m.scoring.objectiveVp ? `${m.scoring.objectiveVp} VP per objective ${m.scoring.when === 'every' ? 'every round' : 'at the end'}` : 'objectives score no VP'}
        {m.scoring.mostBonus && ` · +${m.scoring.mostBonus.vp} VP for most markers ${m.scoring.mostBonus.when === 'every' ? 'each round' : 'at the end'}`}
        {m.roles && ' · attacker and defender'}
        {(m.counters ?? []).map((c) => ` · ${c.label} (${c.vp} VP)`).join('')}
      </p>
      {m.deployment && <p className="small"><b>Deployment.</b> {m.deployment}</p>}
      {(m.rules ?? []).map((r, i) => <p key={i} className="small"><b>{r.title}{r.round ? ` (round ${r.round})` : ''}.</b> {r.text}</p>)}
      <p className="small"><b>Table.</b> {suggestTable(1).label} for games under 1250 pts a side, {suggestTable(0).label} for bigger ones. The map shows the smaller table.</p>
      {map && <details><summary className="small">Deployment map</summary><TableMap map={map} /></details>}
    </>
  );
}

function MissionForm({ m, onChange }: { m: MissionDef; onChange: (m: MissionDef) => void }) {
  const set = (fn: (d: MissionDef) => void) => {
    const d = structuredClone(m);
    fn(d);
    onChange(d);
  };
  return (
    <div className="fields">
      <label className="field">
        <span>Name</span>
        <TextField value={m.name} onCommit={(v) => set((d) => void (d.name = v || 'Unnamed mission'))} />
      </label>
      <label className="field">
        <span>Source</span>
        <select value={m.source} onChange={(e) => set((d) => void (d.source = e.target.value as MissionSource))}>
          {SOURCES.map((s) => <option key={s}>{s}</option>)}
        </select>
      </label>
      <label className="field span-all">
        <span>Summary</span>
        <TextArea rows={2} value={m.summary} onCommit={(v) => set((d) => void (d.summary = v))} />
      </label>
      <label className="field span-all">
        <span>Deployment</span>
        <TextArea rows={2} value={m.deployment ?? ''} onCommit={(v) => set((d) => void (d.deployment = v || undefined))} />
      </label>
      <label className="field">
        <span>Rounds</span>
        <Stepper value={m.rounds} min={1} onChange={(n) => set((d) => void (d.rounds = n))} />
      </label>
      <div className="field">
        <span>Objective markers</span>
        <span className="row">
          <select value={typeof m.objectives === 'number' ? 'fixed' : m.objectives} onChange={(e) => set((d) => void (d.objectives = e.target.value === 'fixed' ? 4 : (e.target.value as ObjectiveRoll)))}>
            <option value="fixed">Fixed number</option>
            {OBJECTIVE_ROLLS.map((r) => <option key={r} value={r}>Roll {r}</option>)}
          </select>
          {typeof m.objectives === 'number' && <Stepper value={m.objectives} min={0} onChange={(n) => set((d) => void (d.objectives = n))} />}
        </span>
      </div>
      <label className="field">
        <span>VP per objective held</span>
        <Stepper value={m.scoring.objectiveVp} min={0} onChange={(n) => set((d) => void (d.scoring.objectiveVp = n))} />
      </label>
      <label className="field">
        <span>Objectives score</span>
        <select value={m.scoring.when} onChange={(e) => set((d) => void (d.scoring.when = e.target.value as 'every' | 'last'))}>
          <option value="last">At the end of the game</option>
          <option value="every">At the end of every round</option>
        </select>
      </label>
      <div className="field">
        <span>Bonus VP for holding the most markers</span>
        <span className="row">
          <Stepper value={m.scoring.mostBonus?.vp ?? 0} min={0} onChange={(n) => set((d) => void (d.scoring.mostBonus = n ? { vp: n, when: d.scoring.mostBonus?.when ?? 'last' } : undefined))} />
          {m.scoring.mostBonus && (
            <select value={m.scoring.mostBonus.when} onChange={(e) => set((d) => void (d.scoring.mostBonus!.when = e.target.value as 'every' | 'last'))}>
              <option value="last">At the end</option>
              <option value="every">Every round</option>
            </select>
          )}
        </span>
      </div>
      <label className="field">
        <span>Group</span>
        <TextField value={m.group ?? ''} onCommit={(v) => set((d) => void (d.group = v || undefined))} placeholder="e.g. Face-Off" />
      </label>
      <label className="field row">
        <input type="checkbox" checked={!!m.roles} onChange={(e) => set((d) => void (d.roles = e.target.checked || undefined))} />
        <span>Attacker and defender roles</span>
      </label>

      <div className="field span-all">
        <span>Tallies <span className="muted small">— other things worth VP (relics, slain heroes…)</span></span>
        {(m.counters ?? []).map((c, i) => (
          <div key={c.id} className="row tally">
            <TextField className="grow" value={c.label} onCommit={(v) => set((d) => void (d.counters![i].label = v))} placeholder="Label" />
            <span className="small muted">VP each</span>
            <Stepper value={c.vp} onChange={(n) => set((d) => void (d.counters![i].vp = n))} />
            <span className="small muted">max</span>
            <Stepper value={c.max ?? 0} min={0} onChange={(n) => set((d) => void (d.counters![i].max = n || undefined))} />
            <button className="ghost icon" aria-label="Remove tally" onClick={() => set((d) => void d.counters!.splice(i, 1))}><Icon name="l:x" /></button>
          </div>
        ))}
        <div><button onClick={() => set((d) => void (d.counters ??= []).push({ id: uid(), label: 'New tally', vp: 1 }))}>+ Add tally</button></div>
      </div>

      <div className="field span-all">
        <span>Special rules <span className="muted small">— set a round to show it only then</span></span>
        {(m.rules ?? []).map((r, i) => (
          <div key={i} className="mission-rule">
            <div className="row">
              <TextField className="grow" value={r.title} onCommit={(v) => set((d) => void (d.rules![i].title = v))} placeholder="Title" />
              <span className="small muted">round</span>
              <Stepper value={r.round ?? 0} min={0} onChange={(n) => set((d) => void (d.rules![i].round = n || undefined))} />
              <button className="ghost icon" aria-label="Remove rule" onClick={() => set((d) => void d.rules!.splice(i, 1))}><Icon name="l:x" /></button>
            </div>
            <TextArea rows={2} value={r.text} onCommit={(v) => set((d) => void (d.rules![i].text = v))} />
          </div>
        ))}
        <div><button onClick={() => set((d) => void (d.rules ??= []).push({ title: 'New rule', text: '' }))}>+ Add rule</button></div>
      </div>
    </div>
  );
}
