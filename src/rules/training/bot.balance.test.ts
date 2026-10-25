import { beforeAll, describe, expect, it } from 'vitest';
import { FORCES, SEEDS } from './testForces';
import { LEGS } from './map';
import type { BotOut } from './botJobs';
import { runBots } from './botPool';
import { flies, mean, median, type Probe } from './probe';

// Balance (bot): the sample forces fresh on the test maze, probed. The spec's targets, with 3 waves of slack: a fresh
// force reaches wave 20-25 (17-28 passes), the bot leaks now and then in waves 8-15, and no flying wave (nor any one
// wave in 15-25) is a wall. The pad each boss dies on is only printed: bossHp (TRAINING.wave) is tuned by hand.
// The runs are played once, on botPool's threads, and shared by every check here.

const cases = FORCES.flatMap((f) => SEEDS.map((seed) => ({ f, seed })));
let outs: BotOut[] = [];
let runs: Probe[] = [];

beforeAll(async () => {
  outs = await runBots(cases.map(({ f, seed }) => ({ units: f.units, seed, maxWaves: 60, probe: true })));
  runs = outs.map((o) => o.probe!);
  const surv = Array.from({ length: 16 }, (_, i) => `${i + 12}:${runs.filter((p) => p.cleared >= i + 12).length}`);
  console.log(`cleared ${runs.map((p) => p.cleared).join(' ')}\nsurvivors ${surv.join(' ')}`);
}, 300_000);

describe('training balance (bot)', () => {
  it('takes a fresh force to about wave 20-25 (17-28 with slack)', () => {
    const m = mean(runs.map((p) => p.cleared));
    expect(m).toBeGreaterThanOrEqual(17);
    expect(m).toBeLessThanOrEqual(28);
  });

  it('prints the pad each boss dies on in waves 5-25 (bossHp is hand-tuned; no target)', () => {
    const pads = runs.flatMap((p) => p.bosses.filter((b) => b.wave >= 5 && b.wave <= 25).map((b) => b.pad));
    const counts = Array.from({ length: LEGS + 1 }, (_, k) => pads.filter((x) => x === k).length);
    console.log(`boss pads 0-${LEGS} (${LEGS}: got through) ${counts.join('/')}; median ${median(pads)}`);
    expect(pads.length).toBeGreaterThan(0);
  });

  it('ends runs on flying waves no more than its share of waves (no flying wall)', () => {
    const flyEnd = runs.filter((p) => p.fellFlying).length / runs.length;
    const waves = runs.flatMap((p) => Array.from({ length: p.fell }, (_, i) => i + 1));
    const flyShare = waves.filter(flies).length / waves.length;
    expect(flyEnd).toBeLessThanOrEqual(flyShare * 2);
  });

  it('has no step in waves 15-25: no one wave ends more than a third of the runs', () => {
    for (let w = 15; w <= 25; w++) {
      const lost = runs.filter((p) => p.fell === w).length;
      expect(lost, `wave ${w}`).toBeLessThanOrEqual(runs.length / 3);
    }
  });

  it('leaks next to nothing on waves 1-2 (a sensible first Shard holds them)', () => {
    // A first draft with no good gun for walkers (Firepower shoots only flyers) may let one Echo by; most hold.
    const early = runs.map((p) => p.leaks.slice(1, 3).map((l) => l ?? 0));
    for (const l of early) expect(Math.max(...l)).toBeLessThanOrEqual(1);
    expect(early.filter((l) => l[0] + l[1] === 0).length).toBeGreaterThanOrEqual((runs.length * 2) / 3);
  });

  it('leaks now and then in waves 8-15, but not every wave', () => {
    const mid = runs.map((p) => p.leaks.slice(8, 16).filter((l) => l > 0).length);
    expect(mid.filter((n) => n > 0).length / runs.length).toBeGreaterThanOrEqual(0.3);
    expect(mean(mid) / 8).toBeLessThanOrEqual(0.6);
  });

  it('every sample force reaches about wave 20-27', () => {
    console.log(cases.map(({ f, seed }, k) => `${f.name.padEnd(22)} ${String(f.units.reduce((n, u) => n + u.points, 0)).padStart(4)} pts ${f.units.length} units  seed ${seed}: wave ${outs[k].cleared}` +
      `  crafted ${outs[k].crafted}  luck ${outs[k].luck}  ${Math.round(outs[k].ms)} ms`).join('\n'));
    for (const o of outs) {
      expect(o.cleared).toBeGreaterThanOrEqual(15);
      expect(o.cleared).toBeLessThanOrEqual(35);
    }
  });
});
