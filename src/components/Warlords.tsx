import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import type { Campaign, CampaignFaction } from '../model/types';
import { levelForXp } from '../rules/engine';
import { WARLORDS, type WarlordPathId } from '../rules/nexusData';
import { canRevive, changePath, chooseWarlord, loseWarlord, pathById, reviveWarlord, perksOf, syncWarlords, warlordBlock, warlordCandidates, warlordsStale } from '../rules/warlords';
import { Panel, confirmAction, toast } from './ui';
import { Glyph } from './Icon';

type SetC = (fn: (c: Campaign) => void) => void;

/**
 * Warlords (Nexus Wars): each faction's chosen Hero, its Path and the perks it has unlocked. `faction` limits it to one
 * faction (a player's view); with none, the GM sees them all. Keeps each Warlord's level in step with its force. `gm`
 * shows the GM's Revive control.
 */
export default function WarlordsPanel({ c, setC, faction, gm }: { c: Campaign; setC: SetC; faction?: string; gm?: boolean }) {
  const { state } = useStore();
  const stale = warlordsStale(c, state.forces);
  useEffect(() => {
    if (stale) setC((d) => void syncWarlords(d, state.forces));
  }, [stale]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = c.factions.filter((f) => !faction || f.id === faction);
  if (!shown.length) return <div className="panel"><p className="muted">No factions yet. Add them on the Map tab, then name their Warlords here.</p></div>;
  return (
    <Panel id="campaign.warlords" title="Warlords" lead={
      <div className="tech-head">
        {shown.map((f) => {
          const path = pathById(f.path);
          return (
            <span key={f.id} className="stat" data-tip={path ? `${path.name}: ${path.desc}` : 'No Warlord named yet'}>
              <b>{f.warlord ? <><Glyph g={path?.icon} /> {f.warlord.name}</> : '—'}</b>
              <span className="muted small">{shown.length > 1 ? `${f.name}: ` : ''}{f.warlord ? `level ${f.warlord.level}` : 'no Warlord'}</span>
            </span>
          );
        })}
      </div>
    }>
      <p className="muted small">
        Each faction names one Hero from its forces as its Warlord and picks a Path: the Path's perks unlock at Warlord
        levels {WARLORDS.levels.join(', ')}. Changing Path puts the Warlord back to level 1. If the Warlord falls for good or its
        force leaves the faction, the perks go, and a new Warlord can be named {WARLORDS.replaceAfter} round{WARLORDS.replaceAfter === 1 ? '' : 's'} later (on the same Path).
      </p>
      {shown.map((f) => <FactionWarlord key={f.id} c={c} setC={setC} f={f} gm={gm} />)}
    </Panel>
  );
}

function FactionWarlord({ c, setC, f, gm }: { c: Campaign; setC: SetC; f: CampaignFaction; gm?: boolean }) {
  const { state } = useStore();
  const [pick, setPick] = useState('');
  const [pathPick, setPathPick] = useState<WarlordPathId | ''>('');
  const [newPath, setNewPath] = useState<WarlordPathId | ''>('');
  const path = pathById(f.path);
  // "Wolves'" rather than "Wolves's".
  const whose = f.name.endsWith('s') ? `${f.name}'` : `${f.name}'s`;
  const unlocked = perksOf(f);
  const block = warlordBlock(c, f.id);
  const candidates = warlordCandidates(c, state.forces, f.id);
  const key = (forceId: string, unitId: string) => `${forceId}:${unitId}`;
  const chosen = candidates.find((x) => key(x.force.id, x.unit.id) === pick);
  // The next perk the Warlord is working towards.
  const nextAt = path && f.warlord ? WARLORDS.levels.findIndex((l, i) => l > f.warlord!.level && !unlocked.includes(path.perks[i]?.id)) : -1;

  const name = () => {
    if (!chosen) return;
    const p = f.path ? undefined : pathPick || undefined;
    if (!f.path && !p) return toast('Pick a Path for the Warlord.');
    if (!f.path && !confirmAction(`Make ${chosen.unit.name} ${whose} Warlord on the Path of the ${pathById(p)!.name}? Changing Path later resets the Warlord to level 1.`)) return;
    let ok = false;
    setC((d) => {
      // The store's copies of the force and unit, so chooseWarlord can check them.
      const force = state.forces.find((x) => x.id === chosen.force.id)!;
      ok = chooseWarlord(d, f.id, force, force.units.find((u) => u.id === chosen.unit.id)!, p);
    });
    toast(ok ? `${chosen.unit.name} is ${whose} Warlord.` : warlordBlock(c, f.id) ?? 'Not named.');
    setPick('');
  };

  const stepDown = () => {
    if (!f.warlord || !confirmAction(`${f.warlord.name} stops being ${whose} Warlord? Its perks go; a new one can be named in ${WARLORDS.replaceAfter} round${WARLORDS.replaceAfter === 1 ? '' : 's'}.`)) return;
    setC((d) => loseWarlord(d, f.id));
  };

  const switchPath = () => {
    const p = pathById(newPath);
    if (!f.warlord || !p || !confirmAction(`Change ${whose} Path to the ${p.name}? ${f.warlord.name} restarts at Warlord level 1 (its own XP and level stay) and levels up with XP gained from now on.`)) return;
    let ok = false;
    setC((d) => void (ok = changePath(d, f.id, p.id, state.forces)));
    toast(ok ? `${f.name} follows the Path of the ${p.name}.` : `Can't change Path: ${f.warlord.name}'s force isn't on this device.`);
    setNewPath('');
  };

  const revive = () => {
    const who = f.fallenWarlord?.name;
    if (!confirmAction(who ? `Bring back ${who} as ${whose} Warlord? (If it can't, the wait for a new one is lifted.)` : `Lift the wait so ${f.name} can name a Warlord now?`)) return;
    let name: string | undefined;
    setC((d) => void (name = reviveWarlord(d, f.id, state.forces)));
    toast(name ? `${name} is ${whose} Warlord again.` : `${f.name} can name a Warlord now.`);
  };

  return (
    <div className="warlord">
      <h3>{f.name}{path && <span className="muted"> — <Glyph g={path.icon} /> Path of the {path.name}</span>}</h3>
      {f.warlord ? (
        <p>
          <b>{f.warlord.name}</b>, level {f.warlord.level}
          <span className="muted">{state.forces.find((x) => x.id === f.warlord!.forceId)?.name ? ` (${state.forces.find((x) => x.id === f.warlord!.forceId)!.name})` : ''}, Warlord since round {f.warlord.since}.</span>{' '}
          {nextAt >= 0 && path!.perks[nextAt] && <span className="muted small">Next perk: <b>{path!.perks[nextAt].name}</b> at level {WARLORDS.levels[nextAt]}.</span>}{' '}
          <button className="small" onClick={stepDown}>Step down</button>
          <span className="row">
            <select value={newPath} onChange={(e) => setNewPath(e.target.value as WarlordPathId)} aria-label="New Path">
              <option value="">Change Path…</option>
              {WARLORDS.paths.filter((p) => p.id !== f.path).map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
            </select>
            <button className="small" disabled={!newPath} onClick={switchPath} data-tip={newPath ? 'The Warlord starts back at level 1' : 'Pick the new Path first'}>Change Path</button>
          </span>
        </p>
      ) : (
        <div className="row">
          {block ? <span className="muted">{block}</span> : candidates.length === 0 ? (
            <span className="muted">No Hero in {whose} forces here: a Warlord must be a Hero.</span>
          ) : (
            <>
              <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Warlord">
                <option value="">Name a Warlord…</option>
                {candidates.map((x) => (
                  <option key={key(x.force.id, x.unit.id)} value={key(x.force.id, x.unit.id)}>
                    {x.unit.name} (level {levelForXp(x.unit.xp)}, {x.force.name})
                  </option>
                ))}
              </select>
              {!f.path && (
                <select value={pathPick} onChange={(e) => setPathPick(e.target.value as WarlordPathId)} aria-label="Path">
                  <option value="">Path…</option>
                  {WARLORDS.paths.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
                </select>
              )}
              <button className="primary" disabled={!chosen || (!f.path && !pathPick)} onClick={name}
                data-tip={!chosen ? 'Pick a Hero first' : !f.path && !pathPick ? 'Pick a Path first: its perks are listed below' : undefined}>Name Warlord</button>
            </>
          )}
          {gm && canRevive(f) && (
            <button className="small" onClick={revive} data-tip="GM: undo the loss of this faction's Warlord">
              Revive{f.fallenWarlord ? ` ${f.fallenWarlord.name}` : ''}
            </button>
          )}
        </div>
      )}
      {(path ? [path] : WARLORDS.paths).map((p) => (
        <div key={p.id} className="small">
          {!path && <div><b><Glyph g={p.icon} /> {p.name}</b> <span className="muted">— {p.desc}</span></div>}
          <ul>
            {p.perks.map((k, i) => (
              <li key={k.id} className={path && !unlocked.includes(k.id) ? 'muted' : undefined}>
                <span className={`tag${unlocked.includes(k.id) ? ' green' : ''}`}>L{WARLORDS.levels[i]}</span> <b>{k.name}</b>: {k.desc}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
