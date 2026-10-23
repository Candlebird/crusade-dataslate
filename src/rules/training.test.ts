import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeBook } from '../armyforge/book';
import { raiderPool } from './raiders';
import type { Unit, Weapon } from '../model/types';
import type { Effect } from './abilities';
import { newUnit } from '../model/factory';
import { TRAINING, TRAINING_ENEMIES, type TrainingEnemyKind } from './downtimeData';
import {
  BASE, CARDS, habitNames, habitsOf, towerOf, autoCardIndex, autoPlace, autoSpend, buyHeal, buyUpgrade, cardText, coverCrossed, createRun, healCost, mvp, pickCard, startProblem, levelDmg, liftTower, placeTower, placed, raiderDef, reach, planWave, previewWave, squadPower, startWave, step, upgradeCost, waveCredits, type TrainingRun, type TrainingTower,
} from './training';

// Training sim (tower defense).

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });

function squad(): Unit[] {
  return [
    newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
    newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
    newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', size: 1, tough: 6, quality: 4, defense: 2, points: 210, rules: ['Tough(6)', 'Impact(3)'], weapons: [gun('Cannon', 30, 1, 1, ['AP(2)', 'Blast(3)', 'Deadly(3)']), gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
    newUnit({ id: 'elite', name: 'Veterans', category: 'Elite', size: 5, quality: 3, defense: 4, points: 150, weapons: [gun('Plasma', 18, 1, 5, ['AP(2)'])] }),
    newUnit({ id: 'bunker', name: 'Bunker', category: 'Fortification', size: 1, tough: 6, quality: 4, defense: 2, points: 90, weapons: [gun('Twin MG', 24, 4, 1)] }),
  ];
}

/** Stand the squad in a line two tiles out across the favoured side, with one unit just behind the base. */
function placeAll(run: TrainingRun) {
  const a = (run.dir * 45 * Math.PI) / 180;
  const [fx, fy] = [Math.sin(a), -Math.cos(a)];
  const spot = (out: number, side: number) => [Math.round(BASE.tile + fx * out - fy * side * 1.2), Math.round(BASE.tile + fy * out + fx * side * 1.2)];
  const spots = [spot(2, 0), spot(2, 1), spot(2, -1), spot(2, 2), spot(2, -2), spot(-1, 0), spot(1, 1), spot(1, -1)];
  const movers = run.towers.filter((t) => !t.dead && !(t.category === 'Fortification' && t.x >= 0 && t.placedAt < run.wave));
  movers.forEach((t) => liftTower(run, t.unitId));
  let i = 0;
  for (const t of movers) {
    while (run.towers.some((o) => o !== t && placed(o) && o.x === spots[i][0] && o.y === spots[i][1])) i++;
    placeTower(run, t.unitId, spots[i][0], spots[i++][1]);
  }
}

/** Auto-play without buying anything. */
function holdOut(units: Unit[], seed: number) {
  const run = createRun(units, seed);
  const power = squadPower(units);
  while (run.phase !== 'over' && run.wave < 40) {
    if (run.offer) pickCard(run, autoCardIndex(run));
    placeAll(run);
    startWave(run, power);
    while (run.phase === 'wave') step(run, 0.05);
  }
  return run;
}

/** Auto-play: heal a unit below 40% wounds when there's credit for it, else level units up in turn as soon as it's affordable. */
function play(units: Unit[], seed: number, maxWaves = 40) {
  const run = createRun(units, seed);
  const power = squadPower(units);
  let i = 0;
  while (run.phase !== 'over' && run.wave < maxWaves) {
    if (run.offer) pickCard(run, autoCardIndex(run));
    placeAll(run);
    startWave(run, power);
    while (run.phase === 'wave') {
      step(run, 0.05);
      const live = run.towers.filter((t) => t.x >= 0 && !t.dead);
      if (run.phase !== 'wave' || !live.length) continue;
      const low = live.find((t) => t.hp < t.maxHp * 0.4);
      if (low && Math.floor(run.credits) >= healCost(run, low.unitId)) buyHeal(run, low.unitId);
      else if (Math.floor(run.credits) >= upgradeCost(live[i % live.length].up)) buyUpgrade(run, live[i++ % live.length].unitId);
    }
  }
  return run;
}

