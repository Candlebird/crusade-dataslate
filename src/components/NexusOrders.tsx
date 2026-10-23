import { useEffect, useState, type ReactNode } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import type { Campaign, Force } from '../model/types';
import { detachmentName } from '../rules/detachments';
import { aiDefended, ratingFor } from '../rules/difficulty';
import { ECHOES, currentRound, factionName } from '../rules/nexus';
import { moveOf, moveTargets, positionOf } from '../rules/movement';
import { HOLD, applyMoves, digsIn, foughtFor, myDetachments, playedDetachments, revealOrders, type Declared, type OrderRound, type PlayerOrders } from '../rules/orders';
import { nowIso } from '../model/factory';
import { spreadsAt, nextThreat } from '../rules/rounds';
import { echoMarks, holders } from '../rules/voidspawn';
import { standingEffects } from '../rules/standing';
import { callMeeting, meetingBattle, meetingState, meetings, settleMeeting, unsettleMeeting, type Meeting } from '../rules/meetings';
import type { AutoResult } from '../rules/autoBattle';
import type { TrackedBattle } from '../rules/tracker';
import AutoBattleModal from './AutoBattleModal';
import { go, href } from '../route';
import { attackBattle, overrunBlock } from '../rules/overrun';
import { useEndRound } from './RoundPanel';
import { Panel, confirmAction, toast } from './ui';
import { Icon } from './Icon';

