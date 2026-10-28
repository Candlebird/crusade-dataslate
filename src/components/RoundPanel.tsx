import { nowIso, uid } from '../model/factory';
import { useStore } from '../model/store';
import type { Campaign, Sector } from '../model/types';
import { placeGuardians, rerollGuardians } from '../rules/guardians';
import {
  ECHOES, GALACTIC_EVENTS, NEXUS_CRISIS, NEXUS_ROUNDS, STRATEGIC_ASSETS, activeCrisis, activeEvent, crisisUntil, currentRound, factionColor, factionName, lordById,
} from '../rules/nexus';
import { crisisForfeits, rollEvent, setEvent } from '../rules/events';
import { detachmentName } from '../rules/detachments';
import { href } from '../route';
import {
  assetName, assetsOf, echoWins, endRound, inGrace, leaders, nextThreat, placeEchoMarks, refundAsset, roundEndText, sectorCounts, spendAsset, spreadsAt,
  roundAge, threatOf, underdogBonus, type RoundEnd,
} from '../rules/rounds';
import { difficultyLevel, difficultyRange, rateSectors } from '../rules/difficulty';
import { DIFFICULTY_LEVELS, NEXUS_DIFFICULTY } from '../rules/nexusData';
import { Panel, confirmAction, toast } from './ui';
import { localDate } from '../model/date';
import { breaksLeft, echoMarks, holders } from '../rules/voidspawn';
import { Icon } from './Icon';
import { useSiegeSettle } from './training/useSiegeSettle';

/** End the current round on a copy of the campaign (the spread is random, so it's rolled once, here) and store the result. */
export function useEndRound() {
  const { update } = useStore();
  // Ends the round on the latest campaign in the store, so a change made since the page last drew isn't lost.
  return (): RoundEnd | undefined => {
    let out: { r: RoundEnd; c: Campaign } | undefined;
    update((d) => {
      if (!d.campaign) return;
      const r = endRound(d.campaign, Math.random, undefined, d.forces, d.books, d.battleHistory);
      d.campaign.updatedAt = nowIso();
      out = { r, c: d.campaign };
    });
    if (out) {
      const { c, r } = out;
      // With the turn report on the page it tells the round; the toast just says it ended and what the report leaves out.
      const shown = !!document.getElementById('turn-report');
      toast(shown
        ? `Round ${r.round} ended: ${ECHOES.name} threat ${r.threatBefore} → ${r.threat}.`
          + (r.difficulty ? ` Sectors rescaled to ${r.difficulty.min}–${r.difficulty.max} Supply.` : '')
          + (r.warlords?.lost ?? []).map((w) => ` ${factionName(c, w.factionId)} lost its Warlord, ${w.name}.`).join('')
          + ` Round ${currentRound(c)} begins: the turn report below has the rest.`
        : roundEndText(c, r));
      // The new turn report is what everyone reads next: bring it into view where it's on the page (the Map tab).
      setTimeout(() => {
        const el = document.getElementById('turn-report');
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        el.classList.remove('flash');
        void el.offsetWidth;
        el.classList.add('flash');
      }, 50);
    }
    return out?.r;
  };
}

/**
 * The campaign round: the Void Echoes' threat, who's ahead, and the GM's End round button. A player's panel (gm false)
 * has no GM controls, and only their own faction's (viewer) Strategic Assets.
 */
