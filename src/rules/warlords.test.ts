import { describe, expect, it } from 'vitest';
import { newForce, newUnit } from '../model/factory';
import type { Campaign, Unit } from '../model/types';
import { autoSetup } from './autoBattle';
import { visibleTo } from './fog';
import { lootTier } from './marauders';
import { FACE_OFF_MISSIONS } from './missions';
import { moveOf } from './movement';
import { emptyNexus, nexusGeneration } from './nexus';
import { NEXUS_MOVE, PRODUCTION, WARLORDS, type WarlordPathId } from './nexusData';
import { build, buildCost, buildingSlots, produce } from './production';
import { assetsOf } from './rounds';
import { researchRate } from './tech';
import { loadUnits, newBattle } from './tracker';
import { changePath, chooseWarlord, hasPerk, leadsWith, loseWarlord, perksOf, reviveWarlord, syncWarlords, warlordBlock, warlordCandidates, warlordsStale } from './warlords';

// A row of hexes: A's home, then empty space out to B's home.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'e1', name: 'Empty 1', type: 'empty', notes: '', q: 1, r: 0 },
      { id: 'e2', name: 'Empty 2', type: 'empty', notes: '', q: 2, r: 0 },
      { id: 'e3', name: 'Empty 3', type: 'empty', notes: '', q: 3, r: 0 },
      { id: 'e4', name: 'Empty 4', type: 'empty', notes: '', q: 4, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 5, r: 0 },
    ],
    log: [],
  };
}

const hero = (xp: number, name = 'Lord') => newUnit({ name, rules: ['Hero'], xp });
const force = (factionId: string, units: Unit[] = [], name = 'F') => {
  const f = newForce(name);
  f.owner = 'me@x';
  f.nexus = emptyNexus(factionId);
  f.units = units;
  return f;
};
/** A campaign with A's Warlord (at this XP) on this path, in force `f`. */
function withWarlord(path: WarlordPathId, xp = 90) {
  const c = campaign();
  const lord = hero(xp);
  const f = force('A', [lord]);
  expect(chooseWarlord(c, 'A', f, lord, path)).toBe(true);
  return { c, f, lord };
}
const faction = (c: Campaign, id = 'A') => c.factions.find((f) => f.id === id)!;

describe('naming a Warlord', () => {
  it('takes a Hero from one of the faction\'s forces, and a Path the first time', () => {
    const c = campaign();
    const lord = hero(40);
    const grunt = newUnit({ name: 'Grunt', xp: 90 });
    const f = force('A', [lord, grunt]);
    expect(warlordCandidates(c, [f, force('B', [hero(0)])], 'A').map((x) => x.unit.id)).toEqual([lord.id]);
    expect(chooseWarlord(c, 'A', f, lord)).toBe(false);
    expect(chooseWarlord(c, 'A', f, grunt, 'architect')).toBe(false);
    expect(chooseWarlord(c, 'B', f, lord, 'architect')).toBe(false);
    expect(chooseWarlord(c, 'A', f, lord, 'architect')).toBe(true);
    expect(faction(c).warlord).toMatchObject({ forceId: f.id, unitId: lord.id, name: 'Lord', level: 3, since: 1 });
    expect(perksOf(faction(c))).toEqual(['cheapBuild', 'research']);
    expect(warlordBlock(c, 'A')).toMatch(/already its Warlord/);
  });

  it('keeps the Path for good, and waits a round before a new Warlord', () => {
    const { c, f } = withWarlord('architect');
    loseWarlord(c, 'A');
    expect(perksOf(faction(c))).toEqual([]);
    expect(warlordBlock(c, 'A')).toMatch(/from round 2/);
    const next = hero(10, 'Heir');
    f.units.push(next);
    expect(chooseWarlord(c, 'A', f, next, 'reaver')).toBe(false);
    c.round = 2;
    expect(chooseWarlord(c, 'A', f, next, 'reaver')).toBe(true);
    expect(faction(c).path).toBe('architect');
    expect(perksOf(faction(c))).toEqual(['cheapBuild']);
  });

  it('GM revive: brings a stepped-down Warlord back, or just lifts the wait', () => {
    const { c, f, lord } = withWarlord('architect');
    loseWarlord(c, 'A');
    c.round = 3;
    expect(reviveWarlord(c, 'A', [f])).toBe('Lord');
    expect(faction(c).warlord).toMatchObject({ unitId: lord.id, since: 1 });
    expect(faction(c).warlordLost).toBeUndefined();
    expect(reviveWarlord(c, 'A', [f])).toBeUndefined();
    loseWarlord(c, 'A');
    lord.status = 'removed';
    expect(reviveWarlord(c, 'A', [f])).toBeUndefined();
    expect(faction(c).warlord).toBeUndefined();
    expect(warlordBlock(c, 'A')).toBeUndefined();
  });

  it("GM revive: keeps the record when the Warlord's force isn't loaded here", () => {
    const { c, f } = withWarlord('architect');
    loseWarlord(c, 'A');
    expect(reviveWarlord(c, 'A', [])).toBeUndefined();
    expect(faction(c).warlordLost).toBeUndefined();
    expect(faction(c).fallenWarlord).toBeTruthy();
    expect(reviveWarlord(c, 'A', [f])).toBe('Lord');
  });
});

