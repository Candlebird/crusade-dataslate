import { describe, expect, it } from 'vitest';
import { newForce } from '../model/factory';
import type { Campaign, Force } from '../model/types';
import { comingTonight, nightPoints, planNight, setComing } from './gameNight';
import { ECHOES } from './nexus';
import type { Attack } from './orders';

// The Game Night Planner (Nexus Wars): the evening's tables from the orders and who's coming.

// Four factions on a line (r = 0); an Echo-held sector with a guardian, an unclaimed one, a band near Delta.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 2,
    factions: ['A', 'B', 'C', 'D'].map((id) => ({ id, name: `F${id}`, player: '', color: '#000' })),
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 2, r: 0 },
      { id: 'pB', name: 'B Planet', type: 'planet', owner: 'B', notes: '', q: 3, r: 0, reinforced: true },
      { id: 'hC', name: 'C Home', type: 'home', owner: 'C', notes: '', q: 6, r: 0 },
      { id: 'echo', name: 'Echo', type: 'planet', owner: ECHOES.id, notes: '', q: 8, r: 0, difficulty: 900,
        guardian: { name: 'The Warden', tier: 'Common', unit: {} as never } },
      { id: 'hD', name: 'D Home', type: 'home', owner: 'D', notes: '', q: 12, r: 0 },
      { id: 'near', name: 'Near D', type: 'planet', notes: '', q: 13, r: 0 },
      { id: 'far', name: 'Far', type: 'planet', notes: '', q: 30, r: 0 },
    ],
    log: [],
    marauders: [
      { id: 'm1', name: 'Far Raiders', sectorId: 'far', strength: 600, since: 1 },
      { id: 'm2', name: 'Near Raiders', sectorId: 'near', strength: 450, since: 1 },
    ],
  };
}

function force(factionId: string, supply: number): Force {
  return { ...newForce(factionId), id: `f${factionId}`, startingSupply: supply, nexus: { factionId } as never };
}

const attack = (factionId: string, sectorId: string, defender: string): Attack => ({ email: '', factionId, forceId: `f${factionId}`, sectorId, defender, flags: [] });
const first = () => 0;

describe('game night RSVPs', () => {
  it("keeps this round's list and drops last round's", () => {
    const c = campaign();
    setComing(c, 'A', true);
    setComing(c, 'B', true);
    setComing(c, 'A', false);
    expect(comingTonight(c)).toEqual(['B']);
    c.round = 3;
    expect(comingTonight(c)).toEqual([]);
    setComing(c, 'C', true);
    expect(c.gameNight).toEqual({ round: 3, coming: ['C'] });
  });
});

describe('nightPoints', () => {
  it("takes the detachment's Supply Limit, rounded down", () => {
    const forces = [force('A', 1240), { ...force('A', 1600), id: 'big' }];
    expect(nightPoints(forces, 'A', 'fA')).toBe(1200);
    expect(nightPoints(forces, 'A')).toBe(1600);
    expect(nightPoints([], 'A')).toBe(1000);
  });
});

describe('planNight', () => {
  const forces = ['A', 'B', 'C', 'D'].map((id) => force(id, 1500));

  it('seats both sides of an attack when they both come, and the Echoes stand in when not', () => {
    const c = campaign();
    const pvp = planNight(c, forces, [attack('A', 'pB', 'B')], ['A', 'B'], first);
    expect(pvp).toHaveLength(1);
    expect(pvp[0]).toMatchObject({ kind: 'pvp', factions: ['A', 'B'], points: 1500 });
    expect(pvp[0].notes[0]).toMatch(/Reinforced/);
    const standin = planNight(c, forces, [attack('A', 'pB', 'B')], ['A'], first);
    expect(standin[0]).toMatchObject({ kind: 'standin', factions: ['A'] });
  });

  it("fights a guardian at the sector's Supply rating", () => {
    const t = planNight(campaign(), forces, [attack('C', 'echo', ECHOES.id)], ['C'], first);
    expect(t[0]).toMatchObject({ kind: 'guardian', points: 900, foe: 'The Warden (guardian)' });
  });

  it('skips attacks already fought and attackers who are away', () => {
    const c = campaign();
    c.log = [{ id: 'g', date: '', sectorId: 'pB', attacker: 'A', defender: 'B', winner: 'A', notes: '', round: 2 }];
    expect(planNight(c, forces, [attack('A', 'pB', 'B'), attack('C', 'echo', ECHOES.id)], ['A', 'B'], first).map((t) => t.kind)).toEqual(['marauder', 'marauder']);
  });

  it('sends the rest to the nearest band, then pairs them, then a patrol', () => {
    const t = planNight(campaign(), forces, [], ['D', 'A', 'B', 'C'], first);
    expect(t.map((x) => [x.kind, x.factions.join(), x.bandId])).toEqual([
      ['marauder', 'D', 'm2'],
      ['marauder', 'A', 'm1'],
      ['skirmish', 'B,C', undefined],
    ]);
    const odd = planNight(campaign(), forces, [], ['D', 'A', 'B'], first);
    expect(odd[2]).toMatchObject({ kind: 'skirmish', factions: ['B'], foe: ECHOES.name });
  });
});

describe('musters at game night', () => {
  it('seats musters first, closest first, flags a big one and notes a lopsided fight', () => {
    const c = campaign();
    c.sectors.push({ id: 'x1', name: 'X1', type: 'planet', notes: '', q: 1, r: 1, difficulty: 3000 }, { id: 'x2', name: 'X2', type: 'planet', notes: '', q: 1, r: 2, difficulty: 600 });
    const forces = [force('A', 1500), { ...force('A', 1500), id: 'fA2' }, force('B', 1000), { ...force('B', 200), id: 'fB2' }];
    const attacks: Attack[] = [
      { ...attack('C', 'echo', ECHOES.id) },
      { ...attack('B', 'x2', ''), forceIds: ['fB', 'fB2'] },
      { ...attack('A', 'x1', ''), forceIds: ['fA', 'fA2'] },
    ];
    forces.push(force('C', 900));
    const t = planNight(c, forces, attacks, ['A', 'B', 'C'], first);
    // A's muster (3000 vs a 3000 garrison) is closer than B's (1200 vs 600).
    expect(t.map((x) => x.sectorId)).toEqual(['x1', 'x2', 'echo']);
    expect(t[0]).toMatchObject({ forceIds: ['fA', 'fA2'], big: true, points: 3000 });
    expect(t[1].big).toBeUndefined();
    expect(t[1].notes.some((n) => n.startsWith('Lopsided: 1200 against a 600 garrison'))).toBe(true);
    expect(t[0].notes.some((n) => n.startsWith('Lopsided'))).toBe(false);
  });

  it('sizes a raid to the raiders', () => {
    const c = campaign();
    c.sectors.push({ id: 'x1', name: 'X1', type: 'planet', notes: '', q: 1, r: 1, difficulty: 3000 });
    const [t] = planNight(c, [force('A', 1000)], [{ ...attack('A', 'x1', ''), raid: true }], ['A'], first);
    expect(t).toMatchObject({ raid: true, points: 1000 });
  });

  it("sizes a Marauder band's fight to the band of the sector it fights at", () => {
    const c = campaign();
    c.marauders![1].strength = 1800;
    const t = planNight(c, [force('D', 1000)], [], ['D'], first);
    // Round 2: the cap is 1700, so the near band is 700.
    expect(t[0]).toMatchObject({ kind: 'marauder', bandId: 'm2', points: 700 });
  });
});
