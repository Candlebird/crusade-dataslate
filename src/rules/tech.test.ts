import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { newForce, unitFromCatalog } from '../model/factory';
import type { Campaign, CampaignEvent, Force, Unit } from '../model/types';
import { randomLoadout } from './echoForce';
import { ECHOES, emptyNexus, incomeItems, nexusEntry, recordSectorGame, removeSectorGame, rollGuardianLoot } from './nexus';
import { BUILDINGS, GUARDIAN_LOOT, NEXUS_TECH, PRODUCTION, TECH_BRANCHES } from './nexusData';
import {
  bankCap, buildBlock, buildingSlots, coreBlock, exchange, exchangeBlock, installCore, produceCost, productionRate, tradeBonus,
} from './production';
import { accrueResearch, knows, research, researchBlock, researchRate, techStatus } from './tech';

// The tech tree, the buildings it unlocks, and Guardian loot (Nexus Wars).

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));
book.name = ECHOES.name;

function campaign(): Campaign {
  return {
    id: 'c', name: 'Test', updatedAt: '', round: 1,
    factions: [{ id: 'A', name: 'Alpha', player: '', color: '#f00' }, { id: 'B', name: 'Bravo', player: '', color: '#00f' }],
    sectors: [
      { id: 'hA', name: 'A Home', type: 'home', owner: 'A', notes: '', q: 0, r: 0 },
      { id: 'pA', name: 'A Planet', type: 'planet', owner: 'A', notes: '', q: 1, r: 0 },
      { id: 'pA2', name: 'A Planet 2', type: 'planet', owner: 'A', notes: '', q: 2, r: 0 },
      { id: 'near', name: 'Near', type: 'planet', notes: '', q: 3, r: 0 },
      { id: 'mid', name: 'Middle', type: 'research', notes: '', q: 5, r: 0 },
      { id: 'hB', name: 'B Home', type: 'home', owner: 'B', notes: '', q: 9, r: 0 },
    ],
    log: [],
  };
}

const sector = (c: Campaign, id: string) => c.sectors.find((s) => s.id === id)!;
const faction = (c: Campaign, id: string) => c.factions.find((f) => f.id === id)!;
const unit = (points: number, tough = 0): Unit => ({ ...unitFromCatalog(book.units[0], randomLoadout(book.units[0], () => 0), book), points, tough });
const building = (id: string) => BUILDINGS.find((b) => b.id === id)!;

function force(factionId: string, shards = 0): Force {
  const f = newForce(factionId);
  f.umbraShards = shards;
  f.nexus = emptyNexus(factionId);
  return f;
}

describe('the tech tree', () => {
  it('has every building in a branch, its requirements a tier lower in the same tree', () => {
    expect(BUILDINGS).toHaveLength(27);
    expect(new Set(BUILDINGS.map((b) => b.id)).size).toBe(BUILDINGS.length);
    for (const b of BUILDINGS) {
      expect(TECH_BRANCHES.some((br) => br.id === b.branch)).toBe(true);
      expect(b.tier === 1).toBe(!b.requires?.length);
      for (const r of b.requires ?? []) expect(building(r).tier).toBeLessThan(b.tier);
    }
  });

  it('knows tier 1 from the start and researches the rest in order', () => {
    const c = campaign();
    const f = faction(c, 'A');
    expect([techStatus(f, building('depot')), techStatus(f, building('tradeHub')), techStatus(f, building('exchange'))]).toEqual(['known', 'open', 'locked']);
    expect(researchBlock(f, 'tradeHub')).toMatch(/Research/);
    f.research = NEXUS_TECH.cost[2] + 1;
    expect(research(c, 'A', 'exchange')).toBe(false);
    expect(research(c, 'A', 'tradeHub')).toBe(true);
    expect([f.research, knows(f, building('tradeHub')), researchBlock(f, 'tradeHub')]).toEqual([1, true, 'Already researched']);
    expect(researchBlock(f, 'exchange')).toMatch(/Needs Foundry/);
  });

  it('researches with a Blueprint for free', () => {
    const c = campaign();
    const f = faction(c, 'A');
    expect(researchBlock(f, 'foundry', true)).toMatch(/Blueprint/);
    f.blueprints = 1;
    expect(research(c, 'A', 'foundry', true)).toBe(true);
    expect([f.blueprints, f.research, f.techs]).toEqual([undefined, undefined, ['foundry']]);
  });

  it('earns Research each round, more with stations and observatories', () => {
    const c = campaign();
    expect(researchRate(c, 'A')).toBe(NEXUS_TECH.perRound);
    sector(c, 'mid').owner = 'A';
    sector(c, 'pA').buildings = ['observatory'];
    expect(researchRate(c, 'A')).toBe(NEXUS_TECH.perRound + NEXUS_TECH.perStation + NEXUS_TECH.perObservatory);
    accrueResearch(c);
    expect([faction(c, 'A').research, faction(c, 'B').research]).toEqual([researchRate(c, 'A'), NEXUS_TECH.perRound]);
  });

  it('only builds what the owner has researched, and home-only buildings at a home', () => {
    const c = campaign();
    const s = sector(c, 'pA');
    s.bank = 1000;
    const f = force('A', 10);
    expect(buildBlock(s, 'tradeHub', f, c)).toMatch(/research/i);
    faction(c, 'A').techs = ['tradeHub', 'foundry', 'exchange'];
    expect(buildBlock(s, 'tradeHub', f, c)).toBeUndefined();
    expect(buildBlock(s, 'exchange', f, c)).toMatch(/home/i);
    sector(c, 'hA').bank = 1000;
    expect(buildBlock(sector(c, 'hA'), 'exchange', f, c)).toBeUndefined();
  });
});

