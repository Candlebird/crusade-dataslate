import { SHARD_TYPES } from '../../rules/downtimeData';
import {
  drawSize, gradeName, keep, keepOptions, pieceById, shardsOnMap, type KeepOption, type ShardPiece, type TrainingRun,
} from '../../rules/training';
import { Icon } from '../Icon';
import { act } from './act';
import { recipeProgress } from './recipeView';
import { ShardBadge } from './ShardBadge';

export interface DraftPanelProps {
  run: TrainingRun;
  /** The hand Shard (index into run.draft.hand) the next map tap places, or null. */
  pick: number | null;
  /** The piece picked on the map: at the keep step, a draft Shard picked there is the one a keep option keeps. */
  sel?: number | null;
  onPick: (i: number | null) => void;
  /** Pieces to light on the map while a keep option is hovered (null: none). */
  onFocus?: (ids: number[] | null) => void;
  /** After a keep: the shell refreshes (and saves). */
  onChange: () => void;
}

/** The build phase's draft: the Shards still to place, then which one to keep (or merge), then a done note. */
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
              <ShardBadge type={s.type} grade={s.grade} size={30} />
            </button>
          ))}
          {down.map((p) => (
            <span key={p.id} className="training-shard placed" title={`${gradeName(p.grade)} ${SHARD_TYPES[p.type].name}: placed`}>
              <ShardBadge type={p.type} grade={p.grade} size={30} />
              <Icon name="g:check-mark" className="training-shard-check" />
            </span>
          ))}
        </div>
      )}
      {step === 'place' && (
        <div className="muted">{pick === null ? 'Pick a Shard, then tap the map to set it down.' : 'Tap a free spot on the map. The route must stay open.'}</div>
      )}
      {step === 'keep' && <KeepChoice run={run} sel={sel} onFocus={onFocus} onChange={onChange} />}
      {step === 'done' && <div className="muted">Shard kept. Start the wave when ready.</div>}
      {rubble > 0 && <div className="muted">Rubble on the map: {rubble}. It blocks walkers like any piece; tap one to clear it (free, between waves).</div>}
    </div>
  );
}

/** One row of the keep choice: options that end the same (same type, grade and merge size), and the one it takes. */
interface KeepGroup {
  opt: KeepOption;
  /** The Shard it keeps (or merges into). */
  piece: ShardPiece;
  /** How many draft Shards it could be kept from (plain keeps only). */
  from: number;
  /** Open recipes the result moves on (a slot met that wasn't). */
  helps: string[];
}

/**
 * The keep options folded into one row per outcome: keeping either of two alike Shards reads the same in the list.
 * The row takes the Shard picked on the map if it is one of them, so tapping a Shard there chooses where it stays.
 */
function keepGroups(run: TrainingRun, sel: number | null | undefined): KeepGroup[] {
  const kept = shardsOnMap(run, false);
  const open = run.recipes.filter((r) => !run.crafted.includes(r.unitId));
  const met = (r: (typeof open)[number], ps: ShardPiece[]) => recipeProgress(r, ps).filter(Boolean).length;
  const groups = new Map<string, KeepGroup>();
  const sorted = [...keepOptions(run)].sort((a, b) => b.grade - a.grade || b.with.length - a.with.length);
  for (const o of sorted) {
    const p = pieceById(run, o.pieceId) as ShardPiece;
    const key = `${o.with.length}:${p.type}:${o.grade}`;
    const g = groups.get(key);
    if (g) {
      g.from++;
      if (o.pieceId === sel) Object.assign(g, { opt: o, piece: p });
      continue;
    }
    const after = [...kept, { ...p, grade: o.grade, draft: false }];
    const helps = open.filter((r) => met(r, after) > met(r, kept)).map((r) => r.name);
    groups.set(key, { opt: o, piece: p, from: 1, helps });
  }
  return [...groups.values()];
}

/** The keep step's options: each placed Shard as it is, and merges of alike ones a grade or two up. */
function KeepChoice({ run, sel, onFocus, onChange }: {
  run: TrainingRun;
  sel?: number | null;
  onFocus?: (ids: number[] | null) => void;
  onChange: () => void;
}) {
  const groups = keepGroups(run, sel);
  const take = (o: KeepOption) => {
    onFocus?.(null);
    act(() => keep(run, o), onChange);
  };
  const light = (o: KeepOption) => onFocus?.([o.pieceId, ...o.with]);
  return (
    <>
      <div className="muted">Keep one; the rest turn to rubble. Tap a Shard on the map first to choose which one stays.</div>
      <div className="training-keep">
        {groups.map(({ opt: o, piece: p, from, helps }) => {
          const merge = o.with.length > 0;
          return (
            <button
              key={`${o.with.length}:${p.type}:${o.grade}`}
              className={`training-keep-opt${o.pieceId === sel ? ' lit' : ''}`}
              onClick={() => take(o)}
              onMouseEnter={() => light(o)}
              onMouseLeave={() => onFocus?.(null)}
              onFocus={() => light(o)}
              onBlur={() => onFocus?.(null)}
            >
              <ShardBadge type={p.type} grade={o.grade} glow={merge} />
              <span className="grow training-keep-label">
                {merge ? `Merge ${o.with.length + 1} → ` : 'Keep '}
                {gradeName(o.grade)} {SHARD_TYPES[p.type].name}
                {!merge && from > 1 && <span className="muted"> · {from} alike</span>}
              </span>
              {helps.length > 0 && (
                <span className="training-keep-for" title={`Moves on the recipe for ${helps.join(', ')}`}>
                  → {helps[0]}{helps.length > 1 ? ` +${helps.length - 1}` : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