type Firebase = typeof import('../cloud/firebase');

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The sealed-orders round in the cloud, as it stands: the round, its declarations and the orders you may read (yours, or everyone's once revealed). */
export function useSealedOrders(c: Campaign) {
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

  const current = round && round.campaignId === c.id ? round : null;
  return { fb, online, round, current, revealed, orders, declared };
}

/** Sealed orders: every player picks a move, an attack or a hold per detachment; the GM reveals them all at once. */
export default function OrdersPanel({ c }: { c: Campaign }) {
  const { state } = useStore();
  const endRound = useEndRound();
  const cloud = useCloud();
  const { fb, online, round, current, revealed, orders, declared } = useSealedOrders(c);

  const status = round && round.campaignId === c.id && <span className="muted small">Round {currentRound(c)} · orders #{round.round}{revealed ? ' · revealed' : ' · open'}</span>;
  // Every state renders in the same collapsible panel.
  const panel = (body: ReactNode) => <Panel id="campaign.orders" title="Sealed orders" extra={status}>{body}</Panel>;
  if (!online || !cloud.email) return panel(<p className="muted small">Sign in to the campaign to declare sealed attack orders.</p>);
  if (round === undefined || !fb) return panel(<p className="muted small">Loading orders…</p>);

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
    const exposed = echoMarks(c).filter((m) => {
      const s = c.sectors.find((x) => x.id === m.sectorId);
      return s && !m.brokenBy && !holders(c, s).length;
    }).length;
    const take = c.echoMarks?.round === currentRound(c)
      ? `the ${ECHOES.name} take ${exposed} marked sector${exposed === 1 ? '' : 's'} nobody holds` : `the ${ECHOES.name} spread ${spreads} sector${spreads === 1 ? '' : 's'}`;
    if (confirmAction(`Also end round ${currentRound(c)}? Sector income is fixed for the round and ${take}. Cancel to keep playing this round.`)) endRound();
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
            // What standing there does when the round ends: holding a mark, barring a band's road, guarding a world.
            const fx = (id: string | undefined) => {
              const t = id ? standingEffects(c, id, f.nexus!.factionId) : [];
              return t.length ? ` · ${t.join(' · ')}` : '';
            };
            return (
              <label key={f.id} className="field">
                <span>{label(f)} <span className="muted small" title={why.join(', ')}>at {at?.name ?? '—'}, moves {move}</span></span>
                <select value={own?.picks[f.id] ?? own?.picks[f.nexus!.factionId] ?? ''} onChange={(e) => pick(f.id, e.target.value)}>
                  <option value="">— Not declared —</option>
                  <option value={HOLD}>Hold: stay put, no attack{digsIn(c, f) ? ' · ⛊ digs in if attacked' : ''}{fx(at?.id)}</option>
                  {moves.length > 0 && (
                    <optgroup label="Move">
                      {moves.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.owner ? factionName(c, s.owner) : 'empty space'}){fx(s.id)}</option>)}
                    </optgroup>
                  )}
                  {attacks.length > 0 && (
                    <optgroup label="Attack">
                      {attacks.map((s) => {
                        const rating = aiDefended(s) ? ratingFor(s, f.nexus!.factionId) : undefined;
                        return <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)}){rating !== undefined ? ` — ${rating} Supply` : ''}{overrunBlock(s, f) ? '' : ' · ⚡ can overrun'}</option>;
                      })}
                    </optgroup>
                  )}
                </select>
              </label>
            );
          })}
          <h3>Declared</h3>
          {expected.length === 0 ? <p className="muted small">No forces are linked to factions yet.</p> : (
            <div className="row">
              {expected.map((f) => <span key={f.id} className="tag" title={isDeclared(f) ? 'Declared' : 'Waiting'}>{isDeclared(f) ? <Icon name="l:check" /> : '…'} {label(f)}</span>)}
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
  const cloud = useCloud();
  const { attacks, moves, holds } = revealOrders(c, orders, round, state.forces);
  const moved = c.movedOrders === round;
  const met = moved ? [] : meetings(c, { moves }, state.forces);
  const unsettled = met.filter((m) => ['open', 'fight'].includes(meetingState(c, m, round))).length;
  const makeMoves = () => {
    let n = 0;
    update((s) => {
      if (!s.campaign) return;
      n = applyMoves(s.campaign, moves, s.forces, round);
      s.campaign.movedOrders = round;
      s.campaign.updatedAt = nowIso();
    });
    toast(`${n} detachment${n === 1 ? '' : 's'} moved on the map.`);
  };
  const who = (factionId: string, forceId?: string) => {
    const f = forceId && state.forces.find((x) => x.id === forceId);
    return f ? detachmentName(c, state.forces, f) : factionName(c, factionId);
  };
  const dug = (forceId?: string) => {
    const f = forceId && state.forces.find((x) => x.id === forceId);
    return !!f && digsIn(c, f);
  };
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';
  // Off the table: set the attack up on the tracker for its auto-battle; finishing it there logs it like any battle.
  const autoBattle = (a: (typeof attacks)[number]) => {
    if (state.battle) return toast('A battle is already running on the tracker: finish or discard it first.');
    update((s) => void (s.battle = attackBattle(c, a, s.forces, s.books, s.settings)));
    go(href.tracker());
    toast('Set up on the tracker: press ⚡ Auto-battle, then finish the battle to log the result.');
  };
  if (!attacks.length && !moves.length && !holds.length) return <p className="muted small">Nobody declared this round.</p>;
  return (
    <>
      {moves.map((m) => (
        <div key={m.forceId} className="list-item small">
          <span className="grow">
            <b>{who(m.factionId, m.forceId)}</b> moves to <b>{sectorName(m.sectorId)}</b>
            {!moved && m.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}><Icon name="g:hazard-sign" /> {f}</span>)}
          </span>
          {moved && <span className="tag green"><Icon name="l:check" /> Moved</span>}
        </div>
      ))}
      {met.map((m) => <MeetingRow key={m.key} c={c} m={m} round={round} gm={gm} who={(id) => who('', id)} sectorName={sectorName} />)}
      {moves.length > 0 && gm && !moved && (
        <div className="row" style={{ margin: '4px 0 8px' }}>
          <button className="primary" disabled={unsettled > 0} onClick={makeMoves}
            title={unsettled ? 'Settle the meeting engagements first' : 'Move every detachment whose move is still in reach; attackers move when they win their battle'}>
            Move detachments
          </button>
          {unsettled > 0 && <span className="muted small">{unsettled} meeting engagement{unsettled === 1 ? '' : 's'} to settle first</span>}
        </div>
      )}
      {attacks.map((a) => {
        const fought = foughtFor(c, a, currentRound(c)); // games are logged by campaign round, not by orders #
        const sector = c.sectors.find((s) => s.id === a.sectorId);
        const force = state.forces.find((f) => f.id === a.forceId);
        const block = sector ? overrunBlock(sector, force) : 'the sector is gone';
        const mine = gm || (!!cloud.email && force?.owner === cloud.email);
        return (
          <div key={a.forceId ?? a.factionId} className="list-item small">
            <span className="grow">
              <b>{who(a.factionId, a.forceId)}</b> attacks <b>{sectorName(a.sectorId)}</b> ({factionName(c, a.defender)})
              {!fought && a.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}><Icon name="g:hazard-sign" /> {f}</span>)}
            </span>
            {fought ? (
              <span className="tag green" title={fought.notes || undefined}><Icon name="l:check" /> Fought: {fought.winner ? `${factionName(c, fought.winner)} won` : 'a draw'}</span>
            ) : (
              <span className="row" style={{ gap: 4 }}>
                <a className="btn" href={href.tracker(a.sectorId, a.factionId, a.forceId)}><Icon name="g:crossed-swords" /> Start battle</a>
                {!block && mine ? (
                  <button className="small" onClick={() => autoBattle(a)} title="The garrison is small enough to settle on the auto-battle instead of at the table. It can still go wrong."><Icon name="g:power-lightning" /> Overrun</button>
                ) : gm && sector ? (
                  <button className="small" onClick={() => autoBattle(a)} title={`GM fallback, for an attack nobody can play at the table (no overrun: ${block})`}><Icon name="g:perspective-dice-six-faces-six" /> Auto-battle</button>
                ) : null}
              </span>
            )}
          </div>
        );
      })}
      {holds.map((h) => (
        <div key={h.forceId ?? h.factionId} className="list-item small"><span className="grow"><b>{who(h.factionId, h.forceId)}</b> holds{dug(h.forceId) && <span className="tag" style={{ marginLeft: 6 }} title="If its sector is attacked this round, it fights the battle and picks the deployment"><Icon name="g:trench-spade" /> Dug in</span>}</span></div>
      ))}
    </>
  );
}

