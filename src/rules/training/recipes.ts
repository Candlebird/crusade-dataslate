import type { Unit } from '../../model/types';
import { fighter, type Fighter } from '../autoBattle';
import { abilitiesOf } from '../abilities';
import { unitName } from '../battle';
import { hasRule, levelForXp, ruleRating } from '../engine';
import { SHARD_TYPES, SORTIE_QUIRKS, SORTIE_TRINKETS, TRAINING, type ShardType, type SortieTrinket } from '../downtimeData';
import { shardsOnMap } from './board';
import { levelCap } from './economy';
import type { Grade, Recipe, RecipeSlot, ShardPiece, Tile, TowerSkill, TrainingRun, UnitTower } from './types';

// Recipes: every unit in the force gets one, a multiset of Shard types with minimum grades, from its datasheet. And a
// crafted unit's tower stats (autoBattle fighter(), Sortie habits, abilities as skills).

const TYPES = Object.keys(SHARD_TYPES) as ShardType[];

/** Can this unit train? Any active unit can, even one busy on a task: training is only drill. */
export const canTrain = (u: Unit) => u.status === 'active';

/** What a unit's Sortie quirks and trinket do here: to hit shooting/melee, initiative, Jumpy, Short-sighted. */
export function habitsOf(u: Unit): { shoot: number; melee: number; init: number; jumpy: boolean; myopic: boolean } {
  const q = new Set(u.quirks ?? []);
  const k: Partial<SortieTrinket> = (u.trinket && SORTIE_TRINKETS[u.trinket]) || {};
  const n = (id: string) => (q.has(id) ? 1 : 0);
  return {
    shoot: n('eagle') + (k.shoot ?? 0),
    melee: n('brute') - n('clumsy') + (k.melee ?? 0),
    init: n('quick') + (k.init ?? 0),
    jumpy: q.has('jumpy'),
    myopic: q.has('myopic'),
  };
}

/** Quirks that do nothing in Training (morale, wounds). */
const IDLE_QUIRKS = ['steady', 'shaky', 'hardy', 'frail'];

/** The Sortie quirks and trinket a unit brings to Training, by name (only those that do something here). */
export function habitNames(u: Unit): string[] {
  const k = u.trinket ? SORTIE_TRINKETS[u.trinket] : undefined;
  return [
    ...(u.quirks ?? []).filter((id) => SORTIE_QUIRKS[id] && !IDLE_QUIRKS.includes(id)).map((id) => SORTIE_QUIRKS[id].name),
    ...(k && (k.shoot || k.melee || k.init) ? [k.name] : []),
  ];
}

const fighterOf = (u: Unit): Fighter => {
  const size = Math.max(1, u.size);
  const tough = Math.max(1, u.tough || 1);
  return fighter(u, { id: u.id, name: unitName(u), wounds: size * tough, maxWounds: size * tough, points: u.points }, 'train', 'A');
};

const SWIFT_RULES: [string, number][] = [['Fast', 1], ['Very Fast', 2], ['Scout', 1], ['Flying', 2], ['Strider', 1], ['Ambush', 1], ['Agile', 1], ['Aircraft', 2]];

/** A unit's raw fit for each Shard type, straight from its datasheet (before ranking against the force). */
export function rawScores(u: Unit): Record<ShardType, number> {
  const f = fighterOf(u);
  const names = [...u.rules, ...u.upgrades.map((x) => x.name)];
  const has = (n: string) => hasRule(names, n);
  const effects = abilitiesOf(u).flatMap((a) => a.effects);
  const n = (...kinds: string[]) => effects.filter((e) => kinds.includes(e.kind)).length;
  const sum = (fn: (g: Fighter['guns'][number]) => number) => f.guns.reduce((s, g) => s + fn(g), 0);
  return {
    assault: sum((g) => (g.melee ? g.attacks * (1 + g.ap) : 0)) + f.impact,
    firepower: sum((g) => (g.melee ? 0 : g.attacks * g.range)),
    // How hard its best weapon punches, not how many blows it lands (assault and firepower count those).
    breach: Math.max(0, ...f.guns.map((g) => g.ap + Math.max(0, g.deadly - 1) + (g.rending ? 1 : 0))),
    blast: sum((g) => (g.blast > 1 ? g.attacks * g.blast : 0)),
    bulwark: f.tough * Math.max(1, 7 - f.defense + f.defMod),
    swift: SWIFT_RULES.reduce((s, [r, v]) => s + (has(r) ? v : 0), 0) + (u.category === 'Aircraft' && !has('Aircraft') ? 2 : 0),
    command: (f.hero ? 2 : 0) + (ruleRating(names, 'Caster') ?? (has('Caster') ? 1 : 0)) + n('aura') + 0.5 * n('shield'),
    vigor: (has('Regeneration') ? 2 : 0) + (has('Medic') ? 1 : 0) + n('heal', 'leech', 'revive'),
  };
}

