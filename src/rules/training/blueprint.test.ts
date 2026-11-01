import { describe, expect, it } from 'vitest';
import { blueprintCode, ghostSpots, inRunsId, markInRuns, mazeLength, myBlueprints, openLength, readBlueprintCode, spotProblem, toggleSpot, type Blueprint } from './blueprint';
import { blankRun } from './testRun';
import type { Tile } from './map';

// A short wall across the first leg's open ground, well clear of the spawn corner and the pads.
const wall: Tile[] = [{ x: 14, y: 12 }, { x: 16, y: 12 }, { x: 18, y: 12 }];

describe('blueprint spots', () => {
  it('follow the build rules against the plan', () => {
    expect(spotProblem([], 14, 12)).toBeNull();
    expect(spotProblem(wall, 15, 13)).toMatch(/overlaps/);
    expect(spotProblem([], 4, 4)).not.toBeNull(); // the spawn
    expect(spotProblem([], 4, 24)).not.toBeNull(); // a pad
  });

  it('toggle: a click on a planned piece takes it away, elsewhere adds one', () => {
    const added = toggleSpot(wall, { x: 30, y: 30 }, { x: 30, y: 30 });
    expect(added.spots).toHaveLength(4);
    const gone = toggleSpot(added.spots, { x: 15, y: 13 }, { x: 14, y: 12 });
    expect(gone.spots).toEqual([wall[1], wall[2], { x: 30, y: 30 }]);
    const no = toggleSpot([], { x: 4, y: 4 }, { x: 4, y: 4 });
    expect(no.spots).toEqual([]);
    expect(no.why).toBeTruthy();
  });

  it('measure the route through the plan', () => {
    expect(mazeLength([])).toBe(openLength());
    expect(mazeLength(wall)).toBeGreaterThanOrEqual(openLength());
  });
});

describe('blueprint ghosts', () => {
  it('show each spot as filled, blocked or open in a run', () => {
    const run = blankRun();
    run.pieces = [{ id: 1, kind: 'rubble', x: 14, y: 12 }, { id: 2, kind: 'rubble', x: 17, y: 13 }];
    expect(ghostSpots(run, wall).map((g) => [g.state, g.n])).toEqual([['filled', 1], ['blocked', 2], ['blocked', 3]]);
    expect(ghostSpots(blankRun(), wall).every((g) => g.state === 'open')).toBe(true);
  });
});

describe('blueprint share codes', () => {
  it('round-trip a name and its spots', () => {
    const code = blueprintCode({ name: 'Zig: zag', spots: [...wall, { x: 60, y: 59 }] });
    expect(code.startsWith('MB1:')).toBe(true);
    expect(readBlueprintCode(`  ${code}\n`)).toEqual({ name: 'Zig: zag', spots: [...wall, { x: 60, y: 59 }], dropped: 0 });
  });

  it('drop spots that cannot stand and refuse what is not a code', () => {
    const bad = blueprintCode({ name: 'x', spots: [wall[0], { x: 15, y: 13 }, { x: 4, y: 4 }] });
    expect(readBlueprintCode(bad)).toMatchObject({ spots: [wall[0]], dropped: 2 });
    expect(readBlueprintCode('hello')).toBeNull();
    expect(readBlueprintCode('MB1:x:ABC')).toBeNull();
    expect(readBlueprintCode('MB1::')).toEqual({ name: 'Shared maze', spots: [], dropped: 0 });
  });
});

it('a player sees their own blueprints and unsigned ones', () => {
  const b = (id: string, owner: string): Blueprint => ({ id, owner, name: id, updatedAt: '', spots: [] });
  expect(myBlueprints([b('a', 'me@x'), b('b', 'them@x'), b('c', '')], 'me@x').map((x) => x.id)).toEqual(['a', 'c']);
});

describe('the blueprint in runs', () => {
  const b = (id: string, inRuns?: boolean): Blueprint => ({ id, owner: 'me@x', name: id, updatedAt: '', spots: [], ...(inRuns ? { inRuns } : {}) });
  it('is the one marked on the account, else this device\'s old pick if still the player\'s', () => {
    expect(inRunsId([b('a'), b('b', true)], 'a')).toBe('b');
    expect(inRunsId([b('a'), b('b')], 'a')).toBe('a');
    expect(inRunsId([b('a')], 'gone')).toBeNull();
  });
  it('marking one unmarks the rest', () => {
    expect(markInRuns([b('a', true), b('b'), b('c')], 'b').map((x) => x.id)).toEqual(['a', 'b']);
    expect(markInRuns([b('a', true), b('b')], null).map((x) => x.id)).toEqual(['a']);
    expect(markInRuns([b('a', true)], 'a')).toEqual([]);
  });
});
