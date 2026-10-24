import type { ForceSortie } from '../../model/types';
import { SORTIE, TRAINING, TRAINING_ENEMIES } from '../downtimeData';
import { SORTIE_BOSSES } from '../sortieStory';
import { centreOf, dist, mapOf, pieceById, towers } from './board';
import { regrabTime } from './holds';
import { lateHp, move, spawnOne } from './waves';
import type { Enemy, RunNemesis, SpawnPlan, TrainingRun } from './types';

// The force's Sortie nemesis comes to Training as the boss of wave TRAINING.shared.nemesis.wave: its name, its
// signature mapped to the maze, and the rematch tricks the force's Sortie kills gave it. Slain here, it meets the
// next Sortie hurt and a trick short (bankShared writes ForceSortie.bled; sortie.ts createRun reads it).

const N = TRAINING.shared.nemesis;

/** The force's nemesis for a run: the lord with the biggest grudge (ties by SORTIE_BOSSES order), with a rematch trick
 *  for each time the force has slain it on a Sortie (as Sortie counts them). None without a grudge. */
export function pickNemesis(story?: ForceSortie): RunNemesis | undefined {
  let best: { id: string; g: number } | undefined;
  for (const b of SORTIE_BOSSES) {
    const g = story?.nemesis?.[b.id] ?? 0;
    if (g > 0 && (!best || g > best.g)) best = { id: b.id, g };
  }
  const b = best && SORTIE_BOSSES.find((x) => x.id === best!.id);
  if (!best || !b) return undefined;
  const slain = story?.bestiary?.[`lord:${b.id}`]?.slain ?? 0;
  return {
    id: b.id, name: b.name, grudge: best.g, rematch: Math.min(SORTIE.rematch.tricks.length, slain), sig: b.sig.id, sigName: b.sig.name,
  };
}

/** Is wave `w` the one the nemesis comes on (once a run, and not once it has fallen)? */
export const isNemesisWave = (run: TrainingRun, w: number) => !!run.nemesis && !run.nemesis.slain && w === N.wave;

/** A wave's plans with the nemesis in the boss's place on its wave: a share tougher per grudge level. */
export function nemesisPlan(run: TrainingRun, plans: SpawnPlan[]): SpawnPlan[] {
  if (!isNemesisWave(run, run.wave)) return plans;
  const boss = plans.find((s) => TRAINING_ENEMIES[s.kind].spawn === 'boss');
  if (!boss) return plans;
  boss.nemesis = true;
  boss.hp *= 1 + N.hp * run.nemesis!.grudge;
  run.log.push(`${run.nemesis!.name} comes for the base: ${nemesisTricks(run.nemesis!).map((t) => t.name).join(', ')}.`);
  return plans;
}

/** Its signature (every nemesis has one) and rematch tricks, in Training words. */
export function nemesisTricks(n: RunNemesis): { name: string; text: string }[] {
  const out = [{ name: n.sigName, text: sigText(n.sig) }];
  const R = SORTIE.rematch.tricks;
  if (n.rematch >= 1) out.push({ name: R[0].name, text: '+1 to its saves.' });
  if (n.rematch >= 2) out.push({ name: R[1].name, text: `Walks ${Math.round((N.vengeful - 1) * 100)}% faster.` });
  if (n.rematch >= 3) out.push({ name: R[2].name, text: `Mends ${Math.round(N.regen * 100)}% of its wounds every ${N.regenEvery} s.` });
  return out;
}

/** What a signature does in the maze. */
export function sigText(sig: string): string {
  switch (sig) {
    case 'rage': return `Walks ${Math.round(N.rage.per * 100)}% faster for every second it lives, up to ${Math.round(N.rage.max * 100)}%.`;
    case 'dive': return `Every ${N.dive.every} s it leaps ${N.dive.cells} cells on, out of any hold.`;
    case 'dirge': return `For ${N.dirge.secs} s of every ${N.dirge.every}, towers within ${N.dirge.radius} cells are at -1 to hit.`;
    case 'tremor': return `Every ${N.tremor.every} s it stamps, and the base takes ${N.tremor.dmg}.`;
    case 'dread': return 'Nothing can hold it.';
    case 'brood': return `Every ${N.brood.every} s ${N.brood.n} Swarmlings crawl out where it stands.`;
    default: return '';
  }
}

/** Seconds between goes of a timed signature (0: it has none). */
const every = (sig: string) => (sig === 'dive' ? N.dive.every : sig === 'tremor' ? N.tremor.every : sig === 'brood' ? N.brood.every : 0);

/** Is its dirge sounding now. */
export const dirgeOn = (run: TrainingRun, e: Enemy) => !!e.nem && (run.t - e.nem.born) % N.dirge.every < N.dirge.secs;

/** Let go of it, if a unit holds it. */
function wrench(run: TrainingRun, e: Enemy) {
  if (e.heldBy === undefined) return;
  const t = pieceById(run, e.heldBy);
  if (t?.kind === 'unit') Object.assign(t, { holding: undefined, holdLeft: 0 });
  e.heldBy = undefined;
  e.regrab = regrabTime(run, e);
}

/** One go of a timed signature. */
function act(run: TrainingRun, e: Enemy, sig: string) {
  if (sig === 'dive') {
    wrench(run, e);
    move(e.flies ? undefined : mapOf(run), e, N.dive.cells);
  } else if (sig === 'tremor') {
    run.baseHp = Math.max(0, run.baseHp - N.tremor.dmg);
  } else if (sig === 'brood') {
    const hp = TRAINING_ENEMIES.swarm.hp * TRAINING.enemyHp * lateHp(run.wave) * N.brood.hp;
    for (let i = 0; i < N.brood.n; i++) {
      spawnOne(run, { kind: 'swarm', at: run.t, leg: e.leg, x: e.x + (i - (N.brood.n - 1) / 2) * N.brood.spread, y: e.y, hp, flies: e.flies });
    }
  }
}

/**
 * The nemesis's tricks, every step after the auras: speed (rage, Vengeful), saves (Hardened), Dread, the dirge's -1 to
 * hit on towers near it, its timed signature, and Regenerating.
 */
export function nemesisTick(run: TrainingRun, dt: number): void {
  const n = run.nemesis;
  if (!n) return;
  for (const e of run.enemies) {
    const s = e.nem;
    if (!s || e.hp <= 0) continue;
    if (!s.armed) Object.assign(s, { armed: true, next: every(n.sig), regen: N.regenEvery });
    const age = run.t - s.born;
    s.speed = (n.sig === 'rage' ? 1 + Math.min(N.rage.max, N.rage.per * age) : 1) * (n.rematch >= 2 ? N.vengeful : 1);
    s.hard = n.rematch >= 1 ? SORTIE.rematch.def : 0;
    s.free = n.sig === 'dread' || undefined;
    if (n.sig === 'dirge' && dirgeOn(run, e)) {
      for (const t of towers(run)) {
        const c = centreOf(t);
        if (dist(c.x, c.y, e.x, e.y) <= N.dirge.radius) t.boost.hit -= 1;
      }
    }
    if (every(n.sig) && (s.next -= dt) <= 0) {
      s.next += every(n.sig);
      act(run, e, n.sig);
    }
    if (n.rematch >= 3 && (s.regen -= dt) <= 0) {
      s.regen += N.regenEvery;
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * N.regen);
    }
  }
}
