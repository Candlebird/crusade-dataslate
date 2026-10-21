import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { claims, mvpForce, sideOfForce, wizardPrefill } from '../rules/tracker';
import { uid } from '../model/factory';
import type { BattleResult, Campaign, Force, Unit } from '../model/types';
import { AGENDAS, MARKED_XP, MAX_AGENDAS, REWARD_TABLES, SCAR_TABLE, type RewardTableKey } from '../rules/data';
import { matchBonusesEarned } from '../rules/detachments';
import { ECHOES, currentRound, emptyNexusPick, markUnitsUsed, nexusEntry, nexusGeneration, recordSectorGame, unitsUsed, type NexusContext, type NexusPick } from '../rules/nexus';
import { deathDiceCount, deathOutcome, forceTotals, levelForXp, rollDice, rollDie, type DeathOutcome } from '../rules/engine';
import {
  RESULT_LABEL,
  battleScarUnits,
  emptyPick,
  emptyUnitBattle,
  mainTable,
  participationXp,
  resolveBattle,
  rewardRows,
  sufferingCount,
  unitName,
  xpCandidates,
  type BattleInput,
  type BattleOutcome,
  type RewardPick,
  type RewardRow,
  type UnitBattle,
} from '../rules/battle';
import { go, href } from '../route';
import NexusBox, { UnitSelect } from './NexusBox';
import { Stepper, confirmAction, toast } from './ui';
import { SOLO_PATROL } from '../rules/downtimeData';

const STEPS = ['Setup', 'Units', 'Deaths', 'Rewards', 'Summary'] as const;
const OUTCOME_LABEL: Record<DeathOutcome, string> = { scar: 'Battle scar', xp: '+1 XP', none: 'Nothing' };

function initialInput(f: Force, bp: number): BattleInput {
  const units: Record<string, UnitBattle> = {};
  for (const u of f.units) if (u.status !== 'removed') units[u.id] = emptyUnitBattle(u);
  return {
    date: new Date().toISOString().slice(0, 10),
    opponent: '', result: 'win', vsAi: false, agendas: [], myBp: bp, oppBp: bp, notes: '',
    table: '', agendaRp: 0, units, rewards: {},
  };
}

