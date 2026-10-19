import { useEffect } from 'react';
import { newForce } from '../model/factory';
import { useStore } from '../model/store';
import type { ArmyList } from '../model/types';
import { href } from '../route';
import { ListSheet } from './ListPage';

/** The printable army sheet of a generated side (the Void Echoes), laid out like a crusade force's battle list. */
export default function SideSheet({ sideId }: { sideId: string }) {
  const { state } = useStore();
  const side = state.battle?.sides.find((x) => x.id === sideId);

  useEffect(() => {
    if (!side) return;
    const prev = document.title;
    document.title = `${side.name} - army sheet`;
    return () => void (document.title = prev);
  }, [side?.name]);

  if (!side?.roster?.length) return <div className="panel empty">No generated army for this side. <a href={href.tracker()}>Back to the battle</a></div>;

  const force = { ...newForce(side.name), id: `sheet-${side.id}`, faction: side.roster[0].bookName ?? '', units: side.roster };
  const list: ArmyList = {
    id: 'sheet', name: side.name, pointsLimit: side.roster.reduce((n, u) => n + u.points, 0),
    unitIds: side.roster.map((u) => u.id), joins: {}, notes: '', glossary: true, compact: false,
  };
  return (
    <>
      <div className="page-head no-print">
        <div><h1>{side.name} army sheet</h1></div>
        <div className="row">
          <a className="btn" href={href.tracker()}>← Back to the battle</a>
          <button className="primary" onClick={() => window.print()}>🖶 Print</button>
        </div>
      </div>
      <ListSheet force={force} list={list} settings={state.settings} books={state.books} coreRules={state.coreRules ?? []} />
    </>
  );
}
