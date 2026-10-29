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
import ZoneFight, { useZoneBattles } from './ZoneFight';
import { attackTableOnly } from '../rules/zone/eligible';
import { SIEGE, openSieges, siegeOf, siegesToOpen } from '../rules/sieges';
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

/** Which detachments have declared this set of orders. One pick per detachment (older orders were keyed by faction, which still counts for all its detachments). */
export function lockedIn(c: Campaign, forces: Force[], declared: Declared[], round: number) {
  const expected = playedDetachments(c, forces);
  const declaredNow = new Set(declared.filter((d) => d.round === round).flatMap((d) => d.factions));
  const isDeclared = (f: Force) => declaredNow.has(f.id) || declaredNow.has(f.nexus!.factionId);
  return { expected, isDeclared, waiting: expected.filter((f) => !isDeclared(f)) };
}

/** A short line near the top of the campaign page: how many detachments have locked in orders, and whose. It never shows the picks.
 *  `byFaction` (the players' view): one row per faction instead, yes or no. */
export function OrdersLockStrip({ c, byFaction }: { c: Campaign; byFaction?: boolean }) {
  const { state } = useStore();
  const { current, revealed, declared } = useSealedOrders(c);
  if (!current || revealed) return null;
  const { expected, isDeclared } = lockedIn(c, state.forces, declared, current.round);
  if (!expected.length) return null;
  if (byFaction) {
    // Only factions with detachments to declare for; the AI and empty factions don't pick orders.
    const rows = c.factions.flatMap((x) => {
      const own = expected.filter((f) => f.nexus!.factionId === x.id);
      return own.length ? [{ id: x.id, name: x.name, locked: own.every(isDeclared) }] : [];
    });
    const n = rows.filter((r) => r.locked).length;
    return (
      <div className="panel small lock-rows">
        <b><Icon name="l:lock" /> Sealed orders locked in: {n} of {rows.length} faction{rows.length === 1 ? '' : 's'}</b>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <span>{r.name}</span>
              {r.locked
                ? <span className="tag green"><Icon name="l:check" /> Locked in</span>
                : <span className="tag" data-tip="Still picking">… Not yet</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const done = expected.filter(isDeclared).length;
  return (
    <div className="panel row small" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
      <b><Icon name="l:lock" /> Orders locked in: {done} of {expected.length}</b>
      {expected.map((f) => (
        <span key={f.id} className={`tag${isDeclared(f) ? ' green' : ''}`} data-tip={isDeclared(f) ? 'Locked in' : 'Still picking'}>
          {isDeclared(f) ? <Icon name="l:check" /> : '…'} {detachmentName(c, state.forces, f)}
        </span>
      ))}
    </div>
  );
}

/** Sealed orders: every player picks a move, an attack or a hold per detachment; the GM reveals them all at once. */
export default function OrdersPanel({ c }: { c: Campaign }) {
  const { state } = useStore();
  const zoneOn = useZoneBattles();
  const endRound = useEndRound();
  const cloud = useCloud();
  const { fb, online, round, current, revealed, orders, declared } = useSealedOrders(c);

  const status = round && round.campaignId === c.id && <span className="muted small">Round {currentRound(c)} · orders #{round.round}{revealed ? ' · revealed' : ' · open'}</span>;
  // Every state renders in the same collapsible panel.
  const panel = (body: ReactNode) => <Panel id="campaign.orders" title="Sealed orders" extra={status}>{body}</Panel>;
  if (!online || !cloud.email) return panel(<p className="muted small">Before each game every detachment secretly picks a move, an attack or a hold. The orders live in the cloud: sign in to declare yours.</p>);
  if (round === undefined || !fb) return panel(<p className="muted small">Loading orders…</p>);

  const fail = (what: string) => (err: unknown) => toast(`Couldn't ${what}: ${errorText(err)}`, 'error');
  const nextRound = () => (round ? round.round + 1 : 1);
  const open = () => fb.setRound({ campaignId: c.id, round: nextRound(), revealed: false }).then(() => toast('Orders open. Players can declare.'), fail('open the round'));

  if (!current) {
    return panel(
      <>
        <p className="muted small">
          Before each game, each detachment picks a sector in reach to move to or attack, or holds. Picks stay hidden until the GM reveals them.
        </p>
        {cloud.isGm ? <button className="primary" onClick={open}>Open orders for the next game</button> : <p className="muted small">Waiting for the GM to open orders.</p>}
      </>
    );
  }

  const { expected, isDeclared, waiting } = lockedIn(c, state.forces, declared, current.round);
  const mine = myDetachments(c, state.forces, cloud.email);
  const own = orders.find((o) => o.email === cloud.email && o.round === current.round);
  const label = (f: Force) => detachmentName(c, state.forces, f);
  const sectorName = (id: string) => c.sectors.find((s) => s.id === id)?.name ?? 'Deleted sector';

  const pick = (forceId: string, target: string) => {
    const picks = { ...(own?.picks ?? {}) };
    if (target) picks[forceId] = target;
    else delete picks[forceId];
    fb.saveOrders(cloud.email!, current.round, picks).catch(fail('save your orders'));
  };
  // Open the next set of orders, ending the campaign round first if the GM says so.
  const openNext = () => {
    if (!confirmAction('Open orders for the next game? These orders are hidden again.')) return;
    const spreads = spreadsAt(nextThreat(c));
    const exposed = echoMarks(c).filter((m) => {
      const s = c.sectors.find((x) => x.id === m.sectorId);
      return s && !m.brokenBy && !holders(c, s).length;
    }).length;
    const take = c.echoMarks?.round === currentRound(c)
      ? `the ${ECHOES.name} take ${exposed} marked sector${exposed === 1 ? '' : 's'} nobody holds` : `the ${ECHOES.name} spread ${spreads} sector${spreads === 1 ? '' : 's'}`;
    if (confirmAction(`Also end round ${currentRound(c)}? Sector income is fixed and ${take}. Cancel to keep playing this round.`)) endRound();
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
          <p className="muted small">Your picks are sealed: only you see them, and you can change them, until the GM reveals.</p>
          {mine.length === 0 && <p className="muted small">Link a force to a faction to declare its orders.</p>}
          {mine.map((f) => {
            const { moves, attacks } = moveTargets(c, f);
            const at = positionOf(c, f);
            const { move, why } = moveOf(c, f);
            const siege = siegeOf(c, f.id);
            if (siege) return (
              <div key={f.id} className="field">
                <span>{label(f)} <span className="muted small">at {at?.name ?? '—'}</span></span>
                <span className="small"><span className="tag red"><Icon name="g:camping-tent" /> Pinned</span> Besieging <b>{sectorName(siege.sectorId)}</b> until round {siege.until}: it attacks again this round and can't move. Play the battle at the table to end it.</span>
              </div>
            );
            // What standing there does when the round ends: holding a mark, barring a band's road, guarding a world.
            const fx = (id: string | undefined) => {
              const t = id ? standingEffects(c, id, f.nexus!.factionId) : [];
              return t.length ? ` · ${t.join(' · ')}` : '';
            };
            // In words, what the pick will do once it's revealed.
            const picked = own?.picks[f.id] ?? own?.picks[f.nexus!.factionId] ?? '';
            const target = attacks.find((s) => s.id === picked) ?? moves.find((s) => s.id === picked);
            const isAttack = !!target && attacks.includes(target);
            const rating = isAttack && aiDefended(target!) ? ratingFor(target!, f.nexus!.factionId, c) : undefined;
            const means = !picked ? <>Not declared yet: pick before the GM reveals, or it just stays where it is.</>
              : picked === HOLD ? <>Stays at {at?.name ?? 'its sector'}.{digsIn(c, f) && ' Dug in: if attacked it fights and picks the deployment.'}{fx(at?.id)}</>
              : !target ? <>That sector is out of reach now: pick again.</>
              : isAttack ? <>Attacks {target.name}: a battle against {rating !== undefined ? `its ${rating} Supply AI garrison` : factionName(c, target.owner)}, at the table
                {zoneOn ? ' or as a zone battle' : !overrunBlock(target, f, c) ? ' or overrun (an auto-battle)' : ''}, from this panel after the reveal. Win and it moves in.</>
              : <>Moves to {target.name} when the GM moves detachments after the reveal.{fx(target.id)}</>;
            return (
              <label key={f.id} className="field">
                <span>{label(f)} <span className="muted small" data-tip={why.join(', ')}>at {at?.name ?? '—'}, moves {move}</span></span>
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
                        const rating = aiDefended(s) ? ratingFor(s, f.nexus!.factionId, c) : undefined;
                        return <option key={s.id} value={s.id}>{s.name} ({factionName(c, s.owner)}){rating !== undefined ? ` — ${rating} Supply` : ''}{overrunBlock(s, f, c) ? '' : ' · ⚡ can overrun'}</option>;
                      })}
                    </optgroup>
                  )}
                </select>
                <span className={`order-means${picked ? '' : ' muted'}`}>
                  {picked && <span className="tag green" data-tip="Saved and sealed: you can change it until the GM reveals"><Icon name="l:lock" /> Locked in</span>} {means}
                </span>
              </label>
            );
          })}
          <h3>Who has locked in</h3>
          {expected.length === 0 ? <p className="muted small">No forces are linked to factions yet.</p> : (
            <div className="row">
              {expected.map((f) => <span key={f.id} className="tag" data-tip={isDeclared(f) ? 'Declared' : 'Waiting'}>{isDeclared(f) ? <Icon name="l:check" /> : '…'} {label(f)}</span>)}
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
  // An attack for the table that isn't played this round becomes a siege: on the GM's screen, as soon as it's revealed.
  const besiege = gm ? siegesToOpen(c, attacks, state.forces).map((a) => `${a.forceId}:${a.sectorId}`).join(',') : '';
  useEffect(() => {
    if (!besiege) return;
    let n = 0;
    update((s) => {
      if (!s.campaign) return;
      n = openSieges(s.campaign, revealOrders(s.campaign, orders, round, s.forces).attacks, s.forces).length;
      if (n) s.campaign.updatedAt = nowIso();
    });
    if (n) toast(`${n} attack${n === 1 ? '' : 's'} for the table: a siege opens, its detachment pinned for up to ${SIEGE.rounds} rounds.`);
  }, [besiege]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const zoneOn = useZoneBattles();
  // A zone battle is set up on the tracker too, so it's finished and logged there like any battle.
  const zoneBattle = (a: (typeof attacks)[number]) => {
    if (state.battle) return toast('A battle is already on the tracker. Finish or discard it first.');
    update((s) => void (s.battle = attackBattle(c, a, s.forces, s.books, s.settings)));
    go(href.tracker());
    toast('On the tracker: press Zone battle to fight it.');
  };
  const autoBattle = (a: (typeof attacks)[number]) => {
    if (state.battle) return toast('A battle is already on the tracker. Finish or discard it first.');
    update((s) => void (s.battle = attackBattle(c, a, s.forces, s.books, s.settings)));
    go(href.tracker());
    toast('On the tracker: press ⚡ Auto-battle, then finish to log it.');
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
            data-tip={unsettled ? 'Settle the meeting engagements first' : 'Move every detachment still in reach. Attackers move when they win their battle'}>
            Move detachments
          </button>
          {unsettled > 0 && <span className="muted small">{unsettled} meeting engagement{unsettled === 1 ? '' : 's'} to settle first</span>}
        </div>
      )}
      {attacks.map((a) => {
        const fought = foughtFor(c, a, currentRound(c)); // games are logged by campaign round, not by orders #
        const sector = c.sectors.find((s) => s.id === a.sectorId);
        const force = state.forces.find((f) => f.id === a.forceId);
        const block = sector ? overrunBlock(sector, force, c) : 'the sector is gone';
        const mine = gm || (!!cloud.email && force?.owner === cloud.email);
        return (
          <div key={a.forceId ?? a.factionId} className="list-item small">
            <span className="grow">
              <b>{who(a.factionId, a.forceId)}</b> attacks <b>{sectorName(a.sectorId)}</b> ({factionName(c, a.defender)})
              {!fought && a.flags.map((f) => <span key={f} className="tag" style={{ marginLeft: 6 }}><Icon name="g:hazard-sign" /> {f}</span>)}
            </span>
            {fought ? (
              <span className="tag green" data-tip={fought.notes || undefined}><Icon name="l:check" /> Fought: {fought.winner ? `${factionName(c, fought.winner)} won` : 'a draw'}</span>
            ) : (
              <span className="row" style={{ gap: 4 }}>
                <a className="btn" href={href.tracker(a.sectorId, a.factionId, a.forceId)}><Icon name="g:crossed-swords" /> Start battle</a>
                {siegeOf(c, a.forceId) && mine && (
                  <button className="small" data-tip="Call the siege off: the detachment is free to move from the next orders" onClick={() => {
                    if (!confirmAction('Lift the siege? The attack is called off.')) return;
                    update((s) => {
                      if (!s.campaign) return;
                      s.campaign.sieges = (s.campaign.sieges ?? []).filter((x) => x.forceId !== a.forceId);
                      s.campaign.updatedAt = nowIso();
                    });
                  }}>Lift siege</button>
                )}
                {zoneOn ? (() => {
                  const why = attackTableOnly(c, a, state.forces);
                  return mine && <button className="small" disabled={!!why} onClick={() => zoneBattle(a)}
                    data-tip={why ? `${why}: it opens a siege until it's played` : 'Fight it as a zone battle, giving the orders yourself or watching the AI. Fight it this round or the attack lapses'}><Icon name="g:crossed-swords" /> Zone battle</button>;
                })() : !block && mine ? (
                  <button className="small" onClick={() => autoBattle(a)} data-tip="The garrison is small enough to auto-battle instead of playing at the table. It can still go wrong."><Icon name="g:power-lightning" /> Overrun</button>
                ) : gm && sector ? (
                  <button className="small" onClick={() => autoBattle(a)} data-tip={`GM fallback for an attack nobody can play at the table (no overrun: ${block})`}><Icon name="g:perspective-dice-six-faces-six" /> Auto-battle</button>
                ) : null}
              </span>
            )}
          </div>
        );
      })}
      {holds.map((h) => (
        <div key={h.forceId ?? h.factionId} className="list-item small"><span className="grow"><b>{who(h.factionId, h.forceId)}</b> holds{dug(h.forceId) && <span className="tag" style={{ marginLeft: 6 }} data-tip="If its sector is attacked this round, it fights and picks the deployment"><Icon name="g:trench-spade" /> Dug in</span>}</span></div>
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
  const [zone, setZone] = useState<TrackedBattle | null>(null);
  const zoneOn = useZoneBattles();
  const zoneId = `meet-${round}-${m.key}`;
  const zoneSaved = state.zoneSaves?.some((z) => z.id === zoneId);
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
  const settle = (winner: string, how: string, stories: string[] = []) => {
    edit((x) => settleMeeting(x, round, m.key, winner, stories));
    toast(`${how}: ${winner ? `${who(winner)} wins and takes ${sectorName(m.sectorId)}` : 'a draw, both stay put'}.`);
  };
  const applyAuto = (r: AutoResult, stories: string[]) => settle(r.winner === 'A' ? m.sides[0] : r.winner === 'B' ? m.sides[1] : '', 'Auto-battle', stories);
  const stories = c.meetings?.round === round ? c.meetings.stories?.[m.key] ?? [] : [];
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
          {stories.map((x) => <div key={x} className="muted" style={{ flexBasis: '100%' }}><Icon name="g:quill-ink" /> {x}</div>)}
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
          {zoneOn ? (
            <button className="small" onClick={() => {
              const t = meetingBattle(c, m, state.forces, state.settings);
              // You give your own side's orders; the AI plays the other (or the GM plays both).
              t.sides.forEach((x, i) => { if (m.sides[i] && !mine(m.sides[i])) x.ai = true; });
              setZone(t);
            }} data-tip={zoneSaved ? 'Pick the zone battle up where you left it' : 'Fight it as a zone battle: the winner takes the hex, and the forces keep no losses'}>
              <Icon name="g:crossed-swords" /> {zoneSaved ? 'Resume zone battle' : 'Zone battle'}</button>
          ) : <button className="small" onClick={() => setAuto(meetingBattle(c, m, state.forces, state.settings))}><Icon name="g:power-lightning" /> Auto-battle</button>}
          {m.sides.map((id) => <button key={id} className="small" data-tip="Played at the table" onClick={() => settle(id, 'At the table')}>{who(id)} won</button>)}
          <button className="small" data-tip="Played at the table" onClick={() => settle('', 'At the table')}>Draw</button>
        </span>
      )}
      {zone && (
        <ZoneFight id={zoneId} title={`${who(a)} meets ${who(b)}`} tracked={zone} ctx={{ kind: 'meeting', key: m.key }} onClose={() => setZone(null)}
          stakes="Only the outcome counts: the winner takes the hex and the loser falls back to its nearest sector. The forces keep no losses and earn no XP."
          onApply={(z) => {
            const w = z.result?.winner;
            const team = w === undefined || w === 'draw' ? '' : z.teams[w];
            const ix = zone.sides.findIndex((x) => x.team === team);
            settle(ix >= 0 ? m.sides[ix] : '', 'Zone battle', z.result ? [z.result.why] : []);
          }} />
      )}
      {auto && (
        <AutoBattleModal b={auto} onClose={() => setAuto(null)} onApply={applyAuto}
          set={(fn) => setAuto((x) => { if (!x) return x; const y = structuredClone(x); fn(y); return y; })}
          applyNote="The winner takes the hex; the loser falls back to its nearest sector. The forces keep no losses." />
      )}
    </div>
  );
}
