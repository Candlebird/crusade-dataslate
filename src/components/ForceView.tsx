import { useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { exportForce, readImageAsDataUrl } from '../model/io';
import { uid } from '../model/factory';
import { battlePoints, forceTotals, levelForXp, validateUnit } from '../rules/engine';
import { forceArmyUrl } from '../armyforge/book';
import { go, href } from '../route';
import AddUnitModal from './AddUnitModal';
import RequisitionShop from './RequisitionShop';
import UmbraShop from './UmbraShop';
import type { Force } from '../model/types';
import { CATEGORIES, type Category } from '../rules/data';
import { SECTOR_TYPES, benefitOf, emptyNexus, homeOf, ownedSectors, unlockedTables } from '../rules/nexus';
import { RESULT_LABEL } from '../rules/battle';
import { listTotals, newList } from '../rules/lists';
import { matchesTags, tagsIn, unitTags } from '../model/tags';
import { TagFilter, UnitTags } from './Tags';
import { Stepper, TextArea, TextField, XpBar, toast } from './ui';

/** Hands the force to another player on the campaign, e.g. when you've been looking after their army. */
function TransferForce({ f }: { f: Force }) {
  const cloud = useCloud();
  const others = cloud.players.filter((e) => e !== cloud.email);
  const [picked, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  if (!others.length) return null;
  const to = others.includes(picked) ? picked : others[0];
  return (
    <div className="row" style={{ marginBottom: '0.75rem' }}>
      <select value={to} onChange={(e) => setTo(e.target.value)}>
        {others.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      <button
        disabled={busy || cloud.status !== 'synced'}
        onClick={async () => {
          if (!window.confirm(`Hand "${f.name}" over to ${to}? They become its owner and you can only look at it afterwards.`)) return;
          setBusy(true);
          try {
            await cloud.transfer(f.id, to);
            toast(`${f.name} now belongs to ${to}.`);
          } catch (err) {
            toast(`Couldn't hand it over: ${err instanceof Error ? err.message : String(err)}`, 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Transfer to player
      </button>
    </div>
  );
}

export default function ForceView({ forceId }: { forceId: string }) {
  const { state, update, updateForce } = useStore();
  const cloud = useCloud();
  const [adding, setAdding] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [shopping, setShopping] = useState(false);
  const [umbra, setUmbra] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const f = state.forces.find((x) => x.id === forceId);
  if (!f) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;

  const s = state.settings;
  const armyUrl = forceArmyUrl(f, state.books);
  const t = forceTotals(f, s);
  const set = (fn: Parameters<typeof updateForce>[1]) => updateForce(f.id, fn);
  const listed = f.units.filter((u) => showRemoved || u.status !== 'removed');
  const units = listed.filter((u) => matchesTags(unitTags(u, state.books), tagFilter));
  const removedCount = f.units.filter((u) => u.status === 'removed').length;
  const theirs = !!cloud.email && !!f.owner && f.owner !== cloud.email;

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

      {theirs && (
        <div className="panel notice">
          This is <b>{f.owner}</b>'s force. You can look and print lists, but changes you make here are undone — only its owner can edit it.
        </div>
      )}

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
            <TagFilter tags={tagsIn(listed.map((u) => unitTags(u, state.books)))} value={tagFilter} onChange={setTagFilter} />
            {listed.length === 0 ? (
              <div className="empty">
                No units yet. <button onClick={() => setAdding(true)}>+ Add the first one</button>
              </div>
            ) : units.length === 0 ? (
              <div className="empty">No units carry all of those tags.</div>
            ) : (
              <div className="table-wrap">
                <table className="stack">
                  <thead>
                    <tr>
                      <th>Unit</th>
                      <th>Category</th>
                      <th>Tags</th>
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
                          <td className="s-2">
                            <b>{u.name || u.unitType}</b>
                            {u.name && <div className="muted small">{u.unitType}</div>}
                          </td>
                          <td className="cat s-end">{u.category}</td>
                          <td className="s-full"><UnitTags unit={u} /></td>
                          <td className="s-full"><XpBar xp={u.xp} mini /><span className="small muted">{u.xp} XP</span></td>
                          <td className="num" data-label="Lvl">{levelForXp(u.xp)}</td>
                          <td className="num" data-label="Pts">{u.points}</td>
                          <td className="num" data-label="BP">{battlePoints(u, s)}</td>
                          <td className="s-full">
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
              <h2>Battle lists</h2>
              <button
                className="primary"
                onClick={() => {
                  const l = newList(f, uid());
                  set((d) => void (d.lists = [...(d.lists ?? []), l]));
                  go(href.list(f.id, l.id));
                }}
              >
                + New list
              </button>
            </div>
            {!f.lists?.length ? (
              <p className="muted small">Pick units for a game and print them with their stats, traits, relics and rules.</p>
            ) : (
              f.lists.map((l) => {
                const lt = listTotals(f, l, s);
                return (
                  <div key={l.id} className="list-item">
                    <a className="grow" href={href.list(f.id, l.id)}><b>{l.name}</b></a>
                    <span className={`small ${lt.points > l.pointsLimit ? 'tag red' : 'muted'}`}>{lt.points} / {l.pointsLimit} pts · {lt.units} units</span>
                  </div>
                );
              })
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
                <table className="stack">
                  <thead>
                    <tr><th>Date</th><th>Entry</th><th className="num">RP</th><th className="num">Supply</th><th className="num">US</th><th /></tr>
                  </thead>
                  <tbody>
                    {f.ledger.map((e, i) => (
                      <tr key={e.id}>
                        <td className="s-2" data-label="Date"><input type="date" value={e.date} onChange={(ev) => set((d) => void (d.ledger[i].date = ev.target.value))} /></td>
                        <td className="s-full" data-label="Entry"><TextField className="wide" value={e.label} onCommit={(v) => set((d) => void (d.ledger[i].label = v))} /></td>
                        <td className="num" data-label="RP"><input type="number" value={e.rp} onChange={(ev) => set((d) => void (d.ledger[i].rp = Number(ev.target.value) || 0))} /></td>
                        <td className="num" data-label="Supply"><input type="number" step={50} value={e.supply} onChange={(ev) => set((d) => void (d.ledger[i].supply = Number(ev.target.value) || 0))} /></td>
                        <td className="num small" data-label="US" title="Umbra Shards (history only — the balance is set in Force details)">{e.us ? (e.us > 0 ? `+${e.us}` : e.us) : ''}</td>
                        <td className="s-end"><button className="ghost icon" onClick={() => set((d) => void d.ledger.splice(i, 1))} aria-label="Delete entry">✕</button></td>
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
                    {b.sectorName && <span className="tag cyan">{b.sectorName}</span>}
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
          <NexusPanel f={f} onShop={() => setUmbra(true)} />
          {theirs ? null : <div className="panel">
            <div className="panel-title"><h3>Danger zone</h3></div>
            {cloud.email && f.owner === cloud.email && <TransferForce f={f} />}
            <button
              className="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${f.name}" and all its units${f.owner && cloud.email ? ' for every player' : ''}? Export it first if you want a copy.`)) return;
                update((d) => void (d.forces = d.forces.filter((x) => x.id !== f.id)));
                toast(`Deleted ${f.name}.`);
                go(href.forces());
              }}
            >
              Delete force
            </button>
          </div>}
        </div>
      </div>

      {umbra && <UmbraShop force={f} onClose={() => setUmbra(false)} />}
      {shopping && <RequisitionShop force={f} onClose={() => setShopping(false)} />}
      {adding && (
        <AddUnitModal
          budget={t.supplyLimit - t.pointsUsed}
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

function NexusPanel({ f, onShop }: { f: Force; onShop: () => void }) {
  const { state, updateForce } = useStore();
  const c = state.campaign;
  const set = (fn: Parameters<typeof updateForce>[1]) => updateForce(f.id, fn);
  const n = f.nexus;
  const faction = n && c?.factions.find((x) => x.id === n.factionId);
  const home = c && n ? homeOf(c, n.factionId) : undefined;
  const researchHome = home?.benefit === 'researchStation';

  return (
    <div className="panel">
      <div className="panel-title">
        <h3>Nexus Wars</h3>
        <button className="primary" onClick={onShop}>Umbra shards…</button>
      </div>
      {!c ? (
        <p className="muted small">No campaign loaded. <a href={href.campaign()}>Import or start one</a> to link this force to a faction.</p>
      ) : (
        <div className="fields">
          <label className="field span-all">
            Campaign faction
            <select value={n?.factionId ?? ''} onChange={(e) => set((d) => {
              const id = e.target.value;
              if (!id) d.nexus = undefined;
              else if (d.nexus) d.nexus.factionId = id;
              else d.nexus = emptyNexus(id);
            })}>
              <option value="">Not linked</option>
              {c.factions.map((x) => <option key={x.id} value={x.id}>{x.name}{x.player ? ` (${x.player})` : ''}</option>)}
            </select>
          </label>
          {n && !faction && <p className="span-all small" style={{ color: 'var(--warn)', margin: 0 }}>This faction is not in the loaded campaign.</p>}
          {n && faction && (
            <>
              <div className="span-all small">
                <div className="muted">Controlled sectors</div>
                {ownedSectors(c, n.factionId).map((s) => (
                  <div key={s.id} title={benefitOf(s)?.desc ?? SECTOR_TYPES[s.type].desc}>
                    <b>{s.name}</b> <span className="muted">— {benefitOf(s)?.name ?? SECTOR_TYPES[s.type].label}{s.reinforced ? ' · reinforced' : ''}</span>
                  </div>
                ))}
              </div>
              {researchHome && (
                <label className="field span-all">
                  Research Station: permanent table
                  <select value={n.permanentTables[0] ?? ''} onChange={(e) => set((d) => void (d.nexus!.permanentTables = e.target.value ? [e.target.value as Category] : []))}>
                    <option value="">— choose —</option>
                    {CATEGORIES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
              )}
              <div className="span-all small">
                <span className="muted">Unlocked Nexus tables: </span>
                {unlockedTables(n).length ? unlockedTables(n).join(', ') : 'none'}
                {n.tempTables === 'all' || n.tempTables.length ? <span className="muted"> (temporary ones expire next match)</span> : null}
              </div>
              <label className="field span-all">Trait tokens<Stepper value={n.traitTokens} min={0} onChange={(v) => set((d) => void (d.nexus!.traitTokens = v))} /></label>
              <div className="span-all small">
                <div className="muted">Pending for next match</div>
                {n.pending.length === 0 ? <span className="muted">Nothing.</span> : n.pending.map((p, i) => (
                  <div key={i} className="row">
                    <span className="grow">{p}</span>
                    <button className="ghost icon" aria-label="Remove" onClick={() => set((d) => void d.nexus!.pending.splice(i, 1))}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
