import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { newForce, unitFromCatalog, uid } from '../model/factory';
import type { Campaign, Force, Unit } from '../model/types';
import { randomLoadout } from './echoForce';
import { hasRule, ruleRating } from './engine';
import { explore, rememberedBy, sightMap, visibleTo } from './fog';
import { garrison, guardable, guardianTier, placeGuardians } from './guardians';
import { heroFee, hireBlock, hireHero, openOffers, rollOffers } from './heroes';
import { ECHOES, changeHands, emptyNexus } from './nexus';
import { FOG, GUARDIANS, HERO_OFFERS, PRODUCTION } from './nexusData';
import { accrueProduction, bankCap, build, buildBlock, cancelBuilding, finishConstruction, freeSlots, isReinforced, produce, productionSites } from './production';
import { BUILDINGS } from './nexusData';
import { buildReport, reportFor } from './report';
import { endRound } from './rounds';

// The Age of Wonders side of Nexus Wars: fog of war, planet production, wandering heroes, guardians and turn reports.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
book.name = ECHOES.name;

// Alpha's home at one end with a planet beside it; Bravo's at the other; unclaimed points of interest between.
function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'near', name: 'Near', type: 'planet', notes: '', q: 2, r: 0 },
      { id: 'mid', name: 'Middle', type: 'research', notes: '', q: 4, r: 0 },
      { id: 'far', name: 'Far', type: 'anomaly', notes: '', q: 6, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 0 },
    ],
    log: [],
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const unit = (points: number): Unit => ({ ...unitFromCatalog(book.units[0], randomLoadout(book.units[0], () => 0), book), points });

function force(factionId: string, supply = 1000, shards = 0): Force {
  const f = newForce(factionId);
  f.startingSupply = supply;
  f.umbraShards = shards;
  f.nexus = emptyNexus(factionId);
  f.units.push(unitFromCatalog(book.units[0], randomLoadout(book.units[0], () => 0), book));
  return f;
}

describe('fog of war', () => {
  it('sees its own sectors and those within sight, further from home', () => {
    const c = campaign();
    expect([...visibleTo(c, 'A')].sort()).toEqual(['hA', 'near', 'pA']);
    expect(FOG.homeSight).toBe(2);
    sector(c, 'pA').buildings = ['watchtower'];
    expect(visibleTo(c, 'A').has('mid')).toBe(false);
    sector(c, 'pA').q = 2;
    sector(c, 'near').q = 3;
    expect(visibleTo(c, 'A').has('mid')).toBe(true);
  });

  it('remembers what it has seen, and the GM sees everything', () => {
    const c = campaign();
    explore(c);
    sector(c, 'pA').owner = 'B';
    sector(c, 'pA').q = 8;
    expect([...rememberedBy(c, 'A')]).toEqual(['pA']);
    const sight = sightMap(c, 'A');
    expect([sight(sector(c, 'near')), sight(sector(c, 'pA')), sight(sector(c, 'far'))]).toEqual(['visible', 'remembered', 'hidden']);
    expect(sightMap(c, undefined)(sector(c, 'far'))).toBe('visible');
  });
});

describe('planet production', () => {
  it('banks Supply each round up to the cap, more with Barracks', () => {
    const c = campaign();
    expect(productionSites(c, 'A').map((s) => s.id)).toEqual(['hA', 'pA']);
    accrueProduction(c);
    expect(sector(c, 'pA').bank).toBe(PRODUCTION.perRound);
    expect(sector(c, 'near').bank).toBeUndefined();
    sector(c, 'pA').bank = 600;
    expect(build(c, sector(c, 'pA'), 'barracks', force('A', 1000, 15))).toBe(true);
    expect(sector(c, 'pA').bank).toBe(350);
    accrueProduction(c); // still going up: the old rate
    expect(sector(c, 'pA').bank).toBe(350 + PRODUCTION.perRound);
    finishConstruction(c);
    accrueProduction(c);
    expect(sector(c, 'pA').bank).toBe(350 + PRODUCTION.perRound + PRODUCTION.barracks);
    sector(c, 'pA').bank = bankCap(sector(c, 'pA')) - 1;
    accrueProduction(c);
    expect(sector(c, 'pA').bank).toBe(bankCap(sector(c, 'pA')));
  });

  it('builds one at a time, paid in Supply and Umbra Shards, finished when the round ends; Walls reinforce for good', () => {
    const c = campaign();
    const s = sector(c, 'pA');
    const f = force('A', 1000, 1);
    expect(buildBlock(s, 'walls', f)).toMatch(/200 Materials/);
    s.bank = 1000;
    expect(buildBlock(s, 'walls', f)).toMatch(/6 Umbra Shards/);
    f.umbraShards = 9;
    expect(build(c, s, 'walls', f)).toBe(true);
    expect([s.bank, f.umbraShards, isReinforced(s), freeSlots(s)]).toEqual([800, 3, false, 1]);
    expect(buildBlock(s, 'depot', f)).toMatch(/one at a time/);
    // Cancelling gives everything back.
    cancelBuilding(s, [f]);
    expect([s.bank, f.umbraShards, s.construction]).toEqual([1000, 9, undefined]);
    build(c, s, 'walls', f);
    expect(finishConstruction(c).map((x) => x.building)).toEqual(['walls']);
    expect(isReinforced(s)).toBe(true);
    expect(buildBlock(s, 'walls', f)).toBe('Already built');
    expect(build(c, s, 'depot')).toBe(true); // no shards needed
    finishConstruction(c);
    expect(buildBlock(s, 'watchtower', f)).toMatch(/No free slot/);
    expect(BUILDINGS.filter((b) => b.shards === 0).every((b) => b.cost <= 300)).toBe(true);
  });

  it('loses a building going up when the sector is taken, and ends the round with it built', () => {
    const c = campaign();
    const s = sector(c, 'pA');
    s.bank = 500;
    build(c, s, 'watchtower');
    const undo = {};
    changeHands(s, 'B', undo);
    expect([s.construction, s.bank]).toEqual([undefined, undefined]);
    s.owner = 'A';
    s.bank = 500;
    build(c, s, 'watchtower');
    const r = endRound(c, () => 0.5, '2026-10-20');
    expect(s.buildings).toEqual(['watchtower']);
    expect(reportFor(r.report, 'A').some((l) => l.icon === '🏗' && l.text.includes('Watchtower'))).toBe(true);
    expect(reportFor(r.report, 'B').some((l) => l.icon === '🏗')).toBe(false);
  });

  it('produces units from the bank, with Training Grounds XP', () => {
    const s = campaign().sectors[1];
    s.bank = 300;
    s.buildings = ['training'];
    const u = unit(200);
    expect(produce(s, [unit(400)])).toBe(false);
    expect(produce(s, [u])).toBe(true);
    expect(s.bank).toBe(100);
    expect(u.xp).toBe(PRODUCTION.trainingXp);
    expect(u.notes).toContain('Produced at A Planet.');
  });
});

