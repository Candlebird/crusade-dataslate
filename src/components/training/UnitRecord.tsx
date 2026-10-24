import type { Force, Unit } from '../../model/types';
import { heldTitles, recordLine, shownTitle, talesFor, TITLES } from '../../rules/training';
import { Panel } from '../ui';

/** A unit's records and titles on its sheet: the title it shows (its player picks, `onPick`; none without it), its
 *  Sortie and Training records, every title with how it is earned (the ones held in gold), and its tales. */
export function UnitRecord({ f, u, onPick }: { f: Force; u: Unit; onPick?: (id: string) => void }) {
  const s = u.sortieRecord;
  const r = u.trainingRecord;
  const held = heldTitles(u);
  const shown = shownTitle(u);
  const tales = talesFor(f, u.id);
  if (!(s?.runs || s?.lords) && !r?.runs && !held.length) return null;
  const many = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  return (
    <Panel id="unit.record" title="Records and titles" h={3} className="unit-record">
      {held.length > 0 && (onPick ? (
        <label className="row small">
          <span className="muted">Known as</span>
          <select value={u.title === '-' ? '-' : shown?.id ?? '-'} onChange={(e) => onPick(e.target.value)} aria-label="Title it shows">
            {held.map((id) => <option key={id} value={id}>{TITLES.find((t) => t.id === id)?.name}</option>)}
            <option value="-">No title</option>
          </select>
        </label>
      ) : shown && <div><b className="sortie-title">{shown.name}</b></div>)}
      {s && (s.runs || s.lords) ? (
        <div className="muted small">Sortie: {many(s.runs, 'run')} come back from standing · {many(s.lords, 'Echo lord')} slain</div>
      ) : null}
      {r?.runs ? <div className="muted small">Training: {recordLine(r)}</div> : null}
      <details className="small">
        <summary>Titles ({held.length} of {TITLES.length})</summary>
        <ul className="title-list">
          {TITLES.map((t) => (
            <li key={t.id} className={held.includes(t.id) ? 'held' : ''}><b>{t.name}</b>: {t.text}</li>
          ))}
        </ul>
      </details>
      {tales.map((t) => <p key={t.id} className="training-tale small">{t.date}: {t.text}</p>)}
    </Panel>
  );
}
