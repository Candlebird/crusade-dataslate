import { useState } from 'react';
import type { Campaign, Force } from '../../model/types';
import { localDate } from '../../model/date';
import { levelForXp } from '../../rules/engine';
import { unitName } from '../../rules/battle';
import { OFF_TABLE_XP, TRAINING } from '../../rules/downtimeData';
import { offTableKey, offTableLeft } from '../../rules/downtime';
import { canTrain, finaleOpen, finalWon, nexusLines, MODES, modeName, modesOpen, nexusOf, pickNemesis, type RunMode, type SavedRun } from '../../rules/training';
import { FeatList } from '../Feats';
import { DrillTrack } from './DrillTrack';
import { FinaleTrack } from './FinaleTrack';
import { SiegeBoards, SiegeRules } from './SiegePanel';
import { WeekCountdown } from '../WeekCountdown';
import { Portrait } from '../Emblem';

export interface StartScreenProps {
  force: Force;
  c?: Campaign;
  /** The force's saved run, if any. */
  saved: SavedRun | null;
  /** An older version's saved run was dropped on opening (say so, once). */
  cleared?: boolean;
  /** The next run is this week's Weekly Siege (and the toggle that picks it). */
  siege?: boolean;
  onSiege?: (siege: boolean) => void;
  /** Normal (none), Hard or Insane for the next run, and its picker. */
  mode?: RunMode;
  onMode?: (mode: RunMode | undefined) => void;
  week?: string;
}

type Tab = 'nexus' | 'boards' | 'progress' | 'units' | 'rules';
const TAB_KEY = 'training-start-tab';
const readTab = (): Tab | null => {
  try { return localStorage.getItem(TAB_KEY) as Tab | null; } catch { return null; }
};
const saveTab = (t: Tab) => {
  try { localStorage.setItem(TAB_KEY, t); } catch { /* a private window: not remembered */ }
};

/** Before a run: a launch strip (your own run or the Weekly Siege, the difficulty, the record so far and any saved run),
 *  then tabs: the campaign's Nexus or the siege boards, progress (Final ladder, Drill Honours, feats), the units that
 *  can be crafted, and how to play. */
