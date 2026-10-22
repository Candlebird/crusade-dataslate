import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../model/store';
import { toast } from '../components/ui';
import { GM_EMAIL } from './config';
import { applyDoc, CAMPAIGN_PATH, COLLECTIONS, fromCloudJson, imageRefs, localDocs, SETTINGS_PATH, toCloudJson } from './docs';
import { SyncEngine } from './sync';

type Firebase = typeof import('./firebase');
export type { Person } from './firebase';
type Person = import('./firebase').Person;

/** not-member: signed in, but the GM hasn't let this account into the campaign (yet). */
export type CloudStatus = 'loading' | 'signed-out' | 'not-member' | 'syncing' | 'synced' | 'error';

interface Cloud {
  status: CloudStatus;
  /** Signed-in Google account, or null. */
  email: string | null;
  name: string | null;
  isGm: boolean;
  signIn: () => void;
  signOut: () => void;
  /** Hands one of your forces to another player; it comes back to you read-only. */
  transfer: (forceId: string, to: string) => Promise<void>;
  /** Everyone in the campaign, GM first. */
  players: string[];
  members: Person[];
  /** People asking to join; only the GM sees these. */
  requests: Person[];
  /** This account has asked to join and is waiting for the GM. */
  requested: boolean;
  requestJoin: () => Promise<void>;
  withdrawRequest: () => Promise<void>;
  /** GM only. */
  addPlayer: (email: string, name?: string) => Promise<void>;
  denyRequest: (email: string) => Promise<void>;
  removePlayer: (email: string) => Promise<void>;
}

const Ctx = createContext<Cloud | null>(null);

const knownKey = (email: string) => `crusade-dataslate:synced:${email}`;

