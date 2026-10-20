import type { Sector } from '../model/types';
import { aiDefended, modifierOf } from '../rules/difficulty';

/** A sector's difficulty rating and the modifiers its defender gets. */
export default function SectorDanger({ s }: { s: Sector }) {
  if (s.type === 'home') return null;
  if (s.difficulty === undefined) return <p className="small muted">Not rated yet: the GM rates sectors from the Round panel.</p>;
  const mods = (s.modifiers ?? []).map(modifierOf).filter((m) => !!m);
  return (
    <div className="small" style={{ margin: '0.5rem 0' }}>
      <span className="tag red" title="Recalculated every round from the factions' total Supply">
        {aiDefended(s) ? `AI garrison: ${s.difficulty} Supply` : `Difficulty ${s.difficulty} Supply`}
      </span>
      {mods.map((m) => <div key={m.id}><b>{m.name}:</b> {m.desc}</div>)}
    </div>
  );
}
