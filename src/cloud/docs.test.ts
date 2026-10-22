import { describe, expect, it } from 'vitest';
import { applyDoc, fromCloudJson, imageHash, imageRefs, localDocs, toCloudJson } from './docs';
import type { Campaign } from '../model/types';
import { buildSeedState } from '../model/seed';
import { newForce } from '../model/factory';
import { EXAMPLE_MISSION } from '../rules/missions';
import { newBattle } from '../rules/tracker';

describe('cloud docs', () => {
  it('moves pictures out of the JSON and back', () => {
    const f = { ...newForce('Pics'), image: 'data:image/jpeg;base64,AAAA', units: [] };
    const images = new Map<string, string>();
    const json = toCloudJson(f, images);
    expect(json).not.toContain('data:');
    expect(imageRefs(json)).toEqual([...images.keys()]);
    expect(fromCloudJson(json, images)).toEqual(f);
    // Without the picture the reference stays, so the copy still matches the cloud one.
    expect(toCloudJson(fromCloudJson(json, new Map()), new Map())).toBe(json);
  });

  it('syncs only owned forces, and lets players write only their own', () => {
    const s = buildSeedState();
    s.forces = [newForce('Mine'), newForce('Theirs')];
    s.forces[0].owner = 'me@x';
    s.forces[1].owner = 'them@x';
    const docs = localDocs(s, { email: 'me@x', isGm: false }, new Map());
    const forces = docs.filter((d) => d.path.startsWith('forces/'));
    expect(forces.map((d) => d.canWrite)).toEqual([true, false]);
    expect(docs.find((d) => d.path === 'shared/settings')?.canWrite).toBe(false);
  });

  it('applies and deletes forces by id', () => {
    const s = buildSeedState();
    s.forces = [newForce('Applied')];
    const f = { ...s.forces[0], name: 'Renamed' };
    applyDoc(s, `forces/${f.id}`, f);
    expect(s.forces[0].name).toBe('Renamed');
    applyDoc(s, `forces/${f.id}`, null);
    expect(s.forces.find((x) => x.id === f.id)).toBeUndefined();
  });

  it('shares finished battles with the group, newest first', () => {
    const s = buildSeedState();
    const old = { ...newBattle(EXAMPLE_MISSION, 'b1', ''), ended: true, finishedAt: '2026-10-01T00:00:00Z' };
    const recent = { ...newBattle(EXAMPLE_MISSION, 'b2', ''), ended: true, finishedAt: '2026-10-19T00:00:00Z' };
    s.battleHistory = [old];
    const doc = localDocs(s, { email: 'me@x', isGm: false }, new Map()).find((d) => d.path === 'battles/b1');
    expect(doc).toMatchObject({ updatedAt: old.finishedAt, canWrite: true });
    applyDoc(s, 'battles/b2', recent);
    expect(s.battleHistory.map((b) => b.id)).toEqual(['b2', 'b1']);
    applyDoc(s, 'battles/b1', null);
    expect(s.battleHistory.map((b) => b.id)).toEqual(['b2']);
  });

  it('keeps forces without an owner on this device', () => {
    const s = buildSeedState();
    s.forces = [newForce('Local')];
    expect(localDocs(s, { email: 'me@x', isGm: true }, new Map()).some((d) => d.path.startsWith('forces/'))).toBe(false);
  });

  it('lets players update the cloud campaign but not replace it', () => {
    const s = buildSeedState();
    s.campaign = { id: 'c1', name: 'C', sectors: [], updatedAt: '2026-01-01' } as unknown as Campaign;
    const camp = (who: Parameters<typeof localDocs>[1]) => localDocs(s, who, new Map()).find((d) => d.path === 'campaign/current');
    expect(camp({ email: 'p@x', isGm: false, cloudCampaignId: 'c1' })).toMatchObject({ canWrite: true, fields: { id: 'c1' }, updatedAt: '2026-01-01' });
    expect(camp({ email: 'p@x', isGm: false, cloudCampaignId: 'other' })?.canWrite).toBe(false);
    expect(camp({ email: 'p@x', isGm: false })?.canWrite).toBe(false);
    expect(camp({ email: 'gm@x', isGm: true, cloudCampaignId: 'other' })?.canWrite).toBe(true);
  });

  it('shares only the house rules, not the Army Forge proxy', () => {
    const s = buildSeedState();
    s.settings.armyForgeProxy = 'https://proxy';
    s.settings.supplyPerRp = 123;
    const doc = localDocs(s, { email: 'gm@x', isGm: true }, new Map()).find((d) => d.path === 'shared/settings')!;
    expect(JSON.parse(doc.json)).toEqual({ supplyPerRp: 123, bp: s.settings.bp });
    s.settings.supplyPerRp = 1;
    applyDoc(s, 'shared/settings', JSON.parse(doc.json));
    expect(s.settings).toMatchObject({ supplyPerRp: 123, armyForgeProxy: 'https://proxy' });
    // Deleting the shared settings never wipes the local ones.
    applyDoc(s, 'shared/settings', null);
    expect(s.settings.supplyPerRp).toBe(123);
  });

  it('dates the custom missions by the newest one', () => {
    const s = buildSeedState();
    s.customMissions = [
      { ...EXAMPLE_MISSION, id: 'm1', updatedAt: '2026-03-01' },
      { ...EXAMPLE_MISSION, id: 'm2', updatedAt: '2026-05-01' },
      { ...EXAMPLE_MISSION, id: 'm3' },
    ];
    const doc = localDocs(s, { email: 'p@x', isGm: false }, new Map()).find((d) => d.path === 'shared/missions');
    expect(doc).toMatchObject({ updatedAt: '2026-05-01', canWrite: true });
  });

  it('applies and deletes books, the campaign, core rules and missions', () => {
    const s = buildSeedState();
    const book = { ...s.books[0], name: 'Changed' };
    applyDoc(s, `books/${book.uid}`, book);
    expect(s.books.map((b) => b.name)).toEqual(['Changed']);
    applyDoc(s, `books/${book.uid}`, null);
    expect(s.books).toEqual([]);
    applyDoc(s, 'campaign/current', { id: 'c' });
    expect(s.campaign).toEqual({ id: 'c' });
    applyDoc(s, 'campaign/current', null);
    expect(s.campaign).toBeUndefined();
    applyDoc(s, 'shared/coreRules', [{ name: 'AP', desc: 'x' }]);
    expect(s.coreRules).toEqual([{ name: 'AP', desc: 'x' }]);
    applyDoc(s, 'shared/coreRules', null);
    expect(s.coreRules).toBeUndefined();
    applyDoc(s, 'shared/missions', [EXAMPLE_MISSION]);
    expect(s.customMissions).toEqual([EXAMPLE_MISSION]);
    applyDoc(s, 'shared/missions', null);
    expect(s.customMissions).toBeUndefined();
  });

  it('ignores documents it does not know', () => {
    const s = buildSeedState();
    const before = structuredClone(s);
    applyDoc(s, 'shared/unknown', { x: 1 });
    applyDoc(s, 'images/abc', 'data:...');
    expect(s).toEqual(before);
  });

  it('round-trips a synced state through the cloud documents', () => {
    const s = buildSeedState();
    const f = { ...newForce('Mine'), owner: 'me@x', image: 'data:image/png;base64,BBBB' };
    s.forces = [f];
    s.coreRules = [{ name: 'AP', desc: 'x' }];
    const images = new Map<string, string>();
    const docs = localDocs(s, { email: 'me@x', isGm: true }, images);
    const t = buildSeedState();
    t.books = [];
    for (const d of docs) applyDoc(t, d.path, fromCloudJson(d.json, images));
    expect(t.forces).toEqual(s.forces);
    expect(t.books).toEqual(s.books);
    expect(t.coreRules).toEqual(s.coreRules);
    expect(localDocs(t, { email: 'me@x', isGm: true }, new Map()).map((d) => d.json)).toEqual(docs.map((d) => d.json));
  });

  it('fingerprints pictures stably, and tells different ones apart', () => {
    expect(imageHash('data:a')).toBe(imageHash('data:a'));
    expect(imageHash('data:a')).not.toBe(imageHash('data:b'));
    expect(imageHash('data:a')).toMatch(/^[a-z0-9]+$/);
  });

  it('leaves pictures that are already links alone', () => {
    const images = new Map<string, string>();
    const json = toCloudJson({ image: 'https://example.com/x.png', name: 'image' }, images);
    expect(images.size).toBe(0);
    expect(JSON.parse(json)).toEqual({ image: 'https://example.com/x.png', name: 'image' });
  });
});
