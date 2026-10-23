import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import { comingTonight, planNight, setComing, type NightTable, type TableKind } from '../rules/gameNight';
import { rng } from '../rules/hexmap';
import { currentRound, factionColor, factionName } from '../rules/nexus';
import { revealOrders } from '../rules/orders';
import { href } from '../route';
import { useSealedOrders } from './NexusOrders';
import { Panel } from './ui';

type SetC = (fn: (c: Campaign) => void) => void;

const KIND: Record<TableKind, string> = {
  pvp: 'Attack',
  standin: 'Attack (stand-in)',
  ai: 'Attack on an AI sector',
  guardian: 'Guardian fight',
  marauder: 'Marauder hunt',
  skirmish: 'Skirmish',
};

/**
 * The Game Night Planner: who's coming this round, and the evening's tables worked out from the revealed orders.
 * Players tick their own faction (`me`); the GM ticks anyone.
 */
export default function GameNightPanel({ c, setC, me, gm }: { c: Campaign; setC: SetC; me?: string; gm: boolean }) {
  const { state } = useStore();
  const { online, current, revealed, orders } = useSealedOrders(c);
  const round = currentRound(c);
  const coming = comingTonight(c);
  const attacks = current && revealed ? revealOrders(c, orders, current.round, state.forces).attacks : [];
  // Seeded by the round, so the missions don't change each time the page draws.
  const tables = planNight(c, state.forces, attacks, coming, rng(`${c.id}:night:${round}`));

  return (
    <div className="cols-2">
      <Panel id="campaign.night.coming" title={`Who's coming · round ${round}`} extra={<span className="muted small">{coming.length} of {c.factions.length}</span>}>
        {c.factions.map((f) => (
          <label key={f.id} className="list-item small" style={{ cursor: gm || f.id === me ? 'pointer' : undefined }}>
            <input type="checkbox" checked={coming.includes(f.id)} disabled={!gm && f.id !== me}
              onChange={(e) => setC((d) => setComing(d, f.id, e.target.checked))} />
            <span className="swatch" style={{ background: factionColor(c, f.id) }} />
            <span className="grow">{f.name}{f.player && <span className="muted"> · {f.player}</span>}</span>
          </label>
        ))}
        <p className="muted small">
          {!online ? 'Offline: the attacks from sealed orders appear once you are signed in.'
            : !current ? 'No sealed orders are open for this campaign: everyone coming plays marauders or skirmishes.'
            : !revealed ? 'Attacks appear once the GM reveals the orders; until then everyone is down for marauders or skirmishes.'
            : `${attacks.length} attack${attacks.length === 1 ? '' : 's'} revealed this round.`}
        </p>
      </Panel>
      <Panel id="campaign.night.tables" title="Tonight's tables" extra={<span className="muted small">{tables.length} table{tables.length === 1 ? '' : 's'}</span>}>
        {tables.length === 0 && <p className="muted small">Tick who's coming to see the tables.</p>}
        {tables.map((t, i) => <TableRow key={i} c={c} t={t} n={i + 1} />)}
      </Panel>
    </div>
  );
}

function TableRow({ c, t, n }: { c: Campaign; t: NightTable; n: number }) {
  const sector = c.sectors.find((s) => s.id === t.sectorId);
  const who = t.factions.map((id) => factionName(c, id)).join(' vs ');
  return (
    <div className="list-item small" style={{ alignItems: 'flex-start' }}>
      <span className="muted">#{n}</span>
      <span className="grow">
        <b>{KIND[t.kind]}</b>{sector && <> at <a href={href.campaign('map', sector.id)}>{sector.name}</a></>}: {who}{t.foe && <> vs <b>{t.foe}</b></>}
        <br />
        <span className="muted">{t.points} pts · <a href={href.missions()} title={t.mission.summary}>{t.mission.name}</a></span>
        {t.notes.map((x) => <div key={x} className="muted">· {x}</div>)}
      </span>
      {sector && t.kind !== 'marauder' && <a className="btn" href={href.tracker(sector.id, t.factions[0], t.forceId)}>Start</a>}
    </div>
  );
}
