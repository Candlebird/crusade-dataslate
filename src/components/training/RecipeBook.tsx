import type { EmblemLayer, Unit } from '../../model/types';
import { SHARD_TYPES } from '../../rules/downtimeData';
import { craft, craftDefault, craftProblem, gradeName, readyRecipes, type Recipe, type TrainingRun } from '../../rules/training';
import { EmblemBadge } from '../Emblem';
import { Icon } from '../Icon';
import { act } from './act';
import { DefaultsBook } from './DefaultsBook';
import { countable, recipeProgress } from './recipeView';
import { RecordBadges } from './RecordBadges';
import { ShardBadge } from './ShardBadge';

/** A craft under way: the unit's recipe or the default (`def`, its key) chosen, waiting for a tap on one of the Shards
 *  it uses (where it will stand). */
export interface Crafting {
  unitId?: string;
  def?: string;
  uses: number[];
}

export interface RecipeBookProps {
  run: TrainingRun;
  /** The force's units (a craft needs the datasheet). */
  units: Unit[];
  /** Portraits by unit id (model/emblem unitPortrait). */
  portraits: Record<string, EmblemLayer[]>;
  crafting: Crafting | null;
  /** Start a craft; the map then asks for a tap on one of `uses` (its banner cancels, with null). */
  onCraft: (c: Crafting | null) => void;
}

/**
 * Finish a craft on the Shard tapped. Returns false (and toasts why) if `pieceId` isn't one it uses or the craft is
 * refused; the shell then stays in craft mode, or leaves it on true.
 */
export function finishCraft(run: TrainingRun, units: Unit[], c: Crafting, pieceId: number, onChange: () => void): boolean {
  if (c.def) return act(() => craftDefault(run, c.def!, c.uses, pieceId), onChange);
  const unit = units.find((u) => u.id === c.unitId);
  if (!unit) return false;
  return act(() => craft(run, unit, c.uses, pieceId), onChange);
}

/** Every unit's recipe: the Shards it takes, which are on the map already, and a Craft button on the ready ones; then
 *  the default towers (DefaultsBook). */
export function RecipeBook({ run, units, portraits, crafting, onCraft }: RecipeBookProps) {
  const ready = new Map(readyRecipes(run).map((r) => [r.unitId, r.uses]));
  const shards = countable(run);
  const open = run.recipes.filter((r) => !run.crafted.includes(r.unitId));
  const sorted = [...open].sort((a, b) => Number(ready.has(b.unitId)) - Number(ready.has(a.unitId)));
  const done = run.recipes.filter((r) => run.crafted.includes(r.unitId));
  return (
    <div className="training-recipes small">
      <div className="training-panel-title">
        <b>Recipes</b> <span className="muted">· {run.crafted.length}/{run.recipes.length} crafted</span>
      </div>
      {sorted.map((r) => (
        <RecipeRow
          key={r.unitId}
          run={run}
          recipe={r}
          portrait={portraits[r.unitId]}
          progress={recipeProgress(r, shards)}
          uses={ready.get(r.unitId)}
          active={crafting?.unitId === r.unitId}
          onCraft={onCraft}
          unit={units.find((u) => u.id === r.unitId)}
        />
      ))}
      {done.length > 0 && (
        <div className="muted training-recipes-done">
          <Icon name="g:check-mark" /> Crafted: {done.map((r) => r.name).join(', ')}
        </div>
      )}
      <DefaultsBook run={run} crafting={crafting} onCraft={onCraft} />
    </div>
  );
}

function RecipeRow({ run, recipe, portrait, progress, uses, active, onCraft, unit }: {
  run: TrainingRun;
  recipe: Recipe;
  portrait?: EmblemLayer[];
  progress: ReturnType<typeof recipeProgress>;
  uses?: number[];
  active: boolean;
  onCraft: (c: Crafting | null) => void;
  /** The unit (its datasheet, and its record's badges); a craft needs it. */
  unit?: Unit;
}) {
  const known = !!unit;
  const met = progress.filter(Boolean).length;
  // A ready recipe may still be refused (draft not all placed): say why on the button.
  const why = uses ? craftProblem(run, recipe.unitId, uses, uses[0]) : 'Not all its Shards are on the map.';
  return (
    <div className={`training-recipe${uses ? ' ready' : ''}${active ? ' active' : ''}`}>
      {portrait ? <EmblemBadge emblem={portrait} size={24} /> : <span className="swatch" />}
      <span className="training-recipe-body">
        <span className="training-recipe-name">{recipe.name} <span className="muted">· {recipe.points} pts · {met}/{recipe.slots.length}</span></span>
        <span className="training-recipe-slots">
          {recipe.slots.map((s, i) => (
            <span key={i} title={`${gradeName(s.grade)}+ ${SHARD_TYPES[s.type].name}${progress[i] ? ' (on the map)' : ''}`}>
              <ShardBadge type={s.type} grade={s.grade} size={18} faded={!progress[i]} glow={!!uses} />
            </span>
          ))}
        </span>
        {unit && <RecordBadges unit={unit} />}
      </span>
      {/* Crafting: the banner over the map has the one Cancel. */}
      {uses && active && <span className="training-recipe-crafting">Crafting…</span>}
      {uses && !active && (
        <button
          className="primary"
          disabled={!known || !!why}
          title={why ?? 'Then tap one of its Shards on the map'}
          onClick={() => onCraft({ unitId: recipe.unitId, uses })}
        >
          Craft
        </button>
      )}
    </div>
  );
}
