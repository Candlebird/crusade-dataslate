import { useState } from 'react';
import { useStore } from '../model/store';
import { allTags, bookOf, datasheetTags, normalizeTag, setDatasheetTags, tagsIn } from '../model/tags';
import type { CatalogBook, Unit } from '../model/types';

export function TagChips({ tags }: { tags: string[] }) {
  return <>{tags.map((t) => <span key={t} className="tag utag">{t}</span>)}</>;
}

/** Tags of one army-book datasheet, editable in place. Clicks don't reach the row underneath. */
export function DatasheetTags({ book, name }: { book: CatalogBook; name: string }) {
  const { state, update } = useStore();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const tags = datasheetTags(book, name);
  const known = allTags(state.books);
  const save = (next: string[]) => update((d) => setDatasheetTags(d, book.uid, name, next));

  const commit = () => {
    const typed = text.split(',').map((t) => normalizeTag(t, known)).filter(Boolean);
    if (typed.length) save([...tags, ...typed]);
    setText('');
    setAdding(false);
  };

  return (
    <span className="tag-editor" onClick={(e) => e.stopPropagation()}>
      {tags.map((t) => (
        <span key={t} className="tag utag">
          {t}
          <button type="button" aria-label={`Remove tag ${t}`} title="Remove tag" onClick={() => save(tags.filter((x) => x !== t))}>✕</button>
        </span>
      ))}
      {adding ? (
        <input
          className="tag-input"
          autoFocus
          list="tag-suggestions"
          placeholder="Tag…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') { setText(''); setAdding(false); }
          }}
        />
      ) : (
        <button type="button" className="tag tag-add" title={`Tag every "${name}" from ${book.name}`} onClick={() => setAdding(true)}>+ tag</button>
      )}
      {adding && (
        <datalist id="tag-suggestions">
          {known.filter((k) => !tags.includes(k)).map((k) => <option key={k} value={k} />)}
        </datalist>
      )}
    </span>
  );
}

/** Tags of a crusade unit, editable when its datasheet's book is imported. */
export function UnitTags({ unit, editable = true }: { unit: Unit; editable?: boolean }) {
  const { state } = useStore();
  const book = bookOf(unit, state.books);
  if (!book) return <span className="muted small" title="Tags are kept on army books, and this unit's book isn't imported.">—</span>;
  if (!editable) return <TagChips tags={datasheetTags(book, unit.unitType)} />;
  return <DatasheetTags book={book} name={unit.unitType} />;
}

/** Toggle chips that narrow a list to units carrying every picked tag. */
export function TagFilter({ tags, value, onChange }: { tags: string[]; value: string[]; onChange: (v: string[]) => void }) {
  // Keep picked tags visible even if nothing carries them any more, so they can be cleared.
  const shown = tagsIn([tags, value]);
  if (!shown.length) return null;
  return (
    <div className="tag-filter">
      <span className="muted small">Tags:</span>
      {shown.map((t) => {
        const on = value.includes(t);
        return (
          <button key={t} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== t) : [...value, t])}>
            {t}
          </button>
        );
      })}
      {value.length > 0 && <button type="button" className="ghost small" onClick={() => onChange([])}>Clear</button>}
    </div>
  );
}
