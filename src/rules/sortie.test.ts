import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newForce, newUnit } from '../model/factory';
import { applySortie, bankOffTableXp, offTableKey, offTableLeft, postWeekly, weekBoard } from './downtime';
import { partyProblem, sortieProblem, startSortie } from './tasks';
import { OFF_TABLE_XP, SORTIE, SORTIE_BOONS } from './downtimeData';
import { SORTIE_BOSSES, SORTIE_REGIONS } from './sortieStory';
import { RELICS } from './data';
import { awardFeats, trainingFeats } from './feats';
import { raidBand, raiderPool } from './raiders';
import {
  gain, nextTurn, braceFor, omensRead, sigStrength, actingSquad, addQuirk, quirkInfo, sigsOf, tierPay, xpCap, active, autoChoice, autoStep, bossOf, bountyOf, regionName, relicKeysOf, relicsOf, threadDone, voiceKind, voiceLine, campRest, epilogueOf, leaveShop, regionOf, shopBuy, shopHeal, startCombat, choiceOpen, createRun, enterNode, eventChoose, eventOf, fightBudget, sizeUp, giveOrder, startRound, gunReach, keepsHaul, distOf,
  leaveCombat, leaveEvent, moveMember, nextSlots, onField, partyLine, patchUp, pickBoon, reachable, runXp, skillProblem, skillsOf, squadOf,
  weekKey, weekSeed, weeklyScore, reveal, sightOf, veteranTitle,
  ambushOdds, beastInfo, beastKey, cursesOf, cursed, shopPrice, goalProgress, goalText, lastStanding, rematchTricks, unlockedBoons, markHeat, marked,
  type SortieRun,
} from './sortie';

// Sortie: the Darkest Dungeon-style party run.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });

