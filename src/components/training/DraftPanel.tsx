import { drawSize, pieceById, type ShardPiece, type TrainingRun } from '../../rules/training';
import { Icon } from '../Icon';
import { KeepTable } from './KeepTable';
import { ShardBadge } from './ShardBadge';

export interface DraftPanelProps {
  run: TrainingRun;
  /** The hand Shard (index into run.draft.hand) the next map tap places, or null. */
  pick: number | null;
  /** The piece picked on the map: at the keep step its row is lit. */
  sel?: number | null;
  onPick: (i: number | null) => void;
  /** Pieces to light on the map while a keep option is hovered (null: none). */
  onFocus?: (ids: number[] | null) => void;
  /** After a keep: the shell refreshes (and saves). */
  onChange: () => void;
}

/** A Shard still in the hand: unknown (no type or grade) until it is set down on the map. */
export function UnknownShard({ size = 30 }: { size?: number }) {
  return <span className="shard-unknown" style={{ width: size, height: size + 4, fontSize: size * 0.6 }} aria-hidden>?</span>;
}

/** The build phase's draft: the unknown Shards still to place, then the keep table (keep, combine or downgrade one),
 *  then a done note. */
export function DraftPanel({ run, pick, sel, onPick, onFocus, onChange }: DraftPanelProps) {
  if (run.phase === 'over') return null;
  // Mid-wave the draft keeps its place, so the panels under it don't jump when the wave starts.
  if (run.phase === 'wave') {
    return (
      <div className="training-draft small">
        <div className="training-panel-title"><b>Draft</b> <span className="muted">· the next {drawSize(run)} Shards come after this wave</span></div>
      </div>
    );
  }
  const { step, hand, placed } = run.draft;
  const down = placed.map((id) => pieceById(run, id)).filter((p): p is ShardPiece => p?.kind === 'shard');
  const rubble = run.pieces.filter((p) => p.kind === 'rubble').length;
  return (
    <div className="training-draft small">
      <div className="training-panel-title">
        <b>Draft</b> <span className="muted">· {step === 'place' ? `${hand.length} to place` : step === 'keep' ? 'keep one' : 'kept'}</span>
      </div>
      {step === 'place' && (
        <div className="training-draft-row" role="listbox" aria-label="Draft Shards">
          {hand.map((_, i) => (
            <button
              key={`h${i}`}
              role="option"
              aria-selected={pick === i}
              aria-label={`Unknown Shard ${i + 1}`}
              className={`training-shard${pick === i ? ' primary' : ''}`}
              data-tip="An unknown Shard: its type and grade show once it is on the map."
              onClick={() => onPick(pick === i ? null : i)}
            >
              <UnknownShard />
            </button>
          ))}
          {down.map((p, i) => (
            <span key={p.id} className="training-shard placed">
              <ShardBadge type={p.type} grade={p.grade} size={30} />
              <span className="training-shard-num">{i + 1}</span>
              <Icon name="g:check-mark" className="training-shard-check" />
            </span>
          ))}
        </div>
      )}
      {step === 'place' && (
        <div className="muted">{pick === null ? 'Pick a Shard, then tap the map to set it down.' : 'Tap a free spot on the map. The route must stay open.'}</div>
      )}
      {step === 'keep' && <KeepTable run={run} sel={sel} onFocus={onFocus} onChange={onChange} />}
      {step === 'done' && <div className="muted">Shard kept. Start the wave when ready.</div>}
      {rubble > 0 && <div className="muted">Rubble on the map: {rubble}. It blocks walkers like any piece; tap one to clear it (free, between waves).</div>}
    </div>
  );
}
