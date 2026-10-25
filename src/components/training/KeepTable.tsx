import { SHARD_TYPES } from '../../rules/downtimeData';
import {
  defaultsFor, gradeName, keep, keepOptions, pieceById, shardsOnMap, type Grade, type KeepOption, type ShardPiece, type TrainingRun,
} from '../../rules/training';
import { act } from './act';
import { defaultProgress, recipeProgress } from './recipeView';
import { ShardBadge } from './ShardBadge';

// The keep step as a table: a row for each Shard placed this draft (numbered as on the map), and a column each for
// keeping it as it is, combining alike ones into it, or keeping it a grade down. An option it doesn't have is greyed.

/** A recipe or default a kept Shard moves on: its name, and its slots met after the keep, of all. */
export interface KeepHint { name: string; have: number; need: number }

/** What keeping a `type` Shard at `grade` moves on: each open recipe (then default) it fills a slot of that the kept
 *  Shards don't fill already, with how many of its slots are met then. */
export function keepHints(run: TrainingRun, type: ShardPiece['type'], grade: Grade): KeepHint[] {
  const kept = shardsOnMap(run, false);
  const after = [...kept, { id: -1, kind: 'shard', x: -9, y: -9, type, grade, draft: false } as ShardPiece];
  const met = (xs: unknown[]) => xs.filter(Boolean).length;
  const out: KeepHint[] = [];
  for (const r of run.recipes) {
    if (run.crafted.includes(r.unitId)) continue;
    const have = met(recipeProgress(r, after));
    if (have > met(recipeProgress(r, kept))) out.push({ name: r.name, have, need: r.slots.length });
  }
  for (const d of defaultsFor(run)) {
    const have = met(defaultProgress(d, after));
    if (have > met(defaultProgress(d, kept))) out.push({ name: d.name, have, need: d.slots.length });
  }
  return out;
}

const hintText = (h: KeepHint) => `${h.name} (${h.have}/${h.need})`;

export interface KeepTableProps {
  run: TrainingRun;
  /** The piece picked on the map: its row is lit. */
  sel?: number | null;
  onFocus?: (ids: number[] | null) => void;
  onChange: () => void;
}

export function KeepTable({ run, sel, onFocus, onChange }: KeepTableProps) {
  const opts = keepOptions(run);
  const rows = run.draft.placed.map((id) => pieceById(run, id)).filter((p): p is ShardPiece => p?.kind === 'shard');
  const num = (id: number) => run.draft.placed.indexOf(id) + 1;
  const take = (o: KeepOption) => {
    onFocus?.(null);
    act(() => keep(run, o), onChange);
  };
  return (
    <>
      <div className="muted">Keep one Shard; the rest turn to rubble. Combine alike ones a grade up, or keep one a grade down for a recipe that wants exactly that.</div>
      <div className="training-keep-table" role="table" aria-label="Keep one">
        <div className="training-keep-head" role="row">
          <span role="columnheader">#</span><span role="columnheader">Keep</span><span role="columnheader">Combine</span><span role="columnheader">Downgrade</span>
        </div>
        {rows.map((p) => {
          const mine = opts.filter((o) => o.pieceId === p.id);
          const plain = mine.find((o) => !o.down && !o.with.length);
          const merge = mine.filter((o) => o.with.length).sort((a, b) => b.with.length - a.with.length)[0];
          const down = mine.find((o) => o.down);
          const cell = (o: KeepOption | undefined, verb: string, none: string) => (
            <KeepCell run={run} piece={p} opt={o} verb={verb} none={none} num={num} onTake={take} onFocus={onFocus} />
          );
          return (
            <div key={p.id} className={`training-keep-tr${sel === p.id ? ' lit' : ''}`} role="row">
              <span className="training-keep-num" role="rowheader" aria-label={`Shard ${num(p.id)}: ${gradeName(p.grade)} ${SHARD_TYPES[p.type].name}`}>{num(p.id)}</span>
              {cell(plain, 'Keep', '')}
              {cell(merge, 'Combine', 'Needs an alike Shard (same type and grade) in this draft.')}
              {cell(down, 'Keep a grade down', 'A Cracked Shard has no grade below.')}
            </div>
          );
        })}
      </div>
    </>
  );
}

function KeepCell({ run, piece, opt, verb, none, num, onTake, onFocus }: {
  run: TrainingRun;
  piece: ShardPiece;
  opt?: KeepOption;
  verb: string;
  /** Why there's no such option (its greyed cell's tooltip). */
  none: string;
  num: (id: number) => number;
  onTake: (o: KeepOption) => void;
  onFocus?: (ids: number[] | null) => void;
}) {
  if (!opt) {
    return <span role="cell" className="training-keep-cell off" data-tip={none || undefined}><span className="muted">—</span></span>;
  }
  const name = `${gradeName(opt.grade)} ${SHARD_TYPES[piece.type].name}`;
  const hints = keepHints(run, piece.type, opt.grade);
  const what = opt.with.length ? `Combine ${[piece.id, ...opt.with].map((id) => `#${num(id)}`).join(', ')} into a ${name}` : `${verb} #${num(piece.id)} as a ${name}`;
  const tip = `${what}.${hints.length ? ` Moves on ${hints.map(hintText).join(', ')}.` : ''}`;
  const light = () => onFocus?.([opt.pieceId, ...opt.with]);
  return (
    <button
      role="cell"
      className="training-keep-cell"
      data-tip={tip}
      aria-label={tip}
      onClick={() => onTake(opt)}
      onMouseEnter={light}
      onMouseLeave={() => onFocus?.(null)}
      onFocus={light}
      onBlur={() => onFocus?.(null)}
    >
      <ShardBadge type={piece.type} grade={opt.grade} size={20} glow={opt.with.length > 0} quiet />
      <span className="training-keep-text">
        <span className="training-keep-name">{name}</span>
        {hints.length > 0 && <span className="training-keep-for">→ {hintText(hints[0])}{hints.length > 1 ? ` +${hints.length - 1}` : ''}</span>}
      </span>
    </button>
  );
}
