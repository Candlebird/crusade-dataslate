/** Everything that touches the Firebase SDK. Loaded on demand so the app starts without it. */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { imageRefs } from './docs';
import type { LocalDoc, RemoteDoc } from './sync';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export type { User };

export const watchUser = (cb: (u: User | null) => void) => onAuthStateChanged(auth, cb);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider()).then(() => undefined);
export const signOutUser = () => signOut(auth);

export function listen(
  name: string,
  cb: (docs: RemoteDoc[], fromCache: boolean) => void,
  onError: (err: Error) => void,
): () => void {
  return onSnapshot(
    collection(db, name),
    { includeMetadataChanges: true },
    (snap) =>
      cb(
        snap.docs.map((d) => {
          const v = d.data();
          return {
            path: `${name}/${d.id}`,
            json: String(v.data ?? ''),
            updatedAt: String(v.updatedAt ?? ''),
            owner: v.owner as string | undefined,
            confirmed: !d.metadata.hasPendingWrites,
          };
        }),
        snap.metadata.fromCache,
      ),
    onError,
  );
}

/** Pictures this session has already uploaded, so they aren't sent again with every edit. */
const uploaded = new Set<string>();

/** Write a document together with any of its pictures that aren't up yet. */
export async function push(d: LocalDoc, images: Map<string, string>): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, d.path), { data: d.json, updatedAt: d.updatedAt, ...d.fields });
  const sent = imageRefs(d.json).filter((h) => !uploaded.has(h) && images.has(h));
  for (const h of sent) batch.set(doc(db, 'images', h), { data: images.get(h) });
  await batch.commit();
  for (const h of sent) uploaded.add(h);
}

export async function remove(path: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, path));
  await batch.commit();
}

export async function fetchImage(hash: string): Promise<string | undefined> {
  const snap = await getDoc(doc(db, 'images', hash));
  const data = snap.data()?.data;
  if (typeof data !== 'string') return undefined;
  uploaded.add(hash);
  return data;
}
