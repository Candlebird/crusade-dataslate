import { useEffect, useState } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import { factionName } from '../rules/nexus';
import { HOLD, attackTargets, myFactions, playedFactions, revealOrders, type Declared, type OrderRound, type PlayerOrders } from '../rules/orders';
import { href } from '../route';
import { confirmAction, toast } from './ui';

type Firebase = typeof import('../cloud/firebase');

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Sealed attack orders: every player picks a target (or holds) per faction; the GM reveals them all at once. */
export default function OrdersPanel({ c }: { c: Campaign }) {
  const { state } = useStore();
  const cloud = useCloud();
  const online = cloud.status === 'synced' || cloud.status === 'syncing';
  const [fb, setFb] = useState<Firebase | null>(null);
  const [round, setRound] = useState<OrderRound | null | undefined>(undefined);
  const [orders, setOrders] = useState<PlayerOrders[]>([]);
  const [declared, setDeclared] = useState<Declared[]>([]);

  useEffect(() => {
    if (!online) return;
    let alive = true;
    import('../cloud/firebase').then((m) => alive && setFb(m), console.error);
    return () => void (alive = false);
  }, [online]);

  useEffect(() => {
    setRound(undefined);
    setDeclared([]);
    if (!fb || !online) return;
    const offs = [fb.watchRound(setRound, console.error), fb.watchDeclared(setDeclared, console.error)];
    return () => offs.forEach((o) => o());
  }, [fb, online]);

  // Before the reveal the rules only let you read your own orders; afterwards, everyone's.
  const revealed = !!round?.revealed;
  useEffect(() => {
    setOrders([]);
    if (!fb || !online || !cloud.email) return;
    return fb.watchOrders(revealed ? null : cloud.email, setOrders, console.error);
  }, [fb, online, cloud.email, revealed]);

  const title = <div className="panel-title"><h2>Sealed orders</h2>{round && round.campaignId === c.id && <span className="muted small">Round {round.round}{revealed ? ' · revealed' : ' · open'}</span>}</div>;
  if (!online || !cloud.email) {
    return (
      <div className="panel">
        {title}
        <p className="muted small">Sign in to the campaign to declare sealed attack orders.</p>
      </div>
    );
  }
  if (round === undefined || !fb) return <div className="panel">{title}<p className="muted small">Loading orders…</p></div>;

  const current = round && round.campaignId === c.id ? round : null;
  const fail = (what: string) => (err: unknown) => toast(`Couldn't ${what}: ${errorText(err)}`, 'error');
  const nextRound = () => (round ? round.round + 1 : 1);
  const open = () => fb.setRound({ campaignId: c.id, round: nextRound(), revealed: false }).then(() => toast('Orders are open. Players can now declare.'), fail('open the round'));

  if (!current) {
    return (
      <div className="panel">
        {title}
        <p className="muted small">
          Before each game, every player picks a sector next to their territory to attack, or holds. Nobody sees anyone's picks until the GM reveals them.
        </p>
        {cloud.isGm ? <button className="primary" onClick={open}>Open orders for the next game</button> : <p className="muted small">Waiting for the GM to open orders.</p>}
      </div>
    );
  }

  const played = playedFactions(c, state.forces);
  const expected = [...new Set([...played.values()].flat())];
  const declaredNow = new Set(declared.filter((d) => d.round === current.round).flatMap((d) => d.factions));
  const waiting = expected.filter((f) => !declaredNow.has(f));
  const mine = myFactions(c, state.forces, cloud.email);
  const own = orders.find((o) => o.email === cloud.email && o.round === current.round);

  const pick = (factionId: string, target: string) => {
    const picks = { ...(own?.picks ?? {}) };
    if (target) picks[factionId] = target;
    else delete picks[factionId];
    fb.saveOrders(cloud.email!, current.round, picks).catch(fail('save your orders'));
  };
  const reveal = () => {
    const who = waiting.map((f) => factionName(c, f)).join(', ');
    if (waiting.length && !confirmAction(`${who} ${waiting.length === 1 ? "hasn't" : "haven't"} declared yet. Reveal anyway?`)) return;
    fb.setRound({ ...current, revealed: true }).then(() => toast('Orders revealed.'), fail('reveal the orders'));
  };

  return (
    <div className="panel">
      {title}
      {!revealed && (
        <>
          <p className="muted small">Your picks are sealed: only you can see them until the GM reveals the round. You can change them until then.</p>
          {mine.length === 0 && <p className="muted small">Link one of your forces to a faction to declare orders for it.</p>}
          {mine.map((f) => {
            const targets = attackTargets(c, f);
            return (
              <label key={f} className="field">
                <span>{factionName(c, f)}</span>
                <select value={own?.picks[f] ?? ''} onChange={(e) => pick(f, e.target.value)}>
                  <option value="">— Not declared —</option>
                  <option value={HOLD}>Hold: no attack</option>
                  {targets.length > 0 && (
                    <optgroup label="Attack">
                      {targets.map((s) => <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)})</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
            );
          })}
          <h3>Declared</h3>
          {expected.length === 0 ? <p className="muted small">No forces are linked to factions yet.</p> : (
            <div className="row">
              {expected.map((f) => <span key={f} className="tag" title={declaredNow.has(f) ? 'Declared' : 'Waiting'}>{declaredNow.has(f) ? '✓' : '…'} {factionName(c, f)}</span>)}
            </div>
          )}
          {cloud.isGm && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={reveal}>Reveal orders</button>
            </div>
          )}
        </>
      )}
      {revealed && <RevealedOrders c={c} orders={orders} round={current.round} />}
      {revealed && cloud.isGm && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={() => confirmAction('Open orders for the next game? These orders will be hidden again.') && open()}>Open orders for the next game</button>
        </div>
      )}
    </div>
  );
}

function RevealedOrders({ c, orders, round }: { c: Campaign; orders: PlayerOrders[]; round: number }) {
  const { attacks, holds } = revealOrders(c, orders, round);
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  if (!attacks.length && !holds.length) return <p className="muted small">Nobody declared this round.</p>;
  return (
    <>
      {attacks.map((a) => (
        <div key={a.factionId} className="list-item small">
          <span className="grow">
            <b>{factionName(c, a.factionId)}</b> attacks <b>{sectorName(a.sectorId)}</b> ({factionName(c, a.defender)})
            {a.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}>⚠ {f}</span>)}
          </span>
          <a className="btn" href={href.tracker(a.sectorId, a.factionId)}>⚔ Start battle</a>
        </div>
      ))}
      {holds.map((h) => (
        <div key={h.factionId} className="list-item small"><span className="grow"><b>{factionName(c, h.factionId)}</b> holds</span></div>
      ))}
    </>
  );
}
