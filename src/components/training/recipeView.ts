import { readyRecipes, shardsOnMap, type Recipe, type ShardPiece, type TrainingRun } from '../../rules/training';

// What the recipe book shows: how far each recipe is along, and which Shards on the map a ready one would use.

/** Each slot's Shard on the map that meets it (or null), matched dearest slot first, cheapest Shard that does. */
export function recipeProgress(recipe: Recipe, shards: ShardPiece[]): (ShardPiece | null)[] {
  const free = [...shards].sort((a, b) => a.grade - b.grade || Number(a.draft) - Number(b.draft) || a.id - b.id);
  const used = new Set<number>();
  const out: (ShardPiece | null)[] = recipe.slots.map(() => null);
  const order = recipe.slots.map((s, i) => ({ s, i })).sort((a, b) => b.s.grade - a.s.grade);
  for (const { s, i } of order) {
    const p = free.find((x) => !used.has(x.id) && x.type === s.type && x.grade >= s.grade);
    if (!p) continue;
    used.add(p.id);
    out[i] = p;
  }
  return out;
}

/** The Shards a recipe can count right now: kept ones, and this draft's (placed) ones too. */
export const countable = (run: TrainingRun): ShardPiece[] => shardsOnMap(run, run.draft.step !== 'done');

/** Ids of the Shards that a ready recipe would use: these glow on the map. */
export function glowIds(run: TrainingRun): Set<number> {
  return new Set(readyRecipes(run).flatMap((r) => r.uses));
}
