/**
 * How the app state maps onto cloud documents. Pictures are moved out into their own documents
 * ("images/<hash>"), because a Firestore document holds at most 1 MB and a force with unit art
 * would go over it. In the cloud copy each picture is replaced by "img:<hash>".
 */
import type { AppState, Force, Settings } from '../model/types';
import type { LocalDoc } from './sync';

export const IMG_PREFIX = 'img:';

/** Collections the app listens to (pictures are fetched on demand). */
export const COLLECTIONS = ['forces', 'campaign', 'books', 'shared'] as const;

export const CAMPAIGN_PATH = 'campaign/current';
export const SETTINGS_PATH = 'shared/settings';
export const CORE_RULES_PATH = 'shared/coreRules';
export const MISSIONS_PATH = 'shared/missions';

const hashes = new Map<string, string>();

/** A fast fingerprint of a picture (cyrb53), remembered so big pictures are hashed once. */
export function imageHash(dataUrl: string): string {
  let h = hashes.get(dataUrl);
  if (h) return h;
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < dataUrl.length; i++) {
    const c = dataUrl.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  h = (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36) + dataUrl.length.toString(36);
  hashes.set(dataUrl, h);
  return h;
}

/** JSON of a value with its pictures swapped for references; the pictures go into `images`. */
export function toCloudJson(value: unknown, images: Map<string, string>): string {
  return JSON.stringify(value, (key, v) => {
    if (key === 'image' && typeof v === 'string' && v.startsWith('data:')) {
      const h = imageHash(v);
      images.set(h, v);
      return IMG_PREFIX + h;
    }
    return v;
  });
}

export function imageRefs(json: string): string[] {
  return [...json.matchAll(/"image":"img:([a-z0-9]+)"/g)].map((m) => m[1]);
}

/** Parse a cloud copy, swapping picture references back for the pictures that could be found. */
export function fromCloudJson<T>(json: string, images: Map<string, string>): T {
  return JSON.parse(json, (key, v) =>
    key === 'image' && typeof v === 'string' && v.startsWith(IMG_PREFIX) ? images.get(v.slice(IMG_PREFIX.length)) ?? v : v,
  ) as T;
}

/** The house rules the GM sets for everyone (the Army Forge proxy stays per device). */
export const sharedSettings = (s: Settings) => ({ supplyPerRp: s.supplyPerRp, bp: s.bp });

export interface Who {
  email: string;
  isGm: boolean;
  /** Id of the campaign in the cloud, if any: players may update it but not replace it. */
  cloudCampaignId?: string;
}

/** Everything in the state that syncs. Forces without an owner stay on this device. */
export function localDocs(state: AppState, who: Who, images: Map<string, string>): LocalDoc[] {
  const docs: LocalDoc[] = [];
  for (const f of state.forces) {
    if (!f.owner) continue;
    docs.push({ path: `forces/${f.id}`, json: toCloudJson(f, images), updatedAt: f.updatedAt, canWrite: f.owner === who.email, fields: { owner: f.owner } });
  }
  const c = state.campaign;
  if (c) {
    docs.push({ path: CAMPAIGN_PATH, json: toCloudJson(c, images), updatedAt: c.updatedAt, canWrite: who.isGm || c.id === who.cloudCampaignId, fields: { id: c.id } });
  }
  for (const b of state.books) docs.push({ path: `books/${b.uid}`, json: toCloudJson(b, images), updatedAt: b.updatedAt ?? '', canWrite: true });
  docs.push({ path: SETTINGS_PATH, json: JSON.stringify(sharedSettings(state.settings)), updatedAt: '', canWrite: who.isGm });
  if (state.coreRules) docs.push({ path: CORE_RULES_PATH, json: JSON.stringify(state.coreRules), updatedAt: '', canWrite: true });
  const missions = state.customMissions;
  if (missions) {
    const updatedAt = missions.reduce((t, m) => (m.updatedAt && m.updatedAt > t ? m.updatedAt : t), '');
    docs.push({ path: MISSIONS_PATH, json: JSON.stringify(missions), updatedAt, canWrite: true });
  }
  return docs;
}

/** Put a cloud copy (or its deletion, when `value` is null) into the state. */
export function applyDoc(d: AppState, path: string, value: unknown): void {
  const [col, id] = path.split('/');
  if (col === 'forces') {
    const i = d.forces.findIndex((f) => f.id === id);
    if (value === null) {
      if (i >= 0) d.forces.splice(i, 1);
    } else if (i >= 0) d.forces[i] = value as Force;
    else d.forces.push(value as Force);
  } else if (col === 'books') {
    d.books = d.books.filter((b) => b.uid !== id);
    if (value !== null) d.books.push(value as AppState['books'][number]);
  } else if (path === CAMPAIGN_PATH) {
    d.campaign = value === null ? undefined : (value as AppState['campaign']);
  } else if (path === SETTINGS_PATH) {
    if (value !== null) d.settings = { ...d.settings, ...(value as ReturnType<typeof sharedSettings>) };
  } else if (path === CORE_RULES_PATH) {
    d.coreRules = value === null ? undefined : (value as AppState['coreRules']);
  } else if (path === MISSIONS_PATH) {
    d.customMissions = value === null ? undefined : (value as AppState['customMissions']);
  }
}