/** Rank each raw score against the force's: the share of the force it beats (ties half), plus a sliver of its size
 *  against the best so equal ranks still split. A type it has none of scores 0. */
function ranked(mine: Record<ShardType, number>, all: Record<ShardType, number>[]): Record<ShardType, number> {
  const out = {} as Record<ShardType, number>;
  for (const t of TYPES) {
    const v = mine[t];
    if (v <= 0) { out[t] = 0; continue; }
    const below = all.filter((r) => r[t] < v).length;
    const equal = all.filter((r) => r[t] === v).length;
    const max = Math.max(...all.map((r) => r[t]));
    out[t] = (below + equal / 2) / all.length + 0.05 * (v / max);
  }
  return out;
}

/** Each Shard type's score for a unit, rank-based against the rest of the force (higher fits better). */
export function typeScores(u: Unit, force: Unit[]): Record<ShardType, number> {
  const all = (force.some((x) => x.id === u.id) ? force : [...force, u]).map(rawScores);
  return ranked(rawScores(u), all);
}

/** The recipe tier for a unit's points: how many Shards, the grade range, and how far up the range its points sit. */
function tierOf(points: number): { count: number; lo: Grade; hi: Grade; high: number } {
  const tiers = TRAINING.shards.recipes;
  const i = Math.max(0, tiers.findIndex((r) => points <= r.upTo));
  const from = i ? tiers[i - 1].upTo + 1 : 0;
  const to = Number.isFinite(tiers[i].upTo) ? tiers[i].upTo : from + TRAINING.shards.recipeFit.topSpan;
  const share = Math.max(0, Math.min(1, (points - from) / Math.max(1, to - from)));
  const [lo, hi] = tiers[i].grades as [Grade, Grade];
  return { count: tiers[i].count, lo, hi, high: Math.round(share * tiers[i].count) };
}

/** Every multiset of `k` types (ascending), as lists. */
function typeSets(k: number, from = 0): ShardType[][] {
  if (!k) return [[]];
  const out: ShardType[][] = [];
  for (let i = from; i < TYPES.length; i++) for (const rest of typeSets(k - 1, i)) out.push([TYPES[i], ...rest]);
  return out;
}

/** Every grade vector over these grades for `k` slots. */
function gradeSets(k: number, grades: Grade[]): Grade[][] {
  if (!k) return [[]];
  return gradeSets(k - 1, grades).flatMap((rest) => grades.map((g) => [g, ...rest]));
}

const signature = (slots: RecipeSlot[]) => slots.map((s) => `${s.type}${s.grade}`).sort().join(',');

/** How well a recipe fits a unit's scores and tier (higher is better). */
function fit(slots: RecipeSlot[], score: Record<ShardType, number>, tier: ReturnType<typeof tierOf>): number {
  const { repeat, grade, offTier } = TRAINING.shards.recipeFit;
  const seen: Partial<Record<ShardType, number>> = {};
  let v = 0;
  let high = 0;
  for (const s of slots) {
    const j = (seen[s.type] = (seen[s.type] ?? 0) + 1) - 1;
    v += score[s.type] * repeat ** j;
    if (s.grade >= tier.hi) { high++; v += 0.001 * score[s.type]; }
    v -= offTier * (Math.max(0, tier.lo - s.grade) + Math.max(0, s.grade - tier.hi));
  }
  return v - grade * Math.abs(high - tier.high);
}

/** The best-fitting recipe for these scores and points not already in `taken` (signatures). In-tier grades first;
 *  every grade only if the tier's recipes are all taken. */
