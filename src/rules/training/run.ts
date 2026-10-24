import type { ForceSortie, Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { pieceById, unitTowers } from './board';
import { abilities, auras, fireAll, holds, reap, tickEnemies } from './combat';
import { waveCredits } from './economy';
import { canTrain, recipesFor, recipeUses, unitTower } from './recipes';
import { crumbleDraft, drawDraft, toRubble } from './shards';
import { relics, resetSockets } from './relics';
import { affixTick } from './affixes';
import { lordPlan, lordTick } from './lords';
import { nemesisPlan, nemesisTick, pickNemesis } from './nemesis';
import { nexusStart } from './nexus';
import { rollGains, watchBosses } from './quirks';
import { planWave, runCover, spawnDue, walk } from './waves';
import type { RunNexus, ShardPiece, TrainingRun, UnitTower } from './types';

// A run's life: create, build-phase actions, waves, step(), XP, the end.

/** A new run for a force: recipes for every unit that can train, cover, credits, and the first draft drawn ('build').
 *  `story`: the force's Sortie record, for its nemesis (nemesis.ts). `nexus`: its campaign's (nexus.ts nexusOf), which
 *  can change the starting credits, base HP and cover. */
export function createRun(forceId: string, units: Unit[], seed: number, story?: ForceSortie, nexus?: RunNexus): TrainingRun {
  const force = units.filter(canTrain);
  const run: TrainingRun = {
    v: 4, forceId, seed, rng: seed | 0, phase: 'build', wave: 0, cleared: 0, t: 0,
    power: force.reduce((n, u) => n + u.points, 0), baseHp: TRAINING.baseHp, credits: TRAINING.credits.start, luck: 0,
    mends: 0, leaked: 0, nextId: 1, pieces: [], draft: { step: 'done', hand: [], placed: [] }, recipes: recipesFor(force),
    crafted: [], enemies: [], queue: [], cover: [], cards: [], mods: { bounty: 1, holdMul: 1, regrabAdd: 0 }, banked: {},
    fx: [], log: [],
  };
  const nemesis = pickNemesis(story);
  if (nemesis) run.nemesis = nemesis;
  if (nexus) run.nexus = JSON.parse(JSON.stringify(nexus)) as RunNexus;
  const start = nexusStart(run);
  run.credits += start.credits;
  run.baseHp = Math.max(1, run.baseHp + start.baseHp);
  run.cover = runCover(run, start.cover);
  drawDraft(run);
  return run;
}

/** Why the next wave can't start, or null. */
export function startProblem(run: TrainingRun): string | null {
  if (run.phase === 'over') return 'The run is over.';
  if (run.phase !== 'build') return 'A wave is already under way.';
  if (run.offer?.length) return 'Pick a card first.';
  if (run.draft.step !== 'done') return run.draft.step === 'place' ? 'Place the draft first.' : 'Keep a Shard first.';
  return null;
}

/** Start the next wave: its enemies queued, every tower's clocks and boosts reset. Throws on a problem. */
export function startWave(run: TrainingRun): void {
  const why = startProblem(run);
  if (why) throw new Error(why);
  run.wave += 1;
  run.phase = 'wave';
  run.t = 0;
  run.leaked = 0;
  run.queue = lordPlan(run, nemesisPlan(run, planWave(run, run.wave)));
  for (const p of run.pieces) {
    if (p.kind === 'rubble') continue;
    p.guns.forEach((g) => Object.assign(g, { cd: 0, pending: 0, next: 0 }));
    p.dmgBoost = { mul: 0, left: 0 };
    p.rush = undefined;
    if (p.kind === 'unit') {
      p.skills.forEach((s) => { s.cd = 0; });
      Object.assign(p, { frenzy: 0, frenzyMul: 1, holding: undefined, holdLeft: 0, brace: 0 });
      resetSockets(p);
    }
  }
  const flank = run.queue.filter((s) => s.leg > 0).length;
  const vets = run.queue.filter((s) => s.vet).length;
  run.log.push(`Wave ${run.wave}: ${run.queue.length} enemies${flank ? `, ${flank} of them coming in on the pads` : ''}${vets ? `, ${vets} veterans` : ''}.`);
}

/** Advance the run by `dt` seconds (see CONTRACTS.md for the order). */
export function step(run: TrainingRun, dt: number): void {
  run.fx = run.fx.filter((f) => (f.t -= dt) > 0);
  if (run.phase !== 'wave') return;
  run.t += dt;
  spawnDue(run);
  auras(run, dt);
  nemesisTick(run, dt);
  lordTick(run, dt);
  affixTick(run, dt);
  abilities(run, dt);
  relics(run, dt);
  holds(run, dt);
  fireAll(run, dt);
  tickEnemies(run, dt);
  walk(run, dt);
  watchBosses(run);
  reap(run);
  if (run.baseHp <= 0) endRun(run, 'The base falls.');
  else if (!run.queue.length && !run.enemies.length) waveCleared(run);
}

/** The wave is beaten: credits, XP, and back to building with a fresh draft. */
function waveCleared(run: TrainingRun): void {
  run.cleared += 1;
  const pay = waveCredits(run);
  run.credits += pay;
  run.phase = 'build';
  run.t = 0;
  run.log.push(`Wave ${run.wave} cleared${run.leaked ? `, ${run.leaked} got through` : ''}: +${pay} credits.`);
  awardXp(run);
  drawDraft(run);
}

/** A unit's XP cap this run: xpCap, and more with Glory Seekers (nexus.ts). */
export const runXpCap = (run: TrainingRun) => TRAINING.xpCap + nexusStart(run).xp;

/** XP a unit has earned by now: xpPerWave for each xpEvery waves cleared since its craft, up to runXpCap. */
const xpDue = (run: TrainingRun, t: UnitTower) =>
  Math.min(runXpCap(run), Math.floor((run.cleared - t.craftedAt) / TRAINING.xpEvery) * TRAINING.xpPerWave);

function awardXp(run: TrainingRun): void {
  for (const t of unitTowers(run)) {
    const due = xpDue(run, t);
    if (due <= t.xp) continue;
    run.log.push(`${t.name} +${due - t.xp} XP.`);
    t.xp = due;
  }
}

/** Why unit `unitId` can't be crafted from Shards `uses` onto Shard `onId`, or null. */
export function craftProblem(run: TrainingRun, unitId: string, uses: number[], onId: number): string | null {
  if (run.phase !== 'build') return 'Units are crafted between waves.';
  const recipe = run.recipes.find((r) => r.unitId === unitId);
  if (!recipe) return 'That unit has no recipe.';
  if (run.crafted.includes(unitId)) return 'Already crafted this run.';
  if (!uses.includes(onId)) return 'The unit must stand on one of the Shards it uses.';
  if (new Set(uses).size !== uses.length || uses.length !== recipe.slots.length) return 'Those Shards don’t make the recipe.';
  const ps = uses.map((id) => pieceById(run, id));
  if (ps.some((p) => p?.kind !== 'shard')) return 'Only Shards on the map can be used.';
  const shards = ps as ShardPiece[];
  if (shards.some((p) => p.draft) && run.draft.step !== 'keep') return 'Place the whole draft before crafting with it.';
  if (!recipeUses(recipe, shards)) return 'Those Shards don’t make the recipe.';
  return null;
}

/** Craft a unit: it stands where Shard `onId` stood (same piece id); the other used Shards become rubble. A craft
 *  with this draft's pieces stands in for its keep: the rest of the draft crumbles. Throws on a problem. */
export function craft(run: TrainingRun, unit: Unit, uses: number[], onId: number): void {
  const why = craftProblem(run, unit.id, uses, onId);
  if (why) throw new Error(why);
  const used = uses.map((id) => pieceById(run, id) as ShardPiece);
  const on = used.find((p) => p.id === onId)!;
  const t = unitTower(unit, on.id, on, run.cleared);
  run.pieces[run.pieces.indexOf(on)] = t;
  toRubble(run, uses.filter((id) => id !== onId));
  if (used.some((p) => p.draft)) crumbleDraft(run, []);
  run.crafted.push(unit.id);
  run.log.push(`${t.name} joins the defence.`);
}

/** XP earned this run, by unit (only those above 0). */
export const runXp = (run: TrainingRun): Record<string, number> =>
  Object.fromEntries(unitTowers(run).filter((t) => t.xp > 0).map((t) => [t.unitId, t.xp]));

/** XP earned and not yet handed out, by unit; marks it handed out (run.banked). */
export function takeXp(run: TrainingRun): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, xp] of Object.entries(runXp(run))) {
    const n = xp - (run.banked[id] ?? 0);
    if (n <= 0) continue;
    out[id] = n;
    run.banked[id] = xp;
  }
  return out;
}

/** The run's standout crafted unit: most kills, then most damage. */
export const mvp = (run: TrainingRun): UnitTower | undefined =>
  [...unitTowers(run)].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt)[0];

/** The run's score: waves cleared (force.trainingBest, feats). */
export const score = (run: TrainingRun): number => run.cleared;

/** End the run: phase 'over', queue emptied, a line in the log. */
export function endRun(run: TrainingRun, why: string): void {
  if (run.phase === 'over') return;
  run.phase = 'over';
  run.queue = [];
  run.offer = undefined;
  run.log.push(`${why} Waves cleared: ${run.cleared}.`);
  rollGains(run);
}

/** Give up the run where it stands. */
export function quitRun(run: TrainingRun): void {
  endRun(run, 'Training called off.');
}
