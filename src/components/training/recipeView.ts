import type { DefaultRecipeDef } from '../../rules/downtimeData';
import { readyDefaults, readyRecipes, shardsOnMap, type Recipe, type ShardPiece, type TrainingRun } from '../../rules/training';

// What the recipe book shows: how far each recipe is along, and which Shards on the map a ready one would use.

/** Each slot's Shard on the map that is exactly it (or null), kept Shards first. */
export function recipeProgress(recipe: Recipe, shards: ShardPiece[]): (ShardPiece | null)[] {
  const free = [...shards].sort((a, b) => a.grade - b.grade || Number(a.draft) - Number(b.draft) || a.id - b.id);
  const used = new Set<number>();
  const out: (ShardPiece | null)[] = recipe.slots.map(() => null);
  const order = recipe.slots.map((s, i) => ({ s, i })).sort((a, b) => b.s.grade - a.s.grade);
  for (const { s, i } of order) {
    const p = free.find((x) => !used.has(x.id) && x.type === s.type && x.grade === s.grade);
    if (!p) continue;
    used.add(p.id);
    out[i] = p;
  }
  return out;
}

/** Each slot of a default's Shard on the map that is exactly it (or null), kept Shards first. */
export function defaultProgress(d: DefaultRecipeDef, shards: ShardPiece[]): (ShardPiece | null)[] {
  const free = [...shards].sort((a, b) => Number(a.draft) - Number(b.draft) || a.id - b.id);
  const used = new Set<number>();
  return d.slots.map(([type, grade]) => {
    const p = free.find((x) => !used.has(x.id) && x.type === type && x.grade === grade) ?? null;
    if (p) used.add(p.id);
    return p;
  });
}

/** The Shards a recipe's slots can show: kept ones, and this draft's (placed) ones too, which pulse as new. */
export const countable = (run: TrainingRun): ShardPiece[] => shardsOnMap(run, run.draft.step !== 'done');

/** A slot met by a kept Shard: lit, and counted. A draft's Shard only pulses until it is kept. */
export const kept = (p: ShardPiece | null): boolean => !!p && !p.draft;

/** A slot's tooltip tail: whether its Shard is on the map, and if so whether it is kept yet. */
export const slotNote = (p: ShardPiece | null): string => (!p ? '' : p.draft ? ' (placed this draft, not kept yet)' : ' (on the map)');

/** Ids of the Shards that a ready recipe or default would use: these glow on the map. */
export function glowIds(run: TrainingRun): Set<number> {
  return new Set([...readyRecipes(run), ...readyDefaults(run)].flatMap((r) => r.uses));
}
