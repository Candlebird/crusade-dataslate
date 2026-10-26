import { TRAINING } from '../../rules/downtimeData';
import { endlessDepth, eventInfo, finalBoss, finalOf, inEndless, lordLine, luckCap, nemesisTricks, nexusLines, nextLord, startProblem, type TrainingRun } from '../../rules/training';
import { Icon } from '../Icon';
import { NextRoundIcon } from './NextRound';

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
  /** Auto (debug, TRAINING.debugAuto): on or off; left out, no button. */
  auto?: boolean;
  onAuto?: () => void;
}

/** The strip over the map: wave, base, credits, luck, the campaign's threat and event and next real Echo Lord (in a
 *  campaign), the Sortie nemesis waiting (if any), speed, and Start wave / End run. */
export function HudBar({ run, best, speed, onSpeed, onStart, onQuit, paused, onPause, auto, onAuto }: HudBarProps) {
  const low = run.baseHp <= TRAINING.baseHp / 3;
  const why = run.phase === 'build' ? startProblem(run) : null;
  const next = run.wave + 1;
  const live = run.phase === 'wave';
  // What the next wave brings in full is on the wave line beside the map; the HUD has its icon (tap for what it does).
  return (
    <div className="training-hud small" role="toolbar" aria-label="Training run">
      <span className="training-hud-stat" data-tip={live ? 'The wave under way' : 'Waves cleared'}>
        <Icon name="g:crossed-swords" /> {live ? 'Wave' : 'Cleared'} <b>{live ? run.wave : run.cleared}</b>
        {best ? <span className="muted"> · best {Math.max(best, run.cleared)}</span> : null}
      </span>
      <span className="training-hud-stat" data-tip="Base HP: each enemy that gets through costs some">
        <Icon name="g:castle" /> <b style={{ color: low ? 'var(--red)' : undefined }}>{run.baseHp}/{TRAINING.baseHp}</b>
      </span>
      <span className="training-hud-stat" data-tip="Credits: for levels, luck and mending the base">
        <Icon name="g:two-coins" /> <b style={{ color: 'var(--gold)' }}>{Math.floor(run.credits)}</b>
      </span>
      <span className="training-hud-stat" data-tip={`Luck: better Shard grades in each draft (up to ${luckCap(run)} this run)`}>
        <Icon name="g:sparkles" /> {run.luck}/{luckCap(run)}
      </span>
      {run.phase === 'build' && <NextRoundIcon run={run} />}
      {run.siege && (
        <span className="training-hud-stat" data-tip="The Weekly Siege: the week's map, drafts and waves for every force; score is the damage dealt to the Final boss, or the wave reached">
          <Icon name="g:castle" /> Siege <span className="muted">· {run.siege}</span>
        </span>
      )}
      {run.finale && <FinalStat run={run} />}
      {run.nexus && <NexusStat run={run} />}
      {run.nemesis && !run.nemesis.slain && run.wave <= TRAINING.shared.nemesis.wave && (
        <span
          className="training-hud-stat"
          data-tip={`Your Sortie nemesis comes as the Echo Lord of wave ${TRAINING.shared.nemesis.wave}. ${nemesisTricks(run.nemesis).map((t) => `${t.name}: ${t.text}`).join(' ')}`}
        >
          <Icon name="g:crown" /> <b style={{ color: 'var(--red)' }}>{run.nemesis.name}</b> <span className="muted">· wave {TRAINING.shared.nemesis.wave}</span>
        </span>
      )}
      {run.auto && <span className="training-hud-stat" style={{ color: 'var(--red)' }} data-tip="The Auto (debug) button played this run">Auto was used: nothing banked</span>}
      <span className="grow" />
      {run.phase !== 'over' && (
        <span className="training-hud-actions">
          <span className="training-speed" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button key={s} className={s === speed ? 'primary' : ''} aria-pressed={s === speed} onClick={() => onSpeed(s)}>{s}×</button>
            ))}
          </span>
          {auto !== undefined && onAuto && (
            <button className={auto ? 'primary' : ''} aria-pressed={auto} data-tip="Debug: the test bot plays the run (a run that uses it banks nothing)" onClick={onAuto}>Auto (debug)</button>
          )}
          {onPause && (live || auto) && <button className="training-hud-go" onClick={onPause}>{paused ? 'Resume' : 'Pause'}</button>}
          {run.phase === 'build' && (
            <button className="primary training-hud-go" disabled={!!why || auto} data-tip={why ?? undefined} onClick={onStart}>Start wave {next}</button>
          )}
          <button className="training-hud-quit" onClick={onQuit}>End run</button>
        </span>
      )}
    </div>
  );
}

/** The run's Final wave and its boss, or how deep into Endless it has gone. */
function FinalStat({ run }: { run: TrainingRun }) {
  const fin = finalOf(run);
  if (inEndless(run)) {
    return (
      <span className="training-hud-stat" data-tip={`Victory at the Final wave ${fin}; every wave past it climbs steeper`}>
        <Icon name="g:medal" /> Endless <b>+{endlessDepth(run)}</b>
      </span>
    );
  }
  return (
    <span className="training-hud-stat" data-tip={`Slay ${finalBoss(run)} on wave ${fin} with the base standing for a Victory${run.siege ? '; in the Siege it cannot fall: hurt it all you can' : ''}`}>
      <Icon name="g:crown" /> Final wave <b>{fin}</b>
    </span>
  );
}

/** The campaign's hold on the run: threat (hover for the affixes and the event), and the next real Echo Lord. */
function NexusStat({ run }: { run: TrainingRun }) {
  const nx = run.nexus!;
  const lines = nexusLines(nx, !!run.nemesis, finalOf(run));
  const ev = eventInfo(nx.event);
  const next = nextLord(run, run.phase === 'wave' ? run.wave - 1 : run.wave);
  return (
    <>
      <span className="training-hud-stat" data-tip={[lines.threat, ...lines.affixes, lines.event].join('\n')}>
        <Icon name="g:death-skull" /> Threat <b style={{ color: nx.threat ? 'var(--red)' : undefined }}>{nx.threat}</b>
        {ev && <span className="muted"> · {ev.name}{ev.effect ? '' : ' (flavour)'}</span>}
      </span>
      {next && (
        <span className="training-hud-stat" data-tip={lordLine(next.lord, next.wave)}>
          <Icon name="g:crown" /> <b>{next.lord.name}</b> <span className="muted">· wave {next.wave}</span>
        </span>
      )}
    </>
  );
}