export default function BattleWizard({ forceId, battleId, sideId }: { forceId: string; battleId?: string; sideId?: string }) {
  const { state, update, updateForce } = useStore();
  const f = state.forces.find((x) => x.id === forceId);
  const [step, setStep] = useState(0);
  // A past battle being claimed, or an ended game in the battle tracker that this force played, fills the report in.
  const [source] = useState(() => {
    const past = battleId ? state.battleHistory?.find((b) => b.id === battleId) : undefined;
    if (past) return past.sides.some((x) => x.id === sideId) ? { battle: past, side: sideId!, past: past.finishedAt } : undefined;
    const side = sideOfForce(state.battle, forceId);
    return side && state.battle ? { battle: state.battle, side, past: '' } : undefined;
  });
  // Each unit takes part in one skirmish, patrol or Expedition a campaign round: units that already have sit this one out.
  // The round's main Battle (a sector attack or a Crisis battle) is exempt: every unit can fight in it.
  const [used] = useState(() => {
    const c = state.campaign;
    return f && c?.factions.some((x) => x.id === f.nexus?.factionId) ? unitsUsed(f, c) : [];
  });
  const [input, setInput] = useState<BattleInput | null>(() => {
    if (!f) return null;
    const blank = initialInput(f, forceTotals(f, state.settings).bp);
    const filled = source ? wizardPrefill(source.battle, source.side, blank, f, state.campaign) : blank;
    if (!filled.sectorId && !source?.battle.crisis)
      for (const id of used) if (filled.units[id]) filled.units[id] = { ...filled.units[id], in: false };
    return filled;
  });
  const [applied, setApplied] = useState<BattleOutcome | null>(null);

  const campaign = state.campaign;
  const factionId = f?.nexus?.factionId;
  const nexus = useMemo(() => {
    const crisis = source?.battle.crisis;
    // A solo patrol earns no Nexus rewards (a win still counts as a patrol, below).
    const ctx = nexusGeneration(input?.patrol ? undefined : campaign, factionId, input?.sectorId ?? '', input?.result ?? 'draw', !!input?.vsAi, undefined,
      { forceId: f?.id, ...(crisis ? { crisis, mvp: mvpForce(source.battle) } : {}) });
    if (factionId && ctx.round) ctx.matchesElsewhere = matchBonusesEarned(state.forces, factionId, ctx.round, f?.id);
    return ctx;
  }, [campaign, factionId, input?.sectorId, input?.result, input?.vsAi, input?.patrol, state.forces, f?.id, source]);
  const full = useMemo(() => (input ? { ...input, nexus } : null), [input, nexus]);

  const preview = useMemo(() => {
    if (!f || !full) return null;
    let n = 0;
    return resolveBattle(structuredClone(f), full, () => `preview${n++}`);
  }, [f, full]);

  if (!f || !input || !full || !preview) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;

  const units = f.units.filter((u) => input.units[u.id]);
  const claimedBy = source ? claims(source.battle, state.forces)[source.side] : undefined;
  const set = (patch: Partial<BattleInput>) => {
    // Switching between a skirmish and the main Battle puts the units that already fought this round out or back in.
    if ('sectorId' in patch && !source?.battle.crisis && !patch.sectorId !== !input.sectorId) {
      const next = { ...input.units };
      for (const u of f.units) if (used.includes(u.id) && next[u.id]) next[u.id] = { ...next[u.id], in: patch.sectorId ? u.status === 'active' : false };
      patch = { ...patch, units: next };
    }
    setInput({ ...input, ...patch });
  };
  const setUnit = (id: string, patch: Partial<UnitBattle>) => {
    const next = { ...input.units };
    if (patch.marked) for (const k of Object.keys(next)) next[k] = { ...next[k], marked: false };
    next[id] = { ...next[id], ...patch };
    set({ units: next });
  };
  const setPick = (key: string, patch: Partial<RewardPick>) =>
    set({ rewards: { ...input.rewards, [key]: { ...(input.rewards[key] ?? emptyPick()), ...patch } } });
  const setNexusPick = (key: string, patch: Partial<NexusPick>) =>
    set({ nexusPicks: { ...input.nexusPicks, [key]: { ...(input.nexusPicks?.[key] ?? emptyNexusPick()), ...patch } } });
  const linked = !!(campaign && f.nexus && campaign.factions.some((x) => x.id === f.nexus!.factionId));
  const mainBattle = !!(input.sectorId || source?.battle.crisis);
  const locked = mainBattle ? [] : used;

  const apply = () => {
    const msg = preview.warnings.length
      ? `There are ${preview.warnings.length} unresolved item(s):\n\n${preview.warnings.join('\n')}\n\nApply anyway?`
      : `Apply this battle to ${f.name}? This updates XP, scars, RP and Supply.`;
    if (!confirmAction(msg)) return;
    updateForce(f.id, (d) => {
      resolveBattle(d, full, uid);
      if (linked && !mainBattle) markUnitsUsed(d, campaign!, Object.keys(full.units).filter((id) => full.units[id].in));
      if (full.patrol && linked && d.nexus) d.nexus.patrolRound = currentRound(campaign!);
    });
    const voidItem = nexus.items.find((i) => i.kind === 'void');
    if (voidItem && nexusEntry(voidItem, input.nexusPicks?.void))
      update((d) => {
        const sec = d.campaign?.sectors.find((x) => x.id === input.sectorId);
        if (sec) sec.rewardClaimed = true;
      });
    // A won skirmish goes into the campaign log: it earns a Strategic Asset, and against the Echoes it's a patrol.
    const battleId = source?.battle.id;
    if (linked && !input.sectorId && !source?.battle.crisis && input.result === 'win')
      update((d) => {
        const c = d.campaign;
        if (!c || (battleId && c.log.some((e) => e.skirmish && e.battleId === battleId && e.winner === factionId))) return;
        recordSectorGame(c, {
          id: uid(), date: input.date, sectorId: '', attacker: factionId!, defender: input.vsAi ? ECHOES.id : '', winner: factionId!,
          notes: `${f.name} beat ${input.opponent || (input.vsAi ? ECHOES.name : 'an opponent')}`, skirmish: true, ...(battleId ? { battleId } : {}),
        });
        c.updatedAt = new Date().toISOString();
      });
    if (source && !source.past)
      update((d) => {
        if (d.battle?.id === source.battle.id && !d.battle.recorded.includes(source.side)) d.battle.recorded.push(source.side);
      });
    setApplied(preview);
    toast('Battle recorded.');
  };

  if (applied) return <Applied force={f} outcome={applied} />;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.forces()}>Forces</a> / <a href={href.force(f.id)}>{f.name}</a> / Post-battle</div>
          <h1>Record battle</h1>
        </div>
        <div className="row">
          <button onClick={() => confirmAction('Discard this battle report?') && go(href.force(f.id))}>Cancel</button>
        </div>
      </div>

      {source && (
        <p className="panel notice small">
          Filled in from {source.past ? 'past battle' : 'the battle tracker'} <a href={href.tracker()}>{source.battle.mission.name}</a>
          {source.past && ` (${source.past.slice(0, 10)}, as ${source.battle.sides.find((x) => x.id === source.side)?.name})`}. Check the details, then add XP and rewards.
          {' '}<button className="ghost small" onClick={() => setInput({ ...initialInput(f, forceTotals(f, state.settings).bp), from: input.from })}>Start blank instead</button>
        </p>
      )}
      {source && claimedBy && (
        <p className="panel notice small" style={{ borderColor: 'var(--red)' }}>
          {source.battle.sides.find((x) => x.id === source.side)?.name}'s rewards from this battle were already claimed by <b>{claimedBy.name}</b>. Applying again records the battle twice.
        </p>
      )}

      {input.patrol && (
        <p className="panel notice small">
          <span className="tag cyan">Solo patrol</span> A downtime game of up to {SOLO_PATROL.points} pts against the AI: units earn participation and kill XP only — no RP, reward rolls or Marked for Greatness.
          {linked && ' A win still counts as a patrol against the Echoes and earns a Strategic Asset.'}
          {linked && f.nexus?.patrolRound === currentRound(campaign!) && <b> {f.name} already recorded a patrol this round.</b>}
        </p>
      )}

      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={i === step ? 'primary' : i < step ? 'done' : ''} onClick={() => setStep(i)}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {step === 0 && <SetupStep input={input} set={set} campaign={linked ? campaign : undefined} />}
      {step === 1 && <UnitsStep units={units} input={input} setUnit={setUnit} used={locked} />}
      {step === 2 && <DeathsStep units={units} input={input} setUnit={setUnit} />}
      {step === 3 && <RewardsStep units={units} input={full} set={set} setPick={setPick} />}
      {step === 3 && linked && <NexusRewards units={units} input={input} nexus={nexus} setPick={setNexusPick} />}
      {step === 4 && <SummaryStep outcome={preview} />}

      <div className="row">
        {step > 0 && <button onClick={() => setStep(step - 1)}>← Back</button>}
        <span className="spacer" />
        {step < STEPS.length - 1 && <button className="primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]} →</button>}
        {step === STEPS.length - 1 && <button className="primary" onClick={apply}>Apply to force</button>}
      </div>
    </>
  );
}

