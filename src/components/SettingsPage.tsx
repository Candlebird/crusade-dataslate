import { useStore } from '../model/store';
import { exportBackup } from '../model/io';
import { buildSeedState } from '../model/seed';
import { DEFAULT_SETTINGS, type Settings } from '../model/types';
import { Dropzone, Stepper, TextField, toast } from './ui';
import { useImporter } from './importer';
import { useCloud } from '../cloud/CloudSync';
import { DEFAULT_PROXY } from '../armyforge/book';

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
  const cloud = useCloud();
  const locked = !!cloud.email && !cloud.isGm;
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
            <button className="ghost" disabled={locked} onClick={() => set((d) => Object.assign(d, structuredClone(DEFAULT_SETTINGS), { armyForgeProxy: d.armyForgeProxy }))}>
              Reset to defaults
            </button>
          </div>
          <fieldset className="fields" disabled={locked}>
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
          </fieldset>
          <p className="muted small" style={{ marginTop: '0.75rem' }}>
            {locked
              ? 'Set by the GM for everyone in the campaign.'
              : cloud.isGm
                ? 'You are the GM: these apply to every player in the campaign.'
                : "These apply to everyone viewing forces in this browser. Sign in to use the GM's house rules."}
          </p>
        </div>

        <div>
          <div className="panel">
            <div className="panel-title"><h2>Army Forge proxy</h2></div>
            <label className="field">
              Proxy URL (optional)
              <TextField value={s.armyForgeProxy} placeholder={DEFAULT_PROXY || "https://your-worker.workers.dev"} onCommit={(v) => set((d) => void (d.armyForgeProxy = v.trim()))} />
            </label>
            <p className="muted small">
              Army Forge doesn't let other sites fetch its books, so the app fetches them through a small proxy (proxy/worker.js, a free
              Cloudflare Worker). {DEFAULT_PROXY ? 'The group proxy is built in; set a URL here only to use a different one.' : 'Paste its URL here.'}
            </p>
          </div>

          <div className="panel">
            <div className="panel-title"><h2>Data</h2></div>
            <p className="muted small">
              {cloud.email
                ? 'Your data is kept in this browser and in the campaign database. Export a backup now and then anyway.'
                : 'Everything is stored in this browser only. Export a backup regularly, especially before clearing browser data.'}
            </p>
            <div className="row" style={{ margin: '0.5rem 0 0.75rem' }}>
              <button className="primary" onClick={() => exportBackup(state)}>Export backup</button>
            </div>
            <Dropzone accept=".json,application/json" onFiles={importFiles}>
              Drop a <b>backup</b> file here to restore it.
            </Dropzone>
          </div>

          <div className="panel">
            <div className="panel-title"><h3>Danger zone</h3></div>
            {cloud.email && (
              <p className="muted small">Sign out first: while you're signed in, these would also delete your forces and the shared books for every player.</p>
            )}
            <div className="row">
              <button
                className="danger"
                disabled={!!cloud.email}
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
                disabled={!!cloud.email}
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
