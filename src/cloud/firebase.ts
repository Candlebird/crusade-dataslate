/** Everything that touches the Firebase SDK. Loaded on demand so the app starts without it. */
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getFirestore, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { imageRefs } from './docs';
import type { LocalDoc, RemoteDoc } from './sync';
import type { Declared, OrderRound, PlayerOrders } from '../rules/orders';

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

/** Someone on the campaign (members/<email>) or asking to join it (requests/<email>). */
export interface Person {
  email: string;
  name: string;
  at: string;
}

const toPerson = (id: string, v: Record<string, unknown>): Person => ({ email: id, name: String(v.name ?? ''), at: String(v.at ?? '') });

export function watchPeople(name: 'members' | 'requests', cb: (people: Person[]) => void, onError: (err: Error) => void): () => void {
  return onSnapshot(collection(db, name), (snap) => cb(snap.docs.map((d) => toPerson(d.id, d.data()))), onError);
}

/** Whether this user's own member / request document exists. */
export function watchOwn(name: 'members' | 'requests', email: string, cb: (exists: boolean) => void, onError: (err: Error) => void): () => void {
  return onSnapshot(doc(db, name, email), (snap) => cb(snap.exists()), onError);
}

export const requestToJoin = (email: string, name: string) => setDoc(doc(db, 'requests', email), { email, name, at: new Date().toISOString() });
export const withdrawRequest = (email: string) => deleteDoc(doc(db, 'requests', email));

/** GM only: let someone in, clearing their request if they made one. */
export async function addMember(email: string, name: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, 'members', email), { email, name, at: new Date().toISOString() });
  batch.delete(doc(db, 'requests', email));
  await batch.commit();
}

export const removeMember = (email: string) => deleteDoc(doc(db, 'members', email));

// ---- Nexus Wars sealed orders: kept out of the app state so nobody's picks sit on another device before the reveal ----

/** orderRound/current, or null before the GM opens the first round. */
export function watchRound(cb: (r: OrderRound | null) => void, onError: (err: Error) => void): () => void {
  return onSnapshot(doc(db, 'orderRound', 'current'), (snap) => cb(snap.exists() ? (snap.data() as OrderRound) : null), onError);
}

/** This player's own orders (email), or everyone's once revealed (null). */
export function watchOrders(email: string | null, cb: (orders: PlayerOrders[]) => void, onError: (err: Error) => void): () => void {
  const toOrders = (id: string, v: Record<string, unknown>): PlayerOrders => ({ email: id, round: Number(v.round ?? 0), picks: (v.picks ?? {}) as Record<string, string> });
  if (email) return onSnapshot(doc(db, 'orders', email), (snap) => cb(snap.exists() ? [toOrders(snap.id, snap.data())] : []), onError);
  return onSnapshot(collection(db, 'orders'), (snap) => cb(snap.docs.map((d) => toOrders(d.id, d.data()))), onError);
}

export function watchDeclared(cb: (d: Declared[]) => void, onError: (err: Error) => void): () => void {
  return onSnapshot(
    collection(db, 'declared'),
    (snap) => cb(snap.docs.map((d) => ({ email: d.id, round: Number(d.data().round ?? 0), factions: (d.data().factions ?? []) as string[] }))),
    onError,
  );
}

/** Seal this player's orders, and tell everyone which factions have declared. */
export async function saveOrders(email: string, round: number, picks: Record<string, string>): Promise<void> {
  const at = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, 'orders', email), { round, picks, at });
  batch.set(doc(db, 'declared', email), { round, factions: Object.keys(picks), at });
  await batch.commit();
}

/** GM only: open a round, or reveal it. */
export const setRound = (r: OrderRound) => setDoc(doc(db, 'orderRound', 'current'), r);
