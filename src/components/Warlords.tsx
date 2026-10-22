import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import type { Campaign, CampaignFaction } from '../model/types';
import { levelForXp } from '../rules/engine';
import { WARLORDS, type WarlordPathId } from '../rules/nexusData';
import { canRevive, chooseWarlord, loseWarlord, pathById, reviveWarlord, perksOf, syncWarlords, warlordBlock, warlordCandidates, warlordsStale } from '../rules/warlords';
import { Panel, confirmAction, toast } from './ui';

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
  if (!shown.length) return null;
  return (
    <Panel id="campaign.warlords" title="Warlords" collapsed lead={
      <div className="tech-head">
        {shown.map((f) => {
          const path = pathById(f.path);
          return (
            <span key={f.id} className="stat" title={path ? `${path.name}: ${path.desc}` : 'No Warlord named yet'}>
              <b>{f.warlord ? `${path?.icon ?? ''} ${f.warlord.name}` : '—'}</b>
              <span className="muted small">{shown.length > 1 ? `${f.name}: ` : ''}{f.warlord ? `level ${f.warlord.level}` : 'no Warlord'}</span>
            </span>
          );
        })}
      </div>
    }>
      <p className="muted small">
        Each faction names one Hero from its forces its Warlord and picks a Path for it, for the rest of the campaign. The Path's
        perks unlock as the Warlord reaches levels {WARLORDS.levels.join(', ')}. If the Warlord falls for good or its force leaves the
        faction, the perks go, and a new Warlord can be named {WARLORDS.replaceAfter} round{WARLORDS.replaceAfter === 1 ? '' : 's'} later (on the same Path).
      </p>
      {shown.map((f) => <FactionWarlord key={f.id} c={c} setC={setC} f={f} gm={gm} />)}
    </Panel>
  );
}

function FactionWarlord({ c, setC, f, gm }: { c: Campaign; setC: SetC; f: CampaignFaction; gm?: boolean }) {
  const { state } = useStore();
  const [pick, setPick] = useState('');
  const [pathPick, setPathPick] = useState<WarlordPathId | ''>('');
  const path = pathById(f.path);
  const unlocked = perksOf(f);
  const block = warlordBlock(c, f.id);
  const candidates = warlordCandidates(c, state.forces, f.id);
  const key = (forceId: string, unitId: string) => `${forceId}:${unitId}`;
  const chosen = candidates.find((x) => key(x.force.id, x.unit.id) === pick);

  const name = () => {
    if (!chosen) return;
    const p = f.path ? undefined : pathPick || undefined;
    if (!f.path && !p) return toast('Pick a Path for the Warlord.');
    if (!f.path && !confirmAction(`Make ${chosen.unit.name} ${f.name}'s Warlord on the Path of the ${pathById(p)!.name}? The Path is for good.`)) return;
    let ok = false;
    setC((d) => {
      // The store's copies of the force and unit, so chooseWarlord can check them.
      const force = state.forces.find((x) => x.id === chosen.force.id)!;
      ok = chooseWarlord(d, f.id, force, force.units.find((u) => u.id === chosen.unit.id)!, p);
    });
    toast(ok ? `${chosen.unit.name} is ${f.name}'s Warlord.` : warlordBlock(c, f.id) ?? 'Not named.');
    setPick('');
  };

  const stepDown = () => {
    if (!f.warlord || !confirmAction(`${f.warlord.name} stops being ${f.name}'s Warlord? Its perks go, and a new Warlord can be named ${WARLORDS.replaceAfter} round${WARLORDS.replaceAfter === 1 ? '' : 's'} from now.`)) return;
    setC((d) => loseWarlord(d, f.id));
  };

  const revive = () => {
    const who = f.fallenWarlord?.name;
    if (!confirmAction(who ? `Bring back ${who} as ${f.name}'s Warlord? (If it can't come back, the wait for a new one is lifted.)` : `Lift the wait so ${f.name} can name a Warlord now?`)) return;
    let name: string | undefined;
    setC((d) => void (name = reviveWarlord(d, f.id, state.forces)));
    toast(name ? `${name} is ${f.name}'s Warlord again.` : `${f.name} can name a Warlord now.`);
  };

  return (
    <div className="warlord">
      <h3>{f.name}{path && <span className="muted"> — {path.icon} Path of the {path.name}</span>}</h3>
      {f.warlord ? (
        <p>
          <b>{f.warlord.name}</b>, level {f.warlord.level}
          <span className="muted">{state.forces.find((x) => x.id === f.warlord!.forceId)?.name ? ` (${state.forces.find((x) => x.id === f.warlord!.forceId)!.name})` : ''}, Warlord since round {f.warlord.since}.</span>{' '}
          <button className="small" onClick={stepDown}>Step down</button>
        </p>
      ) : (
        <div className="row">
          {block ? <span className="muted">{block}</span> : candidates.length === 0 ? (
            <span className="muted">No Hero in {f.name}'s forces here: a Warlord must be a Hero.</span>
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
              <button className="primary" disabled={!chosen || (!f.path && !pathPick)} onClick={name}>Name Warlord</button>
            </>
          )}
          {gm && canRevive(f) && (
            <button className="small" onClick={revive} title="GM: undo the loss of this faction's Warlord">
              Revive{f.fallenWarlord ? ` ${f.fallenWarlord.name}` : ''}
            </button>
          )}
        </div>
      )}
      {(path ? [path] : WARLORDS.paths).map((p) => (
        <div key={p.id} className="small">
          {!path && <div><b>{p.icon} {p.name}</b> <span className="muted">— {p.desc}</span></div>}
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
