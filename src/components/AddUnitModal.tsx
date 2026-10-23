import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { applySelection, bookPageUrl, parseTextList, type Selection } from '../armyforge/book';
import { newUnit, uid, unitFromCatalog } from '../model/factory';
import type { CatalogUnit, Unit } from '../model/types';
import { detectCategory, ruleRating } from '../rules/engine';
import { href } from '../route';
import { datasheetTags, matchesTags, tagsIn } from '../model/tags';
import { DatasheetTags, TagFilter } from './Tags';
import { Modal, Stepper } from './ui';
import { Icon } from './Icon';

type Tab = 'catalog' | 'text' | 'blank';

/** `budget` = supply points the force has left; when given, the catalog can be limited to what fits. */
export default function AddUnitModal({ onAdd, onClose, budget }: { onAdd: (units: Unit[]) => void; onClose: () => void; budget?: number }) {
  const { state } = useStore();
  const [tab, setTab] = useState<Tab>(state.books.length ? 'catalog' : 'blank');

  return (
    <Modal title="Add unit" onClose={onClose} wide>
      <div className="row" style={{ marginBottom: '0.75rem' }}>
        <button className={tab === 'catalog' ? 'primary' : ''} onClick={() => setTab('catalog')}>From army book</button>
        <button className={tab === 'text' ? 'primary' : ''} onClick={() => setTab('text')}>Paste list text</button>
        <button className={tab === 'blank' ? 'primary' : ''} onClick={() => setTab('blank')}>Blank sheet</button>
      </div>
      {tab === 'catalog' && <CatalogTab onAdd={onAdd} budget={budget} />}
      {tab === 'text' && <TextTab onAdd={onAdd} />}
      {tab === 'blank' && <BlankTab onAdd={onAdd} />}
    </Modal>
  );
}

