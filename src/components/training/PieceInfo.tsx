import type { Unit } from '../../model/types';
import { SHARD_TYPES } from '../../rules/downtimeData';
import { describe } from '../../rules/abilities';
import { defaultByKey, gradeName, levelDmg, reach, type Piece, type Tower, type TowerGun, type TrainingRun } from '../../rules/training';
import { PieceActions, type MoveRule } from './PieceActions';
import { HabitBadges, RecordBadges, RelicList } from './RecordBadges';
import { ShardBadge } from './ShardBadge';

export interface PieceInfoProps {
  run: TrainingRun;
  piece: Piece;
  /** The crafted unit's datasheet and record (its trait and scar badges). */
  record?: Unit;
  onClose: () => void;
  /** After a level up or upgrade: the shell refreshes (and saves). */
  onChange: () => void;
  /** Start a Scout move or Ambush swap (the shell waits for a tap on the map). */
  onMove?: (rule: MoveRule) => void;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** A weapon in one line: attacks, reach, damage a hit and its rules. */
export function gunLine(t: Tower, g: TowerGun): string {
  const rules = [g.ap ? `AP(${g.ap})` : '', g.blast > 1 ? `Blast(${g.blast})` : '', g.deadly > 1 ? `Deadly(${g.deadly})` : '', g.rending ? 'Rending' : '']
    .filter(Boolean).join(', ');
  const dmg = Math.max(1, g.deadly) + levelDmg(t, g);
  const air = g.air && g.air !== 1 ? ` · ×${g.air} to flyers` : '';
  const only = g.only === 'air' ? ' · flyers only' : g.only === 'land' ? ' · walkers only' : '';
  return `${g.name}: ${r1(g.attacks)} attack${g.attacks === 1 ? '' : 's'}, ${g.melee ? 'melee' : `${r1(reach(t, g))} cells`}, ${dmg} dmg${rules ? ` · ${rules}` : ''}${air}${only}`;
}

/** What the selected piece is: a crafted unit's weapons, skills, record, Sortie quirks, relics and tally, a
 *  default tower's Shards, or a Shard's type and grade. */
export function PieceInfo({ run, piece, record, onClose, onChange, onMove }: PieceInfoProps) {
  if (piece.kind === 'rubble') return null;
  const unit = piece.kind === 'unit' ? piece : null;
  return (
    <div className="panel training-info small">
      <div className="row">
        {piece.kind === 'shard' && <ShardBadge type={piece.type} grade={piece.grade} size={18} />}
        {piece.kind === 'default' && piece.slots.map(([t, g], i) => <ShardBadge key={i} type={t} grade={g} size={18} />)}
        <b className="grow">
          {piece.kind === 'shard' ? `${gradeName(piece.grade)} ${SHARD_TYPES[piece.type].name} Shard` : piece.name}
          {piece.kind === 'default' && <span className="muted"> · defence{piece.upgraded ? ' · upgraded' : ''}</span>}
          {unit && <span className="muted"> · {unit.category} · Lv {unit.up}/{unit.cap} · Tough {unit.tough}</span>}
        </b>
        <button className="ghost small" onClick={onClose} aria-label="Deselect">×</button>
      </div>
      {piece.kind !== 'shard' && <PieceActions run={run} piece={piece} onChange={onChange} onMove={onMove} />}
      {piece.kind === 'shard' && <div className="muted">{SHARD_TYPES[piece.type].text}{piece.draft ? ' From this draft: keep it or it crumbles.' : ''}</div>}
      {piece.kind === 'default' && <div className="muted">{defaultByKey(piece.key)?.text} No XP, levels, traits or relics.</div>}
      {piece.guns.map((g, i) => <div key={i}>{gunLine(piece, g)}</div>)}
      {unit?.skills.map((k, i) => <div key={`k${i}`} className="muted">{k.gun ? `${k.gun} · ` : ''}{k.source}: {describe(k.effect)}</div>)}
      {unit && record && <RecordBadges unit={record} full />}
      {unit && <HabitBadges unit={unit} />}
      {unit?.relics?.length ? <RelicList relics={unit.relics} /> : null}
      <div className="muted">Quality {piece.quality}+ · {piece.kills} kill{piece.kills === 1 ? '' : 's'} · {Math.round(piece.dealt)} damage{unit ? ` · ${unit.xp} XP` : ''}</div>
    </div>
  );
}
