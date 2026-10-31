import { useEffect, useMemo, useRef, useState } from 'react';
import { aiTurn } from '../rules/zone/ai';
import { xy, zoneOf } from '../rules/zone/board';
import { castable, act, attackNow, actions, hasGuns, arriveSquares, autoDeploy, autoJoin, chargeTargets, meleeTargets, deploy, deployHint, deploySquares, endNow, isHeroUnit, joinHero, joinTargets, moves, onActivation, ready, startDeploy, toDeploy, vpOf, type Action, type Order } from '../rules/zone/engine';
import { shootable, woundsLeft } from '../rules/zone/combat';
import { forecastSims, type ZForecast } from '../rules/zone/forecast';
import { alive, maxWoundsOf } from '../rules/zone/profile';
import { playOut } from '../rules/zone/sim';
import { ZONE_REWARDS, type ZoneMode } from '../rules/zone/setup';
import { onTable, unitById, type LogLine, type SideIx, type ZBattle, type ZUnit } from '../rules/zone/state';
import { Modal, confirmAction } from './ui';
import { EmblemBadge, Portrait } from './Emblem';
import { ZoneFx } from './ZoneFx';
import { useStore } from '../model/store';
import { echoPortrait } from '../model/emblem';
import type { Unit } from '../model/types';

// The zone battle on screen: the board in 6" squares (zones of 2×2 drawn bold), each side's units on it, and the
// orders for whoever is up. The AI's moves play one at a time with a short pause; every step is saved as it goes.
// On the player's turn a tap on one of their units opens its orders over the board (Hold, Advance, Rush, Charge, or
// Cancel); a move lights the squares it can reach and a charge rings the enemies in reach, and a tap on one gives the
// order. A tap on any other unit only shows it. A unit that moves and then shoots does it in two steps: the move, then
// (with the board as it now stands) a second pop-up to shoot or end the activation.

/** The pause after each action, in ms (the same as the Sortie's). */
export const ACTION_PAUSE = 600;

const ACTION_TIP: Record<Action, string> = {
  hold: 'Stay put, then shoot with every gun that reaches',
  advance: 'Move 1 square (6"), then shoot, or fight an enemy beside it',
  rush: 'Move 2 squares (12"), no shooting',
  charge: 'Move up to 2 squares to beside an enemy (pick the side) and fight in melee',
  idle: 'Shaken: spend the activation recovering',
  arrive: 'Come on from Ambush, over 9" from every enemy; it then activates this round as usual',
  wait: 'Stay in Ambush and come on in a later round',
};

const ORDER_NAME: Record<Action, string> = { hold: 'Hold', advance: 'Advance', rush: 'Rush', charge: 'Charge', idle: 'Recover', arrive: 'Arrive', wait: 'Keep waiting' };

const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 700px)').matches;

/**
 * Plays a battle on screen. `onSave` gets every step; `onDone` the ended battle, once the player takes the result.
 * `after` says what taking the result does, on the result screen.
 */
