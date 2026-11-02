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
import {
  capFor, fieldCap, foundFromBank, foundProblem, grantFromBank, grantProblem, pendingGrants, roomFor, transferCost, transferProblem, transferUnit,
} from '../rules/fieldCap';
import { FIELD_CAP } from '../rules/nexusData';

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
          <span className="muted"> — {supplyLimit(x)} / {capFor(c, x)} Supply · {x.umbraShards} <UsAbbr />{x.owner && x.owner !== cloud.email ? ` · ${x.owner}` : ''}</span>
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
      <BankBox c={c} factionId={factionId} all={all} mine={mine} make={make} />
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
  // Supply planned past a detachment's field cap goes to the faction bank when the reorganisation lands.
  const pastCap = forces.filter((f) => plan.supply[f.id] > capFor(c, f));

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
      {(problems.length > 0 || over.length > 0 || pastCap.length > 0) && (
        <ul className="issues">
          {problems.map((p) => <li key={p} className="error">{p}</li>)}
          {pastCap.map((f) => <li key={`cap${f.id}`} className="warn">{f.name}'s cap is {capFor(c, f)}: {plan.supply[f.id] - capFor(c, f)} Supply would go to the faction bank.</li>)}
          {over.map((f) => <li key={f.id} className="warn">{f.name} would field {points[f.id]} pts on {plan.supply[f.id]} Supply.</li>)}
        </ul>
      )}
    </Modal>
  );
}

/**
 * The faction bank (Supply its detachments earned past the field cap), and what to do with it: hand it to a detachment
 * with room, or found a new detachment with it. Also moving one unit between your own detachments.
 */
function BankBox({ c, factionId, all, mine, make }: {
  c: Campaign; factionId: string; all: Force[]; mine: Force[]; make: (name: string) => Force;
}) {
  const { update } = useStore();
  const faction = c.factions.find((x) => x.id === factionId);
  const bank = faction?.bank ?? 0;
  const [to, setTo] = useState(all[0]?.id ?? '');
  const [give, setGive] = useState(100);
  const [name, setName] = useState('');
  const [found, setFound] = useState(FIELD_CAP.foundMin);
  const target = all.find((x) => x.id === to);
  const grantWhy = target ? grantProblem(c, target, give) : 'Pick a detachment.';
  const foundWhy = name.trim() ? foundProblem(c, factionId, found) : 'Name the new detachment.';

  const grant = () => {
    let err: string | undefined;
    update((d) => {
      const dc = d.campaign;
      const f = d.forces.find((x) => x.id === to);
      if (!dc || !f) return;
      err = grantFromBank(dc, f, give, uid);
      if (!err) dc.updatedAt = new Date().toISOString();
    });
    if (err) toast(err, 'error');
    else toast(`${give} Supply from the bank to ${target!.name}.${mine.some((x) => x.id === to) ? '' : ' It lands when its owner next opens the app.'}`);
  };
  const doFound = () => {
    const x = make(name.trim());
    let err: string | undefined;
    update((d) => {
      const dc = d.campaign;
      if (!dc) return;
      err = foundFromBank(dc, x, found, localDate(), uid);
      if (err) return;
      dc.updatedAt = x.updatedAt = new Date().toISOString();
      d.forces.push(x);
    });
    if (err) toast(err, 'error');
    else {
      toast(`${x.name} founded with ${found} Supply from the bank.`);
      setName('');
    }
  };

  if (!faction) return null;
  return (
    <div style={{ marginTop: '0.5rem' }}>
      <div className="muted">
        Faction bank: <b>{bank} Supply</b>. Field cap this round: {fieldCap(c)} a detachment; Supply earned past it lands here.
      </div>
      {bank > 0 && (
        <>
          <div className="row" style={{ marginTop: '0.35rem' }}>
            <select aria-label="Detachment to give bank Supply" value={to} onChange={(e) => setTo(e.target.value)}>
              {all.map((x) => {
                const room = roomFor(c, x) - pendingGrants(c, x);
                return <option key={x.id} value={x.id}>{x.name} (room {Math.max(0, room)})</option>;
              })}
            </select>
            <Stepper value={give} step={50} min={50} onChange={setGive} />
            <button disabled={!!grantWhy} data-tip={grantWhy} onClick={grant}>Give</button>
          </div>
          {bank >= FIELD_CAP.foundMin && (
            <div className="row" style={{ marginTop: '0.35rem' }}>
              <input className="grow" aria-label="New detachment from the bank" placeholder="Found a new detachment" value={name} onChange={(e) => setName(e.target.value)} />
              <Stepper value={found} step={50} min={FIELD_CAP.foundMin} onChange={setFound} />
              <button disabled={!!foundWhy} data-tip={foundWhy} onClick={doFound}>Found</button>
            </div>
          )}
        </>
      )}
      {mine.length > 1 && <TransferRow c={c} mine={mine} all={all} />}
    </div>
  );
}

/** Move one unit between two of your detachments: free in one sector, otherwise Umbra Shards. It arrives Battle-Worn. */
function TransferRow({ c, mine, all }: { c: Campaign; mine: Force[]; all: Force[] }) {
  const { update } = useStore();
  const [fromId, setFrom] = useState(mine[0].id);
  const from = mine.find((x) => x.id === fromId) ?? mine[0];
  const others = mine.filter((x) => x.id !== from.id);
  const [toId, setToId] = useState(others[0]?.id ?? '');
  const to = others.find((x) => x.id === toId) ?? others[0];
  const units = from.units.filter((u) => u.status !== 'removed');
  const [unitId, setUnit] = useState('');
  const unit = units.find((u) => u.id === unitId) ?? units[0];
  if (!to) return null;
  const cost = transferCost(c, from, to);
  const why = unit ? transferProblem(c, all, from, to, unit.id) : `${from.name} has no units.`;
  const send = () => {
    let err: string | undefined;
    update((d) => {
      const dc = d.campaign;
      const a = d.forces.find((x) => x.id === from.id);
      const b = d.forces.find((x) => x.id === to.id);
      if (!dc || !a || !b) return;
      err = transferUnit(dc, d.forces, a, b, unit!.id, localDate(), uid);
      if (!err) a.updatedAt = b.updatedAt = new Date().toISOString();
    });
    if (err) toast(err, 'error');
    else toast(`${unit!.name || unit!.unitType} moved to ${to.name}${cost ? ` for ${shards(cost)}` : ''}. It fights Battle-Worn this round.`);
  };
  return (
    <div className="row" style={{ marginTop: '0.35rem' }}>
      <span className="muted">Send</span>
      <select aria-label="Unit to send" value={unit?.id ?? ''} onChange={(e) => setUnit(e.target.value)}>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name || u.unitType} ({u.points})</option>)}
      </select>
      <select aria-label="From detachment" value={from.id} onChange={(e) => { setFrom(e.target.value); setUnit(''); }}>
        {mine.map((x) => <option key={x.id} value={x.id}>from {x.name}</option>)}
      </select>
      <select aria-label="To detachment" value={to.id} onChange={(e) => setToId(e.target.value)}>
        {others.map((x) => <option key={x.id} value={x.id}>to {x.name}</option>)}
      </select>
      <button disabled={!!why} data-tip={why ?? (cost ? `Different sectors: ${shards(cost)}` : 'Same sector: free')} onClick={send}>
        Send{cost ? ` (${cost} US)` : ''}
      </button>
    </div>
  );
}
