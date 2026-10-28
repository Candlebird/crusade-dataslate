import {
  DRILL_GOALS, drillPreview, endlessDepth, finalBoss, mvp, runWon, runXp, sharedPreview, siegeDmg, siegeScore, towers, unlockText, unitTowers, type TrainingRun,
} from '../../rules/training';
import type { Force } from '../../model/types';
import { Icon } from '../Icon';
import { RunHonoursView } from './RunHonours';

export interface RunSummaryProps {
  run: TrainingRun;
  /** The force's best before this run (force.trainingBest), to call a new best. */
  best?: number;
  /** The force, for each unit's Training record, titles and tales once the run is over (RunHonours). */
  force?: Force;
}

/** How the run went: waves cleared, and each crafted unit's kills, damage, levels and XP (the standout starred), with
 *  the default towers and kept Shards a row each; then records, titles and tales, and what it hands the Sortie side (quirks,
 *  nemesis, bestiary), the Drill Honours earned, and a Weekly Siege's score. */
export function RunSummary({ run, best, force }: RunSummaryProps) {
  const lead = mvp(run);
  const xp = runXp(run);
  const units = [...unitTowers(run)].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt);
  const shards = towers(run).filter((t) => t.kind === 'shard');
  const defences = towers(run).filter((t) => t.kind === 'default');
  const n = (x: number) => Math.round(x);
  // A run Auto (debug) played banks nothing: no best, honours, Sortie layer, Drill or siege score to show.
  const banks = !run.auto;
  const record = banks && best !== undefined && run.cleared > best;
  const shared = banks && run.phase === 'over' ? sharedPreview(run) : [];
  const drill = banks && force && run.phase === 'over' ? drillPreview(force, run) : [];
  const why = run.phase === 'over' ? endReason(run) : null;
  const total = banks ? Object.values(xp).reduce((a, b) => a + b, 0) : 0;
  return (
    <div className="training-summary small">
      {why && <div className="training-summary-why">{why}</div>}
      <div style={{ marginBottom: 4 }}>
        <b>{run.cleared} wave{run.cleared === 1 ? '' : 's'} cleared</b>
        {total > 0 && <span> · <b style={{ color: 'var(--gold)' }}>+{total} XP</b> to your units</span>}
        {record && <span style={{ color: 'var(--gold)' }}> · a new best</span>}
        {lead && lead.kills > 0 && <span className="muted"> · {lead.name} led the defence</span>}
      </div>
      {run.auto && <div style={{ marginBottom: 4, color: 'var(--red)' }}>Auto was used: nothing banked.</div>}
      {!run.siege && runWon(run) && (
        <div style={{ marginBottom: 4, color: 'var(--gold)' }}>
          <Icon name="g:medal" /> <b>Victory</b> at the Final wave {run.finale!.final}: {finalBoss(run)} slain
          {endlessDepth(run) > 0 ? <span> · Endless: {endlessDepth(run)} wave{endlessDepth(run) === 1 ? '' : 's'} past it</span> : null}
        </div>
      )}
      {banks && run.siege && (
        <div style={{ marginBottom: 4 }}>
          Weekly Siege {run.siege}: <b>{siegeDmg(run) !== undefined ? `${siegeDmg(run)!.toLocaleString()} damage` : `wave ${siegeScore(run)}`}</b>{' '}
          <span className="muted">· your best this week counts</span>
        </div>
      )}
      {!units.length && <div className="muted">No unit was crafted this run.</div>}
      {(units.length > 0 || shards.length > 0 || defences.length > 0) && (
        <table>
          <thead>
            <tr><th>Unit</th><th data-tip="Enemies it finished off">Kills</th><th data-tip="Wounds it dealt">Damage</th><th data-tip="Levels bought this run">Levels</th><th data-tip="XP earned this run">XP</th></tr>
          </thead>
          <tbody>
            {units.map((t) => (
              <tr key={t.id} className={t === lead && t.kills > 0 ? 'mvp' : ''}>
                <td>{t === lead && t.kills > 0 ? <><Icon name="g:round-star" /> </> : null}{t.name}</td>
                <td>{t.kills}</td>
                <td>{n(t.dealt)}</td>
                <td>{t.up}/{t.cap}</td>
                <td>{banks ? xp[t.unitId] ?? 0 : '–'}</td>
              </tr>
            ))}
            {defences.length > 0 && (
              <tr className="muted">
                <td>Defences ({defences.length})</td>
                <td>{defences.reduce((s, t) => s + t.kills, 0)}</td>
                <td>{n(defences.reduce((s, t) => s + t.dealt, 0))}</td>
                <td>–</td>
                <td>–</td>
              </tr>
            )}
            {shards.length > 0 && (
              <tr className="muted">
                <td>Shards ({shards.length})</td>
                <td>{shards.reduce((s, t) => s + t.kills, 0)}</td>
                <td>{n(shards.reduce((s, t) => s + t.dealt, 0))}</td>
                <td>–</td>
                <td>–</td>
              </tr>
            )}
          </tbody>
        </table>
      )}
      {banks && force && run.phase === 'over' && <RunHonoursView run={run} force={force} best={best} />}
      {shared.length > 0 && (
        <ul className="training-shared">
          {shared.map((l, i) => (
            <li key={i} style={{ color: l.good ? 'var(--green)' : 'var(--red)' }}>{l.text}</li>
          ))}
        </ul>
      )}
      {drill.length > 0 && (
        <ul className="training-shared">
          {drill.map((i) => {
            const u = unlockText(DRILL_GOALS[i].unlock);
            return <li key={i} style={{ color: 'var(--gold)' }}>Drill Honour: {u.name}. {u.text}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

/** How the run ended, from its closing log line ("The base falls. Waves cleared: 7." gives "The base falls."). */
export function endReason(run: TrainingRun): string | null {
  for (let i = run.log.length - 1; i >= 0; i--) {
    const m = /^(.*?)\s*Waves cleared: \d+\.$/.exec(run.log[i]);
    if (m) return m[1] || null;
  }
  return null;
}
