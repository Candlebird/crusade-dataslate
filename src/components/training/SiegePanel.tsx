import type { Campaign, Force } from '../../model/types';
import { NEXUS_ROUNDS } from '../../rules/nexusData';
import { lastSiegeWin, siegeRanking } from '../../rules/training';

/** The Weekly Siege before a run: its rules, this week's board (or the force's own best outside a campaign), and the
 *  last week's winner. */
export function SiegePanel({ force, c, week }: { force: Force; c?: Campaign; week: string }) {
  const own = force.drill?.siege?.week === week ? force.drill.siege.best : 0;
  const rows = c ? siegeRanking(c.siegeBoard, week) : [];
  const win = lastSiegeWin(c);
  const faction = (id?: string) => (id && c?.factions.find((f) => f.id === id)?.name) || '';
  return (
    <div className="small training-nexus">
      <div><b>Weekly Siege</b> <span className="muted">· {week}</span></div>
      <p className="muted" style={{ margin: '2px 0 4px' }}>
        The same map, cover, drafts and waves for every force this week, the waves scaled by each force's points. Every luck
        level and boss card is open, with no Drill perks, nemesis or Nexus. Score: the wave reached. Try as often as you
        like; your best counts.{c ? ` When the week is over its top force wins its faction a Strategic Asset (within the ${NEXUS_ROUNDS.assetsMax} a round from skirmishes).` : ''}
      </p>
      {!c && (own ? <div>Your best this week: <b>wave {own}</b>.</div> : <div className="muted">No siege yet this week.</div>)}
      {c && (
        <div className="sortie-board">
          <div className="muted">Board for {week}</div>
          {!rows.length && <div className="muted">No sieges yet this week. Be the first.</div>}
          {rows.map((e, i) => (
            <div key={e.forceId} className={`row${e.forceId === force.id ? ' mine' : ''}`} style={{ gap: 6 }}>
              <span className="sortie-board-rank">{i + 1}</span>
              <span className="grow">{e.force} <span className="muted">({e.player}{faction(e.factionId) ? `, ${faction(e.factionId)}` : ''})</span></span>
              <span className="muted">{e.cleared} cleared</span>
              <b>wave {e.score}</b>
            </div>
          ))}
        </div>
      )}
      {win && (
        <div className="muted" style={{ marginTop: 4 }}>
          Last won: {win.week}, {win.force} at wave {win.score}{faction(win.factionId) ? ` (a Strategic Asset for ${faction(win.factionId)}, round ${win.round})` : ''}.
        </div>
      )}
    </div>
  );
}
