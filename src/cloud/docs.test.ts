import { describe, expect, it } from 'vitest';
import { applyDoc, fromCloudJson, imageRefs, localDocs, toCloudJson } from './docs';
import { buildSeedState } from '../model/seed';
import { newForce } from '../model/factory';

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
    s.forces[0].owner = 'me@x';
    s.forces[1].owner = 'them@x';
    const docs = localDocs(s, { email: 'me@x', isGm: false }, new Map());
    const forces = docs.filter((d) => d.path.startsWith('forces/'));
    expect(forces.map((d) => d.canWrite)).toEqual([true, false]);
    expect(docs.find((d) => d.path === 'shared/settings')?.canWrite).toBe(false);
  });

  it('applies and deletes forces by id', () => {
    const s = buildSeedState();
    const f = { ...s.forces[0], name: 'Renamed' };
    applyDoc(s, `forces/${f.id}`, f);
    expect(s.forces[0].name).toBe('Renamed');
    applyDoc(s, `forces/${f.id}`, null);
    expect(s.forces.find((x) => x.id === f.id)).toBeUndefined();
  });
});
