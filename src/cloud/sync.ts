/**
 * Two-way sync between the local app state and the cloud, as plain logic so it can be tested
 * without Firebase. Each synced thing (a force, the campaign, a book…) is one document at a path
 * like "forces/abc", holding its JSON. Last write wins per document; on first sight of a document
 * that differs on both sides, the newer updatedAt wins.
 */

export interface LocalDoc {
  path: string;
  json: string;
  updatedAt: string;
  canWrite: boolean;
  /** Extra fields stored beside the data (e.g. owner), which the security rules check. */
  fields?: Record<string, string>;
}

export interface RemoteDoc {
  path: string;
  json: string;
  updatedAt: string;
  owner?: string;
  /** False while the server hasn't acknowledged our own write yet. */
  confirmed: boolean;
}

export interface SyncHost {
  push(doc: LocalDoc): Promise<void>;
  remove(path: string): Promise<void>;
  /** Replace the local copy (null = delete it). May be slow, e.g. fetching pictures. */
  apply(path: string, json: string | null): Promise<void>;
  canDelete(remote: RemoteDoc): boolean;
  /** A local edit to something this user can't change was undone. */
  readOnly(path: string): void;
  failed(path: string, err: unknown): void;
  /** Paths the server has confirmed, kept between visits to spot remote deletions. */
  saveKnown(paths: string[]): void;
}

const collectionOf = (path: string) => path.slice(0, path.indexOf('/'));

/** How long to wait for an applied remote change to show up in the local state. */
const APPLY_GRACE_MS = 3000;

export class SyncEngine {
  private local = new Map<string, LocalDoc>();
  private remote = new Map<string, Map<string, RemoteDoc>>();
  private ready = new Set<string>();
  /** Last JSON both sides agreed on. */
  private synced = new Map<string, string>();
  /** Writes in flight: the remote JSON from before the write (null = no doc). */
  private pushing = new Map<string, string | null>();
  /** Remote changes being applied locally: local edits to these wait until they land. */
  private applying = new Map<string, { json: string | null; until: number }>();
  /** Writes the server refused, so they aren't retried in a loop. */
  private failed = new Map<string, string>();
  /** Documents the local state has shown since we last pulled them: only these can be deleted locally. */
  private landed = new Set<string>();

  constructor(
    private host: SyncHost,
    private known: Set<string>,
    private now: () => number = Date.now,
  ) {}

  setLocal(docs: LocalDoc[]): void {
    this.local = new Map(docs.map((d) => [d.path, d]));
    for (const d of docs) this.landed.add(d.path);
    for (const c of this.ready) this.reconcile(c);
  }

  /** A snapshot of one collection. Cached snapshots before the first server one are ignored. */
  setRemote(collection: string, docs: RemoteDoc[], fromCache: boolean): void {
    if (fromCache && !this.ready.has(collection)) return;
    this.remote.set(collection, new Map(docs.map((d) => [d.path, d])));
    this.ready.add(collection);
    const before = this.known.size;
    for (const d of docs) if (d.confirmed) this.known.add(d.path);
    if (this.known.size !== before) this.host.saveKnown([...this.known]);
    this.reconcile(collection);
  }

  private reconcile(collection: string): void {
    const remote = this.remote.get(collection) ?? new Map<string, RemoteDoc>();
    const inCollection = (p: string) => collectionOf(p) === collection;
    const paths = new Set([...remote.keys(), ...[...this.local.keys()].filter(inCollection), ...[...this.synced.keys()].filter(inCollection)]);
    for (const path of paths) this.step(path, this.local.get(path), remote.get(path));
  }

  private step(path: string, L: LocalDoc | undefined, R: RemoteDoc | undefined): void {
    const S = this.synced.get(path);
    let rj = R?.json ?? null;
    if (this.pushing.has(path)) {
      // Until the snapshot shows our write, act as if it already landed.
      if (this.pushing.get(path) === rj) rj = S ?? null;
      else this.pushing.delete(path);
    }
    const lj = L?.json ?? null;
    const app = this.applying.get(path);
    if (app) {
      if (lj === app.json || this.now() > app.until) this.applying.delete(path);
      else return;
    }
    if (lj === rj) {
      if (rj === null) this.synced.delete(path);
      else this.synced.set(path, rj);
      return;
    }
    const blocked = L !== undefined && this.failed.get(path) === lj;

    if (L && rj !== null) {
      const localChanged = lj !== S;
      const remoteChanged = rj !== S;
      if (!remoteChanged) return L.canWrite && !blocked ? this.push(L, R) : this.pull(path, rj, !L.canWrite);
      if (!localChanged) return this.pull(path, rj);
      if (L.canWrite && !blocked && L.updatedAt > (R?.updatedAt ?? '')) return this.push(L, R);
      return this.pull(path, rj);
    }
    if (L) {
      if (this.known.has(path)) {
        // It was on the server before and isn't now: deleted elsewhere.
        this.forget(path);
        return this.pull(path, null);
      }
      if (L.canWrite && !blocked) this.push(L, R);
      return;
    }
    if (rj === null) return;
    if (S !== undefined) {
      // A pulled copy that never reached the local state (a background tab can lag well past the grace period)
      // wasn't deleted here: pull it again rather than delete it for everyone.
      if (!this.landed.has(path)) return this.pull(path, rj);
      // Deleted locally since the last sync. With no remote copy yet, it is our own new document whose write
      // hasn't shown up in a snapshot: take it back.
      if (R ? this.host.canDelete(R) : this.pushing.has(path)) return this.remove(path, rj);
      return this.pull(path, rj, true);
    }
    this.pull(path, rj);
  }

  private push(L: LocalDoc, R: RemoteDoc | undefined): void {
    this.pushing.set(L.path, R?.json ?? null);
    this.synced.set(L.path, L.json);
    this.host.push(L).catch((err) => {
      this.pushing.delete(L.path);
      this.synced.delete(L.path);
      this.failed.set(L.path, L.json);
      this.host.failed(L.path, err);
      this.reconcile(collectionOf(L.path));
    });
  }

  private remove(path: string, rj: string): void {
    this.pushing.set(path, rj);
    this.synced.delete(path);
    this.forget(path);
    this.host.remove(path).catch((err) => {
      this.pushing.delete(path);
      this.host.failed(path, err);
      this.reconcile(collectionOf(path));
    });
  }

  private pull(path: string, json: string | null, readOnly = false): void {
    this.landed.delete(path);
    if (json === null) this.synced.delete(path);
    else this.synced.set(path, json);
    const entry = { json, until: Infinity };
    this.applying.set(path, entry);
    if (readOnly) this.host.readOnly(path);
    this.host.apply(path, json).then(
      () => void (entry.until = this.now() + APPLY_GRACE_MS),
      (err) => {
        this.applying.delete(path);
        this.host.failed(path, err);
      },
    );
  }

  private forget(path: string): void {
    if (this.known.delete(path)) this.host.saveKnown([...this.known]);
  }
}
