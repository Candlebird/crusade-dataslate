import { useStore } from '../model/store';
import { exportBackup } from '../model/io';
import { buildSeedState } from '../model/seed';
import { DEFAULT_SETTINGS, type Settings } from '../model/types';
import { Dropzone, Stepper, TextField, toast } from './ui';
import { useImporter } from './importer';

const BP_LABELS: [keyof Settings['bp'], string][] = [
  ['normal', 'Normal trait'],
  ['unique', 'Unique trait'],
  ['scar', 'Battle scar'],
  ['Common', 'Common relic'],
  ['Rare', 'Rare relic'],
  ['Legendary', 'Legendary relic'],
];

export default function SettingsPage() {
  const { state, update, replaceState } = useStore();
  const importFiles = useImporter();
  const s = state.settings;
  const set = (fn: (d: Settings) => void) => update((d) => fn(d.settings));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command</div>
          <h1>Settings</h1>
        </div>
      </div>

      <div className="cols-2">
        <div className="panel">
          <div className="panel-title">
            <h2>House rules</h2>
            <button className="ghost" onClick={() => set((d) => Object.assign(d, structuredClone(DEFAULT_SETTINGS), { armyForgeProxy: d.armyForgeProxy }))}>
              Reset to defaults
            </button>
          </div>
          <div className="fields">
            <label className="field span-all">
              Supply per Requisition Point
              <Stepper value={s.supplyPerRp} step={50} min={0} onChange={(n) => set((d) => void (d.supplyPerRp = n))} />
            </label>
            {BP_LABELS.map(([k, label]) => (
              <label key={k} className="field">
                {label} BP
                <Stepper value={s.bp[k]} onChange={(n) => set((d) => void (d.bp[k] = n))} />
              </label>
            ))}
          </div>
          <p className="muted small" style={{ marginTop: '0.75rem' }}>
            These apply to everyone viewing forces in this browser. Agree them as a group — force files don't carry settings.
          </p>
        </div>

        <div>
          <div className="panel">
            <div className="panel-title"><h2>Army Forge proxy</h2></div>
            <label className="field">
              Proxy URL (optional)
              <TextField value={s.armyForgeProxy} placeholder="https://your-worker.workers.dev" onCommit={(v) => set((d) => void (d.armyForgeProxy = v.trim()))} />
            </label>
            <p className="muted small">
              Army Forge doesn't allow other sites to fetch books directly. A small CORS proxy (e.g. a free Cloudflare Worker) enables one-click
              "Fetch directly" on the Army Books page. Leave blank to use the download-and-drop method.
            </p>
          </div>

          <div className="panel">
            <div className="panel-title"><h2>Data</h2></div>
            <p className="muted small">Everything is stored in this browser only. Export a backup regularly, especially before clearing browser data.</p>
            <div className="row" style={{ margin: '0.5rem 0 0.75rem' }}>
              <button className="primary" onClick={() => exportBackup(state)}>Export backup</button>
            </div>
            <Dropzone accept=".json,application/json" onFiles={importFiles}>
              Drop a <b>backup</b> file here to restore it.
            </Dropzone>
          </div>

          <div className="panel">
            <div className="panel-title"><h3>Danger zone</h3></div>
            <div className="row">
              <button
                className="danger"
                onClick={() => {
                  if (!window.confirm('Replace ALL data in this browser with the starter forces? Export a backup first if unsure.')) return;
                  replaceState(buildSeedState());
                  toast('Reset to the starter data.');
                }}
              >
                Reset to starter data
              </button>
              <button
                className="danger"
                onClick={() => {
                  if (!window.confirm('Delete ALL forces and books in this browser? Export a backup first if unsure.')) return;
                  replaceState({ version: 1, forces: [], books: [], settings: structuredClone(s) });
                  toast('All data cleared.');
                }}
              >
                Clear everything
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