describe('buildings', () => {
  it('Trade Hub: more Materials for planets held nearby, and a bigger bank', () => {
    const c = campaign();
    const s = sector(c, 'pA');
    s.buildings = ['tradeHub'];
    expect(tradeBonus(s, c)).toBe(2 * PRODUCTION.tradeHub.perPlanet); // the home and the other planet
    expect(productionRate(s, c)).toBe(PRODUCTION.perRound + 2 * PRODUCTION.tradeHub.perPlanet);
    expect(tradeBonus(s)).toBe(0);
    s.buildings = ['logistics'];
    expect(bankCap(s, c)).toBe(PRODUCTION.perRound * (PRODUCTION.bankRounds + PRODUCTION.logisticsRounds));
  });

  it('Foundry and Vehicle Bay make units cheaper', () => {
    const s = campaign().sectors[1];
    s.buildings = ['foundry', 'vehicleBay'];
    expect(produceCost(s, [unit(100), unit(100, PRODUCTION.vehicleBay.tough)])).toBe(
      Math.round(100 * (1 - PRODUCTION.foundryDiscount)) + Math.round(100 * (1 - PRODUCTION.foundryDiscount - PRODUCTION.vehicleBay.discount)),
    );
  });

  it('Grand Exchange: once a round, Materials for a shard or a shard for Materials', () => {
    const c = campaign();
    const s = sector(c, 'hA');
    const f = force('A');
    expect(exchangeBlock(c, s, 'buyShard', f)).toMatch(/No Grand Exchange/);
    s.buildings = ['exchange'];
    s.bank = PRODUCTION.exchange.materials;
    expect(exchange(c, s, 'buyShard', f)).toBe(true);
    expect([s.bank, f.umbraShards, f.ledger[f.ledger.length - 1]?.us]).toEqual([0, 1, 1]);
    expect(exchangeBlock(c, s, 'sellShard', f)).toMatch(/this round/);
    c.round = 2;
    expect(exchange(c, s, 'sellShard', f)).toBe(true);
    expect([s.bank, f.umbraShards]).toEqual([PRODUCTION.exchange.back, 0]);
  });

  it('Medicae Ward and Umbral Spire add round income', () => {
    const c = campaign();
    const s = sector(c, 'hA');
    s.buildings = ['medicae', 'spire'];
    const items = incomeItems(s);
    const medicae = items.find((i) => i.kind === 'medicae')!;
    expect(nexusEntry(medicae, undefined)?.removeScar).toBe(true);
    expect(items.find((i) => i.source.includes('Umbral Spire'))?.us).toBe(1);
  });
});

describe('Building Expansions', () => {
  it('give one planet a building slot more, for good', () => {
    const c = campaign();
    const s = sector(c, 'pA');
    expect(buildingSlots(s)).toBe(PRODUCTION.slots.planet);
    expect(coreBlock(c, s)).toMatch(/No Building Expansion/);
    faction(c, 'A').cores = 2;
    expect(coreBlock(c, sector(c, 'hA'))).toMatch(/Only planets/);
    expect(installCore(c, s)).toBe(true);
    expect([buildingSlots(s), faction(c, 'A').cores, coreBlock(c, s)]).toEqual([(PRODUCTION.slots.planet ?? 0) + PRODUCTION.coreSlots, 1, 'This planet already has one']);
  });
});

describe('Guardian loot', () => {
  const guardian = (tier: 'Common' | 'Rare' | 'Legendary') => ({ name: 'Warden', tier, unit: unit(100) });

  it('rolls D6 plus the tier bonus, up to the table', () => {
    const c = campaign();
    const s = sector(c, 'near');
    expect(rollGuardianLoot(c, s, guardian('Common'), 'A', () => 0)?.roll).toBe(1);
    expect(rollGuardianLoot(c, s, guardian('Rare'), 'A', () => 0)?.roll).toBe(1 + GUARDIAN_LOOT.bonus.Rare);
    expect(rollGuardianLoot(c, s, guardian('Legendary'), 'A', () => 0.99)?.roll).toBe(GUARDIAN_LOOT.table.length);
    expect(faction(c, 'A').cores).toBe(1);
  });

  it('banks Materials at the sector, or home if it has no bank', () => {
    const c = campaign();
    const loot = rollGuardianLoot(c, sector(c, 'near'), guardian('Common'), 'A', () => 0)!;
    expect([loot.sectorId, loot.amount, sector(c, 'near').bank]).toEqual(['near', GUARDIAN_LOOT.table[0].amount, GUARDIAN_LOOT.table[0].amount]);
    const station = rollGuardianLoot(c, sector(c, 'mid'), guardian('Common'), 'A', () => 0)!;
    expect([station.sectorId, sector(c, 'hA').bank]).toEqual(['hA', GUARDIAN_LOOT.table[0].amount]);
  });

  it('is rolled when the game is recorded and given back when it is deleted', () => {
    const c = campaign();
    const s = sector(c, 'mid');
    s.guardian = guardian('Common');
    const e: CampaignEvent = { id: 'g', date: '', round: 1, sectorId: 'mid', attacker: 'A', defender: ECHOES.id, winner: 'A', notes: '' };
    recordSectorGame(c, e, () => 0.5); // 4: Lost Schematics
    expect([e.loot?.id, faction(c, 'A').research]).toEqual(['research', GUARDIAN_LOOT.table[3].amount]);
    removeSectorGame(c, 'g');
    expect(faction(c, 'A').research).toBeUndefined();
  });
});
