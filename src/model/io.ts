import type { AppState, Campaign, Force } from './types';
import { normalizeBook } from '../armyforge/book';
import type { CatalogBook } from './types';
import { uid } from './factory';

const FORCE_KIND = 'opr-crusade-force';
const BACKUP_KIND = 'opr-crusade-backup';
const CAMPAIGN_KIND = 'opr-crusade-campaign';

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'force';

export function exportForce(f: Force) {
  downloadJson(`${slug(f.name)}.force.json`, { kind: FORCE_KIND, version: 1, exportedAt: new Date().toISOString(), force: f });
}

export function exportBackup(s: AppState) {
  downloadJson(`crusade-backup-${new Date().toISOString().slice(0, 10)}.json`, { kind: BACKUP_KIND, ...s });
}

export function exportCampaign(c: Campaign) {
  downloadJson('campaign.json', { kind: CAMPAIGN_KIND, version: 1, exportedAt: new Date().toISOString(), campaign: c });
}

export type Imported =
  | { kind: 'force'; force: Force }
  | { kind: 'backup'; state: AppState }
  | { kind: 'book'; book: CatalogBook }
  | { kind: 'campaign'; campaign: Campaign };

/** Detect what a dropped JSON file is: a force, a full backup, or a raw Army Forge army book. */
export function interpretJson(data: any): Imported {
  if (data?.kind === FORCE_KIND && data.force) return { kind: 'force', force: data.force };
  if (data?.kind === CAMPAIGN_KIND && Array.isArray(data.campaign?.sectors)) return { kind: 'campaign', campaign: data.campaign };
  if (data?.kind === BACKUP_KIND && Array.isArray(data.forces)) {
    const { kind: _k, ...state } = data;
    return { kind: 'backup', state: state as AppState };
  }
  if (Array.isArray(data?.units) && Array.isArray(data?.upgradePackages)) return { kind: 'book', book: normalizeBook(data) };
  throw new Error('Unrecognized file. Expected a .force.json, a campaign.json, a backup, or an Army Forge army book.');
}

export async function readJsonFile(file: File): Promise<Imported> {
  const text = await file.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  return interpretJson(data);
}

/** Give an imported force fresh ids if one with the same id already exists (keeps both copies). */
export function asCopy(f: Force): Force {
  return { ...f, id: uid(), name: `${f.name} (copy)`, units: f.units.map((u) => ({ ...u, id: uid() })) };
}

export function readImageAsDataUrl(file: File, maxSize = 512): Promise<string> {
  // Downscale so pictures don't blow the localStorage quota.
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.85));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Could not read image.'));
    img.src = URL.createObjectURL(file);
  });
}
