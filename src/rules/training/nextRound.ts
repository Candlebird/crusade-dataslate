import { TRAINING_ENEMIES, TRAINING_ENEMY_BLURBS, TRAINING_WAVE_BLURBS, type TrainingEnemyKind } from '../downtimeData';
import { finalOf, inEndless } from './finaleCore';
import { finalBoss } from './finale';
import { GENERIC_LORD, lordIndex, TRICK_NAMES, trickText } from './lordPick';
import { isNemesisWave, nemesisTricks } from './nemesis';
import { affixInfo } from './nexus';
import type { SpawnPlan, TrainingRun } from './types';

// The HUD's next-round icon: what the next wave is (its one kind, flying or not, elites, its boss) and one line each on
// what it does. Pure: built from the wave preview's plans (previewWave), which the caller rolls.

export interface NextRound {
  wave: number;
  /** The wave's one kind (the boss's, for a siege's lone colossus). */
  kind: TrainingEnemyKind;
  flies: boolean;
  elite: boolean;
  /** The boss's name, on a boss or Final wave. */
  boss?: string;
  bossFlies: boolean;
  /** One line each: the kind, flying, elites, the boss and its tricks, the Final, the campaign's affixes. */
  lines: string[];
}

const isBoss = (s: SpawnPlan) => TRAINING_ENEMIES[s.kind].spawn === 'boss';

/** The boss of wave `w` and its tricks in words. */
function bossLines(run: TrainingRun, w: number, plan: SpawnPlan): { name: string; lines: string[] } {
  const final = !!run.finale && w === finalOf(run) && !inEndless(run);
  if (final && run.siege) return { name: finalBoss(run), lines: [TRAINING_WAVE_BLURBS.siege] };
  if (run.nemesis && (plan.nemesis || isNemesisWave(run, w))) {
    return { name: run.nemesis.name, lines: nemesisTricks(run.nemesis).map((t) => `${t.name}: ${t.text}`) };
  }
  const i = lordIndex(run, w);
  const l = i === undefined ? (final ? run.finale?.lord : undefined) : run.nexus?.lords[i];
  if (l) return { name: l.name, lines: [`${TRICK_NAMES[l.trick]}: ${trickText(l.trick)}`] };
  return { name: final ? finalBoss(run) : GENERIC_LORD, lines: [] };
}

/** The next round from its plans (previewWave(run)): wave run.wave + 1. */
export function nextRound(run: TrainingRun, plans: SpawnPlan[]): NextRound | undefined {
  const w = run.wave + 1;
  const boss = plans.find(isBoss);
  const final = !!run.finale && w === finalOf(run) && !inEndless(run);
  const lone = final && !!run.siege;
  const main = lone ? undefined : plans.find((s) => !isBoss(s));
  const lead = main ?? boss;
  if (!lead) return undefined;
  const lines: string[] = [];
  if (main) {
    lines.push(TRAINING_ENEMY_BLURBS[main.kind]);
    if (main.flies) lines.push(TRAINING_WAVE_BLURBS.flies);
    if (plans.some((s) => s.elite && !isBoss(s))) lines.push(TRAINING_WAVE_BLURBS.elite);
  }
  let name: string | undefined;
  if (boss) {
    const b = bossLines(run, w, boss);
    name = b.name;
    lines.push(`Boss: ${b.name}${boss.flies && !lone ? ' (flies)' : ''}`, ...b.lines);
    if (final && !lone) lines.push(TRAINING_WAVE_BLURBS.final);
  }
  if (inEndless(run)) lines.push(TRAINING_WAVE_BLURBS.endless);
  for (const a of run.nexus?.affixes ?? []) {
    const x = affixInfo(a, run.nexus!.threat);
    lines.push(`${x.name}: ${x.text}`);
  }
  return {
    wave: w,
    kind: lead.kind,
    flies: !!main?.flies,
    elite: !!main && plans.some((s) => s.elite && s.kind === main.kind),
    ...(name ? { boss: name } : {}),
    bossFlies: !!boss?.flies && !lone,
    lines,
  };
}