describe('hero offers', () => {
  it('offers a hero from the faction\'s books, and it leaves after its time', () => {
    const c = campaign();
    const forces = [force('A')];
    const { fresh } = rollOffers(c, [book], forces, () => 0, uid);
    expect(fresh.map((o) => o.factionId)).toEqual(['A']); // Bravo has no forces, so no books
    expect(hasRule(fresh[0].unit.rules, 'Hero')).toBe(true);
    expect(fresh[0].fee).toBeGreaterThanOrEqual(heroFee(0));
    c.round = 1 + HERO_OFFERS.lasts;
    expect(openOffers(c, 'A')).toEqual([]);
    expect(rollOffers(c, [book], forces, () => 0.99, uid).gone).toHaveLength(1);
    expect(c.offers).toBeUndefined();
  });

  it('is hired for Umbra Shards with Supply room, and joins for good', () => {
    const c = campaign();
    const f = force('A');
    rollOffers(c, [book], [f], () => 0, uid);
    const o = c.offers![0];
    expect(hireBlock(c, o, f)).toMatch(/Umbra Shards/);
    f.umbraShards = o.fee + 1;
    expect(hireBlock(c, o, force('B'))).toMatch(/another faction/);
    f.startingSupply = f.units[0].points;
    expect(hireBlock(c, o, f)).toMatch(/Supply free/);
    f.startingSupply = 5000;
    const hired = hireHero(c, o.id, f, '2026-10-20', uid);
    expect(hired?.unitType).toBe(o.unit.unitType);
    expect(f.units).toHaveLength(2);
    expect(f.umbraShards).toBe(1);
    expect(c.offers).toEqual([]);
  });
});

describe('guardians', () => {
  it('guards AI-held points of interest, stronger deeper in', () => {
    const c = campaign();
    expect(guardianTier(0)).toBe('Common');
    expect(guardianTier(GUARDIANS.rare)).toBe('Rare');
    expect(guardianTier(1)).toBe('Legendary');
    const placed = placeGuardians(c, [book], [], () => 0.1, uid);
    expect(placed.map((s) => s.id).sort()).toEqual(['far', 'mid', 'near']);
    expect(c.sectors.filter((s) => s.guardian).every(guardable)).toBe(true);
    const g = sector(c, 'near').guardian!;
    expect(hasRule(g.unit.rules, 'Hero')).toBe(true);
    expect(ruleRating(g.unit.rules, 'Tough')).toBeGreaterThanOrEqual(GUARDIANS.toughFactor);
    expect(placeGuardians(c, [book], [], () => 0.1, uid)).toEqual([]);
    // With no copy of the book imported, the one that ships with the site stands in.
    expect(placeGuardians(campaign(), [], [], () => 0.1, uid)).toHaveLength(3);
  });

  it('leads the garrison', () => {
    const c = campaign();
    placeGuardians(c, [book], [], () => 0.1, uid);
    const s = sector(c, 'mid');
    const units = garrison(s, book, 1500);
    expect(units[0].name).toBe(s.guardian!.name);
    expect(units.reduce((n, u) => n + u.points, 0)).toBeLessThanOrEqual(1500 + s.guardian!.unit.points);
  });
});

describe('turn report', () => {
  it('tells each faction only what it fought in or could see', () => {
    const c = campaign();
    c.log.push({ id: 'g', date: '', round: 1, sectorId: 'far', attacker: 'B', defender: ECHOES.id, winner: 'B', notes: '' });
    sector(c, 'far').owner = 'B';
    const r = endRound(c, () => 0.5, '2026-10-20');
    const report = r.report;
    expect(c.reports).toEqual([report]);
    expect(buildReport(c, r, {}, '2026-10-21').date).toBe('2026-10-21');
    const battle = (fid?: string) => reportFor(report, fid).some((l) => l.sectorId === 'far' && l.icon === '⚔');
    expect([battle(undefined), battle('B'), battle('A')]).toEqual([true, true, false]);
    expect(reportFor(report, 'A').some((l) => l.text.includes('threat'))).toBe(true);
    expect(reportFor(report, 'A').filter((l) => l.icon === '⚒').every((l) => l.factions?.includes('A'))).toBe(true);
  });
});
