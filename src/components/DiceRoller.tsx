import { useState } from 'react';
import { REWARD_TABLES, SCAR_TABLE, type RewardTableKey } from '../rules/data';
import { rollDice, rollDie } from '../rules/engine';
import { Modal, Stepper } from './ui';

const SIDES = [3, 6, 10, 20];

interface HistoryItem {
  id: number;
  label: string;
  dice: number[];
  sides: number;
  /** Success threshold and successes, if one was set. */
  target?: number;
  hits?: number;
  result?: string;
}

/** Campaign tables that can be rolled straight from the dice tray. */
const TABLES: { key: string; label: string; entries: string[] }[] = [
  ...(Object.keys(REWARD_TABLES) as RewardTableKey[]).map((k) => ({
    key: k,
    label: REWARD_TABLES[k].label,
    entries: REWARD_TABLES[k].entries.map((e) => e.text),
  })),
  { key: 'scar', label: 'Battle scars (d10)', entries: SCAR_TABLE.map((e) => `${e.name} — ${e.desc}`) },
];

let nextId = 1;

export default function DiceRoller() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a href="#" className={open ? 'active' : ''} title="Dice roller" onClick={(e) => { e.preventDefault(); setOpen(true); }}>
        🎲 Dice
      </a>
      {open && <DiceModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DiceModal({ onClose }: { onClose: () => void }) {
  const [count, setCount] = useState(6);
  const [sides, setSides] = useState(6);
  const [target, setTarget] = useState(0);
  const [table, setTable] = useState(TABLES[0].key);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const last = history[0];

  const push = (item: Omit<HistoryItem, 'id'>) => setHistory((h) => [{ ...item, id: nextId++ }, ...h].slice(0, 30));

  const roll = () => {
    const dice = rollDice(count, sides);
    const hits = target ? dice.filter((d) => d >= target).length : undefined;
    push({ label: `${count}D${sides}${target ? ` vs ${target}+` : ''}`, dice, sides, target: target || undefined, hits });
  };

  const rollTable = () => {
    const t = TABLES.find((x) => x.key === table)!;
    const r = rollDie(t.entries.length);
    push({ label: t.label, dice: [r], sides: t.entries.length, result: t.entries[r - 1] });
  };

  return (
    <Modal title="Dice roller" onClose={onClose}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field">Dice<Stepper value={count} min={1} onChange={(n) => setCount(Math.min(60, n))} /></label>
        <label className="field">
          Type
          <div className="row">
            {SIDES.map((n) => (
              <button key={n} className={sides === n ? 'primary' : ''} onClick={() => setSides(n)}>D{n}</button>
            ))}
          </div>
        </label>
        <label className="field">
          Success on
          <select value={target} onChange={(e) => setTarget(Number(e.target.value))}>
            <option value={0}>— just roll —</option>
            {Array.from({ length: sides - 1 }, (_, i) => i + 2).map((n) => <option key={n} value={n}>{n}+</option>)}
          </select>
        </label>
        <button className="primary" onClick={roll}>Roll {count}D{sides}</button>
      </div>

      <div className="row" style={{ marginTop: '0.75rem', alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1 }}>
          Campaign table
          <select value={table} onChange={(e) => setTable(e.target.value)}>
            {TABLES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <button onClick={rollTable}>🎲 Roll on table</button>
      </div>

      {last && (
        <div className="panel" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          <div className="row">
            <b>{last.label}</b>
            {last.hits != null && <span className="tag gold">{last.hits} success{last.hits === 1 ? '' : 'es'}</span>}
            {last.dice.length > 1 && <span className="muted small">total {last.dice.reduce((a, b) => a + b, 0)}</span>}
          </div>
          <div className="dice-tray">
            {last.dice.map((d, i) => <DieFace key={i} value={d} item={last} />)}
          </div>
          {last.result && <div>→ {last.result}</div>}
        </div>
      )}

      {history.length > 1 && (
        <div className="history">
          {history.slice(1).map((h) => (
            <div key={h.id} className="list-item">
              <span className="muted" style={{ minWidth: '7rem' }}>{h.label}</span>
              <span className="grow">
                {h.result ? `${h.dice[0]} → ${h.result}` : h.dice.join(' ')}
              </span>
              {h.hits != null && <span className="tag gold">{h.hits}</span>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

function DieFace({ value, item }: { value: number; item: HistoryItem }) {
  const hit = item.target ? value >= item.target : !item.result && value === item.sides;
  return <span className={`die-face${hit ? ' hit' : ''}${value === 1 && !item.result ? ' one' : ''}`}>{value}</span>;
}
