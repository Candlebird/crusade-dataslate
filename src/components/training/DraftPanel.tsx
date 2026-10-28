import { drawSize, pieceById, readyDefaults, readyRecipes, type ShardPiece, type TrainingRun } from '../../rules/training';
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
  /** Open another side tab (the done step points at Recipes and Shop). */
  onTab?: (t: 'units' | 'shop') => void;
}

/** The build phase in three steps, the current one lit: place the draft, keep one, then get ready and start. */
export function BuildSteps({ run }: { run: TrainingRun }) {
  const { step, hand } = run.draft;
  const steps: [typeof step, string][] = [
    ['place', step === 'place' ? `Place ${hand.length}` : `Place ${drawSize(run)}`],
    ['keep', 'Keep 1'],
    ['done', `Start wave ${run.wave + 1}`],
  ];
  const at = steps.findIndex(([k]) => k === step);
  return (
    <ol className="training-phase-steps" aria-label="Build phase steps">
      {steps.map(([k, name], i) => (
        <li key={k} className={i < at ? 'done' : i === at ? 'on' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="training-step-n">{i < at ? '✓' : i + 1}</span> {name}
        </li>
      ))}
    </ol>
  );
}

/** A Shard still in the hand: unknown (no type or grade) until it is set down on the map. */
export function UnknownShard({ size = 30 }: { size?: number }) {
  return <span className="shard-unknown" style={{ width: size, height: size + 4, fontSize: size * 0.6 }} aria-hidden>?</span>;
}

/** The build phase's draft: the unknown Shards still to place, then the keep table (keep, combine or downgrade one),
 *  then a done note. */
export function DraftPanel({ run, pick, sel, onPick, onFocus, onChange, onTab }: DraftPanelProps) {
  if (run.phase === 'over') return null;
  // Mid-wave the draft keeps its place, so the panels under it don't jump when the wave starts.
  if (run.phase === 'wave') {
    return (
      <div className="training-draft small">
        <div className="training-panel-title"><b>Wave {run.wave} under way</b></div>
        <div className="muted">The next {drawSize(run)} Shards come once it is over. Craft and spend between waves.</div>
      </div>
    );
  }
  const { step, hand, placed } = run.draft;
  const down = placed.map((id) => pieceById(run, id)).filter((p): p is ShardPiece => p?.kind === 'shard');
  const rubble = run.pieces.filter((p) => p.kind === 'rubble').length;
  return (
    <div className="training-draft small">
      <BuildSteps run={run} />
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
      {step === 'keep' && <CraftInstead run={run} onTab={onTab} />}
      {step === 'done' && <ReadyNote run={run} onTab={onTab} />}
      {rubble > 0 && <div className="muted">Rubble on the map: {rubble}. It blocks walkers like any piece; tap one to clear it (free, between waves).</div>}
    </div>
  );
}

/** The done step: what is left to do before the wave (craft, spend), each a link to its tab. */
function ReadyNote({ run, onTab }: { run: TrainingRun; onTab?: (t: 'units' | 'shop') => void }) {
  const ready = readyRecipes(run).length + readyDefaults(run).length;
  const link = (t: 'units' | 'shop', text: string) =>
    onTab ? <button className="training-link" onClick={() => onTab(t)}>{text}</button> : <b>{text}</b>;
  return (
    <div className="training-ready">
      <div>Shard kept. Before the wave you can:</div>
      <ul>
        <li>{link('units', 'Recipes')}: {ready ? <b style={{ color: 'var(--gold)' }}>{ready} ready to craft</b> : <span className="muted">nothing ready yet</span>}</li>
        <li>{link('shop', 'Shop')}: <span className="muted">{Math.floor(run.credits)} credits for luck or mending</span></li>
        <li><span className="muted">Tap a unit or defence on the map to level or upgrade it</span></li>
      </ul>
      <div>Then press <b>Start wave {run.wave + 1}</b>.</div>
    </div>
  );
}

/** At the keep step: a craft from this draft's Shards stands in for the keep, so say when one is ready. */
function CraftInstead({ run, onTab }: { run: TrainingRun; onTab?: (t: 'units' | 'shop') => void }) {
  const ready = readyRecipes(run).length + readyDefaults(run).length;
  if (!ready) return null;
  return (
    <div className="training-ready">
      <b style={{ color: 'var(--gold)' }}>{ready === 1 ? '1 recipe is' : `${ready} recipes are`} ready.</b>{' '}
      A craft that uses this draft's Shards counts as your keep (the rest turn to rubble):{' '}
      {onTab ? <button className="training-link" onClick={() => onTab('units')}>open Recipes</button> : <b>see Recipes</b>}.
    </div>
  );
}