const UNITS: Record<string, () => Unit> = {
  troopers: () => newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
  hero: () => newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  tank: () => newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', size: 1, tough: 6, quality: 4, defense: 2, points: 210, rules: ['Tough(6)', 'Impact(3)'], weapons: [gun('Cannon', 30, 1, 1, ['AP(2)', 'Blast(3)', 'Deadly(3)']), gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
  berserkers: () => newUnit({ id: 'zerk', name: 'Berserkers', category: 'Infantry', size: 5, quality: 3, defense: 4, points: 130, rules: ['Furious', 'Fearless'], weapons: [gun('Great Axes', 0, 3, 5, ['AP(1)'])] }),
  bunker: () => newUnit({ id: 'bunk', name: 'Bunker', category: 'Fortification', size: 1, tough: 6, quality: 4, defense: 2, points: 100, rules: ['Tough(6)'], weapons: [gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
  snipers: () => newUnit({ id: 'snip', name: 'Snipers', category: 'Infantry', size: 3, quality: 3, defense: 5, points: 90, rules: ['Stealth'], weapons: [gun('Sniper Rifle', 36, 1, 3, ['AP(2)', 'Deadly(2)'])] }),
};

/** Parties of three to play with. */
const PARTIES: Record<string, () => Unit[]> = {
  line: () => [UNITS.troopers(), UNITS.hero(), UNITS.snipers()],
  brawl: () => [UNITS.berserkers(), UNITS.hero(), UNITS.tank()],
  guns: () => [UNITS.snipers(), UNITS.troopers(), UNITS.tank()],
  fort: () => [UNITS.berserkers(), UNITS.troopers(), UNITS.bunker()],
};

/** Play a whole run on autopilot. */
function play(units: Unit[], seed: number, mode: 'free' | 'shard' = 'free', length: 'short' | 'long' = 'short'): SortieRun {
  const run = createRun(units, seed, mode, length);
  for (let i = 0; i < 20000 && !run.over; i++) autoStep(run, book);
  return run;
}

/** Play a whole run the lazy way: At Will every turn, and a random pick at every other choice. */
function spam(units: Unit[], seed: number, length: 'short' | 'long' = 'short'): SortieRun {
  const run = createRun(units, seed, 'free', length);
  let x = seed;
  const r = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  for (let i = 0; i < 20000 && !run.over; i++) {
    const c = run.combat;
    if (run.screen === 'map') enterNode(run, book, pick(reachable(run)));
    else if (run.screen === 'combat') {
      if (c?.over) leaveCombat(run);
      else if (c?.need === 'brace') braceFor(run, pick(c.brace!.options));
      else if (c?.need === 'start') startRound(run);
      else if (c?.need === 'order') giveOrder(run, 'atwill');
      else if (c?.need === 'next') nextTurn(run);
    } else if (run.screen === 'reward') {
      const n = run.offer?.boons.length ?? 0;
      const k = Math.floor(r() * (n + (run.offer?.patch ? 1 : 0)));
      if (k < n) pickBoon(run, k);
      else patchUp(run);
    } else if (run.screen === 'camp') campRest(run);
    else if (run.screen === 'shop') {
      if (r() < 0.5) shopBuy(run, Math.floor(r() * 3));
      else leaveShop(run);
    } else if (run.screen === 'event') {
      if (run.event?.result !== undefined) leaveEvent(run, book);
      else {
        const open = eventOf(run)!.choices.map((ch, j) => (choiceOpen(run, ch) ? j : -1)).filter((j) => j >= 0);
        eventChoose(run, pick(open.length ? open : [0]));
      }
    }
  }
  return run;
}

/** A run of the party, in its first fight. */
function fight(units: Unit[], seed: number): SortieRun {
  const run = createRun(units, seed);
  enterNode(run, book, reachable(run)[0]);
  if (run.combat?.need === 'start') startRound(run);
  while (run.combat?.need === 'next') nextTurn(run);
  return run;
}

describe('sortie', () => {
  it('gives every model a real weapon and loses a lone special weapon last', () => {
    const servants = newUnit({ id: 'serv', name: 'Servants', category: 'Infantry', size: 3, quality: 4, defense: 4, points: 100, weapons: [gun('Hammer', 0, 2, 2, ['AP(2)']), gun('Fusion Rifle', 12, 1, 1, ['AP(4)'])] });
    const s = squadOf(servants, 'me');
    const names = (m: (typeof s.models)[number]) => m.guns.map((g) => g.name);
    expect(s.models.map(names)).toEqual([['Hammer'], ['Hammer'], ['Fusion Rifle', 'Fists']]);
    s.models[0].hp = 0;
    s.models[1].hp = 0;
    expect(active(s).flatMap(names)).toContain('Fusion Rifle');
  });

  it('splits weapons between models and multiplies wounds', () => {
    const s = squadOf(UNITS.troopers(), 'me');
    expect(s.models).toHaveLength(10);
    expect(s.models[0].max).toBe(SORTIE.hpMul);
    expect(s.models.every((m) => m.guns.some((g) => g.name === 'Rifles') && m.guns.some((g) => g.name === 'CCW'))).toBe(true);
    const t = squadOf(UNITS.tank(), 'me');
    expect(t.models[0].max).toBe(6 * SORTIE.hpMul);
  });

  it('wants three different fit units, at most one Fortification', () => {
    const [a, b, c] = PARTIES.fort();
    expect(partyProblem([a, b, c])).toBeNull();
    expect(partyProblem([a, b])).toMatch(/three/);
    expect(partyProblem([a, a, b])).toMatch(/different/);
    expect(partyProblem([a, c, { ...UNITS.bunker(), id: 'bunk2' }])).toMatch(/Fortification/);
    expect(partyProblem([a, b, { ...c, status: 'comatose' }])).toMatch(/fit/);
  });

  it('puts a Fortification at the back of the line', () => {
    const run = createRun([UNITS.bunker(), UNITS.troopers(), UNITS.hero()], 1);
    expect(run.party.map((m) => m.unit.name)).toEqual(['Troopers', 'Captain', 'Bunker']);
  });

  it('counts gun reach from the slot, and blades only from the front', () => {
    const run = fight(PARTIES.line(), 1);
    const [front, mid, back] = run.combat!.party;
    const gunOf = (s: typeof front, name: string) => s.models[0].guns.find((g) => g.name === name)!;
    expect(front.slot).toBe(0);
    expect(gunReach(run, front, gunOf(front, 'CCW'))).toBe(1);
    expect(gunReach(run, front, gunOf(front, 'Rifles'))).toBe(2);
    expect(gunReach(run, mid, gunOf(mid, 'Sword'))).toBe(0);
    expect(gunReach(run, mid, gunOf(mid, 'Pistol'))).toBe(1);
    expect(gunReach(run, back, gunOf(back, 'Sniper Rifle'))).toBe(1);
    mid.slot = 0;
    expect(gunReach(run, mid, gunOf(mid, 'Pistol'))).toBe(1);
    expect(gunReach(run, mid, gunOf(mid, 'Sword'))).toBe(1);
  });

  it('turns the line every round: middle to front, front to back, back to middle', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = fight(PARTIES.guns(), seed);
      const c = run.combat!;
      const before = partyLine(c).map((p) => p.key);
      const round = c.round;
      for (let i = 0; i < 500 && !c.over && c.round === round; i++) autoStep(run, book);
      if (c.over || partyLine(c).length < 3) continue;
      expect(partyLine(c).map((p) => p.key)).toEqual([before[1], before[2], before[0]]);
      return;
    }
    throw new Error('no fight lasted a round with the whole party up');
  });

  it('keeps a Fortification at the back as the line turns', () => {
    for (let seed = 1; seed < 60; seed++) {
      const run = fight(PARTIES.fort(), seed);
      const c = run.combat!;
      const before = partyLine(c).map((p) => p.key);
      const round = c.round;
      for (let i = 0; i < 500 && !c.over && c.round === round; i++) autoStep(run, book);
      if (c.over || partyLine(c).length < 3) continue;
      expect(partyLine(c).map((p) => p.key)).toEqual([before[1], before[0], before[2]]);
      return;
    }
    throw new Error('no fight lasted a round with the whole party up');
  });

  it('reorders the line only on the map, and never moves a Fortification', () => {
    const run = createRun(PARTIES.fort(), 1);
    const names = () => run.party.map((m) => m.unit.name);
    expect(moveMember(run, 1, -1)).toBe(true);
    expect(names()).toEqual(['Troopers', 'Berserkers', 'Bunker']);
    expect(moveMember(run, 1, 1)).toBe(false);
    expect(moveMember(run, 2, -1)).toBe(false);
    enterNode(run, book, reachable(run)[0]);
    expect(moveMember(run, 0, 1)).toBe(false);
    const c = run.combat!;
    expect(partyLine(c).map((p) => p.name)).toEqual(['Troopers', 'Berserkers', 'Bunker']);
  });

  it('lets a unit Regroup to mend, then makes it wait', () => {
    const run = fight(PARTIES.line(), 4);
    const c = run.combat!;
    const s = actingSquad(run)!;
    for (const m of s.models) m.hp = 1;
    expect(skillsOf(run).find((x) => x.id === 'regroup')?.wait).toBe(0);
    giveOrder(run, 'regroup');
    for (let i = 0; i < 500 && !c.over && s.models.every((m) => m.hp === 1); i++) autoStep(run, book);
    expect(s.models.some((m) => m.hp > 1)).toBe(true);
    expect(s.cooldowns.regroup).toBeGreaterThan(c.round);
  });

  it('shows where each unit stands next round, a Fortification holding the Back', () => {
    const line = fight(PARTIES.line(), 3).combat!;
    const [f, m, b] = partyLine(line);
    expect(nextSlots(line)).toEqual({ [f.key]: 2, [m.key]: 0, [b.key]: 1 });
    const fort = fight(PARTIES.fort(), 3).combat!;
    const [ff, fm, fb] = partyLine(fort);
    expect(nextSlots(fort)).toEqual({ [ff.key]: 1, [fm.key]: 0, [fb.key]: 2 });
  });

  it('gives slot boons only to their slot', () => {
    const run = fight(PARTIES.line(), 5);
    const [, mid, back] = partyLine(run.combat!);
    const gun = (s: typeof back) => active(s)[0].guns.find((g) => !g.melee)!;
    gun(mid).range = 24;
    const before = [gunReach(run, mid, gun(mid)), gunReach(run, back, gun(back))];
    run.boons.push('cells');
    expect(gunReach(run, mid, gun(mid))).toBe(before[0]);
    expect(gunReach(run, back, gun(back))).toBe(Math.min(SORTIE.ranks, before[1] + 1));
    run.boonTier = { cells: 'Rare' };
    expect(gunReach(run, mid, gun(mid))).toBe(before[0] + 1);
  });

  it('closes ranks when a unit falls', () => {
    const run = fight(PARTIES.line(), 2);
    const c = run.combat!;
    const [front] = partyLine(c);
    for (const m of front.models) m.hp = 0;
    for (let i = 0; i < 500 && !c.over && front.slot !== undefined; i++) autoStep(run, book);
    expect(front.slot).toBeUndefined();
    if (!c.over) expect(partyLine(c).map((p) => p.slot)).toEqual([0, 1]);
  });

  it('refuses a melee strike past Close, and a charge from the front brings the target in', () => {
    for (let seed = 1; seed < 300; seed++) {
      const run = fight(PARTIES.brawl(), seed);
      const c = run.combat!;
      const s = actingSquad(run);
      const mid = c.need === 'order' && s?.name === 'Berserkers' && s.slot === 0 && onField(c).find((e) => distOf(e) === 2);
      if (!mid) continue;
      expect(skillProblem(run, 'melee', mid.key)).toMatch(/Close/);
      expect(skillProblem(run, 'charge', mid.key)).toBeNull();
      const from = c.log.length;
      giveOrder(run, 'charge', mid.key);
      // A shaken or stunned model may spend its turn instead.
      if (!c.log.slice(from + 1).some((l) => l.text.startsWith('Berserkers'))) continue;
      expect(distOf(mid)).toBe(1);
      return;
    }
    throw new Error('no fight with the Berserkers in front and a squad at Mid found');
  });

  it('blocks blades and charges away from the front', () => {
    const run = fight([UNITS.troopers(), UNITS.berserkers(), UNITS.snipers()], 1);
    const c = run.combat!;
    const zerks = c.party.find((p) => p.name === 'Berserkers')!;
    zerks.slot = 1;
    c.acting = zerks.key;
    c.need = 'order';
    const sk = skillsOf(run);
    expect(sk.find((x) => x.id === 'charge')?.blocked).toMatch(/front/);
    expect(sk.find((x) => x.id === 'melee')?.blocked).toMatch(/front/);
    expect(skillProblem(run, 'charge', onField(c)[0]?.key)).toMatch(/front/);
  });

  it('never puts two camps, shrines or caches in a row', () => {
    const benefit = (k: string) => k === 'camp' || k === 'shrine' || k === 'cache' || k === 'shop';
    for (let seed = 1; seed <= 300; seed++) for (const length of ['short', 'long'] as const) {
      const run = createRun(PARTIES.line(), seed, 'free', length);
      for (const row of run.map) for (const n of row) {
        if (!benefit(n.kind)) continue;
        for (const c of n.next) expect(benefit(run.map[n.row + 1][c].kind), `seed ${seed} row ${n.row}`).toBe(false);
      }
    }
  });

  it('sets every run in a region against a named lord, and every elite has an affix', () => {
    const regions = new Set<string>();
    const bosses = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const run = createRun(PARTIES.line(), seed, 'free', 'long');
      regions.add(regionOf(run).id);
      bosses.add(bossOf(run).id);
      for (const n of run.map.flat()) expect(!!n.affix, `seed ${seed}`).toBe(n.kind === 'elite');
      expect(run.journal.some((j) => j.text === regionOf(run).intro)).toBe(true);
    }
    expect(regions.size).toBe(SORTIE_REGIONS.length);
    expect(bosses.size).toBe(SORTIE_BOSSES.length);
  });

  it('follows a story thread once its first step is taken', () => {
    const region = SORTIE_REGIONS.find((r) => r.id === 'ashfields')!;
    const next = region.events.filter((e) => e.after === 'ash1').map((e) => e.id);
    let hits = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const run = createRun(PARTIES.line(), seed);
      run.region = 'ashfields';
      run.map[0][0].kind = 'shrine';
      // Not before the thread starts...
      enterNode(run, book, run.map[0][0]);
      expect(next).not.toContain(run.event!.id);
      const again = createRun(PARTIES.line(), seed);
      again.region = 'ashfields';
      again.flags = ['ash1'];
      again.seen = region.events.filter((e) => !e.after).map((e) => e.id);
      again.map[0][0].kind = 'shrine';
      enterNode(again, book, again.map[0][0]);
      if (next.includes(again.event!.id)) hits++;
    }
    // ...and most often right after (the thread outweighs the common encounters).
    expect(hits).toBeGreaterThan(18);
  });

  it('lets an encounter weaken the lord, up to a cap', () => {
    const run = createRun(PARTIES.line(), 5);
    run.region = 'ashfields';
    run.flags = ['ash1', 'ash2'];
    run.seen = SORTIE_REGIONS[0].events.filter((e) => e.id !== 'ash-charges').map((e) => e.id);
    run.map[0][0].kind = 'shrine';
    let tries = 0;
    while (run.event?.id !== 'ash-charges' && tries++ < 50) {
      run.screen = 'map'; run.row = -1; run.event = undefined;
      enterNode(run, book, run.map[0][0]);
    }
    expect(run.event?.id).toBe('ash-charges');
    eventChoose(run, 0);
    expect(run.weaken).toBeCloseTo(0.3);
    expect(run.event!.result).toMatch(new RegExp(bossOf(run).name));
    run.weaken = 0.9;
    run.screen = 'map';
    startCombat(run, book, 'boss');
    const lord = run.combat!.enemies.find((e) => e.name === bossOf(run).name)!;
    expect(lord).toBeDefined();
    expect(run.combat!.lord).toBeDefined();
    for (const m of lord.models) expect(m.hp).toBeLessThan(m.max);
  });

  it('sells boons and dressings for the run’s Supply', () => {
    const run = createRun(PARTIES.line(), 9);
    run.map[0][0].kind = 'shop';
    enterNode(run, book, run.map[0][0]);
    expect(run.screen).toBe('shop');
    expect(run.shop!.boons.length).toBe(SORTIE.shop.boons);
    const price = run.shop!.boons[0].price;
    shopBuy(run, 0);
    expect(run.boons.length).toBe(0);
    run.haul.supply = price + SORTIE.shop.heal;
    shopBuy(run, 0);
    expect(run.boons).toContain(run.shop!.boons[0].id);
    expect(run.haul.supply).toBe(SORTIE.shop.heal);
    shopBuy(run, 0);
    expect(run.haul.supply).toBe(SORTIE.shop.heal);
    run.party[0].models[0].hp = 1;
    shopHeal(run);
    expect(run.haul.supply).toBe(0);
    expect(run.party[0].models[0].hp).toBeGreaterThan(1);
    leaveShop(run);
    expect(run.screen).toBe('map');
    expect(run.shop).toBeUndefined();
  });

  it('gives every boss its signature in a fight, and ends with the region’s word', () => {
    for (const b of SORTIE_BOSSES) {
      const run = createRun(PARTIES.line(), 3);
      run.boss = b.id;
      startCombat(run, book, 'boss');
      expect(run.combat!.enemies.some((e) => e.name === b.name), b.id).toBe(true);
      // Named once the party has braced, not before (the brace would be no guess at all).
      expect(run.combat!.need).toBe('brace');
      expect(run.combat!.log.some((j) => j.text.startsWith(`${b.sig.name}:`)), b.id).toBe(false);
      autoStep(run, book);
      expect(run.combat!.log.some((j) => j.text.includes(b.sig.name)), b.id).toBe(true);
      for (let i = 0; i < 20000 && !run.over; i++) autoStep(run, book);
      expect(run.over, b.id).toBeDefined();
      expect(epilogueOf(run)).toBeTruthy();
    }
  });

  it('sizes Echo fights to the party, not just its points', () => {
    const run = createRun(PARTIES.guns(), 1);
    const k = sizeUp(PARTIES.guns(), book);
    expect(k).toBeGreaterThan(0);
    expect(fightBudget(run, book, 'fight', 0)).toBeCloseTo(run.power * k * SORTIE.budget);
    // Each lord sizes up the party on its own.
    for (const b of SORTIE_BOSSES) {
      const r = createRun(PARTIES.guns(), 1);
      r.boss = b.id;
      expect(fightBudget(r, book, 'boss'), b.id).toBeGreaterThan(0);
    }
  });

  it('auto-plays every kind of party to an end', () => {
    for (const [name, mk] of Object.entries(PARTIES)) for (let seed = 1; seed <= 4; seed++) {
      const run = play(mk(), seed);
      expect(run.over, `${name} #${seed}`).toBeDefined();
      expect(runXp(run)).toBeLessThanOrEqual(SORTIE.caps.free.short);
    }
  });

  it('offers skills that match the acting unit', () => {
    const run = fight([UNITS.snipers(), UNITS.troopers(), UNITS.tank()], 3);
    const c = run.combat!;
    const s = c.party.find((p) => p.name === 'Snipers')!;
    c.acting = s.key;
    c.need = 'order';
    const ids = skillsOf(run).map((x) => x.id);
    expect(ids).toContain('shoot');
    expect(ids).not.toContain('charge');
    expect(autoChoice(run)).not.toBeNull();
    expect(active(s).length).toBeGreaterThan(0);
  });

  it('outflanking is a free action that leaves the unit its order', () => {
    const scouts = UNITS.snipers();
    scouts.rules.push('Fast');
    const run = fight([UNITS.troopers(), UNITS.hero(), scouts], 3);
    const c = run.combat!;
    const s = c.party.find((p) => p.name === 'Snipers')!;
    c.acting = s.key;
    c.need = 'order';
    giveOrder(run, 'outflank');
    expect(c.need).toBe('order');
    expect(c.acting).toBe(s.key);
    const skills = skillsOf(run);
    expect(skills.find((x) => x.id === 'outflank')!.wait).toBeGreaterThan(0);
    expect(skills.find((x) => x.id === 'shoot')!.reach).toBe(SORTIE.ranks);
    expect(skillProblem(run, 'shoot', onField(c)[0]?.key)).toBeNull();
  });

  it('keeps a shard haul only on a win or a trip home', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const run = play(PARTIES.line(), seed, 'shard');
      expect(keepsHaul(run)).toBe(run.over === 'won' || run.over === 'home');
    }
  });

  it('pays a run out to every unit of the party', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    const ids = party.map((u) => u.id);
    f.umbraShards = SORTIE.cost;
    expect(sortieProblem(f, undefined, party)).toBeNull();
    startSortie(f, undefined, ids);
    expect(f.umbraShards).toBe(0);
    expect(sortieProblem(f, undefined, party)).toMatch(/Umbra Shard/);

    const won = createRun(party, 1, 'shard');
    Object.assign(won, { over: 'won', xp: 9, haul: { supply: 20, rp: 1, us: 1 } });
    applySortie(f, won, '2026-01-01', id);
    for (const u of party) expect(u.xp).toBe(SORTIE.caps.shard.short);
    // The haul's Shard, and one more for All Come Home (no unit wiped out).
    expect(f.umbraShards).toBe(2);
    expect(f.ledger[f.ledger.length - 1]).toMatchObject({ supply: 20, rp: 1 });

    // Only the units wiped out pay for it.
    const fell = createRun(party, 2, 'shard');
    Object.assign(fell, { over: 'fell', xp: 9, haul: { supply: 20, rp: 0, us: 0 } });
    for (const m of fell.party.slice(0, 2)) for (const x of m.models) x.hp = 0;
    const xpBefore = party.map((u) => u.xp);
    applySortie(f, fell, '2026-01-01', id, () => 0.99);
    // The units wiped out take home half the XP.
    const got = runXp(fell);
    expect(party.map((u, i) => u.xp - xpBefore[i])).toEqual([Math.floor(got / 2), Math.floor(got / 2), got]);
    expect(party.map((u) => u.status)).toEqual(['comatose', 'comatose', 'active']);
    expect(f.ledger[f.ledger.length - 1]).toMatchObject({ supply: 0 });

    const others = [UNITS.berserkers(), UNITS.tank(), UNITS.bunker()];
    f.units.push(...others);
    const free = createRun(others, 3);
    free.over = 'fell';
    for (const m of free.party) for (const x of m.models) x.hp = 0;
    applySortie(f, free, '2026-01-01', id, () => 0);
    expect(others.every((u) => u.status === 'active' && !u.scars.length)).toBe(true);
  });

  it('holds free runs to the off-table XP limit for the round, but not Shard runs', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    const won = () => Object.assign(createRun(party, 1, 'free', 'long'), { over: 'won' as const, bossDown: true, xp: 99 });
    applySortie(f, won(), '2026-01-01', id, () => 0.99, 'round-1');
    expect(party.map((u) => u.xp)).toEqual([4, 4, 4]);
    const text = applySortie(f, won(), '2026-01-01', id, () => 0.99, 'round-1');
    expect(party.map((u) => u.xp)).toEqual([OFF_TABLE_XP.perRound, OFF_TABLE_XP.perRound, OFF_TABLE_XP.perRound]);
    expect(text).toContain('off-table XP limit');
    expect(party.map((u) => offTableLeft(u, 'round-1'))).toEqual([0, 0, 0]);
    // A new round opens the allowance again; a Shard run never counts against it.
    expect(offTableLeft(party[0], 'round-2')).toBe(OFF_TABLE_XP.perRound);
    applySortie(f, Object.assign(createRun(party, 2, 'shard'), { over: 'won' as const, xp: 9 }), '2026-01-01', id, () => 0.99, 'round-1');
    expect(party[0].xp).toBe(OFF_TABLE_XP.perRound + SORTIE.caps.shard.short);
  });

  it('shares the off-table XP limit with Training, by week outside a campaign', () => {
    const [u] = PARTIES.line();
    const key = offTableKey(undefined, '2026-10-22');
    expect(key).toBe(weekKey('2026-10-22'));
    expect(bankOffTableXp(u, 3, key)).toBe(3);
    expect(bankOffTableXp(u, 3, key)).toBe(OFF_TABLE_XP.perRound - 3);
    expect(bankOffTableXp(u, 3, key)).toBe(0);
    expect(bankOffTableXp(u, 3, offTableKey(undefined, '2026-10-29'))).toBe(3);
  });

  it('is hard but winnable (balance probe)', () => {
    const rows: string[] = [];
    const checks: (() => void)[] = [];
    const N = process.env.SORTIE_PROBE ? Math.max(40, Number(process.env.SORTIE_PROBE) || 0) : 24;
    let shortWins = 0;
    for (const [name, mk] of Object.entries(PARTIES)) for (const length of ['short', 'long'] as const) {
      let won = 0;
      let lazy = 0;
      let xp = 0;
      let depth = 0;
      for (let seed = 1; seed <= N; seed++) {
        const run = play(mk(), seed * 7919, 'free', length);
        if (run.over === 'won') won++;
        if (spam(mk(), seed * 7919, length).over === 'won') lazy++;
        xp += runXp(run);
        depth += run.depth;
      }
      checks.push(() => {
        // None walks it.
        // Every kind of party gets well into a run; short runs get won (the noise of a small sample bites per party).
        expect(depth / N, `${name} ${length} depth`).toBeGreaterThan(2);
        expect(won / N, `${name} ${length}`).toBeLessThan(0.9);
        // Mashing At Will and picking at random shouldn't carry a run.
        expect(lazy / N, `${name} ${length} spam`).toBeLessThan(0.6);
      });
      if (length === 'short') shortWins += won;
      rows.push(`${name.padEnd(11)} ${length.padEnd(5)} win ${((won / N) * 100).toFixed(0).padStart(3)}%  spam ${((lazy / N) * 100).toFixed(0).padStart(3)}%  xp ${(xp / N).toFixed(2)}  depth ${(depth / N).toFixed(1)}`);
    }
    if (process.env.SORTIE_PROBE) console.log(rows.join('\n'));
    else {
      for (const check of checks) check();
      expect(shortWins).toBeGreaterThan(0);
    }
  }, 600000);
});

