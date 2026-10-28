import type { DefaultRecipeDef } from '../../rules/downtimeData';
import { SHARD_TYPES } from '../../rules/downtimeData';
import { craftDefaultProblem, defaultsFor, gradeName, readyDefaults, type TrainingRun } from '../../rules/training';
import type { Crafting } from './RecipeBook';
import { countable, defaultProgress } from './recipeView';
import { ShardBadge } from './ShardBadge';

export interface DefaultsBookProps {
  run: TrainingRun;
  crafting: Crafting | null;
  onCraft: (c: Crafting | null) => void;
}

/**
 * The default towers (emplacements.ts): fixed Shard sets of exact grades, any number of each, weaker than a unit and
 * never levelled. Ready ones first with a Build button; the rest folded away. Shards on the map glow in their slots.
 */
export function DefaultsBook({ run, crafting, onCraft }: DefaultsBookProps) {
  const ready = new Map(readyDefaults(run).map((r) => [r.key, r.uses]));
  const shards = countable(run);
  const all = defaultsFor(run);
  const row = (d: DefaultRecipeDef) => (
    <DefaultRow key={d.key} run={run} d={d} progress={defaultProgress(d, shards)} uses={ready.get(d.key)}
      active={crafting?.def === d.key} onCraft={onCraft} />
  );
  return (
    <div className="training-defaults">
      <div className="training-panel-title">
        <b>Defences</b> <span className="muted">· exact Shards · {ready.size} ready</span>
      </div>
      {all.filter((d) => ready.has(d.key)).map(row)}
      <details className="training-defaults-fold">
        <summary className="muted">All defences ({all.length})</summary>
        {all.filter((d) => !ready.has(d.key)).map(row)}
      </details>
    </div>
  );
}

function DefaultRow({ run, d, progress, uses, active, onCraft }: {
  run: TrainingRun;
  d: DefaultRecipeDef;
  progress: ReturnType<typeof defaultProgress>;
  uses?: number[];
  active: boolean;
  onCraft: (c: Crafting | null) => void;
}) {
  const met = progress.filter(Boolean).length;
  const why = uses ? craftDefaultProblem(run, d.key, uses, uses[0]) : 'Not all its Shards are on the map.';
  return (
    <div className={`training-recipe${uses ? ' ready' : ''}${active ? ' active' : ''}`}>
      <span className="training-recipe-body">
        <span className="training-recipe-name">{d.name} <span className="muted">· {met}/{d.slots.length}</span></span>
        <span className="training-recipe-slots">
          {d.slots.map(([type, grade], i) => (
            <span key={i} data-tip={`${gradeName(grade as 1)} ${SHARD_TYPES[type].name}, exactly${progress[i] ? ' (on the map)' : ''}`}>
              <ShardBadge type={type} grade={grade as 1} size={18} faded={!progress[i]} glow={!!progress[i]} />
            </span>
          ))}
        </span>
        <span className="training-recipe-need muted">{d.text}</span>
      </span>
      {uses && active && <span className="training-recipe-crafting">Building…</span>}
      {uses && !active && (
        <button className="primary" disabled={!!why} data-tip={why ?? 'Then tap one of its Shards on the map'} onClick={() => onCraft({ def: d.key, uses })}>
          Build
        </button>
      )}
    </div>
  );
}
