import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { uid } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { currentRound, factionName } from '../rules/nexus';
import { NEXUS_DETACHMENTS } from '../rules/nexusData';
import {
  factionForces, plannedPoints, reorganise, reorganisePlan, reorganiseProblems, reorganisedThisRound, supplyLimit, type ReorganisePlan,
} from '../rules/detachments';
import { href } from '../route';
import { Modal, Stepper, confirmAction, toast } from './ui';
import { localDate } from '../model/date';

const COST = NEXUS_DETACHMENTS.reorganiseCost;
const shards = (n: number) => `${n} Umbra Shard${n === 1 ? '' : 's'}`;

/** The faction's forces, and the once-a-round reorganisation that moves Supply, shards and units between them. */
export function DetachmentsBox({ f, c }: { f: Force; c: Campaign }) {
  const { state } = useStore();
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const factionId = f.nexus!.factionId;
  const all = factionForces(state.forces, factionId);
  const mine = all.filter((x) => !cloud.email || !x.owner || x.owner === cloud.email);
  const done = reorganisedThisRound(c, state.forces, factionId);
  const total = mine.reduce((n, x) => n + x.umbraShards, 0);
  return (
    <div className="span-all small">
      <div className="muted">Detachments of {factionName(c, factionId)}</div>
      {all.map((x) => (
        <div key={x.id}>
          {x.id === f.id ? <b>{x.name}</b> : <a href={href.force(x.id)}>{x.name}</a>}
          <span className="muted"> — {supplyLimit(x)} Supply · {x.umbraShards} US{x.owner && x.owner !== cloud.email ? ` · ${x.owner}` : ''}</span>
        </div>
      ))}
      <div className="row" style={{ marginTop: '0.35rem' }}>
        <span className="grow muted">
          {mine.length < 2
            ? 'Link another force to this faction to field a detachment. It starts with no Supply.'
            : done
              ? `Reorganised this round (round ${currentRound(c)}). Again next round.`
              : `Move Supply, shards and units between them once a round, for ${shards(COST)}.`}
        </span>
        <button disabled={mine.length < 2 || done || total < COST} onClick={() => setOpen(true)}>Reorganise…</button>
      </div>
      {open && <ReorganiseModal forces={mine} payer={f.id} c={c} onClose={() => setOpen(false)} />}
    </div>
  );
}

function ReorganiseModal({ forces, payer, c, onClose }: { forces: Force[]; payer: string; c: Campaign; onClose: () => void }) {
  const { update } = useStore();
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

  const apply = () => {
    if (over.length && !confirmAction(`${over.map((f) => f.name).join(', ')} would field more points than their Supply Limit. Reorganise anyway?`)) return;
    const ids = new Set(forces.map((f) => f.id));
    const date = localDate();
    let failed: string[] = [];
    update((d) => {
      failed = reorganise(d.forces.filter((f) => ids.has(f.id)), plan, currentRound(c), date, uid);
    });
    if (failed.length) toast(failed[0], 'error');
    else {
      toast(`Detachments reorganised for ${shards(COST)}.`);
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
                <td className="s-full"><b>{f.name}</b><div className="muted small">now {supplyLimit(f)} Supply · {f.umbraShards} US</div></td>
                <td className="num" data-label="Points"><span className={points[f.id] > plan.supply[f.id] ? 'tag red' : ''}>{points[f.id]}</span></td>
                <td data-label="Supply"><Stepper value={plan.supply[f.id]} step={50} min={0} onChange={(v) => setNum('supply', f.id, v)} /></td>
                <td data-label="US"><Stepper value={plan.us[f.id]} min={0} onChange={(v) => setNum('us', f.id, v)} /></td>
              </tr>
            ))}
            <tr>
              <td className="s-full"><b>Total</b></td>
              <td />
              <td data-label="Supply"><span className={sum(plan.supply) === supplyTotal ? 'muted' : 'tag red'}>{sum(plan.supply)} of {supplyTotal}</span></td>
              <td data-label="US"><span className={sum(plan.us) === usTotal ? 'muted' : 'tag red'}>{sum(plan.us)} of {Math.max(0, usTotal)}</span></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Units</h3>
      {forces.map((f) => {
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