describe('sortie story persistence', () => {
  const lordWounds = (run: SortieRun) => {
    run.screen = 'map';
    startCombat(run, book, 'boss');
    const lord = run.combat!.enemies.find((e) => e.name === bossOf(run).name)!;
    return lord.models.reduce((n, m) => n + m.max, 0);
  };

  it('sends a nemesis back tougher, with a taunt', () => {
    const plain = createRun(PARTIES.line(), 11);
    const grudge = createRun(PARTIES.line(), 11);
    grudge.nemesis = 2;
    const a = lordWounds(plain);
    const b = lordWounds(grudge);
    expect(b / a).toBeGreaterThan(1 + SORTIE.nemesis.tough * 2 - 0.15);
    // The lord comes in late; it taunts as it arrives.
    for (const run of [plain, grudge]) for (let i = 0; i < 2000 && !run.combat!.over && onField(run.combat!).every((e) => e.name !== bossOf(run).name); i++) autoStep(run, book);
    expect(grudge.combat!.log.map((l) => l.text)).toContain(bossOf(grudge).taunt);
    expect(plain.combat!.log.map((l) => l.text)).not.toContain(bossOf(plain).taunt);
  });

  it('often picks a lord with a grudge', () => {
    const all = Object.fromEntries(SORTIE_BOSSES.map((b) => [b.id, 1]));
    for (let seed = 1; seed <= 10; seed++) expect(createRun(PARTIES.line(), seed, 'free', 'short', { nemesis: all }).nemesis).toBe(1);
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const run = createRun(PARTIES.line(), seed, 'free', 'short', { nemesis: { [SORTIE_BOSSES[0].id]: 2 } });
      if (run.boss === SORTIE_BOSSES[0].id) {
        hits++;
        expect(run.nemesis).toBe(2);
        expect(run.journal.some((l) => l.text.includes('remembers you'))).toBe(true);
      } else expect(run.nemesis).toBeUndefined();
    }
    expect(hits).toBeGreaterThan(20);
  });

  it('goes deep only into unlocked regions, with bigger fights', () => {
    const run = createRun(PARTIES.line(), 4, 'free', 'short', { deep: ['glass'] });
    expect(run.region).toBe('glass');
    expect(run.deep).toBe(true);
    expect(regionName(run)).toBe('The Glass Heart');
    const flat = createRun(PARTIES.line(), 4);
    flat.region = 'glass';
    expect(fightBudget(run, book, 'fight', 0) / fightBudget(flat, book, 'fight', 0)).toBeCloseTo(SORTIE.deep.budget);
  });

  it('marks a thread done at its finale, and gives the relic only on the way home', () => {
    const run = createRun(PARTIES.line(), 5);
    run.region = 'ashfields';
    run.flags = ['ash1', 'ash2'];
    run.screen = 'event';
    run.event = { id: 'ash-charges' };
    eventChoose(run, 0);
    expect(threadDone(run)).toBe(true);
    expect(relicsOf(run)).toEqual([]);
    run.over = 'fell';
    expect(relicsOf(run)).toEqual([]);
    run.over = 'home';
    expect(relicsOf(run)).toEqual([RELICS.find((r) => r.sortie === 'ashfields')]);
    expect(SORTIE_REGIONS.every((r) => RELICS.some((x) => x.sortie === r.id))).toBe(true);
  });

  it('brings home deep, flawless, nemesis and lord relics from a win', () => {
    const run = createRun(PARTIES.line(), 5);
    Object.assign(run, { region: 'glass', deep: true, over: 'won', bossDown: true, boss: 'terror', nemesis: SORTIE.nemesis.max, tier: SORTIE.relics.lordTier });
    expect(relicKeysOf(run)).toEqual(['flawless', 'deep:glass', 'nemesis', 'lord:terror']);
    expect(relicsOf(run).map((r) => r.tier)).toEqual(['Common', 'Rare', 'Rare', 'Legendary']);
    run.tier = SORTIE.relics.lordTier - 1;
    run.over = 'home';
    expect(relicKeysOf(run)).toEqual([]);
    // Every region's deep version and every lord has one, and every key is earnable.
    expect(SORTIE_REGIONS.every((r) => RELICS.some((x) => x.sortie === `deep:${r.id}`))).toBe(true);
    expect(SORTIE_BOSSES.every((b) => RELICS.some((x) => x.sortie === `lord:${b.id}` && x.tier === 'Legendary'))).toBe(true);
    expect(new Set(RELICS.filter((r) => r.sortie).map((r) => r.sortie)).size).toBe(RELICS.filter((r) => r.sortie).length);
  });

  it('carries grudges, deep regions and relics between runs', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);

    const beaten = createRun(party, 1);
    Object.assign(beaten, { over: 'fell', lordWon: true });
    applySortie(f, beaten, '2026-01-01', id, () => 0.99);
    expect(f.sortie!.nemesis).toEqual({ [beaten.boss]: 1 });
    expect(f.ledger[f.ledger.length - 1].label).toMatch(/will remember this/);
    for (let i = 0; i < 5; i++) applySortie(f, Object.assign(createRun(party, 1), { over: 'fell', lordWon: true }), '2026-01-01', id, () => 0.99);
    expect(f.sortie!.nemesis![beaten.boss]).toBe(SORTIE.nemesis.max);

    const revenge = createRun(party, 1, 'free', 'short', { nemesis: f.sortie!.nemesis });
    Object.assign(revenge, { boss: beaten.boss, nemesis: SORTIE.nemesis.max, over: 'won', bossDown: true });
    revenge.region = 'wreck';
    revenge.flags.push('wreck-done');
    const rp = f.ledger.reduce((t, l) => t + (l.rp ?? 0), 0);
    applySortie(f, revenge, '2026-01-01', id);
    expect(bountyOf(revenge)).toBe(SORTIE.nemesis.max * SORTIE.nemesis.bounty);
    expect(f.sortie!.nemesis).toEqual({});
    expect(f.ledger.filter((l) => !l.label.startsWith('Feat')).reduce((t, l) => t + (l.rp ?? 0), 0) - rp).toBe(bountyOf(revenge));
    expect(f.feats?.sortieNemesis).toBe('2026-01-01');
    expect(f.sortie!.deep).toEqual(['wreck']);
    expect(f.sortie!.relics).toEqual(['wreck', 'flawless', 'nemesis']);

    // A relic comes home once.
    applySortie(f, revenge, '2026-01-01', id);
    expect(f.sortie!.relics).toEqual(['wreck', 'flawless', 'nemesis']);
    expect(f.sortie!.deep).toEqual(['wreck']);
  });

  it('gives each kind of unit its own voice', () => {
    expect(voiceKind(UNITS.bunker())).toBe('fort');
    expect(voiceKind(UNITS.hero())).toBe('hero');
    expect(voiceKind(UNITS.tank())).toBe('big');
    expect(voiceKind(UNITS.troopers())).toBe('squad');
    const run = createRun(PARTIES.line(), 9);
    const rng = run.rng;
    const line = voiceLine(run, 'camp');
    expect(run.rng).toBe(rng);
    expect(run.party.some((m) => line.includes(m.unit.name))).toBe(true);
    run.map[0][0].kind = 'camp';
    enterNode(run, book, run.map[0][0]);
    expect(run.party.some((m) => run.scene!.includes(m.unit.name))).toBe(true);
  });

  it('has encounter odds that add up', () => {
    expect(Object.values(SORTIE.odds).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
});

describe('sortie quirks and tiers', () => {
  it('swaps opposites and keeps at most three quirks', () => {
    const u = UNITS.troopers();
    expect(addQuirk(u, 'steady')).toBe(true);
    expect(addQuirk(u, 'steady')).toBe(false);
    expect(addQuirk(u, 'shaky')).toBe(true);
    expect(u.quirks).toEqual(['shaky']);
    addQuirk(u, 'quick');
    addQuirk(u, 'eagle');
    expect(u.quirks).toEqual(['shaky', 'quick', 'eagle']);
    // Full: a good one pushes out the oldest bad one; a fourth good one has nothing to push out.
    expect(addQuirk(u, 'hardy')).toBe(true);
    expect(u.quirks).toEqual(['quick', 'eagle', 'hardy']);
    expect(addQuirk(u, 'brute')).toBe(false);
    expect(addQuirk(u, 'nope')).toBe(false);
  });

  it('names region quirks after the region', () => {
    expect(quirkInfo('native:glass')).toMatchObject({ name: `${SORTIE_REGIONS.find((r) => r.id === 'glass')!.name}-wise`, good: true });
    expect(quirkInfo('haunted:glass')?.good).toBe(false);
    const u = UNITS.hero();
    addQuirk(u, 'native:glass');
    addQuirk(u, 'haunted:glass');
    expect(u.quirks).toEqual(['haunted:glass']);
  });

  it('gives hardy and frail units more or fewer wounds', () => {
    const base = squadOf(UNITS.hero(), 'p').models[0].max;
    const hardy = UNITS.hero();
    hardy.quirks = ['hardy'];
    const frail = UNITS.hero();
    frail.quirks = ['frail'];
    expect(squadOf(hardy, 'p').models[0].max).toBe(base + 2);
    expect(squadOf(frail, 'p').models[0].max).toBe(base - 2);
    expect(squadOf(hardy, 'e', { echo: true }).models[0].max).toBe(base);
  });

  it('makes higher tiers harder and better paid', () => {
    const plain = createRun(PARTIES.line(), 3);
    expect(tierPay(plain)).toBe(1);
    expect(sigsOf(plain)).toHaveLength(1);
    const hard = createRun(PARTIES.line(), 3, 'free', 'short', { tier: 5 });
    expect(hard.tier).toBe(5);
    expect(tierPay(hard)).toBe(2);
    expect(xpCap(hard)).toBe(2 * xpCap(plain));
    const sigs = sigsOf(hard);
    expect(sigs).toHaveLength(2);
    expect(sigs[0].id).not.toBe(sigs[1].id);
    expect(hard.map.flat().filter((n) => n.kind === 'fight').every((n) => n.affix)).toBe(true);
    expect(plain.map.flat().filter((n) => n.kind === 'fight').some((n) => n.affix)).toBe(false);
    hard.xp = 1;
    expect(runXp(hard)).toBe(2);
    expect(createRun(PARTIES.line(), 3, 'free', 'short', { tier: 99 }).tier).toBe(SORTIE.tiers.length - 1);
  });

  it('unlocks the next tier on a win, and hands out quirks', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    const run = Object.assign(createRun(party, 2), { over: 'won', bossDown: true, depth: 5 });
    applySortie(f, run, '2026-01-01', id, () => 0);
    expect(f.sortie!.tier).toBe(1);
    expect(f.units.every((u) => u.quirks?.length === 1)).toBe(true);
    expect(f.ledger[f.ledger.length - 1].label).toMatch(/unlocked Tier 1/);
    // A win below the top tier open doesn't unlock more.
    applySortie(f, Object.assign(createRun(party, 2), { over: 'won', bossDown: true }), '2026-01-01', id, () => 0.99);
    expect(f.sortie!.tier).toBe(1);
    applySortie(f, Object.assign(createRun(party, 2, 'free', 'short', { tier: 1 }), { over: 'won', bossDown: true }), '2026-01-01', id, () => 0.99);
    expect(f.sortie!.tier).toBe(2);
  });
});

