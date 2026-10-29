import type { Campaign, Sector } from '../model/types';
import { aiDefended, modifierOf, ratingFor } from '../rules/difficulty';

/** A sector's difficulty rating (as the faction faces it, if given) and the modifiers its defender gets. */
export default function SectorDanger({ s, factionId, c }: { s: Sector; factionId?: string; c?: Campaign }) {
  const rating = ratingFor(s, factionId, c);
  if (s.type === 'home') return null;
  if (rating === undefined) return <p className="small muted">Not rated yet. The GM rates sectors from the Round panel.</p>;
  const mods = (s.modifiers ?? []).map(modifierOf).filter((m) => !!m);
  return (
    <div className="small" style={{ margin: '0.5rem 0' }}>
      <span className="tag red" data-tip="Recalculated every round, scaled to the attacking faction's total Supply">
        {aiDefended(s) ? `AI garrison: ${rating} Supply` : `Difficulty ${rating} Supply`}
      </span>
      {mods.map((m) => <div key={m.id}><b>{m.name}:</b> {m.desc}</div>)}
    </div>
  );
}
