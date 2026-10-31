import type { Campaign, Force, SiegeBoardEntry } from '../../model/types';
import { NEXUS_ROUNDS } from '../../rules/nexusData';
import { TRAINING } from '../../rules/downtimeData';
import { checkRanking, checkReward, checkWaves, hasChecks, lastSiegeWin, modeName, modeReward, rewardWords, scaleReward, SIEGE_BOSS, siegeRanking, type RunMode } from '../../rules/training';

/** A siege result in words: its damage, else the wave reached. */
const resultText = (r: { dmg?: number; score: number }) => (r.dmg !== undefined ? `${r.dmg.toLocaleString()} damage` : `wave ${r.score}`);

/** The Weekly Siege's rules for this week, in the mode picked: the checks (or the one Final), the boards, and the
 *  damage milestones. */
export function SiegeRules({ c, week, mode }: { c?: Campaign; week: string; mode?: RunMode }) {
  const checks = hasChecks(week);
  const waves = checkWaves(week);
  return checks ? (
    <>
      <p style={{ margin: '0 0 6px' }}>
        The same map, terrain, drafts and waves for every force this week, the waves scaled by each force's points. Every luck
        level and boss card is open, with no Drill perks, nemesis or Nexus. Try as often as you like.
      </p>
      <p style={{ margin: '0 0 6px' }}>
        Waves {waves.join(', ')} are damage checks: {SIEGE_BOSS} comes alone with {TRAINING.finale.siegeHp.toLocaleString()} wounds.
        At the earlier checks it walks off the map at the base, costing it nothing, and the siege goes on; wave {waves[waves.length - 1]} is
        the Final and the attempt ends when it reaches the base. Each check's damage counts on its own board, your best there from any attempt.
      </p>
      {c && (
        <p style={{ margin: '0 0 6px' }}>
          When the week is over each check's top force wins its rewards, more for each deeper check (Strategic Assets go to the
          faction, within the {NEXUS_ROUNDS.assetsMax} a round from skirmishes).
        </p>
      )}
      <p style={{ margin: '0 0 6px' }}>
        Hard and Insane have boards of their own{mode ? `; on ${modeName(mode)} the Umbra Shards and RP are ${modeReward(mode)} times` : ''}.
      </p>
      <div><b>Damage milestones</b> <span className="muted">· at the last check, paid once a week in each mode{mode ? ` (${modeName(mode)})` : ''}</span></div>
      <ul className="training-miles">
        {TRAINING.siege.milestones.map((m) => <li key={m.dmg}><b>{m.dmg.toLocaleString()}</b> <span className="muted">{rewardWords(scaleReward({ us: m.us, rp: m.rp }, mode))}</span></li>)}
      </ul>
    </>
  ) : (
    <p style={{ margin: 0 }}>
      The same map, terrain, drafts and waves for every force this week, the waves scaled by each force's points. Every luck
      level and boss card is open, with no Drill perks, nemesis or Nexus. Wave {TRAINING.finale.from} is the Final: {SIEGE_BOSS}{' '}
      alone, {TRAINING.finale.siegeHp.toLocaleString()} wounds, and the attempt ends when it reaches the base. Score: the damage
      dealt to it; a force that falls before it ranks below every damage score, by the wave reached. Try as often as you
      like; your best counts.{c ? ` When the week is over its top force wins its faction a Strategic Asset (within the ${NEXUS_ROUNDS.assetsMax} a round from skirmishes).` : ''}
    </p>
  );
}

/** The Weekly Siege's boards before a run: this week's (one for each damage check, in the mode picked), or the force's
 *  own best outside a campaign, and the last week's winner. */
export function SiegeBoards({ force, c, week, mode }: { force: Force; c?: Campaign; week: string; mode?: RunMode }) {
  // The force's own best (outside a campaign) is kept for Normal only.
  const mine = !mode && force.drill?.siege?.week === week ? force.drill.siege : undefined;
  const own = mine ? { score: mine.best, dmg: mine.dmg } : undefined;
  const rows = c ? siegeRanking(c.siegeBoard, week) : [];
  const win = lastSiegeWin(c);
  const faction = (id?: string) => (id && c?.factions.find((f) => f.id === id)?.name) || '';
  const checks = hasChecks(week);
  const waves = checkWaves(week);
  const winText = win?.tier
    ? `Last won: ${win.week}${win.mode ? ` (${modeName(win.mode)})` : ''}, the wave ${win.tier} check, ${win.force} with ${(win.dmg ?? 0).toLocaleString()} damage.`
    : win ? `Last won: ${win.week}, ${win.force} with ${resultText(win)}${faction(win.factionId) ? ` (a Strategic Asset for ${faction(win.factionId)}, round ${win.round})` : ''}.` : '';
  return (
    <div className="training-boards">
      {!c && !checks && (own ? <div>Your best this week: <b>{resultText(own)}</b>.</div> : <div className="muted">No siege yet this week.</div>)}
      {!c && checks && (mine?.checks?.length
        ? <div>Your best this week: {waves.map((w, i) => <span key={w}>{i > 0 && ' · '}wave {w} <b>{mine.checks![i] !== undefined ? mine.checks![i].toLocaleString() : '—'}</b></span>)}</div>
        : <div className="muted">No damage check reached yet this week.</div>)}
      {c && checks && waves.map((w, i) => (
        <CheckBoard key={w} rows={checkRanking(c.siegeBoard, week, i, mode)} i={i} wave={w} mode={mode} me={force.id} faction={faction} />
      ))}
      {c && !checks && (
        <div className="sortie-board">
          <div className="muted">Board for {week}</div>
          {!rows.length && <div className="muted">No sieges yet this week. Be the first.</div>}
          {rows.map((e, i) => (
            <div key={e.forceId} className={`row${e.forceId === force.id ? ' mine' : ''}`} style={{ gap: 6 }}>
              <span className="sortie-board-rank">{i + 1}</span>
              <span className="grow">{e.force} <span className="muted">({e.player}{faction(e.factionId) ? `, ${faction(e.factionId)}` : ''})</span></span>
              <span className="muted">{e.cleared} cleared</span>
              <b>{resultText(e)}</b>
            </div>
          ))}
        </div>
      )}
      {winText && <div className="muted">{winText}</div>}
    </div>
  );
}

/** One damage check's board: who did most to the colossus there, and what the week's winner of it gets. */
function CheckBoard({ rows, i, wave, mode, me, faction }: { rows: SiegeBoardEntry[]; i: number; wave: number; mode?: RunMode; me: string; faction: (id?: string) => string }) {
  return (
    <div className="sortie-board">
      <div className="row training-check-head" style={{ gap: 6 }}>
        <b className="grow">Check {i + 1}: wave {wave}</b>
        <span className="muted" data-tip="What this check's top force wins when the week is over">Winner: {rewardWords(checkReward(wave, mode))}</span>
      </div>
      {!rows.length && <div className="muted">Nobody has reached it yet this week.</div>}
      {rows.map((e, n) => (
        <div key={e.forceId} className={`row${e.forceId === me ? ' mine' : ''}`} style={{ gap: 6 }}>
          <span className="sortie-board-rank">{n + 1}</span>
          <span className="grow">{e.force} <span className="muted">({e.player}{faction(e.factionId) ? `, ${faction(e.factionId)}` : ''})</span></span>
          <b>{e.checks![i].toLocaleString()} damage</b>
        </div>
      ))}
    </div>
  );
}
