import { afterEach, describe, expect, it, vi } from 'vitest';
import { asCopy, exportBackup, exportCampaign, exportForce, interpretJson, normalizeCoreRules, readJsonFile } from './io';
import { newForce, newUnit } from './factory';
import { buildSeedState } from './seed';
import { RULES_VERSION } from '../rules/migrate';
import type { Campaign } from './types';
import rawDothea from '../data/spears-of-dothea.raw.json';

/** Catch what downloadJson would save, without a DOM. */
function captureDownloads() {
  const saved: { name: string; data: any }[] = [];
  const blobs = new Map<string, string>();
  let n = 0;
  vi.stubGlobal('document', {
    createElement: () => {
      const a = { href: '', download: '', click: () => saved.push({ name: a.download, data: JSON.parse(blobs.get(a.href)!) }) };
      return a;
    },
  });
  vi.stubGlobal('Blob', class {
    constructor(public parts: string[]) {}
  });
  vi.stubGlobal('URL', {
    createObjectURL: (b: { parts: string[] }) => {
      const url = `blob:${n++}`;
      blobs.set(url, b.parts.join(''));
      return url;
    },
    revokeObjectURL: () => {},
  });
  return saved;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('interpretJson', () => {
  it('reads an exported force back, migrating old rules names', () => {
    vi.useFakeTimers();
    const saved = captureDownloads();
    const f = newForce('Iron Wolves!');
    f.rulesVersion = 1;
    exportForce(f);
    vi.runAllTimers();
    expect(saved[0].name).toBe('iron-wolves.force.json');
    const got = interpretJson(saved[0].data);
    expect(got.kind).toBe('force');
    if (got.kind !== 'force') return;
    expect(got.force.id).toBe(f.id);
    expect(got.force.rulesVersion).toBe(RULES_VERSION);
  });

  it('names a force with no usable letters "force"', () => {
    const saved = captureDownloads();
    exportForce(newForce('???'));
    expect(saved[0].name).toBe('force.force.json');
  });

  it('reads a backup back as the whole state, without its kind marker', () => {
    const saved = captureDownloads();
    const s = buildSeedState();
    const f = newForce('Old');
    f.rulesVersion = 1;
    s.forces = [f];
    exportBackup(s);
    const got = interpretJson(saved[0].data);
    expect(got.kind).toBe('backup');
    if (got.kind !== 'backup') return;
    expect('kind' in got.state).toBe(false);
    expect(got.state.books.map((b) => b.uid)).toEqual(s.books.map((b) => b.uid));
    expect(got.state.forces[0].rulesVersion).toBe(RULES_VERSION);
  });

  it('migrates the old two-sided battle in a backup', () => {
    const s = buildSeedState();
    const battle = {
      id: 'b', vsAi: true, attacker: 'a', control: [['a', null, 'b']],
      sides: { a: { name: 'A', counters: { x: 1 } }, b: { name: 'B' } },
    };
    const got = interpretJson({ kind: 'opr-crusade-backup', ...s, battle });
    if (got.kind !== 'backup') throw new Error(got.kind);
    const b = got.state.battle as any;
    expect(b.sides.map((x: any) => [x.id, x.team, !!x.ai])).toEqual([['a', 'A', false], ['b', 'B', true]]);
    expect(b.control).toEqual([['A', null, 'B']]);
    expect(b.counters).toEqual({ A: { x: 1 }, B: {} });
  });

  it('reads an exported campaign back', () => {
    const saved = captureDownloads();
    const c = { id: 'c1', name: 'Nexus', sectors: [] } as unknown as Campaign;
    exportCampaign(c);
    expect(saved[0].name).toBe('campaign.json');
    expect(interpretJson(saved[0].data)).toEqual({ kind: 'campaign', campaign: c });
  });

  it('tells army books, core rules and Army Forge lists apart', () => {
    expect(interpretJson({ rules: [], traits: [] })).toEqual({ kind: 'coreRules', rules: [] });
    const list = { saveVersion: 1, armyId: 'x', list: { units: [] } };
    expect(interpretJson(list)).toEqual({ kind: 'armyList', raw: list });
    const book = interpretJson(rawDothea);
    expect(book.kind).toBe('book');
    if (book.kind === 'book') expect(book.book.uid).toBe(buildSeedState().books[0].uid);
  });

  it('refuses anything else, including a marker without its payload', () => {
    expect(() => interpretJson(null)).toThrow(/Unrecognized/);
    expect(() => interpretJson({ kind: 'opr-crusade-force' })).toThrow(/Unrecognized/);
    expect(() => interpretJson({ kind: 'opr-crusade-campaign', campaign: {} })).toThrow(/Unrecognized/);
    expect(() => interpretJson({ kind: 'opr-crusade-backup', forces: {} })).toThrow(/Unrecognized/);
  });
});

describe('normalizeCoreRules', () => {
  it('trims rules and drops broken or REMOVE entries', () => {
    const rules = normalizeCoreRules({
      rules: [{ name: ' AP ', description: ' Armor piercing. ' }, { name: 'Old REMOVE', description: 'x' }, { name: 'No desc' }, null],
      traits: [],
    });
    expect(rules).toEqual([{ name: 'AP', desc: 'Armor piercing.' }]);
  });
});

describe('readJsonFile', () => {
  it('parses a dropped file', async () => {
    const file = new File([JSON.stringify({ rules: [], traits: [] })], 'rules.json');
    expect(await readJsonFile(file)).toEqual({ kind: 'coreRules', rules: [] });
  });

  it('names the file when it is not JSON', async () => {
    await expect(readJsonFile(new File(['{oops'], 'broken.json'))).rejects.toThrow('broken.json is not valid JSON.');
  });

  it('passes on the reason a JSON file is not recognized', async () => {
    await expect(readJsonFile(new File(['{}'], 'empty.json'))).rejects.toThrow(/Unrecognized/);
  });
});

describe('asCopy', () => {
  it('gives the force and its units fresh ids, and keeps it on this device', () => {
    const f = { ...newForce('Wolves'), owner: 'me@x', units: [newUnit({ name: 'A' }), newUnit({ name: 'B' })] };
    const c = asCopy(f);
    expect(c.id).not.toBe(f.id);
    expect(c.name).toBe('Wolves (copy)');
    expect(c.owner).toBeUndefined();
    expect(c.units.map((u) => u.name)).toEqual(['A', 'B']);
    expect(c.units.every((u, i) => u.id !== f.units[i].id)).toBe(true);
    expect(new Set(c.units.map((u) => u.id)).size).toBe(2);
    // The original is untouched.
    expect(f.owner).toBe('me@x');
  });

  it("keeps the copy's battle lists pointing at its own units", () => {
    const hero = newUnit({ name: 'Hero' });
    const squad = newUnit({ name: 'Squad' });
    const f = {
      ...newForce('Wolves'),
      units: [hero, squad],
      lists: [{ id: 'l', name: 'L', pointsLimit: 1000, unitIds: [squad.id, hero.id], joins: { [hero.id]: squad.id }, notes: '', glossary: false, compact: false }],
    };
    const c = asCopy(f);
    const [cHero, cSquad] = c.units;
    expect(c.lists![0].unitIds).toEqual([cSquad.id, cHero.id]);
    expect(c.lists![0].joins).toEqual({ [cHero.id]: cSquad.id });
    expect(f.lists[0].unitIds).toEqual([squad.id, hero.id]);
  });

  it("keeps the units that already fought this round marked on the copy", () => {
    const u = newUnit();
    const f = {
      ...newForce('Wolves'),
      units: [u],
      nexus: { factionId: 'f', permanentTables: [], tempTables: [], traitTokens: 0, pending: [], usedUnits: { round: 2, ids: [u.id] } },
    };
    const c = asCopy(f);
    expect(c.nexus!.usedUnits).toEqual({ round: 2, ids: [c.units[0].id] });
    expect(f.nexus.usedUnits.ids).toEqual([u.id]);
  });
});
