import { useEffect, useMemo, useState } from 'react';
import { useCloud } from '../cloud/CloudSync';
import { useStore } from '../model/store';
import { digest, loadSeen, saveSeen } from '../rules/digest';
import { Panel } from './ui';
import { Glyph } from './Icon';

const SHOWN = 8;

/** Since You Last Looked (the home page): the news you haven't marked seen, each a link to the thing itself. */
export default function SinceLastLooked() {
  const { state } = useStore();
  const cloud = useCloud();
  const c = state.campaign;
  const mine = useMemo(() => state.forces.filter((f) => (cloud.email ? f.owner === cloud.email : !f.owner)), [state.forces, cloud.email]);
  const me = mine.map((f) => f.nexus?.factionId).find((id) => id && c?.factions.some((x) => x.id === id));
  const items = useMemo(() => digest(c, mine, me), [c, mine, me]);
  const [seen, setSeen] = useState(loadSeen);
  const [all, setAll] = useState(false);

  // A first visit (once there is news, so a page still syncing doesn't count) starts with everything seen.
  useEffect(() => {
    if (seen || items.length === 0) return;
    const keys = items.map((i) => i.key);
    saveSeen(keys);
    setSeen(new Set(keys));
  }, [seen, items]);

  const fresh = seen ? items.filter((i) => !seen.has(i.key)) : [];
  if (fresh.length === 0) return null;
  const markSeen = () => {
    const keys = items.map((i) => i.key);
    saveSeen(keys);
    setSeen(new Set(keys));
  };
  return (
    <Panel id="home.digest" title="Since you last looked" extra={<button onClick={markSeen}>Mark all seen</button>}>
      <ul className="report">
        {(all ? fresh : fresh.slice(0, SHOWN)).map((i) => (
          <li key={i.key}><span className="report-icon"><Glyph g={i.icon} /></span><a href={i.href}>{i.text}</a></li>
        ))}
      </ul>
      {!all && fresh.length > SHOWN && <button className="ghost small" onClick={() => setAll(true)}>{fresh.length - SHOWN} more</button>}
    </Panel>
  );
}
