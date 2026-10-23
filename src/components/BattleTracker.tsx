import { useState } from 'react';
import { useStore } from '../model/store';
import { nowIso, uid } from '../model/factory';
import type { Force } from '../model/types';
import { go, href } from '../route';
import { useCloud } from '../cloud/CloudSync';
import { AGENDAS, MAX_AGENDAS } from '../rules/data';
import { COMBAT_MANIPULATIONS, MANIPULATION_PREFIX, SECTOR_TYPES, activeCrisis, factionName, homeChallengeBlock, lordById, recordSectorGame, sectorEffect } from '../rules/nexus';
import { DEPLOYMENT_STYLES, SEIZE_RULE, allMissions, rollAdvancedMission, rollDeployment, type MissionDef } from '../rules/missions';
import {
  FORMATS,
  TEAMS,
  addSide,
  atCrisis,
  atSector,
  crisisGame,
  cycleHolder,
  held,
  leaders,
  loadForce,
  loadUnits,
  sidePoints,
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
  teamFaction,
} from '../rules/tracker';
import { AI_TREES } from '../rules/aiTrees';
import { echoesBook, randomEchoes } from '../rules/echoForce';
import { garrison as guardedGarrison } from '../rules/guardians';
import { ECHOES, NEXUS_CRISIS, NEXUS_REINFORCE_BONUS } from '../rules/nexusData';
import { aiDefended, ratingFor } from '../rules/difficulty';
import { isReinforced } from '../rules/production';
import SectorDanger from './SectorDanger';
import { forceTotals } from '../rules/engine';
import { SOLO_PATROL } from '../rules/downtimeData';
import { MAX_PLAYERS, randomForces, randomFormat, type Format } from '../rules/randomBattle';
import AiActivation from './AiActivation';
import PatrolModal from './PatrolModal';
import AutoBattleModal from './AutoBattleModal';
import { overrunBlock } from '../rules/overrun';
import { Panel, Stepper, TextArea, TextField, confirmAction, toast } from './ui';
import { localDate } from '../model/date';
import { Icon } from './Icon';

