import type { Force } from '../../model/types';
import { runHonours, titleInfo, unitTowers, type TrainingRun } from '../../rules/training';

/** What an ended run hands each crafted unit: its Training record after the run, the titles earned (gold) and the
 *  run's tales. Banked honours (run.honours) once the run is paid out, else worked out from the force as it stands. */
export function RunHonoursView({ run, force, best }: { run: TrainingRun; force: Force; best?: number }) {
  const h = run.honours ?? runHonours(run, force, best ?? force.trainingBest ?? 0);
  const units = unitTowers(run).filter((t) => h.records[t.unitId]);
  if (!units.length && !h.tales.length) return null;
  return (
    <div className="training-honours">
      {units.length > 0 && (
        <table>
          <thead>
            <tr>
              <th title="Training record after this run">Record</th><th title="Best wave cleared">Best</th><th title="Kills over every run">Kills</th>
              <th title="Real Echo Lords and the nemesis slain">Lords</th><th title="Runs it was crafted in">Runs</th><th title="Runs it led the defence">MVPs</th>
            </tr>
          </thead>
          <tbody>
            {units.map((t) => {
              const r = h.records[t.unitId];
              return (
                <tr key={t.id}>
                  <td>{t.name}</td><td>{r.best}</td><td>{r.kills}</td><td>{r.lords}</td><td>{r.runs}</td><td>{r.mvps}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {h.titles.length > 0 && (
        <ul className="training-shared">
          {h.titles.map((g) => (
            <li key={`${g.unitId}:${g.title}`} style={{ color: 'var(--gold)' }}>{g.name} is now known as {titleInfo(g.title)?.name ?? g.title}</li>
          ))}
        </ul>
      )}
      {h.tales.map((t, i) => <p key={i} className="training-tale">{t.text}</p>)}
    </div>
  );
}
