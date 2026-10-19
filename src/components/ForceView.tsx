import { useState } from 'react';
import { useStore } from '../model/store';
import { exportForce, readImageAsDataUrl } from '../model/io';
import { uid } from '../model/factory';
import { battlePoints, forceTotals, levelForXp, validateUnit } from '../rules/engine';
import { forceArmyUrl } from '../armyforge/book';
import { go, href } from '../route';
import AddUnitModal from './AddUnitModal';
import RequisitionShop from './RequisitionShop';
import { RESULT_LABEL } from '../rules/battle';
import { Stepper, TextArea, TextField, XpBar, toast } from './ui';

export default function ForceView({ forceId }: { forceId: string }) {
  const { state, update, updateForce } = useStore();
  const [adding, setAdding] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [shopping, setShopping] = useState(false);
  const f = state.forces.find((x) => x.id === forceId);
  if (!f) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;

  const s = state.settings;
  const armyUrl = forceArmyUrl(f, state.books);
  const t = forceTotals(f, s);
  const set = (fn: Parameters<typeof updateForce>[1]) => updateForce(f.id, fn);
  const units = f.units.filter((u) => showRemoved || u.status !== 'removed');
  const removedCount = f.units.filter((u) => u.status === 'removed').length;

  const addLedger = (label: string, rp: number, supply: number) =>
    set((d) => void d.ledger.push({ id: uid(), date: new Date().toISOString().slice(0, 10), label, rp, supply }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.forces()}>Forces</a> / Order of Battle</div>
          <h1>{f.name}</h1>
        </div>
        <div className="row">
          {armyUrl && <a className="btn" href={armyUrl} target="_blank" rel="noreferrer">Army Forge ↗</a>}
          <button onClick={() => exportForce(f)}>Export force file</button>
          <button onClick={() => setAdding(true)}>+ Add unit</button>
          <button className="primary" onClick={() => go(href.battle(f.id))}>⚔ Record battle</button>
        </div>
      </div>

      <div className="cols-main">
        <div>
          <div className="panel">
            <div className="stats" style={{ marginTop: 0 }}>
              <div className={`stat${t.pointsUsed > t.supplyLimit ? ' over' : ''}`}><b>{t.pointsUsed} / {t.supplyLimit}</b><span>Points / Supply limit</span></div>
              <div className="stat"><b>{t.activeUnits}</b><span>Units</span></div>
              <div className="stat"><b>{t.rp}</b><span>Requisition</span></div>
              <div className="stat"><b>{t.bp}</b><span>Battle points</span></div>
              <div className="stat"><b>{f.umbraShards}</b><span>Umbra shards</span></div>
            </div>
            {t.pointsUsed > t.supplyLimit && (
              <ul className="issues" style={{ marginTop: '0.75rem' }}>
                <li className="error">Order of Battle exceeds the Supply Limit by {t.pointsUsed - t.supplyLimit} pts.</li>
              </ul>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Order of Battle</h2>
              {removedCount > 0 && (
                <label className="row small muted">
                  <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                  Show {removedCount} fallen
                </label>
              )}
            </div>
            {units.length === 0 ? (
              <div className="empty">
                No units yet. <button onClick={() => setAdding(true)}>+ Add the first one</button>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Category</th>
                      <th style={{ minWidth: 110 }}>XP</th>
                      <th className="num">Lvl</th>
                      <th className="num">Pts</th>
                      <th className="num">BP</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const issues = validateUnit(u).filter((i) => i.level !== 'info');
                      return (
                        <tr key={u.id} className={`clickable ${u.status === 'removed' ? 'removed' : ''}`} onClick={() => go(href.unit(f.id, u.id))}>
                          <td>
                            <b>{u.name || u.unitType}</b>
                            {u.name && <div className="muted small">{u.unitType}</div>}
                          </td>
                          <td className="cat">{u.category}</td>
                          <td><XpBar xp={u.xp} mini /><span className="small muted">{u.xp} XP</span></td>
                          <td className="num">{levelForXp(u.xp)}</td>
                          <td className="num">{u.points}</td>
                          <td className="num">{battlePoints(u, s)}</td>
                          <td>
                            {u.status === 'comatose' && <span className="tag cyan">Comatose</span>}
                            {u.status === 'removed' && <span className="tag red">Fallen</span>}
                            {u.scars.length > 0 && <span className="tag red">{u.scars.length} scar{u.scars.length > 1 ? 's' : ''}</span>}
                            {issues.length > 0 && <span className="tag gold" title={issues.map((i) => i.text).join('\n')}>⚠ {issues.length}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Requisition ledger</h2>
              <div className="row">
                <button className="primary" onClick={() => setShopping(true)}>Requisition…</button>
                <button onClick={() => addLedger('Battle reward', 1, 0)}>+1 RP</button>
                <button
                  disabled={t.rp < 1}
                  onClick={() => addLedger('Increase Supply', -1, s.supplyPerRp)}
                  title={`Spend 1 RP for +${s.supplyPerRp} Supply`}
                >
                  Increase supply (−1 RP)
                </button>
                <button onClick={() => addLedger('Adjustment', 0, 0)}>+ Entry</button>
              </div>
            </div>
            {f.ledger.length === 0 ? (
              <p className="muted small">No entries. Starting Supply Limit is {f.startingSupply}.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Date</th><th>Entry</th><th className="num">RP</th><th className="num">Supply</th><th /></tr>
                  </thead>
                  <tbody>
                    {f.ledger.map((e, i) => (
                      <tr key={e.id}>
                        <td><input type="date" value={e.date} onChange={(ev) => set((d) => void (d.ledger[i].date = ev.target.value))} /></td>
                        <td><TextField className="wide" value={e.label} onCommit={(v) => set((d) => void (d.ledger[i].label = v))} /></td>
                        <td className="num"><input type="number" value={e.rp} onChange={(ev) => set((d) => void (d.ledger[i].rp = Number(ev.target.value) || 0))} /></td>
                        <td className="num"><input type="number" step={50} value={e.supply} onChange={(ev) => set((d) => void (d.ledger[i].supply = Number(ev.target.value) || 0))} /></td>
                        <td><button className="ghost icon" onClick={() => set((d) => void d.ledger.splice(i, 1))} aria-label="Delete entry">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Battle log</h2>
              <span className="muted small">{f.wins} win{f.wins === 1 ? '' : 's'} in {f.battles} battle{f.battles === 1 ? '' : 's'}</span>
            </div>
            {!f.battleLog?.length ? (
              <p className="muted small">No battles recorded yet. <a href={href.battle(f.id)}>Record one</a> after your next game.</p>
            ) : (
              [...f.battleLog].reverse().map((b) => (
                <details key={b.id} className="list-item" style={{ display: 'block' }}>
                  <summary className="row">
                    <span className={`tag ${b.result === 'win' ? 'green' : b.result === 'loss' ? 'red' : 'gold'}`}>{RESULT_LABEL[b.result]}</span>
                    <b>vs {b.opponent || 'unknown'}{b.vsAi ? ' (AI)' : ''}</b>
                    <span className="muted small">{b.date} · {b.myBp} vs {b.oppBp} BP{b.agendas.length ? ` · ${b.agendas.join(', ')}` : ''}</span>
                  </summary>
                  <ul className="small">{b.summary.map((line, i) => <li key={i}>{line}</li>)}</ul>
                  {b.notes && <p className="small muted">{b.notes}</p>}
                </details>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-title"><h3>Force details</h3></div>
            <ForceImage image={f.image} onChange={(img) => set((d) => void (d.image = img))} />
            <div className="fields" style={{ marginTop: '0.75rem' }}>
              <label className="field span-all">Name<TextField value={f.name} onCommit={(v) => set((d) => void (d.name = v))} /></label>
              <label className="field span-all">Faction<TextField value={f.faction} onCommit={(v) => set((d) => void (d.faction = v))} /></label>
              <label className="field span-all">
                Army Forge link
                <TextField value={f.armyLink ?? ''} placeholder={armyUrl ?? 'Paste the army or list link'} onCommit={(v) => set((d) => void (d.armyLink = v.trim() || undefined))} />
              </label>
              <label className="field span-all">Player<TextField value={f.player} onCommit={(v) => set((d) => void (d.player = v))} /></label>
              <label className="field span-all">Starting supply<Stepper value={f.startingSupply} step={50} min={0} onChange={(n) => set((d) => void (d.startingSupply = n))} /></label>
              <label className="field">Battles<Stepper value={f.battles} min={0} onChange={(n) => set((d) => void (d.battles = n))} /></label>
              <label className="field">Wins<Stepper value={f.wins} min={0} onChange={(n) => set((d) => void (d.wins = n))} /></label>
              <label className="field span-all">Umbra shards<Stepper value={f.umbraShards} min={0} onChange={(n) => set((d) => void (d.umbraShards = n))} /></label>
              <label className="field span-all">Description / lore<TextArea rows={5} value={f.description} onCommit={(v) => set((d) => void (d.description = v))} /></label>
            </div>
          </div>
          <div className="panel">
            <div className="panel-title"><h3>Danger zone</h3></div>
            <button
              className="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${f.name}" and all its units? Export it first if you want a copy.`)) return;
                update((d) => void (d.forces = d.forces.filter((x) => x.id !== f.id)));
                toast(`Deleted ${f.name}.`);
                go(href.forces());
              }}
            >
              Delete force
            </button>
          </div>
        </div>
      </div>

      {shopping && <RequisitionShop force={f} onClose={() => setShopping(false)} />}
      {adding && (
        <AddUnitModal
          onClose={() => setAdding(false)}
          onAdd={(newUnits) => {
            set((d) => void d.units.push(...newUnits));
            setAdding(false);
            toast(`Added ${newUnits.length} unit(s).`);
            if (newUnits.length === 1) go(href.unit(f.id, newUnits[0].id));
          }}
        />
      )}
    </>
  );
}

export function ForceImage({ image, onChange }: { image?: string; onChange: (img: string | undefined) => void }) {
  return (
    <div>
      {image ? <img className="portrait" src={image} alt="" /> : <div className="portrait portrait-empty">✠</div>}
      <div className="row" style={{ marginTop: '0.4rem' }}>
        <label className="btn" style={{ cursor: 'pointer' }}>
          {image ? 'Change picture' : 'Add picture'}
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onChange(await readImageAsDataUrl(file));
              e.target.value = '';
            }}
          />
        </label>
        {image && <button className="ghost" onClick={() => onChange(undefined)}>Remove</button>}
      </div>
    </div>
  );
}