export default function RoundPanel({ c, gm = true, viewer }: { c: Campaign; gm?: boolean; viewer?: string }) {
  const end = useEndRound();
  const { state, update } = useStore();
  const range = difficultyRange(c, state.forces);
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
  const age = roundAge(c);
  const overdue = age !== undefined && age >= NEXUS_ROUNDS.overdueDays;
  const spreads = Math.max(0, spreadsAt(coming) + (event?.spread ?? 0));
  // Where the Echoes are massing, and whether the line holds there so far.
  const marked = c.echoMarks?.round === round;
  const marks = echoMarks(c).flatMap((m) => {
    const s = c.sectors.find((x) => x.id === m.sectorId);
    if (!s || s.owner === ECHOES.id) return [];
    const by = m.brokenBy ? [m.brokenBy] : holders(c, s, state.forces);
    return [{ s, by, status: m.brokenBy ? 'broken' : by.length ? 'held' : 'open' }];
  });
  const open = marks.filter((m) => m.status === 'open').map((m) => m.s.name);
  const breakers = c.factions.filter((f) => breaksLeft(c, f.id) > 0);
  const markNow = () => {
    let text = '';
    update((d) => {
      if (!d.campaign) return;
      const placed = placeEchoMarks(d.campaign);
      text = placed.map((m) => d.campaign!.sectors.find((s) => s.id === m.sectorId)?.name).join(', ');
      d.campaign.updatedAt = nowIso();
    });
    toast(text ? `The ${ECHOES.name} are massing at ${text}.` : `The ${ECHOES.name} have nowhere to mass.`);
  };

  const endNow = () => {
    // One fact per line: confirm() can't format more, but a list reads at a glance.
    const facts = [
      'Sector income is fixed (players claim it on their force page).',
      marked
        ? `The ${ECHOES.name} take ${open.length ? open.join(', ') : 'nothing (the line held everywhere)'}; their threat goes to ${coming}.`
        : `The ${ECHOES.name}' threat goes to ${coming}; they spread ${spreads} sector${spreads === 1 ? '' : 's'}${grace ? ' (into unclaimed space only)' : ''}.`,
      ...(breakers.length ? [`${breakers.map((f) => f.name).join(', ')} still ha${breakers.length === 1 ? 's' : 've'} a mark to break: it goes to their own marked sector.`] : []),
      ...(crisis && crisis.result !== 'won' && round >= crisisUntil(crisis) ? [`The Nexus Crisis wasn't won: the ${ECHOES.name} take each faction's sector nearest ${lordById(crisis.lord)?.name ?? 'the Lord'}.`] : []),
      ...(unspent ? [`${unspent} unspent Strategic Asset${unspent === 1 ? ' is' : 's are'} lost.`] : []),
      'Claimed space hulks drift off, new points of interest appear and a Galactic Event is rolled.',
      `Sectors rescale to ${range.min}–${range.max} Supply; AI-held sectors roll new modifiers.`,
    ];
    if (!confirmAction(`End round ${round}?\n\n${facts.map((f) => `• ${f}`).join('\n')}`)) return;
    end();
  };
  return (
    <Panel id="campaign.round" title={`Round ${round}`}
      extra={gm && <button className="primary" onClick={endNow} data-tip="When everyone has played this round">End round…</button>}>
      {gm && overdue && (
        <p className="small" style={{ margin: '0 0 0.5rem' }}>
          <span className="tag gold"><Icon name="g:hazard-sign" /> Round overdue</span> The last one ended {age} days ago. Rounds run about twice a week and never wait on table games:
          battles not played yet carry on as sieges, or lapse.
        </p>
      )}
      <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        {age !== undefined && <span className="tag" data-tip={`The GM ends a round about twice a week; after ${NEXUS_ROUNDS.overdueDays} days it's overdue`}>Round {round} began {age === 0 ? 'today' : age === 1 ? 'yesterday' : `${age} days ago`}</span>}
        <span className="tag red" data-tip={`Up ${NEXUS_ROUNDS.threatPerRound} each round, down ${NEXUS_ROUNDS.threatPerWin} per Battle won against them (${NEXUS_ROUNDS.threatPerVoidspawnWin} at a Voidspawn) and ${NEXUS_ROUNDS.threatPerPatrolWin} per patrol (a skirmish won against them)`}>
          <Icon name="g:biohazard" /> {ECHOES.name} threat {threat}/{NEXUS_ROUNDS.threatMax}
        </span>
        {marked
          ? <span className="muted">If the round ended now: threat {coming}{patrols ? ` (${patrols} patrol${patrols === 1 ? '' : 's'} won so far)` : ''}.</span>
          : <span className="muted">If the round ended now: threat {coming}, spreading {spreads} sector{spreads === 1 ? '' : 's'}{ahead.size ? ', most likely into the leader\'s space' : ''}{patrols ? ` (${patrols} patrol${patrols === 1 ? '' : 's'} won so far)` : ''}.</span>}
        {gm && !marked && (
          <button className="small" onClick={markNow} data-tip={`Show where the ${ECHOES.name} spread at round end, so players can hold the line`}><Icon name="g:hazard-sign" /> Mark their targets</button>
        )}
      </div>
      {marked && (
        <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}
          data-tip={`Each falls at round end unless its faction's detachment (anyone's, if unclaimed) stands there, or a faction that won a Battle against the ${ECHOES.name} this round breaks the mark`}>
          <span className="muted"><Icon name="g:hazard-sign" /> The {ECHOES.name} are massing:</span>
          {!marks.length && <span className="muted">nowhere this round.</span>}
          {marks.map(({ s, by, status }) => (
            <span key={s.id} className={`tag ${status === 'open' ? 'red' : 'green'}`}>
              {s.name}{s.owner ? ` (${factionName(c, s.owner)})` : ''}
              {status === 'held' ? ` · held by ${by.map((id) => factionName(c, id)).join(', ')}` : status === 'broken' ? ` · broken by ${factionName(c, by[0])}` : ' · falls'}
            </span>
          ))}
          {breakers.map((f) => (
            <span key={f.id} className="tag gold" data-tip={`Won a Battle against the ${ECHOES.name}: break a mark from its sector panel on the map`}>
              {f.name} can break {breaksLeft(c, f.id)}
            </span>
          ))}
        </div>
      )}
      <div className="row small" style={{ flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
        <span className="tag" data-tip={`From ${NEXUS_DIFFICULTY.min} up to the biggest faction's total Supply × ${NEXUS_DIFFICULTY.maxFactor}, × ${difficultyLevel(c).scale} for ${difficultyLevel(c).name} difficulty; rescaled when the round ends`}>
          Sector difficulty {range.min}–{range.max} Supply
        </span>
        {gm && <span className="muted">Difficulty, rescaling and zone battles: <b>Campaign settings</b>, below.</span>}
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
      <EventRow c={c} gm={gm} />
      {crisis && <CrisisRow c={c} />}
      {c.factions.length > 0 && (gm || viewer) && <AssetsRow c={c} only={gm ? undefined : viewer} />}
    </Panel>
  );
}

/**
 * The GM's rarely used campaign settings, folded away from the round: difficulty, rescaling sectors, opening zone
 * battles to everyone, and the guardians.
 */
export function CampaignSettingsPanel({ c }: { c: Campaign }) {
  const { state, update } = useStore();
  const range = difficultyRange(c, state.forces);
  const rated = c.sectors.some((s) => s.difficulty !== undefined);
  const change = (fn: (d: Campaign) => void) => update((s) => {
    if (!s.campaign) return;
    fn(s.campaign);
    s.campaign.updatedAt = nowIso();
  });
  const rescale = () => {
    if (rated && !confirmAction(`Rescale every sector to ${range.min}–${range.max} Supply? Sectors keep their modifiers; unrated ones roll theirs.`)) return;
    change((d) => void rateSectors(d, state.forces));
    toast(`Sectors rated ${range.min}–${range.max} Supply.`);
  };
  // A new difficulty level rescales the sectors straight away (if they're rated yet), so the map always matches it.
  const setDifficulty = (id: string) => {
    let text = '';
    change((d) => {
      d.difficulty = id;
      if (rated) {
        const r = rateSectors(d, state.forces);
        text = ` Sectors rescaled to ${r.min}–${r.max} Supply.`;
      }
    });
    toast(`Difficulty: ${DIFFICULTY_LEVELS.find((l) => l.id === id)?.name}.${text}`);
  };
  const guard = () => {
    let placed: Sector[] = [];
    change((d) => void (placed = placeGuardians(d, state.books, state.forces, Math.random, uid)));
    toast(placed.length
      ? `Guardians placed: ${placed.map((s) => s.name).join(', ')}.`
      : "No new guardians: every site has already rolled for one, or Void Echoes isn't imported.");
  };
  const reguard = () => {
    if (!confirmAction('Re-roll every guardian? Each AI-held site loses its guardian (and its relic) and rolls again.')) return;
    let placed: Sector[] = [];
    change((d) => void (placed = rerollGuardians(d, state.books, state.forces, Math.random, uid)));
    toast(placed.length ? `Guardians re-rolled: ${placed.map((s) => s.name).join(', ')}.` : 'Guardians re-rolled: none this time.');
  };
  return (
    <Panel id="campaign.settings" title="Campaign settings" collapsed>
      <div className="settings-list small">
        <div>
          <label className="row" style={{ gap: '0.35rem' }}>
            <b>Difficulty</b>
            <select value={difficultyLevel(c).id} onChange={(e) => setDifficulty(e.target.value)}>
              {DIFFICULTY_LEVELS.map((l) => <option key={l.id} value={l.id}>{l.name} (×{l.scale})</option>)}
            </select>
          </label>
          <p className="muted">Scales every sector rating; changing it rescales the sectors now.</p>
        </div>
        <div>
          <button onClick={rescale}>{rated ? 'Rescale sectors now' : 'Rate sectors'}</button>
          <p className="muted">Rates sectors {range.min}–{range.max} Supply against current faction Supply. Each round end does this too.</p>
        </div>
        <div>
          <label className="row" style={{ gap: '0.35rem' }}>
            <input type="checkbox" checked={!!c.zoneOpen} onChange={(e) => change((d) => void (d.zoneOpen = e.target.checked || undefined))} /> <b>Zone battles for everyone</b>
          </label>
          <p className="muted">Until then only you see zone battles, and players keep the old auto-battle.</p>
        </div>
        <div>
          <span className="row"><button onClick={guard}>Place guardians</button><button onClick={reguard}>Re-roll guardians</button></span>
          <p className="muted">Place rolls for a guardian at each AI-held planet, station, anomaly, void sector and Lost Archive that hasn't rolled yet (round end does this too). Re-roll removes every guardian and rolls each site again.</p>
        </div>
      </div>
    </Panel>
  );
}

/** This round's Galactic Event, which the GM can re-roll or pick by hand. */
function EventRow({ c, gm }: { c: Campaign; gm: boolean }) {
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
        <span className="tag gold"><Icon name="g:diamonds" /> Galactic Event: {event ? event.name : 'none'}</span>
        {gm && <><button className="small" onClick={() => change((d) => rollEvent(d))} data-tip="Roll a D12 on the Galactic Events table">{event ? 'Re-roll' : 'Roll a Galactic Event'}</button>
        <select value="" aria-label="Pick the Galactic Event" onChange={(e) => e.target.value && change((d) => setEvent(d, e.target.value))}>
          <option value="">Pick one…</option>
          {GALACTIC_EVENTS.map((x, i) => <option key={x.id} value={x.id}>{i + 1}. {x.name}</option>)}
        </select></>}
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
  const left = crisisUntil(crisis) - currentRound(c);
  return (
    <div className="small" style={{ marginTop: '0.5rem' }}>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
        <span className="tag red"><Icon name="g:crowned-skull" /> Nexus Crisis: {lord?.name ?? 'an Echo Lord'} at {at?.name ?? 'the Voidspawn'}</span>
        <span className={`tag${crisis.result === 'won' ? ' gold' : ''}`}>{crisis.result === 'won' ? 'Won'
          : left > 0 ? `Not beaten yet · ${left + 1} rounds left, this one too` : 'Last round to beat it'}</span>
        {!crisis.battleId && <a className="btn small" href={href.crisis()}>Start the Crisis battle</a>}
      </div>
      <p style={{ margin: '0.25rem 0 0' }}>
        {lord?.desc} All factions fight it together against the AI, by the end of round {crisisUntil(crisis)}; a lost battle can be fought again.
        Win: the threat drops {NEXUS_CRISIS.threatDrop}, each side claims +{NEXUS_CRISIS.winUs} US and the side whose units earned the most XP takes a {NEXUS_CRISIS.mvpTier} relic
        {crisis.mvp ? ` (MVP: ${state.forces.find((f) => f.id === crisis.mvp)?.name ?? 'a force not on this device'})` : ''}.
        {crisis.result !== 'won' && <> Still standing after round {crisisUntil(crisis)}: the threat goes to {NEXUS_ROUNDS.threatMax} and the {ECHOES.name} take {forfeits.length
          ? forfeits.map((x) => `${x.name} (${factionName(c, x.owner)})`).join(', ')
          : "each faction's sector nearest the Lord"}.</>}
      </p>
    </div>
  );
}

/** Each faction's Strategic Assets this round (one per skirmish or Weekly Siege won), and spending them on the Battle.
 *  Only one faction's, with only. Finished siege weeks are settled first. */
function AssetsRow({ c, only }: { c: Campaign; only?: string }) {
  const { state: { forces }, update } = useStore();
  useSiegeSettle(c);
  const change = (fn: (d: Campaign) => void) => update((s) => {
    if (!s.campaign) return;
    fn(s.campaign);
    s.campaign.updatedAt = nowIso();
  });
  // Only the factions with an asset this round (earned or spent): a row of "0 of 0" says nothing.
  const shown = c.factions.filter((f) => (!only || f.id === only) && (assetsOf(c, f.id).earned > 0 || assetsOf(c, f.id).spent.length > 0));
  return (
    <div className="small" style={{ marginTop: '0.5rem' }}>
      <span className="muted" data-tip={`One per skirmish won this round, and one per Weekly Siege won (Training), up to ${NEXUS_ROUNDS.assetsMax} in all. Spend them in the Battle; unspent ones are lost at round end.`}>
        Strategic Assets (1 per skirmish or Weekly Siege won, up to {NEXUS_ROUNDS.assetsMax}; lost if unspent at round end){shown.length ? ':' : `: ${only ? 'none' : 'nobody has one'} this round.`}
      </span>
      {shown.map((f) => {
        const a = assetsOf(c, f.id);
        return (
          <div key={f.id} className="row" style={{ flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
            <span className="tag" style={{ borderColor: factionColor(c, f.id) }}>{f.name}: {a.left} of {a.earned} left</span>
            {a.spent.map((u) => (
              <span key={u.id} className="tag gold" data-tip={STRATEGIC_ASSETS.find((x) => x.key === u.asset)?.desc}>
                {assetName(u.asset)}{u.forceId && `: ${forces.find((d) => d.id === u.forceId)?.name ?? 'a detachment'}`}
                <button className="ghost icon" aria-label={`Take back ${assetName(u.asset)}`} data-tip="Take back a mistaken spend"
                  onClick={() => change((d) => refundAsset(d, u.id))}><Icon name="l:x" /></button>
              </span>
            ))}
            {a.left > 0 && (
              <select value="" aria-label={`Spend a Strategic Asset for ${f.name}`}
                onChange={(e) => {
                  const [key, forceId] = e.target.value.split(':');
                  if (key) change((d) => void spendAsset(d, f.id, key, uid(), localDate(), forceId));
                }}>
                <option value="">Spend one…</option>
                {STRATEGIC_ASSETS.map((x) => x.key === 'forcedMarch' ? (
                  <optgroup key={x.key} label={`${x.name}: ${x.desc}`}>
                    {forces.filter((d) => d.nexus?.factionId === f.id).map((d) => (
                      <option key={d.id} value={`${x.key}:${d.id}`} title={x.desc}>{x.name}: {detachmentName(c, forces, d)}</option>
                    ))}
                  </optgroup>
                ) : <option key={x.key} value={x.key} title={x.desc}>{x.name}: {x.desc}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}
