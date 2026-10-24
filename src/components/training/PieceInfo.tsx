import type { Unit } from '../../model/types';
import { SHARD_TYPES } from '../../rules/downtimeData';
import { describe } from '../../rules/abilities';
import { gradeName, levelDmg, reach, type Piece, type Tower, type TowerGun } from '../../rules/training';
import { RecordBadges, RelicList } from './RecordBadges';
import { ShardBadge } from './ShardBadge';

export interface PieceInfoProps {
  piece: Piece;
  /** The crafted unit's datasheet and record (its trait and scar badges). */
  record?: Unit;
  onClose: () => void;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A weapon in one line: attacks, reach, damage a hit and its rules. */
function gunLine(t: Tower, g: TowerGun): string {
  const rules = [g.ap ? `AP(${g.ap})` : '', g.blast > 1 ? `Blast(${g.blast})` : '', g.deadly > 1 ? `Deadly(${g.deadly})` : '', g.rending ? 'Rending' : '']
    .filter(Boolean).join(', ');
  const dmg = Math.max(1, g.deadly) + levelDmg(t, g);
  return `${g.name}: ${r1(g.attacks)} attack${g.attacks === 1 ? '' : 's'}, ${g.melee ? 'melee' : `${r1(reach(t, g))} cells`}, ${dmg} dmg${rules ? ` · ${rules}` : ''}`;
}

/** What the selected piece is: a crafted unit's weapons, skills, record, relics and tally, or a Shard's type and grade. */
export function PieceInfo({ piece, record, onClose }: PieceInfoProps) {
  if (piece.kind === 'rubble') return null;
  const unit = piece.kind === 'unit' ? piece : null;
  return (
    <div className="panel training-info small">
      <div className="row">
        {piece.kind === 'shard' && <ShardBadge type={piece.type} grade={piece.grade} size={18} />}
        <b className="grow">
          {piece.kind === 'unit' ? piece.name : `${gradeName(piece.grade)} ${SHARD_TYPES[piece.type].name} Shard`}
          {unit && <span className="muted"> · {unit.category} · Lv {unit.up}/{unit.cap} · Tough {unit.tough}</span>}
        </b>
        <button className="ghost small" onClick={onClose} aria-label="Deselect">×</button>
      </div>
      {piece.kind === 'shard' && <div className="muted">{SHARD_TYPES[piece.type].text}{piece.draft ? ' From this draft: keep it or it crumbles.' : ''}</div>}
      {piece.guns.map((g, i) => <div key={i}>{gunLine(piece, g)}</div>)}
      {unit?.skills.map((k, i) => <div key={`k${i}`} className="muted">{k.gun ? `${k.gun} · ` : ''}{k.source}: {describe(k.effect)}</div>)}
      {unit && record && <RecordBadges unit={record} full />}
      {unit?.relics?.length ? <RelicList relics={unit.relics} /> : null}
      <div className="muted">Quality {piece.quality}+ · {piece.kills} kill{piece.kills === 1 ? '' : 's'} · {Math.round(piece.dealt)} damage{unit ? ` · ${unit.xp} XP` : ''}</div>
    </div>
  );
}