/** One unit alone on the map, mid-wave, with a stunned dummy in the far corner so the wave doesn't end. */
function lone(u: Unit, effects: Effect[] = []) {
  const run = createRun([u], 11);
  const t = run.towers[0];
  t.skills.push(...effects.map((effect) => ({ source: 'Test', effect, cd: 0, uses: 0 })));
  placeTower(run, t.unitId, BASE.tile + 1, BASE.tile);
  startWave(run, 1);
  run.queue = [];
  run.enemies = [];
  foe(run, 0.5, 0.5, 1e6, { stun: 1e6 });
  return { run, t };
}

/** Drop an enemy onto the map. */
function foe(run: TrainingRun, x: number, y: number, hp: number, status: TrainingRun['enemies'][number]['status'] = {}, kind: TrainingEnemyKind = 'swarm') {
  const e = { id: run.nextId++, kind, x, y, hp, maxHp: hp, cd: 0, gcd: 99, credits: 0, status };
  run.enemies.push(e);
  return e;
}

const trooper = (rules: string[] = []) =>
  newUnit({ id: 'u', name: 'Troopers', category: 'Infantry', size: 5, quality: 3, defense: 6, points: 80, rules, weapons: [gun('Rifles', 24, 1, 5)] });
const steps = (run: TrainingRun, n: number, until: () => boolean = () => false) => { for (let i = 0; i < n && !until(); i++) step(run, 0.05); };
const near = (t: TrainingTower) => [t.x + 0.5, t.y + 1.2] as const;

