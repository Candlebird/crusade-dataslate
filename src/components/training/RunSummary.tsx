import {
  DRILL_GOALS, drillPreview, mvp, runXp, sharedPreview, siegeScore, towers, unlockText, unitTowers, type TrainingRun,
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
 *  the kept Shards as one row; then records, titles and tales, and what it hands the Sortie side (quirks, trinket,
 *  nemesis, bestiary), the Drill Honours earned, and a Weekly Siege's score. */
export function RunSummary({ run, best, force }: RunSummaryProps) {
  const lead = mvp(run);
  const xp = runXp(run);
  const units = [...unitTowers(run)].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt);
  const shards = towers(run).filter((t) => t.kind === 'shard');
  const n = (x: number) => Math.round(x);
  const record = best !== undefined && run.cleared > best;
  const shared = run.phase === 'over' ? sharedPreview(run) : [];
  const drill = force && run.phase === 'over' ? drillPreview(force, run) : [];
  return (
    <div className="training-summary small">
      <div style={{ marginBottom: 4 }}>
        <b>{run.cleared} wave{run.cleared === 1 ? '' : 's'} cleared</b>
        {record && <span style={{ color: 'var(--gold)' }}> · a new best</span>}
        {lead && lead.kills > 0 && <span className="muted"> · {lead.name} led the defence</span>}
      </div>
      {run.siege && <div style={{ marginBottom: 4 }}>Weekly Siege {run.siege}: <b>wave {siegeScore(run)}</b> <span className="muted">· your best this week counts</span></div>}
      {!units.length && <div className="muted">No unit was crafted this run.</div>}
      {(units.length > 0 || shards.length > 0) && (
        <table>
          <thead>
            <tr><th>Unit</th><th title="Enemies it finished off">Kills</th><th title="Wounds it dealt">Damage</th><th title="Levels bought this run">Levels</th><th title="XP earned this run">XP</th></tr>
          </thead>
          <tbody>
            {units.map((t) => (
              <tr key={t.id} className={t === lead && t.kills > 0 ? 'mvp' : ''}>
                <td>{t === lead && t.kills > 0 ? <><Icon name="g:round-star" /> </> : null}{t.name}</td>
                <td>{t.kills}</td>
                <td>{n(t.dealt)}</td>
                <td>{t.up}/{t.cap}</td>
                <td>{xp[t.unitId] ?? 0}</td>
              </tr>
            ))}
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
      {force && run.phase === 'over' && <RunHonoursView run={run} force={force} best={best} />}
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
