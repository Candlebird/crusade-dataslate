import { useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import { localDate } from '../model/date';
import type { Campaign, Force, UnitTaskKind } from '../model/types';
import { unitName } from '../rules/battle';
import { levelForXp } from '../rules/engine';
import { currentRound } from '../rules/nexus';
import { GARRISON, MENTORING, PROJECT_DIE, PROJECTS, RECON } from '../rules/downtimeData';
import {
  TASK_NAMES, activeProject, freeUnits, garrison, garrisonNow, garrisonPoints, mentor, mentorProblem, mentorXp, projectById, projectProblem,
  projectRewardText, reconArea, reconTargets, scout, workProject, worldsOf,
} from '../rules/tasks';
import { Modal, toast } from './ui';

const TASK_DESC: Record<Exclude<UnitTaskKind, 'sortie'>, string> = {
  mentor: `A veteran teaches a lower-level unit of its category. The pupil gains +${MENTORING.xpPerLevel} XP per mentor level. Both units are busy.`,
  project: `Add D${PROJECT_DIE} progress to a world's Project (1 per world). It pays out at its goal.`,
  recon: `Scout a sector up to ${RECON.range} hexes from your sectors or detachments. It and its neighbors stay in sight for ${RECON.rounds} rounds.`,
  garrison: `Guard one of your worlds. A garrison worth at least half a Marauder band's Supply throws it back. A smaller one halves the theft. Each unit earns +${GARRISON.raidXp} XP per raid.`,
};

/** Set one unit (two for Mentoring) to a downtime task for the round. They're busy and fight in no battle until it ends. */
export default function UnitTaskModal({ force, c, onClose }: { force: Force; c: Campaign; onClose: () => void }) {
  const { update } = useStore();
  const factionId = force.nexus?.factionId ?? '';
  const free = freeUnits(force, c);
  const [task, setTask] = useState<Exclude<UnitTaskKind, 'sortie'>>('project');
  const [unitId, setUnitId] = useState(free[0]?.id ?? '');
  const [pupilId, setPupilId] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [done, setDone] = useState<string | null>(null);

  const unit = free.find((u) => u.id === unitId);
  const pupil = free.find((u) => u.id === pupilId);
  const worlds = worldsOf(c, factionId);
  const targets = task === 'recon' ? reconTargets(c, factionId) : [];
  const sector = c.sectors.find((s) => s.id === sectorId);
  const on = task === 'project' && sector ? activeProject(sector) : undefined;
  // One project per world: a world with one under way takes more work on it.
  const pid = on ? on.id : projectId;
  const pupils = unit ? free.filter((u) => u.id !== unit.id && u.category === unit.category && levelForXp(u.xp) < levelForXp(unit.xp)) : [];

  const pick = (t: keyof typeof TASK_DESC) => {
    setTask(t);
    setSectorId('');
    setPupilId('');
  };

  // Why the task can't be set yet, or null when it can.
  const problem = !unit
    ? 'Choose a unit.'
    : task === 'mentor' ? mentorProblem(unit, pupil)
    : task === 'project' ? projectProblem(sector, pid, factionId)
    : !sector ? 'Choose a sector.'
    : null;

  const busyNames = unit ? [unit, ...(task === 'mentor' && pupil ? [pupil] : [])].map(unitName).join(' and ') : '';
  const warning = busyNames && `${busyNames} can't go on an Expedition for the rest of round ${currentRound(c)}, and fight${unit && task === 'mentor' && pupil ? '' : 's'} Battle-Worn (-1 Quality and -1 Defense).`;

  // The "Busy all round" warning is on screen next to the button, so there's no second confirm.
  const apply = () => {
    if (problem) return;
    let summary = '';
    try {
      update((s) => {
        const f = s.forces.find((x) => x.id === force.id);
        const cc = s.campaign;
        if (!f || !cc) throw new Error('The campaign is not loaded.');
        const date = localDate();
        summary = task === 'mentor' ? mentor(f, cc, unitId, pupilId, date, uid)
          : task === 'project' ? workProject(cc, f, unitId, sectorId, pid, date, uid)
          : task === 'recon' ? scout(cc, f, unitId, sectorId, date, uid)
          : garrison(cc, f, unitId, sectorId, date, uid);
        f.updatedAt = nowIso();
        cc.updatedAt = nowIso();
      });
    } catch (e) {
      toast((e as Error).message, 'error');
      return;
    }
    setDone(summary);
    toast(`${TASK_NAMES[task]} set.`);
  };

  if (done) {
    return (
      <Modal title="Unit task" onClose={onClose} footer={<button className="primary" onClick={onClose}>Done</button>}>
        <p className="small"><b>Recorded:</b> {done}</p>
        <p className="muted small">The unit{task === 'mentor' ? 's are' : ' is'} busy until the GM ends the round.</p>
      </Modal>
    );
  }

  const def = projectById(pid);
  const g = task === 'garrison' && sector ? garrisonNow(c, sector) : undefined;

  return (
    <Modal
      title="Unit task"
      onClose={onClose}
      footer={<><button onClick={onClose}>Cancel</button><button className="primary" disabled={!!problem} data-tip={problem ?? undefined} onClick={apply}>Set task</button></>}
    >
      <div className="fields">
        <div className="span-all row" role="radiogroup" aria-label="Task">
          {(Object.keys(TASK_DESC) as (keyof typeof TASK_DESC)[]).map((t) => (
            <button key={t} role="radio" aria-checked={task === t} className={task === t ? 'primary' : ''} onClick={() => pick(t)}>{TASK_NAMES[t]}</button>
          ))}
        </div>
        <p className="span-all muted small" style={{ margin: 0 }}>{TASK_DESC[task]}</p>

        {!free.length && <p className="span-all small" style={{ margin: 0, color: 'var(--warn)' }}>Every active unit is busy or already fought this round. Tasks open again next round.</p>}
        <label className="field span-all">
          {task === 'mentor' ? 'Mentor' : 'Unit'}
          <select value={unitId} onChange={(e) => { setUnitId(e.target.value); setPupilId(''); }}>
            {!free.length && <option value="">No free units</option>}
            {free.map((u) => <option key={u.id} value={u.id}>{unitName(u)} · {u.category} · level {levelForXp(u.xp)} · {u.points} pts</option>)}
          </select>
        </label>

        {task === 'mentor' && unit && (
          <label className="field span-all">
            Pupil ({unit.category}, below level {levelForXp(unit.xp)})
            <select value={pupilId} onChange={(e) => setPupilId(e.target.value)}>
              <option value="">{pupils.length ? '— choose —' : 'No free unit to teach'}</option>
              {pupils.map((u) => <option key={u.id} value={u.id}>{unitName(u)} · level {levelForXp(u.xp)} · {u.xp} XP</option>)}
            </select>
          </label>
        )}
        {task === 'mentor' && unit && pupil && <p className="span-all small" style={{ margin: 0 }}>{unitName(pupil)} gains <b>+{mentorXp(unit)} XP</b>.</p>}

        {(task === 'project' || task === 'garrison') && (
          <label className="field span-all">
            World
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">{worlds.length ? '— choose —' : 'Your faction holds no worlds'}</option>
              {worlds.map((s) => {
                const p = activeProject(s);
                const gg = garrisonNow(c, s);
                const note = task === 'project' ? (p ? ` · ${projectById(p.id)?.name} ${p.progress}/${projectById(p.id)?.goal}` : '')
                  : gg ? ` · ${garrisonPoints(gg)} pts on guard` : '';
                return <option key={s.id} value={s.id}>{s.name}{note}</option>;
              })}
            </select>
          </label>
        )}

        {task === 'project' && (
          <>
            <label className="field span-all">
              Project
              <select value={pid} disabled={!!on} onChange={(e) => setProjectId(e.target.value)}>
                {PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name} · goal {p.goal} · {projectRewardText(p)}</option>)}
              </select>
            </label>
            {on
              ? <p className="span-all small" style={{ margin: 0 }}>Under way on {sector!.name}: <b>{on.progress}/{projectById(on.id)?.goal}</b>. 1 project per world, so this unit works on it.{on.log.length > 0 && <span className="muted"> {on.log.join(' · ')}</span>}</p>
              : def && <p className="span-all muted small" style={{ margin: 0 }}>{def.desc}</p>}
          </>
        )}

        {task === 'recon' && (
          <label className="field span-all">
            Sector to scout
            <select value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
              <option value="">{targets.length ? '— choose —' : 'Nothing in range: place sectors on the map'}</option>
              {targets.map((s) => <option key={s.id} value={s.id}>{s.name} · sees {reconArea(c, s).length} sectors</option>)}
            </select>
          </label>
        )}

        {task === 'garrison' && sector && (
          <p className="span-all small" style={{ margin: 0 }}>
            {g ? `${garrisonPoints(g)} pts already on guard (${g.units.map((x) => x.name).join(', ')}).` : 'No garrison there yet.'}
            {unit && <> With {unitName(unit)}: <b>{(g ? garrisonPoints(g) : 0) + unit.points} pts</b>, throws back a band of up to {Math.floor(((g ? garrisonPoints(g) : 0) + unit.points) / GARRISON.holdShare)} Supply.</>}
          </p>
        )}

        {problem && unit && <p className="span-all small" style={{ margin: 0, color: 'var(--warn)' }}>{problem}</p>}
        {warning && (
          <p className="span-all small panel" style={{ margin: 0, borderColor: 'var(--warn)' }}>
            <b style={{ color: 'var(--warn)' }}>Busy all round.</b> {warning}
          </p>
        )}
      </div>
    </Modal>
  );
}
