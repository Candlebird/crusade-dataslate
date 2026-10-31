import { useState, type ReactNode } from 'react';
import { useStore } from '../model/store';
import { uid, nowIso } from '../model/factory';
import { localDate } from '../model/date';
import type { Force } from '../model/types';
import { downtimeBlocks } from '../model/downtime';
import { EXPEDITION, GARRISON, OFF_TABLE_XP, SOLO_PATROL, SORTIE, TRAINING } from '../rules/downtimeData';
import { TASK_NAMES, claimGarrisons, garrisonClaims, tasksOf } from '../rules/tasks';
import { finalWon } from '../rules/training';
import { unitName } from '../rules/battle';
import ExpeditionModal from './ExpeditionModal';
import PatrolModal from './PatrolModal';
import UnitTaskModal from './UnitTaskModal';
import TrainingModal from './TrainingModal';
import SortieModal from './SortieModal';
import { Icon, type IconName } from './Icon';
import { Panel, toast } from './ui';

/** One between-games mode: what it is, how it's going, and its button (with why it's greyed out, if it is). */
function Mode({ icon, name, status, blocked, button, onOpen, children }: {
  icon: IconName;
  name: string;
  status?: ReactNode;
  blocked?: string;
  button: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="list-item downtime-mode">
      <span className="downtime-icon"><Icon name={icon} /></span>
      <span className="grow small">
        <b>{name}</b>{status && <> <span className="muted">· {status}</span></>}
        <span className="downtime-what">{children}</span>
        {blocked && <span className="downtime-why">{blocked}</span>}
      </span>
      <button disabled={!!blocked} onClick={onOpen} data-tip={blocked}>{button}</button>
    </div>
  );
}

/**
 * Everything a force can do between table games, in one place: Expeditions and unit tasks (Nexus Wars only; a task is
 * still listed, greyed out, outside it), Solo patrols, the Training sim and Sorties. Each says what it costs the force, how it's going, and why it can't start.
 */
export default function DowntimePanel({ f }: { f: Force }) {
  const { state, update } = useStore();
  const c = state.campaign;
  const faction = c && f.nexus && c.factions.find((x) => x.id === f.nexus!.factionId);
  const nexus = faction ? c : undefined;
  const [open, setOpen] = useState<'expedition' | 'task' | 'patrol' | 'training' | 'sortie' | null>(null);
  const blocks = downtimeBlocks(f, nexus, state.forces);
  const tasks = nexus ? tasksOf(f, nexus) : {};
  const busy = Object.entries(tasks).flatMap(([id, t]) => {
    const u = f.units.find((x) => x.id === id);
    return u ? [`${unitName(u)} (${TASK_NAMES[t]})`] : [];
  });
  const claims = nexus ? garrisonClaims(nexus, f) : [];
  const claim = () => {
    let summary = '';
    update((s) => {
      const d = s.forces.find((x) => x.id === f.id);
      if (!d || !s.campaign) return;
      summary = claimGarrisons(s.campaign, d, localDate(), uid);
      d.updatedAt = nowIso();
    });
    if (summary) toast(summary);
  };
  const close = () => setOpen(null);
  const training = [
    f.trainingBest && `best ${f.trainingBest} waves`,
    f.finale && Object.keys(f.finale.wins).length && `Victory at ${finalWon(f)}`,
    f.finale?.endless && `Endless +${f.finale.endless}`,
  ].filter(Boolean).join(', ');

  return (
    <Panel id="force.downtime" title="Between games" h={3} className="downtime">
      {nexus && (
        <Mode icon="g:telescope" name="Expedition" button="Expedition…" blocked={blocks.expedition} onOpen={() => setOpen('expedition')}>
          Send up to 3 units on an Expedition. Each unit takes part in one a round, and your faction runs {EXPEDITION.perFaction} a round across all its forces.
        </Mode>
      )}
      {/* Always listed, so a player outside Nexus Wars sees it exists and what it needs. */}
      <Mode icon="g:gears" name="Unit task" button="Unit task…" blocked={blocks.task} onOpen={() => setOpen('task')}
        status={busy.length > 0 && `${busy.length} busy`}>
        Mentoring, Project, Recon or Garrison. The unit is busy all round; it can still fight, Battle-Worn (-1 Quality and -1 Defense).
        {busy.length > 0 && <span className="downtime-what muted">Busy this round: {busy.join(', ')}</span>}
      </Mode>
      {nexus && (
        <>
          {claims.length > 0 && (
            <div className="list-item">
              <span className="downtime-icon"><Icon name="g:white-tower" /></span>
              <span className="grow small"><b>Garrison XP:</b> Marauders raided {claims.map((x) => x.sector.name).join(', ')}. +{GARRISON.raidXp} XP to each unit on guard.</span>
              <button className="primary" onClick={claim}>Claim garrison XP</button>
            </div>
          )}
        </>
      )}
      <Mode icon="g:radar-dish" name="Solo patrol" button="Patrol…" blocked={blocks.patrol} onOpen={() => setOpen('patrol')}>
        Send up to {SOLO_PATROL.points} pts to find a {SOLO_PATROL.enemyMin}–{SOLO_PATROL.enemyMax} pts enemy, then fight or turn back.
      </Mode>
      <Mode icon="g:archery-target" name="Training sim" button="Train…" blocked={blocks.training} onOpen={() => setOpen('training')} status={training || undefined}>
        Draft Shards into a maze, craft your units from them and hold the base against endless waves. Each crafted unit earns {TRAINING.xpPerWave} XP
        every {TRAINING.xpEvery} waves (up to {TRAINING.xpCap}). Any time, as often as you like; units don't become busy.
      </Mode>
      <Mode icon="g:broadsword" name="Sortie" button="Sortie…" blocked={blocks.sortie} onOpen={() => setOpen('sortie')}
        status={f.sortieBest ? `furthest ${f.sortieBest} nodes` : undefined}>
        A party of 3 pushes through Echo fights, camps and shrines to an Echo lord. A free run earns up to {SORTIE.caps.free.short}–{SORTIE.caps.free.long} XP.
        A Shard run costs {SORTIE.cost} Umbra Shards, earns up to {SORTIE.caps.shard.long} XP and brings home Supply, RP and up to {SORTIE.haul.maxUs} shards.
      </Mode>
      <p className="muted small" style={{ margin: '0.5rem 0 0' }}>
        <Icon name="g:upgrade" /> Training and free Sorties together bank at most {OFF_TABLE_XP.perRound} XP per unit a {c ? 'round' : 'week'}.
      </p>

      {open === 'expedition' && nexus && <ExpeditionModal force={f} c={nexus} onClose={close} />}
      {open === 'task' && nexus && <UnitTaskModal force={f} c={nexus} onClose={close} />}
      {open === 'patrol' && <PatrolModal force={f} onClose={close} />}
      {open === 'training' && <TrainingModal force={f} c={c} onClose={close} />}
      {open === 'sortie' && <SortieModal force={f} c={c} onClose={close} />}
    </Panel>
  );
}