describe('training', () => {
  it('lays out the same cover from the same seed, clear of the base and the edge', () => {
    const a = createRun(squad(), 21).cover;
    expect(a.length).toBeGreaterThan(0);
    expect(createRun(squad(), 21).cover).toEqual(a);
    for (const c of a) {
      expect(c.x === BASE.tile && c.y === BASE.tile).toBe(false);
      expect(Math.min(c.x, c.y)).toBeGreaterThanOrEqual(1);
      expect(Math.max(c.x, c.y)).toBeLessThanOrEqual(TRAINING.mapSize - 2);
    }
  });

  it('counts the cover a shot passes over, bar the tile it comes from', () => {
    const run = createRun(squad(), 1);
    run.cover = [{ x: 5, y: 8 }];
    expect(coverCrossed(run, 3.5, 8.5, 7.5, 8.5)).toEqual([{ x: 5, y: 8 }]);
    expect(coverCrossed(run, 5.5, 8.5, 9.5, 8.5)).toEqual([]);
    expect(coverCrossed(run, 3.5, 6.5, 7.5, 6.5)).toEqual([]);
  });

  it('puts shots over cover at -2 to hit, and leaves melee alone', () => {
    // Damage a stunned dummy takes over a while, with and without cover in the way: the same dice either way.
    const dealt = (u: Unit, dx: number, cover: number[]) => {
      const { run, t } = lone(u);
      run.cover = cover.map((x) => ({ x: t.x + x, y: t.y }));
      const e = foe(run, t.x + 0.5 + dx, t.y + 0.5, 1e6, { stun: 1e6 });
      steps(run, 2000);
      return e.maxHp - e.hp;
    };
    const rifles = trooper();
    // Quality 3 hits on 3+ (4/6); over cover on 5+ (2/6).
    const ratio = dealt(rifles, 4, [2]) / dealt(rifles, 4, []);
    expect(ratio).toBeGreaterThan(0.35);
    expect(ratio).toBeLessThan(0.65);
    const brawler = newUnit({ id: 'u', name: 'Brawlers', category: 'Infantry', size: 5, quality: 3, defense: 6, points: 80, weapons: [gun('CCW', 0, 2, 5)] });
    expect(dealt(brawler, 1, [])).toBeGreaterThan(0);
    expect(dealt(brawler, 1, [1])).toBe(dealt(brawler, 1, []));
  });

  it('is the same run from the same seed', () => {
    const a = play(squad(), 7);
    const b = play(squad(), 7);
    expect(a.cleared).toBe(b.cleared);
    expect(a.credits).toBe(b.credits);
  });

  it('sends Scouts and Ambushers in from the far side', () => {
    const run = createRun(squad(), 3);
    run.dir = 0; // from the north: y small
    for (let w = 3; w < 9; w++) {
      for (const s of planWave(run, 3000, w)) {
        const spawn = TRAINING_ENEMIES[s.kind].spawn;
        if (spawn === 'scout' || spawn === 'ambush') expect(s.y).toBeGreaterThan(BASE.y);
      }
    }
    const main = planWave(run, 3000, 6).filter((s) => TRAINING_ENEMIES[s.kind].spawn === 'main');
    const north = main.filter((s) => s.y < BASE.y).length / main.length;
    expect(north).toBeGreaterThan(0.6);
    expect(north).toBeLessThan(1);
  });

  it('drops about upgradesPerWave level-ups a wave', () => {
    for (const w of [1, 4, 9]) {
      const n = (TRAINING.upgradesPerWave * (w - 1)) / 4;
      expect(waveCredits(w, 4)).toBeCloseTo(TRAINING.upgradesPerWave * TRAINING.upgradeBase * TRAINING.upgradeGrowth ** n);
    }
    expect(upgradeCost(1)).toBeGreaterThan(upgradeCost(0));
    const run = createRun(squad(), 1);
    const plan = planWave(run, squadPower(squad()), 4);
    expect(plan.reduce((n, s) => n + s.credits, 0)).toBeCloseTo(waveCredits(4, run.towers.length));
  });

  it('levels a unit up in everything at once, and sells heals', () => {
    const run = createRun(squad(), 1);
    const t = run.towers.find((u) => u.unitId === 'inf')!;
    run.credits = 1000;
    const hp = t.maxHp;
    buyUpgrade(run, t.unitId);
    expect(t.up).toBe(1);
    expect(t.maxHp).toBe(hp + t.size * TRAINING.toughMul);
    expect(run.credits).toBe(1000 - upgradeCost(0));
    expect(() => buyHeal(run, t.unitId)).toThrow(/all its wounds/);
    t.hp = 1;
    const cost = healCost(run, t.unitId);
    buyHeal(run, t.unitId);
    expect(t.hp).toBeCloseTo(1 + t.maxHp * TRAINING.heal.share);
    expect(run.credits).toBe(1000 - upgradeCost(0) - cost);
  });

  it("prices every unit's level-ups on its own, and gives melee weapons damage instead of reach", () => {
    const run = createRun(squad(), 1);
    const hero = run.towers.find((u) => u.unitId === 'hero')!;
    const inf = run.towers.find((u) => u.unitId === 'inf')!;
    run.credits = 1000;
    buyUpgrade(run, hero.unitId);
    buyUpgrade(run, hero.unitId);
    expect(run.credits).toBe(1000 - upgradeCost(0) - upgradeCost(1));
    buyUpgrade(run, inf.unitId);
    expect(run.credits).toBe(1000 - upgradeCost(0) - upgradeCost(1) - upgradeCost(0));
    const pistol = hero.guns.find((g) => !g.melee)!;
    const sword = hero.guns.find((g) => g.melee)!;
    expect(reach(hero, sword)).toBe(TRAINING.meleeReach);
    expect(reach(hero, pistol)).toBeCloseTo(12 / TRAINING.inchesPerTile + 2);
    expect(levelDmg(hero, sword)).toBe(2 * TRAINING.meleeDmgPerLevel);
    expect(levelDmg(hero, pistol)).toBe(2);
  });

  it('Mirrorshells shrug off shots but take more from blows', () => {
    // The same dice against a Drone and a Mirrorshell: what each loses, stunned in reach.
    const lost = (kind: TrainingEnemyKind, weapon: Weapon, at: readonly [number, number]) => {
      const { run } = lone(newUnit({ id: 'u', name: 'Troopers', category: 'Infantry', size: 5, quality: 3, defense: 6, points: 80, weapons: [weapon] }));
      const e = foe(run, at[0], at[1], 1000, { stun: 1e6 }, kind);
      steps(run, 100);
      return 1000 - e.hp;
    };
    const shot = gun('Rifles', 24, 1, 5);
    const blade = gun('CCW', 0, 2, 5);
    const far = [BASE.tile + 1.5, BASE.tile + 4.5] as const;
    const close = [BASE.tile + 1.5, BASE.tile + 1.4] as const;
    expect(lost('drone', shot, far)).toBeGreaterThan(0);
    expect(lost('mirror', shot, far)).toBeCloseTo(lost('drone', shot, far) * TRAINING_ENEMIES.mirror.shotMul!);
    expect(lost('mirror', blade, close)).toBeCloseTo(lost('drone', blade, close) * TRAINING_ENEMIES.mirror.meleeMul!);
  });

  it('makes previewWave match the wave that starts', () => {
    const run = createRun(squad(), 9);
    placeAll(run);
    const preview = previewWave(run, 650);
    startWave(run, 650);
    expect(run.queue).toEqual(preview);
  });

  it('sends a big squad more enemies, some of them veterans', () => {
    const run = createRun(squad(), 5);
    const count = (power: number) => planWave(run, power, 6).length;
    const vets = (power: number) => planWave(run, power, 6).filter((s) => s.vet).length;
    // A few veterans turn up in any squad, at random.
    const small = Array.from({ length: 20 }, (_, i) => planWave(createRun(squad(), i), squadPower(squad()), 6));
    const share = small.flat().filter((s) => s.vet).length / small.flat().length;
    expect(share).toBeGreaterThan(TRAINING.vetBase / 2);
    expect(share).toBeLessThan(TRAINING.vetBase * 2);
    expect(vets(1500)).toBeGreaterThan(vets(squadPower(squad())));
    expect(count(3000)).toBeGreaterThan(count(1000) * 1.8);
    const plan = planWave(run, 3000, 6);
    expect(plan.filter((s) => s.vet).length / plan.length).toBeGreaterThan(0.5);
    expect(vets(1500)).toBeGreaterThan(0);
  });

  it('caps XP at 3 a run and keeps what a fallen unit earned', () => {
    // A run long enough to reach the cap.
    let run = play(squad(), 0);
    for (let seed = 1; seed < 50 && run.cleared < TRAINING.xpEvery * TRAINING.xpCap; seed++) run = play(squad(), seed);
    expect(run.phase).toBe('over');
    for (const t of run.towers) expect(t.xp).toBeLessThanOrEqual(TRAINING.xpCap);
    expect(run.towers.some((t) => t.xp === TRAINING.xpCap)).toBe(true);
  });

  it('keeps Fortifications where they stand once a wave has started', () => {
    const run = createRun(squad(), 2);
    placeTower(run, 'bunker', 5, 5);
    placeTower(run, 'bunker', 6, 5); // still free to move
    expect(() => placeTower(run, 'inf', BASE.tile, BASE.tile)).toThrow(/base/);
    expect(() => placeTower(run, 'inf', 0, 4)).toThrow(/outer ring/);
    startWave(run, 500);
    expect(() => placeTower(run, 'inf', 4, 4)).toThrow(/between waves/);
    run.phase = 'setup';
    expect(() => placeTower(run, 'bunker', 7, 5)).toThrow(/Fortifications/);
    expect(() => liftTower(run, 'bunker')).toThrow(/Fortifications/);
  });

  it('ends when the base falls', () => {
    const run = createRun(squad(), 5);
    placeTower(run, 'hero', 1, 1);
    startWave(run, 50000);
    for (let i = 0; i < 20000 && run.phase === 'wave'; i++) step(run, 0.05);
    expect(run.phase).toBe('over');
    expect(run.baseHp === 0 || run.towers.every((t) => t.dead || t.x < 0)).toBe(true);
    expect(run.log[run.log.length - 1]).toMatch(/falls/);
  });

  it('soaks wounds with a shield before they reach the unit', () => {
    const { run, t } = lone(trooper(), [{ kind: 'shield', n: 2, every: 2 }]);
    step(run, 0.05);
    expect(t.shield).toBe(2 * TRAINING.toughMul);
    foe(run, ...near(t), 1e6);
    steps(run, 400, () => t.shield < 2 * TRAINING.toughMul);
    expect(t.shield).toBeLessThan(2 * TRAINING.toughMul);
    expect(t.hp).toBe(t.maxHp);
  });

  it('heals only when hurt, then waits its turn', () => {
    const { run, t } = lone(trooper(), [{ kind: 'heal', n: 1, every: 2 }]);
    step(run, 0.05);
    expect(t.skills[0].cd).toBeLessThanOrEqual(0);
    t.hp = t.maxHp - 20;
    step(run, 0.05);
    expect(t.hp).toBe(t.maxHp - 20 + TRAINING.toughMul);
    expect(t.skills[0].cd).toBeCloseTo(2 * TRAINING.abilityRound);
    expect(run.fx.some((f) => f.kind === 'heal')).toBe(true);
  });

  it('lets a Fast unit redeploy mid-wave twice a wave, a Scout once', () => {
    const { run, t } = lone(trooper(['Fast']));
    placeTower(run, t.unitId, BASE.tile - 2, BASE.tile);
    expect(t.x).toBe(BASE.tile - 2);
    placeTower(run, t.unitId, BASE.tile + 2, BASE.tile);
    expect(() => placeTower(run, t.unitId, BASE.tile + 3, BASE.tile)).toThrow(/No redeploys/);
    const scout = lone(trooper(['Scout']));
    placeTower(scout.run, scout.t.unitId, BASE.tile - 2, BASE.tile);
    expect(() => placeTower(scout.run, scout.t.unitId, BASE.tile + 2, BASE.tile)).toThrow(/No redeploys/);
    expect(() => liftTower(run, t.unitId)).toThrow();
  });

  it('leaves a status on a hit', () => {
    const { run, t } = lone(trooper(), [{ kind: 'onHit', status: 'stun', chance: 1 }]);
    const e = foe(run, ...near(t), 1e6);
    steps(run, 400, () => !!e.status.stun);
    expect(e.status.stun).toBeGreaterThan(0);
  });

  it('heals on a kill with leech', () => {
    const { run, t } = lone(trooper(), [{ kind: 'leech', n: 1 }]);
    t.hp = t.maxHp - 20;
    const e = foe(run, ...near(t), 0.5, { stun: 1e6 });
    steps(run, 400, () => e.hp <= 0);
    expect(e.hp).toBeLessThanOrEqual(0);
    expect(t.hp).toBe(t.maxHp - 20 + TRAINING.toughMul);
  });

  it('offers cards every few waves, the same for the same seed, and waits for a pick', () => {
    const offered = (seed: number) => {
      const run = createRun(squad(), seed);
      while (run.phase !== 'over' && !run.offer) {
        placeAll(run);
        startWave(run, 300);
        while (run.phase === 'wave') step(run, 0.05);
      }
      return run;
    };
    const run = offered(3);
    expect(run.wave).toBe(TRAINING.cards.every);
    expect(run.offer).toHaveLength(TRAINING.cards.offer);
    expect(new Set(run.offer!.map((d) => d.id)).size).toBe(TRAINING.cards.offer);
    expect(offered(3).offer).toEqual(run.offer);
    expect(startProblem(run)).toMatch(/card/);
    const d = run.offer![1];
    pickCard(run, 1);
    expect(run.offer).toBeUndefined();
    expect(run.cards).toEqual([d]);
    expect(run.log[run.log.length - 1]).toContain(cardText(run, d).name);
    expect(startProblem(run)).toBeNull();
  });

  it('plays every card without a hitch', () => {
    for (const c of CARDS) {
      const run = createRun(squad(), 4);
      placeAll(run);
      if (c.id === 'reinforce') run.towers[0].dead = true;
      const t = run.towers.find((u) => (c.unit ? c.unit(u) : true))!;
      run.offer = [{ id: c.id, rarity: c.rarity, ...(c.unit ? { unitId: t.unitId } : {}) }];
      pickCard(run, 0);
      expect(cardText(run, run.cards[0]).text).not.toContain('{unit}');
    }
    const run = createRun(squad(), 4);
    const t = run.towers[1];
    const before = { up: t.up, maxHp: t.maxHp };
    run.offer = [{ id: 'promote', rarity: 'Rare', unitId: t.unitId }, { id: 'walls', rarity: 'Common' }, { id: 'heroes', rarity: 'Legendary' }];
    expect(autoCardIndex(run)).toBe(2);
    pickCard(run, 0);
    expect(t.up).toBe(before.up + 1);
    expect(t.maxHp).toBeGreaterThan(before.maxHp);
  });

  it('auto mode places, spends and picks its way through a run, keeping score', () => {
    const run = createRun(squad(), 21);
    const power = squadPower(squad());
    while (run.phase !== 'over' && run.wave < 40) {
      if (run.offer) pickCard(run, autoCardIndex(run));
      autoPlace(run);
      expect(run.towers.filter((t) => !t.dead).every(placed)).toBe(true);
      startWave(run, power);
      while (run.phase === 'wave') { step(run, 0.05); autoSpend(run); }
    }
    expect(run.cleared).toBeGreaterThan(2);
    expect(run.cards.length).toBeGreaterThan(0);
    const best = mvp(run)!;
    expect(best.kills).toBe(Math.max(...run.towers.map((t) => t.kills)));
    expect(run.towers.reduce((n, t) => n + t.dealt, 0)).toBeGreaterThan(0);
    expect(run.towers.reduce((n, t) => n + t.taken, 0)).toBeGreaterThan(0);
    expect(run.towers.reduce((n, t) => n + t.saved, 0)).toBeGreaterThan(0);
  });

  it('balance: a typical squad falls around wave 4 without upgrades and reaches about wave 14 with them', () => {
    const bare = Array.from({ length: 20 }, (_, i) => holdOut(squad(), 100 + i).cleared).sort((a, b) => a - b);
    const results = Array.from({ length: 20 }, (_, i) => play(squad(), 100 + i).cleared).sort((a, b) => a - b);
    if (process.env.TRAINING_BALANCE) console.log('waves cleared, no upgrades', bare.join(' '), '/ with upgrades', results.join(' '));
    expect(bare[10]).toBeGreaterThanOrEqual(2);
    expect(bare[10]).toBeLessThanOrEqual(4);
    expect(results[2]).toBeGreaterThanOrEqual(3);
    const median = results[10];
    expect(median).toBeGreaterThanOrEqual(9);
    expect(median).toBeLessThanOrEqual(15);
  });
});