function readKnown(email: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(knownKey(email)) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Signs in with Google and keeps the app state in step with the shared Firestore database. */
export function CloudProvider({ children }: { children: ReactNode }) {
  const { state, update } = useStore();
  const [fb, setFb] = useState<Firebase | null>(null);
  const [user, setUser] = useState<{ email: string; name: string | null } | null | undefined>(undefined);
  const [status, setStatus] = useState<CloudStatus>('loading');
  /** Whether the GM has let this account in; undefined while checking. */
  const [member, setMember] = useState<boolean | undefined>(undefined);
  const [requested, setRequested] = useState(false);
  const [members, setMembers] = useState<Person[]>([]);
  const [requests, setRequests] = useState<Person[]>([]);
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Local changes not yet handed to the engine; flushed before every remote snapshot. */
  const flushRef = useRef<(() => void) | null>(null);
  const transferRef = useRef<((forceId: string, to: string) => Promise<void>) | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    let alive = true;
    import('./firebase').then(
      (m) => {
        if (!alive) return;
        setFb(m);
        off = m.watchUser((u) => setUser(u?.email ? { email: u.email, name: u.displayName } : null));
      },
      (err) => {
        console.error(err);
        setStatus('error');
      },
    );
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const email = user?.email ?? null;
  const isGm = email === GM_EMAIL;

  // Is this account in the campaign? The GM always is; anyone else once the GM lets them in.
  useEffect(() => {
    setMember(undefined);
    setRequested(false);
    if (!fb || !email) return;
    if (email === GM_EMAIL) return setMember(true);
    const fail = (err: Error) => {
      console.error(err);
      setStatus('error');
      toast(`Couldn't check campaign membership: ${err.message}`, 'error');
    };
    const offs = [fb.watchOwn('members', email, setMember, fail), fb.watchOwn('requests', email, setRequested, fail)];
    return () => offs.forEach((o) => o());
  }, [fb, email]);

  useEffect(() => {
    setMembers([]);
    setRequests([]);
    if (!fb || !member) return;
    const fail = (err: Error) => console.error(err);
    const offs = [fb.watchPeople('members', setMembers, fail)];
    if (isGm) offs.push(fb.watchPeople('requests', setRequests, fail));
    return () => offs.forEach((o) => o());
  }, [fb, member, isGm]);

  useEffect(() => {
    if (!fb || user === undefined) return;
    if (!user) return setStatus('signed-out');
    if (member === undefined) return setStatus('loading');
    if (!member) return setStatus('not-member');
    const me = user.email;
    const images = new Map<string, string>();
    let cloudCampaignId: string | undefined;
    let stopped = false;
    const engine = new SyncEngine(
      {
        push: (d) => fb.push(d, images),
        remove: (path) => fb.remove(path),
        apply: async (path, json) => {
          if (json !== null) {
            const missing = imageRefs(json).filter((h) => !images.has(h));
            const got = await Promise.all(missing.map((h) => fb.fetchImage(h).catch(() => undefined)));
            missing.forEach((h, i) => got[i] && images.set(h, got[i]!));
          }
          if (stopped) return;
          update((d) => applyDoc(d, path, json === null ? null : fromCloudJson(json, images)));
        },
        canDelete: (r) =>
          r.path.startsWith('forces/') ? r.owner === me : r.path === CAMPAIGN_PATH || r.path === SETTINGS_PATH ? me === GM_EMAIL : true,
        readOnly: (path) =>
          toast(
            path.startsWith('forces/') ? "That force belongs to another player, so the change was undone." : 'Only the GM can change that, so the change was undone.',
            'error',
          ),
        failed: (path, err) => toast(`Couldn't sync ${path.split('/')[0]}: ${errorText(err)}`, 'error'),
        saveKnown: (paths) => {
          try {
            localStorage.setItem(knownKey(me), JSON.stringify(paths));
          } catch {
            // only used to notice deletions made elsewhere
          }
        },
      },
      readKnown(me),
    );

    let timer: number | undefined;
    const flush = () => {
      clearTimeout(timer);
      timer = undefined;
      engine.setLocal(localDocs(stateRef.current, { email: me, isGm: me === GM_EMAIL, cloudCampaignId }, images));
    };
    flushRef.current = () => {
      clearTimeout(timer);
      timer = window.setTimeout(flush, 400);
    };
    flush();

    // Written straight to the cloud: once the owner changes, the sync won't push this force any more.
    // The engine then pulls the new version back like any other remote change.
    transferRef.current = async (forceId, to) => {
      flush();
      const f = stateRef.current.forces.find((x) => x.id === forceId);
      if (!f || f.owner !== me) throw new Error("That force isn't yours to hand over.");
      const moved = { ...f, owner: to, updatedAt: new Date().toISOString() };
      await fb.push(
        { path: `forces/${f.id}`, json: toCloudJson(moved, images), updatedAt: moved.updatedAt, canWrite: true, fields: { owner: to } },
        images,
      );
    };

    setStatus('syncing');
    const ready = new Set<string>();
    const offs = COLLECTIONS.map((name) =>
      fb.listen(
        name,
        (docs, fromCache) => {
          if (timer !== undefined) flush();
          if (name === 'campaign') {
            const c = docs.find((d) => d.path === CAMPAIGN_PATH);
            const id = c ? (JSON.parse(c.json) as { id?: string }).id : undefined;
            if (id !== cloudCampaignId) {
              cloudCampaignId = id;
              flush();
            }
          }
          engine.setRemote(name, docs, fromCache);
          if (!fromCache) ready.add(name);
          if (ready.size === COLLECTIONS.length) setStatus('synced');
        },
        (err) => {
          console.error(err);
          setStatus('error');
          toast(
            /permission/i.test(err.message) ? `${me} isn't allowed into the campaign database.` : `Cloud sync stopped: ${err.message}`,
            'error',
          );
        },
      ),
    );
    return () => {
      stopped = true;
      clearTimeout(timer);
      flushRef.current = null;
      transferRef.current = null;
      offs.forEach((o) => o());
    };
  }, [fb, user, member, update]);

  useEffect(() => {
    flushRef.current?.();
  }, [state]);

  const signIn = useCallback(() => {
    if (!fb) return toast('Still connecting to the campaign. Try again in a moment.', 'error');
    fb.signIn().catch((err) => {
      if (!/popup-closed|cancelled-popup/.test(errorText(err))) toast(`Sign-in failed: ${errorText(err)}`, 'error');
    });
  }, [fb]);
  const signOut = useCallback(() => void fb?.signOutUser(), [fb]);
  const transfer = useCallback(async (forceId: string, to: string) => {
    if (!transferRef.current) throw new Error('Sign in to hand a force over.');
    await transferRef.current(forceId, to);
  }, []);

  const need = <T,>(v: T | null | undefined): T => {
    if (!v) throw new Error('Not signed in.');
    return v;
  };
  const requestJoin = useCallback(async () => void (await need(fb).requestToJoin(need(email), user?.name ?? '')), [fb, email, user]);
  const withdrawRequest = useCallback(async () => void (await need(fb).withdrawRequest(need(email))), [fb, email]);
  const addPlayer = useCallback(async (e: string, name?: string) => {
    const who = e.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(who)) throw new Error(`"${e}" isn't an email address.`);
    await need(fb).addMember(who, name ?? requests.find((r) => r.email === who)?.name ?? '');
  }, [fb, requests]);
  const denyRequest = useCallback(async (e: string) => void (await need(fb).withdrawRequest(e)), [fb]);
  const removePlayer = useCallback(async (e: string) => void (await need(fb).removeMember(e)), [fb]);
  const players = [GM_EMAIL, ...members.map((m) => m.email).filter((e) => e !== GM_EMAIL)];

  return (
    <Ctx.Provider
      value={{
        status: fb ? status : 'loading', email, name: user?.name ?? null, isGm, signIn, signOut, transfer,
        players, members, requests, requested, requestJoin, withdrawRequest, addPlayer, denyRequest, removePlayer,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCloud(): Cloud {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
