import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { newForce, uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { currentRound, emptyNexus, factionName } from '../rules/nexus';
import { NEXUS_DETACHMENTS } from '../rules/nexusData';
import {
  factionForces, plannedPoints, reorganise, reorganisePlan, reorganiseProblems, reorganisedThisRound, supplyLimit, type ReorganisePlan,
} from '../rules/detachments';
import { href } from '../route';
import { Modal, Stepper, UsAbbr, confirmAction, toast } from './ui';
import { localDate } from '../model/date';

const COST = NEXUS_DETACHMENTS.reorganiseCost;
const shards = (n: number) => `${n} Umbra Shard${n === 1 ? '' : 's'}`;

/** The faction's forces, and the once-a-round reorganisation that moves Supply, shards and units between them. */
export function DetachmentsBox({ f, c }: { f: Force; c: Campaign }) {
  const { state } = useStore();
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  // A detachment named on the way in: it joins the faction only when the reorganisation goes through.
  const [first, setFirst] = useState<Force>();
  const factionId = f.nexus!.factionId;
  const all = factionForces(state.forces, factionId);
  const mine = all.filter((x) => !cloud.email || !x.owner || x.owner === cloud.email);
  const done = reorganisedThisRound(c, state.forces, factionId);
  const total = mine.reduce((n, x) => n + x.umbraShards, 0);
  const needNew = mine.length < 2;
  const make = (name: string) => {
    const x = newForce(name);
    x.faction = f.faction;
    x.player = f.player;
    x.armyLink = f.armyLink;
    if (cloud.email) x.owner = cloud.email;
    x.startingSupply = NEXUS_DETACHMENTS.startingSupply;
    x.nexus = emptyNexus(factionId);
    return x;
  };
  const start = (name: string) => {
    setFirst(make(name));
    setNaming(false);
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setFirst(undefined);
  };
  return (
    <div className="span-all small">
      <div className="muted">Detachments of {factionName(c, factionId)}</div>
      {all.map((x) => (
        <div key={x.id}>
          {x.id === f.id ? <b>{x.name}</b> : <a href={href.force(x.id)}>{x.name}</a>}
          <span className="muted"> — {supplyLimit(x)} Supply · {x.umbraShards} <UsAbbr />{x.owner && x.owner !== cloud.email ? ` · ${x.owner}` : ''}</span>
        </div>
      ))}
      <div className="row" style={{ marginTop: '0.35rem' }}>
        <span className="grow muted">
          {done
            ? `Reorganised this round (round ${currentRound(c)}). Again next round.`
            : needNew
              ? `Split off a new detachment: name it, then give it Supply, shards and units, for ${shards(COST)}. Once a round.`
              : `Move Supply, shards and units between them, or split off new detachments, once a round for ${shards(COST)}.`}
        </span>
        <button disabled={done || total < COST}
          data-tip={done ? 'Already reorganised this round' : total < COST ? `Needs ${shards(COST)} across your detachments (they have ${total})` : undefined}
          onClick={() => (needNew ? setNaming(true) : setOpen(true))}>Reorganise…</button>
      </div>
      {naming && <NameModal onNext={start} onClose={() => setNaming(false)} />}
      {open && <ReorganiseModal forces={mine} first={first} make={make} payer={f.id} c={c} onClose={close} />}
    </div>
  );
}

function NameModal({ onNext, onClose }: { onNext: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');
  const next = () => name.trim() && onNext(name.trim());
  return (
    <Modal title="New detachment" onClose={onClose}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!name.trim()} onClick={next}>Next</button></>}>
      <p className="muted small">The new force joins the faction with no Supply. Next, give it Supply, shards and units from this force.</p>
      <label className="field">
        Name
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && next()} />
      </label>
    </Modal>
  );
}

