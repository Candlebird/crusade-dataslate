import { useStore } from '../model/store';
import { newForce } from '../model/factory';
import { exportBackup } from '../model/io';
import { forceTotals } from '../rules/engine';
import { go, href } from '../route';
import { Dropzone } from './ui';
import { useImporter } from './importer';

export default function ForceList() {
  const { state, update } = useStore();
  const importFiles = useImporter();

  const create = () => {
    const f = newForce();
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

      {state.forces.length === 0 && <div className="panel empty">No forces yet. Create one, or drop a shared force file below.</div>}

      <div className="grid grid-cards">
        {state.forces.map((f) => {
          const t = forceTotals(f, state.settings);
          return (
            <a key={f.id} className="card" href={href.force(f.id)}>
              {f.image && <img src={f.image} alt="" style={{ width: '100%', height: 110, objectFit: 'cover', marginBottom: 8 }} />}
              <h3>{f.name}</h3>
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
          Drop a <b>.force.json</b> from a teammate, a <b>backup</b>, or an <b>Army Forge book</b> JSON here — or click to choose.
        </Dropzone>
      </div>
    </>
  );
}
