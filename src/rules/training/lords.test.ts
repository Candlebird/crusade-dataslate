import { describe, expect, it } from 'vitest';
import { trainingFeats } from '../feats';
import { beastInfo } from '../sortie';
import { TRAINING } from '../downtimeData';
import { bankBeasts } from './bestiary';
import { hurt } from './harm';
import { campaignLords, guardianTrick, lordIndex, lordsSlain, lordWaves, nextLord, trickText } from './lordPick';
import { lordDmg, lordHit, lordPlan, lordTick } from './lords';
import { nexusOf } from './nexus';
import { campaign, guardian } from './nexusTest';
import { blankRun, testEnemy, testUnit } from './testRun';
import type { LordTrick, RunLord, RunNexus, TowerGun, TrainingRun } from './types';
import { planWave } from './waves';

// The campaign's real Echo Lords: who comes, on which wave, their tricks in the maze, and the bestiary.

const T = TRAINING.nexus.tricks;
const L = TRAINING.nexus.lords;

const lord = (trick: LordTrick, o: Partial<RunLord> = {}): RunLord => ({ key: 'nexus:g:Vor', name: 'Vor', tier: 'Rare', trick, from: 'guardian', ...o });

/** A wave run with real lord `l` on the field, a unit next to it. */
function field(l: RunLord): TrainingRun {
  const run = blankRun();
  run.phase = 'wave';
  run.wave = 5;
  run.nexus = { threat: 1, affixes: [], lords: [l] } satisfies RunNexus;
  run.pieces.push(testUnit());
  run.enemies.push(testEnemy({ kind: 'lord', lord: { i: 0, next: 0, ward: 0, burst: 0 } }));
  return run;
}