function ReorganiseModal({ forces: existing, first, make, payer, c, onClose }: {
  forces: Force[]; first?: Force; make: (name: string) => Force; payer: string; c: Campaign; onClose: () => void;
}) {
  const { update } = useStore();
  // New detachments: they join the faction only when the reorganisation goes through.
  const [fresh, setFresh] = useState<Force[]>(first ? [first] : []);
  const [newName, setNewName] = useState('');
  const forces = [...existing, ...fresh];
  const isFresh = (id: string) => fresh.some((x) => x.id === id);
  const [plan, setPlan] = useState<ReorganisePlan>(() => {
    const p = reorganisePlan(forces);
    // The cost comes out of this force's shards, or the richest one's if it can't pay.
    const from = (p.us[payer] ?? 0) >= COST ? payer : [...forces].sort((a, b) => b.umbraShards - a.umbraShards)[0].id;
    p.us[from] = Math.max(0, p.us[from] - COST);
    return p;
  });
  const problems = useMemo(() => reorganiseProblems(forces, plan), [forces, plan]);
  const points = useMemo(() => plannedPoints(forces, plan), [forces, plan]);
  const supplyTotal = forces.reduce((n, f) => n + supplyLimit(f), 0);
  const usTotal = forces.reduce((n, f) => n + f.umbraShards, 0) - COST;
  const sum = (r: Record<string, number>) => forces.reduce((n, f) => n + (r[f.id] ?? 0), 0);
  const setNum = (key: 'supply' | 'us', id: string, v: number) => setPlan({ ...plan, [key]: { ...plan[key], [id]: v } });
  const over = forces.filter((f) => points[f.id] > plan.supply[f.id]);

  const add = () => {
    if (!newName.trim()) return;
    const x = make(newName.trim());
    setFresh([...fresh, x]);
    setPlan({ ...plan, supply: { ...plan.supply, [x.id]: 0 }, us: { ...plan.us, [x.id]: 0 } });
    setNewName('');
  };
  // Dropping a new detachment hands its share back to the paying force and sends its units home.
  const drop = (id: string) => {
    const { [id]: s = 0, ...supply } = plan.supply;
    const { [id]: u = 0, ...us } = plan.us;
    supply[payer] = (supply[payer] ?? 0) + s;
    us[payer] = (us[payer] ?? 0) + u;
    setFresh(fresh.filter((x) => x.id !== id));
    setPlan({ supply, us, units: Object.fromEntries(Object.entries(plan.units).filter(([, to]) => to !== id)) });
  };

  const apply = () => {
    if (over.length && !confirmAction(`${over.map((f) => f.name).join(', ')} would field more points than their Supply Limit. Reorganise anyway?`)) return;
    const ids = new Set(existing.map((f) => f.id));
    const date = localDate();
    let failed: string[] = [];
    update((d) => {
      const added = structuredClone(fresh);
      failed = reorganise([...d.forces.filter((f) => ids.has(f.id)), ...added], plan, currentRound(c), date, uid);
      if (!failed.length) d.forces.push(...added);
    });
    if (failed.length) toast(failed[0], 'error');
    else {
      toast(fresh.length
        ? `${fresh.map((x) => x.name).join(', ')} split off for ${shards(COST)}.`
        : `Detachments reorganised for ${shards(COST)}.`);
      onClose();
    }
  };

  return (
    <Modal title="Reorganise detachments" onClose={onClose} wide
      footer={<><span className="muted small grow">Costs {shards(COST)}. Once a round for the whole faction.</span><button onClick={onClose}>Cancel</button><button className="primary" disabled={problems.length > 0} onClick={apply}>Reorganise</button></>}>
      <p className="muted small">
        Split the faction's Supply Limit and Umbra Shards and move units between its forces. Units keep their XP, traits, scars and relics.
      </p>
      <div className="table-wrap">
        <table className="stack">
          <thead><tr><th>Force</th><th className="num">Points</th><th>Supply Limit</th><th>Umbra Shards</th></tr></thead>
          <tbody>
            {forces.map((f) => (
              <tr key={f.id}>
                <td className="s-full">
                  <b>{f.name}</b>
                  {isFresh(f.id)
                    ? <div className="muted small">new detachment · <button className="ghost small" onClick={() => drop(f.id)}>Remove</button></div>
                    : <div className="muted small">now {supplyLimit(f)} Supply · {f.umbraShards} <UsAbbr /></div>}
                </td>
                <td className="num" data-label="Points"><span className={points[f.id] > plan.supply[f.id] ? 'tag red' : ''}>{points[f.id]}</span></td>
                <td data-label="Supply"><Stepper value={plan.supply[f.id]} step={50} min={0} onChange={(v) => setNum('supply', f.id, v)} /></td>
                <td data-label="Umbra Shards"><Stepper value={plan.us[f.id]} min={0} onChange={(v) => setNum('us', f.id, v)} /></td>
              </tr>
            ))}
            <tr>
              <td className="s-full"><b>Total</b></td>
              <td />
              <td data-label="Supply"><span className={sum(plan.supply) === supplyTotal ? 'muted' : 'tag red'}>{sum(plan.supply)} of {supplyTotal}</span></td>
              <td data-label="Umbra Shards"><span className={sum(plan.us) === usTotal ? 'muted' : 'tag red'}>{sum(plan.us)} of {Math.max(0, usTotal)}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <input className="grow" aria-label="New detachment name" placeholder="New detachment name" value={newName}
          onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button disabled={!newName.trim()} onClick={add}>+ New detachment</button>
      </div>

      <h3>Units</h3>
      {existing.map((f) => {
        const units = f.units.filter((u) => u.status !== 'removed');
        return (
          <div key={f.id} style={{ marginBottom: '0.5rem' }}>
            <div className="muted small">{f.name}</div>
            {units.length === 0 && <div className="muted small">No units.</div>}
            {units.map((u) => (
              <div key={u.id} className="list-item small">
                <span className="grow"><b>{u.name || u.unitType}</b> <span className="muted">{u.points} pts</span></span>
                <select aria-label={`Where ${u.name || u.unitType} goes`} value={plan.units[u.id] ?? f.id}
                  onChange={(e) => setPlan({ ...plan, units: { ...plan.units, [u.id]: e.target.value } })}>
                  {forces.map((x) => <option key={x.id} value={x.id}>{x.id === f.id ? `Stays in ${x.name}` : `Moves to ${x.name}`}</option>)}
                </select>
              </div>
            ))}
          </div>
        );
      })}
      {(problems.length > 0 || over.length > 0) && (
        <ul className="issues">
          {problems.map((p) => <li key={p} className="error">{p}</li>)}
          {over.map((f) => <li key={f.id} className="warn">{f.name} would field {points[f.id]} pts on {plan.supply[f.id]} Supply.</li>)}
        </ul>
      )}
    </Modal>
  );
}