describe('sortie stress, the weekly challenge and recaps', () => {
  it('cracks a unit whose stress is full, for a round, then lets it down', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const run = createRun(PARTIES.line(), seed);
      run.party[0].stress = SORTIE.stress.max;
      startCombat(run, book, 'fight');
      const c = run.combat!;
      const p = c.party.find((x) => x.member === 0)!;
      expect(p.crack?.round).toBe(c.round);
      kinds.add(p.crack!.kind);
      expect(run.party[0].stress).toBe(SORTIE.stress.after);
      if (p.crack!.kind === 'refuse') expect(c.queue.some((t) => t.key === p.key)).toBe(false);
      expect(c.party.filter((x) => x.member !== 0).every((x) => !x.crack)).toBe(true);
    }
    expect(kinds).toEqual(new Set(['refuse', 'wild']));
  });

  it('takes stress off at camp and when patching up', () => {
    const run = createRun(PARTIES.line(), 4);
    for (const m of run.party) m.stress = 9;
    Object.assign(run, { screen: 'reward', offer: { boons: [], patch: true } });
    patchUp(run);
    expect(run.party.every((m) => m.stress === 9 - SORTIE.stress.patch)).toBe(true);
    run.screen = 'camp';
    campRest(run);
    expect(run.party.every((m) => m.stress === 0)).toBe(true);
  });

  it('keeps recaps, up to a cap', () => {
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    const run = Object.assign(createRun(party, 2), { over: 'won' as const, bossDown: true, depth: 6, won: 4 });
    applySortie(f, run, '2026-01-01', id, () => 0.99);
    expect(f.sortie!.recaps).toHaveLength(1);
    const r = f.sortie!.recaps![0];
    expect(r).toMatchObject({ over: 'won', depth: 6, won: 4, region: regionName(run), lord: bossOf(run).name });
    expect(r.party).toHaveLength(3);
    expect(r.lines.length).toBeGreaterThan(0);
    for (let i = 0; i < SORTIE.recaps + 2; i++) {
      applySortie(f, Object.assign(createRun(party, 3), { over: 'quit' as const }), '2026-01-02', id, () => 0.99);
    }
    expect(f.sortie!.recaps).toHaveLength(SORTIE.recaps);
    expect(f.sortie!.recaps![0].date).toBe('2026-01-02');
  });

  it('keys weeks the ISO way, and seeds every force the same road', () => {
    expect(weekKey('2026-10-22')).toBe('2026-W43');
    expect(weekKey('2026-01-01')).toBe('2026-W01');
    expect(weekKey('2027-01-01')).toBe('2026-W53');
    expect(weekKey('2026-10-19')).toBe(weekKey('2026-10-25'));
    expect(weekSeed('2026-W43')).toBe(weekSeed('2026-W43'));
    expect(weekSeed('2026-W43')).not.toBe(weekSeed('2026-W44'));
    const opts = { tier: SORTIE.weekly.tier, weekly: '2026-W43' };
    const a = createRun(PARTIES.line(), weekSeed('2026-W43'), 'free', 'long', opts);
    const b = createRun(PARTIES.brawl(), weekSeed('2026-W43'), 'free', 'long', opts);
    expect(a.weekly).toBe('2026-W43');
    expect([a.region, a.boss]).toEqual([b.region, b.boss]);
    expect(a.map.map((row) => row.map((x) => x.kind))).toEqual(b.map.map((row) => row.map((x) => x.kind)));
  });

  it('scores a weekly run, and keeps each force’s best on the board', () => {
    const run = Object.assign(createRun(PARTIES.line(), 1, 'free', 'long', { weekly: '2026-W43' }), { depth: 5, won: 3, bossDown: false, over: 'fell' as const });
    for (const m of run.party) m.models.forEach((x) => (x.hp = 0));
    const w = SORTIE.weekly;
    expect(weeklyScore(run)).toBe(5 * w.depth + 3 * w.won);
    const f = newForce();
    f.name = 'Red';
    let board = postWeekly(undefined, f, run, '2026-10-22');
    expect(board).toHaveLength(1);
    board = postWeekly(board, f, Object.assign({ ...run }, { depth: 2 }), '2026-10-23');
    expect(board[0].depth).toBe(5);
    const g = newForce();
    g.name = 'Blue';
    board = postWeekly(board, g, Object.assign({ ...run }, { depth: 9 }), '2026-10-23');
    expect(weekBoard(board, '2026-W43').map((e) => e.force)).toEqual(['Blue', 'Red']);
    for (let i = 44; i < 44 + w.weeks; i++) board = postWeekly(board, f, Object.assign({ ...run }, { weekly: `2026-W${i}` }), '2026-11-01');
    expect(new Set(board.map((e) => e.week)).size).toBe(w.weeks);
    expect(board.some((e) => e.week === '2026-W43')).toBe(false);
    expect(postWeekly(board, f, Object.assign({ ...run }, { weekly: undefined }), '2026-11-01')).toEqual(board);
  });
});

