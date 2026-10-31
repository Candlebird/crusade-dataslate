import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { useCloud } from '../cloud/CloudSync';
import { exportForce, readImageAsDataUrl } from '../model/io';
import { uid } from '../model/factory';
import { battlePoints, forceTotals, levelForXp, pendingLevels, relicBearer, validateUnit, xpShown } from '../rules/engine';
import { carryProblem, equipRelic, sendRelic, vaultOf } from '../rules/relicVault';
import { forceArmyUrl } from '../armyforge/book';
import { go, href } from '../route';
import AddUnitModal from './AddUnitModal';
import RequisitionShop from './RequisitionShop';
import UmbraShop from './UmbraShop';
import RoundIncome, { ClaimAll } from './RoundIncome';
import DowntimePanel from './DowntimePanel';
import ZoneFight, { useZoneBattles, useZoneSave } from './ZoneFight';
import { practiceBattle, practiceId } from '../rules/zone/practice';
import type { TrackedBattle } from '../rules/tracker';
import { LEDGER_RECENT, LedgerTable } from './Ledger';
import type { Campaign, Force } from '../model/types';
import { CATEGORIES, type Category } from '../rules/data';
import { NEXUS_DETACHMENTS, SECTOR_TYPES, benefitOf, currentRound, unitsUsed, emptyNexus, factionName, homeOf, ownedSectors, unlockedTables } from '../rules/nexus';
import { factionClaimedRound, factionForces } from '../rules/detachments';
import { isReinforced, produce, produceCost, produceDiscount, productionSites } from '../rules/production';
import { hireBlock, hireHero, offerEnds, openOffers } from '../rules/heroes';
import { nowIso } from '../model/factory';
import { DetachmentsBox } from './Detachments';
import { claimableRounds } from '../rules/rounds';
import { RESULT_LABEL, unitName } from '../rules/battle';
import { listTotals, newList } from '../rules/lists';
import { matchesTags, tagsIn, unitTags } from '../model/tags';
import { TagFilter, UnitTags, WornTag } from './Tags';
import { Panel, Stepper, TextArea, TextField, XpBar, confirmAction, toast, umbraShards } from './ui';
import { EditModeButton, EditModeNotice, Fixed, isTheirs, useEditMode } from './editMode';
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
          if (!window.confirm(`Hand "${f.name}" over to ${to}? They become its owner and you can only view it.`)) return;
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
  const [claiming, setClaiming] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [practice, setPractice] = useState<TrackedBattle | null>(null);
  const zoneOn = useZoneBattles();
  const practiceSave = useZoneSave(practiceId(forceId));
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
  // Round income waiting for this force's faction: shown at the top, so it isn't missed at the bottom of the page.
  const c = state.campaign;
  const n = f.nexus;
  const inCampaign = !!c && !!n && c.factions.some((x) => x.id === n.factionId);
  // Units that already fought this round (patrol, Expedition, task): they fight Battle-Worn until the round ends.
  const worn = new Set(unitsUsed(f, c));
  const wornActive = f.units.filter((u) => u.status === 'active' && worn.has(u.id)).length;
  const toClaim = !theirs && c && n && inCampaign ? claimableRounds(c, n, state.forces) : [];

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
          {/* A Nexus Wars force raises its units at its planets (Production, in the Nexus Wars panel); adding one here skips the bank. */}
          {edit && <button onClick={() => setAdding(true)}>+ Add unit</button>}
          {zoneOn && !theirs && (
            <button disabled={!f.units.some((u) => u.status === 'active')} onClick={() => setPractice(practiceBattle(f, state.books, s, state.campaign))}
              data-tip={`A zone battle against Void Echoes of about the same points. Nothing is lost and nothing is earned${wornActive ? `
${wornActive} unit${wornActive === 1 ? '' : 's'} will fight Battle-Worn (-1 Quality and -1 Defense)` : ''}`}>
              <Icon name="g:archery-target" /> {practiceSave ? 'Resume practice' : 'Practice'}</button>
          )}
          <button className="primary" onClick={() => go(href.battle(f.id))}><Icon name="g:crossed-swords" /> Record battle</button>
          {!theirs && <EditModeButton f={f} />}
        </div>
      </div>

      {!theirs && <EditModeNotice f={f} />}

      {theirs && (
        <div className="panel notice">
          <b>{f.owner}</b>'s force. You can view it and print lists, but only they can edit it.
        </div>
      )}

      {(toClaim.length > 0 || (!theirs && levelling.length > 0)) && (
        <div className="panel notice">
          <div className="panel-title">
            <h3><Icon name="g:upgrade" /> Waiting on you</h3>
          </div>
          {toClaim.length > 0 && c && (
            <div className="list-item">
              <span className="grow">
                <b>Round income</b>{' '}
                <span className="muted small">ready for {toClaim.length === 1 ? `round ${toClaim[0].round}` : `${toClaim.length} rounds`}</span>
              </span>
              <ClaimAll force={f} c={c} onPick={() => setClaiming(true)} />
              <button onClick={() => setClaiming(true)}>Choose…</button>
            </div>
          )}
          {!theirs && levelling.map((u) => {
            const k = pendingLevels(u);
            return (
              <div key={u.id} className="list-item">
                <span className="grow">
                  <b>{u.name || u.unitType}</b>{' '}
                  <span className="muted small">level {levelForXp(u.xp)} · {k} upgrade{k > 1 ? 's' : ''} to pick</span>
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

          {!theirs && f.units.length > 0 && <DowntimePanel f={f} />}

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
                No units yet. {edit ? <button onClick={() => setAdding(true)}>+ Add the first one</button> : 'Produce them at your planets (Nexus Wars panel).'}
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
                          <td className="s-full"><XpBar xp={u.xp} mini /><span className="small muted">{xpShown(u.xp)} XP</span></td>
                          <td className="num" data-label="Lvl">{levelForXp(u.xp)}</td>
                          <td className="num" data-label="Pts">{u.points}</td>
                          <td className="num" data-label="BP">{battlePoints(u, s)}</td>
                          <td className="s-full">
                            {pendingLevels(u) > 0 && <span className="tag gold" data-tip="Level-ups waiting to be picked"><Icon name="g:upgrade" /> Level up</span>}
                            {u.status === 'comatose' && <span className="tag cyan">Comatose</span>}
                            {u.status === 'removed' && <span className="tag red">Fallen</span>}
                            {u.status === 'active' && worn.has(u.id) && <WornTag />}
                            {u.scars.length > 0 && <span className="tag red">{u.scars.length} scar{u.scars.length > 1 ? 's' : ''}</span>}
                            {issues.length > 0 && <span className="tag gold" data-tip={issues.map((i) => i.text).join('\n')}><Icon name="g:hazard-sign" /> {issues.length}</span>}
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
            extra={!theirs && (
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
            )}
          >
            {!f.lists?.length ? (
              <p className="muted small">Pick units for a game and print their stats, traits, relics and rules.</p>
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
            extra={!theirs && (
              <div className="row">
                <button className="primary" onClick={() => setShopping(true)}>Requisition…</button>
                {edit && <button onClick={() => addLedger('Battle reward', 1, 0)}>+1 RP</button>}
                {edit && <button onClick={() => addLedger('Adjustment', 0, 0)}>+ Entry</button>}
              </div>
            )}
          >
            {f.ledger.length === 0 ? (
              <p className="muted small">No entries. Starting Supply Limit is {f.startingSupply}.</p>
            ) : (
              <>
                <LedgerTable f={f} edit={edit} set={set} limit={LEDGER_RECENT} />
                {f.ledger.length > LEDGER_RECENT && (
                  <div className="row ledger-all"><a href={href.ledger(f.id)}>See all {f.ledger.length} entries</a></div>
                )}
              </>
            )}
          </Panel>

          <Panel
            id="force.log"
            title="Battle log"
            extra={<span className="muted small">{f.wins} win{f.wins === 1 ? '' : 's'} in {f.battles} battle{f.battles === 1 ? '' : 's'}</span>}
          >
            {!f.battleLog?.length ? (
              <p className="muted small">No battles yet. <a href={href.battle(f.id)}>Record one</a> after your next game.</p>
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
          <Panel id="force.details" title="Force details" h={3} collapsed lead={<ForceImage image={f.image} readOnly={theirs} onChange={(img) => set((d) => void (d.image = img))} />}>
            <div className="fields" style={{ marginTop: '0.75rem' }}>
              {theirs ? (
                <>
                  <label className="field span-all">Name<Fixed>{f.name}</Fixed></label>
                  <label className="field span-all">Faction<Fixed>{f.faction || '—'}</Fixed></label>
                  <label className="field span-all">Player<Fixed>{f.player || '—'}</Fixed></label>
                </>
              ) : (
                <>
                  <label className="field span-all">Name<TextField value={f.name} onCommit={(v) => set((d) => void (d.name = v))} /></label>
                  <label className="field span-all">Faction<TextField value={f.faction} onCommit={(v) => set((d) => void (d.faction = v))} /></label>
                  <label className="field span-all">
                    Army Forge link
                    <TextField value={f.armyLink ?? ''} placeholder={armyUrl ?? 'Paste the army or list link'} onCommit={(v) => set((d) => void (d.armyLink = v.trim() || undefined))} />
                  </label>
                  <label className="field span-all">Player<TextField value={f.player} onCommit={(v) => set((d) => void (d.player = v))} /></label>
                </>
              )}
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
              {theirs
                ? f.description && <div className="span-all"><span className="small muted">Description / lore</span><p style={{ whiteSpace: 'pre-wrap', margin: '0.25rem 0 0' }}>{f.description}</p></div>
                : <label className="field span-all">Description / lore<TextArea rows={5} value={f.description} onCommit={(v) => set((d) => void (d.description = v))} /></label>}
            </div>
          </Panel>
          <RelicVault f={f} readOnly={theirs} />
          <NexusPanel f={f} onShop={() => setUmbra(true)} />
          {theirs ? <div className="panel"><button onClick={() => exportForce(f)}>Export force file</button></div> : <div className="panel">
            <div className="panel-title"><h3>Manage force</h3></div>
            <div className="row" style={{ marginBottom: '0.5rem' }}>
              <button onClick={() => exportForce(f)} data-tip="A file with this force and its units, to back it up or import it on another device">Export force file</button>
            </div>
            {cloud.email && f.owner === cloud.email && <TransferForce f={f} />}
            <button
              className="danger"
              onClick={() => {
                if (!window.confirm(`Delete "${f.name}" and all its units${f.owner && cloud.email ? ' for every player' : ''}? Export it first to keep a copy.`)) return;
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

      {claiming && c && <RoundIncome force={f} c={c} onClose={() => setClaiming(false)} />}
      {umbra && <UmbraShop force={f} onClose={() => setUmbra(false)} />}
      {practice && (
        <ZoneFight id={practiceId(f.id)} title={`${f.name}: practice`} tracked={practice} ctx={{ kind: 'practice', forceId: f.id }} modes={['command', 'quick']} practice
          onApply={() => undefined} onClose={() => setPractice(null)} />
      )}
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
/** Relics none of the force's units carry: give one to any unit with room, or stow one from a unit's sheet. */
function RelicVault({ f, readOnly }: { f: Force; readOnly: boolean }) {
  const { state, update, updateForce } = useStore();
  const cloud = useCloud();
  const vault = vaultOf(f);
  // The player's other forces: a stored relic can move to their vaults (another player's force can't be changed from here).
  const mine = state.forces.filter((x) => x.id !== f.id && !isTheirs(x, cloud.email));
  const send = (relicId: string, toId: string) =>
    update((d) => {
      const from = d.forces.find((x) => x.id === f.id);
      const to = d.forces.find((x) => x.id === toId);
      if (!from || !to || !sendRelic(from, to, relicId, localDate())) return;
      from.updatedAt = to.updatedAt = nowIso();
    });
  const carried = f.units.filter((u) => u.status !== 'removed' && u.relics.length);
  if (!vault.length && !carried.length) return null;
  const bearers = f.units.filter((u) => u.status !== 'removed' && relicBearer(u));
  return (
    <Panel id="force.vault" title="Relic vault" h={3} extra={<span className="muted small">{vault.length} stored</span>}>
      {vault.length === 0 && <p className="muted small">Empty. Use "To vault" on a unit's relic to store it here and hand it to another unit or send it to another of your forces.</p>}
      {vault.map((r) => (
        <div key={r.id} className="list-item vault-item">
          <div className="grow">
            <b>{r.name}</b> <span className="tag gold">{r.tier}</span>
            {r.profile && <div className="muted small">{r.profile}</div>}
          </div>
          {!readOnly && (
            <div className="vault-moves">
              <select value="" aria-label={`Give ${r.name} to`} onChange={(e) => e.target.value && updateForce(f.id, (d) => void equipRelic(d, e.target.value, r.id))}>
                <option value="">Give to…</option>
                {bearers.map((u) => {
                  const why = carryProblem(u, r);
                  return <option key={u.id} value={u.id} disabled={!!why} title={why}>{unitName(u)}{why ? ` - ${why}` : ''}</option>;
                })}
              </select>
              {mine.length > 0 && (
                <select value="" aria-label={`Send ${r.name} to another force`} title="Moves it to that force's relic vault"
                  onChange={(e) => e.target.value && send(r.id, e.target.value)}>
                  <option value="">Send to force…</option>
                  {mine.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                </select>
              )}
            </div>
          )}
        </div>
      ))}
      {carried.length > 0 && (
        <p className="muted small">Carried: {carried.map((u) => `${unitName(u)} (${u.relics.map((r) => r.name).join(', ')})`).join('; ')}.</p>
      )}
    </Panel>
  );
}

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
      <div className="muted" data-tip="Each planet banks Materials every round. Spend them to raise units there. Barracks and a Logistics Hub raise what it banks; Training Grounds give new units XP.">Production</div>
      <div className="row">
        <select value={site.id} onChange={(e) => setSite(e.target.value)} aria-label="Where to produce" style={{ minWidth: 0, flex: 1 }}>
          {sites.map((x) => <option key={x.id} value={x.id}>{x.name}: {x.bank ?? 0} Materials banked</option>)}
        </select>
        <button disabled={budget <= 0} onClick={() => setAdding(true)}
          data-tip={bank <= 0 ? 'Nothing banked yet. More arrives when the round ends.' : room <= 0 ? 'No room under your Supply Limit' : `Up to ${budget} pts`}>
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
            toast(ok ? `Produced ${newUnits.length} unit(s) at ${site.name} for ${cost} Materials.` : `Costs ${cost} Materials; ${site.name} has only ${bank}.`);
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
          <div key={o.id} className="row" data-tip={o.unit.rules.join(', ')}>
            <span className="grow">
              <Icon name="g:round-star" /> <b>{o.unit.unitType}</b> <span className="muted">— level {levelForXp(o.unit.xp)}, {o.unit.points} pts{relic ? <>, carrying <b>{relic.name}</b> ({relic.tier})</> : ''}. {umbraShards(o.fee)}; {offerEnds(o) > currentRound(c) ? 'leaves after next round' : 'leaves when this round ends'}.</span>
            </span>
            <button disabled={!!block} data-tip={block ?? `Hire for ${o.fee} Umbra Shards. They join ${f.name} for good.`} onClick={() => {
              if (!confirmAction(`Hire ${o.unit.unitType} into ${f.name} for ${o.fee} Umbra Shards?`)) return;
              let hired = false;
              update((d) => {
                const force = d.forces.find((y) => y.id === f.id);
                if (d.campaign && force && hireHero(d.campaign, o.id, force, localDate(), uid)) {
                  d.campaign.updatedAt = nowIso();
                  hired = true;
                }
              });
              toast(hired ? `${o.unit.unitType} joins ${f.name}.` : "Couldn't hire the hero.");
            }}>Hire</button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A force's or unit's picture with its change/remove buttons. With no picture it is just an "Add picture" button, so an
 * empty sheet doesn't spend half the column on a placeholder; read-only, it shows the picture if there is one.
 */
export function ForceImage({ image, onChange, readOnly }: { image?: string; onChange: (img: string | undefined) => void; readOnly?: boolean }) {
  if (readOnly) return image ? <img className="portrait" src={image} alt="" /> : null;
  return (
    <div>
      {image && <img className="portrait" src={image} alt="" />}
      <div className="row" style={image ? { marginTop: '0.4rem' } : undefined}>
        <label className="btn" style={{ cursor: 'pointer' }}>
          <Icon name="g:holy-symbol" /> {image ? 'Change picture' : 'Add picture'}
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
  const { edit, theirs } = useEditMode(f);
  const n = f.nexus;
  const faction = n && c?.factions.find((x) => x.id === n.factionId);
  const home = c && n ? homeOf(c, n.factionId) : undefined;
  const researchHome = home?.benefit === 'researchStation';
  const [claiming, setClaiming] = useState(false);
  const toClaim = c && n && faction ? claimableRounds(c, n, state.forces) : [];
  const claimedThrough = n && factionClaimedRound(state.forces, n.factionId);

  return (
    <Panel id="force.nexus" title="Nexus Wars" h={3} className="nexus-box" extra={!theirs && <button className={f.umbraShards > 0 ? 'primary' : undefined} onClick={onShop}>Spend Umbra Shards</button>}>
      {!c ? (
        <>
          <p className="muted small">No campaign loaded. <a href={href.campaign()}>Import or start one</a> to link a faction.</p>
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
              if (zero && !confirmAction(`${factionName(c, id)} already has a force, so ${f.name} becomes a detachment. Its Starting Supply drops from ${f.startingSupply} to ${NEXUS_DETACHMENTS.startingSupply}; reorganise detachments to give it Supply, shards and units. Link it?`)) return;
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
          {n && !faction && <p className="span-all small" style={{ color: 'var(--warn)', margin: 0 }}>This faction isn't in the loaded campaign.</p>}
          {n && faction && (
            <>
              <div className="span-all row wrap">
                <span className="grow small" style={{ minWidth: '12em' }}>
                  {toClaim.length
                    ? <><b>Income ready</b> for {toClaim.length === 1 ? `round ${toClaim[0].round}` : `${toClaim.length} rounds`}.</>
                    : <span className="muted">Round income claimed{claimedThrough ? ` through round ${claimedThrough}` : ''}{factionForces(state.forces, n.factionId).length > 1 ? ' for the faction' : ''}. More arrives when the GM ends the round.</span>}
                </span>
                {!theirs && toClaim.length > 0 && <ClaimAll force={f} c={c} onPick={() => setClaiming(true)} />}
                {!theirs && <button disabled={!toClaim.length} onClick={() => setClaiming(true)}>Claim round income…</button>}
              </div>
              {claiming && <RoundIncome force={f} c={c} onClose={() => setClaiming(false)} />}
              <DetachmentsBox f={f} c={c} />
              <div className="span-all small">
                <div className="muted">Controlled sectors</div>
                {ownedSectors(c, n.factionId).map((s) => (
                  <div key={s.id} data-tip={benefitOf(s)?.desc ?? SECTOR_TYPES[s.type].desc}>
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
                {n.tempTables === 'all' || n.tempTables.length ? <span className="muted"> (temporary ones last until your next income)</span> : null}
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
