import { useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { forceTotals } from '../rules/engine';
import { href } from '../route';
import type { Force } from '../model/types';
import { NumberField, Panel, TextField, UsAbbr } from './ui';
import { EditModeButton, EditModeNotice, useEditMode } from './editMode';
import { Icon } from './Icon';

/** How many entries the force page shows before "See all". */
export const LEDGER_RECENT = 5;

/** An entry's text on one line, with an arrow to open it out when it doesn't fit. */
function LedgerLabel({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [long, setLong] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setLong(el.scrollWidth > el.clientWidth + 1);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div className="ledger-label">
      <div ref={ref} className={open ? 'ledger-text open' : 'ledger-text'}>{text}</div>
      {(long || open) && (
        <button className="ghost icon ledger-more" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={open ? 'Show less' : 'Show all'}>
          <Icon name={open ? 'l:chevron-up' : 'l:chevron-down'} />
        </button>
      )}
    </div>
  );
}

/** The force's ledger, newest first; with `limit`, only that many of the latest. */
export function LedgerTable({ f, edit, set, limit }: { f: Force; edit: boolean; set: (fn: (d: Force) => void) => void; limit?: number }) {
  const rows = f.ledger.map((e, i) => ({ e, i })).reverse().slice(0, limit ?? f.ledger.length);
  const us = (n?: number) => (n ? (n > 0 ? `+${n}` : n) : '');
  return (
    <div className="table-wrap">
      <table className="stack ledger">
        <thead>
          <tr><th>Date</th><th>Entry</th><th className="num">RP</th><th className="num">Supply</th><th className="num"><UsAbbr /></th><th /></tr>
        </thead>
        <tbody>
          {rows.map(({ e, i }) => edit ? (
            <tr key={e.id}>
              <td className="s-2" data-label="Date"><input type="date" value={e.date} onChange={(ev) => set((d) => void (d.ledger[i].date = ev.target.value))} /></td>
              <td className="s-full ledger-entry" data-label="Entry"><TextField className="wide" value={e.label} onCommit={(v) => set((d) => void (d.ledger[i].label = v))} /></td>
              <td className="num" data-label="RP"><NumberField value={e.rp} onCommit={(n) => set((d) => void (d.ledger[i].rp = n))} /></td>
              <td className="num" data-label="Supply"><NumberField step={50} value={e.supply} onCommit={(n) => set((d) => void (d.ledger[i].supply = n))} /></td>
              <td className="num small" data-label="US" data-tip="Umbra Shards (history only; set the balance in Force details)">{us(e.us)}</td>
              <td className="s-end"><button className="ghost icon" onClick={() => set((d) => void d.ledger.splice(i, 1))} aria-label="Delete entry"><Icon name="l:x" /></button></td>
            </tr>
          ) : (
            <tr key={e.id}>
              <td className="s-2 small muted" data-label="Date">{e.date}</td>
              <td className="s-full ledger-entry" data-label="Entry"><LedgerLabel text={e.label} /></td>
              <td className="num" data-label="RP">{e.rp}</td>
              <td className="num" data-label="Supply">{e.supply}</td>
              <td className="num small" data-label="US" title="Umbra Shards">{us(e.us)}</td>
              <td className="s-end" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Every ledger entry the force has, newest first. */
export default function LedgerPage({ forceId }: { forceId: string }) {
  const { state, updateForce } = useStore();
  const f = state.forces.find((x) => x.id === forceId);
  const { edit } = useEditMode(f);
  const cloud = useCloud();
  const theirs = !!f && !!cloud.email && !!f.owner && f.owner !== cloud.email;
  if (!f) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;
  const t = forceTotals(f, state.settings);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.forces()}>Forces</a> / <a href={href.force(f.id)}>{f.name}</a> / Ledger</div>
          <h1>Requisition ledger</h1>
        </div>
        <div className="row">{!theirs && <EditModeButton f={f} />}</div>
      </div>
      {!theirs && <EditModeNotice f={f} />}
      <Panel id="ledger.all" title={`${f.ledger.length} entr${f.ledger.length === 1 ? 'y' : 'ies'}`} extra={<span className="muted small">{t.rp} RP</span>}>
        {f.ledger.length === 0 ? (
          <p className="muted small">No entries. Starting Supply Limit is {f.startingSupply}.</p>
        ) : (
          <LedgerTable f={f} edit={edit} set={(fn) => updateForce(f.id, fn)} />
        )}
      </Panel>
    </>
  );
}