export function StartScreen({ force, c, saved, cleared, siege, onSiege, mode, onMode, week = '' }: StartScreenProps) {
  const key = offTableKey(c, localDate());
  const units = force.units.filter(canTrain);
  const modes = modesOpen(siege ? week : undefined);
  const nexus = !siege && !!nexusOf(c);
  const tabs: [Tab, string][] = [
    ...(siege ? [['boards', 'Boards'] as [Tab, string]] : nexus ? [['nexus', 'Nexus'] as [Tab, string]] : []),
    ['progress', siege ? 'Feats' : 'Progress'],
    ['units', `Units (${units.length})`],
    ['rules', 'Rules'],
  ];
  const [picked, setPicked] = useState<Tab | null>(readTab);
  // The first tab (the boards or the Nexus) stands in for the other's when the run type changes.
  const tab = tabs.some(([t]) => t === picked) ? picked! : tabs[0][0];
  const pick = (t: Tab) => {
    setPicked(t);
    saveTab(t);
  };
  return (
    <div className="training-start">
      <section className="training-launch">
        {onSiege && (
          <div className="seg training-kind" role="group" aria-label="Which run">
            <button className={!siege ? 'on' : ''} aria-pressed={!siege} onClick={() => onSiege(false)}>Your own run</button>
            <button className={siege ? 'on' : ''} aria-pressed={!!siege} onClick={() => onSiege(true)}>Weekly Siege · {week}</button>
          </div>
        )}
        {onMode && modes && <ModePicker mode={mode} onMode={onMode} siege={!!siege} />}
        <div className="training-launch-facts small">{launchFacts(force, siege)}</div>
        {siege && <div className="small"><WeekCountdown /></div>}
        {cleared && !saved && <div className="small training-cleared">Training was updated; your saved run was cleared.</div>}
        {saved && (
          <div className="small training-saved">
            <b>Saved {saved.run.siege ? `Weekly Siege (${saved.run.siege})` : 'run'}{saved.run.mode ? `, ${modeName(saved.run.mode)}` : ''}:</b>{' '}
            {saved.run.cleared} wave{saved.run.cleared === 1 ? '' : 's'} cleared, base {saved.run.baseHp}/{TRAINING.baseHp},{' '}
            {saved.run.crafted.length} unit{saved.run.crafted.length === 1 ? '' : 's'} crafted
            {saved.savedAt ? <span className="muted"> · {new Date(saved.savedAt).toLocaleString()}</span> : null}.
          </div>
        )}
      </section>
      <div className="training-start-tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => pick(t)}>{label}</button>
        ))}
      </div>
      <div className="training-tabpanel small" role="tabpanel">
        {tab === 'boards' && <SiegeBoards force={force} c={c} week={week} mode={modes ? mode : undefined} />}
        {tab === 'nexus' && <NexusBrief force={force} c={c} />}
        {tab === 'progress' && (
          <div className="training-progress">
            {!siege && <FinaleTrack force={force} c={c} />}
            {!siege && <DrillTrack force={force} />}
            <FeatList force={force} where="training" c={c} />
          </div>
        )}
        {tab === 'units' && (
          <>
            <p className="muted" style={{ margin: '0 0 8px' }}>
              Each unit has a recipe of Shards: craft it to field it as a tower. XP left is what each can still bank off the table this {c ? 'round' : 'week'}.
            </p>
            {!units.length && <p className="muted">No active units to train.</p>}
            <div className="training-roster">
              {units.map((u) => (
                <div key={u.id} className="training-roster-unit">
                  <Portrait unit={u} size={34} />
                  <span className="grow">
                    <b>{unitName(u)}</b>
                    <span className="muted training-roster-xp">{u.category} · level {levelForXp(u.xp)} · {u.points} pts · {offTableLeft(u, key)} XP left</span>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {tab === 'rules' && (
          <>
            {siege && (
              <div className="training-rules-siege">
                <div style={{ marginBottom: 4 }}><b>Weekly Siege</b> <span className="muted">· {week}</span></div>
                <SiegeRules c={c} week={week} mode={modes ? mode : undefined} />
              </div>
            )}
            <div className="training-intro">
              <div>
                <ol className="training-steps">
                  <li><b>Draft.</b> Before each wave, draw {TRAINING.shards.draw} Shards (always {TRAINING.shards.draw}) and set them on the map as a maze.</li>
                  <li><b>Keep.</b> Keep one (two or four alike merge a grade or two up); the rest crumble to rubble.</li>
                  <li><b>Craft.</b> Kept Shards that match a unit's recipe craft it: a tower with its own weapons and rules.</li>
                </ol>
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  The Echoes walk from S over pads 1–{TRAINING.route.pads.length} to the base. Slay the boss of the Final wave
                  ({finaleOpen(force)} for now) with the base ({TRAINING.baseHp} HP) standing for a Victory, then bank it or go on
                  into Endless; the run ends when the base falls, and saves between waves. Each crafted unit earns <b>+{TRAINING.xpPerWave} XP</b> every
                  {' '}{TRAINING.xpEvery} waves, up to <b>{TRAINING.xpCap}</b> a run, within the {OFF_TABLE_XP.perRound} off-table XP a unit banks
                  each {c ? 'round' : 'week'}.
                </p>
              </div>
              <RouteThumb />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The line under the run pickers: the force's record, or what the siege is. */
function launchFacts(force: Force, siege?: boolean): string {
  if (siege) return 'The same map and waves for every force this week. Try as often as you like; your best counts.';
  const won = finalWon(force);
  const deep = force.finale?.endless ?? 0;
  const bits = [force.trainingBest ? `${force.trainingBest} waves` : '', won ? `Victory at ${won}` : '', deep ? `Endless +${deep}` : ''].filter(Boolean);
  return `Final wave ${finaleOpen(force)}${bits.length ? ` · Best: ${bits.join(', ')}` : ''}`;
}

/** The campaign's Nexus as a new run meets it: threat and affixes, the Galactic Event, and the Echo Lords by wave. */
function NexusBrief({ force, c }: { force: Force; c?: Campaign }) {
  const nx = nexusOf(c);
  // Outside a campaign there is no threat and every boss is a plain Echo Lord: nothing worth a box.
  if (!nx) return null;
  const lines = nexusLines(nx, !!pickNemesis(force.sortie), finaleOpen(force));
  return (
    <div className="training-nexus">
      <div><b>The Nexus</b> <span className="muted">· {lines.threat}</span></div>
      {nx && (
        <ul>
          {lines.affixes.map((a) => <li key={a}>{a}</li>)}
          {!lines.affixes.length && <li className="muted">No threat affixes yet (one a {TRAINING.nexus.affixes.per} threat levels).</li>}
          <li>{lines.event}</li>
        </ul>
      )}
      <div style={{ marginTop: 4 }}><b>Echo Lords</b></div>
      <ul>{lines.lords.map((l) => <li key={l}>{l}</li>)}</ul>
    </div>
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

/** Normal, Hard or Insane for the next run, and what the one picked does to the waves and is worth. */
function ModePicker({ mode, onMode, siege }: { mode?: RunMode; onMode: (mode: RunMode | undefined) => void; siege: boolean }) {
  const M = TRAINING.modes;
  const about = (m?: RunMode) => {
    if (!m) return siege ? 'The siege as everyone plays it.' : 'The waves as they come.';
    const hp = `Waves rise to ×${M[m][siege ? 'siege' : 'train']} wounds by wave ${M.rampTo}`;
    const worth = siege ? `own boards, ×${M[m].reward} Shards and RP` : 'its own feats';
    return `${hp}; ${worth}. ${m === 'insane' ? 'Next to impossible: for the very strongest forces.' : 'For a force that already crushes Normal.'}`;
  };
  return (
    <div className="training-mode">
      <div className="seg" role="group" aria-label="Difficulty">
        <button className={!mode ? 'on' : ''} aria-pressed={!mode} onClick={() => onMode(undefined)}>Normal</button>
        {MODES.map((m) => (
          <button key={m} className={`${mode === m ? 'on' : ''} training-mode-${m}`} aria-pressed={mode === m} onClick={() => onMode(m)}>{modeName(m)}</button>
        ))}
      </div>
      <span className="muted small">{about(mode)}</span>
    </div>
  );
}