describe('sortie hidden nodes and veterans', () => {
  it('hides some of the middle of the map, and shows it as the party nears', () => {
    let hidden = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const run = createRun(PARTIES.line(), seed, 'free', 'long');
      const rows = run.map.length;
      expect(run.map[0].every((n) => !n.hidden)).toBe(true);
      expect(run.map[rows - 1].every((n) => !n.hidden)).toBe(true);
      expect(run.map[rows - 2].every((n) => !n.hidden)).toBe(true);
      // Whatever the party can step to next it can always see.
      while (run.screen === 'map' || run.screen === 'reward' || run.screen === 'camp' || run.screen === 'event' || run.screen === 'shop' || run.screen === 'combat') {
        if (run.screen !== 'map') break;
        expect(reachable(run).every((n) => !n.hidden)).toBe(true);
        enterNode(run, book, reachable(run)[0]);
      }
      hidden += run.map.flat().filter((n) => n.hidden).length;
    }
    expect(hidden).toBeGreaterThan(0);
  });

  it('sees further with a scout or the lantern, which shows the whole map', () => {
    const run = createRun(PARTIES.line(), 9, 'free', 'long');
    expect(sightOf(run)).toBe(SORTIE.hidden.sight);
    const plain = createRun(PARTIES.brawl(), 9, 'free', 'long');
    expect(sightOf(plain)).toBe(SORTIE.hidden.sight);
    plain.party[0].unit.rules.push('Scout');
    expect(sightOf(plain)).toBe(SORTIE.hidden.sight + 1);
    for (const n of plain.map.flat()) if (n.row > 0 && n.kind !== 'boss') n.hidden = true;
    reveal(plain);
    expect(plain.map[1].every((n) => !n.hidden)).toBe(true);
    expect(plain.map[2].some((n) => n.hidden)).toBe(true);
    Object.assign(plain, { screen: 'reward', offer: { boons: [{ id: 'lantern', tier: 'Rare' }] } });
    pickBoon(plain, 0);
    expect(plain.map.flat().some((n) => n.hidden)).toBe(false);
  });

  it('keeps a Sortie record on each unit, and gives titles for it', () => {
    const u = UNITS.hero();
    expect(veteranTitle(u)).toBeUndefined();
    u.sortieRecord = { runs: 3, lords: 0 };
    expect(veteranTitle(u)).toBe('Road-worn');
    u.sortieRecord = { runs: 10, lords: 3 };
    // One list with Training (training/titles.ts): every title is held, the latest shows unless one is picked.
    expect(veteranTitle(u)).toBe('Lordbane');
    u.title = 'roadWorn';
    expect(veteranTitle(u)).toBe('Road-worn');
    u.title = '-';
    expect(veteranTitle(u)).toBeUndefined();
    let n = 0;
    const id = () => `id${n++}`;
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    for (let i = 0; i < 3; i++) applySortie(f, Object.assign(createRun(party, i + 1), { over: 'won' as const, bossDown: true }), '2026-01-01', id, () => 0.99);
    expect(f.units.every((x) => x.sortieRecord?.runs === 3 && x.sortieRecord.lords === 3)).toBe(true);
    expect(f.sortie!.recaps![0].gained).toContain('is now known as Road-worn');
    expect(f.sortie!.recaps![0].gained).toContain('is now known as Lordbane');
    expect(f.units.every((x) => x.titles?.includes('roadWorn') && x.titles.includes('lordbane'))).toBe(true);
    const fell = createRun(party, 7);
    for (const m of fell.party) m.models.forEach((x) => (x.hp = 0));
    applySortie(f, Object.assign(fell, { over: 'fell' as const }), '2026-01-02', id, () => 0.99);
    expect(f.units.every((x) => x.status === 'removed' || x.sortieRecord?.runs === 3)).toBe(true);
  });
});

