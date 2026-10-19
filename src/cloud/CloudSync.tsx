import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../model/store';
import { toast } from '../components/ui';
import { GM_EMAIL, PLAYER_EMAILS } from './config';
import { applyDoc, CAMPAIGN_PATH, COLLECTIONS, fromCloudJson, imageRefs, localDocs, SETTINGS_PATH } from './docs';
import { SyncEngine } from './sync';

type Firebase = typeof import('./firebase');

export type CloudStatus = 'loading' | 'signed-out' | 'syncing' | 'synced' | 'error';

interface Cloud {
  status: CloudStatus;
  /** Signed-in Google account, or null. */
  email: string | null;
  name: string | null;
  isGm: boolean;
  signIn: () => void;
  signOut: () => void;
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
  const stateRef = useRef(state);
  stateRef.current = state;
  /** Local changes not yet handed to the engine; flushed before every remote snapshot. */
  const flushRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    if (!fb || user === undefined) return;
    if (!user) return setStatus('signed-out');
    if (!PLAYER_EMAILS.includes(user.email)) {
      setStatus('error');
      toast(`${user.email} isn't on the campaign's player list. Ask the GM to add it.`, 'error');
      return;
    }
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
      offs.forEach((o) => o());
    };
  }, [fb, user, update]);

  useEffect(() => {
    flushRef.current?.();
  }, [state]);

  const signIn = useCallback(() => {
    fb?.signIn().catch((err) => {
      if (!/popup-closed|cancelled-popup/.test(errorText(err))) toast(`Sign-in failed: ${errorText(err)}`, 'error');
    });
  }, [fb]);
  const signOut = useCallback(() => void fb?.signOutUser(), [fb]);

  return (
    <Ctx.Provider value={{ status: fb ? status : 'loading', email, name: user?.name ?? null, isGm, signIn, signOut }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCloud(): Cloud {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud outside CloudProvider');
  return c;
}
