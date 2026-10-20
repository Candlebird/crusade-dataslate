import { nowIso, uid } from '../model/factory';
import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import {
  ECHOES, GALACTIC_EVENTS, NEXUS_CRISIS, NEXUS_ROUNDS, STRATEGIC_ASSETS, activeCrisis, activeEvent, currentRound, factionColor, factionName, lordById,
} from '../rules/nexus';
import { crisisForfeits, rollEvent, setEvent } from '../rules/events';
import { href } from '../route';
import {
  assetName, assetsOf, echoWins, endRound, inGrace, leaders, nextThreat, refundAsset, roundEndText, sectorCounts, spendAsset, spreadsAt, threatOf,
  underdogBonus, type RoundEnd,
} from '../rules/rounds';
import { difficultyRange, rateSectors } from '../rules/difficulty';
import { NEXUS_DIFFICULTY } from '../rules/nexusData';
import { confirmAction, toast } from './ui';

/** End the current round on a copy of the campaign (the spread is random, so it's rolled once, here) and store the result. */
export function useEndRound() {
  const { state, update } = useStore();
  return (c: Campaign): RoundEnd => {
    const next = structuredClone(c);
    const r = endRound(next, Math.random, undefined, state.forces);
    next.updatedAt = nowIso();
    update((d) => void (d.campaign = next));
    toast(roundEndText(next, r));
    return r;
  };
}

/** The campaign round: the Void Echoes' threat, who's ahead, and the GM's End round button. */
export default function RoundPanel({ c }: { c: Campaign }) {
  const end = useEndRound();
  const { state, update } = useStore();
  const range = difficultyRange(c, state.forces);
  const rated = c.sectors.some((s) => s.difficulty !== undefined);
  const round = currentRound(c);
  const threat = threatOf(c);
  const coming = nextThreat(c);
  const counts = sectorCounts(c);
  const ahead = new Set(leaders(c));
  const behind = underdogBonus(c);
  const grace = inGrace(c);
  const { patrols } = echoWins(c, round);
  const unspent = c.factions.reduce((n, f) => n + assetsOf(c, f.id).left, 0);
  const event = activeEvent(c);
  const crisis = activeCrisis(c);
  const spreads = Math.max(0, spreadsAt(coming) + (event?.spread ?? 0));

  const endNow = () => {
    if (!confirmAction(`End round ${round}? Every faction's sector income for the round is fixed now (players claim it on their force page), `
      + `the ${ECHOES.name}' threat goes to ${coming} and they spread ${spreads} sector${spreads === 1 ? '' : 's'}${grace ? ' (into unclaimed space only)' : ''}.`
      + (crisis && crisis.result !== 'won' ? ` The Nexus Crisis wasn't won: the ${ECHOES.name} take each faction's sector nearest ${lordById(crisis.lord)?.name ?? 'the Lord'}.` : '')
      + (unspent ? ` ${unspent} unspent Strategic Asset${unspent === 1 ? ' is' : 's are'} lost.` : '')
      + ' Claimed space hulks drift off and new points of interest appear on the map, and a Galactic Event is rolled for the next round.'
      + ` Sector difficulty is rescaled to ${range.min}–${range.max} Supply and AI-held sectors roll new modifiers.`)) return;
    end(c);
  };
  const rescale = () => {
    if (rated && !confirmAction(`Rescale every sector to ${range.min}–${range.max} Supply? Sectors keep their modifiers; unrated ones roll theirs.`)) return;
    update((d) => {
      if (!d.campaign) return;
      rateSectors(d.campaign, d.forces);
      d.campaign.updatedAt = nowIso();
    });
    toast(`Sectors rated ${range.min}–${range.max} Supply.`);
  };

  return (
    <div className="panel">
      <div className="panel-title">
        <h2>Round {round}</h2>
        <button className="primary" onClick={endNow} title="When everyone has played what they're going to play this round">End round…</button>
      </div>
      <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="tag red" title={`Up ${NEXUS_ROUNDS.threatPerRound} each round, down ${NEXUS_ROUNDS.threatPerWin} per Battle won against them (${NEXUS_ROUNDS.threatPerVoidspawnWin} at a Voidspawn) and ${NEXUS_ROUNDS.threatPerPatrolWin} per patrol (a skirmish won against them)`}>
          ☣ {ECHOES.name} threat {threat}/{NEXUS_ROUNDS.threatMax}
        </span>
        <span className="muted">If the round ended now: threat {coming}, spreading {spreads} sector{spreads === 1 ? '' : 's'}{ahead.size ? ', most likely into the leader\'s space' : ''}{patrols ? ` (${patrols} patrol${patrols === 1 ? '' : 's'} won so far)` : ''}.</span>
      </div>
      <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
        <span className="tag" title={`From ${NEXUS_DIFFICULTY.min} up to the biggest faction's total Supply × ${NEXUS_DIFFICULTY.maxFactor}; rescaled when the round ends`}>
          Sector difficulty {range.min}–{range.max} Supply
        </span>
        <button className="small" onClick={rescale} title="Rate sectors now against the factions' current Supply (the round's end does this too)">
          {rated ? 'Rescale sectors now' : 'Rate sectors'}
        </button>
      </div>
      {grace && (
        <p className="small" style={{ margin: '0.5rem 0 0' }}>
          <span className="tag gold">Opening rounds</span> Until round {NEXUS_ROUNDS.graceRounds + 1}: no home-sector challenges, and the {ECHOES.name} only spread into unclaimed sectors.
        </p>
      )}
      {c.factions.length > 0 && (
        <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
          <span className="muted">Sectors held, not counting homes:</span>
          {c.factions.map((f) => (
            <span key={f.id} className="tag" style={{ borderColor: factionColor(c, f.id) }}>
              {f.name}: {counts[f.id] ?? 0} sector{counts[f.id] === 1 ? '' : 's'}
              {ahead.has(f.id) && ' · leading'}
              {(behind[f.id] ?? 0) > 0 && ` · catch-up +${behind[f.id]} US`}
            </span>
          ))}
        </div>
      )}
      <EventRow c={c} />
      {crisis && <CrisisRow c={c} />}
      {c.factions.length > 0 && <AssetsRow c={c} />}
    </div>
  );
}