describe('sortie ascension, ambushes and the bestiary', () => {
  const top = SORTIE.tiers.length - 1;
  const ascend = (n: number, seed = 5, party = PARTIES.line()) => createRun(party, seed, 'free', 'short', { tier: top, ascension: n });

  it('only ascends at the top tier, clamped to the curses there are, and pays more for it', () => {
    expect(createRun(PARTIES.line(), 1, 'free', 'short', { tier: top - 1, ascension: 3 }).ascension).toBeUndefined();
    expect(ascend(99).ascension).toBe(SORTIE.ascension.curses.length);
    expect(ascend(0).ascension).toBeUndefined();
    const run = ascend(2);
    expect(cursesOf(run).map((x) => x.id)).toEqual(SORTIE.ascension.curses.slice(0, 2).map((x) => x.id));
    expect(tierPay(run)).toBeCloseTo(SORTIE.tiers[top].pay + 2 * SORTIE.ascension.pay);
    expect(run.journal.some((l) => l.text.startsWith('Ascension 2'))).toBe(true);
  });

  it('lays each curse on in turn', () => {
    const at = (id: string) => SORTIE.ascension.curses.findIndex((x) => x.id === id) + 1;
    expect(cursed(ascend(at('frayed') - 1), 'frayed')).toBe(false);
    const frayed = ascend(at('frayed'));
    expect(frayed.party.every((m) => m.stress === SORTIE.ascension.stress)).toBe(true);
    const swollen = ascend(at('swollen'), 7);
    const plain = ascend(0, 7);
    expect(fightBudget(swollen, book, 'fight')).toBeCloseTo(fightBudget(plain, book, 'fight') * SORTIE.ascension.fights);
    expect(fightBudget(swollen, book, 'boss')).toBeCloseTo(fightBudget(plain, book, 'boss'));
    expect(shopPrice(ascend(at('dear')), 10)).toBe(Math.round(10 * SORTIE.ascension.prices));
    expect(shopPrice(plain, 10)).toBe(10);
    const lean = ascend(at('lean'), 9);
    startCombat(lean, book, 'fight');
    lean.combat!.over = 'won';
    leaveCombat(lean);
    expect(lean.offer!.boons).toHaveLength(1);
    const dark = ascend(at('dark'), 11);
    expect(dark.map.flat().filter((n) => n.veiled).length).toBeGreaterThan(0);
  });

  it('lets an ambush put every Echo ahead of the party in the first round', () => {
    const run = createRun(PARTIES.line(), 3);
    startCombat(run, book, 'fight', undefined, true);
    const c = run.combat!;
    expect(c.ambush).toBe(true);
    const mine = new Set(c.party.map((p) => p.key));
    const firstMine = c.queue.findIndex((t) => mine.has(t.key));
    expect(firstMine).toBeGreaterThan(-1);
    expect(c.queue.slice(firstMine).some((t) => !mine.has(t.key))).toBe(false);
    expect(run.journal.some((l) => l.text.startsWith('Ambushed by'))).toBe(true);
  });

  it('keeps a scout or the lantern from being ambushed, and doubles the odds when hunted', () => {
    const run = createRun(PARTIES.line(), 3);
    const scout = run.party.some((m) => voiceKind(m.unit) === 'scout');
    expect(ambushOdds(run)).toBe(scout ? 0 : SORTIE.ambush.odds);
    run.boons.push('lantern');
    expect(ambushOdds(run)).toBe(0);
    const brawl = createRun(PARTIES.brawl(), 3);
    if (!brawl.party.some((m) => voiceKind(m.unit) === 'scout')) {
      expect(ambushOdds(brawl)).toBe(SORTIE.ambush.odds);
      const hunted = ascend(SORTIE.ascension.curses.findIndex((x) => x.id === 'hunted') + 1, 3, PARTIES.brawl());
      expect(ambushOdds(hunted)).toBe(SORTIE.ambush.odds * SORTIE.ascension.ambush);
    }
  });

  it('tallies the Echoes met and slain, and the force’s bestiary learns their lore', () => {
    const run = createRun(PARTIES.line(), 4);
    startCombat(run, book, 'fight');
    const c = run.combat!;
    const first = c.enemies.find((e) => !e.arrives)!;
    for (const m of first.models) m.hp = 0;
    c.over = 'won';
    leaveCombat(run);
    const k = first.unit.unitType;
    expect(run.met![k].met).toBe(1);
    expect(run.met![k].slain).toBeGreaterThanOrEqual(1);
    const f = newForce();
    f.units.push(...PARTIES.line());
    let n = 0;
    const summary = applySortie(f, Object.assign(run, { over: 'quit' as const }), '2026-10-22', () => `id${n++}`, () => 0.99);
    expect(f.sortie!.bestiary![k].slain).toBeGreaterThanOrEqual(1);
    expect(summary).toContain('learned the lore of');
    expect(beastInfo(k).lore.length).toBeGreaterThan(10);
    const boss = SORTIE_BOSSES[0];
    expect(beastInfo(`lord:${boss.id}`)).toMatchObject({ name: boss.name, lord: true, lore: boss.lore });
    expect(SORTIE_BOSSES.every((b) => b.lore)).toBe(true);
  });

  it('keys the lord by its id in the bestiary', () => {
    const run = createRun(PARTIES.line(), 6);
    startCombat(run, book, 'boss');
    const c = run.combat!;
    const lord = c.enemies.find((e) => e.key === c.lord)!;
    expect(beastKey(run, c, lord)).toBe(`lord:${run.boss}`);
  });

  it('unlocks the next Ascension level by winning at the highest open', () => {
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    let n = 0;
    const id = () => `id${n++}`;
    applySortie(f, Object.assign(createRun(party, 2, 'free', 'short', { tier: top }), { over: 'won' as const, bossDown: true }), '2026-10-22', id, () => 0.99);
    expect(f.sortie!.ascension).toBe(1);
    applySortie(f, Object.assign(createRun(party, 2, 'free', 'short', { tier: top }), { over: 'won' as const, bossDown: true }), '2026-10-22', id, () => 0.99);
    expect(f.sortie!.ascension).toBe(1);
    const s = applySortie(f, Object.assign(ascend(1, 2, party), { over: 'won' as const, bossDown: true }), '2026-10-22', id, () => 0.99);
    expect(f.sortie!.ascension).toBe(2);
    expect(s).toContain('unlocked Ascension 2');
    expect(f.sortie!.recaps![0].ascension).toBe(1);
  });
});

