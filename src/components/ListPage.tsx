import { useEffect, useState } from 'react';
import { useStore } from '../model/store';
import { uid } from '../model/factory';
import type { ArmyList, CatalogBook, Force, RuleText, Settings, Unit } from '../model/types';
import { battlePoints, hasRule, levelForXp, ruleRating, xpShown } from '../rules/engine';
import { glossary, isHero, joinedTo, label, listIssues, listSpells, listTotals, listUnits, weaponColumns } from '../rules/lists';
import { go, href } from '../route';
import { matchesTags, tagsIn, unitTags } from '../model/tags';
import { TagFilter, UnitTags } from './Tags';
import { MARKS, traitMark } from './marks';
import { Issues, Panel, Stepper, TextArea, TextField, confirmAction, toast } from './ui';
import { Icon } from './Icon';
import { useTheirs } from './editMode';

export default function ListPage({ forceId, listId }: { forceId: string; listId: string }) {
  const { state, updateForce } = useStore();
  const f = state.forces.find((x) => x.id === forceId);
  const l = f?.lists?.find((x) => x.id === listId);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  // Another player's list can be viewed and printed here, not changed: the sync would undo it.
  const theirs = useTheirs(f);

  // The browser uses the page title as the default PDF file name.
  useEffect(() => {
    if (!f || !l) return;
    const prev = document.title;
    document.title = `${l.name} - ${f.name}`;
    return () => void (document.title = prev);
  }, [f?.name, l?.name]);

  if (!f) return <div className="panel empty">Force not found. <a href={href.forces()}>Back to forces</a></div>;
  if (!l) return <div className="panel empty">List not found. <a href={href.force(f.id)}>Back to {f.name}</a></div>;

  const s = state.settings;
  const setList = (fn: (d: ArmyList) => void) =>
    updateForce(f.id, (d) => {
      const x = d.lists?.find((y) => y.id === l.id);
      if (x) fn(x);
    });
  const t = listTotals(f, l, s);
  const selected = new Set(l.unitIds);

  const toggle = (u: Unit) => !theirs &&
    setList((d) => {
      const ids = new Set(d.unitIds);
      if (ids.has(u.id)) {
        ids.delete(u.id);
        delete d.joins[u.id];
        for (const [h, target] of Object.entries(d.joins)) if (target === u.id) delete d.joins[h];
      } else ids.add(u.id);
      d.unitIds = f.units.filter((x) => ids.has(x.id)).map((x) => x.id);
    });

  const duplicate = () => {
    const copy: ArmyList = { ...structuredClone(l), id: uid(), name: `${l.name} (copy)` };
    updateForce(f.id, (d) => void (d.lists = [...(d.lists ?? []), copy]));
    toast(`Duplicated "${l.name}".`);
    go(href.list(f.id, copy.id));
  };

  const remove = () => {
    if (!confirmAction(`Delete the list "${l.name}"? Its units stay in the force.`)) return;
    updateForce(f.id, (d) => void (d.lists = (d.lists ?? []).filter((x) => x.id !== l.id)));
    toast(`Deleted "${l.name}".`);
    go(href.force(f.id));
  };

  const listed = f.units.filter((u) => u.status !== 'removed' || selected.has(u.id));
  const units = listed.filter((u) => matchesTags(unitTags(u, state.books), tagFilter));

  return (
    <>
      <div className="no-print">
        <div className="page-head">
          <div>
            <div className="crumbs"><a href={href.forces()}>Forces</a> / <a href={href.force(f.id)}>{f.name}</a> / Battle list</div>
            <h1>{l.name}</h1>
          </div>
          <div className="row">
            {!theirs && <button onClick={duplicate}>Duplicate</button>}
            {!theirs && <button className="danger" onClick={remove}>Delete</button>}
            <button className="primary" onClick={() => window.print()} disabled={!t.units}><Icon name="l:printer" /> Print</button>
          </div>
        </div>

        {theirs && (
          <div className="panel notice">
            <b>{f.owner}</b>'s list. You can view and print it, but only they can change it.
          </div>
        )}

        <div className="cols-main">
          <Panel id="list.units" title="Units" extra={<span className="muted small">{t.units} selected</span>}>
            <TagFilter tags={tagsIn(listed.map((u) => unitTags(u, state.books)))} value={tagFilter} onChange={setTagFilter} />
            {listed.length === 0 ? (
              <div className="empty">This force has no units yet.</div>
            ) : units.length === 0 ? (
              <div className="empty">No units carry all of those tags.</div>
            ) : (
              <div className="table-wrap">
                <table className="stack">
                  <thead>
                    <tr><th /><th>Unit</th><th>Category</th><th>Tags</th><th className="num">Pts</th><th className="num">BP</th><th>Joins</th></tr>
                  </thead>
                  <tbody>
                    {units.map((u) => {
                      const on = selected.has(u.id);
                      return (
                        <tr key={u.id} className={`${theirs ? '' : 'clickable'}${on ? '' : ' unpicked'}`} onClick={() => toggle(u)}>
                          <td className="s-end"><input type="checkbox" checked={on} readOnly aria-label={`Include ${label(u)}`} /></td>
                          <td className="s-2">
                            <b>{label(u)}</b>
                            {u.name && <div className="muted small">{u.unitType}</div>}
                          </td>
                          <td className="cat">
                            {u.category}
                            {u.status === 'comatose' && <span className="tag cyan">Comatose</span>}
                            {u.status === 'removed' && <span className="tag red">Fallen</span>}
                          </td>
                          <td className="s-2"><UnitTags unit={u} editable={false} /></td>
                          <td className="num" data-label="Pts">{u.points}</td>
                          <td className="num" data-label="BP">{battlePoints(u, s)}</td>
                          <td className="s-full" onClick={(e) => e.stopPropagation()}>
                            {on && isHero(u) && theirs && l.joins[u.id] && (
                              <span className="small">Joins {label(f.units.find((x) => x.id === l.joins[u.id]) ?? u)}</span>
                            )}
                            {on && isHero(u) && !theirs && (
                              <select
                                value={l.joins[u.id] ?? ''}
                                onChange={(e) => setList((d) => {
                                  if (e.target.value) d.joins[u.id] = e.target.value;
                                  else delete d.joins[u.id];
                                })}
                              >
                                <option value="">Independent</option>
                                {listUnits(f, l).filter((x) => x.id !== u.id && !isHero(x)).map((x) => (
                                  <option key={x.id} value={x.id}>{label(x)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div>
            <div className="panel">
              <div className="stats" style={{ marginTop: 0 }}>
                <div className={`stat${t.points > l.pointsLimit ? ' over' : ''}`}><b>{t.points} / {l.pointsLimit}</b><span>Points</span></div>
                <div className="stat"><b>{t.units}</b><span>Units</span></div>
                <div className="stat"><b>{t.bp}</b><span>Battle points</span></div>
              </div>
              <div style={{ marginTop: '0.75rem' }}><Issues issues={listIssues(f, l, s)} /></div>
            </div>
            {!theirs && <Panel id="list.settings" title="List settings" h={3}>
              <div className="fields">
                <label className="field span-all">Name<TextField value={l.name} onCommit={(v) => setList((d) => void (d.name = v || 'Battle list'))} /></label>
                <label className="field span-all">Game size (pts)<Stepper value={l.pointsLimit} step={50} min={0} onChange={(n) => setList((d) => void (d.pointsLimit = n))} /></label>
                <label className="row span-all small">
                  <input type="checkbox" checked={l.glossary} onChange={(e) => setList((d) => void (d.glossary = e.target.checked))} />
                  Print special rules and spells
                </label>
                <label className="row span-all small">
                  <input type="checkbox" checked={l.compact} onChange={(e) => setList((d) => void (d.compact = e.target.checked))} />
                  Compact (two unit cards per row)
                </label>
                <label className="field span-all">Notes (printed)<TextArea value={l.notes} onCommit={(v) => setList((d) => void (d.notes = v))} /></label>
              </div>
              {l.glossary && !state.coreRules?.length && (
                <p className="small muted" style={{ marginBottom: 0 }}>
                  Import core rules on the <a href={href.books()}>Army Books</a> page to print descriptions for rules like Hero and Fearless.
                </p>
              )}
            </Panel>}
          </div>
        </div>

        <h2 className="sheet-label">Print preview</h2>
      </div>

      <ListSheet force={f} list={l} settings={s} books={state.books} coreRules={state.coreRules ?? []} />
    </>
  );
}

const range = (r: number) => (r ? `${r}"` : 'Melee');

export function ListSheet({ force: f, list: l, settings: s, books, coreRules }: {
  force: Force;
  list: ArmyList;
  settings: Settings;
  books: CatalogBook[];
  coreRules: RuleText[];
}) {
  const units = listUnits(f, l);
  const t = listTotals(f, l, s);
  const rules = l.glossary ? glossary(units, books, coreRules) : [];
  const spells = l.glossary ? listSpells(units, books) : [];
  const pending = f.nexus?.pending ?? [];

  return (
    <div className={`sheet${l.compact ? ' compact' : ''}`}>
      <header className="sheet-head">
        <div>
          <h1>{l.name}</h1>
          <div>{[f.name, f.faction, f.player].filter(Boolean).join(' · ')}</div>
        </div>
        <div className="sheet-totals">
          <b>{t.points} / {l.pointsLimit} pts</b>
          <div>{t.units} units · {t.models} models · {t.bp} BP</div>
          <div>{new Date().toLocaleDateString()} · {MARKS.trait} trait · {MARKS.unique} unique · {MARKS.nexus} Nexus · {MARKS.relic} relic</div>
        </div>
      </header>
      {(l.notes || pending.length > 0) && (
        <div className="sheet-notes">
          {l.notes && <p>{l.notes}</p>}
          {pending.length > 0 && <p><b>Nexus, this match:</b> {pending.join('; ')}</p>}
        </div>
      )}

      {units.length === 0 && <p className="sheet-empty">Tick units above to add them to this list.</p>}
      <div className="sheet-units">
        {units.map((u) => <UnitCard key={u.id} u={u} joined={joinedTo(f, l, u)} s={s} />)}
      </div>

      {/* Printed as one block, so if it doesn't fit under the units it starts on a new page. */}
      <div className="sheet-glossary">
        {rules.length > 0 && (
          <section className="sheet-rules">
            <h2>Special Rules</h2>
            <div className="sheet-rule-cols">
              {rules.map((r) => <p key={r.name}><b>{r.name}:</b> {r.desc}</p>)}
            </div>
          </section>
        )}
        {spells.length > 0 && (
          <section className="sheet-rules">
            <h2>Spells</h2>
            <div className="sheet-rule-cols">
              {spells.map((sp) => <p key={sp.name}><b>{sp.name} ({sp.threshold}):</b> {sp.effect}</p>)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function UnitCard({ u, joined, s }: { u: Unit; joined?: Unit; s: Settings }) {
  const level = levelForXp(u.xp);
  // Tough gets its own stat (1 when the unit has no Tough rule), so it's left out of Rules.
  const tough = Math.max(u.tough || 1, ruleRating(u.rules, 'Tough') ?? 1);
  const rules = u.rules.filter((r) => !hasRule([r], 'Tough'));
  return (
    <article className={`sheet-card${joined ? ' joined' : ''}`}>
      <div className="card-head">
        <div>
          <b>{label(u)}</b> [{u.size}]
          {u.name && <span className="card-type"> {u.unitType}</span>}
          {joined && <span className="card-type"> · Joined to {label(joined)}</span>}
        </div>
        <b>{u.points} pts</b>
      </div>
      <div className="card-stats">
        <span><b>Qua</b> {u.quality}+</span>
        <span><b>Def</b> {u.defense}+</span>
        <span><b>Lvl</b> {level} ({xpShown(u.xp)} XP)</span>
        <span><b>Tough</b> {tough}</span>
        <span><b>BP</b> {battlePoints(u, s)}</span>
        {u.status === 'comatose' && <span className="card-flag">Comatose</span>}
      </div>
      {rules.length > 0 && <div className="card-line"><b>Rules:</b> {rules.join(', ')}</div>}

      {u.weapons.length > 0 && (
        <table className="card-weapons">
          <colgroup><col style={{ width: '32%' }} /><col style={{ width: '9%' }} /><col style={{ width: '8%' }} /><col style={{ width: '6%' }} /><col /></colgroup>
          <thead>
            <tr><th>Weapon</th><th>RNG</th><th>ATK</th><th>AP</th><th>Special</th></tr>
          </thead>
          <tbody>
            {u.weapons.map((w) => {
              const c = weaponColumns(w);
              return (
                <tr key={w.id}>
                  <td>{w.count > 1 && `${w.count}× `}{w.name}</td>
                  <td>{range(w.range)}</td>
                  <td>A{w.attacks}</td>
                  <td>{c.ap || '-'}</td>
                  <td>
                    {c.special.join(', ')}
                    {w.traits.length > 0 && (
                      <>
                        {c.special.length > 0 && ', '}
                        <i>{w.traits.map((x) => `${x.name} ${traitMark(x)}`).join(', ')}</i>
                      </>
                    )}
                    {!c.special.length && !w.traits.length && '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {u.upgrades.length > 0 && (
        <div className="card-line">
          <b>Crusade traits:</b>{' '}
          {u.upgrades.map((x, i) => (
            <span key={x.id}>
              {i > 0 && ', '}
              {x.name} {traitMark(x)}{x.note && <i> ({x.note})</i>}
            </span>
          ))}
        </div>
      )}
      {u.relics.map((r) => (
        <div key={r.id} className="card-line">
          <b>Relic ({r.tier}):</b> {r.name} {MARKS.relic}
          {r.profile && <> ({r.profile})</>}
          {r.note && <i> {r.note}</i>}
        </div>
      ))}
      {u.scars.length > 0 && (
        <div className="card-line">
          <b>Battle scars:</b>{' '}
          {u.scars.map((x, i) => (
            <span key={x.id}>{i > 0 && '; '}{x.name}{x.desc && <i> ({x.desc})</i>}</span>
          ))}
        </div>
      )}
    </article>
  );
}
