import { describe, expect, it } from 'vitest';
import { TRAINING, type DrillPerk } from '../downtimeData';
import { weekSeed } from '../sortie';
import { createRun } from './run';
import { draftLuck, drawDraft, drawSize, rollGrade } from './shards';
import { blankRun } from './testRun';
import type { RunDrill, TrainingRun } from './types';

// A draft is always exactly TRAINING.shards.draw Shards: no perk, event or siege changes it (the balance rests on it).

const N = TRAINING.shards.draw;
const PERKS = Object.keys(TRAINING.drill.perks) as DrillPerk[];
const maxed: RunDrill = { luck: 10, cards: [], perks: Object.fromEntries(PERKS.map((p) => [p, 9])) };
const nexusRun = (event: string) => createRun('f', [], 1, undefined, { threat: 4, affixes: [], event, lords: [] }, { drill: maxed });

describe('draft size', () => {
  it('has no perk that touches the draft', () => {
    expect(PERKS).not.toContain('draw');
  });

  it('is always TRAINING.shards.draw, whatever the perks, event or siege', () => {
    const runs: TrainingRun[] = [
      createRun('f', [], 1),
      createRun('f', [], 1, undefined, undefined, { drill: maxed }),
      createRun('f', [], weekSeed('2026-W43'), undefined, undefined, { siege: '2026-W43' }),
      ...Object.keys(TRAINING.nexus.events).map(nexusRun),
    ];
    for (const run of runs) {
      expect(drawSize(run)).toBe(N);
      expect(run.draft.hand).toHaveLength(N);
      run.wave = 3;
      drawDraft(run);
      expect(run.draft.hand).toHaveLength(N);
    }
  });

  it('a Shard Rush rolls grades as if luck were higher, never past the odds table', () => {
    const rush = (luck: number) => Object.assign(blankRun(), { luck, nexus: { threat: 0, affixes: [], event: 'shardRush', lords: [] } });
    expect(draftLuck(rush(0))).toBe(TRAINING.nexus.events.shardRush.luck);
    const low = rush(0);
    expect(new Set(Array.from({ length: 200 }, () => rollGrade(low))).has(2)).toBe(true);
    const top = TRAINING.shards.odds.length - 1;
    expect(draftLuck(rush(top))).toBe(top);
    expect(draftLuck(blankRun())).toBe(0);
  });
});
