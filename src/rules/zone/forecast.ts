import { playOut } from './sim';
import type { SideIx, ZBattle } from './state';

// The forecast: the battle as it stands, played out by the AI on both sides many times over with fresh dice.

export interface ZForecast { n: number; wins: [number, number]; draws: number }

/** How many sims to run: fewer on a phone. */
export const forecastSims = (phone: boolean) => (phone ? 24 : 80);

export function forecast(b: ZBattle, n: number): ZForecast {
  const out: ZForecast = { n, wins: [0, 0], draws: 0 };
  for (let i = 0; i < n; i++) {
    const sim: ZBattle = structuredClone(b);
    sim.rng = { seed: (b.rng.seed ^ Math.imul(i + 1, 0x9e3779b1)) | 0, n: 0 };
    for (const m of sim.members) m.ai = true;
    sim.practice = true;
    playOut(sim);
    const w = sim.result?.winner;
    if (w === 0 || w === 1) out.wins[w as SideIx]++;
    else out.draws++;
  }
  return out;
}
