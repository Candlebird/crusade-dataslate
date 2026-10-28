import { useStore } from '../model/store';
import type { Force } from '../model/types';
import { newForce } from '../model/factory';
import { exportBackup } from '../model/io';
import { forceTotals, pendingLevels } from '../rules/engine';
import { go, href } from '../route';
import { Dropzone } from './ui';
import { useImporter } from './importer';
import { useCloud } from '../cloud/CloudSync';
import { EmblemBadge } from './Emblem';
import { forceEmblem } from '../model/emblem';
import SinceLastLooked from './SinceLastLooked';
import { Icon } from './Icon';

export default function ForceList() {
  const { state, update } = useStore();
  const importFiles = useImporter();
  const cloud = useCloud();
  const local = cloud.email ? state.forces.filter((f) => !f.owner) : [];
  const claim = (ids: string[]) =>
    update((d) => d.forces.forEach((f) => ids.includes(f.id) && (f.owner = cloud.email ?? undefined)));

  // Signed in, the player's own forces (and ones only on this device) come first; other players' follow, view only.
  const isTheirs = (f: Force) => !!cloud.email && !!f.owner && f.owner !== cloud.email;
  const mine = state.forces.filter((f) => !isTheirs(f));
  const theirs = state.forces.filter(isTheirs);

  const create = () => {
    const f = newForce();
    if (cloud.email) f.owner = cloud.email;
    update((d) => void d.forces.push(f));
    go(href.force(f.id));
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command</div>
          <h1>Forces</h1>
        </div>
        <div className="row">
          <button onClick={() => exportBackup(state)}>Export backup</button>
          <button className="primary" onClick={create}>+ New force</button>
        </div>
      </div>

      <SinceLastLooked />

      {local.length > 0 && (
        <div className="panel notice">
          <div className="panel-title">
            <h3>{local.length === 1 ? '1 force is' : `${local.length} forces are`} only on this device</h3>
            {local.length > 1 && <button className="primary" onClick={() => claim(local.map((f) => f.id))}>Upload all as mine</button>}
          </div>
          <p className="muted small">Upload your own forces so other players can see them. Don't upload copies of other players' forces.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {local.map((f) => (
              <button key={f.id} onClick={() => claim([f.id])}>Upload “{f.name}” as mine</button>
            ))}
          </div>
        </div>
      )}

      {state.forces.length === 0 && <div className="panel empty">No forces yet. Create one or drop a force file below. New here? See the <a href={href.guide()}>getting started guide</a>.</div>}

      {theirs.length > 0 && mine.length > 0 && <h2 className="force-group">Your forces</h2>}
      {mine.length > 0 && <div className="grid grid-cards">{mine.map((f) => <ForceCard key={f.id} f={f} />)}</div>}
      {theirs.length > 0 && (
        <>
          <h2 className="force-group">Other players' forces <span className="muted small">view only</span></h2>
          <div className="grid grid-cards">{theirs.map((f) => <ForceCard key={f.id} f={f} owner={f.owner} />)}</div>
        </>
      )}

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-title"><h3>Import</h3></div>
        <Dropzone accept=".json,application/json" onFiles={importFiles}>
          Drop a <b>.force.json</b>, a <b>backup</b>, an <b>Army Forge list</b> (builds a full force) or an <b>Army Forge book</b> JSON here, or click to choose.
        </Dropzone>
      </div>
    </>
  );
}

function ForceCard({ f, owner }: { f: Force; owner?: string }) {
  const { state } = useStore();
  const t = forceTotals(f, state.settings);
  const levelling = f.units.filter((u) => pendingLevels(u) > 0).length;
  return (
    <a className="card" href={href.force(f.id)}>
      {f.image && <img src={f.image} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', marginBottom: 8 }} />}
      <h3 className="with-emblem"><EmblemBadge emblem={forceEmblem(f)} size={28} />{f.name}</h3>
      {owner && <div className="tag">{owner.split('@')[0]}'s force</div>}
      {levelling > 0 && !owner && (
        <div className="tag gold"><Icon name="g:upgrade" /> {levelling} unit{levelling > 1 ? 's' : ''} to level up</div>
      )}
      <div className="sub">
        {f.faction || 'Unknown faction'}
        {f.player && <> · {f.player}</>}
      </div>
      <div className="stats">
        <div className={`stat${t.pointsUsed > t.supplyLimit ? ' over' : ''}`}>
          <b>{t.pointsUsed}</b>
          <span>/ {t.supplyLimit} pts</span>
        </div>
        <div className="stat"><b>{t.activeUnits}</b><span>Units</span></div>
        <div className="stat"><b>{t.rp}</b><span>RP</span></div>
        <div className="stat"><b>{t.bp}</b><span>BP</span></div>
        <div className="stat"><b>{f.wins}/{f.battles}</b><span>W / Battles</span></div>
      </div>
    </a>
  );
}
