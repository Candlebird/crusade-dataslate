import { useState } from 'react';
import { rollDie } from '../rules/engine';
import { Modal } from './ui';

export interface PickEntry {
  name: string;
  desc?: string;
  disabled?: string;
  /** Extra data passed back on pick (e.g. relic tier). */
  meta?: unknown;
}

export interface PickGroup {
  key: string;
  label: string;
  entries: PickEntry[];
  /** Show a "roll" button; rolls 1..entries.length (d6 / d10 tables). */
  rollable?: boolean;
}

export interface Picked {
  name: string;
  group: string;
  free: boolean;
  meta?: unknown;
}

/** A modal for choosing (or rolling) an entry from one of several homebrew tables, or typing a custom one. */
export default function TablePicker({ title, groups, onPick, onClose, allowFree = true, customLabel = 'Custom' }: {
  title: string;
  groups: PickGroup[];
  onPick: (p: Picked) => void;
  onClose: () => void;
  allowFree?: boolean;
  customLabel?: string;
}) {
  const [groupKey, setGroupKey] = useState(groups[0]?.key ?? '');
  const [selected, setSelected] = useState<number | null>(null);
  const [rolled, setRolled] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [free, setFree] = useState(false);
  const group = groups.find((g) => g.key === groupKey) ?? groups[0];

  const roll = () => {
    if (!group) return;
    const r = rollDie(group.entries.length);
    setRolled(r);
    setSelected(r - 1);
  };

  const confirm = () => {
    if (custom.trim()) return onPick({ name: custom.trim(), group: 'custom', free });
    if (group && selected != null) {
      const e = group.entries[selected];
      onPick({ name: e.name, group: group.key, free, meta: e.meta });
    }
  };

  const canConfirm = custom.trim() !== '' || (selected != null && !group?.entries[selected]?.disabled);

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {allowFree && (
            <label className="row small muted" title="Free upgrades (e.g. from a reward roll) still add BP but don't use a level.">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              Free (doesn't use a level)
            </label>
          )}
          <span className="spacer" />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canConfirm} onClick={confirm}>Take it</button>
        </>
      }
    >
      {groups.length > 1 && (
        <div className="row" style={{ marginBottom: '0.6rem' }}>
          {groups.map((g) => (
            <button key={g.key} className={g.key === group?.key ? 'primary' : ''} onClick={() => { setGroupKey(g.key); setSelected(null); setRolled(null); }}>
              {g.label}
            </button>
          ))}
        </div>
      )}
      {group && (
        <>
          {group.rollable && (
            <div className="row" style={{ marginBottom: '0.6rem' }}>
              <button onClick={roll}>🎲 Roll D{group.entries.length}</button>
              {rolled != null && <span className="dice-result">{rolled}</span>}
              {rolled != null && <span>→ {group.entries[rolled - 1].name}</span>}
            </div>
          )}
          <div className="pick-list">
            {group.entries.map((e, i) => (
              <div
                key={e.name + i}
                className={`pick${selected === i ? ' selected' : ''}${e.disabled ? ' disabled' : ''}`}
                title={e.disabled}
                onClick={() => { setSelected(i); setCustom(''); }}
              >
                {group.rollable && <span className="die">{i + 1}</span>}
                <div>
                  <b>{e.name}</b>
                  {e.desc && <div className="muted small">{e.desc}</div>}
                  {e.disabled && <div className="small" style={{ color: 'var(--warn)' }}>{e.disabled}</div>}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      <label className="field" style={{ marginTop: '0.75rem' }}>
        {customLabel}
        <input value={custom} placeholder="Type a name to use something not on the table…" onChange={(e) => { setCustom(e.target.value); setSelected(null); }} />
      </label>
    </Modal>
  );
}