/** With a sector (from the Nexus Wars map), a new battle is set up to be fought over it. */
export default function BattleTracker({ sectorId, attacker, forceId, crisis }: { sectorId?: string; attacker?: string; forceId?: string; crisis?: boolean }) {
  const { state, update } = useStore();
  const b = state.battle;
  const sector = state.campaign?.sectors.find((s) => s.id === sectorId);
  const [auto, setAuto] = useState(false);
  const cloud = useCloud();
  if (!b) return <StartBattle sectorId={sector?.id} preset={attacker} presetForce={forceId} crisis={crisis} />;

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
  const cg = crisisGame(b, state.campaign, state.forces);
  // Over a Nexus sector, a player may only auto-battle an Overrun; anything else is for the table, or the GM's fallback.
  const fought = state.campaign?.sectors.find((s) => s.id === b.sectorId);
  const autoBlock = fought && b.attacker && cloud.email && !cloud.isGm
    ? overrunBlock(fought, state.forces.find((f) => membersOf(b, b.attacker!).some((x) => x.forceId === f.id)))
    : '';
  const finish = () => {
    update((s) => {
      // Already finished (a second click, or on another device): don't put it in the history twice.
      if (s.battle?.id !== b.id) return;
      s.battleHistory = [finishBattle(s.battle, nowIso()), ...(s.battleHistory ?? [])];
      delete s.battle;
      // The Nexus map follows the result; a battle is only ever logged once.
      if (game && 'event' in game && s.campaign && !s.campaign.log.some((e) => e.battleId === b.id)) {
        recordSectorGame(s.campaign, { id: uid(), date: localDate(), ...game.event });
        s.campaign.updatedAt = nowIso();
      }
      // The Crisis isn't fought over a sector: it only settles whether the Lord was stopped, and who was MVP. Only the first battle counts.
      if (cg && s.campaign && activeCrisis(s.campaign) && !s.campaign.crisis!.battleId) {
        Object.assign(s.campaign.crisis!, { result: cg.result, mvp: cg.mvp, battleId: b.id });
        s.campaign.log.push({ id: uid(), date: localDate(), ...cg.event });
        s.campaign.updatedAt = nowIso();
      }
    });
    if (game && 'event' in game) toast(`Result added to the Nexus Wars log.${state.campaign ? ` ${sectorEffect(state.campaign, game.event)}` : ''}`);
    if (cg && state.campaign && activeCrisis(state.campaign) && !state.campaign.crisis!.battleId) {
      const mvp = state.forces.find((f) => f.id === cg.mvp);
      toast(cg.result === 'won'
        ? `The Echo Lord is defeated!${mvp ? ` MVP: ${mvp.name}, who takes a ${NEXUS_CRISIS.mvpTier} relic.` : ''} Each side claims its rewards from the battle.`
        : 'The Echo Lord stands. Win the Crisis before the round ends, or the Echoes take a sector from each faction.');
    }
    go(href.tracker());
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="crumbs">{b.patrol ? 'Solo patrol' : 'Battle'} · {b.mission.source} · started {localDate(b.startedAt)}</div>
          <h1>{b.mission.name} {b.patrol && <span className="tag cyan">Solo patrol</span>}</h1>
        </div>
        <div className="row">
          <a className="btn" href={href.missions()}>Mission library</a>
          {!b.ended && <button onClick={() => setAuto(true)} disabled={!!autoBlock}
            title={autoBlock ? `Play this one at the table (no overrun: ${autoBlock}). The GM can still auto-battle it.` : 'Let the units fight it out on their stats'}><Icon name="g:power-lightning" /> Auto-battle</button>}
          {!b.ended && <button className="primary" onClick={() => set((d) => void (d.ended = true))}>End battle</button>}
          <button className="danger" onClick={() => confirmAction('Throw away this battle?') && update((s) => void delete s.battle)}>Discard</button>
        </div>
      </div>

      {sector && b.sectorId !== sector.id && (
        <div className="panel">
          <p>
            Another battle is still running. Finish or discard it first, or fight this one over <b>{sector.name}</b>.
          </p>
          <div className="row">
            <button className="primary" onClick={() => { set((d) => void (d.sectorId = sector.id)); go(href.tracker()); }}>Fight this battle over {sector.name}</button>
            <a className="btn" href={href.tracker()}>Keep it as it is</a>
          </div>
        </div>
      )}

      {crisis && !b.crisis && (
        <div className="panel">
          <p>Another battle is still running. Finish or discard it before fighting the Nexus Crisis.</p>
        </div>
      )}

      {auto && !b.ended && <AutoBattleModal b={b} set={set} onClose={() => setAuto(false)} />}

      {b.ended && <Result b={b} set={set} onFinish={finish} game={game} crisis={cg} />}

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
            <button disabled={b.round <= 1} onClick={() => set(prevRound)} aria-label="Previous round"><Icon name="l:chevron-left" /></button>
            <button className={last ? '' : 'primary'} onClick={() => set(nextRound)}>{last ? 'Extra round' : <>Next round <Icon name="l:chevron-right" /></>}</button>
          </div>
        </div>
      </div>

      <div className="cols-main">
        <Panel
          id="battle.objectives"
          title="Objectives"
          extra={
            <span className="row small">
              Markers
              <Stepper value={b.objectives} min={0} onChange={(n) => set((d) => setObjectives(d, n))} />
              {typeof b.mission.objectives === 'string' && (
                <button className="ghost small" onClick={() => set((d) => setObjectives(d, rollObjectives(d.mission.objectives as 'D3+2' | 'D3')))} title={`Reroll ${b.mission.objectives}`}><Icon name="g:perspective-dice-six-faces-six" /></button>
              )}
            </span>
          }
        >
          <p className="muted small">
            Tap a marker to set who holds it at the end of round {b.round}. {objectiveScoring(b.mission)}
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
        </Panel>

        <Panel id="battle.mission" title="Mission">
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
        </Panel>
      </div>

      <div className="cols-2">
        {b.sides.map((x) => <SidePanel key={x.id} id={x.id} b={b} set={set} forces={state.forces} />)}
      </div>

      <Panel id="battle.setup" title="Setup">
        <div className="fields">
          <div className="field">
            <span>Players</span>
            <span className="row">
              <button onClick={() => set((d) => void addSide(d, TEAMS.find((t) => !teamsOf(d).includes(t)) ?? 'A'))}>+ Add player</button>
              <button onClick={() => set((d) => void addSide(d, TEAMS.find((t) => !teamsOf(d).includes(t)) ?? 'A', true))}>+ Add AI</button>
              <span className="muted small">Teammates share objectives and VP.</span>
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
                <button key={t.group} className="ghost small" title={`Roll on the ${t.group} table: ${t.desc}`} onClick={() => set((d) => void (d.deploymentStyle = rollDeployment(t.group)))}><Icon name="g:perspective-dice-six-faces-six" /> {t.group}</button>
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
      </Panel>
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

function StartBattle({ sectorId, preset, presetForce, crisis: wantCrisis }: { sectorId?: string; preset?: string; presetForce?: string; crisis?: boolean }) {
  const { state, update } = useStore();
  const cloud = useCloud();
  const c = state.campaign;
  const crisis = wantCrisis && c ? activeCrisis(c) : undefined;
  const sector = crisis ? undefined : c?.sectors.find((s) => s.id === sectorId);
  // Attack for my own force's faction if I have one, else for anyone but the sector's owner.
  const myFaction = state.forces.find((f) => f.nexus?.factionId && f.nexus.factionId !== sector?.owner && (!f.owner || f.owner === cloud.email))?.nexus?.factionId;
  const [attacker, setAttacker] = useState(() => (preset && c?.factions.some((f) => f.id === preset) ? preset : undefined) ?? myFaction ?? c?.factions.find((f) => f.id !== sector?.owner)?.id ?? '');
  const missions = allMissions(state.customMissions);
  const [id, setId] = useState(missions[0]?.id ?? '');
  // An unclaimed or void sector is held by the AI; a claimed one by its faction's player.
  // The Crisis: every faction's player together against the AI.
  const [format, setFormat] = useState<Format>(() => (crisis && c ? randomFormat(Math.max(1, c.factions.length), true)
    : FORMATS.find((f) => f.label === (sector && (!sector.owner || sector.type === 'void') ? '1 v AI' : '1 v 1'))!));
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
      if (crisis && s.campaign) atCrisis(b, s.campaign, s.forces, s.settings);
      else if (sector && s.campaign) atSector(b, s.campaign, s.forces, s.settings, sector.id, attacker, attacker === preset ? presetForce : undefined);
      // Randomly picked forces fill the sides nothing was loaded into, players first.
      const open = [...b.sides.filter((x) => !x.ai), ...b.sides.filter((x) => x.ai)].filter((x) => !x.forceId);
      const left = forces.filter((f) => !b.sides.some((x) => x.forceId === f.id));
      open.forEach((side, i) => left[i] && loadForce(side, left[i], undefined, s.settings, s.campaign));
      s.battle = b;
    });
    if (sector || crisis) go(href.tracker());
  };
  return (
    <div>
      <div className="page-head">
        <div><h1>Battle</h1></div>
        <div className="row"><a className="btn" href={href.missions()}>Mission library</a></div>
      </div>
      <Panel id="battle.start" title="Start a battle">
        <p className="muted">Pick players and a mission, then load each side's force on the next screen. The battle stays on this device until you finish or discard it.</p>
        {c && wantCrisis && !crisis && <p className="small"><span className="tag red">There is no Nexus Crisis this round.</span> <a href={href.tracker()}>Start an ordinary battle</a></p>}
        {c && crisis && (
          <>
            <h3>Nexus Crisis</h3>
            <p className="small">
              <b>{lordById(crisis.lord)?.name ?? 'An Echo Lord'}</b> rises at <b>{c.sectors.find((x) => x.id === crisis.sectorId)?.name ?? 'the Voidspawn'}</b>.{' '}
              {lordById(crisis.lord)?.desc}
            </p>
            <p className="small">
              Every faction fights together on team A against the {ECHOES.name}. A faction with only 1 force has it loaded.
              Generate the {ECHOES.name}' army to match your points. Their most expensive unit is the Lord (+{NEXUS_CRISIS.lordVp} VP to destroy it).
              The result goes into the campaign log. Win and the threat drops. The side whose units earned the most XP is MVP and takes a {NEXUS_CRISIS.mvpTier} relic.
            </p>
            {crisis.battleId && <p className="small"><span className="tag red">Already fought: {crisis.result}</span> Only the first Crisis battle counts. Delete its log entry to fight it again.</p>}
          </>
        )}
        {c && sector && (
          <>
            <h3>Nexus Wars</h3>
            <p className="small">
              Fighting over <b>{sector.name}</b> <span className="tag">{SECTOR_TYPES[sector.type].label}</span>, held by <b>{factionName(c, sector.owner)}</b>.
              Team A attacks; everyone else defends. The result goes into the campaign log and the map.
            </p>
            <SectorDanger s={sector} factionId={attacker} />
            {aiDefended(sector) && ratingFor(sector, attacker) !== undefined && (
              <p className="muted small">The {ECHOES.name} hold it with a {ratingFor(sector, attacker)}-Supply garrison. Play <b>1 v AI</b> and generate their army at that size. Modifiers favour the defender.</p>
            )}
            {homeChallengeBlock(c, sector) && <p className="small"><span className="tag red">{homeChallengeBlock(c, sector)}</span> Check with the GM before playing this one.</p>}
            <label className="field">
              <span>Attacking faction</span>
              <select value={attacker} onChange={(e) => setAttacker(e.target.value)}>
                {c.factions.map((f) => <option key={f.id} value={f.id} disabled={f.id === sector.owner}>{f.name}</option>)}
              </select>
            </label>
            <p className="muted small">The attacking detachment from the orders, or the faction's only force, loads for you. <a href={href.tracker()}>Start an ordinary battle instead</a></p>
            {sector.owner && sector.owner !== ECHOES.id && (
              <p className="small">
                <b>{factionName(c, sector.owner)} can't make it?</b> The {ECHOES.name} stand in. Play <b>1 v AI</b> and generate their army at your points
                {isReinforced(sector) ? ` +${NEXUS_REINFORCE_BONUS} (Reinforced)` : ''}. If they win, {factionName(c, sector.owner)} keeps the sector.{' '}
                {format.label !== '1 v AI' && <button className="ghost small" onClick={() => choose(FORMATS.find((f) => f.label === '1 v AI')!)}>Use a stand-in</button>}
              </p>
            )}
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
          <button onClick={randomize} title="Split players into random teams (or all vs the AI). Rolls forces and a mission if ticked."><Icon name="g:perspective-dice-six-faces-six" /> Randomize</button>
        </div>
        {forces.length > 0 && <p className="small">Forces, in side order: {forces.map((f) => { const t = forceTotals(f, state.settings); return `${f.name} (${t.pointsUsed} pts, ${t.bp} BP)`; }).join(', ')}. Swap them once the battle starts.</p>}
        <p className="muted small">Teams share objectives and VP. Add, remove or regroup players once the battle starts.</p>
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
          <button onClick={() => setId(rollAdvancedMission().id)} title="Roll the mission type (1-2 Face-Off, 3-4 Progressive, 5-6 Attack & Defend), then a D6"><Icon name="g:perspective-dice-six-faces-six" /> Random OPR mission</button>
        </div>
      </Panel>
      {!sector && !crisis && <SoloPatrol mission={m} />}
      <PastBattles />
    </div>
  );
}

/** Downtime: a quick game against the AI with a small part of one force, for reduced rewards. */
function SoloPatrol({ mission }: { mission?: MissionDef }) {
  const { state } = useStore();
  const own = state.forces.filter((f) => f.units.some((u) => u.status === 'active'));
  const [forceId, setForceId] = useState('');
  const [open, setOpen] = useState(false);
  const f = own.find((x) => x.id === forceId);
  if (!own.length) return null;
  return (
    <Panel id="battle.patrol" title="Solo patrol" extra={<span className="tag cyan">Downtime</span>}>
      <p className="muted small">
        No group tonight? Send up to {SOLO_PATROL.points} pts of one force on patrol ({mission?.name ?? 'the mission picked above'}). It meets {SOLO_PATROL.enemyMin}–{SOLO_PATROL.enemyMax} pts
        of the {ECHOES.name}: fight them vs the AI, or turn back for +{SOLO_PATROL.declineXp} XP each. Units earn participation and kill XP only, no RP or reward rolls.
        In a campaign, a win counts as a patrol against the {ECHOES.name} and earns a Strategic Asset. Each force can record 1 patrol per campaign round.
        You can also send one from the force's page.
      </p>
      <div className="row">
        <select value={forceId} onChange={(e) => setForceId(e.target.value)}>
          <option value="">Choose a force…</option>
          {own.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="primary" disabled={!f || !mission} onClick={() => setOpen(true)}>Send out a patrol…</button>
      </div>
      {open && f && <PatrolModal force={f} mission={mission} onClose={() => setOpen(false)} />}
    </Panel>
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
    confirmAction(`Delete ${x.mission.name} (${localDate(x.finishedAt)}) for the whole group? Claimed rewards stay in each force's log.`) &&
    update((s) => void (s.battleHistory = s.battleHistory?.filter((y) => y.id !== x.id)));
  return (
    <Panel
      id="battle.past"
      title="Past battles"
      extra={
        <span className="muted small">
          {all.length} finished{waiting.length ? ` · ${waiting.length} waiting on you` : ''}
          {all.length > 0 && (
            <label className="row" style={{ display: 'inline-flex', marginLeft: '0.75rem' }}>
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
              Only waiting on me
            </label>
          )}
        </span>
      }
    >
      {!all.length && <p className="muted">No finished battles yet. End a battle, then <b>Finish & save result</b> to share it here.</p>}
      {all.length > 0 && !past.length && <p className="muted">Nothing waiting on you. All your forces' battles are claimed.</p>}
      {past.map((x) => {
        const sc = score(x);
        const done = claims(x, state.forces);
        return (
          <div key={x.id} className="list-item past-battle">
            <div className="grow">
              <div>
                <b>{x.mission.name}</b>{' '}
                <span className="muted small">
                  · {localDate(x.finishedAt)} · {x.round} round{x.round === 1 ? '' : 's'}
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
            <button className="ghost icon" aria-label="Delete this battle" onClick={() => remove(x)}><Icon name="l:x" /></button>
          </div>
        );
      })}
    </Panel>
  );
}

/** Claim one side's rewards: open the record wizard for one of my forces, filled in from the battle. */
function Claim({ battle, side, claimed, by, mine }: { battle: FinishedBattle; side: TrackerSide; claimed: boolean; by?: Force; mine: Force[] }) {
  if (claimed) return <span className="tag green"><Icon name="l:check" /> claimed{by ? ` by ${by.name}` : ''}</span>;
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

function Result({ b, set, onFinish, game, crisis }: { b: TrackedBattle; set: Set; onFinish: () => void; game?: SectorGame; crisis?: ReturnType<typeof crisisGame> }) {
  const { state } = useStore();
  const c = state.campaign;
  const sc = score(b);
  const teams = teamsOf(b);
  const title = resultTitle(b);
  return (
    <div className="panel result-panel">
      <div className="panel-title">
        <h2>{title} · {b.auto ? `auto-battle, ${teams.map((t) => b.auto!.dealt[t] ?? 0).join('–')} pts destroyed` : teams.map((t) => sc[t]!.total).join('–')}</h2>
        <button className="ghost" onClick={() => set((d) => { d.ended = false; delete d.auto; })}
          title={b.auto ? 'Back to the tracker. Drops the auto-battle result, but its losses and kill XP stay on the units.' : undefined}>Resume</button>
      </div>
      <p className="muted small">Record the result in each crusade force's log. The wizard is pre-filled from this battle: check it, then apply.</p>
      <div className="row">
        {b.sides.map((s) => {
          if (!s.forceId) return <span key={s.id} className="muted small">{s.name}: no force loaded.</span>;
          if (b.recorded.includes(s.id)) return <span key={s.id} className="tag green">{s.name} recorded <Icon name="l:check" /></span>;
          if (!state.forces.some((f) => f.id === s.forceId)) return <span key={s.id} className="muted small">{s.name}: its force was deleted.</span>;
          return <a key={s.id} className="btn primary" href={href.battle(s.forceId)}><Icon name="g:crossed-swords" /> Record battle for {s.name}</a>;
        })}
      </div>
      {c && game && (
        <p className="small" style={{ marginTop: '0.75rem' }}>
          <b>Nexus Wars.</b>{' '}
          {'problem' in game
            ? <span style={{ color: 'var(--warn)' }}>{game.problem} Until then, finishing won't touch the campaign. You can still record it by hand on the Nexus Wars page.</span>
            : <>Finishing adds this to the campaign log: {factionName(c, game.event.attacker)} attacking {factionName(c, game.event.defender)}, {game.event.winner ? `${factionName(c, game.event.winner)} wins` : 'a draw'}. {sectorEffect(c, game.event) || "The sector doesn't change hands."}</>}
        </p>
      )}
      {c && crisis && (
        <p className="small" style={{ marginTop: '0.75rem' }}>
          <b>Nexus Crisis.</b>{' '}
          {c.crisis?.battleId
            ? "An earlier battle already settled the Crisis. This one won't change it."
            : crisis.result === 'won'
              ? <>Finishing marks the Crisis won.{' '}
                {crisis.mvp
                  ? <>MVP, for the most XP: <b>{state.forces.find((f) => f.id === crisis.mvp)?.name ?? 'a force not on this device'}</b>, who takes a {NEXUS_CRISIS.mvpTier} relic.</>
                  : `No unit earned XP, so there's no MVP.`}</>
              : `Finishing marks the Crisis lost. When the round ends, the ${ECHOES.name} take a sector from each faction.`}
        </p>
      )}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <span className="muted small">Finishing shares the battle under Past battles. Anyone who hasn't recorded it can claim their rewards there.</span>
        <span className="spacer" />
        <button className="primary" onClick={onFinish}><Icon name="l:check" /> Finish & save result</button>
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
    setSide((s) => void s.units.push({ id: uid(), name, maxWounds: 1, wounds: 1, shaken: false, activated: false, destroyed: false, xp: 0 }));
  };

  // The AI can field a random Void Echoes army, sized to match the sides it's up against.
  const book = echoesBook(state.books);
  // Standing in for a player who can't defend a Reinforced sector, they get its +200 Supply Limit too.
  const sector = state.campaign?.sectors.find((x) => x.id === b.sectorId);
  const defending = !!b.attacker && side.team !== b.attacker;
  const reinforced = defending && !!sector && isReinforced(sector);
  const enemies = b.sides.filter((x) => x.team !== side.team).reduce((n, x) => n + sidePoints(x), 0) + (reinforced ? NEXUS_REINFORCE_BONUS : 0);
  // Holding an AI sector, the Echoes field its garrison: the sector's difficulty rating.
  const garrison = defending && sector && aiDefended(sector) && state.campaign ? ratingFor(sector, teamFaction(b, b.attacker!, state.campaign, forces)) : undefined;
  const [target, setTarget] = useState(() => garrison || enemies || 1000);
  const generate = () => {
    if (!book) return;
    // A guarded sector's garrison is led by its guardian; the rest is random Echoes.
    const units = garrison && sector?.guardian ? guardedGarrison(sector, book, target) : randomEchoes(book, target);
    if (side.units.length && !confirmAction(`Replace ${side.name}'s ${side.units.length} units with a random ${ECHOES.name} army?`)) return;
    setSide((s) => loadUnits(s, ECHOES.name, units));
    toast(`${ECHOES.name}: ${units.length} units, ${units.reduce((n, u) => n + u.points, 0)} pts.`);
  };

  const pickForce = (forceId: string, listId: string) => {
    const f = forces.find((x) => x.id === forceId);
    if (!f) return setSide((s) => Object.assign(s, { forceId: undefined, listId: undefined, units: [], roster: undefined, bp: 0, manipulations: [] }));
    setSide((s) => loadForce(s, f, f.lists?.find((l) => l.id === listId), state.settings, state.campaign));
  };

  return (
    <div className={`panel side-panel team-${side.team}`}>
      <div className="panel-title">
        <h2><TextField value={side.name} onCommit={(v) => setSide((s) => void (s.name = v || (s.ai ? 'AI' : 'Player')))} /></h2>
        <span className="row small muted">
          {sidePoints(side) ? `${sidePoints(side)} pts · ` : ''}{side.units.length ? `${side.bp} BP · ` : ''}{alive}/{side.units.length} units
          {b.sides.length > 2 && (
            <button className="ghost icon" aria-label={`Remove ${side.name}`} onClick={() => confirmAction(`Remove ${side.name} from this battle?`) && set((d) => removeSide(d, id))}><Icon name="l:x" /></button>
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
        {side.ai && (
          <div className="field">
            <span>{ECHOES.name} army</span>
            {book ? (
              <div className="row">
                <Stepper value={target} step={50} min={50} onChange={setTarget} />
                <span className="small muted">pts</span>
                <button onClick={generate} title="Build a random Void Echoes army up to the target points"><Icon name="g:perspective-dice-six-faces-six" /> Generate</button>
                {!!garrison && garrison !== target && <button className="ghost small" onClick={() => setTarget(garrison)} title="The sector's difficulty rating">Sector garrison {garrison} pts</button>}
                {enemies > 0 && enemies !== target && <button className="ghost small" onClick={() => setTarget(enemies)}>Match {enemies} pts{reinforced ? ' (Reinforced)' : ''}</button>}
                {!!side.roster?.length && <a className="btn" href={href.sideSheet(side.id)}><Icon name="l:file-text" /> Army sheet</a>}
              </div>
            ) : (
              <span className="muted small">Import the {ECHOES.name} army book on the <a href={href.books()}>Books page</a> to generate an army.</span>
            )}
          </div>
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
          <button className="ghost icon" aria-label="Remove agenda" onClick={() => setSide((s) => void s.agendas.splice(i, 1))}><Icon name="l:x" /></button>
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
          <button className="ghost icon" aria-label="Remove" onClick={() => setSide((s) => void s.manipulations.splice(i, 1))}><Icon name="l:x" /></button>
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
      {side.units.length > 0 && <p className="muted small">XP: 1 per wound of each model destroyed (½ per model in 10+ model, 1-wound units). It carries into the record wizard as Kill XP.</p>}
      {side.units.length > 0 && (
        <div className="table-wrap">
          <table className="compact stack tracker-units">
            <thead><tr><th>Unit</th><th className="num">Wounds</th><th>Shaken</th><th>Activated</th><th className="num">XP</th><th>Destroyed</th></tr></thead>
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
                  <td className="num" data-label="XP"><Stepper value={u.xp ?? 0} min={0} onChange={(n) => setUnit(u.id, (x) => void (x.xp = n))} /></td>
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