describe('sortie rematches, boon unlocks and last stands', () => {
  const won = (run: SortieRun) => Object.assign(run, { over: 'won' as const, bossDown: true });

  it('brings a lord slain before back with a trick per time, up to three', () => {
    const plain = createRun(PARTIES.line(), 6);
    expect(plain.rematch).toBeUndefined();
    const run = createRun(PARTIES.line(), 6, 'free', 'short', { slain: { [plain.boss]: 9 } });
    expect(run.rematch).toBe(SORTIE.rematch.tricks.length);
    expect(rematchTricks(run).map((t) => t.name)).toEqual(SORTIE.rematch.tricks.map((t) => t.name));
    expect(run.journal.some((l) => l.text.includes('comes back changed'))).toBe(true);
    startCombat(run, book, 'boss');
    startCombat(plain, book, 'boss');
    const lord = (r: SortieRun) => r.combat!.enemies.find((e) => e.key === r.combat!.lord)!;
    expect(lord(run).defMod).toBe(lord(plain).defMod + SORTIE.rematch.def);
    expect(lord(run).atkBonus).toBeCloseTo(lord(plain).atkBonus * SORTIE.rematch.atk);
    expect(run.combat!.log.some((l) => l.text === bossOf(run).rematch[2])).toBe(true);
    expect(SORTIE_BOSSES.every((b) => b.rematch.length === 3 && b.rematch.every(Boolean))).toBe(true);
  });

  it('starts a force with some boons and unlocks the rest by goals', () => {
    const ids = Object.keys(SORTIE_BOONS).filter((id) => !SORTIE_BOONS[id as keyof typeof SORTIE_BOONS].curse);
    // Every boon either starts open or has a goal, never both.
    for (const id of ids) expect(SORTIE.boonsAtStart.includes(id) !== !!SORTIE.unlocks[id]).toBe(true);
    const fresh = unlockedBoons(undefined);
    expect(fresh.filter((id) => !SORTIE_BOONS[id].curse).sort()).toEqual([...SORTIE.boonsAtStart].sort());
    expect(fresh.filter((id) => SORTIE_BOONS[id].curse).length).toBeGreaterThan(0);
    for (const u of Object.values(SORTIE.unlocks)) expect(goalText(u.goal, u.n).length).toBeGreaterThan(5);
    expect(unlockedBoons({ stats: { runs: 99, wins: 99, flawless: 99, deepest: 99 }, tier: 9, deep: ['a', 'b'], relics: ['a', 'b'],
      bestiary: Object.fromEntries([...Array(12)].map((_, i) => [i < 3 ? `lord:${i}` : `e${i}`, { met: 1, slain: 1 }])) }).length)
      .toBe(Object.keys(SORTIE_BOONS).length);
  });

  it('offers only unlocked boons (and curses) on a run', () => {
    const run = createRun(PARTIES.line(), 8, 'free', 'short', { boons: unlockedBoons(undefined) });
    for (let i = 0; i < 6; i++) {
      startCombat(run, book, i % 2 ? 'elite' : 'fight');
      run.combat!.over = 'won';
      leaveCombat(run);
      for (const { id } of run.offer?.boons ?? []) expect(SORTIE.boonsAtStart.includes(id) || SORTIE_BOONS[id].curse).toBe(true);
      run.offer = undefined;
      run.screen = 'map';
    }
  });

  it('counts runs and wins on the force and announces boons as they unlock', () => {
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    let n = 0;
    const id = () => `id${n++}`;
    applySortie(f, Object.assign(createRun(party, 2), { over: 'quit' as const }), '2026-10-22', id, () => 0.99);
    expect(f.sortie!.stats).toMatchObject({ runs: 1, wins: 0 });
    const run = won(createRun(party, 3));
    run.depth = 3;
    const s = applySortie(f, run, '2026-10-22', id, () => 0.99);
    expect(f.sortie!.stats).toMatchObject({ runs: 2, wins: 1, flawless: 1, deepest: 3 });
    expect(goalProgress(f.sortie, 'wins')).toBe(1);
    expect(s).toContain(SORTIE_BOONS.rally.name);
    expect(s).toContain(SORTIE_BOONS.salvo.name);
    expect(unlockedBoons(f.sortie)).toContain('salvo');
  });

  it('can make a last stand when a unit is down to its last model', () => {
    const odds = SORTIE.lastStand.odds;
    SORTIE.lastStand.odds = 1;
    try {
      let stood = 0;
      for (let seed = 1; seed < 30 && !stood; seed++) {
        const run = createRun(PARTIES.line(), seed);
        startCombat(run, book, 'elite');
        for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) {
          const c = run.combat;
          if (c.party.some((p) => lastStanding(c, p))) {
            const p = c.party.find((x) => lastStanding(c, x))!;
            expect(active(p).length === 1).toBe(true);
            expect(p.models.every((m) => !m.shaken || m.hp <= 0)).toBe(true);
            stood++;
            break;
          }
          autoStep(run, book);
        }
        if (stood) expect(run.journal.some((l) => l.text.includes('made a last stand'))).toBe(true);
      }
      expect(stood).toBeGreaterThan(0);
    } finally {
      SORTIE.lastStand.odds = odds;
    }
  });
});

