import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LEVEL_THRESHOLDS } from '../rules/data';
import { xpProgress, type Issue } from '../rules/engine';

export function Modal({ title, onClose, children, footer, wide }: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={wide ? { maxWidth: 980 } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** A relic in a dropdown, greyed out with who holds it when it's already claimed. */
export function RelicOption({ name, label = name, taken }: { name: string; label?: string; taken?: string }) {
  return <option value={name} disabled={!!taken}>{taken ? `${label} — ${taken.charAt(0).toLowerCase()}${taken.slice(1)}` : label}</option>;
}

export function Stepper({ value, onChange, step = 1, min }: { value: number; onChange: (n: number) => void; step?: number; min?: number }) {
  const clamp = (n: number) => (min != null ? Math.max(min, n) : n);
  return (
    <span className="stepper">
      <button type="button" onClick={() => onChange(clamp(value - step))}>−</button>
      <input type="number" value={value} onChange={(e) => onChange(clamp(Number(e.target.value) || 0))} />
      <button type="button" onClick={() => onChange(clamp(value + step))}>+</button>
    </span>
  );
}

/** Text input that commits on blur/Enter, so typing doesn't spam the store. */
export function TextField({ value, onCommit, placeholder, className }: {
  value: string;
  onCommit: (s: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      className={className}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function TextArea({ value, onCommit, rows = 3, placeholder }: { value: string; onCommit: (s: string) => void; rows?: number; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea rows={rows} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} />;
}

export function XpBar({ xp, mini }: { xp: number; mini?: boolean }) {
  const p = xpProgress(xp);
  const label = p.next == null ? `LVL ${p.level} · ${xp} XP · ${p.replacements} swap(s)` : `LVL ${p.level} · ${xp} / ${p.next} XP`;
  return (
    <div>
      <div className={`xpbar${mini ? ' mini' : ''}`} title={label}>
        <div style={{ width: `${Math.round(p.pct * 100)}%` }} />
        {!mini && <span>{label}</span>}
      </div>
      {!mini && (
        <div className="levels">
          {LEVEL_THRESHOLDS.map((t, i) => (
            <i key={t} className={i < p.level ? 'on' : ''} title={`Level ${i + 1} at ${t} XP`} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Issues({ issues }: { issues: Issue[] }) {
  if (!issues.length) return <p className="muted small">No issues. The Emperor approves.</p>;
  return (
    <ul className="issues">
      {issues.map((i, n) => (
        <li key={n} className={i.level}>{i.text}</li>
      ))}
    </ul>
  );
}

export function Dropzone({ onFiles, accept, children }: { onFiles: (files: File[]) => void; accept?: string; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  return (
    <div
      className={`dropzone${over ? ' over' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
    >
      {children}
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple
        hidden
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// ---- toasts ----

type ToastMsg = { text: string; kind: 'ok' | 'error' };
const listeners = new Set<(t: ToastMsg) => void>();

export function toast(text: string, kind: ToastMsg['kind'] = 'ok') {
  listeners.forEach((l) => l({ text, kind }));
}

export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    const on = (t: ToastMsg) => {
      setMsg(t);
      clearTimeout(timer);
      timer = window.setTimeout(() => setMsg(null), 3500);
    };
    listeners.add(on);
    return () => {
      listeners.delete(on);
      clearTimeout(timer);
    };
  }, []);
  return msg ? <div className={`toast ${msg.kind === 'error' ? 'error' : ''}`}>{msg.text}</div> : null;
}

export const confirmAction = (text: string) => window.confirm(text);

// ---- collapsible panels ----

const COLLAPSED_KEY = 'opr-collapsed-panels';

function readCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '{}') as Record<string, boolean>;
  } catch {
    return {};
  }
}

/** Whether a panel is folded away. Remembered per device, by `id`, so the same panel stays shut on every force or unit. */
export function useCollapsed(id: string, initial = false): [boolean, () => void] {
  const [closed, setClosed] = useState<boolean>(() => readCollapsed()[id] ?? initial);
  const toggle = () => {
    const next = !closed;
    setClosed(next);
    try {
      const all = readCollapsed();
      if (next === initial) delete all[id];
      else all[id] = next;
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(all));
    } catch {
      // Storage full or blocked: the panel still folds, it just won't be remembered.
    }
  };
  return [closed, toggle];
}

/** A panel whose body can be folded away with the chevron next to its heading. `extra` stays visible either way. */
export function Panel({ id, title, extra, h = 2, className, domId, collapsed, lead, children }: {
  id: string;
  title: ReactNode;
  extra?: ReactNode;
  h?: 2 | 3;
  className?: string;
  domId?: string;
  /** Start folded until the user opens it. */
  collapsed?: boolean;
  /** Shown above the children even while the panel is folded. */
  lead?: ReactNode;
  children: ReactNode;
}) {
  const [closed, toggle] = useCollapsed(id, collapsed);
  const H = h === 2 ? 'h2' : 'h3';
  return (
    <div id={domId} className={`panel${className ? ` ${className}` : ''}${closed ? ' collapsed' : ''}`}>
      <div className="panel-title">
        <span className="panel-head">
          <button type="button" className="ghost icon fold" onClick={toggle} aria-expanded={!closed} title={closed ? 'Expand' : 'Collapse'}>
            {closed ? '▸' : '▾'}
          </button>
          {/* The title folds it too: a bigger target on phones. The arrow stays the keyboard control. */}
          <H className="fold-title" onClick={toggle}>{title}</H>
        </span>
        {extra}
      </div>
      {lead && <div className="panel-lead">{lead}</div>}
      {!closed && children}
    </div>
  );
}