describe('real Echo Lords', () => {
  it('are the guardians in tier order, then the crisis lord, at most lords.max', () => {
    const c = campaign(2, [guardian('Leg', 'Legendary'), guardian('Com', 'Common'), guardian('Rar', 'Rare')], {
      crisis: { round: 2, lord: 'stormHerald', sectorId: 's0' },
    });
    const ls = campaignLords(c, { rng: 1 });
    expect(ls.map((l) => l.name)).toEqual(['Com', 'Rar', 'Leg', 'The Storm Herald']);
    expect(ls[3]).toMatchObject({ key: 'nexus:stormHerald', tier: 'Legendary', trick: 'storm', from: 'crisis' });
    const many = campaign(2, Array.from({ length: 9 }, (_, i) => guardian(`G${i}`, 'Common')));
    expect(campaignLords(many, { rng: 1 })).toHaveLength(L.max);
    expect(campaignLords(campaign(2, [], { crisis: { round: 1, lord: 'rift', sectorId: 's', result: 'won' } }), { rng: 1 })).toEqual([]);
  });

  it("take a guardian's trick from its rules, else one by its name", () => {
    expect(guardianTrick(guardian('A', 'Rare', ['Regeneration']))).toBe('regen');
    expect(guardianTrick(guardian('A', 'Rare', ['Tough(6)', 'Ambush']))).toBe('teleport');
    expect(T.plain).toContain(guardianTrick(guardian('Nameless', 'Rare')));
    for (const k of Object.keys(T.byLord)) expect(trickText(T.byLord[k] as LordTrick)).not.toBe('');
  });

  it('lead the boss waves from lords.from, skipping the nemesis wave and the Final', () => {
    const nx = nexusOf(campaign(2, Array.from({ length: 5 }, (_, i) => guardian(`G${i}`, 'Common'))))!;
    expect(lordWaves(nx, false)).toEqual([5, 10, 15, 20, 30]);
    expect(lordWaves(nx, true)).toEqual([5, 10, 15, 20, 30]);
    expect(lordWaves(nx, false, 30)).toEqual([5, 10, 15, 20, 25]);
    expect(lordWaves(nx, true, 30)).toEqual([5, 10, 15, 20, 35]);
    const run = blankRun();
    run.nexus = nx;
    expect(lordIndex(run, 10)).toBe(1);
    expect(lordIndex(run, 35)).toBeUndefined();
    expect(nextLord(run, 12)).toMatchObject({ wave: 15, lord: nx.lords[2] });
  });

  it('take the boss plan, tougher by tier', () => {
    const run = blankRun(3);
    run.nexus = { threat: 0, affixes: [], lords: [lord('summon', { tier: 'Legendary' })] };
    run.wave = 5;
    const plain = planWave(blankRun(3), 5).find((s) => s.kind === 'lord')!;
    const boss = lordPlan(run, planWave(run, 5)).find((s) => s.kind === 'lord')!;
    expect(boss.lord).toBe(0);
    expect(boss.hp).toBeCloseTo(plain.hp * L.hp.Legendary);
    run.wave = 10;
    expect(lordPlan(run, planWave(run, 10)).some((s) => s.lord !== undefined)).toBe(false);
  });

  it('Ward soaks damage first; Umbral Hide halves shots from afar; Mirror Veil puts shots at -1', () => {
    const run = field(lord('shield'));
    const e = run.enemies[0];
    lordTick(run, 0.05);
    expect(e.lord!.ward).toBeCloseTo(e.maxHp * T.shield.share);
    hurt(run, undefined, e, 10, 'other');
    expect(e.hp).toBe(100);
    const hide = field(lord('armour'));
    const far = testUnit({ x: 0, y: 0 });
    expect(lordDmg(hide, far, hide.enemies[0], 10, 'shot')).toBeCloseTo(10 * T.armour.mul);
    expect(lordDmg(hide, far, hide.enemies[0], 10, 'melee')).toBe(10);
    const veil = field(lord('stealth'));
    expect(lordHit(veil, { melee: false } as TowerGun, veil.enemies[0])).toBe(-1);
    expect(lordHit(veil, { melee: true } as TowerGun, veil.enemies[0])).toBe(0);
  });

  it('Blink, Spawn, Surge, Regrowth, Dread and Storm work in the maze', () => {
    const tick = (k: LordTrick, secs: number) => {
      const run = field(lord(k));
      for (let t = 0; t < secs; t += 0.05) lordTick(run, 0.05);
      return run;
    };
    const blink = tick('teleport', T.teleport.every + 0.1);
    expect(blink.enemies[0].x !== 21.5 || blink.enemies[0].y !== 31.5).toBe(true);
    expect(tick('summon', T.summon.every + 0.1).enemies.filter((e) => e.kind === 'swarm')).toHaveLength(T.summon.n);
    expect(tick('burst', T.burst.every + 0.1).enemies[0].lord!.burst).toBeGreaterThan(0);
    const regen = field(lord('regen'));
    regen.enemies[0].hp = 50;
    for (let t = 0; t < T.regen.every + 0.1; t += 0.05) lordTick(regen, 0.05);
    expect(regen.enemies[0].hp).toBeCloseTo(50 + 100 * T.regen.share);
    const dread = field(lord('fear'));
    lordTick(dread, 0.05);
    expect(dread.pieces[0].kind === 'unit' && dread.pieces[0].boost.hit).toBe(-1);
    const storm = tick('storm', T.storm.every + 0.1);
    const u = storm.pieces[0];
    expect(u.kind === 'unit' && u.guns[0].cd).toBeGreaterThan(1);
  });

  it('slain, go in the bestiary as slain (not drill), and earn the Lordfall feat', () => {
    const run = field(lord('regen', { key: 'nexus:devourer', name: 'The Devourer', from: 'crisis' }));
    hurt(run, run.pieces[0] as never, run.enemies[0], 999, 'shot');
    expect(run.nexus!.lords[0].slain).toBe(true);
    expect(lordsSlain(run)).toBe(1);
    const story = {};
    const lines = bankBeasts(story, run);
    expect((story as { bestiary: Record<string, unknown> }).bestiary['nexus:devourer']).toMatchObject({ slain: 1 });
    expect(lines.join(' ')).toMatch(/The Devourer/);
    expect(beastInfo('nexus:devourer')).toMatchObject({ name: 'The Devourer', lord: true });
    expect(beastInfo('nexus:g:Vor')).toMatchObject({ name: 'Vor', lord: true });
    expect(trainingFeats(3, 1)).toEqual(['trainLord']);
    expect(trainingFeats(3)).toEqual([]);
  });
});