// ---- Step 1: setup ----

function SetupStep({ input, set, campaign }: { input: BattleInput; set: (p: Partial<BattleInput>) => void; campaign?: Campaign }) {
  const toggleAgenda = (name: string) =>
    set({ agendas: input.agendas.includes(name) ? input.agendas.filter((a) => a !== name) : [...input.agendas, name] });
  const suffering = sufferingCount(input);
  return (
    <div className="cols-2">
      <div className="panel">
        <div className="panel-title"><h2>The battle</h2></div>
        <div className="fields">
          <label className="field">Date<input type="date" value={input.date} onChange={(e) => set({ date: e.target.value })} /></label>
          <label className="field">Opponent<input value={input.opponent} placeholder="Player or force" onChange={(e) => set({ opponent: e.target.value })} /></label>
          <label className="field">
            Result
            <select value={input.result} onChange={(e) => set({ result: e.target.value as BattleResult })}>
              {(Object.keys(RESULT_LABEL) as BattleResult[]).map((r) => <option key={r} value={r}>{RESULT_LABEL[r]}</option>)}
            </select>
          </label>
          <label className="field">
            Opponent type
            <span className="row"><input type="checkbox" checked={input.vsAi} onChange={(e) => set({ vsAi: e.target.checked })} /> Solo / AI opponent</span>
          </label>
          {campaign && !input.patrol && (
            <label className="field span-all">
              Nexus Wars game
              <select value={input.sectorId ?? ''} onChange={(e) => {
                const sec = campaign.sectors.find((x) => x.id === e.target.value);
                set({ sectorId: sec?.id, sectorName: sec?.name, nexusPicks: {} });
              }}>
                <option value="">Skirmish (no sector)</option>
                <optgroup label="Battle over a sector">
                  {campaign.sectors.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </optgroup>
              </select>
              <span className="muted small">
                {input.sectorId ? "The round's Battle: an attack from the sealed orders." : "Any game away from the map. A win earns a Strategic Asset; against the AI it's also a patrol."}
              </span>
            </label>
          )}
          <label className="field">Your Battle Points<Stepper value={input.myBp} min={0} onChange={(n) => set({ myBp: n })} /></label>
          <label className="field">Opponent Battle Points<Stepper value={input.oppBp} min={0} onChange={(n) => set({ oppBp: n })} /></label>
          {!input.patrol && <label className="field span-all">
            Reward table
            <select value={input.table} onChange={(e) => set({ table: e.target.value as RewardTableKey | '' })}>
              <option value="">By result ({REWARD_TABLES[mainTable({ ...input, table: '' })].label})</option>
              {(['winner', 'loser', 'ai'] as const).map((k) => <option key={k} value={k}>{REWARD_TABLES[k].label}</option>)}
            </select>
          </label>}
          <label className="field span-all">Notes<textarea rows={3} value={input.notes} onChange={(e) => set({ notes: e.target.value })} /></label>
        </div>
        {input.result === 'draw' && !input.table && <p className="muted small">Draws use the Losers table by default — change it above if your group plays it differently.</p>}
        {suffering > 0 && <p className="small"><span className="tag gold">Growth Through Suffering</span> {suffering} roll{suffering > 1 ? 's' : ''} for being {input.oppBp - input.myBp} BP down.</p>}
      </div>
      {input.patrol ? (
        <div className="panel">
          <div className="panel-title"><h2>Solo patrol</h2></div>
          <p className="muted small">No agendas on a patrol: every unit that took part gains {participationXp(input)} XP, plus its kill XP.</p>
        </div>
      ) : <div className="panel">
        <div className="panel-title">
          <h2>Agendas</h2>
          <span className="muted small">{input.agendas.length} / {MAX_AGENDAS} · participation {participationXp(input)} XP</span>
        </div>
        {AGENDAS.map((a) => {
          const on = input.agendas.includes(a.name);
          const full = !on && input.agendas.length >= MAX_AGENDAS;
          return (
            <label key={a.name} className={`shop-item${on ? ' selected' : ''}${full ? ' disabled' : ''}`}>
              <input type="checkbox" checked={on} disabled={full} onChange={() => toggleAgenda(a.name)} />
              <div className="grow">
                <b>{a.name}</b> {a.special && <span className="tag cyan">special</span>}
                <div className="muted small">{a.desc}</div>
              </div>
            </label>
          );
        })}
        <p className="muted small">No agendas: every unit that took part gains {participationXp({ ...input, agendas: [] })} XP instead. Record agenda XP per unit on the next step.</p>
      </div>}
    </div>
  );
}

// ---- Step 2: units ----

function UnitsStep({ units, input, setUnit, used }: { units: Unit[]; input: BattleInput; setUnit: (id: string, p: Partial<UnitBattle>) => void; used: string[] }) {
  const part = participationXp(input);
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Who fought</h2>
        <span className="muted small">Kill XP: 1 per wound of each model destroyed (½ per model in 10+ model, 1-wound units)</span>
      </div>
      <div className="table-wrap">
        <table className="compact stack">
          <thead>
            <tr>
              <th>Fought</th><th>Unit</th><th>Destroyed</th><th title="Marked for Greatness">Marked</th><th title="Holding an objective at the end">Holding</th>
              <th className="num">Kills</th><th className="num">Kill XP</th><th className="num">Bonus XP</th><th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {units.map((u) => {
              const r = input.units[u.id];
              const comatose = u.status === 'comatose';
              const total = r.in ? part + (input.patrol ? r.killXp : (r.marked ? MARKED_XP : 0) + r.killXp + r.bonusXp) : 0;
              return (
                <tr key={u.id} className={r.in ? '' : 'removed'}>
                  <td data-label="Fought"><input type="checkbox" checked={r.in} disabled={used.includes(u.id)} onChange={(e) => setUnit(u.id, { in: e.target.checked })} /></td>
                  <td className="s-2">
                    <b>{unitName(u)}</b>
                    <div className="muted small">{u.name && u.unitType} {comatose && <span className="tag cyan" title="Sits this battle out; recovers afterwards">Comatose</span>}
                      {used.includes(u.id) && <span className="tag gold" title="Each unit takes part in one skirmish, Solo patrol or Expedition a campaign round">Already fought this round</span>}</div>
                  </td>
                  <td data-label="Destroyed"><input type="checkbox" disabled={!r.in} checked={r.destroyed} onChange={(e) => setUnit(u.id, { destroyed: e.target.checked, death: e.target.checked ? r.death : null })} /></td>
                  <td data-label="Marked"><input type="radio" name="marked" disabled={!r.in || input.patrol} checked={r.marked} onChange={() => setUnit(u.id, { marked: true })} onClick={() => r.marked && setUnit(u.id, { marked: false })} /></td>
                  <td data-label="Holding"><input type="checkbox" disabled={!r.in} checked={r.holding} onChange={(e) => setUnit(u.id, { holding: e.target.checked })} /></td>
                  <td className="num" data-label="Kills"><Stepper value={r.kills} min={0} onChange={(n) => setUnit(u.id, { kills: n })} /></td>
                  <td className="num" data-label="Kill XP"><Stepper value={r.killXp} min={0} onChange={(n) => setUnit(u.id, { killXp: n })} /></td>
                  <td className="num" data-label="Bonus XP">{input.patrol ? <span className="muted">—</span> : <Stepper value={r.bonusXp} min={0} onChange={(n) => setUnit(u.id, { bonusXp: n })} />}</td>
                  <td className="num s-full" data-label="Total XP"><b>{total}</b></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">Total excludes death rolls and table rewards. Comatose units sit out by default and recover once the battle is applied.</p>
      {units.some((u) => used.includes(u.id)) && (
        <p className="muted small">Each unit takes part in one skirmish, Solo patrol or Expedition a campaign round. Units that already have earn nothing from this one; they are free again when the GM ends the round. The round's main Battle doesn't count: every unit can fight in it.</p>
      )}
    </div>
  );
}

// ---- Step 3: deaths ----

function DeathsStep({ units, input, setUnit }: { units: Unit[]; input: BattleInput; setUnit: (id: string, p: Partial<UnitBattle>) => void }) {
  const dead = units.filter((u) => input.units[u.id].in && input.units[u.id].destroyed);
  if (!dead.length) return <div className="panel empty">No units were destroyed. Mark them on the Units step if any were.</div>;
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Death rolls</h2>
        <span className="muted small">Roll a D6 per destroyed unit: 1 = battle scar, 6 = +1 XP</span>
      </div>
      {dead.map((u) => {
        const r = input.units[u.id];
        const n = deathDiceCount(u);
        const roll = () => {
          const dice = rollDice(n);
          const outcome = deathOutcome(dice);
          setUnit(u.id, { death: { dice, outcome }, scar: outcome === 'scar' ? r.scar : '' });
        };
        const rollScar = () => setUnit(u.id, { scar: `scar:${SCAR_TABLE[rollDie(SCAR_TABLE.length) - 1].name}` });
        const scarEntry = r.scar.startsWith('scar:') ? SCAR_TABLE.find((s) => `scar:${s.name}` === r.scar) : undefined;
        return (
          <div key={u.id} className="reward">
            <div className="reward-head">
              <h4>{unitName(u)}</h4>
              {n > 1 && <span className="tag red" title="Lowered Constitution">2 dice</span>}
              <span className="spacer" />
              {r.death && r.death.dice.length > 0 && (
                <span className="dice-tray" style={{ margin: 0 }}>
                  {r.death.dice.map((d, i) => <span key={i} className={`die-face sm${d === 6 ? ' hit' : ''}${d === 1 ? ' one' : ''}`}>{d}</span>)}
                </span>
              )}
              <button onClick={roll}>🎲 Roll {n}D6</button>
              <select
                value={r.death?.outcome ?? ''}
                onChange={(e) => setUnit(u.id, { death: e.target.value ? { dice: [], outcome: e.target.value as DeathOutcome } : null, scar: '' })}
              >
                <option value="">— result —</option>
                {(Object.keys(OUTCOME_LABEL) as DeathOutcome[]).map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
              </select>
            </div>
            {r.death?.outcome === 'scar' && (
              <div className="row" style={{ marginTop: '0.5rem' }}>
                <button onClick={rollScar}>🎲 Roll D10 scar</button>
                <select value={r.scar} onChange={(e) => setUnit(u.id, { scar: e.target.value })}>
                  <option value="">— choose —</option>
                  <optgroup label="Battle scars">
                    {SCAR_TABLE.map((s, i) => <option key={s.name} value={`scar:${s.name}`}>{i + 1}. {s.name}</option>)}
                  </optgroup>
                  {u.upgrades.length > 0 && (
                    <optgroup label="Lose a trait instead (XP drops to previous level)">
                      {u.upgrades.map((up) => <option key={up.id} value={`trait:${up.id}`}>Lose {up.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {scarEntry && <span className="muted small grow">{scarEntry.desc}</span>}
                {u.scars.length >= 3 && r.scar.startsWith('scar:') && r.scar !== 'scar:Comatose' && <span className="tag red">4th scar — unit will be removed</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Step 4: rewards ----

function RewardsStep({ units, input, set, setPick }: {
  units: Unit[];
  input: BattleInput;
  set: (p: Partial<BattleInput>) => void;
  setPick: (key: string, p: Partial<RewardPick>) => void;
}) {
  const rows = rewardRows(input);
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Rewards</h2>
        {!input.patrol && <label className="row small">Agenda RP <Stepper value={input.agendaRp} min={0} onChange={(n) => set({ agendaRp: n })} /></label>}
      </div>
      <p className="muted small">{input.patrol ? 'Solo patrol: no RP or reward rolls — participation and kill XP only.' : 'Every battle earns 1 RP. Roll on each table below and assign what it gives.'}</p>
      {rows.map((row) => (
        <RewardBox key={row.key} row={row} units={units} input={input} pick={input.rewards[row.key] ?? emptyPick()} setPick={(p) => setPick(row.key, p)} />
      ))}
    </div>
  );
}

function RewardBox({ row, units, input, pick, setPick }: {
  row: RewardRow;
  units: Unit[];
  input: BattleInput;
  pick: RewardPick;
  setPick: (p: Partial<RewardPick>) => void;
}) {
  const table = REWARD_TABLES[row.table];
  const e = row.entry;
  const fighters = units.filter((u) => input.units[u.id].in);
  const given = Object.values(pick.alloc).reduce((n, x) => n + x, 0);

  let scarOptions: { value: string; label: string }[] = [];
  if (e?.removeScar) {
    const battle = battleScarUnits(units, input).map((u) => ({ value: `${u.id}:battle`, label: `${unitName(u)} — undo ${input.units[u.id].scar.slice(5)} (this battle)` }));
    const old = e.removeScar === 'any' ? units.flatMap((u) => u.scars.map((s) => ({ value: `${u.id}:${s.id}`, label: `${unitName(u)} — ${s.name}` }))) : [];
    scarOptions = [...battle, ...old];
  }

  return (
    <div className="reward">
      <div className="reward-head">
        <h4>{row.source}</h4>
        {row.fixed ? <span className="tag green">granted</span> : (
          <>
            <span className="spacer" />
            <button onClick={() => setPick({ roll: rollDie(table.entries.length) })}>🎲 Roll D{table.entries.length}</button>
            <select value={pick.roll ?? ''} onChange={(ev) => setPick({ roll: Number(ev.target.value) || null })}>
              <option value="">— result —</option>
              {table.entries.map((x, i) => <option key={i} value={i + 1}>{i + 1}. {x.text}</option>)}
            </select>
          </>
        )}
      </div>
      {e && <div style={{ marginTop: '0.35rem' }}><b className="cat">{e.text}</b></div>}

      {e?.xp && e.xpTarget === 'any' && (
        <>
          <div className="small" style={{ marginTop: '0.35rem' }}>
            Distribute {e.xp} XP · <span className={given > e.xp ? 'tag red' : given === e.xp ? 'tag green' : 'tag gold'}>{e.xp - given} left</span>
          </div>
          <div className="alloc">
            {fighters.map((u) => (
              <label key={u.id}>
                <span>{unitName(u)}</span>
                <Stepper value={pick.alloc[u.id] ?? 0} min={0} onChange={(n) => setPick({ alloc: { ...pick.alloc, [u.id]: n } })} />
              </label>
            ))}
          </div>
        </>
      )}

      {e?.xp && e.xpTarget !== 'any' && (
        <UnitSelect label={`${e.xp} XP to`} units={xpCandidates(units, input, e.xpTarget)} value={pick.target} onChange={(target) => setPick({ target })}
          empty={e.xpTarget === 'holder' ? 'No unit was marked as holding a point' : e.xpTarget === 'dead' ? 'No unit was destroyed' : 'No survivors'} />
      )}

      {e?.removeScar && (
        <div className="row" style={{ marginTop: '0.5rem' }}>
          <span className="small">Remove</span>
          <select value={pick.target} onChange={(ev) => setPick({ target: ev.target.value })}>
            <option value="">— choose a scar —</option>
            {scarOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!scarOptions.length && <span className="muted small">No scars to remove{e.removeScar === 'battle' ? ' — re-roll' : ''}.</span>}
        </div>
      )}

      {e?.free && (
        <>
          <UnitSelect label={`${e.free} for`} units={units} value={pick.target} onChange={(target) => setPick({ target })} empty="No units" />
          <p className="muted small" style={{ margin: '0.35rem 0 0' }}>Added as a reminder — pick the actual {e.free.toLowerCase()} on the unit sheet afterwards.</p>
        </>
      )}
    </div>
  );
}

function NexusRewards({ units, input, nexus, setPick }: {
  units: Unit[];
  input: BattleInput;
  nexus: NexusContext;
  setPick: (key: string, p: Partial<NexusPick>) => void;
}) {
  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Nexus Wars</h2>
        <span className="muted small">Match rewards{input.sectorName ? ` · fought over ${input.sectorName}` : ''} · sector income is claimed each round on the force page</span>
      </div>
      {nexus.notes.map((n, i) => <p key={i} className="small"><span className="tag gold">Note</span> {n}</p>)}
      {nexus.items.length === 0 && <p className="muted small">Nothing generated this match.</p>}
      {nexus.items.map((item) => (
        <NexusBox key={item.key} item={item} units={units} fighters={units.filter((u) => input.units[u.id]?.in)} pick={input.nexusPicks?.[item.key] ?? emptyNexusPick()} setPick={(p) => setPick(item.key, p)} />
      ))}
    </div>
  );
}

// ---- Step 5: summary ----

function SummaryStep({ outcome }: { outcome: BattleOutcome }) {
  return (
    <div className="cols-main">
      <div className="panel">
        <div className="panel-title"><h2>Experience</h2></div>
        <div className="table-wrap">
          <table className="compact stack">
            <thead><tr><th>Unit</th><th>Breakdown</th><th className="num">XP</th><th>Outcome</th></tr></thead>
            <tbody>
              {outcome.units.filter((o) => o.played || o.gain || o.wokeUp).map((o) => (
                <tr key={o.unitId}>
                  <td className="s-2"><b>{o.name}</b>{!o.played && <div className="muted small">did not fight</div>}</td>
                  <td className="small s-full" data-label="Breakdown">{o.parts.map((p) => `${p.label} +${p.xp}`).join(', ') || '—'}</td>
                  <td className="num s-end" data-label="XP">{o.xpBefore} → <b>{o.xpAfter}</b></td>
                  <td className="s-full">
                    {o.levelsGained > 0 && <span className="tag gold">Level {levelForXp(o.xpAfter)}!</span>}
                    {o.scarUndone && <span className="tag green">{o.scarName} undone</span>}
                    {!o.scarUndone && o.scarResult === 'scarred' && <span className="tag red">{o.scarName}</span>}
                    {o.scarResult === 'comatose' && <span className="tag cyan">Comatose</span>}
                    {o.scarResult === 'removed' && <span className="tag red">Removed (4th scar)</span>}
                    {o.lostTrait && <span className="tag red">Lost {o.lostTrait}</span>}
                    {o.removedScars.map((s) => <span key={s} className="tag green">−{s}</span>)}
                    {o.free.map((s) => <span key={s} className="tag cyan">{s}</span>)}
                    {o.wokeUp && <span className="tag cyan">Recovers</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div>
        <div className="panel">
          <div className="panel-title"><h3>Requisition</h3><b>+{outcome.rp} RP{outcome.supply ? ` · +${outcome.supply} Supply` : ''}{outcome.us ? ` · +${outcome.us} US` : ''}</b></div>
          {outcome.ledger.map((l, i) => (
            <div key={i} className="list-item small">
              <span className="grow">{l.label}</span>
              {l.rp !== 0 && <span className="tag gold">{l.rp > 0 ? '+' : ''}{l.rp} RP</span>}
              {l.supply !== 0 && <span className="tag">+{l.supply}</span>}
              {!!l.us && <span className="tag cyan">+{l.us} US</span>}
            </div>
          ))}
        </div>
        {outcome.warnings.length > 0 && (
          <div className="panel">
            <div className="panel-title"><h3>Unresolved</h3></div>
            <ul className="issues">{outcome.warnings.map((w, i) => <li key={i} className="warn">{w}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Applied({ force, outcome }: { force: Force; outcome: BattleOutcome }) {
  const ups = outcome.units.filter((o) => o.levelsGained > 0);
  const todo = outcome.units.filter((o) => o.free.length || o.lostTrait);
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.forces()}>Forces</a> / <a href={href.force(force.id)}>{force.name}</a> / Post-battle</div>
          <h1>Battle recorded</h1>
        </div>
        <div className="row"><a className="btn primary" href={href.force(force.id)}>Back to Order of Battle</a></div>
      </div>
      <div className="panel">
        <ul>{outcome.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
      </div>
      {(ups.length > 0 || todo.length > 0) && (
        <div className="panel">
          <div className="panel-title"><h2>Next: unit sheets</h2></div>
          {ups.map((o) => (
            <div key={o.unitId} className="list-item">
              <span className="grow"><b>{o.name}</b> reached level {levelForXp(o.xpAfter)} — roll for {o.levelsGained > 1 ? `${o.levelsGained} upgrades` : 'an upgrade'}.</span>
              <a className="btn" href={href.unit(force.id, o.unitId)}>Open unit</a>
            </div>
          ))}
          {todo.filter((o) => !ups.includes(o)).map((o) => (
            <div key={o.unitId} className="list-item">
              <span className="grow"><b>{o.name}</b>: {[...o.free, ...(o.lostTrait ? [`lost ${o.lostTrait}`] : [])].join(', ')}</span>
              <a className="btn" href={href.unit(force.id, o.unitId)}>Open unit</a>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
