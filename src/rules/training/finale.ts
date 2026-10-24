import { TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { ECHO_LORDS } from '../nexusData';
import { finalOf } from './finaleCore';
import { lordIndex } from './lordPick';
import { isNemesisWave } from './nemesis';
import type { LordTrick, RunFinale, RunLord, SpawnPlan, TrainingRun } from './types';

// The Final wave (TRAINING.finale): which it is, its boss (the nemesis, the Nexus Crisis lord or a named Echo Lord),
// the Weekly Siege's lone colossus, and the Victory. run.ts ends the run or holds it for the player's choice.

const F = TRAINING.finale;
const L = TRAINING.nexus.lords;

/** What the Weekly Siege's Final boss is called. */
export const SIEGE_BOSS = 'the Siege Colossus';

/** Every Final wave on the ladder, lowest first: from, from + step, … to. */
export const finalSteps = (): number[] => {
  const out: number[] = [];
  for (let n = F.from; n <= F.to; n += F.step) out.push(n);
  return out;
};

/** The named Echo Lord that leads Final wave `final` when neither the nemesis nor the Nexus Crisis lord does. */
export function finalLord(final: number): RunLord | undefined {
  const l = ECHO_LORDS.find((x) => x.id === F.lords[final]);
  return l && { key: `nexus:${l.id}`, name: l.name, tier: 'Legendary', trick: (TRAINING.nexus.tricks.byLord[l.id] ?? 'summon') as LordTrick, from: 'final' };
}

/** A new run's finale: Final wave `final` (a Weekly Siege's is always finale.from) and its named lord. */
export function newFinale(final: number, siege = false): RunFinale {
  const n = siege ? F.from : Math.min(F.to, Math.max(F.from, final));
  const lord = siege ? undefined : finalLord(n);
  return { final: n, dealt: 0, ...(lord ? { lord } : {}) };
}

/** Is wave `w` the run's Final. */
export const isFinalWave = (run: Pick<TrainingRun, 'finale'>, w: number) => w === finalOf(run);

/** Who leads the run's Final wave: the colossus in a siege, the nemesis on its wave, a campaign lord that takes it
 *  (the Nexus Crisis lord at finale.to), else the run's named Final lord. */
export function finalBoss(run: Pick<TrainingRun, 'siege' | 'nemesis' | 'nexus' | 'finale'>): string {
  const w = finalOf(run);
  if (run.siege) return SIEGE_BOSS;
  if (run.nemesis && isNemesisWave(run, w)) return run.nemesis.name;
  const i = lordIndex(run, w);
  const l = i === undefined ? run.finale?.lord : run.nexus?.lords[i];
  return l?.name ?? 'an Echo Lord';
}

/** The Final wave's plans with its boss marked final, finale.bossHp[final] times as tough (a named lord also lords.hp
 *  by tier, as a campaign lord is). A siege's Final is its boss alone, siegeHp wounds, coming at once. */
export function finalePlan(run: TrainingRun, plans: SpawnPlan[]): SpawnPlan[] {
  const fin = run.finale;
  if (!fin || run.wave !== fin.final) return plans;
  const boss = plans.find((s) => TRAINING_ENEMIES[s.kind].spawn === 'boss');
  if (!boss) return plans;
  boss.final = true;
  if (run.siege) {
    const { nemesis: _n, lord: _l, ...lone } = boss;
    run.log.push(`The Final wave: ${SIEGE_BOSS} comes alone. Hurt it all you can before it reaches the base.`);
    return [{ ...lone, at: 0, hp: F.siegeHp }];
  }
  boss.hp *= F.bossHp[fin.final] ?? 1;
  if (!boss.nemesis && boss.lord === undefined && fin.lord) {
    boss.lord = -1;
    boss.hp *= L.hp[fin.lord.tier];
  }
  run.log.push(`The Final wave: ${finalBoss(run)} leads it. Slay it with the base standing for a Victory.`);
  return plans;
}

/** The Final boss got through: what the log says as the run ends. */
export const throughText = (run: TrainingRun) =>
  run.siege ? `${SIEGE_BOSS} reaches the base: ${Math.round(run.finale?.dealt ?? 0)} damage dealt.` : `${finalBoss(run)} breaks through. No Victory.`;
