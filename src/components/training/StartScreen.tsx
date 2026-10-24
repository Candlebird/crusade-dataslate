import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { levelForXp } from '../../rules/engine';
import { unitName } from '../../rules/battle';
import { OFF_TABLE_XP, TRAINING } from '../../rules/downtimeData';
import { offTableKey, offTableLeft } from '../../rules/downtime';
import { canTrain, type SavedRun } from '../../rules/training';
import { FeatList } from '../Feats';
import { Portrait } from '../Emblem';

export interface StartScreenProps {
  force: Force;
  c?: Campaign;
  /** The force's saved run, if any. */
  saved: SavedRun | null;
}

/** Before a run: what Training is, the units that can be crafted, and the saved run if there is one. */
export function StartScreen({ force, c, saved }: StartScreenProps) {
  const key = offTableKey(c, localDate());
  const units = force.units.filter(canTrain);
  return (
    <>
      <div className="training-intro">
        <div className="small">
          <ol className="training-steps">
            <li><b>Draft.</b> Before each wave, draw {TRAINING.shards.draw} Shards and set them on the map as a maze.</li>
            <li><b>Keep.</b> Keep one (two or four alike merge a grade or two up); the rest crumble to rubble.</li>
            <li><b>Craft.</b> Kept Shards that match a unit's recipe craft it: a tower with its own weapons and rules.</li>
          </ol>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            The Echoes walk from S over pads 1–{TRAINING.route.pads.length} to the base. The run is endless and ends when the
            base ({TRAINING.baseHp} HP) falls; it saves between waves. Each crafted unit earns <b>+{TRAINING.xpPerWave} XP</b> every
            {' '}{TRAINING.xpEvery} waves, up to <b>{TRAINING.xpCap}</b> a run, within the {OFF_TABLE_XP.perRound} off-table XP a unit banks
            each {c ? 'round' : 'week'}.{force.trainingBest ? ` Best so far: ${force.trainingBest} waves.` : ''}
          </p>
        </div>
        <RouteThumb />
      </div>
      {saved && (
        <p className="small">
          <b>Saved run:</b> {saved.run.cleared} wave{saved.run.cleared === 1 ? '' : 's'} cleared, base {saved.run.baseHp}/{TRAINING.baseHp}, {saved.run.crafted.length} unit{saved.run.crafted.length === 1 ? '' : 's'} crafted
          {saved.savedAt ? <span className="muted"> · {new Date(saved.savedAt).toLocaleString()}</span> : null}.
        </p>
      )}
      <FeatList force={force} where="training" />
      <div className="small" style={{ marginBottom: 4 }}><b>Units</b> <span className="muted">· each has a recipe</span></div>
      {!units.length && <p className="muted small">No active units to train.</p>}
      <div className="training-roster">
        {units.map((u) => (
          <div key={u.id} className="training-roster-unit small">
            <Portrait unit={u} size={34} />
            <span className="grow">
              <b>{unitName(u)}</b>
              <span className="muted"> · {u.category} · level {levelForXp(u.xp)} · {u.points} pts</span>
              <span className="muted training-roster-xp">{offTableLeft(u, key)} off-table XP left</span>
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

/** A sketch of the map: the spawn, the pads in the order walked, and the base. */
function RouteThumb() {
  const R = TRAINING.route;
  const N = TRAINING.mapSize;
  const pts = [R.spawn, ...R.pads, R.base].map((t) => `${t.x + 1},${t.y + 1}`).join(' ');
  return (
    <svg className="training-thumb" viewBox={`0 0 ${N} ${N}`} role="img" aria-label="The route: spawn, pads 1 to 5, base">
      <rect width={N} height={N} rx={2} fill="#0c0d0f" stroke="var(--line)" strokeWidth={0.6} />
      <polyline points={pts} fill="none" stroke="var(--red)" strokeWidth={1} strokeDasharray="2 1.5" opacity={0.8} />
      <rect x={R.spawn.x - 1} y={R.spawn.y - 1} width={4} height={4} rx={0.6} fill="#5a2620" stroke="var(--red)" strokeWidth={0.5} />
      <text x={R.spawn.x + 1} y={R.spawn.y + 2.4} textAnchor="middle" fontSize={3.4} fill="var(--text)">S</text>
      {R.pads.map((p, i) => (
        <g key={i}>
          <rect x={p.x - 1} y={p.y - 1} width={4} height={4} rx={0.6} fill="#3a2a18" stroke="#d58a3a" strokeWidth={0.5} />
          <text x={p.x + 1} y={p.y + 2.3} textAnchor="middle" fontSize={3.2} fill="var(--text)">{i + 1}</text>
        </g>
      ))}
      <rect x={R.base.x - 1.5} y={R.base.y - 1.5} width={5} height={5} rx={0.8} fill="#3b331c" stroke="var(--gold)" strokeWidth={0.6} />
    </svg>
  );
}
