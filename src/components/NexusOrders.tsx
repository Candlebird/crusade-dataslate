import { useEffect, useState, type ReactNode } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import type { Campaign, Force } from '../model/types';
import { detachmentName } from '../rules/detachments';
import { aiDefended } from '../rules/difficulty';
import { ECHOES, currentRound, factionName } from '../rules/nexus';
import { moveOf, moveTargets, positionOf } from '../rules/movement';
import { HOLD, applyMoves, foughtFor, myDetachments, playedDetachments, revealOrders, type Declared, type OrderRound, type PlayerOrders } from '../rules/orders';
import { nowIso } from '../model/factory';
import { spreadsAt, nextThreat } from '../rules/rounds';
import { href } from '../route';
import { useEndRound } from './RoundPanel';
import { Panel, confirmAction, toast } from './ui';

type Firebase = typeof import('../cloud/firebase');

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Sealed orders: every player picks a move, an attack or a hold per detachment; the GM reveals them all at once. */
export default function OrdersPanel({ c }: { c: Campaign }) {
  const { state } = useStore();
  const endRound = useEndRound();
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

  const status = round && round.campaignId === c.id && <span className="muted small">Round {currentRound(c)} · orders #{round.round}{revealed ? ' · revealed' : ' · open'}</span>;
  // Every state renders in the same collapsible panel.
  const panel = (body: ReactNode) => <Panel id="campaign.orders" title="Sealed orders" extra={status}>{body}</Panel>;
  if (!online || !cloud.email) return panel(<p className="muted small">Sign in to the campaign to declare sealed attack orders.</p>);
  if (round === undefined || !fb) return panel(<p className="muted small">Loading orders…</p>);

  const current = round && round.campaignId === c.id ? round : null;
  const fail = (what: string) => (err: unknown) => toast(`Couldn't ${what}: ${errorText(err)}`, 'error');
  const nextRound = () => (round ? round.round + 1 : 1);
  const open = () => fb.setRound({ campaignId: c.id, round: nextRound(), revealed: false }).then(() => toast('Orders are open. Players can now declare.'), fail('open the round'));

  if (!current) {
    return panel(
      <>
        <p className="muted small">
          Before each game, every detachment picks a sector it can reach to move to or attack, or holds. Nobody sees anyone's picks until the GM reveals them.
        </p>
        {cloud.isGm ? <button className="primary" onClick={open}>Open orders for the next game</button> : <p className="muted small">Waiting for the GM to open orders.</p>}
      </>
    );
  }

  // One pick per detachment (older orders were keyed by faction, which still counts for all its detachments).
  const expected = playedDetachments(c, state.forces);
  const declaredNow = new Set(declared.filter((d) => d.round === current.round).flatMap((d) => d.factions));
  const isDeclared = (f: Force) => declaredNow.has(f.id) || declaredNow.has(f.nexus!.factionId);
  const waiting = expected.filter((f) => !isDeclared(f));
  const mine = myDetachments(c, state.forces, cloud.email);
  const own = orders.find((o) => o.email === cloud.email && o.round === current.round);
  const label = (f: Force) => detachmentName(c, state.forces, f);

  const pick = (forceId: string, target: string) => {
    const picks = { ...(own?.picks ?? {}) };
    if (target) picks[forceId] = target;
    else delete picks[forceId];
    fb.saveOrders(cloud.email!, current.round, picks).catch(fail('save your orders'));
  };
  // Open the next set of orders, ending the campaign round first if the GM says so.
  const openNext = () => {
    if (!confirmAction('Open orders for the next game? These orders will be hidden again.')) return;
    const spreads = spreadsAt(nextThreat(c));
    if (confirmAction(`Also end round ${currentRound(c)}? Sector income is fixed for the round and the ${ECHOES.name} spread ${spreads} sector${spreads === 1 ? '' : 's'}. Cancel to keep playing this round.`)) endRound(c);
    open();
  };
  const reveal = () => {
    const who = waiting.map(label).join(', ');
    if (waiting.length && !confirmAction(`${who} ${waiting.length === 1 ? "hasn't" : "haven't"} declared yet. Reveal anyway?`)) return;
    fb.setRound({ ...current, revealed: true }).then(() => toast('Orders revealed.'), fail('reveal the orders'));
  };

  return panel(
    <>
      {!revealed && (
        <>
          <p className="muted small">Your picks are sealed: only you can see them until the GM reveals the round. You can change them until then.</p>
          {mine.length === 0 && <p className="muted small">Link one of your forces to a faction to declare orders for it.</p>}
          {mine.map((f) => {
            const { moves, attacks } = moveTargets(c, f);
            const at = positionOf(c, f);
            const { move, why } = moveOf(c, f);
            return (
              <label key={f.id} className="field">
                <span>{label(f)} <span className="muted small" title={why.join(', ')}>at {at?.name ?? '—'}, moves {move}</span></span>
                <select value={own?.picks[f.id] ?? own?.picks[f.nexus!.factionId] ?? ''} onChange={(e) => pick(f.id, e.target.value)}>
                  <option value="">— Not declared —</option>
                  <option value={HOLD}>Hold: stay put, no attack</option>
                  {moves.length > 0 && (
                    <optgroup label="Move">
                      {moves.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.owner ? factionName(c, s.owner) : 'empty space'})</option>)}
                    </optgroup>
                  )}
                  {attacks.length > 0 && (
                    <optgroup label="Attack">
                      {attacks.map((s) => <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)}){s.difficulty !== undefined && aiDefended(s) ? ` — ${s.difficulty} Supply` : ''}</option>)}
                    </optgroup>
                  )}
                </select>
              </label>
            );
          })}
          <h3>Declared</h3>
          {expected.length === 0 ? <p className="muted small">No forces are linked to factions yet.</p> : (
            <div className="row">
              {expected.map((f) => <span key={f.id} className="tag" title={isDeclared(f) ? 'Declared' : 'Waiting'}>{isDeclared(f) ? '✓' : '…'} {label(f)}</span>)}
            </div>
          )}
          {cloud.isGm && (
            <div className="row" style={{ marginTop: 8 }}>
              <button className="primary" onClick={reveal}>Reveal orders</button>
            </div>
          )}
        </>
      )}
      {revealed && <RevealedOrders c={c} orders={orders} round={current.round} gm={cloud.isGm} />}
      {revealed && cloud.isGm && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={openNext}>Open orders for the next game</button>
        </div>
      )}
    </>
  );
}

