import { useEffect, useMemo, useRef, useState } from 'react';
import { aiTurn } from '../rules/zone/ai';
import { xy, zoneOf } from '../rules/zone/board';
import { castable, act, attackNow, actions, arriveSquares, autoDeploy, autoJoin, chargeTargets, deploy, deploySquares, endNow, isHeroUnit, joinHero, joinTargets, moves, ready, startDeploy, toDeploy, vpOf, type Action, type Order } from '../rules/zone/engine';
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
// A unit that moves and then shoots does it in two steps: the move, then (with the board as it now stands) the shooting.

/** The pause after each action, in ms (the same as the Sortie's). */
export const ACTION_PAUSE = 600;

const ACTION_TEXT: Record<Action, string> = {
  hold: 'Hold', advance: 'Advance', rush: 'Rush', charge: 'Charge', idle: 'Recover', arrive: 'Arrive',
};
const ACTION_TIP: Record<Action, string> = {
  hold: 'Stay put and shoot with every gun that reaches',
  advance: 'Move 1 square (6"), then shoot',
  rush: 'Move 2 squares (12"), no shooting',
  charge: 'Move up to 2 squares into an enemy and fight in melee',
  idle: 'Shaken: spend the activation recovering',
  arrive: 'Come on from Ambush, over 9" from every enemy',
};

const isPhone = () => typeof window !== 'undefined' && !!window.matchMedia?.('(max-width: 700px)').matches;

