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
      <p className="small" style={{ marginTop: 0 }}>
        Before every wave, draw {TRAINING.shards.draw} Shards and set them on the map; keep one (two or four alike merge a grade
        or two up) and the rest crumble to rubble. The Echoes walk from S over pads 1–{TRAINING.route.pads.length} to the base
        through the maze you build. Kept Shards that match a unit's recipe craft that unit, a real tower with its own weapons
        and rules. Each crafted unit earns <b>+{TRAINING.xpPerWave} XP</b> every {TRAINING.xpEvery} waves, up to <b>{TRAINING.xpCap} XP</b> a
        run, within the limit of <b>{OFF_TABLE_XP.perRound} off-table XP</b> a unit banks each {c ? 'round' : 'week'} from Training and free Sorties.
      </p>
      <p className="muted small">
        The run is endless and ends when the base ({TRAINING.baseHp} HP) falls. It saves between waves, so you can close it and come back.
        {force.trainingBest ? ` Best so far: ${force.trainingBest} waves.` : ''}
      </p>
      {saved && (
        <p className="small">
          <b>Saved run:</b> {saved.run.cleared} wave{saved.run.cleared === 1 ? '' : 's'} cleared, base {saved.run.baseHp}/{TRAINING.baseHp}, {saved.run.crafted.length} unit{saved.run.crafted.length === 1 ? '' : 's'} crafted
          {saved.savedAt ? <span className="muted"> · {new Date(saved.savedAt).toLocaleString()}</span> : null}.
        </p>
      )}
      <FeatList force={force} where="training" />
      <div className="small" style={{ marginBottom: 4 }}><b>Units</b> <span className="muted">· each has a recipe</span></div>
      {!units.length && <p className="muted small">No active units to train.</p>}
      {units.map((u) => (
        <div key={u.id} className="row small" style={{ gap: 6 }}>
          <Portrait unit={u} size={22} />
          <span className="grow">
            {unitName(u)} <span className="muted">· {u.category} · level {levelForXp(u.xp)} · {u.points} pts · {offTableLeft(u, key)} off-table XP left</span>
          </span>
        </div>
      ))}
    </>
  );
}