describe('sortie pact marks, battle scars and lord omens', () => {
  it('pays more for marks, and takes none on the weekly', () => {
    const plain = createRun(PARTIES.line(), 5);
    const run = createRun(PARTIES.line(), 5, 'free', 'short', { marks: ['proud', 'fuse', 'silent'] });
    expect(markHeat(run)).toBe(4);
    expect(tierPay(run)).toBeCloseTo(tierPay(plain) + 4 * SORTIE.marks.pay);
    expect(xpCap(run)).toBeGreaterThanOrEqual(xpCap(plain));
    const week = createRun(PARTIES.line(), 5, 'free', 'long', { weekly: '2026-W43', marks: ['proud'] });
    expect(week.marks).toBeUndefined();
    expect(run.journal.some((l) => l.text.startsWith('Pact marks'))).toBe(true);
  });

  it('makes elites of plain fights with pride, and starts the party hurt with blood', () => {
    const count = (r: SortieRun) => r.map.flat().filter((n) => n.kind === 'elite').length;
    let more = 0;
    for (let seed = 1; seed < 20; seed++) {
      if (count(createRun(PARTIES.line(), seed, 'free', 'long', { marks: ['proud'] })) > count(createRun(PARTIES.line(), seed, 'free', 'long'))) more++;
    }
    expect(more).toBeGreaterThan(10);
    const bled = createRun(PARTIES.line(), 3, 'free', 'short', { marks: ['bleed'] });
    expect(bled.party.some((m) => m.models.some((x) => x.hp < x.max))).toBe(true);
    expect(bled.party.every((m) => m.models.every((x) => x.hp >= 1))).toBe(true);
  });

  it('gives the lord a trick with the scarred mark, and makes fiercer Echoes with fury', () => {
    const run = createRun(PARTIES.line(), 7, 'free', 'short', { marks: ['scarred', 'fierce'] });
    expect(run.rematch).toBe(1);
    expect(run.journal.some((l) => l.text.includes('Mark of the Scarred'))).toBe(true);
    const plain = createRun(PARTIES.line(), 7);
    startCombat(run, book, 'fight');
    startCombat(plain, book, 'fight');
    expect(run.combat!.enemies[0].atkBonus).toBeCloseTo(plain.combat!.enemies[0].atkBonus * SORTIE.marks.fierce);
  });

  it('makes no last stands with a short fuse', () => {
    const odds = SORTIE.lastStand.odds;
    SORTIE.lastStand.odds = 1;
    try {
      for (let seed = 1; seed < 8; seed++) {
        const run = createRun(PARTIES.line(), seed, 'free', 'short', { marks: ['fuse'] });
        expect(marked(run, 'fuse')).toBe(true);
        startCombat(run, book, 'elite');
        for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) {
          expect(run.combat.party.some((p) => lastStanding(run.combat!, p))).toBe(false);
          autoStep(run, book);
        }
      }
    } finally {
      SORTIE.lastStand.odds = odds;
    }
  });

  it('lays omens on the road, none with silence, and each one read weakens the signature, never the rematch tricks', () => {
    for (let seed = 1; seed < 10; seed++) {
      expect(createRun(PARTIES.line(), seed).map.flat().filter((n) => n.omen).length).toBeGreaterThan(SORTIE.omens.need);
      expect(createRun(PARTIES.line(), seed, 'free', 'short', { marks: ['silent'] }).map.flat().some((n) => n.omen)).toBe(false);
    }
    expect(SORTIE_BOSSES.every((b) => b.omens.length === 3 && b.omens.every(Boolean) && b.tell)).toBe(true);
    const read = (run: SortieRun, k = SORTIE.omens.need) => {
      for (const n of run.map.flat().filter((x) => x.omen).slice(0, k)) {
        n.kind = 'camp';
        n.hidden = false;
        run.screen = 'map';
        const from = run.map[n.row - 1]?.find((x) => x.next.includes(n.col));
        run.row = from ? from.row : -1;
        run.col = from ? from.col : 0;
        enterNode(run, book, n);
      }
    };
    const plain = createRun(PARTIES.line(), 4);
    const own = bossOf(plain).sig.id;
    expect(sigStrength(plain, own)).toBe(1);
    read(plain, 1);
    expect(sigStrength(plain, own)).toBeCloseTo(1 - SORTIE.omens.step);
    expect(plain.journal.some((l) => l.text.includes('you will be asked what to brace for'))).toBe(true);
    read(plain);
    expect(omensRead(plain)).toBe(SORTIE.omens.need);
    expect(sigStrength(plain, own)).toBeCloseTo(1 - SORTIE.omens.need * SORTIE.omens.step);
    // Never switched off: the signature is still the lord's.
    expect(sigsOf(plain).map((x) => x.id)).toContain(own);
    // Omens never name it.
    expect(plain.journal.filter((l) => l.text.startsWith('Omen')).some((l) => l.text.includes(bossOf(plain).sig.name))).toBe(false);
    const again = createRun(PARTIES.line(), 4, 'free', 'short', { slain: { [plain.boss]: 2 } });
    read(again);
    expect(again.rematch).toBe(2);
    expect(again.journal.some((l) => l.text.startsWith('Omen: '))).toBe(true);
    // An old save that foresaw the lord counts as every omen read, its signature still there.
    const old = createRun(PARTIES.line(), 4);
    old.foreseen = true;
    expect(omensRead(old)).toBe(SORTIE.omens.need);
    expect(sigsOf(old).map((x) => x.id)).toContain(own);
  });

  it('earns battle scars in won fights, once each, and names them in the recap', () => {
    let scarred: SortieRun | undefined;
    for (let seed = 1; seed < 60 && !scarred; seed++) {
      const run = createRun(PARTIES.line(), seed);
      startCombat(run, book, 'elite');
      for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) autoStep(run, book);
      if (run.combat?.over === 'won') leaveCombat(run);
      if (run.party.some((m) => m.scars?.length)) scarred = run;
    }
    expect(scarred).toBeDefined();
    for (const m of scarred!.party) expect(new Set(m.scars ?? []).size).toBe((m.scars ?? []).length);
    expect(scarred!.journal.some((l) => l.text.includes('for the rest of the run'))).toBe(true);
    const f = newForce();
    f.units.push(...scarred!.party.map((m) => m.unit));
    Object.assign(scarred!, { over: 'home' as const });
    let n = 0;
    expect(applySortie(f, scarred!, '2026-10-22', () => `id${n++}`, () => 0.99)).toContain('battle scars');
  });

  it('writes the best pact heat a lord was slain under in the bestiary', () => {
    const party = PARTIES.line();
    const f = newForce();
    f.units.push(...party);
    let n = 0;
    const run = Object.assign(createRun(party, 2, 'free', 'short', { marks: ['proud', 'bleed'] }), { over: 'won' as const, bossDown: true });
    applySortie(f, run, '2026-10-22', () => `id${n++}`, () => 0.99);
    expect(f.sortie!.bestiary!['lord:' + run.boss].mark).toBe(3);
  });
});

describe('sortie umbra shards', () => {
  it('costs a Shard run its fee, and caps the shard haul', () => {
    const f = newForce();
    const party = PARTIES.line();
    f.units.push(...party);
    f.umbraShards = SORTIE.cost - 1;
    expect(sortieProblem(f, undefined, party)).toMatch(/Umbra Shard/);
    const run = createRun(party, 3);
    gain(run, SORTIE.haul.boss);
    gain(run, SORTIE.haul.boss);
    gain(run, SORTIE.haul.elite);
    expect(run.haul.us).toBe(SORTIE.haul.maxUs);
    expect(SORTIE.haul.maxUs - SORTIE.cost).toBe(1);
  });
});

describe('feats', () => {
  it('pays the hardest Sortie wins once per force', () => {
    const party = PARTIES.line();
    const f = newForce();
    f.units.push(...party);
    const shards = f.umbraShards;
    let n = 0;
    const top = SORTIE.tiers.length - 1;
    const run = () => Object.assign(createRun(party, 2, 'free', 'short', { tier: top, ascension: 4 }), { over: 'won' as const, bossDown: true });
    const xp = party[0].xp;
    const text = applySortie(f, run(), '2026-10-22', () => `id${n++}`, () => 0.99);
    expect(text).toContain('Feat — Peak of the Road');
    expect(text).toContain('Feat — Ascendant');
    expect(Object.keys(f.feats!).sort()).toEqual(['sortieAsc4', 'sortieFlawless', 'sortieTop']);
    // The repeatable Glory Road and All Come Home pay too, once this week.
    expect(Object.keys(f.featRepeats!).sort()).toEqual(['sortieRepTop', 'sortieRepWhole']);
    expect(f.umbraShards - shards).toBe(3 + 3);
    expect(f.units[0].xp - xp).toBeGreaterThanOrEqual(2);
    expect(applySortie(f, run(), '2026-10-23', () => `id${n++}`, () => 0.99)).not.toContain('Feat');
  });

  it('pays training feats by waves cleared', () => {
    expect(trainingFeats(19)).toEqual([]);
    expect(trainingFeats(26)).toEqual(['train20', 'train25']);
    const f = newForce();
    const u = newUnit({ name: 'A' });
    f.units.push(u);
    const lines = awardFeats(f, trainingFeats(30), [u.id], '2026-10-22', () => 'x');
    expect(lines).toHaveLength(3);
    expect([u.xp, f.umbraShards]).toEqual([1, 3]);
    expect(f.ledger.reduce((s, l) => s + l.rp, 0)).toBe(2);
    expect(awardFeats(f, trainingFeats(30), [u.id], '2026-10-22', () => 'x')).toEqual([]);
  });
});

describe('sortie marauders out of the other armies', () => {
  const other = normalizeBook(JSON.parse(readFileSync('armies/shadow-stalkers.aof.json', 'utf8')));
  const rival = newForce();
  rival.name = 'The Iron Hand';
  rival.units.push(...PARTIES.line());

  it('builds a pool from other forces and books, never the Echoes or the force itself', () => {
    const own = newForce();
    own.units.push(...PARTIES.line());
    const pool = raiderPool([book, other], [own, rival], own);
    expect(pool.length).toBeGreaterThan(rival.units.length);
    expect(pool.some((m) => m.force === 'The Iron Hand')).toBe(true);
    expect(pool.some((m) => m.faction === other.name)).toBe(true);
    expect(pool.every((m) => m.faction !== book.name && m.force !== own.name)).toBe(true);
  });

  it('trims a band to the budget, and meets it in fights instead of the Echoes', () => {
    const pool = raiderPool([book, other], [rival]);
    const band = raidBand(pool, 200, SORTIE.squads, () => 0.5);
    expect(band.length).toBeGreaterThan(0);
    expect(band.length).toBeLessThanOrEqual(SORTIE.squads);
    const run = createRun(PARTIES.line(), 3, 'free', 'short', { raiders: pool });
    expect(run.raiders!.length).toBeGreaterThan(0);
    startCombat(run, book, 'fight', undefined, false, true);
    expect(run.combat!.enemies.every((e) => e.raider)).toBe(true);
    expect(run.combat!.log.some((l) => l.text.startsWith('Marauders:'))).toBe(true);
    for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) autoStep(run, book);
    expect(run.combat!.over).toBeDefined();
    const boss = createRun(PARTIES.line(), 3, 'free', 'short', { raiders: pool });
    startCombat(boss, book, 'boss', undefined, false, true);
    expect(boss.combat!.enemies.some((e) => e.raider)).toBe(false);
  });

  it('keeps the weekly free of them, and runs without a pool as before', () => {
    const pool = raiderPool([book, other], [rival]);
    expect(createRun(PARTIES.line(), 3, 'free', 'long', { weekly: '2026-W43', raiders: pool }).raiders).toBeUndefined();
    expect(createRun(PARTIES.line(), 3).raiders).toBeUndefined();
  });
});
