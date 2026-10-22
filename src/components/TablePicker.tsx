import { useState } from 'react';
import { rollUntilNew } from '../rules/engine';
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
  /** Only used when a rule says so: hidden behind a "show" link, with this warning above the table when open. */
  restricted?: string;
}

export interface Picked {
  name: string;
  group: string;
  free: boolean;
  meta?: unknown;
}

/** A modal for choosing (or rolling) an entry from one of several homebrew tables, or typing a custom one. */
export default function TablePicker({ title, groups, onPick, onClose, allowFree = true, freeLabel, customLabel = 'Custom', check, owned = [], defaultFree = false, intro }: {
  title: string;
  groups: PickGroup[];
  onPick: (p: Picked) => void;
  onClose: () => void;
  allowFree?: boolean;
  /** Overrides the "Free (doesn't use a level)" checkbox text. */
  freeLabel?: string;
  customLabel?: string;
  /** Why the current choice can't be taken yet (e.g. not enough RP), shown in the footer; null when it can. */
  check?: (entry: PickEntry | null, free: boolean) => string | null;
  /** Names already had: rolls skip them (rerolling), and they're marked in the list. */
  owned?: string[];
  defaultFree?: boolean;
  /** Shown above the tables, e.g. "Trait 2 of 2". */
  intro?: React.ReactNode;
}) {
  const [showRestricted, setShowRestricted] = useState(false);
  const shown = groups.filter((g) => showRestricted || !g.restricted);
  const [groupKey, setGroupKey] = useState(shown[0]?.key ?? '');
  const [selected, setSelected] = useState<number | null>(null);
  const [rolls, setRolls] = useState<number[]>([]);
  const [custom, setCustom] = useState('');
  const [free, setFree] = useState(defaultFree);
  const group = shown.find((g) => g.key === groupKey) ?? shown[0];
  const have = new Set(owned.map((n) => n.toLowerCase()));
  const isOwned = (e?: PickEntry) => !!e && have.has(e.name.toLowerCase());
  const rolled = rolls.length ? rolls[rolls.length - 1] : null;

  const pickGroup = (key: string) => { setGroupKey(key); setSelected(null); setRolls([]); };

  const roll = () => {
    if (!group?.entries.length) return;
    const r = rollUntilNew(group.entries.length, (face) => isOwned(group.entries[face - 1]));
    setRolls(r);
    setSelected(r[r.length - 1] - 1);
  };

  const confirm = () => {
    if (custom.trim()) return onPick({ name: custom.trim(), group: 'custom', free });
    if (group && selected != null) {
      const e = group.entries[selected];
      onPick({ name: e.name, group: group.key, free, meta: e.meta });
    }
  };

  const chosen = custom.trim() ? { name: custom.trim() } : group && selected != null ? group.entries[selected] : null;
  const blocked = chosen && check ? check(chosen, free) : null;
  const canConfirm = !blocked && (custom.trim() !== '' || (selected != null && !group?.entries[selected]?.disabled));

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          {allowFree && (
            <label className="row small muted" title="Free upgrades (e.g. from a reward roll) still add BP but don't use a level.">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              {freeLabel ?? "Free (doesn't use a level)"}
            </label>
          )}
          <span className="spacer" />
          {blocked && <span className="small" style={{ color: 'var(--warn)' }}>{blocked}</span>}
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!canConfirm} onClick={confirm}>Take it</button>
        </>
      }
    >
      {intro}
      {(shown.length > 1 || shown.length < groups.length) && (
        <div className="row" style={{ marginBottom: '0.6rem' }}>
          {shown.map((g) => (
            <button key={g.key} className={g.key === group?.key ? 'primary' : ''} onClick={() => pickGroup(g.key)}>
              {g.label}
            </button>
          ))}
          {shown.length < groups.length && (
            <button className="ghost small muted" onClick={() => setShowRestricted(true)} title="Only when a reward, relic or Nexus effect tells you to">
              Show unique tables…
            </button>
          )}
        </div>
      )}
      {group && (
        <>
          {group.restricted && <p className="small" style={{ color: 'var(--warn)' }}>⚠ {group.restricted}</p>}
          {group.rollable && group.entries.length > 0 && (
            <div className="row" style={{ marginBottom: '0.6rem' }}>
              <button onClick={roll}>🎲 Roll D{group.entries.length}</button>
              {rolls.slice(0, -1).map((r, i) => (
                <span key={i} className="muted small" title="Already had — rerolled"><s>{r} {group.entries[r - 1].name}</s></span>
              ))}
              {rolled != null && <span className="dice-result">{rolled}</span>}
              {rolled != null && <span>→ {group.entries[rolled - 1].name}{isOwned(group.entries[rolled - 1]) ? ' (already had — nothing left to reroll into)' : ''}</span>}
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
                  <b>{e.name}</b>{isOwned(e) && <span className="tag" style={{ marginLeft: '0.4rem' }}>Have it</span>}
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
