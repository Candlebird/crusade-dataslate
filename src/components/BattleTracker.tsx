import { useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import type { Force } from '../model/types';
import { go, href } from '../route';
import { useCloud } from '../cloud/CloudSync';
import { AGENDAS, MAX_AGENDAS } from '../rules/data';
import { COMBAT_MANIPULATIONS, MANIPULATION_PREFIX, SECTOR_TYPES, factionName, recordSectorGame, sectorEffect } from '../rules/nexus';
import { DEPLOYMENT_STYLES, SEIZE_RULE, allMissions, rollAdvancedMission, rollDeployment, type MissionDef } from '../rules/missions';
import {
  FORMATS,
  TEAMS,
  addSide,
  atSector,
  cycleHolder,
  held,
  leaders,
  loadForce,
  membersOf,
  newBattle,
  nexusNotes,
  nextRound,
  prevRound,
  removeSide,
  roundRules,
  rollObjectives,
  score,
  setHolder,
  setObjectives,
  setTeam,
  teamName,
  teamsOf,
  claims,
  finishBattle,
  resultFor,
  resultTitle,
  sectorGame,
  type FinishedBattle,
  type SectorGame,
  type Holder,
  type TeamKey,
  type TrackedBattle,
  type TrackerSide,
  type TrackerUnit,
} from '../rules/tracker';
import { AI_TREES } from '../rules/aiTrees';
import { MAX_PLAYERS, randomForces, randomFormat, type Format } from '../rules/randomBattle';
import AiActivation from './AiActivation';
import { Stepper, TextArea, TextField, confirmAction, toast } from './ui';

/** With a sector (from the Nexus Wars map), a new battle is set up to be fought over it. */
export default function BattleTracker({ sectorId, attacker }: { sectorId?: string; attacker?: string }) {
  const { state, update } = useStore();
  const b = state.battle;
  const sector = state.campaign?.sectors.find((s) => s.id === sectorId);
  if (!b) return <StartBattle sectorId={sector?.id} preset={attacker} />;

  const set = (fn: (d: TrackedBattle) => void) => update((s) => void (s.battle && fn(s.battle)));
  const sc = score(b);
  const top = leaders(b);
  const teams = teamsOf(b);
  const last = b.round >= b.mission.rounds;
  const notes = nexusNotes(b, state.campaign, state.forces);
  const holderName = (h: Holder) => (h === '' ? 'Nobody' : h === 'x' ? 'Contested' : teamName(b, h));
  const showRoles = !!b.attacker && !!(b.mission.roles || b.sectorId);
  const adjust = (t: TeamKey) => membersOf(b, t).reduce((n, x) => n + x.vpAdjust, 0);
  const game = sectorGame(b, state.campaign, state.forces);
  const finish = () => {
    update((s) => {
      s.battleHistory = [finishBattle(b, nowIso()), ...(s.battleHistory ?? [])];
      delete s.battle;
      // The Nexus map follows the result; a battle is only ever logged once.
      if (game && 'event' in game && s.campaign && !s.campaign.log.some((e) => e.battleId === b.id)) {
        recordSectorGame(s.campaign, { id: uid(), date: nowIso().slice(0, 10), ...game.event });
        s.campaign.updatedAt = nowIso();
      }
    });
    if (game && 'event' in game) toast(`Result added to the Nexus Wars log.${state.campaign ? ` ${sectorEffect(state.campaign, game.event)}` : ''}`);
    go(href.tracker());
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumbs">Battle · {b.mission.source} · started {b.startedAt.slice(0, 10)}</div>
          <h1>{b.mission.name}</h1>
        </div>
        <div className="row">
          <a className="btn" href={href.missions()}>Mission library</a>
          {!b.ended && <button className="primary" onClick={() => set((d) => void (d.ended = true))}>End battle</button>}
          <button className="danger" onClick={() => confirmAction('Throw away this battle?') && update((s) => void delete s.battle)}>Discard</button>
        </div>
      </div>

      {sector && b.sectorId !== sector.id && (
        <div className="panel">
          <p>
            You came from the Nexus Wars map to fight over <b>{sector.name}</b>, but this battle is still running.
            Finish or discard it first, or fight this one over {sector.name}.
          </p>
          <div className="row">
            <button className="primary" onClick={() => { set((d) => void (d.sectorId = sector.id)); go(href.tracker()); }}>Fight this battle over {sector.name}</button>
            <a className="btn" href={href.tracker()}>Keep it as it is</a>
          </div>
        </div>
      )}

      {b.ended && <Result b={b} set={set} onFinish={finish} game={game} />}

      <div className={`panel scoreboard${teams.length === 2 ? ' duel' : ''}`}>
        {teams.map((t) => (
          <div key={t} className={`score-side team-${t}${top.length === 1 && top[0] === t ? ' leading' : ''}`}>
            <div className="small muted">{teamName(b, t)}{showRoles ? ` · ${b.attacker === t ? 'Attacker' : 'Defender'}` : ''}</div>
            <div className="score-vp">{sc[t]!.total}</div>
            <div className="small muted">
              VP · {sc[t]!.objectives} obj{sc[t]!.counters ? ` · ${sc[t]!.counters} other` : ''}{adjust(t) ? ` · ${adjust(t) > 0 ? '+' : ''}${adjust(t)} adj` : ''}
            </div>
          </div>
        ))}
        <div className="score-round">
          <div className="small muted">Round</div>
          <div className="score-vp">{b.round}<span className="muted small"> / {b.mission.rounds}</span></div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button disabled={b.round <= 1} onClick={() => set(prevRound)} aria-label="Previous round">◀</button>
            <button className={last ? '' : 'primary'} onClick={() => set(nextRound)}>{last ? 'Extra round' : 'Next round ▶'}</button>
          </div>
        </div>
      </div>

      <div className="cols-main">
        <div className="panel">
          <div className="panel-title">
            <h2>Objectives</h2>
            <span className="row small">
              Markers
              <Stepper value={b.objectives} min={0} onChange={(n) => set((d) => setObjectives(d, n))} />
              {typeof b.mission.objectives === 'string' && (
                <button className="ghost small" onClick={() => set((d) => setObjectives(d, rollObjectives(d.mission.objectives as 'D3+2' | 'D3')))} title={`Reroll ${b.mission.objectives}`}>🎲</button>
              )}
            </span>
          </div>
          <p className="muted small">
            Tap a marker to change who holds it at the end of round {b.round}. {objectiveScoring(b.mission)}
          </p>
          <div className="markers">
            {(b.control[b.round - 1] ?? []).map((h, i) => (
              <button key={i} className={`marker ${h === '' ? 'holder-none' : h === 'x' ? 'holder-x' : `team-${h}`}`} onClick={() => set((d) => setHolder(d, i, cycleHolder(d, h)))}>
                <span className="marker-n">{i + 1}</span>
                <span className="small">{holderName(h)}</span>
              </button>
            ))}
          </div>
          {b.round > 1 && b.objectives > 0 && (
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Round</th>{teams.map((t) => <th key={t} className="num">{teamName(b, t)}</th>)}</tr></thead>
                <tbody>
                  {b.control.slice(0, b.round).map((row, r) => (
                    <tr key={r}><td>{r + 1}</td>{teams.map((t) => <td key={t} className="num">{held(row, t)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(b.mission.counters ?? []).length > 0 && (
            <>
              <h3>Mission tallies</h3>
              {b.mission.counters!.map((c) => (
                <div key={c.id} className="tally">
                  <span className="grow">{c.label} <span className="muted small">{c.vp} VP each{c.max ? `, max ${c.max}` : ''}</span></span>
                  {teams.map((t) => (
                    <span key={t} className={`team-${t}`} title={teamName(b, t)}>
                      <Stepper value={b.counters[t]?.[c.id] ?? 0} min={0} onChange={(n) => set((d) => void ((d.counters[t] ??= {})[c.id] = c.max ? Math.min(c.max, n) : n))} />
                    </span>
                  ))}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-title"><h2>Mission</h2></div>
          <p>{b.mission.summary}</p>
          {b.deploymentStyle && <p className="small"><b>Deployment style.</b> {b.deploymentStyle} <span className="muted">(map in the OPR Advanced Rules)</span></p>}
          {b.mission.deployment && <p className="small"><b>Deployment.</b> {b.mission.deployment}</p>}
          {roundRules(b).map((r, i) => (
            <p key={i} className="small"><b>{r.title}{r.round ? ` (round ${r.round})` : ''}.</b> {r.text}</p>
          ))}
          {b.objectives > 0 && !(b.mission.rules ?? []).some((r) => r.text === SEIZE_RULE) && <p className="small muted"><b>Seizing.</b> {SEIZE_RULE}</p>}
          {notes.length > 0 && (
            <>
              <h3>Nexus Wars</h3>
              {notes.map((n) => <p key={n} className="small">{n}</p>)}
            </>
          )}
        </div>
      </div>

      <div className="cols-2">
        {b.sides.map((x) => <SidePanel key={x.id} id={x.id} b={b} set={set} forces={state.forces} />)}
      </div>

      <div className="panel">
        <div className="panel-title"><h2>Setup</h2></div>
        <div className="fields">
          <div className="field">
            <span>Players</span>
            <span className="row">
              <button onClick={() => set((d) => void addSide(d, TEAMS.find((t) => !teamsOf(d).includes(t)) ?? 'A'))}>+ Add player</button>
              <button onClick={() => set((d) => void addSide(d, TEAMS.find((t) => !teamsOf(d).includes(t)) ?? 'A', true))}>+ Add AI</button>
              <span className="muted small">Put players on the same team to share objectives and VP.</span>
            </span>
          </div>
          <div className="field">
            <span>Deployment style</span>
            <span className="row">
              <select value={b.deploymentStyle ?? ''} onChange={(e) => set((d) => void (d.deploymentStyle = e.target.value || undefined))}>
                <option value="">Mission default</option>
                {DEPLOYMENT_STYLES.map((t) => (
                  <optgroup key={t.group} label={t.group}>
                    {t.styles.map((x) => <option key={x}>{x}</option>)}
                  </optgroup>
                ))}
              </select>
              {DEPLOYMENT_STYLES.map((t) => (
                <button key={t.group} className="ghost small" title={`Roll on the ${t.group} table: ${t.desc}`} onClick={() => set((d) => void (d.deploymentStyle = rollDeployment(t.group)))}>🎲 {t.group}</button>
              ))}
            </span>
          </div>
          {state.campaign && (
            <label className="field">
              <span>Nexus sector fought over</span>
              <select value={b.sectorId ?? ''} onChange={(e) => set((d) => void (d.sectorId = e.target.value || undefined))}>
                <option value="">None</option>
                {state.campaign.sectors.map((s) => <option key={s.id} value={s.id}>{s.name} ({SECTOR_TYPES[s.type].label})</option>)}
              </select>
            </label>
          )}
          {(state.campaign || b.mission.roles) && (
            <label className="field">
              <span>Attacker</span>
              <select value={b.attacker ?? ''} onChange={(e) => set((d) => void (d.attacker = (e.target.value || undefined) as TeamKey | undefined))}>
                <option value="">—</option>
                {teams.map((t) => <option key={t} value={t}>{teamName(b, t)}</option>)}
              </select>
            </label>
          )}
          <label className="field span-all">
            <span>Notes</span>
            <TextArea value={b.notes} onCommit={(v) => set((d) => void (d.notes = v))} placeholder="Twists, house rules, memorable moments…" />
          </label>
        </div>
      </div>
    </div>
  );
}

type Set = (fn: (d: TrackedBattle) => void) => void;

function objectiveScoring(m: MissionDef): string {
  const { objectiveVp, when, mostBonus } = m.scoring;
  if (!objectiveVp && !mostBonus) return 'Markers score no VP here: use the tallies.';
  const base = when === 'every' ? `Scored every round, ${objectiveVp} VP each` : `Scored at the end of the game${objectiveVp !== 1 ? `, ${objectiveVp} VP each` : ''}`;
  const bonus = mostBonus ? `, plus ${mostBonus.vp} VP for holding more markers ${mostBonus.when === 'every' ? 'each round' : 'at the end'}` : '';
  return `${base}${bonus}.`;
}

function StartBattle({ sectorId, preset }: { sectorId?: string; preset?: string }) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const c = state.campaign;
  const sector = c?.sectors.find((s) => s.id === sectorId);
  // Attack for my own force's faction if I have one, else for anyone but the sector's owner.
  const myFaction = state.forces.find((f) => f.nexus?.factionId && f.nexus.factionId !== sector?.owner && (!f.owner || f.owner === cloud.email))?.nexus?.factionId;
  const [attacker, setAttacker] = useState(() => (preset && c?.factions.some((f) => f.id === preset) ? preset : undefined) ?? myFaction ?? c?.factions.find((f) => f.id !== sector?.owner)?.id ?? '');
  const missions = allMissions(state.customMissions);
  const [id, setId] = useState(missions[0]?.id ?? '');
  // An unclaimed or void sector is held by the AI; a claimed one by its faction's player.
  const [format, setFormat] = useState<Format>(() => FORMATS.find((f) => f.label === (sector && (!sector.owner || sector.type === 'void') ? '1 v AI' : '1 v 1'))!);
  // The randomizer's options, and the forces it picked for each side in turn.
  const [players, setPlayers] = useState(2);
  const [withAi, setWithAi] = useState(false);
  const [pickForces, setPickForces] = useState(true);
  const [pickMission, setPickMission] = useState(true);
  const [forces, setForces] = useState<Force[]>([]);
  const randomize = () => {
    const f = randomFormat(players, withAi);
    setFormat(f);
    if (pickMission) setId(rollAdvancedMission().id);
    setForces(pickForces ? randomForces(state.forces, f.teams.flat().length) : []);
  };
  const choose = (f: Format) => {
    setFormat(f);
    setForces([]);
  };
  const m = missions.find((x) => x.id === id) ?? missions[0];
  const groups: [string, MissionDef[]][] = [];
  for (const x of missions) {
    const g = x.source === 'OPR' && x.group ? `OPR · ${x.group}` : x.source;
    const hit = groups.find(([k]) => k === g);
    if (hit) hit[1].push(x);
    else groups.push([g, [x]]);
  }
  const start = (mission: MissionDef) => {
    update((s) => {
      const b = newBattle(mission, uid(), nowIso(), Math.random, format);
      if (sector && s.campaign) atSector(b, s.campaign, s.forces, s.settings, sector.id, attacker);
      // Randomly picked forces fill the sides nothing was loaded into, players first.
      const open = [...b.sides.filter((x) => !x.ai), ...b.sides.filter((x) => x.ai)].filter((x) => !x.forceId);
      const left = forces.filter((f) => !b.sides.some((x) => x.forceId === f.id));
      open.forEach((side, i) => left[i] && loadForce(side, left[i], undefined, s.settings));
      s.battle = b;
    });
    if (sector) go(href.tracker());
  };
  return (
    <div>
      <div className="page-head">
        <div><h1>Battle</h1></div>
        <div className="row"><a className="btn" href={href.missions()}>Mission library</a></div>
      </div>
      <div className="panel">
        <div className="panel-title"><h2>Start a battle</h2></div>
        <p className="muted">Pick who's playing and a mission, then load each side's force on the next screen. The battle is kept on this device until you finish or discard it.</p>
        {c && sector && (
          <>
            <h3>Nexus Wars</h3>
            <p className="small">
              Fighting over <b>{sector.name}</b> <span className="tag">{SECTOR_TYPES[sector.type].label}</span>, held by <b>{factionName(c, sector.owner)}</b>.
              Team A attacks; everyone else defends. When you finish, the result goes into the campaign log and the map.
            </p>
            <label className="field">
              <span>Attacking faction</span>
              <select value={attacker} onChange={(e) => setAttacker(e.target.value)}>
                {c.factions.map((f) => <option key={f.id} value={f.id} disabled={f.id === sector.owner}>{f.name}</option>)}
              </select>
            </label>
            <p className="muted small">A faction with just one force here gets it loaded for you. <a href={href.tracker()}>Start an ordinary battle instead</a></p>
          </>
        )}
        <h3>Players</h3>
        <div className="row">
          {FORMATS.map((f) => (
            <button key={f.label} className={f.label === format.label ? 'primary' : ''} onClick={() => choose(f)}>{f.label}</button>
          ))}
          {!FORMATS.some((f) => f.label === format.label) && <button className="primary">{format.label}</button>}
        </div>
        <div className="row randomizer">
          <span className="row"><span>Players</span><Stepper value={players} min={withAi ? 1 : 2} onChange={(n) => setPlayers(Math.min(MAX_PLAYERS, n))} /></span>
          <label className="row"><input type="checkbox" checked={withAi} onChange={(e) => { setWithAi(e.target.checked); if (!e.target.checked) setPlayers((n) => Math.max(2, n)); }} />Include AI</label>
          <label className="row"><input type="checkbox" checked={pickForces} onChange={(e) => setPickForces(e.target.checked)} />Random forces</label>
          <label className="row"><input type="checkbox" checked={pickMission} onChange={(e) => setPickMission(e.target.checked)} />Random mission</label>
          <button onClick={randomize} title="Split the players into random teams (or all against the AI), and roll forces and a mission if ticked">🎲 Randomize</button>
        </div>
        {forces.length > 0 && <p className="small">Forces, in side order: {forces.map((f) => f.name).join(', ')}. You can swap them once the battle starts.</p>}
        <p className="muted small">Teams share objectives and VP. You can add, remove or regroup players once the battle starts.</p>
        {groups.map(([group, list]) => (
          <div key={group}>
            <h3>{group}</h3>
            <div className="mission-pick">
              {list.map((x) => (
                <label key={x.id} className={`shop-item${x.id === m?.id ? ' selected' : ''}`}>
                  <input type="radio" name="mission" checked={x.id === m?.id} onChange={() => setId(x.id)} />
                  <div className="grow">
                    <b>{x.name}</b> <span className="tag">{x.source}</span>{x.roles && <span className="tag">Attacker / Defender</span>}
                    <div className="muted small">{x.summary}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="row" style={{ marginTop: '0.8rem' }}>
          <button className="primary" disabled={!m} onClick={() => m && start(m)}>Start {m ? m.name : 'battle'}</button>
          <button onClick={() => setId(rollAdvancedMission().id)} title="Roll the mission type (1-2 Face-Off, 3-4 Progressive, 5-6 Attack & Defend), then a D6">🎲 Random OPR mission</button>
        </div>
      </div>
      <PastBattles />
    </div>
  );
}

function PastBattles() {
  const { state, update } = useStore();
  const cloud = useCloud();
  const [onlyMine, setOnlyMine] = useState(false);
  const all = state.battleHistory ?? [];
  // Forces this player can record into: their own, or ones kept only on this device.
  const mine = state.forces.filter((f) => !f.owner || f.owner === cloud.email);
  // Battles one of my forces fought in without claiming its side yet.
  const waiting = all.filter((x) => {
    const done = claims(x, state.forces);
    return x.sides.some((side) => !side.ai && !(side.id in done) && mine.some((f) => f.id === side.forceId));
  });
  const past = onlyMine ? waiting : all;
  const remove = (x: FinishedBattle) =>
    confirmAction(`Delete ${x.mission.name} from ${x.finishedAt.slice(0, 10)} for the whole group? Rewards already claimed stay in each force's log.`) &&
    update((s) => void (s.battleHistory = s.battleHistory?.filter((y) => y.id !== x.id)));
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Past battles</h2>
        <span className="muted small">
          {all.length} finished{waiting.length ? ` · ${waiting.length} waiting on you` : ''}
          {all.length > 0 && (
            <label className="row" style={{ display: 'inline-flex', marginLeft: '0.75rem' }}>
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only waiting on me
            </label>
          )}
        </span>
      </div>
      {!all.length && <p className="muted">No finished battles yet. End a battle, then <b>Finish & save result</b> to keep it here for everyone.</p>}
      {all.length > 0 && !past.length && <p className="muted">Nothing waiting on you. Every battle your forces played has been claimed.</p>}
      {past.map((x) => {
        const sc = score(x);
        const done = claims(x, state.forces);
        return (
          <div key={x.id} className="list-item past-battle">
            <div className="grow">
              <div>
                <b>{x.mission.name}</b>{' '}
                <span className="muted small">
                  · {x.finishedAt.slice(0, 10)} · {x.round} round{x.round === 1 ? '' : 's'}
                  {x.sectorId ? ` · ${state.campaign?.sectors.find((s) => s.id === x.sectorId)?.name ?? 'Nexus sector'}` : ''}
                </span>
              </div>
              <div className="small"><b>{resultTitle(x)}</b> · {teamsOf(x).map((t) => sc[t]!.total).join('–')} VP</div>
              <div className="past-sides">
                {x.sides.map((side) => (
                  <div key={side.id} className="row small">
                    <span className={`tag team-${side.team}`}>{side.name}</span>
                    <span className="muted">{resultFor(x, side.id)}</span>
                    <span className="spacer" />
                    <Claim battle={x} side={side} claimed={side.id in done} by={done[side.id]} mine={mine} />
                  </div>
                ))}
              </div>
              {x.notes && <div className="muted small">{x.notes}</div>}
            </div>
            <button className="ghost icon" aria-label="Delete this battle" onClick={() => remove(x)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

/** Claim one side's rewards: open the record wizard for one of my forces, filled in from the battle. */
function Claim({ battle, side, claimed, by, mine }: { battle: FinishedBattle; side: TrackerSide; claimed: boolean; by?: Force; mine: Force[] }) {
  if (claimed) return <span className="tag green">✓ claimed{by ? ` by ${by.name}` : ''}</span>;
  if (side.ai) return null;
  const own = mine.find((f) => f.id === side.forceId);
  if (own) return <a className="btn primary small" href={href.battle(own.id, battle.id, side.id)}>Claim rewards</a>;
  if (side.forceId) return <span className="muted">waiting for its player</span>;
  if (!mine.length) return null;
  return (
    <select value="" onChange={(e) => e.target.value && go(href.battle(e.target.value, battle.id, side.id))} aria-label={`Claim ${side.name}'s rewards as`}>
      <option value="">Claim as…</option>
      {mine.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </select>
  );
}

function Result({ b, set, onFinish, game }: { b: TrackedBattle; set: Set; onFinish: () => void; game?: SectorGame }) {
  const { state } = useStore();
  const c = state.campaign;
  const sc = score(b);
  const teams = teamsOf(b);
  const title = resultTitle(b);
  return (
    <div className="panel result-panel">
      <div className="panel-title">
        <h2>{title} · {teams.map((t) => sc[t]!.total).join('–')}</h2>
        <button className="ghost" onClick={() => set((d) => void (d.ended = false))}>Resume</button>
      </div>
      <p className="muted small">Record the result in each crusade force's log. The wizard is filled in from this battle: check it, then apply.</p>
      <div className="row">
        {b.sides.map((s) => {
          if (!s.forceId) return <span key={s.id} className="muted small">{s.name}: no force loaded.</span>;
          if (b.recorded.includes(s.id)) return <span key={s.id} className="tag green">{s.name} recorded ✓</span>;
          return <a key={s.id} className="btn primary" href={href.battle(s.forceId)}>⚔ Record battle for {s.name}</a>;
        })}
      </div>
      {c && game && (
        <p className="small" style={{ marginTop: '0.75rem' }}>
          <b>Nexus Wars.</b>{' '}
          {'problem' in game
            ? <span style={{ color: 'var(--warn)' }}>{game.problem} Until then, finishing won't touch the campaign: you can still record it by hand on the Nexus Wars page.</span>
            : <>Finishing adds this to the campaign log: {factionName(c, game.event.attacker)} attacking {factionName(c, game.event.defender)}, {game.event.winner ? `${factionName(c, game.event.winner)} wins` : 'a draw'}. {sectorEffect(c, game.event) || "The sector doesn't change hands."}</>}
        </p>
      )}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <span className="muted small">Done? Finishing shares the battle with the group under Past battles, where anyone who hasn't recorded it yet can still claim their rewards.</span>
        <span className="spacer" />
        <button className="primary" onClick={onFinish}>✓ Finish & save result</button>
      </div>
    </div>
  );
}

function SidePanel({ id, b, set, forces }: { id: string; b: TrackedBattle; set: Set; forces: Force[] }) {
  const { state } = useStore();
  const side = b.sides.find((x) => x.id === id)!;
  const setSide = (fn: (s: TrackerSide) => void) => set((d) => { const s = d.sides.find((x) => x.id === id); if (s) fn(s); });
  const setUnit = (id: string, fn: (u: TrackerUnit) => void) => setSide((s) => { const u = s.units.find((x) => x.id === id); if (u) fn(u); });
  const force = forces.find((f) => f.id === side.forceId);
  const taken = new Set(side.agendas.map((a) => a.name));
  const alive = side.units.filter((u) => !u.destroyed).length;
  const takenForces = new Set(b.sides.filter((x) => x.id !== id).map((x) => x.forceId));
  const [adding, setAdding] = useState('');
  const [aiUnit, setAiUnit] = useState<string | null>(null);
  const addUnit = () => {
    const name = adding.trim();
    if (!name) return;
    setAdding('');
    setSide((s) => void s.units.push({ id: uid(), name, maxWounds: 1, wounds: 1, shaken: false, activated: false, destroyed: false, kills: 0 }));
  };

  const pickForce = (forceId: string, listId: string) => {
    const f = forces.find((x) => x.id === forceId);
    if (!f) return setSide((s) => Object.assign(s, { forceId: undefined, listId: undefined, units: [], bp: 0, manipulations: [] }));
    setSide((s) => loadForce(s, f, f.lists?.find((l) => l.id === listId), state.settings));
  };

  return (
    <div className={`panel side-panel team-${side.team}`}>
      <div className="panel-title">
        <h2><TextField value={side.name} onCommit={(v) => setSide((s) => void (s.name = v || (s.ai ? 'AI' : 'Player')))} /></h2>
        <span className="row small muted">
          {side.bp ? `${side.bp} BP · ` : ''}{alive}/{side.units.length} units
          {b.sides.length > 2 && (
            <button className="ghost icon" aria-label={`Remove ${side.name}`} onClick={() => confirmAction(`Remove ${side.name} from this battle?`) && set((d) => removeSide(d, id))}>✕</button>
          )}
        </span>
      </div>

      <div className="fields">
        <label className="field">
          <span>Team</span>
          <select value={side.team} onChange={(e) => set((d) => setTeam(d, id, e.target.value as TeamKey))}>
            {TEAMS.map((t) => <option key={t} value={t}>Team {t}{membersOf(b, t).some((x) => x.id !== id) ? ` (with ${membersOf(b, t).filter((x) => x.id !== id).map((x) => x.name).join(' & ')})` : ''}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Played by</span>
          <label className="row"><input type="checkbox" checked={!!side.ai} onChange={(e) => setSide((s) => void (s.ai = e.target.checked || undefined))} /> The AI</label>
        </label>
        <label className="field">
          <span>Crusade force</span>
          <select value={side.forceId ?? ''} onChange={(e) => pickForce(e.target.value, '')}>
            <option value="">None / not tracked</option>
            {forces.map((f) => <option key={f.id} value={f.id} disabled={takenForces.has(f.id)}>{f.name}</option>)}
          </select>
        </label>
        {force && (force.lists ?? []).length > 0 && (
          <label className="field">
            <span>Army list</span>
            <select value={side.listId ?? ''} onChange={(e) => pickForce(force.id, e.target.value)}>
              <option value="">Every active unit</option>
              {force.lists!.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        )}
        <label className="field">
          <span>VP adjustment</span>
          <Stepper value={side.vpAdjust} onChange={(n) => setSide((s) => void (s.vpAdjust = n))} />
        </label>
      </div>

      <h3>Agendas <span className="muted small">{side.agendas.length} / {MAX_AGENDAS}</span></h3>
      {side.agendas.map((a, i) => (
        <div key={a.name} className="tally">
          <label className="row grow">
            <input type="checkbox" checked={a.done} onChange={(e) => setSide((s) => void (s.agendas[i].done = e.target.checked))} />
            <span>
              <b>{a.name}</b>
              <div className="muted small">{AGENDAS.find((x) => x.name === a.name)?.desc}</div>
            </span>
          </label>
          <Stepper value={a.count} min={0} onChange={(n) => setSide((s) => void (s.agendas[i].count = n))} />
          <button className="ghost icon" aria-label="Remove agenda" onClick={() => setSide((s) => void s.agendas.splice(i, 1))}>✕</button>
        </div>
      ))}
      {side.agendas.length < MAX_AGENDAS && (
        <select value="" onChange={(e) => e.target.value && setSide((s) => void s.agendas.push({ name: e.target.value, count: 0, done: false }))}>
          <option value="">+ Add an agenda…</option>
          {AGENDAS.filter((a) => !taken.has(a.name)).map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}
        </select>
      )}

      <h3>Nexus effects</h3>
      {side.manipulations.length === 0 && <p className="muted small">None this match.</p>}
      {side.manipulations.map((m, i) => (
        <div key={i} className="tally">
          <label className={`row grow${m.used ? ' muted' : ''}`}>
            <input type="checkbox" checked={m.used} onChange={(e) => setSide((s) => void (s.manipulations[i].used = e.target.checked))} />
            <span style={m.used ? { textDecoration: 'line-through' } : undefined}>
              {m.text}
              <div className="muted small">{COMBAT_MANIPULATIONS.find((c) => m.text.includes(c.name))?.desc}</div>
            </span>
          </label>
          <button className="ghost icon" aria-label="Remove" onClick={() => setSide((s) => void s.manipulations.splice(i, 1))}>✕</button>
        </div>
      ))}
      <select value="" onChange={(e) => e.target.value && setSide((s) => void s.manipulations.push({ text: `${MANIPULATION_PREFIX}: ${e.target.value}`, used: false }))}>
        <option value="">+ Add a Combat Manipulation…</option>
        {COMBAT_MANIPULATIONS.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>

      {side.ai && side.units.length > 0 && (
        <>
          <h3>AI activation</h3>
          <AiActivation key={aiUnit ?? ''} side={side} unitId={aiUnit} onPick={setAiUnit} setUnit={setUnit} />
        </>
      )}

      <h3>Units</h3>
      {side.units.length === 0 && <p className="muted small">Load a crusade force above, or add units by hand.</p>}
      {side.units.length > 0 && (
        <div className="table-wrap">
          <table className="compact stack tracker-units">
            <thead><tr><th>Unit</th><th className="num">Wounds</th><th>Shaken</th><th>Activated</th><th className="num">Kills</th><th>Destroyed</th></tr></thead>
            <tbody>
              {side.units.map((u) => (
                <tr key={u.id} className={u.destroyed ? 'dead' : u.activated ? 'done' : ''}>
                  <td className="s-2">
                    <b>{u.name}</b>
                    {side.ai && !u.destroyed && (
                      <div className="row small">
                        <span className="muted">{AI_TREES[u.aiStyle ?? 'hybrid'].label}</span>
                        <button className="ghost small" onClick={() => setAiUnit(u.id)}>Decide</button>
                      </div>
                    )}
                  </td>
                  <td className="num s-end" data-label="Wounds">
                    <Stepper value={u.wounds} min={0} onChange={(n) => setUnit(u.id, (x) => { if (!x.unitId) x.maxWounds = Math.max(x.maxWounds, n); x.wounds = Math.min(x.maxWounds, n); x.destroyed = x.wounds === 0; })} />
                    <span className="small muted"> / {u.maxWounds}</span>
                  </td>
                  <td data-label="Shaken"><input type="checkbox" checked={u.shaken} onChange={(e) => setUnit(u.id, (x) => void (x.shaken = e.target.checked))} /></td>
                  <td data-label="Activated"><input type="checkbox" checked={u.activated} onChange={(e) => setUnit(u.id, (x) => void (x.activated = e.target.checked))} /></td>
                  <td className="num" data-label="Kills"><Stepper value={u.kills} min={0} onChange={(n) => setUnit(u.id, (x) => void (x.kills = n))} /></td>
                  <td data-label="Destroyed"><input type="checkbox" checked={u.destroyed} onChange={(e) => setUnit(u.id, (x) => { x.destroyed = e.target.checked; if (!x.destroyed && x.wounds === 0) x.wounds = x.maxWounds; })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="row" style={{ marginTop: '0.5rem' }}>
        <input value={adding} placeholder="+ Add a unit by name" onChange={(e) => setAdding(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addUnit()} onBlur={addUnit} />
        {side.units.some((u) => u.activated) && <button className="ghost small" onClick={() => setSide((s) => s.units.forEach((u) => (u.activated = false)))}>Clear activations</button>}
      </div>
    </div>
  );
}
