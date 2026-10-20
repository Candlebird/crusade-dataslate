import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { CORE_RULES_URL, bookApiUrl, bookPageUrl, fetchBook, fetchCoreRules, parseBookUid, proxyOf } from '../armyforge/book';
import { interpretJson } from '../model/io';
import { href } from '../route';
import { datasheetTags, matchesTags, tagsIn } from '../model/tags';
import { DatasheetTags, TagFilter } from './Tags';
import { Dropzone, Panel, confirmAction, toast } from './ui';
import { DatasheetEditor } from './BookEditor';
import { blankDatasheet, removeDatasheet, saveDatasheet } from '../model/bookEdit';
import type { CatalogBook, CatalogUnit } from '../model/types';
import { useImporter } from './importer';

export default function BooksPage() {
  const { state, update, addBook } = useStore();
  const importFiles = useImporter();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(state.books[0]?.uid ?? null);
  const bookUid = parseBookUid(link);
  const proxy = proxyOf(state.settings);
  const have = state.books.find((b) => b.uid === bookUid);

  /** Fetch a book from Army Forge and save it (a fresh copy keeps the book's unit tags). */
  const fetchInto = async (uid: string) => {
    const old = state.books.find((b) => b.uid === uid);
    if (old?.edited && !confirmAction(`"${old.name}" has datasheets edited in the app. Refreshing replaces them with Army Forge's. Continue?`)) return;
    setBusy(uid);
    try {
      const book = await fetchBook(uid, proxy);
      addBook(book);
      setOpenId(book.uid);
      if (!old) {
        setLink('');
        toast(`Army book "${book.name}" imported (${book.units.length} datasheets).`);
      } else
        toast(old.version === book.version
          ? `"${book.name}" is up to date (v${book.version}).`
          : `"${book.name}" updated from v${old.version} to v${book.version}.`);
    } catch (e) {
      toast(`Couldn't fetch the book: ${e instanceof Error ? e.message : e}.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  const fetchCore = async () => {
    setBusy('core');
    try {
      const got = interpretJson(await fetchCoreRules(proxy));
      if (got.kind !== 'coreRules') throw new Error('unexpected response');
      update((d) => void (d.coreRules = got.rules));
      toast(`Core rules imported (${got.rules.length} rules).`);
    } catch (e) {
      toast(`Couldn't fetch the core rules: ${e instanceof Error ? e.message : e}.`, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">Crusade Command</div>
          <h1>Army Books</h1>
        </div>
      </div>

      <Panel id="books.add" title="Add an army book">
        <p className="small" style={{ marginTop: 0 }}>
          On Army Forge, open the army and use <b>Share</b> (or copy the page address), then paste the link here. The book is saved for the
          whole group, and <b>Refresh</b> pulls in later changes.
        </p>
        <div className="row">
          <input
            value={link}
            style={{ flex: 1, minWidth: '12rem' }}
            placeholder="https://army-forge.onepagerules.com/army-info/grimdark-future/…"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && bookUid && proxy && !busy && fetchInto(bookUid)}
          />
          <button className="primary" disabled={!bookUid || !proxy || !!busy} onClick={() => bookUid && fetchInto(bookUid)}>
            {busy && busy === bookUid ? 'Fetching…' : have ? 'Refresh' : 'Import'}
          </button>
        </div>
        {link && !bookUid && <p className="small" style={{ color: 'var(--warn)' }}>That doesn't look like an army book link.</p>}
        {have && <p className="muted small">"{have.name}" is already imported. Importing again refreshes it.</p>}
        {!proxy && (
          <p className="small" style={{ color: 'var(--warn)' }}>
            Fetching from Army Forge needs the proxy, which isn't set up yet (see <a href={href.settings()}>Settings</a>). Import by file below instead.
          </p>
        )}
        <details style={{ marginTop: '0.75rem' }}>
          <summary className="small">Private book, or the fetch fails? Import by file</summary>
          <p className="muted small">
            Army Forge only shares a private book with its creator. Make it public or unlisted in the Army Forge book editor, or, while
            signed in to Army Forge as its creator, save the book's JSON and drop it here.
          </p>
          {bookUid && (
            <p>
              <a className="btn" href={bookApiUrl(bookUid)} target="_blank" rel="noreferrer" download={`${bookUid}.json`}>Download book JSON</a>
            </p>
          )}
          <Dropzone accept=".json,application/json" onFiles={importFiles}>
            Drop an <b>Army Forge book JSON</b> (or core rules JSON) here, or click to choose.
          </Dropzone>
        </details>
      </Panel>

      <Panel
        id="books.core"
        title="Core rules"
        extra={
          <div className="row">
            {proxy
              ? <button disabled={!!busy} onClick={fetchCore}>{busy === 'core' ? 'Fetching…' : state.coreRules?.length ? 'Refresh' : 'Fetch core rules'}</button>
              : <a className="btn" href={CORE_RULES_URL} target="_blank" rel="noreferrer" download="core-rules.json">Download core rules JSON</a>}
          </div>
        }
      >
        <p className="small" style={{ margin: 0 }}>
          {state.coreRules?.length
            ? <><span className="tag green">Imported</span> {state.coreRules.length} core rules (AP, Tough, Hero, Fearless…) are printed in battle list glossaries.</>
            : <>Army books only describe their own rules. Fetch the core rules once for the full <b>Special Rules</b> section on printed lists.</>}
        </p>
      </Panel>

      <Panel id="books.imported" title="Imported books">
        {state.books.length === 0 && <p className="muted">None yet.</p>}
        {state.books.map((b) => (
          <div key={b.uid} className="list-item">
            <div className="grow">
              <b>{b.name}</b>
              <div className="muted small">
                {b.faction && `${b.faction} · `}v{b.version}{b.edited ? ' (edited)' : ''} · {b.units.length} datasheets · {b.rules.length} rules · {b.spells.length} spells · fetched {b.importedAt.slice(0, 10)}
              </div>
            </div>
            <a className="btn" href={bookPageUrl(b.uid, b.name)} target="_blank" rel="noreferrer">Army Forge ↗</a>
            {proxy && (
              <button disabled={!!busy} onClick={() => fetchInto(b.uid)} title="Fetch the latest version from Army Forge">
                {busy === b.uid ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
            <button onClick={() => setOpenId(openId === b.uid ? null : b.uid)}>{openId === b.uid ? 'Hide' : 'Browse'}</button>
            <button
              className="ghost icon"
              aria-label={`Remove ${b.name}`}
              onClick={() => {
                if (!window.confirm(`Remove "${b.name}"? Units already built from it are kept, but its unit tags are lost.`)) return;
                update((d) => void (d.books = d.books.filter((x) => x.uid !== b.uid)));
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </Panel>

      {openId && <BookBrowser uid={openId} />}
    </>
  );
}

function BookBrowser({ uid }: { uid: string }) {
  const { state, update } = useStore();
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<CatalogUnit | null>(null);
  const changeBook = (fn: (b: CatalogBook) => void) =>
    update((d) => {
      const b = d.books.find((x) => x.uid === uid);
      if (!b) return;
      fn(b);
      b.updatedAt = new Date().toISOString();
    });
  const [tab, setTab] = useState<'units' | 'rules' | 'spells'>('units');
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const book = state.books.find((b) => b.uid === uid);
  const q = query.toLowerCase();
  const units = useMemo(
    () => (book?.units ?? []).filter((u) => u.name.toLowerCase().includes(q) && matchesTags(datasheetTags(book, u.name), tagFilter)),
    [book, q, tagFilter],
  );
  const rules = useMemo(() => (book?.rules ?? []).filter((r) => (r.name + r.desc).toLowerCase().includes(q)), [book, q]);
  if (!book) return null;

  return (
    <Panel
      id={`books.book.${book.uid}`}
      title={book.name}
      extra={
        <div className="row">
          {(['units', 'rules', 'spells'] as const).map((t) => (
            <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {tab === 'units' && (
            <button className={editMode ? 'primary' : ''} onClick={() => setEditMode(!editMode)} title="Change, add or remove datasheets by hand">
              {editMode ? 'Done editing' : 'Edit units'}
            </button>
          )}
        </div>
      }
    >
      {tab === 'units' && editMode && (
        <div className="row" style={{ marginBottom: 8 }}>
          <button onClick={() => setEditing(blankDatasheet())}>+ Add datasheet</button>
          <span className="muted small">Edits are shared with the group. Units already built from a datasheet keep their own values.</span>
        </div>
      )}
      {editing && (
        <DatasheetEditor
          unit={editing}
          onClose={() => setEditing(null)}
          onSave={(u) => {
            changeBook((b) => saveDatasheet(b, u));
            setEditing(null);
            toast(`${u.name} saved.`);
          }}
        />
      )}
      {tab === 'units' && <TagFilter tags={tagsIn(Object.values(book.unitTags ?? {}))} value={tagFilter} onChange={setTagFilter} />}
      {tab === 'units' && (
        <div className="table-wrap">
          <table className="stack">
            <thead>
              <tr><th>Datasheet</th><th>Tags</th><th className="num">Size</th><th className="num">Q</th><th className="num">D</th><th>Rules</th><th>Weapons</th><th className="num">Pts</th>{editMode && <th />}</tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td className="s-2"><b>{u.name}</b></td>
                  <td className="s-full"><DatasheetTags book={book} name={u.name} /></td>
                  <td className="num" data-label="Size">{u.size}</td>
                  <td className="num" data-label="Quality">{u.quality}+</td>
                  <td className="num" data-label="Defense">{u.defense}+</td>
                  <td className="small s-full" data-label="Rules">{u.rules.join(', ')}</td>
                  <td className="small s-full" data-label="Weapons">
                    {u.weapons.map((w, i) => (
                      <div key={i}>
                        {w.count > 1 && `${w.count}× `}{w.name} <span className="muted">({w.range ? `${w.range}"` : 'Melee'}, A{w.attacks}{w.rules.length ? `, ${w.rules.join(', ')}` : ''})</span>
                      </div>
                    ))}
                  </td>
                  <td className="num s-end" data-label="Pts">{u.cost}</td>
                  {editMode && (
                    <td className="s-end">
                      <div className="row" style={{ flexWrap: 'nowrap' }}>
                        <button className="ghost icon" aria-label={`Edit ${u.name}`} title="Edit" onClick={() => setEditing(u)}>✎</button>
                        <button className="ghost icon" aria-label={`Remove ${u.name}`} title="Remove"
                          onClick={() => confirmAction(`Remove ${u.name} from ${book.name}? Units already built from it are kept.`) && changeBook((b) => removeDatasheet(b, u.id))}>✕</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tab === 'rules' && (
        <div>
          {rules.map((r) => (
            <div key={r.name} className="list-item" style={{ display: 'block' }}>
              <b>{r.name}</b>
              <div className="small muted">{r.desc}</div>
            </div>
          ))}
          {!rules.length && <p className="muted">No special rules.</p>}
        </div>
      )}
      {tab === 'spells' && (
        <div>
          {book.spells.filter((sp) => sp.name.toLowerCase().includes(q)).map((sp) => (
            <div key={sp.name} className="list-item" style={{ display: 'block' }}>
              <b>{sp.name}</b> <span className="tag">({sp.threshold})</span>
              <div className="small muted">{sp.effect}</div>
            </div>
          ))}
          {!book.spells.length && <p className="muted">No spells.</p>}
        </div>
      )}
    </Panel>
  );
}
