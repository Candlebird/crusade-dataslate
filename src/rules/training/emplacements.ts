import { TRAINING, type DefaultRecipeDef, type ShardType } from '../downtimeData';
import { pieceById, shardsOnMap } from './board';
import { towerDps } from './dps';
import { recipeUses } from './recipes';
import { crumbleDraft, shardGun, shardPiece, shardValue, toRubble } from './shards';
import type { DefaultTower, Grade, ShardPiece, Tile, TrainingRun } from './types';

// Default towers (emplacements): fixed Shard combinations any force can craft, each of the 40 Shard kinds in exactly
// one. Weaker than a unit of the same Shards, with no XP, levels, traits or relics.

const D = TRAINING.defaults;

/** Every default recipe, from TRAINING.defaults. */
export const DEFAULTS: readonly DefaultRecipeDef[] = D.recipes;

export const defaultByKey = (key: string): DefaultRecipeDef | undefined => DEFAULTS.find((d) => d.key === key);

/** A default's value: its Shards' values summed. */
export const defaultValue = (d: DefaultRecipeDef): number => d.slots.reduce((n, [, g]) => n + shardValue(g as Grade), 0);

/** The Shards (ids, in slot order) that make default `d` out of these: each slot its exact type and grade, kept Shards
 *  before draft ones; null if they can't. */
export function emplacementUses(d: DefaultRecipeDef, shards: ShardPiece[]): number[] | null {
  const free = [...shards].sort((a, b) => Number(a.draft) - Number(b.draft) || a.id - b.id);
  const used = new Set<number>();
  const out: number[] = [];
  for (const [type, grade] of d.slots) {
    const p = free.find((x) => !used.has(x.id) && x.type === type && x.grade === grade);
    if (!p) return null;
    used.add(p.id);
    out.push(p.id);
  }
  return out;
}

/** The run's recipes and (optionally) the units crafted so far: all defaultHidden needs. */
type RecipeBook = Pick<TrainingRun, 'recipes'> & Partial<Pick<TrainingRun, 'crafted'>>;

/** Could one of these unit recipes be filled from default `d`'s exact Shards? */
const fillsFrom = (recipes: TrainingRun['recipes'], d: DefaultRecipeDef): boolean => {
  const fake = d.slots.map(([type, grade], i) => shardPiece(i + 1, { x: 0, y: 0 }, type, grade as Grade, false));
  return recipes.some((r) => recipeUses(r, fake) !== null);
};

/** Is default `d` hidden for this run: one of the force's unit recipes not yet crafted can be filled from its exact
 *  Shards. Once that unit is crafted the default is freed (buildable for the rest of the run). */
export const defaultHidden = (run: RecipeBook, d: DefaultRecipeDef): boolean =>
  fillsFrom(run.recipes.filter((r) => !run.crafted?.includes(r.unitId)), d);

/** Defaults a unit recipe hid that are buildable again because that unit is crafted (freedDefaults ⊆ defaultsFor). */
export const freedDefaults = (run: RecipeBook): DefaultRecipeDef[] =>
  DEFAULTS.filter((d) => fillsFrom(run.recipes, d) && !defaultHidden(run, d));

/** The defaults this run shows in its recipe book (not hidden by an uncrafted unit's recipe). */
export const defaultsFor = (run: RecipeBook): DefaultRecipeDef[] => DEFAULTS.filter((d) => !defaultHidden(run, d));

/** Defaults the run can craft now, with the Shards each would use: kept ones, and this draft's once all placed. */
export function readyDefaults(run: TrainingRun): { key: string; uses: number[] }[] {
  if (run.phase === 'over') return [];
  const shards = shardsOnMap(run, run.draft.step === 'keep');
  return defaultsFor(run).flatMap((d) => {
    const uses = emplacementUses(d, shards);
    return uses ? [{ key: d.key, uses }] : [];
  });
}

/** The guns default `d` fires: each of its `guns` types at the best grade of its slots of that type. */
const gunsOf = (d: DefaultRecipeDef, slots: [ShardType, Grade][]) =>
  d.guns.map((type) => shardGun(type, Math.max(...slots.filter(([t]) => t === type).map(([, g]) => g)) as Grade));

/** Default `d` as a tower at `at`: its one gun (two for a theme that needs them: DefaultRecipeDef.guns) and every
 *  Shard's rule, Quality the best of theirs less qualityBonus (2+ at best), attacks scaled so it does dpsShare of a
 *  unit of the same value (dpsDefense, dps.ts). */
export function defaultTower(d: DefaultRecipeDef, id: number, at: Tile): DefaultTower {
  const slots = d.slots.map(([type, grade]) => [type, grade as Grade] as [ShardType, Grade]);
  const quality = Math.max(2, Math.min(...slots.map(([, g]) => TRAINING.shards.quality[g - 1])) - D.qualityBonus);
  const base = { quality, hitShoot: 0, hitMelee: 0, atkBonus: 1, guns: gunsOf(d, slots) };
  const k = (D.dpsShare * D.unitDps * defaultValue(d)) / towerDps(base, D.dpsDefense);
  const guns = base.guns.map((g) => ({ ...g, name: `${d.name}: ${g.name}`, attacks: g.attacks * k }));
  return {
    kind: 'default', id, x: at.x, y: at.y, key: d.key, name: d.name, slots, ...base, guns,
    boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0,
  };
}

/** Why default `key` can't be crafted from Shards `uses` onto Shard `onId`, or null. */
export function craftDefaultProblem(run: TrainingRun, key: string, uses: number[], onId: number): string | null {
  if (run.phase !== 'build') return 'Defences are built between waves.';
  const d = defaultByKey(key);
  if (!d || defaultHidden(run, d)) return 'No such defence.';
  if (!uses.includes(onId)) return 'The defence must stand on one of the Shards it uses.';
  if (new Set(uses).size !== uses.length || uses.length !== d.slots.length) return 'Those Shards don’t make the defence.';
  const ps = uses.map((id) => pieceById(run, id));
  if (ps.some((p) => p?.kind !== 'shard')) return 'Only Shards on the map can be used.';
  const shards = ps as ShardPiece[];
  if (shards.some((p) => p.draft) && run.draft.step !== 'keep') return 'Place the whole draft before crafting with it.';
  if (!emplacementUses(d, shards)) return 'Those Shards don’t make the defence.';
  return null;
}

/** Craft a default: it stands where Shard `onId` stood (same id), the other used Shards become rubble; with this
 *  draft's pieces it stands in for the keep. Any number of each may be built. Throws on a problem. */
export function craftDefault(run: TrainingRun, key: string, uses: number[], onId: number): void {
  const why = craftDefaultProblem(run, key, uses, onId);
  if (why) throw new Error(why);
  const used = uses.map((id) => pieceById(run, id) as ShardPiece);
  const on = used.find((p) => p.id === onId)!;
  const t = defaultTower(defaultByKey(key)!, on.id, on);
  run.pieces[run.pieces.indexOf(on)] = t;
  toRubble(run, uses.filter((id) => id !== onId));
  if (used.some((p) => p.draft)) crumbleDraft(run, []);
  run.log.push(`${t.name} built.`);
}