/** This round's Galactic Event, which the GM can re-roll or pick by hand. */
function EventRow({ c }: { c: Campaign }) {
  const { update } = useStore();
  const event = activeEvent(c);
  const change = (fn: (d: Campaign) => void) => update((s) => {
    if (!s.campaign) return;
    fn(s.campaign);
    s.campaign.updatedAt = nowIso();
  });
  const storm = event?.sectorIds.map((id) => c.sectors.find((x) => x.id === id)?.name).filter(Boolean) ?? [];
  return (
    <div className="small" style={{ marginTop: '0.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="tag gold">✦ Galactic Event: {event ? event.name : 'none'}</span>
        <button className="small" onClick={() => change((d) => rollEvent(d))} title="Roll a D12 on the Galactic Events table">{event ? 'Re-roll' : 'Roll a Galactic Event'}</button>
        <select value="" aria-label="Pick the Galactic Event" onChange={(e) => e.target.value && change((d) => setEvent(d, e.target.value))}>
          <option value="">Pick one…</option>
          {GALACTIC_EVENTS.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.name}</option>)}
        </select>
      </div>
      {event && (
        <p style={{ margin: '0.25rem 0 0' }}>
          {event.desc}{event.battle && <> <b>In every battle this round:</b> {event.battle}</>}
          {storm.length > 0 && <> Cut off: <b>{storm.join(', ')}</b>.</>}
        </p>
      )}
    </div>
  );
}

/** This round's Nexus Crisis: the Echo Lord, how it's going, and what happens if it isn't won. */
function CrisisRow({ c }: { c: Campaign }) {
  const { state } = useStore();
  const crisis = activeCrisis(c)!;
  const lord = lordById(crisis.lord);
  const at = c.sectors.find((x) => x.id === crisis.sectorId);
  const forfeits = crisisForfeits(c);
  return (
    <div className="small" style={{ marginTop: '0.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="tag red">☠ Nexus Crisis: {lord?.name ?? 'an Echo Lord'} at {at?.name ?? 'the Voidspawn'}</span>
        <span className={`tag${crisis.result === 'won' ? ' gold' : ''}`}>{crisis.result === 'won' ? 'Won' : crisis.result === 'lost' ? 'Lost' : 'Not fought yet'}</span>
        {!crisis.battleId && <a className="btn small" href={href.crisis()}>Start the Crisis battle</a>}
      </div>
      <p style={{ margin: '0.25rem 0 0' }}>
        {lord?.desc} Every faction fights it together, against the AI, before the round ends.
        Win: the threat drops {NEXUS_CRISIS.threatDrop}, each side claims +{NEXUS_CRISIS.winUs} US and the side whose units earned the most XP takes a {NEXUS_CRISIS.mvpTier} relic
        {crisis.mvp ? ` (MVP: ${state.forces.find((f) => f.id === crisis.mvp)?.name ?? 'a force not on this device'})` : ''}.
        {crisis.result !== 'won' && <> Lose, or don't fight it: the threat goes to {NEXUS_ROUNDS.threatMax} and the {ECHOES.name} take {forfeits.length
          ? forfeits.map((x) => `${x.name} (${factionName(c, x.owner)})`).join(', ')
          : "each faction's sector nearest the Lord"}.</>}
      </p>
    </div>
  );
}

/** Each faction's Strategic Assets this round (one per skirmish won), and spending them on the Battle. */
function AssetsRow({ c }: { c: Campaign }) {
  const { update } = useStore();
  const change = (fn: (d: Campaign) => void) => update((s) => {
    if (!s.campaign) return;
    fn(s.campaign);
    s.campaign.updatedAt = nowIso();
  });
  return (
    <div className="small" style={{ marginTop: '0.5rem' }}>
      <span className="muted" title={`One per skirmish won this round, up to ${NEXUS_ROUNDS.assetsMax}. Spend them in the Battle; unspent ones are lost when the round ends.`}>
        Strategic Assets, one per skirmish won (up to {NEXUS_ROUNDS.assetsMax}), lost if unspent when the round ends:
      </span>
      {c.factions.map((f) => {
        const a = assetsOf(c, f.id);
        return (
          <div key={f.id} className="row" style={{ flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
            <span className="tag" style={{ borderColor: factionColor(c, f.id) }}>{f.name}: {a.left} of {a.earned} left</span>
            {a.spent.map((u) => (
              <span key={u.id} className="tag gold" title={STRATEGIC_ASSETS.find((x) => x.key === u.asset)?.desc}>
                {assetName(u.asset)}
                <button className="ghost icon" aria-label={`Take back ${assetName(u.asset)}`} title="Spent by mistake: take it back"
                  onClick={() => change((d) => refundAsset(d, u.id))}>✕</button>
              </span>
            ))}
            {a.left > 0 && (
              <select value="" aria-label={`Spend a Strategic Asset for ${f.name}`}
                onChange={(e) => e.target.value && change((d) => void spendAsset(d, f.id, e.target.value, uid(), nowIso().slice(0, 10)))}>
                <option value="">Spend one…</option>
                {STRATEGIC_ASSETS.map((x) => <option key={x.key} value={x.key} title={x.desc}>{x.name}: {x.desc}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
