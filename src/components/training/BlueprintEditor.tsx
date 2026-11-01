import { useMemo, useState } from 'react';
import { useCloud } from '../../cloud/CloudSync';
import { nowIso, uid } from '../../model/factory';
import { useStore } from '../../model/store';
import {
  BLUEPRINT_KEEP, blueprintCode, mazeLength, myBlueprints, openLength, planRun, readBlueprintCode, spotProblem, toggleSpot,
  within, type Blueprint, type Tile,
} from '../../rules/training';
import { confirmAction, toast } from '../ui';
import { useBlueprintPick } from './blueprintPick';
import { MapView } from './MapView';

// The Blueprints tab of the Training start screen: draw a maze on the empty map, name it, pick the one that shows as a
// ghost in your runs, and pass it on with a share code.

const NO_PORTRAITS = {};

export function BlueprintEditor() {
  const { state, update } = useStore();
  const cloud = useCloud();
  const mine = myBlueprints(state.blueprints, cloud.email ?? undefined);
  const [pick, setPick] = useBlueprintPick();
  const [openId, setOpenId] = useState<string | null>(() => pick);
  const bp = mine.find((b) => b.id === openId) ?? mine.find((b) => b.id === pick) ?? mine[0];
  const [why, setWhy] = useState('');
  const [code, setCode] = useState('');

  const run = useMemo(() => planRun(bp?.spots ?? []), [bp?.spots]);
  const length = useMemo(() => (bp ? Math.round(mazeLength(bp.spots)) : 0), [bp?.spots]);
  const base = useMemo(() => Math.round(openLength()), []);

  const save = (id: string, change: (b: Blueprint) => void) =>
    update((d) => {
      const b = d.blueprints?.find((x) => x.id === id);
      if (!b) return;
      change(b);
      b.updatedAt = nowIso();
    });
  const add = (name: string, spots: Tile[] = []) => {
    if (mine.length >= BLUEPRINT_KEEP) {
      toast(`You can keep up to ${BLUEPRINT_KEEP} blueprints; delete one first.`, 'error');
      return null;
    }
    // The first one (or the first since none was picked) shows in runs.
    const b: Blueprint = { id: uid(), owner: cloud.email ?? '', name, updatedAt: nowIso(), spots, ...(pick ? {} : { inRuns: true }) };
    update((d) => { d.blueprints = [...(d.blueprints ?? []), b]; });
    setOpenId(b.id);
    setWhy('');
    return b;
  };
  const onCell = (cell: Tile, place: Tile) => {
    if (!bp) return;
    const r = toggleSpot(bp.spots, cell, place);
    setWhy(r.why ?? '');
    if (r.spots !== bp.spots) save(bp.id, (b) => { b.spots = r.spots; });
  };
  const importCode = () => {
    const got = readBlueprintCode(code);
    if (!got) {
      toast("That isn't a blueprint code (they start MB1:).", 'error');
      return;
    }
    if (!add(got.name, got.spots)) return;
    setCode('');
    toast(`Imported ${got.name}${got.dropped ? ` (${got.dropped} piece${got.dropped === 1 ? '' : 's'} that couldn't stand were left out)` : ''}.`);
  };
  const copy = async (b: Blueprint) => {
    const text = blueprintCode(b);
    try {
      await navigator.clipboard.writeText(text);
      toast('Blueprint code copied: paste it to another player.');
    } catch {
      setCode(text);
      toast('Copy it from the import box below.');
    }
  };
  const remove = (b: Blueprint) => {
    if (!confirmAction(`Delete the blueprint ${b.name}?`)) return;
    update((d) => { d.blueprints = (d.blueprints ?? []).filter((x) => x.id !== b.id); });
    if (pick === b.id) setPick(null);
    setOpenId(null);
  };

  return (
    <div className="training-blueprints">
      <div className="training-bp-side">
        <p className="muted" style={{ margin: 0 }}>
          Plan your maze on the empty map. The one marked <b>In runs</b> shows as a ghost in your Training runs and sieges,
          numbered in the order you drew it, so you know where each piece goes. The route never changes; only the cover
          does, and you can build on cover.
        </p>
        <div className="training-bp-list" role="list">
          {mine.map((b) => (
            <button key={b.id} role="listitem" className={b.id === bp?.id ? 'on' : ''} onClick={() => { setOpenId(b.id); setWhy(''); }}>
              {b.name}{b.id === pick && <span className="training-bp-tag">In runs</span>}
            </button>
          ))}
          <button className="primary" onClick={() => add(`Maze ${mine.length + 1}`)}>New blueprint</button>
        </div>
        {bp && (
          <div className="training-bp-edit">
            <label className="training-bp-name">
              <span className="muted">Name</span>
              <input key={bp.id} defaultValue={bp.name} maxLength={40} onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== bp.name) save(bp.id, (b) => { b.name = name; });
              }} />
            </label>
            <div>
              <b>{bp.spots.length}</b> piece{bp.spots.length === 1 ? '' : 's'} · route <b>{length}</b> cells
              <span className="muted"> ({length > base ? `+${length - base}` : 'no longer'} than the open map's {base})</span>
            </div>
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={pick === bp.id} onChange={(e) => setPick(e.target.checked ? bp.id : null)} />
              Show as the ghost in my runs
            </label>
            <div className="row training-bp-actions">
              <button disabled={!bp.spots.length} onClick={() => save(bp.id, (b) => { b.spots = b.spots.slice(0, -1); })}>Undo last</button>
              <button disabled={!bp.spots.length} onClick={() => confirmAction(`Clear every piece from ${bp.name}?`) && save(bp.id, (b) => { b.spots = []; })}>Clear</button>
              <button onClick={() => copy(bp)}>Copy share code</button>
              <button className="danger" onClick={() => remove(bp)}>Delete</button>
            </div>
            {!cloud.email && <div className="muted">Sign in to keep your blueprints on every device; until then they stay on this one.</div>}
          </div>
        )}
        <div className="training-bp-import">
          <input value={code} placeholder="Paste a blueprint code (MB1:…)" onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && importCode()} />
          <button disabled={!code.trim()} onClick={importCode}>Import</button>
        </div>
      </div>
      <div className="training-bp-map">
        {bp ? (
          <>
            <MapView
              run={run} portraits={NO_PORTRAITS} placing placeWhy={(x, y) => spotProblem(bp.spots, x, y)} onCell={onCell}
              blueprint={{ spots: bp.spots, plan: true }} tapNow={(c) => bp.spots.some((s) => within(s, c.x, c.y))}
            />
            <div className={`small training-bp-why${why ? ' bad' : ''}`} role="status">
              {why || 'Click or tap to plan a piece; click a planned piece to take it away.'}
            </div>
          </>
        ) : (
          <div className="training-bp-empty muted">Start a new blueprint, or import one from a code.</div>
        )}
      </div>
    </div>
  );
}