function RevealedOrders({ c, orders, round, gm }: { c: Campaign; orders: PlayerOrders[]; round: number; gm: boolean }) {
  const { state, update } = useStore();
  const { attacks, moves, holds } = revealOrders(c, orders, round, state.forces);
  const moved = c.movedOrders === round;
  const makeMoves = () => {
    let n = 0;
    update((s) => {
      if (!s.campaign) return;
      n = applyMoves(s.campaign, moves, s.forces);
      s.campaign.movedOrders = round;
      s.campaign.updatedAt = nowIso();
    });
    toast(`${n} detachment${n === 1 ? '' : 's'} moved on the map.`);
  };
  const who = (factionId: string, forceId?: string) => {
    const f = forceId && state.forces.find((x) => x.id === forceId);
    return f ? detachmentName(c, state.forces, f) : factionName(c, factionId);
  };
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  if (!attacks.length && !moves.length && !holds.length) return <p className="muted small">Nobody declared this round.</p>;
  return (
    <>
      {moves.map((m) => (
        <div key={m.forceId} className="list-item small">
          <span className="grow">
            <b>{who(m.factionId, m.forceId)}</b> moves to <b>{sectorName(m.sectorId)}</b>
            {!moved && m.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}>⚠ {f}</span>)}
          </span>
          {moved && <span className="tag green">✓ Moved</span>}
        </div>
      ))}
      {moves.length > 0 && gm && !moved && (
        <div className="row" style={{ margin: '4px 0 8px' }}>
          <button className="primary" title="Move every detachment whose move is still in reach; attackers move when they win their battle" onClick={makeMoves}>Move detachments</button>
        </div>
      )}
      {attacks.map((a) => {
        const fought = foughtFor(c, a, round);
        return (
          <div key={a.forceId ?? a.factionId} className="list-item small">
            <span className="grow">
              <b>{who(a.factionId, a.forceId)}</b> attacks <b>{sectorName(a.sectorId)}</b> ({factionName(c, a.defender)})
              {!fought && a.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}>⚠ {f}</span>)}
            </span>
            {fought ? (
              <span className="tag green" title={fought.notes || undefined}>✓ Fought: {fought.winner ? `${factionName(c, fought.winner)} won` : 'a draw'}</span>
            ) : (
              <a className="btn" href={href.tracker(a.sectorId, a.factionId, a.forceId)}>⚔ Start battle</a>
            )}
          </div>
        );
      })}
      {holds.map((h) => (
        <div key={h.forceId ?? h.factionId} className="list-item small"><span className="grow"><b>{who(h.factionId, h.forceId)}</b> holds</span></div>
      ))}
    </>
  );
}
