import { useMemo, useState } from 'react';
import { useStore } from '../model/store';
import { CORE_RULES_URL, bookApiUrl, bookPageUrl, fetchBook, fetchCoreRules, parseBookUid } from '../armyforge/book';
import { interpretJson } from '../model/io';
import { href } from '../route';
import { datasheetTags, matchesTags, tagsIn } from '../model/tags';
import { DatasheetTags, TagFilter } from './Tags';
import { Dropzone, toast } from './ui';
import { useImporter } from './importer';

export default function BooksPage() {
  const { state, update, addBook } = useStore();
  const importFiles = useImporter();
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(state.books[0]?.uid ?? null);
  const bookUid = parseBookUid(link);
  const proxy = state.settings.armyForgeProxy;

  const fetchDirect = async () => {
    if (!bookUid) return;
    setBusy(true);
    try {
      const book = await fetchBook(bookUid, proxy);
      addBook(book);
      setOpenId(book.uid);
      toast(`Army book "${book.name}" imported (${book.units.length} datasheets).`);
    } catch (e) {
      toast(`Direct fetch failed: ${e instanceof Error ? e.message : e}. Use the download link instead.`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const fetchCore = async () => {
    setBusy(true);
    try {
      const got = interpretJson(await fetchCoreRules(proxy));
      if (got.kind !== 'coreRules') throw new Error('unexpected response');
      update((d) => void (d.coreRules = got.rules));
      toast(`Core rules imported (${got.rules.length} rules).`);
    } catch (e) {
      toast(`Direct fetch failed: ${e instanceof Error ? e.message : e}. Use the download link instead.`, 'error');
    } finally {
      setBusy(false);
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

      <div className="cols-2">
        <div className="panel">
          <div className="panel-title"><h2>Import from Army Forge</h2></div>
          <ol className="small" style={{ paddingLeft: '1.2rem', lineHeight: 1.6 }}>
            <li>Open the army book on Army Forge and copy the page link (or just its ID).</li>
            <li>Paste it below and click the download link — your browser saves the book's JSON.</li>
            <li>Drop that file in the box on the right.</li>
          </ol>
          <label className="field">
            Army Forge link
            <input
              value={link}
              placeholder="https://army-forge.onepagerules.com/army-info/grimdark-future/…"
              onChange={(e) => setLink(e.target.value)}
            />
          </label>
          {link && !bookUid && <p className="small" style={{ color: 'var(--warn)' }}>That doesn't look like an army book link.</p>}
          {bookUid && (
            <div className="row" style={{ marginTop: '0.75rem' }}>
              <a className="btn primary" href={bookApiUrl(bookUid)} target="_blank" rel="noreferrer" download={`${bookUid}.json`}>
                Download book JSON
              </a>
              {proxy && (
                <button disabled={busy} onClick={fetchDirect}>
                  {busy ? 'Fetching…' : 'Fetch directly'}
                </button>
              )}
            </div>
          )}
          {!proxy && (
            <p className="muted small" style={{ marginTop: '0.75rem' }}>
              Tip: with a proxy configured in <a href={href.settings()}>Settings</a> you can skip the download and fetch books in one click.
            </p>
          )}
        </div>
        <div className="panel">
          <div className="panel-title"><h2>Drop book file</h2></div>
          <Dropzone accept=".json,application/json" onFiles={importFiles}>
            Drop the downloaded <b>Army Forge book JSON</b> (or core rules JSON) here — or click to choose.
          </Dropzone>
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          <h2>Core rules</h2>
          <div className="row">
            <a className="btn" href={CORE_RULES_URL} target="_blank" rel="noreferrer" download="core-rules.json">Download core rules JSON</a>
            {proxy && <button disabled={busy} onClick={fetchCore}>{busy ? 'Fetching…' : 'Fetch directly'}</button>}
          </div>
        </div>
        <p className="small" style={{ margin: 0 }}>
          {state.coreRules?.length
            ? <><span className="tag green">Imported</span> {state.coreRules.length} core rules (AP, Tough, Hero, Fearless…) are printed in battle list glossaries.</>
            : <>Army books only describe their own rules. For the full <b>Special Rules</b> section on printed lists, download the core rules once and drop the file in the box above.</>}
        </p>
      </div>

      <div className="panel">
        <div className="panel-title"><h2>Imported books</h2></div>
        {state.books.length === 0 && <p className="muted">None yet.</p>}
        {state.books.map((b) => (
          <div key={b.uid} className="list-item">
            <div className="grow">
              <b>{b.name}</b>
              <div className="muted small">
                {b.faction && `${b.faction} · `}v{b.version} · {b.units.length} datasheets · {b.rules.length} rules · {b.spells.length} spells · imported {b.importedAt.slice(0, 10)}
              </div>
            </div>
            <a className="btn" href={bookPageUrl(b.uid, b.name)} target="_blank" rel="noreferrer">Army Forge ↗</a>
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
      </div>

      {openId && <BookBrowser uid={openId} />}
    </>
  );
}

function BookBrowser({ uid }: { uid: string }) {
  const { state } = useStore();
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
    <div className="panel">
      <div className="panel-title">
        <h2>{book.name}</h2>
        <div className="row">
          {(['units', 'rules', 'spells'] as const).map((t) => (
            <button key={t} className={tab === t ? 'primary' : ''} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)}</button>
          ))}
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      {tab === 'units' && <TagFilter tags={tagsIn(Object.values(book.unitTags ?? {}))} value={tagFilter} onChange={setTagFilter} />}
      {tab === 'units' && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Datasheet</th><th>Tags</th><th className="num">Size</th><th className="num">Q</th><th className="num">D</th><th>Rules</th><th>Weapons</th><th className="num">Pts</th></tr>
            </thead>
            <tbody>
              {units.map((u) => (
                <tr key={u.id}>
                  <td><b>{u.name}</b></td>
                  <td><DatasheetTags book={book} name={u.name} /></td>
                  <td className="num">{u.size}</td>
                  <td className="num">{u.quality}+</td>
                  <td className="num">{u.defense}+</td>
                  <td className="small">{u.rules.join(', ')}</td>
                  <td className="small">
                    {u.weapons.map((w, i) => (
                      <div key={i}>
                        {w.count > 1 && `${w.count}× `}{w.name} <span className="muted">({w.range ? `${w.range}"` : 'Melee'}, A{w.attacks}{w.rules.length ? `, ${w.rules.join(', ')}` : ''})</span>
                      </div>
                    ))}
                  </td>
                  <td className="num">{u.cost}</td>
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
    </div>
  );
}