/** Plays a battle on screen. `onSave` gets every step; `onDone` the ended battle, once the player takes the result. */
export default function ZoneBattleModal({ battle, mode: mode0, effects = [], title, canQuick = true, onSave, onDone, onClose }: {
  battle: ZBattle; mode: ZoneMode; effects?: string[]; title: string; canQuick?: boolean;
  onSave: (z: ZBattle, mode: ZoneMode) => void; onDone: (z: ZBattle, mode: ZoneMode) => void; onClose: () => void;
}) {
  const [z, setZ] = useState<ZBattle>(() => structuredClone(battle));
  const [mode, setMode] = useState<ZoneMode>(mode0);
  const [sel, setSel] = useState<string>();
  const [action, setAction] = useState<Action>();
  const [to, setTo] = useState<number>();
  const [target, setTarget] = useState<string>();
  const [spell, setSpell] = useState<string>('');
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
  const clearPick = () => { setAction(undefined); setTo(undefined); setTarget(undefined); setSpell(''); };

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
  const moveMap = useMemo(() => (canAct && (action === 'advance' || action === 'rush') ? moves(z, unit!, action) : undefined), [z, sel, action, canAct]);
  const charges = useMemo(() => (canAct && action === 'charge' ? chargeTargets(z, unit!) : []), [z, sel, action, canAct]);
  const shots = useMemo(() => {
    if (attacking) return shootable({ b: z }, pend!);
    return canAct && unit!.sq >= 0 && action === 'hold' ? shootable({ b: z }, unit!) : [];
  }, [z, sel, action, canAct, attacking]);
  const spells = useMemo(() => (canAct ? castable(z, unit!) : []), [z, sel, canAct]);
  const lit = useMemo(() => {
    if (canDeploy) return new Set(deploySquares(z, unit!));
    if (canAct && action === 'arrive') return new Set(arriveSquares(z, unit!));
    if (moveMap) return new Set([...moveMap.keys()].filter((sq) => sq !== unit!.sq));
    return new Set<number>();
  }, [z, sel, action, canDeploy, canAct, moveMap]);
  const targetable = new Set(action === 'charge' ? charges.map((c) => c.target.id) : shots.map((t) => t.id));

  // Picks the unit to deploy or activate when it's the player's turn and nothing is picked.
  useEffect(() => {
    if (!myTurn) return;
    if (pend) { if (sel !== pend.id) setSel(pend.id); return; }
    const pool = z.phase === 'deploy' ? toDeploy(z, z.turn) : ready(z, z.turn);
    if (!pool.some((u) => u.id === sel)) { setSel(pool[0]?.id); clearPick(); }
  }, [z, myTurn]);

  const go = (o: Partial<Order> = {}) => {
    if (!unit || !action) return;
    const order: Order = { unit: unit.id, action, to, target, ...(spell ? { spell: { name: spell, targets: [spellTarget()].filter(Boolean) as string[] } } : {}), ...o };
    step((b) => act(b, order, true));
    clearPick();
  };
  const attackGo = (holdFire = false) => {
    step((b) => attackNow(b, holdFire ? undefined : target, holdFire));
    clearPick();
  };
  const spellTarget = () => {
    const s = spells.find((x) => x.spell.name === spell);
    if (!s) return undefined;
    return s.targets.find((t) => t.id === target)?.id ?? s.targets[0]?.id;
  };

  const clickSquare = (sq: number) => {
    if (canDeploy && lit.has(sq)) { step((b) => deploy(b, unit!.id, sq)); return; }
    if (canAct && lit.has(sq)) {
      if (action === 'arrive') { step((b) => act(b, { unit: unit!.id, action: 'arrive', to: sq })); clearPick(); return; }
      setTo(sq);
    }
  };
  const clickUnit = (u: ZUnit) => {
    if ((canAct || attacking) && u.side !== unit!.side && targetable.has(u.id)) { setTarget(u.id === target ? undefined : u.id); return; }
    setSel(u.id);
    clearPick();
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

  // ---- The board ----
  const W = z.board.w;
  const cells = Array.from({ length: W * z.board.h }, (_, i) => i);
  const here = new Map<number, ZUnit[]>();
  for (const u of onTable(z)) here.set(u.sq, [...(here.get(u.sq) ?? []), u]);
  const marker = new Map(z.board.objectives.map((o, i) => [o.sq, i]));
  const deployOf = new Map<number, SideIx>();
  if (z.phase === 'deploy' || z.phase === 'join') z.board.deploy.forEach((sqs, s) => sqs.forEach((sq) => deployOf.set(sq, s as SideIx)));
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
          lit.has(i) ? 'lit' : '', to === i ? 'to' : '',
          lastPath && (lastPath[0] === i || lastPath[1] === i) ? 'last' : '',
        ].filter(Boolean).join(' ');
        const tip = [t ? `${t.name}: ${[t.cover && 'cover', t.difficult && 'difficult', t.dangerous && 'dangerous', t.blocking && 'impassable'].filter(Boolean).join(', ')}` : '', m !== undefined ? `Objective ${m + 1}${holder === '' || holder === undefined ? '' : holder === 'x' ? ' (contested)' : ` (held by ${sideName(holder)})`}${z.gone[m] ? ' (gone)' : ''}` : ''].filter(Boolean).join(' · ');
        return (
          <div key={i} className={cls} onClick={() => clickSquare(i)} data-tip={tip || undefined} data-zone={zoneOf(z.board, i)}>
            {t && <span className="zb-terrain">{t.name.slice(0, 1)}</span>}
            {m !== undefined && !z.gone[m] && <span className={`zb-obj${holder === 0 || holder === 1 ? ` ${tone(holder)}` : holder === 'x' ? ' x' : ''}`}>◆</span>}
            {(here.get(i) ?? []).map((u) => <Token key={u.id} u={u} fu={forceUnits.get(u.id.slice(u.id.indexOf('|') + 1))} tone={tone(u.side)} sel={u.id === sel} aim={u.id === target} can={targetable.has(u.id)} done={u.activated && z.phase === 'battle'} onClick={(e) => { e.stopPropagation(); clickUnit(u); }} />)}
          </div>
        );
      })}
    </div>
    <ZoneFx z={z} field={field} mine={(s) => tone(s) === 'mine'} />
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
            <p className="small muted">Pick a unit, then a lit square in your zone. Deployment alternates; Scouts go last.</p>
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
    const mineReady = myTurn ? ready(z, z.turn) : [];
    orders = (
      <div className="zb-panel">
        <h3>{attacking ? `${pend!.name}: shoot` : myTurn ? 'Your activation' : `${sideName(z.turn)} is acting…`}</h3>
        {attacking && (
          <>
            <p className="small muted">
              {target ? `Shooting at ${unitById(z, target)?.name}; guns that can't reach it pick the nearest they can.` : 'Guns shoot at the nearest enemy they reach; tap a ringed enemy to pick a target.'}
            </p>
            <div className="row wrap">
              <button className="primary" onClick={() => attackGo()}>Shoot</button>
              <button className="small" onClick={() => attackGo(true)} data-tip="End the activation without shooting">Hold fire</button>
            </div>
          </>
        )}
        {myTurn && !attacking && (
          <>
            <div className="zb-list">
              {mineReady.map((u) => <button key={u.id} className={`ghost small${u.id === sel ? ' on' : ''}`} onClick={() => { setSel(u.id); clearPick(); }}>{u.name}{u.shaken ? ' (Shaken)' : ''}{u.sq < 0 ? ' (Ambush)' : ''}</button>)}
            </div>
            {canAct && (
              <>
                <div className="row wrap">
                  {acts.map((a) => <button key={a} className={action === a ? 'primary small' : 'small'} onClick={() => { setAction(a); setTo(undefined); setTarget(undefined); }} data-tip={ACTION_TIP[a]}>{ACTION_TEXT[a]}</button>)}
                </div>
                {spells.length > 0 && action && action !== 'idle' && (
                  <label className="field small">Cast ({unit!.tokens} token{unit!.tokens === 1 ? '' : 's'})
                    <select value={spell} onChange={(e) => setSpell(e.target.value)}>
                      <option value="">No spell</option>
                      {spells.map((s) => <option key={s.spell.name} value={s.spell.name}>{s.spell.name} ({s.spell.threshold}) on {s.targets.find((t) => t.id === target)?.name ?? s.targets[0].name}</option>)}
                    </select>
                  </label>
                )}
                {action && (
                  <p className="small muted">
                    {action === 'advance' || action === 'rush' ? (to === undefined ? 'Pick a lit square to move to (or go to stay put). ' : 'Square picked. ') : ''}
                    {action === 'charge' ? (target ? `Charging ${unitById(z, target)?.name}. ` : 'Pick an enemy ringed in red to charge. ') : ''}
                    {action === 'advance' ? 'It shoots after the move, at what it can see from there. ' : ''}
                    {action === 'hold' && shots.length ? (target ? `Shooting at ${unitById(z, target)?.name}; guns that can't reach it pick the nearest they can. ` : 'Guns shoot at the nearest enemy they reach; tap a ringed enemy to pick a target. ') : ''}
                    {action === 'arrive' ? 'Pick a lit square to arrive on.' : ''}
                  </p>
                )}
                {action && action !== 'arrive' && <button className="primary" disabled={action === 'charge' && !target} onClick={() => go()}>Go</button>}
              </>
            )}
          </>
        )}
      </div>
    );
  } else {
    const r = z.result!;
    orders = (
      <div className="zb-panel">
        <h3>{r.winner === 'draw' ? 'A draw' : `${sideName(r.winner)} wins`}</h3>
        <p className="small">{r.why}. Points lost: {sideName(0)} {r.lost[0]}, {sideName(1)} {r.lost[1]}.</p>
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
      {z.phase !== 'ended' && mode === 'command' && canQuick && anyMine && <button className="ghost small" onClick={toQuick}>Hand over to the AI</button>}
      {z.phase !== 'ended' && !anyMine && <button className="ghost small" onClick={skip}>Skip to the end</button>}
      {z.phase === 'battle' && <button className="ghost small" onClick={concede}>End now</button>}
      {z.phase !== 'ended' && <button className="ghost small" onClick={runForecast} disabled={odds === 'busy'} data-tip="The AI plays it out from here many times over">Forecast</button>}
      {odds && odds !== 'busy' && <span className="muted">{sideName(0)} {Math.round((odds.wins[0] / odds.n) * 100)}% · {sideName(1)} {Math.round((odds.wins[1] / odds.n) * 100)}% · draw {Math.round((odds.draws / odds.n) * 100)}% ({odds.n} sims)</span>}
      {odds === 'busy' && <span className="muted">Forecasting…</span>}
    </div>
  );

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="zb">
        <div className="zb-main">
          {head}
          {board}
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

function Token({ u, fu, tone, sel, aim, can, done, onClick }: { u: ZUnit; fu?: Unit; tone: string; sel: boolean; aim: boolean; can: boolean; done: boolean; onClick: (e: React.MouseEvent) => void }) {
  const left = woundsLeft(u);
  const max = maxWoundsOf(u.p);
  return (
    <button data-zu={u.id} className={`zb-unit ${tone}${sel ? ' sel' : ''}${aim ? ' aim' : ''}${can ? ' can' : ''}${done ? ' done' : ''}${u.shaken ? ' shaken' : ''}`} onClick={onClick}
      data-tip={`${u.name}: ${alive(u.p).length} model${alive(u.p).length === 1 ? '' : 's'}, ${left}/${max} wounds${u.shaken ? ', Shaken' : ''}${done ? ', has acted' : ''}`}>
      {fu ? <Portrait unit={fu} title={u.name} /> : <EmblemBadge emblem={echoPortrait(u.name)} title={u.name} />}
      <span className="zb-hp" style={{ width: `${Math.round((left / Math.max(1, max)) * 100)}%` }} />
    </button>
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
