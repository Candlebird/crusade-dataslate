import { useState } from 'react';
import { AI_STYLES, AI_TREES, randomActivation, type AiAnswer } from '../rules/aiTrees';
import type { TrackerSide, TrackerUnit } from '../rules/tracker';
import { Icon } from './Icon';

/**
 * Runs one AI activation: pick a unit (at random, or the one chosen in the table), then answer its decision
 * tree's questions until it reaches an order. Done marks the unit activated.
 */
export default function AiActivation({ side, unitId, onPick, setUnit }: {
  side: TrackerSide;
  unitId: string | null;
  onPick: (unitId: string | null) => void;
  setUnit: (id: string, fn: (u: TrackerUnit) => void) => void;
}) {
  const [path, setPath] = useState<{ node: string; answer: AiAnswer }[]>([]);
  const [ignoreShaken, setIgnoreShaken] = useState(false);
  const unit = side.units.find((u) => u.id === unitId && !u.destroyed);
  const ready = side.units.filter((u) => !u.destroyed && !u.activated);

  const pick = (id: string | null) => {
    setPath([]);
    setIgnoreShaken(false);
    onPick(id);
  };
  const roll = () => pick(randomActivation(side.units)?.id ?? null);
  const finish = (fn?: (u: TrackerUnit) => void) => {
    if (unit) setUnit(unit.id, (u) => { u.activated = true; fn?.(u); });
    pick(null);
  };

  if (!unit)
    return (
      <div className="ai-activation">
        <div className="row">
          <button className="primary" disabled={!ready.length} onClick={roll}><Icon name="g:perspective-dice-six-faces-six" /> Activate a random unit</button>
          <span className="muted small">{ready.length ? `${ready.length} unit${ready.length > 1 ? 's' : ''} still to activate this round` : 'Every unit has activated this round.'}</span>
        </div>
      </div>
    );

  const tree = AI_TREES[unit.aiStyle ?? 'hybrid'];
  const last = path[path.length - 1]?.answer;
  const order = last?.act;
  const node = order ? undefined : tree.nodes[last?.go ?? tree.start];

  return (
    <div className="ai-activation">
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <b className="grow">{unit.name}{unit.activated && <span className="muted small"> (already activated)</span>}</b>
        <label className="row small muted">
          Tree
          <select value={unit.aiStyle ?? 'hybrid'} onChange={(e) => { setUnit(unit.id, (u) => void (u.aiStyle = e.target.value as TrackerUnit['aiStyle'])); setPath([]); }}>
            {AI_STYLES.map((k) => <option key={k} value={k}>{AI_TREES[k].label}</option>)}
          </select>
        </label>
        {ready.length > 1 && <button className="small" onClick={roll}>Re-roll</button>}
        <button className="ghost small" onClick={() => pick(null)}>Cancel</button>
      </div>

      {unit.shaken && !ignoreShaken ? (
        <>
          <p className="ai-order">Shaken: stay idle this activation to recover.</p>
          <div className="row">
            <button className="primary" onClick={() => finish((u) => void (u.shaken = false))}>Done: recovered, mark activated</button>
            <button className="ghost small" onClick={() => setIgnoreShaken(true)}>Use the tree anyway</button>
          </div>
        </>
      ) : (
        <>
          {path.length > 0 && (
            <ol className="ai-path small muted">
              {path.map((p, i) => <li key={i}>{tree.nodes[p.node].ask} <b>{p.answer.label}</b></li>)}
            </ol>
          )}
          {node && (
            <>
              <p className="ai-question">{node.ask}</p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                {node.answers.map((a) => (
                  <button key={a.label} onClick={() => setPath((p) => [...p, { node: last?.go ?? tree.start, answer: a }])}>{a.label}</button>
                ))}
                {path.length > 0 && <button className="ghost small" onClick={() => setPath((p) => p.slice(0, -1))}><Icon name="l:arrow-left" /> Back</button>}
              </div>
            </>
          )}
          {order && (
            <>
              <p className="ai-order">{order}</p>
              <div className="row">
                <button className="primary" onClick={() => finish()}>Done: mark activated</button>
                <button className="ghost small" onClick={() => setPath((p) => p.slice(0, -1))}><Icon name="l:arrow-left" /> Back</button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