function bestRecipe(score: Record<ShardType, number>, points: number, taken: Set<string>): RecipeSlot[] {
  const tier = tierOf(points);
  const sets = typeSets(tier.count);
  const all: Grade[] = [1, 2, 3, 4, 5];
  for (const grades of [[tier.lo, tier.hi], all] as Grade[][]) {
    let best: { slots: RecipeSlot[]; v: number; sig: string } | undefined;
    for (const types of sets) for (const gs of gradeSets(tier.count, [...new Set(grades)])) {
      const slots = types.map((type, i) => ({ type, grade: gs[i] }));
      const sig = signature(slots);
      if (taken.has(sig)) continue;
      const v = fit(slots, score, tier);
      if (!best || v > best.v + 1e-9 || (Math.abs(v - best.v) <= 1e-9 && sig < best.sig)) best = { slots, v, sig };
    }
    if (best) return best.slots.sort((a, b) => score[b.type] - score[a.type] || b.grade - a.grade || a.type.localeCompare(b.type));
  }
  throw new Error('No recipe left.');
}

/** One unique recipe per unit that can train, in the force's order. Deterministic (no dice). */
export function recipesFor(units: Unit[]): Recipe[] {
  const force = units.filter(canTrain);
  const raw = force.map(rawScores);
  const taken = new Set<string>();
  return force.map((u, i) => {
    const slots = bestRecipe(ranked(raw[i], raw), u.points, taken);
    taken.add(signature(slots));
    return { unitId: u.id, name: unitName(u), points: u.points, slots };
  });
}

/** The Shards (ids, one per slot, in slot order) that satisfy a recipe out of these, spending the lowest grades that
 *  do (kept Shards before draft ones at the same grade); null if they can't. */
export function recipeUses(recipe: Recipe, shards: ShardPiece[]): number[] | null {
  const free = [...shards].sort((a, b) => a.grade - b.grade || Number(a.draft) - Number(b.draft) || a.id - b.id);
  const used = new Set<number>();
  const out: number[] = new Array(recipe.slots.length);
  // The dearest slot takes the cheapest Shard that does: whatever fits a dearer slot fits a cheaper one too.
  const order = recipe.slots.map((s, i) => ({ s, i })).sort((a, b) => b.s.grade - a.s.grade);
  for (const { s, i } of order) {
    const p = free.find((x) => !used.has(x.id) && x.type === s.type && x.grade >= s.grade);
    if (!p) return null;
    used.add(p.id);
    out[i] = p.id;
  }
  return out;
}

/** Recipes the run can craft now (not yet crafted), with the Shards each would use: kept ones, and this draft's once
 *  they are all placed (a craft then stands in for the keep). */
export function readyRecipes(run: TrainingRun): { unitId: string; uses: number[] }[] {
  if (run.phase === 'over') return [];
  const shards = shardsOnMap(run, run.draft.step === 'keep');
  return run.recipes.flatMap((r) => {
    if (run.crafted.includes(r.unitId)) return [];
    const uses = recipeUses(r, shards);
    return uses ? [{ unitId: r.unitId, uses }] : [];
  });
}

/** A unit's abilities as skills, one per effect. Penalties are already in its numbers (fighter()); revives and
 *  redeploys do nothing here (crafted units never fall, nor move). */
const skillsOf = (u: Unit): TowerSkill[] =>
  abilitiesOf(u).flatMap((a) => a.effects.filter((e) => !['penalty', 'revive', 'redeploy'].includes(e.kind)).map((effect) => ({
    source: a.source, effect, ...(a.gun ? { gun: a.gun } : {}), cd: 0,
  })));

/** A unit as a crafted tower, standing at `at`. `craftedAt`: run.cleared at the craft. Weapon ranges in inches are
 *  cells. */
export function unitTower(u: Unit, id: number, at: Tile, craftedAt: number): UnitTower {
  const f = fighterOf(u);
  const h = habitsOf(u);
  return {
    kind: 'unit', id, x: at.x, y: at.y, unitId: u.id, name: unitName(u), category: u.category, points: u.points,
    rank: levelForXp(u.xp), tough: f.tough, size: f.size, impact: f.impact, skills: skillsOf(u),
    quality: f.quality, guns: f.guns.map((g) => ({ ...g, cd: 0, pending: 0, gap: 0, next: 0 })),
    hitShoot: f.hitShoot + h.shoot, hitMelee: f.hitMelee + h.melee, atkBonus: f.atkBonus,
    boost: { hit: 0, save: 0, rate: 0, range: 0 }, dmgBoost: { mul: 0, left: 0 }, kills: 0, dealt: 0,
    up: 0, cap: levelCap(u.points), holdLeft: 0, frenzy: 0, frenzyMul: 1, craftedAt, xp: 0,
    init: h.init, jumpy: h.jumpy, myopic: h.myopic,
  };
}
