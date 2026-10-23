import { useMemo, useState } from 'react';
import type { Campaign } from '../model/types';
import { chronicle, chronicleOf, type ChronicleEntry } from '../rules/chronicle';
import { factionColor } from '../rules/nexus';
import { href } from '../route';
import { Panel } from './ui';
import { Glyph } from './Icon';

/** The Campaign Chronicle: the war's history round by round, as the viewer knows it. An entry with a game or a sector jumps to it. */
export default function ChroniclePanel({ c, viewer, onJump }: { c: Campaign; viewer?: string; onJump: (e: ChronicleEntry) => void }) {
  const [only, setOnly] = useState<string>();
  const all = useMemo(() => chronicle(c, viewer), [c, viewer]);
  const rounds = chronicleOf(all, only);
  return (
    <Panel id="campaign.chronicle" title="Campaign Chronicle" extra={
      <div className="seg" role="group" aria-label="Show one faction">
        <button className={!only ? 'on' : ''} onClick={() => setOnly(undefined)}>All</button>
        {c.factions.map((f) => (
          <button key={f.id} className={only === f.id ? 'on' : ''} onClick={() => setOnly(only === f.id ? undefined : f.id)}>
            <span className="swatch" style={{ background: factionColor(c, f.id) }} /> {f.name}
          </button>
        ))}
      </div>
    }>
      {rounds.length === 0 && <p className="muted small">Nothing {viewer ? 'you know of ' : ''}has happened yet.</p>}
      {rounds.map((r) => (
        <div key={r.round}>
          <h3>Round {r.round}{r.date && <span className="muted small"> · {r.date}</span>}</h3>
          <ul className="report">
            {r.entries.map((e, i) => (
              <li key={i}>
                <span className="report-icon"><Glyph g={e.icon} /></span>
                {e.eventId || e.sectorId
                  ? <a href={e.eventId ? href.campaign('log', e.eventId) : href.campaign('map', e.sectorId)}
                      title={e.eventId ? 'Show the game in the log' : 'Show the sector on the map'}
                      onClick={(ev) => { ev.preventDefault(); onJump(e); }}>{e.text}</a>
                  : <span>{e.text}</span>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Panel>
  );
}
