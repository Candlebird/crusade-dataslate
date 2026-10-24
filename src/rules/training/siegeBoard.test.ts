import { describe, expect, it } from 'vitest';
import type { Campaign, Force } from '../../model/types';
import { NEXUS_ROUNDS } from '../nexusData';
import { assetsOf } from '../rounds';
import { TRAINING } from '../downtimeData';
import { lastSiegeWin, postSiege, settleSieges, siegeAssets, siegeRanking, weeksDue } from './siegeBoard';
import { blankRun } from './testRun';
import type { TrainingRun } from './types';

// The Weekly Siege board: each force's best a week, the week's winner settled once, and its Strategic Asset.

const force = (id: string, factionId?: string): Force =>
  ({ id, name: `Force ${id}`, player: id.toUpperCase(), ...(factionId ? { nexus: { factionId } } : {}) }) as unknown as Force;
const ran = (week: string, wave: number, cleared = wave - 1): TrainingRun => Object.assign(blankRun(), { siege: week, wave, cleared, phase: 'over' });
const camp = (o: Partial<Campaign> = {}): Campaign => ({ log: [], sectors: [], factions: [], round: 2, ...o }) as unknown as Campaign;

function post(c: Campaign, f: Force, run: TrainingRun, date = '2026-10-20') {
  c.siegeBoard = postSiege(c, f, run, date);
}

describe('siege board', () => {
  it('keeps each force\'s best a week, best first, and only the last few weeks', () => {
    const c = camp();
    post(c, force('a', 'red'), ran('2026-W43', 8));
    post(c, force('a', 'red'), ran('2026-W43', 5));
    post(c, force('b', 'blue'), ran('2026-W43', 11));
    post(c, force('c'), ran('2026-W43', 11, 11), '2026-10-21');
    expect(siegeRanking(c.siegeBoard, '2026-W43').map((e) => [e.forceId, e.score])).toEqual([['c', 11], ['b', 11], ['a', 8]]);
    post(c, force('a', 'red'), ran('2026-W43', 9));
    expect(siegeRanking(c.siegeBoard, '2026-W43').find((e) => e.forceId === 'a')?.score).toBe(9);
    expect(post(c, force('a'), Object.assign(blankRun(), { wave: 30 }))).toBeUndefined();
    expect(c.siegeBoard).toHaveLength(3);
    for (const w of ['2026-W44', '2026-W45', '2026-W46', '2026-W47']) post(c, force('a', 'red'), ran(w, 3));
    expect(new Set(c.siegeBoard!.map((e) => e.week)).size).toBe(TRAINING.siege.weeks);
    expect(c.siegeBoard!.some((e) => e.week === '2026-W43')).toBe(false);
  });

  it('settles a week once it is over: its winner\'s faction gets an asset this round', () => {
    const c = camp();
    post(c, force('a', 'red'), ran('2026-W43', 12));
    post(c, force('b', 'blue'), ran('2026-W43', 9));
    post(c, force('b', 'blue'), ran('2026-W44', 4));
    expect(weeksDue(c, '2026-W43')).toEqual([]);
    const won = settleSieges(c, '2026-W44', '2026-10-27');
    expect(won.map((w) => [w.week, w.forceId, w.factionId, w.round])).toEqual([['2026-W43', 'a', 'red', 2]]);
    expect(settleSieges(c, '2026-W44', '2026-10-27')).toEqual([]);
    expect(lastSiegeWin(c)?.force).toBe('Force a');
    expect(siegeAssets(c, 'red')).toBe(1);
    expect(siegeAssets(c, 'blue')).toBe(0);
    expect(assetsOf(c, 'red').earned).toBe(1);
    // A settled week takes no more runs.
    const before = c.siegeBoard;
    post(c, force('b', 'blue'), ran('2026-W43', 30));
    expect(c.siegeBoard).toEqual(before);
  });

  it('repeat wins have no limit, but the assets stay within the cap', () => {
    const c = camp();
    for (const w of ['2026-W40', '2026-W41', '2026-W42', '2026-W43']) post(c, force('a', 'red'), ran(w, 10));
    settleSieges(c, '2026-W44', '2026-10-27');
    expect(siegeAssets(c, 'red')).toBe(4);
    expect(assetsOf(c, 'red').earned).toBe(NEXUS_ROUNDS.assetsMax);
    c.round = 3;
    expect(siegeAssets(c, 'red')).toBe(0);
  });
});