function CatalogTab({ onAdd, budget }: { onAdd: (u: Unit[]) => void; budget?: number }) {
  const { state } = useStore();
  const [bookId, setBookId] = useState(state.books[0]?.uid ?? '');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [affordable, setAffordable] = useState(false);
  const [unitId, setUnitId] = useState<string | null>(null);
  const [sel, setSel] = useState<Selection>({});
  const [name, setName] = useState('');

  const book = state.books.find((b) => b.uid === bookId);
  const units = useMemo(
    () =>
      (book?.units ?? []).filter(
        (u) =>
          u.name.toLowerCase().includes(query.toLowerCase()) &&
          matchesTags(datasheetTags(book, u.name), tagFilter) &&
          !(affordable && budget !== undefined && u.cost > budget),
      ),
    [book, query, tagFilter, affordable, budget],
  );
  const unit = book?.units.find((u) => u.id === unitId);
  const loadout = unit ? applySelection(unit, sel) : null;

  if (!state.books.length)
    return (
      <p className="muted">
        No army books yet. Import one from Army Forge on the <a href={href.books()}>Army Books</a> page.
      </p>
    );

  const pick = (u: CatalogUnit) => {
    setUnitId(u.id);
    setSel({});
  };

  return (
    <div className="cols-2">
      <div>
        <div className="row" style={{ marginBottom: '0.5rem' }}>
          <select value={bookId} onChange={(e) => { setBookId(e.target.value); setUnitId(null); }}>
            {state.books.map((b) => <option key={b.uid} value={b.uid}>{b.name}</option>)}
          </select>
          {book && <a href={bookPageUrl(book.uid, book.name)} target="_blank" rel="noreferrer" title="Open this army on Army Forge"><Icon name="l:external-link" /></a>}
          <input placeholder="Search datasheets…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
        </div>
        {budget !== undefined && (
          <label className="row small" style={{ marginBottom: '0.5rem' }}>
            <input type="checkbox" checked={affordable} onChange={(e) => setAffordable(e.target.checked)} />
            Only what I can afford ({budget} pts left)
          </label>
        )}
        {book && <TagFilter tags={tagsIn(Object.values(book.unitTags ?? {}))} value={tagFilter} onChange={setTagFilter} />}
        <div className="pick-list">
          {units.map((u) => (
            <div key={u.id} className={`pick${u.id === unitId ? ' selected' : ''}`} onClick={() => pick(u)}>
              <div style={{ flex: 1 }}>
                <b>{u.name}</b> <span className="muted small">[{u.size}] Q{u.quality}+ D{u.defense}+</span>
                <div className="muted small">{u.rules.join(', ')}</div>
                <DatasheetTags book={book!} name={u.name} />
              </div>
              <span className="cost" style={{ color: 'var(--gold)' }}>{u.cost}pts</span>
            </div>
          ))}
          {!units.length && <div className="empty">No match.</div>}
        </div>
      </div>

      <div>
        {!unit && <p className="muted">Pick a datasheet to configure it.</p>}
        {unit && loadout && (
          <>
            <h3>{unit.name}</h3>
            <label className="field" style={{ marginBottom: '0.75rem' }}>
              Crusade name
              <input value={name} placeholder={`e.g. "The Fang" (optional)`} onChange={(e) => setName(e.target.value)} />
            </label>
            <div style={{ maxHeight: '38vh', overflowY: 'auto', marginBottom: '0.75rem' }}>
              {unit.sections.map((s) => (
                <div key={s.id} className="option-section">
                  <h4>{s.label}</h4>
                  {s.pickOne && (
                    <label className="option">
                      <input type="radio" name={s.id} checked={!s.options.some((o) => sel[`${s.id}:${o.id}`])}
                        onChange={() => setSel((x) => clearSection(x, s.id))} />
                      <span className="muted">None</span>
                    </label>
                  )}
                  {s.options.map((o) => {
                    const key = `${s.id}:${o.id}`;
                    const qty = sel[key] ?? 0;
                    return (
                      <div key={o.id} className="option">
                        {s.pickOne ? (
                          <input type="radio" name={s.id} checked={qty > 0}
                            onChange={() => setSel((x) => ({ ...clearSection(x, s.id), [key]: 1 }))} />
                        ) : s.perModel && unit.size > 1 ? (
                          <Stepper value={qty} min={0} onChange={(n) => setSel((x) => ({ ...x, [key]: Math.min(n, unit.size) }))} />
                        ) : (
                          <input type="checkbox" checked={qty > 0} onChange={(e) => setSel((x) => ({ ...x, [key]: e.target.checked ? 1 : 0 }))} />
                        )}
                        <span>{o.label}</span>
                        <span className="cost">{o.cost >= 0 ? `+${o.cost}` : o.cost}pts</span>
                      </div>
                    );
                  })}
                </div>
              ))}
              {!unit.sections.length && <p className="muted small">No upgrade options.</p>}
            </div>
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="row"><b>Loadout</b><span className="spacer" /><b style={{ color: 'var(--gold)' }}>{loadout.cost} pts</b></div>
              <div className="small" style={{ margin: '0.3rem 0' }}>{loadout.rules.map((r) => <span key={r} className="tag">{r}</span>)}</div>
              {loadout.weapons.map((w, i) => (
                <div key={i} className="small">
                  {w.count > 1 && `${w.count}x `}{w.name} <span className="muted">({w.range ? `${w.range}"` : 'Melee'}, A{w.attacks}{w.rules.length ? `, ${w.rules.join(', ')}` : ''})</span>
                </div>
              ))}
              <div className="row" style={{ marginTop: '0.75rem' }}>
                {budget !== undefined && loadout.cost > budget && (
                  <span className="small" style={{ color: 'var(--red)' }}>{loadout.cost - budget} pts over your supply limit</span>
                )}
                <span className="spacer" />
                <button className="primary" onClick={() => onAdd([unitFromCatalog(unit, loadout, book!, name.trim())])}>
                  Add to force
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function clearSection(sel: Selection, sectionId: string): Selection {
  return Object.fromEntries(Object.entries(sel).filter(([k]) => !k.startsWith(`${sectionId}:`)));
}

function TextTab({ onAdd }: { onAdd: (u: Unit[]) => void }) {
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseTextList(text), [text]);
  return (
    <>
      <p className="muted small">
        In Army Forge, open your list → <b>Share as Text</b> and paste it here. Unit lines look like{' '}
        <span className="mono">Force Commander [1] Q3+ D3+ | 65pts | Hero, Tough(3)</span>.
      </p>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste list text…" />
      <p className="small">{parsed.length} unit(s) recognised.</p>
      {parsed.map((u, i) => (
        <div key={i} className="small list-item">
          <b>{u.name}</b> <span className="muted">[{u.size}] Q{u.quality}+ D{u.defense}+ · {u.cost}pts · {u.weapons.length} weapon(s)</span>
        </div>
      ))}
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <span className="spacer" />
        <button
          className="primary"
          disabled={!parsed.length}
          onClick={() =>
            onAdd(
              parsed.map((t) => {
                const tough = ruleRating(t.rules, 'Tough') ?? 1;
                return newUnit({
                  unitType: t.name, points: t.cost, size: t.size, quality: t.quality, defense: t.defense, tough,
                  rules: t.rules, weapons: t.weapons.map((w) => ({ ...w, id: uid(), traits: [] })),
                  category: detectCategory({ rules: t.rules, size: t.size, tough, name: t.name }),
                });
              }),
            )
          }
        >
          Add {parsed.length || ''} unit(s)
        </button>
      </div>
    </>
  );
}

function BlankTab({ onAdd }: { onAdd: (u: Unit[]) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  return (
    <>
      <p className="muted small">Creates an empty unit sheet. Fill in its profile, weapons and rules next.</p>
      <div className="fields">
        <label className="field span-2">Crusade name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field span-2">Datasheet / unit type<input value={type} onChange={(e) => setType(e.target.value)} /></label>
      </div>
      <div className="row" style={{ marginTop: '0.75rem' }}>
        <span className="spacer" />
        <button className="primary" onClick={() => onAdd([newUnit({ name: name.trim(), unitType: type.trim() || 'Unit' })])}>Create</button>
      </div>
    </>
  );
}
