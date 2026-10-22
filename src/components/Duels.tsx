import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { Campaign, DuelSide, DuelWager, Force, NexusDuel } from '../model/types';
import { useCloud } from '../cloud/CloudSync';
import {
  FACTION_STAKES, agreeDuel, cancelDuel, duelReady, duelsOwed, loserOf, newDuel, payDuel, relicCarriers, roleOf, setWagers, settleDuel,
  wagerIssues, wagerText, type DuelRole,
} from '../rules/duels';
import { factionName } from '../rules/nexus';
import { href } from '../route';
import { Modal, Panel, Stepper, confirmAction, toast } from './ui';

type SetC = (fn: (c: Campaign) => void) => void;
const today = () => new Date().toISOString().slice(0, 10);
const ROLES: DuelRole[] = ['challenger', 'challenged'];

/**
 * Nexus Duels: players challenge each other to a battle away from the map for a wager, haggle over it, and record the
 * result; the stakes then change hands. `me` is the viewer's faction; the GM (`gm`) can act for either side. Pays or
 * collects this browser's own forces' Umbra Shards and relics as soon as a duel they fought is settled.
 */
export default function DuelsPanel({ c, setC, me, gm }: { c: Campaign; setC: SetC; me?: string; gm?: boolean }) {
  const { state, updateForce } = useStore();
  const cloud = useCloud();
  const duels = c.duels ?? [];
  const open = duels.filter((d) => d.status === 'open');
  const settled = duels.filter((d) => d.status === 'settled').reverse();
  const own = state.forces.filter((f) => f.nexus && (!f.owner || f.owner === cloud.email));

  // Pay what our forces lost, and collect what they won (relics wait for the player to pick who carries them).
  const due = own.flatMap((f) => duelsOwed(c, f).filter((d) => loserOf(d)!.forceId === f.id || !loserOf(d)!.wager.relics?.length).map((d) => ({ f, d })));
  const dueKey = due.map(({ f, d }) => `${f.id}:${d.id}`).join();
  useEffect(() => {
    for (const { f, d } of due) {
      const line = payDuel(d, structuredClone(f), today(), () => '');
      if (!line) continue;
      updateForce(f.id, (fd) => void payDuel(d, fd, today(), uid));
      toast(`${f.name} — ${line}`);
    }
  }, [dueKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const canChallenge = gm || !!me;
  return (
    <Panel id="campaign.duels" title="Nexus Duels" collapsed={!open.length} lead={open.length > 0 && (
      <span className="muted small">{open.length} duel{open.length === 1 ? '' : 's'} being arranged.</span>
    )}>
      <p className="muted small">
        Fancy a fight with another player? Challenge their faction to a duel, away from the map, and set what each side puts up.
        Either of you can change the wagers until the result is in, but any change needs both of you to agree again. Play the
        battle as usual (<a href={href.tracker()}>Battle</a>, then record it for XP and rewards), and record the duel's result here:
        the loser's stakes go to the winner. A draw moves nothing.
      </p>
      {canChallenge && <Challenge c={c} setC={setC} me={me} gm={gm} own={own} />}
      {open.map((d) => <DuelCard key={d.id} c={c} setC={setC} d={d} me={me} gm={gm} />)}
      {settled.length > 0 && (
        <>
          <h3>Recent duels</h3>
          <ul className="small">
            {settled.map((d) => <Settled key={d.id} c={c} d={d} own={own} />)}
          </ul>
        </>
      )}
    </Panel>
  );
}

const forcesOf = (forces: Force[], factionId: string) => forces.filter((f) => f.nexus?.factionId === factionId);

/**
 * Challenge another faction. Any faction but your own can be challenged, whether or not its forces are in this
 * browser; you pick your own force, and the other side picks theirs when it sets its wager, if it isn't known here.
 */
function Challenge({ c, setC, me, gm, own }: { c: Campaign; setC: SetC; me?: string; gm?: boolean; own: Force[] }) {
  const { state } = useStore();
  const [from, setFrom] = useState(me ?? '');
  const [picked, setTo] = useState('');
  const [fromForce, setFromForce] = useState('');
  const [toForce, setToForce] = useState('');
  const fromFaction = me ?? from;
  // Switching which faction you're viewing as can make the old pick your own.
  const to = picked === fromFaction ? '' : picked;
  // A player fights with their own forces; the GM, acting for a faction, with any of its forces.
  const mineToPick = forcesOf(gm ? state.forces : own, fromFaction);
  const theirsToPick = forcesOf(state.forces, to);
  const a = mineToPick.find((f) => f.id === fromForce) ?? mineToPick[0];
  const b = theirsToPick.find((f) => f.id === toForce) ?? theirsToPick[0];
  const opponents = c.factions.filter((f) => f.id !== fromFaction);

  const send = () => {
    if (!a || !to) return;
    setC((d) => void newDuel(d, { factionId: fromFaction, forceId: a.id }, { factionId: to, forceId: b?.id ?? '' }, uid(), today()));
    toast(`Challenge sent to ${factionName(c, to)}. Set the wagers next.`);
    setTo('');
    setToForce('');
  };

  if (c.factions.length < 2) return <p className="muted small">Duels need at least two factions.</p>;
  return (
    <div className="row">
      {gm && !me && (
        <select value={from} onChange={(e) => { setFrom(e.target.value); setFromForce(''); setTo(''); }} aria-label="Challenger">
          <option value="">Challenger…</option>
          {c.factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      {fromFaction && !mineToPick.length && <span className="muted small">Link a force to {factionName(c, fromFaction)} to fight a duel.</span>}
      {mineToPick.length > 1 && (
        <select value={a?.id ?? ''} onChange={(e) => setFromForce(e.target.value)} aria-label="Your force">
          {mineToPick.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <select value={to} onChange={(e) => { setTo(e.target.value); setToForce(''); }} aria-label="Opponent" disabled={!fromFaction}>
        <option value="">Challenge…</option>
        {opponents.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      {to && theirsToPick.length > 1 && (
        <select value={b?.id ?? ''} onChange={(e) => setToForce(e.target.value)} aria-label="Their force">
          {theirsToPick.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      )}
      <button className="primary" disabled={!fromFaction || !to || !a} onClick={send}>⚔ Request a duel</button>
    </div>
  );
}

function DuelCard({ c, setC, d, me, gm }: { c: Campaign; setC: SetC; d: NexusDuel; me?: string; gm?: boolean }) {
  const { state } = useStore();
  const [editing, setEditing] = useState(false);
  const mine = roleOf(d, me);
  const involved = gm || !!mine;
  const ready = duelReady(d);
  const forceName = (s: DuelSide) => !s.forceId ? 'force not picked yet' : state.forces.find((f) => f.id === s.forceId)?.name ?? 'a missing force';
  const sideName = (s: DuelSide) => factionName(c, s.factionId);

  const agree = (s: DuelSide, yes: boolean) => setC((x) => void agreeDuel(x.duels!.find((y) => y.id === d.id)!, s.factionId, yes));
  const callOff = () => {
    if (!confirmAction(mine === 'challenged' ? `Decline ${sideName(d.challenger)}'s duel?` : 'Call off this duel?')) return;
    setC((x) => cancelDuel(x, d.id));
  };
  const record = (winner: string) => {
    const loser = winner === d.challenger.factionId ? d.challenged : winner === d.challenged.factionId ? d.challenger : undefined;
    if (!confirmAction(loser ? `${factionName(c, winner)} won the duel? ${sideName(loser)} hands over ${wagerText(loser.wager)}.` : 'The duel was a draw? Nothing changes hands.')) return;
    let ok = false;
    setC((x) => void (ok = settleDuel(x, d.id, winner, today())));
    toast(ok ? 'Duel recorded.' : 'Both sides must agree to the wagers first.', ok ? 'ok' : 'error');
  };

  return (
    <div className="warlord">
      <h3>
        {sideName(d.challenger)} <span className="muted">vs</span> {sideName(d.challenged)}
        <span className="muted small"> — asked {d.date}, round {d.round}</span>
      </h3>
      <div className="cols-2">
        {ROLES.map((r) => {
          const s = d[r];
          const issues = wagerIssues(c, state.forces, s);
          return (
            <div key={r} className="small">
              <div><b>{sideName(s)}</b> <span className="muted">({forceName(s)})</span> {s.agreed ? <span className="tag green">agreed</span> : <span className="tag">waiting</span>}</div>
              <div>Puts up: {wagerText(s.wager)}</div>
              {(mine === r || (gm && !mine)) && (s.agreed
                ? <button className="small" onClick={() => agree(s, false)}>Take back agreement</button>
                : <button className="primary small" disabled={!s.forceId} title={s.forceId ? undefined : 'Pick a force first: Change wagers'} onClick={() => agree(s, true)}>{mine ? 'Agree' : `Agree for ${sideName(s)}`}</button>)}
              {issues.length > 0 && <ul className="issues">{issues.map((i) => <li key={i} className="warn">{i} If it loses, it pays what it has.</li>)}</ul>}
            </div>
          );
        })}
      </div>
      {involved && (
        <div className="row">
          <button onClick={() => setEditing(true)}>Change wagers</button>
          {ready && (
            <>
              <span className="muted small">Result:</span>
              <button className="primary" onClick={() => record(d.challenger.factionId)}>{sideName(d.challenger)} won</button>
              <button className="primary" onClick={() => record(d.challenged.factionId)}>{sideName(d.challenged)} won</button>
              <button onClick={() => record('')}>Draw</button>
            </>
          )}
          <button className="danger" onClick={callOff}>{mine === 'challenged' ? 'Decline' : 'Call off'}</button>
        </div>
      )}
      {!ready && involved && <p className="muted small">The result can be recorded once both sides agree.</p>}
      {editing && <WagerModal c={c} setC={setC} d={d} me={me} onClose={() => setEditing(false)} />}
    </div>
  );
}

function WagerModal({ c, setC, d, me, onClose }: { c: Campaign; setC: SetC; d: NexusDuel; me?: string; onClose: () => void }) {
  const { state } = useStore();
  const [draft, setDraft] = useState<Record<DuelRole, { forceId: string; wager: DuelWager }>>({
    challenger: { forceId: d.challenger.forceId, wager: structuredClone(d.challenger.wager) },
    challenged: { forceId: d.challenged.forceId, wager: structuredClone(d.challenged.wager) },
  });
  const set = (r: DuelRole, p: Partial<{ forceId: string; wager: DuelWager }>) => setDraft({ ...draft, [r]: { ...draft[r], ...p } });
  const setW = (r: DuelRole, p: Partial<DuelWager>) => set(r, { wager: { ...draft[r].wager, ...p } });

  const save = () => {
    setC((x) => void setWagers(x.duels!.find((y) => y.id === d.id)!, draft, me));
    toast(roleOf(d, me) ? 'Wagers changed: your opponent needs to agree again.' : 'Wagers changed: both sides need to agree again.');
    onClose();
  };

  return (
    <Modal title="Wagers" onClose={onClose} wide footer={<><span className="muted small grow">Saving asks both sides to agree again.</span><button onClick={onClose}>Cancel</button><button className="primary" onClick={save}>Save</button></>}>
      <div className="cols-2">
        {ROLES.map((r) => {
          const s = d[r];
          const w = draft[r].wager;
          const forces = forcesOf(state.forces, s.factionId);
          const force = forces.find((f) => f.id === draft[r].forceId);
          const staked = new Set((w.relics ?? []).map((x) => x.id));
          const toggleRelic = (unitId: string, relicId: string) => {
            const unit = force?.units.find((u) => u.id === unitId);
            const relic = unit?.relics.find((x) => x.id === relicId);
            if (!relic) return;
            setW(r, { relics: staked.has(relicId) ? (w.relics ?? []).filter((x) => x.id !== relicId) : [...(w.relics ?? []), { ...relic, unitId }] });
          };
          return (
            <div key={r}>
              <h3>{factionName(c, s.factionId)} puts up</h3>
              {(forces.length > 1 || (forces.length > 0 && !force)) && (
                <label className="row small">Force
                  <select value={draft[r].forceId} onChange={(e) => set(r, { forceId: e.target.value, wager: { ...w, relics: [] } })}>
                    {!force && <option value={draft[r].forceId}>Pick a force…</option>}
                    {forces.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </label>
              )}
              <table className="compact">
                <tbody>
                  <tr><td>Umbra Shards</td><td><Stepper value={w.shards ?? 0} min={0} onChange={(n) => setW(r, { shards: n })} /></td></tr>
                  <tr><td>Materials</td><td><Stepper value={w.materials ?? 0} min={0} step={10} onChange={(n) => setW(r, { materials: n })} /></td></tr>
                  {FACTION_STAKES.map((k) => (
                    <tr key={k.key}><td>{k.name}</td><td><Stepper value={w[k.key] ?? 0} min={0} onChange={(n) => setW(r, { [k.key]: n })} /></td></tr>
                  ))}
                </tbody>
              </table>
              {force?.units.some((u) => u.relics.length) && (
                <div className="small">
                  <div className="muted">Relics</div>
                  {force.units.flatMap((u) => u.relics.map((x) => (
                    <label key={x.id} className="row" style={{ gap: '0.35rem' }}>
                      <input type="checkbox" checked={staked.has(x.id)} onChange={() => toggleRelic(u.id, x.id)} />
                      {x.name} <span className="muted">({x.tier}, {u.name})</span>
                    </label>
                  )))}
                </div>
              )}
              <label className="small">Anything else agreed
                <input value={w.note ?? ''} placeholder="e.g. Buys the next round of drinks" onChange={(e) => setW(r, { note: e.target.value })} />
              </label>
              <ul className="issues">{wagerIssues(c, state.forces, { ...s, ...draft[r] }).map((i) => <li key={i} className="warn">{i}</li>)}</ul>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

function Settled({ c, d, own }: { c: Campaign; d: NexusDuel; own: Force[] }) {
  const { updateForce } = useStore();
  const loser = loserOf(d);
  // A won relic waits here for the winner to pick who carries it.
  const collector = loser ? own.find((f) => f.id !== loser.forceId && duelsOwed(c, f).some((x) => x.id === d.id)) : undefined;
  const carriers = collector ? relicCarriers(collector) : [];
  const [unitId, setUnitId] = useState('');
  const collect = () => {
    if (!collector) return;
    const line = payDuel(d, structuredClone(collector), today(), () => '', unitId || carriers[0]?.id);
    if (!line) return toast('No unit to carry the relic.', 'error');
    updateForce(collector.id, (fd) => void payDuel(d, fd, today(), uid, unitId || carriers[0]?.id));
    toast(line);
  };
  return (
    <li>
      {d.settledOn}: {factionName(c, d.challenger.factionId)} vs {factionName(c, d.challenged.factionId)} —{' '}
      {loser ? <><b>{factionName(c, d.winner!)}</b> won {wagerText(loser.wager)}</> : 'a draw'}.
      {collector && (
        <span className="row" style={{ display: 'inline-flex', marginLeft: '0.5rem' }}>
          <select value={unitId || carriers[0]?.id || ''} onChange={(e) => setUnitId(e.target.value)} aria-label="Relic carrier">
            {carriers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <button className="primary small" disabled={!carriers.length} onClick={collect}>Collect winnings</button>
        </span>
      )}
    </li>
  );
}
