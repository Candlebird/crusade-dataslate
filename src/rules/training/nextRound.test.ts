import { describe, expect, it } from 'vitest';
import { TRAINING, TRAINING_ENEMIES, TRAINING_ENEMY_BLURBS, TRAINING_WAVE_BLURBS, type TrainingEnemyKind } from '../downtimeData';
import { newFinale } from './finale';
import { nextRound } from './nextRound';
import { blankRun } from './testRun';
import type { SpawnPlan } from './types';

// The HUD's next-round icon: the next wave's kind, its marks and one line each on what it does.

const plan = (kind: TrainingEnemyKind, o: Partial<SpawnPlan> = {}): SpawnPlan => ({ kind, at: 0, leg: 0, x: 0, y: 0, hp: 5, flies: false, ...o });

describe('the next-round icon', () => {
  it('has a one-line blurb for every enemy kind', () => {
    for (const k of Object.keys(TRAINING_ENEMIES) as TrainingEnemyKind[]) {
      expect(TRAINING_ENEMY_BLURBS[k]).toBeTruthy();
      expect(TRAINING_ENEMY_BLURBS[k]).not.toMatch(/\n/);
    }
  });

  it('names the kind, its flight and elites', () => {
    const run = Object.assign(blankRun(), { wave: 4 });
    const nr = nextRound(run, [plan('stalker', { flies: true }), plan('stalker', { elite: true, flies: true })])!;
    expect(nr).toMatchObject({ wave: 5, kind: 'stalker', flies: true, elite: true, bossFlies: false });
    expect(nr.lines).toEqual([TRAINING_ENEMY_BLURBS.stalker, TRAINING_WAVE_BLURBS.flies, TRAINING_WAVE_BLURBS.elite]);
    expect(nr.lines[0]).toMatch(new RegExp(`pad ${TRAINING.route.ambushAt}`));
  });

  it('names the boss, and the Final, on a boss wave', () => {
    const run = Object.assign(blankRun(), { wave: TRAINING.finale.from - 1, finale: newFinale(TRAINING.finale.from) });
    const nr = nextRound(run, [plan('drone'), plan('lord', { flies: true })])!;
    expect(nr.boss).toBe(run.finale.lord!.name);
    expect(nr.bossFlies).toBe(true);
    expect(nr.lines).toContain(TRAINING_WAVE_BLURBS.final);
    expect(nr.lines.some((l) => l.startsWith(`Boss: ${run.finale.lord!.name}`))).toBe(true);
  });

  it('shows the siege colossus alone', () => {
    const run = Object.assign(blankRun(), { siege: '2026-W43', wave: TRAINING.finale.from - 1, finale: newFinale(40, true) });
    const nr = nextRound(run, [plan('drone'), plan('lord')])!;
    expect(nr.kind).toBe('lord');
    expect(nr.lines).toContain(TRAINING_WAVE_BLURBS.siege);
  });
});