describe('training marauders out of the other armies', () => {
  const other = normalizeBook(JSON.parse(readFileSync('armies/shadow-stalkers.aof.json', 'utf8')));
  const pool = raiderPool([other], []);

  it('makes every raider a sane enemy profile', () => {
    for (const m of pool) {
      const d = raiderDef(m);
      expect(d.hp).toBeGreaterThanOrEqual(5);
      expect(d.cost).toBeGreaterThanOrEqual(1);
      expect(d.cost).toBeLessThanOrEqual(8);
      expect(d.attacks).toBeGreaterThanOrEqual(1);
      expect(d.desc).toContain(other.name);
    }
  });

  it('sends some waves of marauders, which fight to the end, and none without a pool', () => {
    expect(createRun(squad(), 3).raiders).toBeUndefined();
    let raided = 0;
    for (let seed = 1; seed < 12; seed++) {
      const run = createRun(squad(), seed, pool);
      expect(run.raiders!.length).toBeGreaterThan(0);
      for (let w = 3; w < 12; w++) if (planWave({ ...run }, squadPower(squad()), w).some((s) => s.mk !== undefined)) raided++;
    }
    expect(raided).toBeGreaterThan(5);
    const run = createRun(squad(), 5, pool);
    placeAll(run);
    for (let w = 0; w < 6 && run.phase !== 'over'; w++) {
      startWave(run, squadPower(squad()));
      for (let i = 0; i < 4000 && run.phase === 'wave'; i++) step(run, 0.1);
      expect(run.enemies.every((e) => Number.isFinite(e.hp))).toBe(true);
    }
  });
});

