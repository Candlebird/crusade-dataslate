import type { Unit } from '../../model/types';
import { SHARD_TYPES } from '../../rules/downtimeData';
import { habitBadges, recordBadges, relicText, type RecordBadge, type RelicSocket } from '../../rules/training';
import { ShardBadge } from './ShardBadge';

/** One trait (green, with its Shard type) or scar (red) as a tag. */
function Badge({ b }: { b: RecordBadge }) {
  return (
    <span
      className={`tag ${b.kind === 'scar' ? 'red' : 'green'}`}
      data-tip={`${b.kind === 'scar' ? 'Scar' : 'Trait'}${b.type ? ` (${SHARD_TYPES[b.type].name})` : ''}: ${b.text}`}
    >
      {b.type && <ShardBadge type={b.type} grade={3} size={11} noPips />} {b.name}
    </span>
  );
}

/** Each badge with what it does here, a row each. */
const Rows = ({ badges }: { badges: RecordBadge[] }) => (
  <div className="training-record">
    {badges.map((b, i) => (
      <div key={i} className="training-record-row"><Badge b={b} /><span className="muted">{b.text}</span></div>
    ))}
  </div>
);

/** A unit's traits and scars as tags. `full` (the tower card) gives each a row saying what it does here; otherwise
 *  (the recipe book) the tags open on a tap to the same rows. */
export function RecordBadges({ unit, full }: { unit: Unit; full?: boolean }) {
  const badges = recordBadges(unit);
  if (!badges.length) return null;
  if (full) return <Rows badges={badges} />;
  return (
    <details className="training-record-fold">
      <summary className="training-record training-record-inline" data-tip="What its traits and scars do here">
        {badges.map((b, i) => <Badge key={i} b={b} />)}
      </summary>
      <Rows badges={badges} />
    </details>
  );
}

/** A crafted unit's relics: each one's effect and how often it goes off (gold, like its shots). */
export function RelicList({ relics }: { relics: RelicSocket[] }) {
  return (
    <div className="training-record">
      {relics.map((s, i) => (
        <div key={i} className="training-record-row">
          <span className="tag gold" data-tip={`${s.tier} relic`}>{s.name}</span>
          <span className="muted">{relicText(s)} · every {s.every}s</span>
        </div>
      ))}
    </div>
  );
}

/** A unit's Sortie quirks and trinket on the tower card: each as a tag (green good, red bad, gold a trinket) with what
 *  it does here. */
export function HabitBadges({ unit }: { unit: Pick<Unit, 'quirks' | 'trinket'> }) {
  const badges = habitBadges(unit);
  if (!badges.length) return null;
  return (
    <div className="training-record">
      {badges.map((b, i) => (
        <div key={i} className="training-record-row">
          <span className={`tag ${b.kind === 'trinket' ? 'gold' : b.good ? 'green' : 'red'}`} data-tip={b.kind === 'trinket' ? 'Sortie trinket' : 'Sortie quirk'}>{b.name}</span>
          <span className="muted">{b.text}</span>
        </div>
      ))}
    </div>
  );
}
