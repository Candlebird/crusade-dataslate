import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import type { Force } from '../model/types';
import { AUTO_BATTLE, applyAutoBattle, autoBattle, autoBattleBlock, autoSetup, type AutoResult, type Fighter, type Move } from '../rules/autoBattle';
import { loadForce, loadUnits, sidePoints, teamName, teamsOf, type TeamKey, type TrackedBattle, type TrackerSide } from '../rules/tracker';
import { echoesBook, randomEchoes } from '../rules/echoForce';
import { ECHOES } from '../rules/nexusData';
import { Modal, Stepper, confirmAction, toast } from './ui';
import { Icon } from './Icon';

type Set = (fn: (d: TrackedBattle) => void) => void;

/**
 * No time to play it out: pick each side's force, see how the units stack up, and let them fight it out for 4 rounds.
 * With `onApply`, the result goes there instead of onto the battle (a fight that isn't on the tracker, like a Marauder
 * band's), and the AI side keeps the army it was given.
 */
export default function AutoBattleModal({ b, set, onClose, onApply, applyNote }: {
  b: TrackedBattle; set: Set; onClose: () => void; onApply?: (r: AutoResult) => void; applyNote?: string;
}) {
  const { state } = useStore();
  const [result, setResult] = useState<AutoResult | null>(null);
  // How many moves have been played back so far.
  const [shown, setShown] = useState(0);
  const setup = useMemo(() => autoSetup(b, state.forces, state.campaign), [b, state.forces, state.campaign]);
  const { fighters } = setup;
  const teams = teamsOf(b);
  const block = autoBattleBlock(b);
  const done = !!result && shown >= result.moves.length;

  const close = () => {
    if (result && !confirmAction('Leave the auto-battle? This run is thrown away and the battle stays as it was.')) return;
    onClose();
  };
  const fight = () => {
    setResult(autoBattle(fighters, Math.random, AUTO_BATTLE.rounds, setup));
    setShown(0);
  };
  const apply = () => {
    if (!result) return;
    if (onApply) {
      onApply(result);
      return onClose();
    }
    set((d) => applyAutoBattle(d, result));
    toast(result.winner === 'draw' ? 'Auto-battle: a draw.' : `Auto-battle: ${teamName(b, result.winner)} wins.`);
    onClose();
  };

  let body;
  let footer;
  if (!result) {
    body = (
      <>
        <p className="muted small">
          Each unit gets an <b>Attack</b> (expected wounds a round against a 5-model Defense 4+ unit, shooting / in melee) and a <b>Defense</b> (plain hits it takes
          to lose a wound), worked out from its Quality, Defense, weapons, weapon rules and traits, upgrades, relics, scars and level. Hover a unit to see why.
          Then the teams take turns, each unit attacking once a round, for {AUTO_BATTLE.rounds} rounds. A unit brought to half strength, or beaten in melee,
          takes a Morale test (a Quality test): failing leaves it <b>Shaken</b>, so it can't strike back and spends its next turn rallying.
          Units start the auto-battle as they are on the tracker.
        </p>
        {setup.effects.length > 0 && (
          <div className="small">
            <b>In play</b>
            <ul style={{ margin: '0.25rem 0', paddingLeft: '1.2rem' }}>{setup.effects.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        <div className="auto-teams">
          {teams.map((t) => (
            <div key={t} className={`auto-team team-${t}`}>
              <h3>{teamName(b, t)}</h3>
              {b.sides.filter((s) => s.team === t).map((s) => <SideSetup key={s.id} b={b} side={s} set={set} fixedAi={!!onApply} />)}
              <FighterTable fighters={fighters.filter((f) => f.team === t)} />
            </div>
          ))}
        </div>
      </>
    );
    footer = (
      <>
        {block && <span className="tag red">{block}</span>}
        <span className="spacer" />
        <button onClick={close}>Cancel</button>
        <button className="primary" disabled={!!block} onClick={fight}><Icon name="g:crossed-swords" /> Fight</button>
      </>
    );
  } else {
    const moves = result.moves.slice(0, shown);
    const hp = hpAfter(fighters, moves);
    const round = moves.length ? moves[moves.length - 1].round : 1;
    const byKey = new Map(fighters.map((f) => [f.key, f]));
    const nextRoundAt = result.moves.findIndex((m, i) => i >= shown && m.round > (result.moves[shown]?.round ?? 0));
    body = (
      <>
        <div className="auto-teams">
          {teams.map((t) => (
            <div key={t} className={`auto-team team-${t}`}>
              <h3>{teamName(b, t)}</h3>
              {fighters.filter((f) => f.team === t).map((f) => <HpBar key={f.key} f={f} hp={hp.get(f.key)!} />)}
            </div>
          ))}
        </div>
        <h3>Round {round} of {AUTO_BATTLE.rounds} <span className="muted small">· move {shown} of {result.moves.length}</span></h3>
        <ol className="auto-log small" reversed>
          {[...moves].reverse().map((m, i) => <li key={moves.length - i}><MoveText m={m} byKey={byKey} b={b} /></li>)}
        </ol>
        {done && (
          <p className="auto-result">
            <b>{result.winner === 'draw' ? 'A draw.' : `${teamName(b, result.winner)} wins.`}</b>{' '}
            <span className="muted">
              Army lost: {teams.map((t) => `${teamName(b, t)} ${Math.round((result.lost[t] ?? 0) * 100)}%`).join(', ')}.
              The side that lost the smaller share wins; within {AUTO_BATTLE.drawMargin * 100} points of each other is a draw.
            </span>
          </p>
        )}
      </>
    );
    footer = done ? (
      <>
        <span className="muted small">{applyNote ?? 'Applying ends the battle with these losses and kill XP; record it for each force as usual.'}</span>
        <span className="spacer" />
        <button onClick={fight} title="Throw this run away and fight again"><Icon name="g:perspective-dice-six-faces-six" /> Fight again</button>
        <button className="primary" onClick={apply}><Icon name="l:check" /> Apply result</button>
      </>
    ) : (
      <>
        <span className="spacer" />
        <button onClick={() => setShown(shown + 1)}>Next move</button>
        <button onClick={() => setShown(nextRoundAt < 0 ? result.moves.length : nextRoundAt)}>Finish round</button>
        <button className="primary" onClick={() => setShown(result.moves.length)}>Skip to end</button>
      </>
    );
  }
  return <Modal title={<><Icon name="g:power-lightning" /> Auto-battle</>} onClose={close} footer={footer} wide>{body}</Modal>;
}

/** Wounds left on every unit after the moves so far. */
function hpAfter(fighters: Fighter[], moves: Move[]) {
  const hp = new Map(fighters.map((f) => [f.key, f.hp]));
  for (const m of moves) {
    hp.set(m.attacker, m.attackerHp);
    if (m.target) hp.set(m.target, m.targetHp);
  }
  return hp;
}

function SideSetup({ b, side, set, fixedAi }: { b: TrackedBattle; side: TrackerSide; set: Set; fixedAi?: boolean }) {
  const { state } = useStore();
  const forces: Force[] = state.forces;
  const force = forces.find((f) => f.id === side.forceId);
  const taken = new Set(b.sides.filter((x) => x.id !== side.id).map((x) => x.forceId));
  const setSide = (fn: (s: TrackerSide) => void) => set((d) => { const s = d.sides.find((x) => x.id === side.id); if (s) fn(s); });
  const book = echoesBook(state.books);
  const enemies = b.sides.filter((x) => x.team !== side.team).reduce((n, x) => n + sidePoints(x), 0);
  const [target, setTarget] = useState(enemies || 1000);
  const pick = (forceId: string, listId: string) => {
    const f = forces.find((x) => x.id === forceId);
    if (!f) return setSide((s) => Object.assign(s, { forceId: undefined, listId: undefined, units: [], roster: undefined, bp: 0, manipulations: [] }));
    setSide((s) => loadForce(s, f, f.lists?.find((l) => l.id === listId), state.settings, state.campaign));
  };
  const generate = () => {
    if (!book) return;
    if (side.units.length && !confirmAction(`Replace ${side.name}'s ${side.units.length} units with a random ${ECHOES.name} army?`)) return;
    const units = randomEchoes(book, target);
    setSide((s) => loadUnits(s, ECHOES.name, units));
  };
  return (
    <div className="auto-side">
      <div className="small"><b>{side.name}</b>{side.ai ? ' (AI)' : ''} <span className="muted">· {sidePoints(side)} pts</span></div>
      {side.ai ? (
        fixedAi ? null : book ? (
          <div className="row small">
            <Stepper value={target} step={50} min={50} onChange={setTarget} /> pts
            <button onClick={generate} title={`A random ${ECHOES.name} army up to the target points`}><Icon name="g:perspective-dice-six-faces-six" /> Generate</button>
          </div>
        ) : !side.units.length && <div className="muted small">Import the {ECHOES.name} book to generate an army, or set it up on the tracker.</div>
      ) : (
        <div className="row small">
          <select value={side.forceId ?? ''} onChange={(e) => pick(e.target.value, '')} aria-label={`${side.name}'s force`}>
            <option value="">Pick a force…</option>
            {forces.map((f) => <option key={f.id} value={f.id} disabled={taken.has(f.id)}>{f.name}</option>)}
          </select>
          {force && (force.lists ?? []).length > 0 && (
            <select value={side.listId ?? ''} onChange={(e) => pick(force.id, e.target.value)} aria-label={`${side.name}'s army list`}>
              <option value="">Every active unit</option>
              {force.lists!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

function FighterTable({ fighters }: { fighters: Fighter[] }) {
  if (!fighters.length) return <p className="muted small">No units yet.</p>;
  const total = (k: 'attack' | 'def') => Math.round(fighters.reduce((n, f) => n + f[k], 0) * 10) / 10;
  return (
    <div className="table-wrap">
      <table className="compact">
        <thead>
          <tr><th>Unit</th><th title="Expected wounds a round: shooting / melee">Attack</th><th title="Plain hits to lose one wound">Defense</th><th>Wounds</th></tr>
        </thead>
        <tbody>
          {fighters.map((f) => (
            <tr key={f.key} title={f.notes.join('\n')}>
              <td>
                <details>
                  <summary>{f.name}</summary>
                  <ul className="muted small" style={{ margin: 0, paddingLeft: '1rem' }}>{f.notes.map((n) => <li key={n}>{n}</li>)}</ul>
                </details>
              </td>
              <td><b>{f.attack}</b> <span className="muted small">{f.shoot} / {f.melee}</span></td>
              <td><b>{f.def}</b></td>
              <td>{f.hp}/{f.maxHp}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><th>Total</th><th>{total('attack')}</th><th className="muted small">avg {Math.round((total('def') / fighters.length) * 10) / 10}</th><th>{fighters.reduce((n, f) => n + f.hp, 0)}</th></tr>
        </tfoot>
      </table>
    </div>
  );
}

function HpBar({ f, hp }: { f: Fighter; hp: number }) {
  const pct = (hp / f.maxHp) * 100;
  return (
    <div className={`auto-hp${hp <= 0 ? ' dead' : ''}`} title={`${hp}/${f.maxHp} wounds`}>
      <div className="row small"><span className="grow">{hp <= 0 ? <><Icon name="g:death-skull" /> </> : null}{f.name}</span><span className="muted">{hp}/{f.maxHp}</span></div>
      <div className="auto-hp-track"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function MoveText({ m, byKey, b }: { m: Move; byKey: Map<string, Fighter>; b: TrackedBattle }) {
  const a = byKey.get(m.attacker)!;
  const t = m.target ? byKey.get(m.target) : undefined;
  const who = (f: Fighter) => <span className={`team-${f.team}`} style={{ color: 'var(--team)' }}>{f.name}</span>;
  const side = (team: TeamKey) => b.sides.length > 2 ? <span className="muted"> ({teamName(b, team)})</span> : null;
  // What its abilities did along the way.
  const notes = m.notes?.length ? <span className="muted"> ({m.notes.join('; ')})</span> : null;
  if (m.kind === 'rally') return <>R{m.round}: {who(a)}{side(a.team)} is Shaken, and spends its turn rallying.{notes}</>;
  if (m.kind === 'stunned') return <>R{m.round}: {who(a)}{side(a.team)} is <b>stunned</b>, and loses its turn.{notes}</>;
  if (m.kind === 'return') return <>R{m.round}: {who(a)}{side(a.team)} <b>returns at full strength</b> (Endless Tide)!</>;
  if (m.kind === 'heal' && t) return <>R{m.round}: {who(a)}{side(a.team)} heals {who(t)} for <b>{m.dmg}</b>.{notes}</>;
  if (m.kind === 'advance' || !t) return <>R{m.round}: {who(a)}{side(a.team)} advances{t && m.targetHp <= 0 ? <>; {who(t)} <b>destroyed!</b></> : null}.{notes}</>;
  const shaken = (m.shaken ?? []).map((k) => byKey.get(k)?.name).filter(Boolean);
  return (
    <>
      R{m.round}: {who(a)}{side(a.team)} {m.kind === 'charge' ? 'charges' : 'shoots'} {who(t)}{side(t.team)}:{' '}
      {m.hazard ? <>loses <b>{m.hazard}</b> to the minefield on the way in; </> : null}
      {m.dmg ? <b>{m.dmg} wound{m.dmg === 1 ? '' : 's'}</b> : 'no damage'}
      {m.targetHp <= 0 && <> — <b>destroyed!</b></>}
      {m.kind === 'charge' && m.targetHp > 0 && (m.cowed ? '; too Shaken to strike back'
        : <>; strikes back for {m.back ? <b>{m.back}</b> : 'nothing'}{m.attackerHp <= 0 && <> — <b>{a.name} destroyed!</b></>}</>)}
      {shaken.length > 0 && <>. <b>{shaken.join(' and ')} {shaken.length > 1 ? 'are' : 'is'} Shaken.</b></>}
      {notes}
    </>
  );
}
