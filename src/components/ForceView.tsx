import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { exportForce, readImageAsDataUrl } from '../model/io';
import { uid } from '../model/factory';
import { battlePoints, forceTotals, levelForXp, pendingLevels, validateUnit } from '../rules/engine';
import { forceArmyUrl } from '../armyforge/book';
import { go, href } from '../route';
import AddUnitModal from './AddUnitModal';
import RequisitionShop from './RequisitionShop';
import UmbraShop from './UmbraShop';
import RoundIncome from './RoundIncome';
import ExpeditionModal from './ExpeditionModal';
import PatrolModal from './PatrolModal';
import UnitTaskModal from './UnitTaskModal';
import TrainingModal from './TrainingModal';
import SortieModal from './SortieModal';
import type { Campaign, Force } from '../model/types';
import { CATEGORIES, type Category } from '../rules/data';
import { SOLO_PATROL } from '../rules/downtimeData';
import { NEXUS_DETACHMENTS, SECTOR_TYPES, benefitOf, currentRound, emptyNexus, factionName, homeOf, ownedSectors, unitsUsed, unlockedTables } from '../rules/nexus';
import { factionClaimedRound, factionForces } from '../rules/detachments';
import { isReinforced, produce, produceCost, produceDiscount, productionSites } from '../rules/production';
import { hireBlock, hireHero, offerEnds, openOffers } from '../rules/heroes';
import { nowIso } from '../model/factory';
import { DetachmentsBox } from './Detachments';
import { claimableRounds } from '../rules/rounds';
import { TASK_NAMES, claimGarrisons, freeUnits, garrisonClaims, tasksOf } from '../rules/tasks';
import { GARRISON, SORTIE, TRAINING } from '../rules/downtimeData';
import { canTrain } from '../rules/training';
import { canSortie } from '../rules/sortie';
import { RESULT_LABEL, unitName } from '../rules/battle';
import { listTotals, newList } from '../rules/lists';
import { matchesTags, tagsIn, unitTags } from '../model/tags';
import { TagFilter, UnitTags } from './Tags';
import { Panel, Stepper, TextArea, TextField, XpBar, confirmAction, toast } from './ui';
import { EditModeButton, EditModeNotice, Fixed, useEditMode } from './editMode';
import { localDate } from '../model/date';
import { EmblemButton } from './Emblem';
import { defaultEmblem, emblemLayers } from '../model/emblem';
import { Icon } from './Icon';

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
  const { edit } = useEditMode(f);
  const theirs = !!f && !!cloud.email && !!f.owner && f.owner !== cloud.email;
  // A force without an emblem (an old save or an imported file) gets its default one, so it shows on the Nexus Map too.
  const needsEmblem = !!f && !theirs && !emblemLayers(f.emblem);
  useEffect(() => {
    if (needsEmblem) updateForce(forceId, (d) => void (d.emblem = defaultEmblem(forceId)));
  }, [needsEmblem, forceId, updateForce]);
  if (!f) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;

  const s = state.settings;
  const armyUrl = forceArmyUrl(f, state.books);
  const t = forceTotals(f, s);
  const set = (fn: Parameters<typeof updateForce>[1]) => updateForce(f.id, fn);
  const listed = f.units.filter((u) => showRemoved || u.status !== 'removed');
  const units = listed.filter((u) => matchesTags(unitTags(u, state.books), tagFilter));
  const removedCount = f.units.filter((u) => u.status === 'removed').length;
  const levelling = f.units.filter((u) => pendingLevels(u) > 0);

  const addLedger = (label: string, rp: number, supply: number) =>
    set((d) => void d.ledger.push({ id: uid(), date: localDate(), label, rp, supply }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><a href={href.forces()}>Forces</a> / Order of Battle</div>
          <h1 className="with-emblem">
            <EmblemButton emblem={f.emblem} fallback={defaultEmblem(f.id)} readOnly={theirs} title="Emblem"
              onChange={(e) => set((d) => void (d.emblem = e ?? defaultEmblem(f.id)))}>
              <p className="muted small" style={{ margin: 0 }}>
                {theirs ? `Only ${f.owner} can change this force's emblem.` : 'Stands for the force on the Nexus Map.'}
              </p>
            </EmblemButton>
            {f.name}
          </h1>
        </div>
        <div className="row">
          {armyUrl && <a className="btn" href={armyUrl} target="_blank" rel="noreferrer">Army Forge <Icon name="l:external-link" /></a>}
          <button onClick={() => exportForce(f)}>Export force file</button>
          {/* A Nexus Wars force raises its units at its planets (Production, in the Nexus Wars panel); adding one here skips the bank. */}
          {edit && <button onClick={() => setAdding(true)}>+ Add unit</button>}
          <button className="primary" onClick={() => go(href.battle(f.id))}><Icon name="g:crossed-swords" /> Record battle</button>
          {!theirs && <EditModeButton f={f} />}
        </div>
      </div>

      {!theirs && <EditModeNotice f={f} />}

      {theirs && (
        <div className="panel notice">
          This is <b>{f.owner}</b>'s force. You can look and print lists, but changes you make here are undone — only its owner can edit it.
        </div>
      )}

      {!theirs && levelling.length > 0 && (
        <div className="panel notice">
          <div className="panel-title">
            <h3><Icon name="g:upgrade" /> {levelling.length === 1 ? '1 unit needs' : `${levelling.length} units need`} to finish levelling up</h3>
          </div>
          {levelling.map((u) => {
            const n = pendingLevels(u);
            return (
              <div key={u.id} className="list-item">
                <span className="grow">
                  <b>{u.name || u.unitType}</b>{' '}
                  <span className="muted small">level {levelForXp(u.xp)} · {n} upgrade{n > 1 ? 's' : ''} to pick</span>
                </span>
                <a className="btn primary" href={href.unit(f.id, u.id)}>Level up</a>
              </div>
            );
          })}
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

          <Panel
            id="force.units"
            title="Order of Battle"
            extra={removedCount > 0 && (
              <label className="row small muted">
                <input type="checkbox" checked={showRemoved} onChange={(e) => setShowRemoved(e.target.checked)} />
                Show {removedCount} fallen
              </label>
            )}
          >
            <TagFilter tags={tagsIn(listed.map((u) => unitTags(u, state.books)))} value={tagFilter} onChange={setTagFilter} />
            {listed.length === 0 ? (
              <div className="empty">
                No units yet. {edit ? <button onClick={() => setAdding(true)}>+ Add the first one</button> : 'Produce them at your planets in the Nexus Wars panel.'}
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
                            {pendingLevels(u) > 0 && <span className="tag gold" title="Level-ups waiting to be picked"><Icon name="g:upgrade" /> Level up</span>}
                            {u.status === 'comatose' && <span className="tag cyan">Comatose</span>}
                            {u.status === 'removed' && <span className="tag red">Fallen</span>}
                            {u.scars.length > 0 && <span className="tag red">{u.scars.length} scar{u.scars.length > 1 ? 's' : ''}</span>}
                            {issues.length > 0 && <span className="tag gold" title={issues.map((i) => i.text).join('\n')}><Icon name="g:hazard-sign" /> {issues.length}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            id="force.lists"
            title="Battle lists"
            extra={
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
            }
          >
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
          </Panel>

          <Panel
            id="force.ledger"
            title="Requisition ledger"
            extra={
              <div className="row">
                <button className="primary" onClick={() => setShopping(true)}>Requisition…</button>
                {edit && <button onClick={() => addLedger('Battle reward', 1, 0)}>+1 RP</button>}
                <button
                  disabled={t.rp < 1}
                  onClick={() => addLedger('Increase Supply', -1, s.supplyPerRp)}
                  title={`Spend 1 RP for +${s.supplyPerRp} Supply`}
                >
                  Increase supply (−1 RP)
                </button>
                {edit && <button onClick={() => addLedger('Adjustment', 0, 0)}>+ Entry</button>}
              </div>
            }
          >
            {f.ledger.length === 0 ? (
              <p className="muted small">No entries. Starting Supply Limit is {f.startingSupply}.</p>
            ) : (
              <div className="table-wrap">
                <table className="stack">
                  <thead>
                    <tr><th>Date</th><th>Entry</th><th className="num">RP</th><th className="num">Supply</th><th className="num">US</th><th /></tr>
                  </thead>
                  <tbody>
                    {f.ledger.map((e, i) => edit ? (
                      <tr key={e.id}>
                        <td className="s-2" data-label="Date"><input type="date" value={e.date} onChange={(ev) => set((d) => void (d.ledger[i].date = ev.target.value))} /></td>
                        <td className="s-full" data-label="Entry"><TextField className="wide" value={e.label} onCommit={(v) => set((d) => void (d.ledger[i].label = v))} /></td>
                        <td className="num" data-label="RP"><input type="number" value={e.rp} onChange={(ev) => set((d) => void (d.ledger[i].rp = Number(ev.target.value) || 0))} /></td>
                        <td className="num" data-label="Supply"><input type="number" step={50} value={e.supply} onChange={(ev) => set((d) => void (d.ledger[i].supply = Number(ev.target.value) || 0))} /></td>
                        <td className="num small" data-label="US" title="Umbra Shards (history only — the balance is set in Force details)">{e.us ? (e.us > 0 ? `+${e.us}` : e.us) : ''}</td>
                        <td className="s-end"><button className="ghost icon" onClick={() => set((d) => void d.ledger.splice(i, 1))} aria-label="Delete entry"><Icon name="l:x" /></button></td>
                      </tr>
                    ) : (
                      <tr key={e.id}>
                        <td className="s-2 small muted" data-label="Date">{e.date}</td>
                        <td className="s-full" data-label="Entry">{e.label}</td>
                        <td className="num" data-label="RP">{e.rp}</td>
                        <td className="num" data-label="Supply">{e.supply}</td>
                        <td className="num small" data-label="US">{e.us ? (e.us > 0 ? `+${e.us}` : e.us) : ''}</td>
                        <td className="s-end" />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            id="force.log"
            title="Battle log"
            extra={<span className="muted small">{f.wins} win{f.wins === 1 ? '' : 's'} in {f.battles} battle{f.battles === 1 ? '' : 's'}</span>}
          >
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
          </Panel>
        </div>

        <div>
          <Panel id="force.details" title="Force details" h={3} collapsed lead={<ForceImage image={f.image} onChange={(img) => set((d) => void (d.image = img))} />}>
            <div className="fields" style={{ marginTop: '0.75rem' }}>
              <label className="field span-all">Name<TextField value={f.name} onCommit={(v) => set((d) => void (d.name = v))} /></label>
              <label className="field span-all">Faction<TextField value={f.faction} onCommit={(v) => set((d) => void (d.faction = v))} /></label>
              <label className="field span-all">
                Army Forge link
                <TextField value={f.armyLink ?? ''} placeholder={armyUrl ?? 'Paste the army or list link'} onCommit={(v) => set((d) => void (d.armyLink = v.trim() || undefined))} />
              </label>
              <label className="field span-all">Player<TextField value={f.player} onCommit={(v) => set((d) => void (d.player = v))} /></label>
              {edit ? (
                <>
                  <label className="field span-all">Starting supply<Stepper value={f.startingSupply} step={50} min={0} onChange={(n) => set((d) => void (d.startingSupply = n))} /></label>
                  <label className="field">Battles<Stepper value={f.battles} min={0} onChange={(n) => set((d) => void (d.battles = n))} /></label>
                  <label className="field">Wins<Stepper value={f.wins} min={0} onChange={(n) => set((d) => void (d.wins = n))} /></label>
                  <label className="field span-all">Umbra shards<Stepper value={f.umbraShards} min={0} onChange={(n) => set((d) => void (d.umbraShards = n))} /></label>
                </>
              ) : (
                <>
                  <label className="field span-all">Starting supply<Fixed>{f.startingSupply}</Fixed></label>
                  <label className="field">Battles<Fixed>{f.battles}</Fixed></label>
                  <label className="field">Wins<Fixed>{f.wins}</Fixed></label>
                  <label className="field span-all">Umbra shards<Fixed>{f.umbraShards}</Fixed></label>
                </>
              )}
              <label className="field span-all">Description / lore<TextArea rows={5} value={f.description} onCommit={(v) => set((d) => void (d.description = v))} /></label>
            </div>
          </Panel>
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

/** Producing new units at one of the faction's planets, paid from its bank (Nexus Wars). */
function ProductionBox({ f, c }: { f: Force; c: Campaign }) {
  const { state, update } = useStore();
  const sites = productionSites(c, f.nexus!.factionId);
  const [siteId, setSite] = useState('');
  const [adding, setAdding] = useState(false);
  const site = sites.find((x) => x.id === siteId) ?? sites[0];
  if (!sites.length) return null;
  const t = forceTotals(f, state.settings);
  const room = Math.max(0, t.supplyLimit - t.pointsUsed);
  const bank = site?.bank ?? 0;
  // A Foundry here makes every point cheaper: the bank stretches further (a Vehicle Bay's discount is checked on produce).
  const budget = Math.min(room, site ? Math.floor(bank / (1 - produceDiscount(site, { tough: 0 }))) : 0);
  return (
    <div className="span-all small">
      <div className="muted" title="Each planet banks Materials every round; spend them to raise units there. Barracks double it, Training Grounds give new units XP.">Production</div>
      <div className="row">
        <select value={site.id} onChange={(e) => setSite(e.target.value)} aria-label="Where to produce" style={{ minWidth: 0, flex: 1 }}>
          {sites.map((x) => <option key={x.id} value={x.id}>{x.name}: {x.bank ?? 0} Materials banked</option>)}
        </select>
        <button disabled={budget <= 0} onClick={() => setAdding(true)}
          title={bank <= 0 ? 'Nothing banked here yet: it banks more when the round ends' : room <= 0 ? 'No room under your Supply Limit' : `Up to ${budget} pts`}>
          Produce units…
        </button>
      </div>
      <div className="muted">Up to {budget} pts: {bank} Materials banked at {site.name}, {room} Supply free.</div>
      {adding && (
        <AddUnitModal
          budget={budget}
          onClose={() => setAdding(false)}
          onAdd={(newUnits) => {
            let ok = false;
            update((d) => {
              const x = d.campaign?.sectors.find((y) => y.id === site.id);
              const force = d.forces.find((y) => y.id === f.id);
              if (!x || !force || !produce(x, newUnits, force, d.campaign)) return;
              force.units.push(...newUnits);
              d.campaign!.updatedAt = nowIso();
              ok = true;
            });
            setAdding(false);
            const cost = produceCost(site, newUnits);
            toast(ok ? `Produced ${newUnits.length} unit(s) at ${site.name} for ${cost} Materials.` : `${site.name} has only ${bank} Materials banked; that costs ${cost}.`);
          }}
        />
      )}
    </div>
  );
}

/** Wandering heroes offering to join the faction for Umbra Shards (Nexus Wars). */
function HeroOffers({ f, c }: { f: Force; c: Campaign }) {
  const { update } = useStore();
  const offers = openOffers(c, f.nexus!.factionId);
  if (!offers.length) return null;
  return (
    <div className="span-all small">
      <div className="muted">Heroes for hire</div>
      {offers.map((o) => {
        const block = hireBlock(c, o, f);
        const relic = o.unit.relics[0];
        return (
          <div key={o.id} className="row" title={o.unit.rules.join(', ')}>
            <span className="grow">
              <Icon name="g:round-star" /> <b>{o.unit.unitType}</b> <span className="muted">— level {levelForXp(o.unit.xp)}, {o.unit.points} pts{relic ? <>, carrying <b>{relic.name}</b> ({relic.tier})</> : ''}. {o.fee} US; {offerEnds(o) > currentRound(c) ? 'leaves after next round' : 'leaves when this round ends'}.</span>
            </span>
            <button disabled={!!block} title={block ?? `Hire for ${o.fee} Umbra Shards; they join ${f.name} for good`} onClick={() => {
              if (!confirmAction(`Hire ${o.unit.unitType} into ${f.name} for ${o.fee} Umbra Shards?`)) return;
              let hired = false;
              update((d) => {
                const force = d.forces.find((y) => y.id === f.id);
                if (d.campaign && force && hireHero(d.campaign, o.id, force, localDate(), uid)) {
                  d.campaign.updatedAt = nowIso();
                  hired = true;
                }
              });
              toast(hired ? `${o.unit.unitType} joins ${f.name}.` : 'The hero could not be hired.');
            }}>Hire</button>
          </div>
        );
      })}
    </div>
  );
}

export function ForceImage({ image, onChange }: { image?: string; onChange: (img: string | undefined) => void }) {
  return (
    <div>
      {image ? <img className="portrait" src={image} alt="" /> : <div className="portrait portrait-empty"><Icon name="g:holy-symbol" /></div>}
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

/** Unit tasks this round (Mentoring, Projects, Recon, Garrison), and garrison XP to take. */
function UnitTasksRow({ f, c, onOpen }: { f: Force; c: Campaign; onOpen: () => void }) {
  const { update } = useStore();
  const tasks = tasksOf(f, c);
  const claims = garrisonClaims(c, f);
  const claim = () => {
    let summary = '';
    update((s) => {
      const d = s.forces.find((x) => x.id === f.id);
      if (!d || !s.campaign) return;
      summary = claimGarrisons(s.campaign, d, localDate(), uid);
      d.updatedAt = nowIso();
    });
    if (summary) toast(summary);
  };
  return (
    <>
      <div className="span-all row">
        <span className="grow small">
          <b>Unit tasks:</b> set a unit to Mentoring, a Project, Recon or Garrison. <span className="muted">It is busy all round and fights in no battle, the main Battle included.</span>
        </span>
        <button disabled={!freeUnits(f, c).length} onClick={onOpen}>Unit task…</button>
      </div>
      {Object.keys(tasks).length > 0 && (
        <div className="span-all small">
          <span className="muted">Busy this round: </span>
          {Object.entries(tasks).map(([id, t]) => {
            const u = f.units.find((x) => x.id === id);
            return u ? `${unitName(u)} (${TASK_NAMES[t]})` : null;
          }).filter(Boolean).join(', ')}
        </div>
      )}
      {claims.length > 0 && (
        <div className="span-all row">
          <span className="grow small"><b>Garrison XP:</b> Marauders came against {claims.map((x) => x.sector.name).join(', ')}. +{GARRISON.raidXp} XP to each unit that stood guard.</span>
          <button className="primary" onClick={claim}>Claim garrison XP</button>
        </div>
      )}
    </>
  );
}

function NexusPanel({ f, onShop }: { f: Force; onShop: () => void }) {
  const { state, updateForce } = useStore();
  const c = state.campaign;
  const set = (fn: Parameters<typeof updateForce>[1]) => updateForce(f.id, fn);
  const { edit } = useEditMode(f);
  const n = f.nexus;
  const faction = n && c?.factions.find((x) => x.id === n.factionId);
  const home = c && n ? homeOf(c, n.factionId) : undefined;
  const researchHome = home?.benefit === 'researchStation';
  const [claiming, setClaiming] = useState(false);
  const [expedition, setExpedition] = useState(false);
  const [patrol, setPatrol] = useState(false);
  const [tasking, setTasking] = useState(false);
  const [training, setTraining] = useState(false);
  const [sortie, setSortie] = useState(false);
  // As many Expeditions a round as there are free units: each unit takes part once a round.
  const expedited = !!c && !f.units.some((u) => u.status === 'active' && !unitsUsed(f, c).includes(u.id));
  const toClaim = c && n && faction ? claimableRounds(c, n, state.forces) : [];
  const claimedThrough = n && factionClaimedRound(state.forces, n.factionId);
  const patrolRow = (
    <div className="span-all row">
      <span className="grow small">
        {expedited
          ? <span className="muted">Every unit has already fought this round. They are free again when the GM ends the round.</span>
          : <><b>Solo patrol:</b> send up to {SOLO_PATROL.points} pts out to find a {SOLO_PATROL.enemyMin}–{SOLO_PATROL.enemyMax} pts enemy, then fight it or turn back.</>}
      </span>
      <button disabled={expedited || !f.units.some((u) => u.status === 'active')} onClick={() => setPatrol(true)}>Patrol…</button>
      {patrol && <PatrolModal force={f} onClose={() => setPatrol(false)} />}
    </div>
  );
  const trainingRow = (
    <div className="span-all row">
      <span className="grow small">
        <b>Training sim:</b> hold a base against endless waves with up to {TRAINING.squadMax} units for up to {TRAINING.xpCap} XP each. <span className="muted">Any time, as often as you like; no unit becomes busy.{f.trainingBest ? ` Best: ${f.trainingBest} waves.` : ''}</span>
      </span>
      <button disabled={!f.units.some(canTrain)} onClick={() => setTraining(true)}>Train…</button>
      {training && <TrainingModal force={f} onClose={() => setTraining(false)} />}
    </div>
  );
  const sortieRow = (
    <div className="span-all row">
      <span className="grow small">
        <b>Sortie:</b> a party of three sets out through Echo fights, camps and shrines to an Echo lord. Free runs earn up to {SORTIE.caps.free.short}–{SORTIE.caps.free.long} XP; a Shard run costs {SORTIE.cost} Umbra Shards, earns up to {SORTIE.caps.shard.long} XP and brings home Supply, RP and up to {SORTIE.haul.maxUs} shards. <span className="muted">{f.sortieBest ? `Furthest: ${f.sortieBest} nodes.` : ''}</span>
      </span>
      <button disabled={f.units.filter(canSortie).length < 3} onClick={() => setSortie(true)}>Sortie…</button>
      {sortie && <SortieModal force={f} c={c} onClose={() => setSortie(false)} />}
    </div>
  );

  return (
    <Panel id="force.nexus" title="Nexus Wars" h={3} className="nexus-box" extra={<button className="primary" onClick={onShop}>Spend Umbra Shards</button>}>
      {!c ? (
        <>
          <p className="muted small">No campaign loaded. <a href={href.campaign()}>Import or start one</a> to link this force to a faction.</p>
          {patrolRow}
          {trainingRow}
          {sortieRow}
        </>
      ) : (
        <div className="fields">
          <label className="field span-all">
            Campaign faction
            {!edit && faction ? <Fixed>{faction.name}</Fixed> : <select value={n?.factionId ?? ''} onChange={(e) => {
              const id = e.target.value;
              // Joining a faction that already has a force makes this one a detachment: its Supply comes from the others.
              const detachment = !!id && factionForces(state.forces, id).some((x) => x.id !== f.id);
              const zero = detachment && f.startingSupply !== NEXUS_DETACHMENTS.startingSupply;
              if (zero && !confirmAction(`${factionName(c, id)} already has a force, so ${f.name} becomes a detachment: its Starting Supply goes from ${f.startingSupply} to ${NEXUS_DETACHMENTS.startingSupply}. Give it Supply, shards and units by reorganising the faction's detachments. Link it?`)) return;
              set((d) => {
                if (!id) d.nexus = undefined;
                else if (d.nexus) d.nexus.factionId = id;
                else d.nexus = emptyNexus(id);
                if (zero) d.startingSupply = NEXUS_DETACHMENTS.startingSupply;
              });
            }}>
              <option value="">Not linked</option>
              {c.factions.map((x) => <option key={x.id} value={x.id}>{x.name}{x.player ? ` (${x.player})` : ''}</option>)}
            </select>}
          </label>
          {n && !faction && <p className="span-all small" style={{ color: 'var(--warn)', margin: 0 }}>This faction is not in the loaded campaign.</p>}
          {!(n && faction) && patrolRow}
          {!(n && faction) && trainingRow}
          {!(n && faction) && sortieRow}
          {n && faction && (
            <>
              <div className="span-all row">
                <span className="grow small">
                  {toClaim.length
                    ? <><b>Income ready</b> for {toClaim.length === 1 ? `round ${toClaim[0].round}` : `${toClaim.length} rounds`}.</>
                    : <span className="muted">Round income claimed{claimedThrough ? ` through round ${claimedThrough}` : ''}{factionForces(state.forces, n.factionId).length > 1 ? ' for the faction' : ''}. More arrives when the GM ends the round.</span>}
                </span>
                <button className={toClaim.length ? 'primary' : ''} disabled={!toClaim.length} onClick={() => setClaiming(true)}>Claim round income…</button>
              </div>
              {claiming && <RoundIncome force={f} c={c} onClose={() => setClaiming(false)} />}
              <div className="span-all row">
                <span className="grow small">
                  {expedited
                    ? <span className="muted">Every unit has already fought this round. They are free again when the GM ends the round.</span>
                    : <><b>Downtime:</b> send up to three units on an Expedition between games.</>}
                </span>
                <button disabled={expedited} onClick={() => setExpedition(true)}>Expedition…</button>
              </div>
              {expedition && <ExpeditionModal force={f} c={c} onClose={() => setExpedition(false)} />}
              <UnitTasksRow f={f} c={c} onOpen={() => setTasking(true)} />
              {tasking && <UnitTaskModal force={f} c={c} onClose={() => setTasking(false)} />}
              {patrolRow}
              {trainingRow}
              {sortieRow}
              <DetachmentsBox f={f} c={c} />
              <div className="span-all small">
                <div className="muted">Controlled sectors</div>
                {ownedSectors(c, n.factionId).map((s) => (
                  <div key={s.id} title={benefitOf(s)?.desc ?? SECTOR_TYPES[s.type].desc}>
                    <b>{s.name}</b> <span className="muted">— {benefitOf(s)?.name ?? SECTOR_TYPES[s.type].label}{isReinforced(s) ? ' · reinforced' : ''}{s.buildings?.length ? ` · ${s.buildings.length} building${s.buildings.length === 1 ? '' : 's'}` : ''}</span>
                  </div>
                ))}
              </div>
              <ProductionBox f={f} c={c} />
              <HeroOffers f={f} c={c} />
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
                {n.tempTables === 'all' || n.tempTables.length ? <span className="muted"> (temporary ones last until your next round income)</span> : null}
              </div>
              <label className="field span-all">
                Trait tokens
                {edit ? <Stepper value={n.traitTokens} min={0} onChange={(v) => set((d) => void (d.nexus!.traitTokens = v))} /> : <Fixed>{n.traitTokens}</Fixed>}
              </label>
              <div className="span-all small">
                <div className="muted">Pending for next match</div>
                {n.pending.length === 0 ? <span className="muted">Nothing.</span> : n.pending.map((p, i) => (
                  <div key={i} className="row">
                    <span className="grow">{p}</span>
                    {edit && <button className="ghost icon" aria-label="Remove" onClick={() => set((d) => void d.nexus!.pending.splice(i, 1))}><Icon name="l:x" /></button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