const HOW: Record<Meeting['how'], string> = { same: 'both move into', swap: 'pass each other on the way to', onto: 'runs into the other at' };

/**
 * Two factions' detachments run into each other on open ground: each side's player (or the GM) picks Fight or Pass.
 * Both pass and they pass by; either fights and they play it at the table or on the auto-battle, the winner takes the hex.
 */
function MeetingRow({ c, m, round, gm, who, sectorName }: {
  c: Campaign; m: Meeting; round: number; gm: boolean; who: (forceId: string) => string; sectorName: (id: string) => string;
}) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const [auto, setAuto] = useState<TrackedBattle | null>(null);
  const status = meetingState(c, m, round);
  const calls = c.meetings?.round === round ? c.meetings.calls[m.key] ?? {} : {};
  const result = c.meetings?.round === round ? c.meetings.results[m.key] : undefined;
  const force = (id: string) => state.forces.find((f) => f.id === id);
  const mine = (id: string) => gm || (!!cloud.email && force(id)?.owner === cloud.email);
  const either = m.sides.some(mine);
  const edit = (fn: (c: Campaign) => void) => update((s) => {
    if (!s.campaign) return;
    fn(s.campaign);
    s.campaign.updatedAt = nowIso();
  });
  const settle = (winner: string, how: string) => {
    edit((x) => settleMeeting(x, round, m.key, winner));
    toast(`${how}: ${winner ? `${who(winner)} wins and takes ${sectorName(m.sectorId)}` : 'a draw, both stay where they were'}.`);
  };
  const applyAuto = (r: AutoResult) => settle(r.winner === 'A' ? m.sides[0] : r.winner === 'B' ? m.sides[1] : '', 'Auto-battle');
  const [a, b] = m.sides;
  return (
    <div className="list-item small" style={{ flexWrap: 'wrap' }}>
      <span className="grow">
        <Icon name="g:crossed-swords" /> <b>{who(a)}</b> and <b>{who(b)}</b> {HOW[m.how]} <b>{sectorName(m.sectorId)}</b>
        {status !== 'settled' && m.sides.map((id) => (
          <span key={id} className="tag" style={{ marginLeft: 6 }}>{who(id)}: {calls[id] === 'fight' ? <><Icon name="g:crossed-swords" /> Fight</> : calls[id] === 'pass' ? <><Icon name="l:redo-2" /> Pass</> : '…'}</span>
        ))}
      </span>
      {status === 'settled' ? (
        <>
          <span className="tag green"><Icon name="l:check" /> {result ? `${who(result)} won: ${who(result === a ? b : a)} falls back` : 'A draw: both stay put'}</span>
          {gm && <button className="small" onClick={() => edit((x) => unsettleMeeting(x, round, m.key))}>Undo</button>}
        </>
      ) : status === 'passed' ? (
        <span className="tag"><Icon name="l:redo-2" /> They pass by</span>
      ) : null}
      {status !== 'settled' && m.sides.filter(mine).map((id) => (
        <span key={id} className="row" style={{ gap: 4 }}>
          {m.sides.filter(mine).length > 1 && <span className="muted">{who(id)}:</span>}
          <button className={calls[id] === 'fight' ? 'primary small' : 'small'} onClick={() => edit((x) => callMeeting(x, round, m.key, id, 'fight'))}>Fight</button>
          <button className={calls[id] === 'pass' ? 'primary small' : 'small'} onClick={() => edit((x) => callMeeting(x, round, m.key, id, 'pass'))}>Pass</button>
        </span>
      ))}
      {status === 'fight' && either && (
        <span className="row" style={{ gap: 4 }}>
          <button className="small" onClick={() => setAuto(meetingBattle(c, m, state.forces, state.settings))}><Icon name="g:power-lightning" /> Auto-battle</button>
          {m.sides.map((id) => <button key={id} className="small" title="Played at the table" onClick={() => settle(id, 'At the table')}>{who(id)} won</button>)}
          <button className="small" title="Played at the table" onClick={() => settle('', 'At the table')}>Draw</button>
        </span>
      )}
      {auto && (
        <AutoBattleModal b={auto} onClose={() => setAuto(null)} onApply={applyAuto}
          set={(fn) => setAuto((x) => { if (!x) return x; const y = structuredClone(x); fn(y); return y; })}
          applyNote="The winner takes the hex, the loser falls back to its nearest sector. Losses don't carry over to the forces." />
      )}
    </div>
  );
}