export default function ZoneBattleModal({ battle, mode: mode0, effects = [], title, canQuick = true, after, onSave, onDone, onClose }: {
  battle: ZBattle; mode: ZoneMode; effects?: string[]; title: string; canQuick?: boolean;
  after?: string; onSave: (z: ZBattle, mode: ZoneMode) => void; onDone: (z: ZBattle, mode: ZoneMode) => void; onClose: () => void;
}) {
  const [z, setZ] = useState<ZBattle>(() => structuredClone(battle));
  const [mode, setMode] = useState<ZoneMode>(mode0);
  const [sel, setSel] = useState<string>();
  // In the shooting step: Shoot was pressed, and a tap on an enemy in reach fires at it.
  // Fight was pressed instead (after an Advance): a tap on an enemy beside it fights it.
  const [aiming, setAiming] = useState<false | 'shoot' | 'melee'>(false);
  // Charge: the enemy tapped, waiting for the square to strike from.
  const [chargeAt, setChargeAt] = useState<string>();
  // The picked unit's orders are open over the board.
  const [menu, setMenu] = useState(false);
  // The order picked in them that waits for a square (a move, Arrive) or an enemy (Charge).
  const [order, setOrder] = useState<'advance' | 'rush' | 'charge' | 'arrive'>();
  // The spell to cast with the next order, as 'name|target id'.
  const [cast, setCast] = useState('');
  // Who its abilities on activation go to (Mend's friend, a hex's enemy); '' leaves it to the best pick.
  const [aid, setAid] = useState('');
  const [open, setOpen] = useState<Set<number>>(new Set());
  const [odds, setOdds] = useState<ZForecast | 'busy' | null>(null);
  const worker = useRef<Worker | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const { state } = useStore();
  // Each unit's portrait: its force's unit when it has one (the tracker's unit id is the force's), else one from its name.
  const forceUnits = useMemo(() => new Map(state.forces.flatMap((f) => f.units.map((u) => [u.id, u] as const))), [state.forces]);

  const mine = (s: SideIx) => z.members.some((m) => m.side === s && !m.ai);
  const anyMine = mine(0) || mine(1);
  const sideName = (s: SideIx) => z.members.filter((m) => m.side === s).map((m) => m.name).join(' & ') || `Side ${s + 1}`;
  const tone = (s: SideIx) => (anyMine ? (mine(s) ? 'mine' : 'foe') : s === 0 ? 'mine' : 'foe');

  /** Plays a step on a copy, shows it and saves it. */
  const step = (fn: (b: ZBattle) => void) => {
    const next = structuredClone(z);
    fn(next);
    setZ(next);
    onSave(next, mode);
    return next;
  };
  const clearPick = () => { setAiming(false); setChargeAt(undefined); setMenu(false); setOrder(undefined); setCast(''); setAid(''); };

  // The AI's turns (and the join step when nobody needs to pick), one at a time with a pause between.
  const aiDue = z.phase === 'join' ? !anyMine : (z.phase === 'deploy' || z.phase === 'battle') && !mine(z.turn);
  useEffect(() => {
    if (!aiDue) return;
    const t = window.setTimeout(() => step((b) => {
      if (b.phase === 'join') { autoJoin(b, 0); autoJoin(b, 1); startDeploy(b); return; }
      if (b.phase === 'deploy') { autoDeploy(b, b.turn); return; }
      if (b.pending) { attackNow(b); return; }
      const o = aiTurn(b, b.turn);
      if (o) act(b, o, true);
      else endNow(b);
    }), ACTION_PAUSE);
    return () => window.clearTimeout(t);
  }, [z, aiDue]);

  useEffect(() => () => worker.current?.terminate(), []);
  const runForecast = () => {
    worker.current?.terminate();
    const w = new Worker(new URL('../rules/zone/forecast.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setOdds('busy');
    w.onmessage = (e: MessageEvent<{ result: ZForecast }>) => { setOdds(e.data.result); w.terminate(); worker.current = null; };
    w.postMessage({ id: 1, battle: z, n: forecastSims(isPhone()) });
  };

  const unit = sel ? unitById(z, sel) : undefined;
  const myTurn = (z.phase === 'deploy' || z.phase === 'battle') && mine(z.turn);
  // The second step of a move-then-shoot: the unit that moved, to shoot now.
  const pend = z.phase === 'battle' && z.pending ? unitById(z, z.pending.unit) : undefined;
  const attacking = !!pend && myTurn;
  const canAct = !!unit && z.phase === 'battle' && myTurn && !pend && unit.side === z.turn && ready(z, unit.side).some((u) => u.id === unit.id);
  const canDeploy = !!unit && z.phase === 'deploy' && myTurn && unit.side === z.turn && toDeploy(z, unit.side).some((u) => u.id === unit.id);
  const acts = canAct ? actions(z, unit!) : [];
  const mineReady = z.phase === 'battle' && myTurn ? ready(z, z.turn) : [];
  // The squares the picked move reaches.
  const reach = useMemo(() => {
    if (!canAct || unit!.sq < 0 || (order !== 'advance' && order !== 'rush')) return new Set<number>();
    return new Set([...moves(z, unit!, order).keys()].filter((sq) => sq !== unit!.sq));
  }, [z, sel, canAct, order]);
  const charges = useMemo(() => (canAct && order === 'charge' ? chargeTargets(z, unit!) : []), [z, sel, canAct, order]);
  // On a phone the board may be scrolled off: bring it back when a pop-up comes up on it.
  useEffect(() => { if (attacking || menu) field.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }, [attacking, menu]);
  const shots = useMemo(() => {
    return attacking ? shootable({ b: z }, pend!) : [];
  }, [z, attacking]);
  const brawls = useMemo(() => (attacking && z.pending?.melee ? meleeTargets(z, pend!) : []), [z, attacking]);
  // The squares the picked charge can strike from.
  const chargeFroms = charges.find((c) => c.target.id === chargeAt)?.froms ?? [];
  const spells = useMemo(() => (canAct ? castable(z, unit!) : []), [z, sel, canAct]);
  const usable = useMemo(() => (canAct ? onActivation(z, unit!) : []), [z, sel, canAct]);
  const lit = useMemo(() => {
    if (canDeploy) return new Set(deploySquares(z, unit!));
    if (canAct && order === 'arrive') return new Set(arriveSquares(z, unit!));
    if (canAct && order === 'charge') return new Set(chargeFroms);
    return reach;
  }, [z, sel, canDeploy, canAct, reach, order, chargeAt]);
  // The enemies ringed in red: the ones the picked unit can charge, or once Shoot is pressed the ones in reach.
  const targetable = new Set(attacking ? (aiming === 'shoot' ? shots.map((t) => t.id) : aiming === 'melee' ? brawls.map((t) => t.id) : []) : charges.map((c) => c.target.id));

  // Picks the unit to deploy when it's the player's turn and nothing is picked, and the unit that's to shoot. In the
  // battle the player picks the unit to activate (a tap on it once picked holds it, so it isn't picked for them).
  useEffect(() => {
    if (!myTurn) return;
    if (pend) { if (sel !== pend.id) setSel(pend.id); return; }
    if (z.phase !== 'deploy') return;
    const pool = toDeploy(z, z.turn);
    if (!pool.some((u) => u.id === sel)) { setSel(pool[0]?.id); clearPick(); }
  }, [z, myTurn]);
  // Each of the player's turns in the battle starts with nothing picked.
  useEffect(() => { if (myTurn && z.phase === 'battle' && !z.pending) { setSel(undefined); clearPick(); } }, [myTurn, z.phase]);
  // At the start of a round the player's units in Ambush aren't on the board to tap: open the first one's orders for them.
  // Keyed on the battle, so Cancel leaves it shut until something changes (the next one placed or kept waiting).
  useEffect(() => {
    if (!myTurn || z.phase !== 'battle' || !z.placing || z.pending) return;
    const first = ready(z, z.turn)[0];
    if (!first) return;
    setSel(first.id);
    clearPick();
    setMenu(true);
  }, [z, myTurn]);

  const go = (action: Action, o: Partial<Order> = {}) => {
    if (!canAct) return;
    const k = cast.lastIndexOf('|');
    const order: Order = { unit: unit!.id, action, ...(cast ? { spell: { name: cast.slice(0, k), targets: [cast.slice(k + 1)] } } : {}), ...(aid ? { aid } : {}), ...o };
    step((b) => act(b, order, 'always'));
    clearPick();
  };
  const attackGo = (target?: string, melee = false) => {
    step((b) => attackNow(b, target, !target, melee));
    clearPick();
  };
  // Charge an enemy: straight away when there's only one square to strike from, else light them up to pick one.
  const chargeGo = (id: string) => {
    const froms = charges.find((c) => c.target.id === id)?.froms ?? [];
    if (froms.length === 1) go('charge', { target: id, to: froms[0] });
    else setChargeAt(id);
  };
  // Picks a unit: one of the player's still to act opens its orders, any other only shows.
  const pick = (u: ZUnit) => {
    setSel(u.id);
    clearPick();
    if (mineReady.includes(u)) setMenu(true);
  };
  // An order from the pop-up: Hold and Recover go at once, the rest wait for a square or an enemy.
  const choose = (a: Action) => {
    setMenu(false);
    if (a === 'hold' || a === 'idle' || a === 'wait') go(a);
    else setOrder(a);
  };
  // Back from a square or enemy to the orders.
  const back = () => { setOrder(undefined); setMenu(true); };
  const cancel = () => { setSel(undefined); clearPick(); };

  const clickSquare = (sq: number) => {
    if (canDeploy && lit.has(sq)) { step((b) => deploy(b, unit!.id, sq)); return; }
    if (attacking || menu) return;
    if (canAct && order === 'charge') { if (chargeAt && lit.has(sq)) go('charge', { target: chargeAt, to: sq }); return; }
    if (canAct && order) { if (lit.has(sq)) go(order, { to: sq }); return; }
    if (!order && z.phase === 'battle') cancel();
  };
  const clickUnit = (u: ZUnit) => {
    if (attacking) { if (targetable.has(u.id)) attackGo(u.id, aiming === 'melee'); return; }
    if (menu) return;
    if (canAct && order) {
      if (order === 'charge' && targetable.has(u.id) && !lit.has(u.sq)) chargeGo(u.id);
      // A unit already on a square the move reaches: the tap is for the square.
      else if (lit.has(u.sq)) clickSquare(u.sq);
      return;
    }
    if (z.phase === 'battle') pick(u);
    else { setSel(u.id); clearPick(); }
  };

  const toQuick = () => {
    if (!confirmAction(`Hand the rest of the battle to the AI? Rewards drop to Quick: ${Math.round(ZONE_REWARDS.quick.xp * 100)}% XP and no reward rolls.`)) return;
    setMode('quick');
    const next = structuredClone(z);
    for (const m of next.members) m.ai = true;
    setZ(next);
    onSave(next, 'quick');
  };
  const skip = () => step((b) => { for (const m of b.members) m.ai = true; playOut(b); });
  const concede = () => confirmAction('End the battle now? It is scored as it stands.') && step((b) => endNow(b));

  // ---- The pop-ups over the board: a unit's orders, the shooting step, and what a picked order waits for ----
  let pop = null;
  if (canAct && menu) {
    pop = (
      <div className="zb-pop-back" onClick={cancel}>
        <div className="zb-pop" role="dialog" onClick={(e) => e.stopPropagation()}>
          <h3>{unit!.name}</h3>
          <p className="small muted">{acts.includes('idle') ? 'Shaken: it can only spend the activation recovering.' : acts.includes('wait') ? `Waiting in Ambush.${acts.includes('arrive') ? '' : ' No square is over 9" from every enemy this round.'}` : 'What does it do?'}</p>
          <div className="zb-pop-acts">
            {acts.map((a) => (
              <button key={a} onClick={() => choose(a)}>
                <b>{ORDER_NAME[a]}</b><span className="small muted">{a === 'hold' && !hasGuns(unit!) ? 'Stay put' : ACTION_TIP[a]}</span>
              </button>
            ))}
          </div>
          {usable.length > 0 && !acts.includes('idle') && (
            <div className="zb-pop-abil small">
              <b>As it activates</b>
              {usable.map((a, i) => a.auto ? <div key={i} className="muted">{a.label}</div>
                : a.targets.length ? (
                  <label key={i} className="field small">{a.label}
                    <select value={aid} onChange={(e) => setAid(e.target.value)}>
                      <option value="">The best pick</option>
                      {a.targets.map((t) => <option key={t.id} value={t.id}>{t === unit ? 'Itself' : t.name} ({woundsLeft(t)}/{maxWoundsOf(t.p)} wounds)</option>)}
                    </select>
                  </label>
                ) : <div key={i} className="muted">{a.label}: {a.label.startsWith('Heals') ? 'nobody hurt in reach' : 'nobody in reach'}</div>)}
            </div>
          )}
          {spells.length > 0 && !acts.includes('idle') && (
            <label className="field small">Cast with this order ({unit!.tokens} token{unit!.tokens === 1 ? '' : 's'})
              <select value={cast} onChange={(e) => setCast(e.target.value)}>
                <option value="">No spell</option>
                {spells.flatMap((s) => s.targets.map((t) => <option key={`${s.spell.name}|${t.id}`} value={`${s.spell.name}|${t.id}`}>{s.spell.name} ({s.spell.threshold}) on {t.name}</option>))}
              </select>
            </label>
          )}
          <div className="row wrap"><span className="grow" /><button className="ghost" onClick={cancel}>Cancel</button></div>
        </div>
      </div>
    );
  } else if (attacking && !aiming) {
    pop = (
      <div className="zb-pop-back">
        <div className="zb-pop" role="dialog">
          <h3>{pend!.name}: {brawls.length ? 'attack' : 'shoot'}</h3>
          <p className="small muted">{shots.length ? `${shots.length} enem${shots.length === 1 ? 'y' : 'ies'} in reach.` : 'No enemy in reach of its guns from here.'}{brawls.length ? ` It can fight ${brawls.length === 1 ? 'the enemy' : 'an enemy'} beside it in melee instead (not a charge).` : ''}</p>
          <div className="row wrap">
            <span className="grow" />
            {brawls.length > 0 && <button className={shots.length ? '' : 'primary'} onClick={() => setAiming('melee')}>Fight in melee</button>}
            {shots.length > 0 && <button className="primary" onClick={() => setAiming('shoot')}>Shoot</button>}
            <button className={shots.length || brawls.length ? '' : 'primary'} onClick={() => attackGo()}>{shots.length ? 'Hold fire' : 'End activation'}</button>
          </div>
        </div>
      </div>
    );
  }
  // Above the board for the whole battle, saying what a tap does now; it keeps its place and height either way, so the
  // board doesn't jump when an order starts waiting for a square or an enemy.
  const waiting = (attacking && aiming) || (canAct && !!order);
  const hint = z.phase === 'battle' && (
    <div className={`zb-pop-hint small${waiting || (myTurn && z.placing) ? '' : ' idle'}`}>
      <span className="grow">{attacking && aiming === 'melee' ? 'Tap an enemy ringed in red, beside it, to fight it in melee (not a charge: no Impact or charge bonuses).'
        : attacking && aiming ? "Tap an enemy ringed in red to shoot it. Guns that can't reach it fire at the nearest they can."
        : canAct && order === 'charge' && chargeAt ? `${unit!.name}: tap a lit square beside ${unitById(z, chargeAt)?.name ?? 'the enemy'} to strike from there.`
        : canAct && order === 'charge' ? `${unit!.name}: tap an enemy ringed in red to charge it.`
        : canAct && order === 'arrive' ? `${unit!.name}: tap a lit square to come on from Ambush.`
        : canAct && order ? `${unit!.name}: tap a lit square to ${order === 'rush' ? 'Rush' : 'Advance'} there.`
        : attacking ? `${pend!.name} is shooting.`
        : myTurn && z.placing ? 'Start of the round: your units in Ambush wait above the board, marked in gold. Tap one to bring it on or keep it waiting.'
        : myTurn ? 'Tap a unit marked in gold to give it orders.'
        : `${sideName(z.turn)} is acting…`}</span>
      {waiting && <button className="small" onClick={() => (attacking ? setAiming(false) : chargeAt ? setChargeAt(undefined) : back())}>Back</button>}
    </div>
  );

  // ---- The board ----
  const W = z.board.w;
  const cells = Array.from({ length: W * z.board.h }, (_, i) => i);
  const here = new Map<number, ZUnit[]>();
  for (const u of onTable(z)) here.set(u.sq, [...(here.get(u.sq) ?? []), u]);
  const marker = new Map(z.board.objectives.map((o, i) => [o.sq, i]));
  const deployOf = new Map<number, SideIx>();
  if (z.phase === 'deploy' || z.phase === 'join') z.board.deploy.forEach((sqs, s) => sqs.forEach((sq) => deployOf.set(sq, s as SideIx)));
  // Until one is picked, a chevron over each unit that can still act shows what to tap.
  const cueReady = !menu && !order && !attacking;
  const lastPath = [...z.log].reverse().find((l) => l.path)?.path;

  const board = (
    <div className="zb-field" ref={field}>
    <div className="zb-board" style={{
      gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))`,
      // Short of the screen's height, so the whole board shows without scrolling (on a phone the width rules).
      maxWidth: `max(300px, calc((100vh - 190px) *${W / z.board.h}))`,
    }}>
      {cells.map((i) => {
        const [x, y] = xy(z.board, i);
        const t = z.board.terrain[i];
        const m = marker.get(i);
        const holder = m !== undefined ? z.control[m] : undefined;
        const cls = [
          'zb-sq',
          (x + 1) % 2 === 0 && x < W - 1 ? 'zr' : '', (y + 1) % 2 === 0 && y < z.board.h - 1 ? 'zb' : '',
          t ? (t.blocking ? 'blocking' : t.dangerous ? 'dangerous' : t.difficult ? 'difficult' : 'cover') : '',
          deployOf.has(i) ? `dep${tone(deployOf.get(i)!)}` : '',
          lit.has(i) ? 'lit' : '', lit.has(i) && order === 'rush' ? 'far' : '', canAct && (menu || order) && unit!.sq === i ? 'here' : '',
          lastPath && (lastPath[0] === i || lastPath[1] === i) ? 'last' : '',
        ].filter(Boolean).join(' ');
        const how = lit.has(i) && order ? ACTION_TIP[order] : '';
        const tip = [how, t ? `${t.name}: ${[t.cover && 'cover', t.difficult && 'difficult', t.dangerous && 'dangerous', t.blocking && 'impassable'].filter(Boolean).join(', ')}` : '', m !== undefined ? `Objective ${m + 1}${holder === '' || holder === undefined ? '' : holder === 'x' ? ' (contested)' : ` (held by ${sideName(holder)})`}${z.gone[m] ? ' (gone)' : ''}` : ''].filter(Boolean).join(' · ');
        return (
          <div key={i} className={cls} onClick={() => clickSquare(i)} data-tip={tip || undefined} data-zone={zoneOf(z.board, i)}>
            {t && <span className="zb-terrain">{t.name.slice(0, 1)}</span>}
            {m !== undefined && !z.gone[m] && <span className={`zb-obj${holder === 0 || holder === 1 ? ` ${tone(holder)}` : holder === 'x' ? ' x' : ''}`}>◆</span>}
            {(here.get(i) ?? []).map((u) => <Token key={u.id} u={u} fu={forceUnits.get(u.id.slice(u.id.indexOf('|') + 1))} tone={tone(u.side)} sel={u.id === sel} can={targetable.has(u.id)} cue={cueReady && mineReady.includes(u)} done={u.activated && z.phase === 'battle'} onClick={(e) => { e.stopPropagation(); clickUnit(u); }} />)}
          </div>
        );
      })}
    </div>
    <ZoneFx z={z} field={field} mine={(s) => tone(s) === 'mine'} />
    {pop}
    </div>
  );

  // At the start of a round the player's units in Ambush sit off the board: show them right above it, marked in gold.
  const ambushers = z.phase === 'battle' && z.placing && myTurn && !attacking ? mineReady.filter((u) => u.sq < 0) : [];
  const ambushStrip = ambushers.length > 0 && (
    <div className="zb-ambush small">
      <span><b>Waiting in Ambush.</b> <span className="muted">Tap one to bring it on or keep it waiting.</span></span>
      <div className="zb-ambush-row">
        {ambushers.map((u) => (
          <span key={u.id} className="zb-ambush-unit">
            <Token u={u} fu={forceUnits.get(u.id.slice(u.id.indexOf('|') + 1))} tone={tone(u.side)} sel={u.id === sel} can={false} cue={cueReady} done={false} onClick={() => pick(u)} />
            <span className="small">{u.name}</span>
          </span>
        ))}
      </div>
    </div>
  );

  // ---- The panels ----
  const vp = vpOf(z);
  const head = (
    <div className="zb-head small">
      <span className={`tag ${tone(0) === 'mine' ? 'gold' : 'red'}`}>{sideName(0)} {vp[0]}</span>
      <span className="muted">VP</span>
      <span className={`tag ${tone(1) === 'mine' ? 'gold' : 'red'}`}>{sideName(1)} {vp[1]}</span>
      <span className="grow" />
      {z.phase === 'battle' && <span>Round {z.round}/{z.rounds} · {sideName(z.turn)} to act</span>}
      {z.phase === 'deploy' && <span>Deployment · {sideName(z.turn)}</span>}
      <span className={`tag ${mode === 'command' ? 'cyan' : ''}`} data-tip={`${Math.round(ZONE_REWARDS[mode].xp * 100)}% XP${ZONE_REWARDS[mode].rolls ? ', reward rolls' : ', no reward rolls'}, no match bonus or Strategic Asset`}>{z.practice ? 'Practice' : mode === 'command' ? 'Command' : 'Quick'}</span>
    </div>
  );

  let orders;
  if (z.phase === 'join') {
    const heroes = z.units.filter((u) => mine(u.side) && isHeroUnit(u) && !u.joinedTo && joinTargets(z, u).length);
    orders = (
      <div className="zb-panel">
        <h3>Heroes join units</h3>
        <p className="small muted">A hero can join one of your units and fight as part of it, or fight on its own. Then start deployment.</p>
        {heroes.length ? heroes.map((h) => (
          <label key={h.id} className="field small">{h.name}
            <select value="" onChange={(e) => e.target.value && step((b) => joinHero(b, h.id, e.target.value))}>
              <option value="">Fights on its own</option>
              {joinTargets(z, h).map((t) => <option key={t.id} value={t.id}>Joins {t.name}</option>)}
            </select>
          </label>
        )) : <p className="muted small">No heroes left to join a unit.</p>}
        {z.units.filter((u) => mine(u.side) && u.joinedTo).map((h) => <div key={h.id} className="small muted">{h.name} joined {unitById(z, h.joinedTo!)?.name}.</div>)}
        <button className="primary" onClick={() => step((b) => { for (const s of [0, 1] as SideIx[]) if (!mine(s)) autoJoin(b, s); startDeploy(b); })}>Start deployment</button>
      </div>
    );
  } else if (z.phase === 'deploy') {
    const left = myTurn ? toDeploy(z, z.turn) : [];
    orders = (
      <div className="zb-panel">
        <h3>Deployment</h3>
        {myTurn ? (
          <>
            <p className="small muted">{deployHint(z, z.turn)}</p>
            <div className="zb-list">
              {left.map((u) => <button key={u.id} className={`ghost small${u.id === sel ? ' on' : ''}`} onClick={() => setSel(u.id)}>{u.name}{u.scout ? ' (Scout)' : ''}{u.ambush ? ' (Ambush)' : ''}</button>)}
            </div>
            {unit?.ambush && canDeploy && <button className="small" onClick={() => step((b) => deploy(b, unit.id, 'ambush'))}>Hold in Ambush</button>}
            {canDeploy && !lit.size && !unit!.ambush && <button className="small" onClick={() => step((b) => autoDeploy(b, b.turn))}>No room: keep it in reserve</button>}
            <button onClick={() => step((b) => autoDeploy(b, b.turn, true))} data-tip="Deploys every unit left, both sides">Auto-deploy</button>
          </>
        ) : <p className="small muted">{sideName(z.turn)} is deploying…</p>}
      </div>
    );
  } else if (z.phase === 'battle') {
    orders = (
      <div className="zb-panel">
        <h3>{z.placing ? (myTurn ? 'Ambush' : `${sideName(z.turn)} is placing Ambushers…`) : myTurn ? 'Your activation' : `${sideName(z.turn)} is acting…`}</h3>
        {myTurn && (() => {
          const reserve = mineReady.filter((u) => u.sq < 0);
          return (
            <>
              {/* The bar over the board says what a tap does; here, just how much of the round is left and how to look at a unit. */}
              {!attacking && (z.placing
                ? <p className="small muted">Before anyone activates, the sides take turns placing units from Ambush. Each comes on over 9" from every enemy and then activates this round as usual.{z.round >= z.rounds ? ' This is the last round: a unit placed now can\'t seize or contest markers.' : ''}</p>
                : <p className="small muted">{mineReady.length} unit{mineReady.length === 1 ? '' : 's'} left to act this round. A tap on any other unit shows its profile here.</p>)}
              {!attacking && reserve.length > 0 && (
                <div className="zb-list">
                  <span className="small muted">In Ambush:</span>
                  {reserve.map((u) => <button key={u.id} className={`ghost small${u.id === sel ? ' on' : ''}`} onClick={() => pick(u)}>{u.name}</button>)}
                </div>
              )}
            </>
          );
        })()}
      </div>
    );
  } else {
    const r = z.result!;
    orders = (
      <div className="zb-panel">
        <h3>{r.winner === 'draw' ? 'A draw' : `${sideName(r.winner)} wins`}</h3>
        <p className="small">{r.why.charAt(0).toUpperCase() + r.why.slice(1)}.</p>
        <p className="small">
          <span className="muted">Victory points:</span> {sideName(0)} {vp[0]}, {sideName(1)} {vp[1]}
          <br /><span className="muted">Points lost:</span> {sideName(0)} {r.lost[0]}, {sideName(1)} {r.lost[1]}
        </p>
        {z.practice
          ? <p className="small muted">Practice: nothing is recorded.</p>
          : <p className="small muted">Nothing is recorded until you take the result.{after ? ` ${after}` : ''}</p>}
        <button className="primary" onClick={() => onDone(z, mode)}>{z.practice ? 'Close' : 'Take the result'}</button>
      </div>
    );
  }

  // the result stands alone once it's over (a unit tapped afterwards still shows)
  useEffect(() => { if (z.phase === 'ended') setSel(undefined); }, [z.phase]);
  const card = unit && <UnitCard z={z} u={unit} />;
  const log = <BattleLog lines={z.log} open={open} setOpen={setOpen} />;
  const tools = (
    <div className="row wrap small">
      {z.phase !== 'ended' && mode === 'command' && canQuick && anyMine && <button className="small" onClick={toQuick} data-tip={`The AI plays the rest for both sides. Rewards drop to Quick: ${Math.round(ZONE_REWARDS.quick.xp * 100)}% XP, no reward rolls`}>Auto-Battle</button>}
      {z.phase !== 'ended' && !anyMine && <button className="small" onClick={skip} data-tip="The AI plays out the rest at once">Skip to the end</button>}
      {z.phase === 'battle' && <button className="small danger" onClick={concede} data-tip="Stop here and score the battle as it stands">End now</button>}
      {z.phase !== 'ended' && <button className="small" onClick={runForecast} disabled={odds === 'busy'} data-tip="The AI plays it out from here many times over">Forecast</button>}
      {odds && odds !== 'busy' && <span className="muted">{sideName(0)} {Math.round((odds.wins[0] / odds.n) * 100)}% · {sideName(1)} {Math.round((odds.wins[1] / odds.n) * 100)}% · draw {Math.round((odds.draws / odds.n) * 100)}% ({odds.n} sims)</span>}
      {odds === 'busy' && <span className="muted">Forecasting…</span>}
    </div>
  );

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="zb">
        <div className="zb-main">
          {head}
          {hint}
          {ambushStrip}
          {board}
          <p className="zb-key small muted">A letter marks terrain and ◆ an objective: hover or tap a square for its rules.</p>
          {effects.length > 0 && <ul className="zb-effects small muted">{effects.map((e) => <li key={e}>{e}</li>)}</ul>}
        </div>
        <div className="zb-side">
          {orders}
          {card}
          {tools}
          {log}
        </div>
      </div>
    </Modal>
  );
}

function Token({ u, fu, tone, sel, can, cue, done, onClick }: { u: ZUnit; fu?: Unit; tone: string; sel: boolean; can: boolean; cue: boolean; done: boolean; onClick: (e: React.MouseEvent) => void }) {
  const left = woundsLeft(u);
  const max = maxWoundsOf(u.p);
  // A target (to charge or shoot) gets a bright ring and a red chevron bobbing over it, a unit of yours that can act a gold
  // one; the token clips its portrait, so the chevron sits on a wrapper around it.
  return (
    <span className="zb-tok">
      <button data-zu={u.id} className={`zb-unit ${tone}${sel ? ' sel' : ''}${can ? ' can' : ''}${cue ? ' cue' : ''}${done ? ' done' : ''}${u.shaken ? ' shaken' : ''}`} onClick={onClick}
        data-tip={`${u.name}: ${alive(u.p).length} model${alive(u.p).length === 1 ? '' : 's'}, ${left}/${max} wounds${u.shaken ? ', Shaken' : ''}${done ? ', has acted' : ''}`}>
        {fu ? <Portrait unit={fu} title={u.name} /> : <EmblemBadge emblem={echoPortrait(u.name)} title={u.name} />}
        <span className="zb-hp" style={{ width: `${Math.round((left / Math.max(1, max)) * 100)}%` }} />
      </button>
      {(can || cue) && <svg className={`zb-aim${can ? '' : ' cue'}`} viewBox="0 0 12 8" aria-hidden="true"><path d="M1.5 1.5 6 6l4.5-4.5" /></svg>}
    </span>
  );
}

function UnitCard({ z, u }: { z: ZBattle; u: ZUnit }) {
  const kits = u.p.kits;
  return (
    <div className="zb-panel small">
      <b>{u.name}</b> <span className="muted">· {u.points} pts · {alive(u.p).length} model{alive(u.p).length === 1 ? '' : 's'} · {woundsLeft(u)}/{maxWoundsOf(u.p)} wounds{u.shaken ? ' · Shaken' : ''}{u.tokens ? ` · ${u.tokens} spell tokens` : ''}</span>
      {kits.map((k) => <div key={k.src + k.name} className="muted">{k.name}: Quality {k.quality}+, Defense {k.defense}+{k.tough > 1 ? `, Tough(${k.tough})` : ''}</div>)}
      <div className="muted">{[...new Set(u.p.guns.map((g) => g.label ? `${g.name} (${g.label})` : g.name))].join(' · ')}</div>
      {u.p.notes.length > 0 && <div className="muted" data-tip={u.p.notes.join('\n')}>Not played in full: {u.p.notes.length} rule{u.p.notes.length === 1 ? '' : 's'}</div>}
      {u.effects.length > 0 && <div>{u.effects.map((e, i) => <span key={i} className="tag">{e.from}</span>)}</div>}
      {z.phase === 'deploy' && u.sq < 0 && <div className="muted">Not deployed yet.</div>}
    </div>
  );
}

/** The log, newest first: one line each, the dice behind it on a tap. */
function BattleLog({ lines, open, setOpen }: { lines: LogLine[]; open: Set<number>; setOpen: (s: Set<number>) => void }) {
  const shown = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.kind !== 'deploy').reverse().slice(0, 80);
  const toggle = (i: number) => { const n = new Set(open); if (n.has(i)) n.delete(i); else n.add(i); setOpen(n); };
  return (
    <div className="zb-log small">
      {shown.map(({ l, i }) => (
        <div key={i} className={`zb-line ${l.kind}${l.side === undefined ? '' : ` s${l.side}`}`}>
          {l.dice?.length ? <button className="ghost small zb-dice-btn" onClick={() => toggle(i)} aria-expanded={open.has(i)}>{open.has(i) ? '▾' : '▸'}</button> : <span className="zb-dice-btn" />}
          <span>{l.text}</span>
          {open.has(i) && l.dice && (
            <div className="zb-dice">
              {l.dice.map((d, k) => <div key={k}>{d.label}{d.need ? ` (${d.need}+)` : ''}: {d.rolls.length ? d.rolls.map((r, j) => <span key={j} className={d.need ? (r >= d.need ? 'ok' : 'no') : ''}>{r}</span>) : '—'} → {d.ok}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
