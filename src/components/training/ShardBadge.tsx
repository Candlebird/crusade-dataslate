import { SHARD_TYPES, type ShardType } from '../../rules/downtimeData';
import { gradeName, type Grade } from '../../rules/training';
import { Icon } from '../Icon';
import { SHARD_ICON, gradeTint, shardColor } from './art';

export interface ShardBadgeProps {
  type: ShardType;
  grade: Grade;
  /** Pixel size of the crystal (pips sit under it). */
  size?: number;
  /** Dim it (a slot not yet met, a placed draft piece). */
  faded?: boolean;
  /** Ring it (ready to use, a merge). */
  glow?: boolean;
  /** Hide the grade pips. */
  noPips?: boolean;
  /** No tooltip of its own (it sits in a control that has one). */
  quiet?: boolean;
}

/** One Shard for the panels: its type's crystal, tinted dull (Cracked) to bright (Pristine), with 1–5 grade pips. */
export function ShardBadge({ type, grade, size = 22, faded, glow, noPips, quiet }: ShardBadgeProps) {
  const def = SHARD_TYPES[type];
  const color = shardColor(type);
  const title = `${gradeName(grade)} ${def.name}`;
  return (
    <span
      className={`shard-badge${faded ? ' faded' : ''}${glow ? ' glow' : ''}`}
      data-tip={quiet ? undefined : title}
      style={{ ['--shard' as string]: color, color: gradeTint(color, grade), fontSize: size }}
    >
      <Icon name={SHARD_ICON[type]} title={quiet ? undefined : title} />
      {!noPips && <GradePips grade={grade} />}
    </span>
  );
}

/** 1–5 pips for a grade. */
export function GradePips({ grade }: { grade: Grade }) {
  return (
    <span className="shard-pips" aria-hidden>
      {Array.from({ length: 5 }, (_, i) => <i key={i} className={i < grade ? 'on' : ''} />)}
    </span>
  );
}
