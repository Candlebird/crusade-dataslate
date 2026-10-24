import { describe, expect, it } from 'vitest';
import { newUnit } from '../../model/factory';
import { TRAINING } from '../downtimeData';
import { earnTitles, heldTitles, pickTitle, pickTitleProblem, recordTitles, shownTitle, sortieTitles, TITLES, titlesOf, trainingTitles, type TrainDeed } from './titles';

// One list of titles for Sorties and Training: record titles, deed titles, keeping them all and picking one to show.

const T = TRAINING.titles;
const deed = (o: Partial<TrainDeed> = {}): TrainDeed => ({ cleared: 0, kills: 0, holds: 0, lords: 0, nemesis: false, mvp: false, scars: 0, clean: 0, ...o });
const sortie = { up: true, won: true, deep: false, top: false, ascension: 0, heat: 0, nemesis: false, alone: false };

describe('titles', () => {
  it('has 20 unique titles, each with a trigger in words', () => {
    expect(TITLES).toHaveLength(20);
    expect(new Set(TITLES.map((t) => t.name)).size).toBe(20);
    expect(TITLES.every((t) => t.text.length > 10)).toBe(true);
    expect(new Set(TITLES.map((t) => t.where))).toEqual(new Set(['sortie', 'training', 'both']));
  });

  it('reads record titles from both records, Lordbane from lords slain on either side', () => {
    const u = newUnit({ sortieRecord: { runs: T.roadWorn.n, lords: 1 } });
    expect(recordTitles(u)).toEqual(['roadWorn']);
    u.trainingRecord = { best: 0, kills: T.legionBane.n, lords: T.lordbane.n - 1, runs: T.mazeHardened.n, mvps: T.drillmaster.n };
    expect(recordTitles(u)).toEqual(['roadWorn', 'lordbane', 'drillmaster', 'legionBane', 'mazeHardened']);
    u.sortieRecord = { runs: T.twiceTested.n, lords: 0 };
    expect(recordTitles(u)).toContain('twiceTested');
  });

  it('gives Training deed titles for one run', () => {
    expect(trainingTitles(deed())).toEqual([]);
    expect(trainingTitles(deed({ kills: T.echoReaper.n, holds: T.unmoved.n, lords: 1, nemesis: true }))).toEqual(['grudgebreaker', 'echoReaper', 'unmoved', 'lordslayer']);
    expect(trainingTitles(deed({ cleared: T.wallWarden.n - 1, clean: T.gatekeeper.n - 1 }))).toEqual([]);
    expect(trainingTitles(deed({ cleared: T.wallWarden.n - 1, clean: T.gatekeeper.n }))).toEqual(['gatekeeper']);
    expect(trainingTitles(deed({ cleared: T.wallWarden.n }))).toEqual(['wallWarden']);
    expect(trainingTitles(deed({ cleared: T.unbowed.n, mvp: true, scars: T.unbowed.scars }))).toEqual(['unbowed']);
    expect(trainingTitles(deed({ cleared: T.unbowed.n, mvp: false, scars: 5 }))).toEqual([]);
  });

  it('gives Sortie deed titles only to a unit standing at a win, bar the lord slain', () => {
    expect(sortieTitles(sortie)).toEqual([]);
    expect(sortieTitles({ ...sortie, deep: true, top: true, ascension: T.curseborn.n, alone: true })).toEqual(['deepstrider', 'lastStanding', 'peakwalker', 'curseborn']);
    expect(sortieTitles({ ...sortie, up: false, deep: true, top: true })).toEqual([]);
    expect(sortieTitles({ ...sortie, won: false, up: false, heat: T.pyreWalker.n, nemesis: true })).toEqual(['grudgebreaker', 'pyreWalker']);
  });

  it('keeps every title and shows the latest, or the one picked, or none', () => {
    const u = newUnit();
    expect(shownTitle(u)).toBeUndefined();
    expect(earnTitles(u, ['lordslayer'], heldTitles(u))).toEqual(['lordslayer']);
    let before = heldTitles(u);
    u.sortieRecord = { runs: T.roadWorn.n, lords: 0 };
    expect(earnTitles(u, ['lordslayer', 'echoReaper'], before)).toEqual(['roadWorn', 'echoReaper']);
    expect(u.titles).toEqual(['lordslayer', 'roadWorn', 'echoReaper']);
    expect(shownTitle(u)?.name).toBe(T.echoReaper.name);
    before = heldTitles(u);
    expect(earnTitles(u, ['echoReaper'], before)).toEqual([]);
    expect(u.titles).toHaveLength(3);
    expect(pickTitleProblem(u, 'peakwalker')).toMatch(/earned/);
    expect(pickTitleProblem(u, 'nonsense')).toMatch(/No such/);
    expect(() => pickTitle(u, 'peakwalker')).toThrow();
    pickTitle(u, 'lordslayer');
    expect(shownTitle(u)?.id).toBe('lordslayer');
    pickTitle(u, '-');
    expect(shownTitle(u)).toBeUndefined();
    expect(titlesOf(u).map((t) => t.id)).toEqual(['lordslayer', 'roadWorn', 'echoReaper']);
  });

  it('holds a record title from an old save before it is stored', () => {
    const u = newUnit({ sortieRecord: { runs: T.hollowSworn.n, lords: 0 } });
    expect(heldTitles(u)).toEqual(['roadWorn', 'ashWalker', 'hollowSworn']);
    expect(shownTitle(u)?.id).toBe('hollowSworn');
  });
});