describe('changing Path', () => {
  it('switches the Path and puts the Warlord back to level 1, then it levels up again', () => {
    const { c, f, lord } = withWarlord('architect');
    expect(changePath(c, 'A', 'architect', [f])).toBe(false);
    expect(changePath(c, 'A', 'reaver', [])).toBe(false);
    expect(changePath(c, 'A', 'reaver', [f])).toBe(true);
    expect(faction(c).path).toBe('reaver');
    expect(faction(c).warlord?.level).toBe(1);
    expect(perksOf(faction(c))).toHaveLength(1);
    expect(lord.xp).toBe(90);
    syncWarlords(c, [f]);
    expect(faction(c).warlord?.level).toBe(1);
    lord.xp += 30;
    syncWarlords(c, [f]);
    expect(faction(c).warlord?.level).toBe(3);
  });

  it('needs a Warlord, and the same Hero named again keeps its reset', () => {
    const { c, f, lord } = withWarlord('architect');
    changePath(c, 'A', 'reaver', [f]);
    loseWarlord(c, 'A');
    expect(changePath(c, 'A', 'shadow', [f])).toBe(false);
    c.round = 2;
    expect(chooseWarlord(c, 'A', f, lord)).toBe(true);
    expect(faction(c).warlord?.level).toBe(1);
  });

  it('leaves a Warlord still below level 1 where it is', () => {
    const { c, f } = withWarlord('architect', 5);
    expect(changePath(c, 'A', 'reaver', [f])).toBe(true);
    expect(faction(c).warlord?.level).toBe(0);
  });
});

describe('keeping Warlords in step with their forces', () => {
  it('levels up with XP, and is lost when removed or its force leaves', () => {
    const { c, f, lord } = withWarlord('conqueror', 10);
    expect(warlordsStale(c, [f])).toBe(false);
    lord.xp = 90;
    expect(warlordsStale(c, [f])).toBe(true);
    expect(faction(c).warlord?.level).toBe(1);
    expect(syncWarlords(c, [f])).toEqual({ lost: [], levelled: [{ factionId: 'A', name: 'Lord', level: 5 }] });
    expect(faction(c).warlord?.level).toBe(5);
    lord.status = 'removed';
    expect(syncWarlords(c, [f]).lost).toEqual([{ factionId: 'A', name: 'Lord' }]);
    expect(faction(c).warlord).toBeUndefined();
    expect(faction(c).warlordLost).toBe(1);
  });

  it('is lost when the force changes faction, but not when the force just isn\'t loaded', () => {
    const { c, f } = withWarlord('conqueror');
    expect(syncWarlords(c, []).lost).toEqual([]);
    expect(faction(c).warlord).toBeDefined();
    f.nexus!.factionId = 'B';
    expect(syncWarlords(c, [f]).lost).toHaveLength(1);
  });
});