describe('Sortie habits in Training', () => {
  it('quirks and a trinket shape the tower; morale ones do nothing', () => {
    const base = squad()[0];
    const plain = towerOf(base);
    const vet = towerOf({ ...base, quirks: ['eagle', 'hardy', 'steady', 'quick'], trinket: 'plate' });
    expect(vet.hitShoot).toBe(plain.hitShoot + 1);
    expect(vet.hitMelee).toBe(plain.hitMelee);
    expect(vet.defMod).toBe(plain.defMod + 1);
    expect(vet.maxHp).toBeGreaterThan(plain.maxHp);
    // Quick +1, the plate -1.
    expect(vet.init).toBe(0);
    expect(habitNames({ ...base, quirks: ['eagle', 'steady', 'native:x'], trinket: 'plate' })).toEqual(['Eagle-eyed', 'Salvaged Plate']);
  });

  it('a frail unit never drops below one wound a model', () => {
    const u = { ...squad()[0], tough: 1, quirks: ['frail'], trinket: 'totem' };
    expect(habitsOf(u).wounds).toBe(-4);
    expect(towerOf(u).maxHp).toBeGreaterThanOrEqual(u.size * TRAINING.toughMul);
  });

  it('jumpy and short-sighted carry over as flags', () => {
    const t = towerOf({ ...squad()[1], quirks: ['jumpy', 'myopic'] });
    expect(t.jumpy).toBe(true);
    expect(t.myopic).toBe(true);
  });
});
