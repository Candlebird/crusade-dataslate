import { useMemo } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import type { Campaign } from '../model/types';
import { detachmentName } from '../rules/detachments';
import { currentRound } from '../rules/nexus';
import { foughtFor, myDetachments, revealOrders } from '../rules/orders';
import { factionStatus, gmTodos, roundTodos, type RoundTodo } from '../rules/roundStatus';
import { href } from '../route';
import { lockedIn, useSealedOrders } from './NexusOrders';
import { Panel } from './ui';
import { Glyph, Icon } from './Icon';

/** The to-do list itself: each line a link to where it's done, the ones lost at round end marked. */
function TodoList({ items }: { items: RoundTodo[] }) {
  return (
    <ul className="report todo-list">
      {items.map((t) => (
        <li key={t.key} className={t.urgent ? 'todo-urgent' : undefined}>
          <span className="report-icon" aria-hidden><Glyph g={t.icon} /></span>
          <a href={t.href}>{t.text}</a>
          {t.urgent && <span className="tag red small" data-tip="Lost, or goes against you, if it's still open when the round ends">Before round end</span>}
        </li>
      ))}
    </ul>
  );
}

/** A player's "This round": what their faction (me) could still do, the sealed orders first. */
export function ThisRound({ c, me }: { c: Campaign; me: string }) {
  const { state } = useStore();
  const cloud = useCloud();
  const { current, revealed, declared, orders } = useSealedOrders(c);
  const items = useMemo(() => {
    const out = roundTodos(c, state.forces, me);
    if (!current) return out;
    const mine = myDetachments(c, state.forces, cloud.email).filter((f) => f.nexus!.factionId === me);
    if (!revealed) {
      const { isDeclared } = lockedIn(c, state.forces, declared, current.round);
      const left = mine.filter((f) => !isDeclared(f));
      if (left.length)
        out.unshift({ key: 'orders', icon: '🔒', urgent: true, href: href.campaign('map'),
          text: `Declare sealed orders for ${left.map((f) => detachmentName(c, state.forces, f)).join(', ')} (Sealed orders, on the Map tab).` });
    } else {
      const round = currentRound(c);
      for (const a of revealOrders(c, orders, current.round, state.forces).attacks) {
        if (a.factionId !== me || foughtFor(c, a, round)) continue;
        const s = c.sectors.find((x) => x.id === a.sectorId);
        out.unshift({ key: `attack:${a.sectorId}:${a.forceId ?? ''}`, icon: '⚔', href: href.campaign('map', a.sectorId),
          text: `Your attack on ${s?.name ?? 'a sector'} is waiting to be fought (Sealed orders, on the Map tab).` });
      }
    }
    return out;
  }, [c, state.forces, me, current, revealed, declared, orders, cloud.email]);

  return (
    <Panel id="campaign.todo" title="This round" extra={items.length > 0 && <span className="muted small">{items.length} thing{items.length === 1 ? '' : 's'} to do</span>}>
      {items.length === 0
        ? <p className="muted small">Nothing is waiting on you. Send units out from your force page (patrols, expeditions, tasks, Training), or play a game.</p>
        : <TodoList items={items} />}
    </Panel>
  );
}

const JOURNAL: Record<string, string> = { none: '—', deal: 'Can take one', play: 'To play', offer: 'Pick an ending', done: 'Done' };

/** The GM's round at a glance: the steps still open, and where each faction stands. */
export function RoundChecklist({ c }: { c: Campaign }) {
  const { state } = useStore();
  const { online, current, revealed, declared } = useSealedOrders(c);
  const rows = useMemo(() => factionStatus(c, state.forces), [c, state.forces]);
  const steps = useMemo(() => gmTodos(c), [c]);
  const locks = current && !revealed ? lockedIn(c, state.forces, declared, current.round) : undefined;
  const ordersFor = (id: string) => {
    if (!online) return <span className="muted" data-tip="Sealed orders live in the cloud: sign in to see them">—</span>;
    if (!current) return <span className="muted">Not open</span>;
    if (revealed) return <span className="muted">Revealed</span>;
    const own = locks!.expected.filter((f) => f.nexus!.factionId === id);
    if (!own.length) return <span className="muted">—</span>;
    const done = own.filter(locks!.isDeclared).length;
    return <span className={`tag${done === own.length ? ' green' : ''}`}>{done === own.length ? <Icon name="l:check" /> : '…'} {done}/{own.length}</span>;
  };

  return (
    <Panel id="campaign.checklist" title="Round checklist"
      extra={<span className="muted small">{steps.length ? `${steps.length} step${steps.length === 1 ? '' : 's'} open` : 'Round steps done'}</span>}>
      {steps.length > 0 && <TodoList items={steps} />}
      {rows.length === 0 ? <p className="muted small">No factions yet: add them on the Map tab.</p> : (
        <div className="table-wrap">
          <table className="compact stack round-check">
            <thead><tr><th>Faction</th><th>Orders</th><th>Assets left</th><th>Echo marks</th><th>Journal</th><th>Warlord</th><th>Game night</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="s-full" data-label="Faction"><b>{r.name}</b>{r.player && <span className="muted"> · {r.player}</span>}</td>
                  <td data-label="Orders">{ordersFor(r.id)}</td>
                  <td data-label="Assets left">{r.assetsLeft ? <span className="tag gold">{r.assetsLeft}</span> : <span className="muted">0</span>}</td>
                  <td data-label="Echo marks">
                    {r.openMarks.length ? <span className="tag red" data-tip="Fall at round end unless a detachment stands there">{r.openMarks.join(', ')}</span> : <span className="muted">None open</span>}
                    {r.breaks > 0 && <span className="tag gold">Can break {r.breaks}</span>}
                  </td>
                  <td data-label="Journal">{r.journal === 'none' || r.journal === 'done' ? <span className="muted">{JOURNAL[r.journal]}</span> : <span className="tag">{JOURNAL[r.journal]}</span>}</td>
                  <td data-label="Warlord">{r.warlord ?? <span className="muted">None</span>}</td>
                  <td data-label="Game night">{c.gameNight?.round === currentRound(c) ? (r.coming ? <span className="tag green">Coming</span> : <span className="muted">Not yet</span>) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small" style={{ marginBottom: 0 }}>When everyone has played what they will this round, press <b>End round…</b> in the Round panel below.</p>
    </Panel>
  );
}