describe('Warlord perks', () => {
  it('Architect: cheaper buildings, more Research, a home slot', () => {
    const { c } = withWarlord('architect');
    const home = c.sectors[0];
    const plain = campaign();
    expect(buildingSlots(home, c)).toBe(buildingSlots(plain.sectors[0], plain) + WARLORDS.homeSlots);
    expect(researchRate(c, 'A')).toBe(researchRate(plain, 'A') + WARLORDS.research);
    const b = { cost: 200 };
    expect(buildCost(b, home, c)).toBe(150);
    expect(buildCost(b, plain.sectors[0], plain)).toBe(200);
    home.bank = 150;
    expect(build(c, home, 'depot')).toBe(true);
    expect(home.bank).toBe(0);
    expect(home.construction?.supply).toBe(150);
  });

  it('Conqueror: its detachment moves further, then every detachment', () => {
    const { c, f } = withWarlord('conqueror', 10);
    const other = force('A', [], 'Other');
    expect(leadsWith(c, f, 'march')).toBe(true);
    expect(moveOf(c, f).move).toBe(NEXUS_MOVE.base + WARLORDS.march);
    expect(moveOf(c, other).move).toBe(NEXUS_MOVE.base);
    syncWarlords(c, [{ ...f, units: [hero(90)].map((u) => ({ ...u, id: f.units[0].id })) }]);
    expect(moveOf(c, f).move).toBe(NEXUS_MOVE.base + WARLORDS.march + WARLORDS.blitz);
    expect(moveOf(c, other).move).toBe(NEXUS_MOVE.base + WARLORDS.blitz);
    expect(moveOf(c, other).why).toContain(`+${WARLORDS.blitz} Warlord (Blitzkrieg)`);
  });

  it('Conqueror: Onslaught in the auto-battle', () => {
    const { c, f, lord } = withWarlord('conqueror', 40);
    lord.size = 1;
    lord.quality = 4;
    lord.defense = 4;
    const squad = newUnit({ name: 'Squad', size: 5, quality: 4, defense: 4 });
    f.units.push(squad);
    const b = newBattle(FACE_OFF_MISSIONS[0], 'x', '2026-10-20', () => 0.5);
    loadUnits(b.sides[0], 'Alpha', f.units);
    b.sides[0].forceId = f.id;
    loadUnits(b.sides[1], 'Bravo', [newUnit({ name: 'Foe', size: 5, quality: 4, defense: 4 })]);
    const plain = autoSetup(structuredClone(b), [f], campaign());
    const s = autoSetup(b, [f], c);
    const ours = (x: typeof s) => x.fighters.filter((y) => y.sideId === b.sides[0].id);
    const [lordFighter, squadFighter] = ours(s);
    const [lordPlain, squadPlain] = ours(plain);
    expect(lordFighter.hitMelee).toBe(lordPlain.hitMelee + 1);
    expect(lordFighter.hitShoot).toBe(lordPlain.hitShoot + 1);
    expect(squadFighter.hitMelee).toBe(squadPlain.hitMelee);
    expect(ours(s).every((x, i) => x.morale === ours(plain)[i].morale + 1)).toBe(true);
    expect(s.effects.join(' ')).toMatch(/Onslaught/);
    // Not in the fight: no Onslaught.
    lord.status = 'removed';
    const without = newBattle(FACE_OFF_MISSIONS[0], 'y', '2026-10-20', () => 0.5);
    loadUnits(without.sides[0], 'Alpha', [squad]);
    without.sides[0].forceId = f.id;
    loadUnits(without.sides[1], 'Bravo', [newUnit({ name: 'Foe', size: 5 })]);
    expect(autoSetup(without, [f], c).effects.join(' ')).not.toMatch(/Onslaught/);
  });

  it('Warmaster: produced units come with XP, and an extra Strategic Asset', () => {
    const { c } = withWarlord('warmaster');
    const home = c.sectors[0];
    home.bank = 10000;
    const u = newUnit({ name: 'Recruit', points: 100 });
    expect(produce(home, [u], undefined, c)).toBe(true);
    expect(u.xp).toBe(WARLORDS.drilledXp + WARLORDS.veteransXp);
    expect(assetsOf(c, 'A').earned).toBe(assetsOf(campaign(), 'A').earned + WARLORDS.assets);
    home.buildings = ['training'];
    const v = newUnit({ name: 'Recruit', points: 100 });
    produce(home, [v], undefined, c);
    expect(v.xp).toBe(PRODUCTION.trainingXp + WARLORDS.drilledXp + WARLORDS.veteransXp);
  });

  it('Shadow: sees further, and Marauders look elsewhere', () => {
    const { c, f } = withWarlord('shadow', 10);
    const plain = visibleTo(campaign(), 'A');
    expect(hasPerk(c, 'A', 'scouts')).toBe(true);
    expect(hasPerk(c, 'A', 'spymaster')).toBe(false);
    syncWarlords(c, [{ ...f, units: [{ ...f.units[0], xp: 90 }] }]);
    expect(hasPerk(c, 'A', 'spymaster')).toBe(true);
    const seen = visibleTo(c, 'A');
    expect(seen.size).toBeGreaterThan(plain.size);
    expect([...plain].every((id) => seen.has(id))).toBe(true);
  });

  it('Reaver: more Umbra Shards from its force\'s wins, richer marauder loot', () => {
    const { c, f } = withWarlord('reaver');
    const items = (forceId?: string, result: 'win' | 'loss' = 'win') =>
      nexusGeneration(c, 'A', 'e1', result, true, undefined, { forceId }).items.filter((x) => x.key === 'warlord');
    expect(items(f.id)).toEqual([expect.objectContaining({ kind: 'us', us: WARLORDS.plunder + WARLORDS.warlust })]);
    expect(items('other')).toEqual([]);
    expect(items(f.id, 'loss')).toEqual([]);
    const band = { id: 'm', name: 'Band', sectorId: 'e1', strength: 0, since: 1 };
    expect(lootTier(c, band, 'A')).toBe('Rare');
    expect(lootTier(c, band, 'B')).toBe('Common');
    expect(lootTier(c, { ...band, strength: 100000 }, 'A')).toBe('Legendary');
  });
});
