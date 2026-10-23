import { useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import type { Force, Unit } from '../model/types';
import { go, href } from '../route';
import { unitName } from '../rules/battle';
import { battlePoints } from '../rules/engine';
import { currentRound, markUnitsUsed, unitsUsed } from '../rules/nexus';
import { rollAdvancedMission, type MissionDef } from '../rules/missions';
import { patrolBattle } from '../rules/tracker';
import { echoesBook, randomEchoes } from '../rules/echoForce';
import { ECHOES } from '../rules/nexusData';
import { SOLO_PATROL } from '../rules/downtimeData';
import { declinePatrol, rollPatrolEnemy } from '../rules/downtime';
import { Modal, confirmAction, toast } from './ui';
import { localDate } from '../model/date';

/** What the patrol ran into: fight it on the battle tracker, or turn back for a little XP. */
interface Sighting {
  points: number;
  mission: MissionDef;
  echoes?: Unit[];
}

/** Send up to 500 pts of one force out on a Solo patrol. It meets a 400–700 pts enemy, and the player fights it or turns back. */
export default function PatrolModal({ force, mission, onClose }: { force: Force; mission?: MissionDef; onClose: () => void }) {
  const { state, update, updateForce } = useStore();
  const c = state.campaign;
  const linked = !!(c && force.nexus && c.factions.some((x) => x.id === force.nexus!.factionId));
  const used = linked ? unitsUsed(force, c) : [];
  const done = linked && force.nexus!.patrolRound === currentRound(c!);
  const active = force.units.filter((u) => u.status === 'active');
  const [picked, setPicked] = useState<string[]>([]);
  const [found, setFound] = useState<Sighting | null>(null);
  const points = active.filter((u) => picked.includes(u.id)).reduce((n, u) => n + u.points, 0);
  const book = echoesBook(state.books);

  const setOut = () => {
    const enemy = rollPatrolEnemy();
    setFound({ points: enemy, mission: mission ?? rollAdvancedMission(), echoes: book ? randomEchoes(book, enemy) : undefined });
  };

  const fight = () => {
    if (!found) return;
    if (done && !confirmAction(`${force.name} already recorded a patrol this round. Fight another anyway?`)) return;
    if (state.battle && !confirmAction('A battle is already in progress. Replace it with this patrol?')) return;
    update((s) => void (s.battle = patrolBattle(found.mission, uid(), nowIso(), force, picked, s.settings, found.echoes)));
    onClose();
    go(href.tracker());
  };

  const decline = () => {
    if (!found) return;
    let summary = '';
    updateForce(force.id, (d) => {
      summary = declinePatrol(d, picked, found.points, localDate(), uid);
      if (linked) markUnitsUsed(d, c!, picked);
    });
    toast(summary);
    onClose();
  };

  let body;
  let footer;
  if (!found) {
    body = (
      <>
        <p className="muted small">
          Take up to {SOLO_PATROL.points} pts out to find a {SOLO_PATROL.enemyMin}–{SOLO_PATROL.enemyMax} pts force of the {ECHOES.name}.
          Fight it against the AI for participation and kill XP (no RP or reward rolls), or turn back for +{SOLO_PATROL.declineXp} XP per unit.
          {linked ? ' Either way, the units have gone out for this round.' : ''}
        </p>
        {done && <p className="small"><span className="tag gold">{force.name} already recorded a patrol this round.</span></p>}
        {used.length > 0 && <p className="muted small">Each unit gets 1 skirmish, Solo patrol or Expedition a round. The main Battle doesn't count.</p>}
        <div className="mission-pick">
          {active.length === 0 && <span className="muted small">No active units.</span>}
          {active.map((u) => {
            const on = picked.includes(u.id);
            const spent = used.includes(u.id);
            const over = !on && (spent || points + u.points > SOLO_PATROL.points);
            return (
              <label key={u.id} className={`shop-item${on ? ' selected' : ''}${over ? ' disabled' : ''}`}>
                <input type="checkbox" checked={on} disabled={over} onChange={() => setPicked(on ? picked.filter((x) => x !== u.id) : [...picked, u.id])} />
                <div className="grow">
                  <b>{unitName(u)}</b> <span className="muted small">{u.points} pts · {battlePoints(u, state.settings)} BP</span>
                  {spent && <> <span className="tag gold">Already fought this round</span></>}
                </div>
              </label>
            );
          })}
        </div>
        {!book && <p className="muted small">Load the {ECHOES.name} army book to generate their army, or fill in the AI side by hand.</p>}
      </>
    );
    footer = (
      <>
        <b className="grow">{points} / {SOLO_PATROL.points} pts</b>
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={!picked.length} onClick={setOut}>Send patrol</button>
      </>
    );
  } else {
    const names = active.filter((u) => picked.includes(u.id)).map(unitName);
    body = (
      <>
        <p>
          Your patrol ({names.join(', ')} · {points} pts) has found a <b>{found.points} pts</b> force of the {ECHOES.name}.
        </p>
        <p className="small"><span className="muted">Mission:</span> <b>{found.mission.name}</b></p>
        {found.echoes && (
          <ul className="small">
            {found.echoes.map((u) => <li key={u.id}>{unitName(u)} <span className="muted">{u.points} pts</span></li>)}
          </ul>
        )}
        <p className="muted small">
          Fight: the battle opens on the Battle page. Record it when it's over.
          {' '}Turn back: each unit gets +{SOLO_PATROL.declineXp} XP{linked ? ' and sits out the rest of this round' : ''}.
        </p>
      </>
    );
    footer = (
      <>
        <button onClick={decline}>Turn back (+{SOLO_PATROL.declineXp} XP each)</button>
        <button className="primary" onClick={fight}>Fight</button>
      </>
    );
  }

  // Closing once the enemy is in sight is turning back: no rerolling the enemy.
  return <Modal title="Solo patrol" onClose={found ? decline : onClose} footer={footer} wide>{body}</Modal>;
}
