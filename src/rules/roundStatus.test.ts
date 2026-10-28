import { describe, expect, it } from 'vitest';
import type { Campaign, Force } from '../model/types';
import { newForce } from '../model/factory';
import { factionStatus, gmTodos, roundTodos } from './roundStatus';

// Round 5: Alpha holds two planets, Bravo its home. Round 4 has ended, so its income is waiting.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 5, threat: 6,
    factions: [{ id: 'A', name: 'Alpha', player: 'Ann', color: '#f00' }, { id: 'B', name: 'Bravo', player: 'Ben', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'p1', name: 'Planet 1', type: 'planet', owner: 'A', notes: '', q: 4, r: 3 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 9 },
    ],
    log: [],
    rounds: [{ round: 4, date: '', holdings: { A: ['hA', 'p1'], B: ['hB'] }, underdog: {} }],
  };
}

function force(factionId: string, claimedRound?: number): Force {
  const f = newForce(`${factionId} force`);
  f.nexus = { factionId, permanentTables: [], tempTables: [], traitTokens: 0, pending: [], claimedRound };
  return f;
}

const keys = (c: Campaign, forces: Force[], me: string) => roundTodos(c, forces, me).map((t) => t.key);

describe('roundTodos', () => {
  it('asks for the income of an ended round until any of the faction’s detachments claims it', () => {
    const c = campaign();
    const a = force('A');
    expect(keys(c, [a], 'A')).toContain('income');
    expect(roundTodos(c, [a], 'A').find((t) => t.key === 'income')!.href).toContain(a.id);
    expect(keys(c, [a, force('A', 4)], 'A')).not.toContain('income');
  });

  it('puts a marked sector nobody holds first, and drops it once a detachment stands there', () => {
    const c = campaign();
    c.echoMarks = { round: 5, marks: [{ sectorId: 'p1' }] };
    const a = force('A', 4);
    expect(keys(c, [a], 'A')[0]).toBe('mark:p1');
    expect(roundTodos(c, [a], 'A')[0].urgent).toBe(true);
    c.positions = { [a.id]: { sectorId: 'p1', factionId: 'A' } };
    expect(keys(c, [a], 'A')).not.toContain('mark:p1');
    // Bravo's list doesn't carry Alpha's marks.
    expect(keys(c, [force('B', 4)], 'B')).not.toContain('mark:p1');
  });

  it('reminds of unspent Strategic Assets and a game night not answered', () => {
    const c = campaign();
    c.log.push({ id: 's', date: '', sectorId: '', attacker: 'A', defender: 'B', winner: 'A', notes: '', round: 5, skirmish: true });
    c.gameNight = { round: 5, coming: ['B'] };
    const a = force('A', 4);
    expect(keys(c, [a], 'A')).toEqual(expect.arrayContaining(['assets', 'night']));
    expect(keys(c, [force('B', 4)], 'B')).not.toContain('night');
  });

  it('has nothing for a faction not in the campaign', () => {
    expect(roundTodos(campaign(), [], 'Z')).toEqual([]);
  });
});

describe('factionStatus', () => {
  it('counts unclaimed rounds only for factions with forces on this device', () => {
    const c = campaign();
    const [a, b] = factionStatus(c, [force('A')]);
    expect(a).toMatchObject({ id: 'A', player: 'Ann', forces: 1, unclaimed: 1 });
    expect(b.forces).toBe(0);
    expect(b.unclaimed).toBeUndefined();
    expect(factionStatus(c, [force('A', 4)])[0].unclaimed).toBe(0);
  });
});

describe('gmTodos', () => {
  it('lists the Galactic Event and the Echo marks until they are done', () => {
    const c = campaign();
    expect(gmTodos(c).map((t) => t.key)).toEqual(['event', 'marks']);
    c.echoMarks = { round: 5, marks: [] };
    expect(gmTodos(c).map((t) => t.key)).toEqual(['event']);
  });
});
