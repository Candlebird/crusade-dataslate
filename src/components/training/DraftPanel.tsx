import { SHARD_TYPES } from '../../rules/downtimeData';
import { gradeName, keep, keepOptions, pieceById, type KeepOption, type ShardPiece, type TrainingRun } from '../../rules/training';
import { act } from './act';
import { ShardBadge } from './ShardBadge';

export interface DraftPanelProps {
  run: TrainingRun;
  /** The hand Shard (index into run.draft.hand) the next map tap places, or null. */
  pick: number | null;
  onPick: (i: number | null) => void;
  /** Pieces to light on the map while a keep option is hovered (null: none). */
  onFocus?: (ids: number[] | null) => void;
  /** After a keep: the shell refreshes (and saves). */
  onChange: () => void;
}

/** The build phase's draft: the Shards still to place, then which one to keep (or merge), then a done note. */
export function DraftPanel({ run, pick, onPick, onFocus, onChange }: DraftPanelProps) {
  if (run.phase !== 'build') return null;
  const { step, hand, placed } = run.draft;
  const down = placed.map((id) => pieceById(run, id)).filter((p): p is ShardPiece => p?.kind === 'shard');
  const rubble = run.pieces.filter((p) => p.kind === 'rubble').length;
  return (
    <div className="training-draft small">
      <div className="training-panel-title">
        <b>Draft</b> <span className="muted">· {step === 'place' ? `${hand.length} to place` : step === 'keep' ? 'keep one' : 'kept'}</span>
      </div>
      {step !== 'done' && (
        <div className="training-draft-row" role="listbox" aria-label="Draft Shards">
          {hand.map((s, i) => (
            <button
              key={`h${i}`}
              role="option"
              aria-selected={pick === i}
              className={`training-shard${pick === i ? ' primary' : ''}`}
              title={`${gradeName(s.grade)} ${SHARD_TYPES[s.type].name}: ${SHARD_TYPES[s.type].text}`}
              onClick={() => onPick(pick === i ? null : i)}
            >
              <ShardBadge type={s.type} grade={s.grade} />
            </button>
          ))}
          {down.map((p) => (
            <span key={p.id} className="training-shard placed" title="Placed">
              <ShardBadge type={p.type} grade={p.grade} faded />
            </span>
          ))}
        </div>
      )}
      {step === 'place' && (
        <div className="muted">{pick === null ? 'Pick a Shard, then tap the map to set it down.' : 'Tap a free spot on the map. The route must stay open.'}</div>
      )}
      {step === 'keep' && <KeepChoice run={run} onFocus={onFocus} onChange={onChange} />}
      {step === 'done' && <div className="muted">Shard kept. Start the wave when ready.</div>}
      {rubble > 0 && <div className="muted">Rubble on the map: {rubble}. It blocks walkers like any piece; tap one to clear it (free, between waves).</div>}
    </div>
  );
}

/** The keep step's options: each placed Shard as it is, and merges of alike ones a grade or two up. */
function KeepChoice({ run, onFocus, onChange }: { run: TrainingRun; onFocus?: (ids: number[] | null) => void; onChange: () => void }) {
  const opts = keepOptions(run);
  const wanted = new Set(run.recipes.filter((r) => !run.crafted.includes(r.unitId)).flatMap((r) => r.slots.map((s) => s.type)));
  const sorted = [...opts].sort((a, b) => b.grade - a.grade || b.with.length - a.with.length);
  const take = (o: KeepOption) => {
    onFocus?.(null);
    act(() => keep(run, o), onChange);
  };
  return (
    <>
      <div className="muted">Keep one; the rest turn to rubble. A ready recipe can use draft Shards instead.</div>
      <div className="training-keep">
        {sorted.map((o, i) => {
          const p = pieceById(run, o.pieceId) as ShardPiece;
          const merge = o.with.length > 0;
          return (
            <button
              key={i}
              className="training-keep-opt"
              onClick={() => take(o)}
              onMouseEnter={() => onFocus?.([o.pieceId, ...o.with])}
              onMouseLeave={() => onFocus?.(null)}
              onFocus={() => onFocus?.([o.pieceId, ...o.with])}
              onBlur={() => onFocus?.(null)}
            >
              <ShardBadge type={p.type} grade={o.grade} glow={merge} />
              <span className="grow" style={{ textAlign: 'left' }}>
                {merge ? `Merge ${o.with.length + 1} → ` : 'Keep '}
                {gradeName(o.grade)} {SHARD_TYPES[p.type].name}
              </span>
              {wanted.has(p.type) && <span className="tag" title="A recipe still needs this type">recipe</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
