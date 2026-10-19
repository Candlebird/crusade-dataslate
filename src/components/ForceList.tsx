import { useStore } from '../model/store';
import { newForce } from '../model/factory';
import { exportBackup } from '../model/io';
import { forceTotals } from '../rules/engine';
import { go, href } from '../route';
import { Dropzone } from './ui';
import { useImporter } from './importer';
import { useCloud } from '../cloud/CloudSync';

export default function ForceList() {
  const { state, update } = useStore();
  const importFiles = useImporter();
  const cloud = useCloud();
  const local = cloud.email ? state.forces.filter((f) => !f.owner) : [];
  const claim = (ids: string[]) =>
    update((d) => d.forces.forEach((f) => ids.includes(f.id) && (f.owner = cloud.email ?? undefined)));

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

      {local.length > 0 && (
        <div className="panel notice">
          <div className="panel-title">
            <h3>{local.length === 1 ? '1 force is' : `${local.length} forces are`} only on this device</h3>
            {local.length > 1 && <button className="primary" onClick={() => claim(local.map((f) => f.id))}>Upload all as mine</button>}
          </div>
          <p className="muted small">Upload your own forces so the other players can see them. Leave copies of other players' forces here.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {local.map((f) => (
              <button key={f.id} onClick={() => claim([f.id])}>Upload “{f.name}” as mine</button>
            ))}
          </div>
        </div>
      )}

      {state.forces.length === 0 && <div className="panel empty">No forces yet. Create one, or drop a shared force file below. New here? Follow the <a href={href.guide()}>getting started guide</a>.</div>}

      <div className="grid grid-cards">
        {state.forces.map((f) => {
          const t = forceTotals(f, state.settings);
          return (
            <a key={f.id} className="card" href={href.force(f.id)}>
              {f.image && <img src={f.image} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', marginBottom: 8 }} />}
              <h3>{f.name}</h3>
              {cloud.email && f.owner && f.owner !== cloud.email && <div className="tag">{f.owner.split('@')[0]}'s force</div>}
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
        })}
      </div>

      <div className="panel" style={{ marginTop: '1.5rem' }}>
        <div className="panel-title"><h3>Import</h3></div>
        <Dropzone accept=".json,application/json" onFiles={importFiles}>
          Drop a <b>.force.json</b> from a teammate, a <b>backup</b>, an <b>Army Forge list</b> (builds a force with full stats), or an <b>Army Forge book</b> JSON here — or click to choose.
        </Dropzone>
      </div>
    </>
  );
}
