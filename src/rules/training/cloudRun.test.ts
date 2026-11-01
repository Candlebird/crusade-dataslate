import { describe, expect, it } from 'vitest';
import { CLOUD_LOG_KEEP, CLOUD_RUN_MAX_BYTES, cloudRunJson, cloudRunOf, cloudSave, movedOn, newerSave, utf8Bytes } from './cloudRun';
import { N } from './map';
import { shardPiece } from './shards';
import { blankRun, testUnit } from './testRun';
import type { SavedRun } from './types';

const at = '2026-10-31T12:00:00.000Z';

describe('cloud runs', () => {
  it('round-trip a run, keeping only the last log lines', () => {
    const run = blankRun();
    run.log = Array.from({ length: 500 }, (_, i) => `line ${i}`);
    run.pieces = [testUnit({ id: 1 })];
    const c = cloudRunOf(run, 'me@x', 'pc', at)!;
    expect(c.saved.run.log).toHaveLength(CLOUD_LOG_KEEP);
    expect(c.saved.run.log[CLOUD_LOG_KEEP - 1]).toBe('line 499');
    expect(run.log).toHaveLength(500); // the run itself is untouched
    const back = cloudSave(JSON.parse(cloudRunJson(c)), 'f')!;
    expect(back.savedAt).toBe(at);
    expect(back.run.pieces).toEqual(run.pieces);
  });

  it('only offers a playable save of the right force', () => {
    const c = cloudRunOf(blankRun(), 'me@x', 'pc', at)!;
    expect(cloudSave(c, 'other')).toBeNull();
    expect(cloudSave(undefined, 'f')).toBeNull();
    expect(cloudSave({ ...c, saved: { ...c.saved, v: 1 as 10 } }, 'f')).toBeNull();
    const over = blankRun();
    over.phase = 'over';
    expect(cloudSave(cloudRunOf(over, 'me@x', 'pc', at)!, 'f')).toBeNull();
  });

  it('resumes the newer save, and spots a run that moved on on another device', () => {
    const s = (savedAt: string): SavedRun => ({ v: 10, savedAt, run: blankRun() });
    expect(newerSave(s('2026-10-31T10:00:00Z'), s('2026-10-31T11:00:00Z'))?.savedAt).toBe('2026-10-31T11:00:00Z');
    expect(newerSave(s('2026-10-31T12:00:00Z'), s('2026-10-31T11:00:00Z'))?.savedAt).toBe('2026-10-31T12:00:00Z');
    expect(newerSave(null, s(at))?.savedAt).toBe(at);
    expect(newerSave(null, null)).toBeNull();
    const c = cloudRunOf(blankRun(), 'me@x', 'phone', at)!;
    expect(movedOn(c, 'pc', '2026-10-31T11:00:00.000Z')).toBe(true);
    expect(movedOn(c, 'pc', at)).toBe(false);
    expect(movedOn(c, 'phone', '2026-10-31T11:00:00.000Z')).toBe(false); // its own write
    expect(movedOn(undefined, 'pc', '')).toBe(false);
  });

  it('fits in a Firestore document even with the whole map built over', () => {
    // Far beyond any real run (measured at 28–44 KB): every 2×2 spot on the map holds a piece (no route, spawn or pads
    // left), the first 120 of them crafted units (each unit is crafted at most once; forces hold far fewer) loaded with
    // four guns, long names, skills, relics and quirks, the rest Shards carrying every card bonus, and a long non-ASCII log.
    const run = blankRun();
    run.forceId = 'f'.repeat(36);
    const gun = testUnit().guns[0];
    const guns = Array.from({ length: 4 }, (_, i) => ({ ...gun, name: `Heavy Twin-Linked Weapon Ω ${i}` }));
    const skills = Array.from({ length: 8 }, (_, i) => ({ name: `Skill with a long name ${i} ✦`, kind: 'aura', stat: 'hit', value: 1, range: 6, every: 10, left: 3.5 }));
    const relics = Array.from({ length: 3 }, (_, i) => ({ id: `relic-${i}`, name: `Relic of the Long Name ${i}`, act: 'barrage', every: 12, left: 4.25, power: 3 }));
    const extra = { rush: { mul: 0.25, left: 3.5 }, crossfire: 0.2, chain: { per: 0.05, stacks: 5, left: 2.5 }, kills: 99999, dealt: 9999999.123 };
    for (let x = 0; x + 1 < N; x += 2)
      for (let y = 0; y + 1 < N; y += 2) {
        const id = run.pieces.length + 1;
        if (id <= 120)
          run.pieces.push(testUnit({
            id, x, y, name: 'Veteran Heavy Weapon Squad Ω'.repeat(2), unitId: 'u'.repeat(36), guns, skills: skills as never, ...extra,
            relics: relics as never, quirks: ['Steady', 'Grim', 'Hunter'], tally: { shot: 1e6, melee: 1e6, holds: 999 }, grit: 1.2, brace: 2,
          }));
        else run.pieces.push({ ...shardPiece(id, { x, y }, 'firepower', 5, false), ...extra });
      }
    run.log = Array.from({ length: 2000 }, (_, i) => `Wave ${i}: ★ ${'é'.repeat(120)}`);
    const c = cloudRunOf(run, 'someone.with.a.long.email@example.com', 'd'.repeat(36), at);
    expect(c).not.toBeNull();
    const bytes = utf8Bytes(cloudRunJson(c!));
    console.log(`whole map built over: ${run.pieces.length} pieces, ${bytes} bytes`);
    expect(bytes).toBeLessThan(CLOUD_RUN_MAX_BYTES);
  });

  it('refuses (rather than write) a run too big for a document', () => {
    const run = blankRun();
    run.pieces = [testUnit({ id: 1, name: 'x'.repeat(CLOUD_RUN_MAX_BYTES) })];
    expect(cloudRunOf(run, 'me@x', 'pc', at)).toBeNull();
  });
});
