import { TRAINING } from '../../rules/downtimeData';
import { startProblem, type TrainingRun } from '../../rules/training';
import { Icon } from '../Icon';

export type Speed = 1 | 2 | 4;
export const SPEEDS: Speed[] = [1, 2, 4];

export interface HudBarProps {
  run: TrainingRun;
  /** The force's best so far (force.trainingBest). */
  best?: number;
  speed: Speed;
  onSpeed: (s: Speed) => void;
  /** Start the next wave (only called when startProblem is null). */
  onStart: () => void;
  /** End the run (the shell confirms). */
  onQuit: () => void;
  paused?: boolean;
  onPause?: () => void;
}

/** The strip over the map: wave, base, credits, luck, speed, and Start wave / End run. */
export function HudBar({ run, best, speed, onSpeed, onStart, onQuit, paused, onPause }: HudBarProps) {
  const low = run.baseHp <= TRAINING.baseHp / 3;
  const why = run.phase === 'build' ? startProblem(run) : null;
  const next = run.wave + 1;
  const live = run.phase === 'wave';
  // What the next wave brings is on the wave line beside the map; the HUD only counts.
  return (
    <div className="training-hud small" role="toolbar" aria-label="Training run">
      <span className="training-hud-stat" title={live ? 'The wave under way' : 'Waves cleared'}>
        <Icon name="g:crossed-swords" /> {live ? 'Wave' : 'Cleared'} <b>{live ? run.wave : run.cleared}</b>
        {best ? <span className="muted"> · best {Math.max(best, run.cleared)}</span> : null}
      </span>
      <span className="training-hud-stat" title="Base HP: each enemy that gets through costs some">
        <Icon name="g:castle" /> <b style={{ color: low ? 'var(--red)' : undefined }}>{run.baseHp}/{TRAINING.baseHp}</b>
      </span>
      <span className="training-hud-stat" title="Credits: for levels, luck and mending the base">
        <Icon name="g:two-coins" /> <b style={{ color: 'var(--gold)' }}>{Math.floor(run.credits)}</b>
      </span>
      <span className="training-hud-stat" title="Luck: better Shard grades in each draft">
        <Icon name="g:sparkles" /> {run.luck}/{TRAINING.shards.luckCost.length}
      </span>
      <span className="grow" />
      {run.phase !== 'over' && (
        <span className="training-hud-actions">
          <span className="training-speed" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? 'primary' : ''} aria-pressed={s === speed} onClick={() => onSpeed(s)}>{s}×</button>
            ))}
          </span>
          {onPause && live && <button className="training-hud-go" onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>}
          {run.phase === 'build' && (
            <button className="primary training-hud-go" disabled={!!why} title={why ?? undefined} onClick={onStart}>Start wave {next}</button>
          )}
          <button onClick={onQuit}>End run</button>
        </span>
      )}
    </div>
  );
}
