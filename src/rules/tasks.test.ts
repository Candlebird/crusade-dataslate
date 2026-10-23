import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type Campaign, type Force } from '../model/types';
import { newForce, newUnit } from '../model/factory';
import { asCopy } from '../model/io';
import { GARRISON, MENTORING, PROJECTS } from './downtimeData';
import { reconSeen, visibleTo } from './fog';
import { moveMarauders } from './marauders';
import { emptyNexus, unitsUsed } from './nexus';
import { NEXUS_ROUNDS } from './nexusData';
import { loadForce, newSide } from './tracker';
import {
  activeProject, claimGarrisons, freeUnits, garrison, garrisonClaims, mentor, mentorProblem, projectProblem, reconTargets, scout, sortieScout, tasksOf,
  unitsBusy, workProject,
} from './tasks';

// Unit tasks (Nexus Wars downtime): Mentoring, Projects, Recon and Garrison.

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: NEXUS_ROUNDS.graceRounds + 2,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'e0', name: 'Edge', type: 'empty', notes: '', q: 0, r: 0 },
      { id: 'e1', name: 'Drift', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'e2', name: 'Gap', type: 'empty', notes: '', q: 2, r: 0 },
      { id: 'pA', name: 'Rich World', type: 'planet', owner: 'A', bank: 400, notes: '', q: 3, r: 0 },
      { id: 'e4', name: 'Far', type: 'empty', notes: '', q: 4, r: 0 },
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 5, r: 0 },
      { id: 'pB', name: 'Bravo World', type: 'planet', owner: 'B', notes: '', q: 9, r: 0 },
    ],
    log: [],
  };
}

function force(): Force {
  const f = newForce('Alpha Force');
  f.nexus = emptyNexus('A');
  f.units = [
    newUnit({ id: 'vet', name: 'Veterans', category: 'Infantry', xp: 40, points: 150 }), // level 3
    newUnit({ id: 'rook', name: 'Rookies', category: 'Infantry', xp: 5, points: 100 }), // level 0
    newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', xp: 0, points: 300 }),
    newUnit({ id: 'mid', name: 'Line', category: 'Infantry', xp: 40, points: 120 }), // level 3 too
  ];
  return f;
}

let n = 0;
const newId = () => `id${n++}`;
const unit = (f: Force, id: string) => f.units.find((u) => u.id === id)!;
const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;

describe('mentoring', () => {
  it('needs the same category and a higher-level mentor', () => {
    const f = force();
    expect(mentorProblem(unit(f, 'vet'), unit(f, 'rook'))).toBeNull();
    expect(mentorProblem(unit(f, 'vet'), unit(f, 'tank'))).toMatch(/category/);
    expect(mentorProblem(unit(f, 'rook'), unit(f, 'vet'))).toMatch(/higher level/);
    expect(mentorProblem(unit(f, 'vet'), unit(f, 'mid'))).toMatch(/higher level/);
    expect(mentorProblem(unit(f, 'vet'), unit(f, 'vet'))).toMatch(/itself/);
  });

  it('gives the pupil XP per mentor level and makes both busy', () => {
    const c = campaign();
    const f = force();
    mentor(f, c, 'vet', 'rook', '2026-10-22', newId);
    expect(unit(f, 'rook').xp).toBe(5 + 3 * MENTORING.xpPerLevel);
    expect(tasksOf(f, c)).toEqual({ vet: 'mentor', rook: 'mentor' });
    expect(unitsUsed(f, c)).toEqual(expect.arrayContaining(['vet', 'rook']));
    expect(f.ledger).toHaveLength(1);
    // Busy: no second task this round.
    expect(() => workProject(c, f, 'vet', 'pA', 'salvage', '', newId)).toThrow(/busy/);
    expect(freeUnits(f, c).map((u) => u.id)).toEqual(['tank', 'mid']);
  });
});

describe('projects', () => {
  it('add a D3 a unit and pay out at the goal', () => {
    const c = campaign();
    const f = force();
    const salvage = PROJECTS.find((p) => p.id === 'salvage')!;
    workProject(c, f, 'vet', 'pA', 'salvage', '', newId, () => 0.99); // 3
    expect(activeProject(sector(c, 'pA'))).toMatchObject({ id: 'salvage', progress: 3 });
    workProject(c, f, 'rook', 'pA', 'salvage', '', newId, () => 0); // 1: done at 4
    expect(activeProject(sector(c, 'pA'))).toBeUndefined();
    expect(sector(c, 'pA').bank).toBe(400 + salvage.reward.materials!);
  });

  it('are one per world', () => {
    const c = campaign();
    const f = force();
    workProject(c, f, 'vet', 'pA', 'research', '', newId, () => 0);
    expect(projectProblem(sector(c, 'pA'), 'salvage', 'A')).toMatch(/One project per world/);
    expect(projectProblem(sector(c, 'pA'), 'research', 'A')).toBeNull();
    expect(projectProblem(sector(c, 'hA'), 'salvage', 'A')).toBeNull();
    expect(projectProblem(sector(c, 'pB'), 'salvage', 'A')).toMatch(/your own worlds/);
    // A world that changes hands loses its project.
    sector(c, 'pA').owner = 'B';
    expect(activeProject(sector(c, 'pA'))).toBeUndefined();
  });

  it('fortify, research and forge', () => {
    const c = campaign();
    const f = force();
    for (const id of ['vet', 'rook']) workProject(c, f, id, 'pA', 'fortify', '', newId, () => 0.99);
    expect(sector(c, 'pA').reinforced).toBe(true);
    expect(projectProblem(sector(c, 'pA'), 'fortify', 'A')).toMatch(/already Reinforced/);
    for (const id of ['tank', 'mid']) workProject(c, f, id, 'hA', 'research', '', newId, () => 0.99);
    expect(c.factions[0].research).toBe(2);
    c.round! += 1;
    for (const id of ['vet', 'rook', 'tank']) workProject(c, f, id, 'pA', 'relic', '', newId, () => 0.99);
    expect(f.nexus!.forged).toEqual(['Common']);
  });
});

describe('recon', () => {
  it('reaches nearby sectors and shows them for two rounds', () => {
    const c = campaign();
    const f = force();
    expect(reconTargets(c, 'A').map((s) => s.id)).not.toContain('pB');
    c.sectors.push({ id: 'x', name: 'Beyond', type: 'empty', notes: '', q: 8, r: 0 });
    expect(reconTargets(c, 'A').map((s) => s.id)).toContain('x');
    expect(() => scout(c, f, 'vet', 'pB', '', newId)).toThrow(/hexes/);
    scout(c, f, 'vet', 'x', '', newId);
    expect(visibleTo(c, 'A').has('x')).toBe(true);
    expect(visibleTo(c, 'A').has('pB')).toBe(true); // next to it
    c.round! += 1;
    expect(reconSeen(c, 'A')).toContain('x');
    c.round! += 1;
    expect(reconSeen(c, 'A')).toEqual([]);
  });

  it('scouts the nearest unseen sector after a Shard run', () => {
    const c = campaign();
    const f = force();
    c.sectors.push({ id: 'x', name: 'Beyond', type: 'empty', notes: '', q: 8, r: 0 });
    expect(visibleTo(c, 'A').has('x')).toBe(false);
    expect(sortieScout(c, f)).toMatch(/^scouted /);
    expect(reconSeen(c, 'A').length).toBeGreaterThan(0);
    c.sectors = c.sectors.filter((s) => s.owner === 'A');
    expect(sortieScout(c, f)).toBe('');
  });
});

describe('garrison', () => {
  // The band is next door to the rich world, and always moves the most.
  const raid = (c: Campaign, strength: number) => {
    c.marauders = [{ id: 'm', name: 'The Rust Jackals', sectorId: 'e2', strength, since: 1 }];
    c.round! += 1;
    return moveMarauders(c, 0, () => 0.99).raids;
  };

  it('throws back a band it is worth half of, and earns XP', () => {
    const c = campaign();
    const f = force();
    garrison(c, f, 'tank', 'pA', '', newId);
    garrison(c, f, 'vet', 'pA', '', newId); // 450 pts
    const [r] = raid(c, 800);
    expect(r).toMatchObject({ sectorId: 'pA', repelled: true, garrison: 'held', stolen: 0 });
    expect(garrisonClaims(c, f).map((x) => x.units.map((u) => u.id))).toEqual([['vet', 'tank']]);
    claimGarrisons(c, f, '', newId);
    expect(unit(f, 'tank').xp).toBe(GARRISON.raidXp);
    expect(garrisonClaims(c, f)).toEqual([]);
  });

  it('halves the theft when too weak', () => {
    const c = campaign();
    const f = force();
    garrison(c, f, 'rook', 'pA', '', newId); // 100 pts
    const [r] = raid(c, 800);
    expect(r).toMatchObject({ repelled: false, garrison: 'weak', stolen: 100 });
    expect(garrisonClaims(c, f)).toHaveLength(1);
  });

  it('only guards its own worlds', () => {
    expect(() => garrison(campaign(), force(), 'vet', 'pB', '', newId)).toThrow(/own worlds/);
  });
});

describe('busy units', () => {
  it('stay out of tracked battles until the round ends', () => {
    const c = campaign();
    const f = force();
    garrison(c, f, 'vet', 'pA', '', newId);
    expect(unitsBusy(f, c)).toEqual(['vet']);
    const side = newSide('s', 'Alpha', 'A');
    loadForce(side, f, undefined, DEFAULT_SETTINGS, c);
    expect(side.units.map((u) => u.id)).not.toContain('vet');
    expect(side.units).toHaveLength(3);
    c.round! += 1;
    expect(unitsBusy(f, c)).toEqual([]);
  });

  it('follow a copied force', () => {
    const c = campaign();
    const f = force();
    garrison(c, f, 'vet', 'pA', '', newId);
    const copy = asCopy(f);
    const vet = copy.units.find((u) => u.name === 'Veterans')!;
    expect(Object.keys(copy.nexus!.tasks!.units)).toEqual([vet.id]);
  });
});
