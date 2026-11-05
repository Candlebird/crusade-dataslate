import { applySelection } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import type { CatalogBook, Unit } from '../../model/types';
import { abilitiesOf, effectsOf, type Effect } from '../abilities';
import { fighter, type Gun } from '../autoBattle';
import { unitName } from '../battle';
import { hasRule, ruleRating } from '../engine';
import { WARPATH } from './data';
import type { EnemyKind, Squad, SquadKind, WGun } from './types';

// Who fights: the force's units as Warpath squads (the hero first), and the week's theme book as enemy datasheets.

const W = WARPATH;

/** Rules the numbers already carry (stats, movement, what kind of body it is), so they're never "unmapped". */
const HANDLED = [
  'tough', 'hero', 'fast', 'very fast', 'slow', 'aircraft', 'immobile', 'fortification', 'flying', 'strider', 'scout',
  'ambush', 'agile', 'fearless', 'caster', 'resilient', 'regeneration', 'protected', 'fortified', 'stealth', 'evasive',
  'impact', 'transport', 'relentless', 'furious', 'indirect', 'sniper', 'reliable', 'rending', 'blast', 'deadly', 'ap',
  'artillery', 'devout', 'battleborn',
];
const handled = (r: string) => HANDLED.includes(r.replace(/\s*\(.*\)$/, '').trim().toLowerCase());

/** A unit's Advance in inches (Fast +2, Very Fast +4, Slow −2). */
export function advanceOf(rules: string[]): number {
  if (hasRule(rules, 'Very Fast')) return 10;
  if (hasRule(rules, 'Fast') || hasRule(rules, 'Flying')) return 8;
  if (hasRule(rules, 'Slow')) return 4;
  return 6;
}

/** How a unit moves in Warpath. */
export function kindOf(u: Unit, hero: boolean): SquadKind {
  if (hero) return 'hero';
  if (hasRule(u.rules, 'Aircraft') || u.category === 'Aircraft') return 'air';
  if (hasRule(u.rules, 'Immobile') || u.category === 'Fortification') return 'fort';
  const ranged = u.weapons.filter((w) => w.range > 0);
  if (ranged.some((w) => hasRule(w.rules, 'Indirect')) || (ranged.length && ranged.every((w) => w.range >= 36) && !u.weapons.some((w) => !w.range && Number(w.attacks) > 1))) return 'artillery';
  if (u.category === 'Vehicle/Monster' || (u.tough || 1) >= 6) return 'heavy';
  return 'foot';
}

/** A gun's reach on the field: listed range × rangeMul, clamped; melee: how far models sally (half their charge). */
export const gunReach = (range: number, advance: number) =>
  range > 0 ? Math.max(W.minReach, Math.min(W.maxReach, range * W.rangeMul)) : Math.max(W.follow.sallyMin, advance * 2 * W.follow.sallyMul);

function wgun(g: Gun, u: Unit, advance: number, hitShoot: number, hitMelee: number): WGun {
  const w = u.weapons.find((x) => x.name === g.name);
  const rules = [...(w?.rules ?? []), ...(w?.traits ?? []).map((t) => t.name)];
  return {
    name: g.name, melee: g.melee, reach: gunReach(g.range, advance), attacks: g.attacks, ap: g.ap,
    hitMod: g.hitMod + (g.melee ? hitMelee : hitShoot), blast: g.blast, deadly: g.deadly, rending: g.rending, reliable: g.reliable,
    indirect: hasRule(rules, 'Indirect'), sniper: g.name.includes('Sniper') || hasRule(rules, 'Sniper'),
    cd: 0, pending: 0, gap: 0, next: 0,
  };
}

const TIMED: Effect['kind'][] = ['heal', 'shield', 'barrage', 'frenzy'];

/** Most levels a unit reaches: 5, +1 a trait, −1 a scar (at least 1). */
export const maxLevelOf = (u: Unit) => Math.max(1, W.levels.max + u.upgrades.length - u.scars.length);

/** A unit as a Warpath squad, at the hero's side (not yet placed). */
export function squadOf(u: Unit, hero = false): Squad {
  const size = Math.max(1, u.size);
  const tough = Math.max(1, u.tough || 1);
  const f = fighter(u, { id: u.id, name: unitName(u), wounds: size * tough, maxWounds: size * tough, points: u.points }, 'warpath', 'A');
  const advance = advanceOf(u.rules);
  const abilities = abilitiesOf(u).filter((a) => !a.effects.some((e) => e.kind === 'revive' || e.kind === 'redeploy'));
  const skills: Effect[] = [];
  const timed: Squad['timed'] = [];
  for (const a of abilities) {
    for (const e of a.effects) {
      if (TIMED.includes(e.kind)) timed.push({ source: a.source, effect: e, cd: 'every' in e ? e.every * WARPATH.ability.round * 0.5 : 0 });
      else skills.push(e);
    }
  }
  // Rules with no Warpath effect at all: a generic one by category (a little faster), listed for review.
  const guessed = [...u.rules, ...u.upgrades.map((x) => x.name)].filter((r) => !handled(r) && !effectsOf(r, true));
  const caster = ruleRating(u.rules, 'Caster') ?? 0;
  return {
    unitId: u.id, name: unitName(u), kind: kindOf(u, hero), points: u.points, quality: u.quality, defense: u.defense + Math.round(f.defMod),
    tough, size, alive: size, wounds: 0, regen: W.losses.regen, level: 0, maxLevel: maxLevelOf(u),
    guns: f.guns.map((g) => wgun(g, u, advance, f.hitShoot, f.hitMelee)),
    skills, timed: timed.filter((t) => !(caster && t.source.toLowerCase().startsWith('caster'))), caster, castCd: caster ? W.caster.every / caster / 2 : 0,
    relics: u.relics.map((r) => ({ name: r.name, tier: r.tier, cd: W.relics[r.tier] / 2 })),
    x: 0, y: 0, advance, frenzy: 1, frenzyLeft: 0, angle: 0, dealt: 0, kills: 0, guessed,
  };
}

/** Points a unit takes on the field (a fortification's surcharge counted). */
export const fieldPoints = (u: Unit) =>
  Math.round(u.points * (kindOf(u, false) === 'fort' ? W.fort.surcharge : 1));

/** Icons by body. */
const ENEMY_ICONS = { hero: 'g:crowned-skull', infantry: 'g:alien-stare', elite: 'g:daemon-skull', big: 'g:spiked-dragon-head', air: 'g:bat-wing', beast: 'g:wolf-head' };

/** One model of each datasheet in the book (bare loadout), tiered by points a model into thirds. */
export function enemyKindsOf(book: CatalogBook): EnemyKind[] {
  const kinds: EnemyKind[] = [];
  for (const cu of book.units) {
    const lo = applySelection(cu, {});
    if (lo.cost <= 0) continue;
    const u = unitFromCatalog(cu, lo, book);
    const size = Math.max(1, u.size);
    const tough = Math.max(1, u.tough || 1);
    const f = fighter(u, { id: u.id, name: cu.name, wounds: size * tough, maxWounds: size * tough }, 'echo', 'B');
    const melee = f.guns.filter((g) => g.melee);
    const ranged = f.guns.filter((g) => !g.melee && g.range >= 12).sort((a, b) => b.attacks * b.deadly - a.attacks * a.deadly)[0];
    const hero = hasRule(u.rules, 'Hero');
    const air = hasRule(u.rules, 'Aircraft') || hasRule(u.rules, 'Flying');
    const big = tough >= 3;
    if (hasRule(u.rules, 'Immobile')) continue;
    kinds.push({
      key: cu.id, name: cu.name,
      icon: hero ? ENEMY_ICONS.hero : air ? ENEMY_ICONS.air : big ? ENEMY_ICONS.big : u.category === 'Elite' ? ENEMY_ICONS.elite : hasRule(u.rules, 'Fast') ? ENEMY_ICONS.beast : ENEMY_ICONS.infantry,
      quality: u.quality, defense: u.defense + Math.round(f.defMod), hp: tough * W.enemy.hpPerTough,
      speed: advanceOf(u.rules) * W.enemy.speedPer, points: lo.cost / size, tier: 0, pack: hero ? 1 : Math.min(10, size),
      melee: {
        attacks: Math.max(1, melee.reduce((n, g) => n + g.attacks, 0) / size), ap: Math.max(0, ...melee.map((g) => g.ap)), deadly: Math.max(1, ...melee.map((g) => g.deadly)),
      },
      ...(ranged ? { gun: { reach: gunReach(ranged.range, 6), attacks: Math.max(1, ranged.attacks / size), ap: ranged.ap, deadly: Math.max(1, ranged.deadly), blast: ranged.blast > 1 } } : {}),
      size: Math.min(3, 1.1 * (1 + 0.3 * Math.log2(tough))) * (hero ? 1.2 : 1), hero,
    });
  }
  const sorted = [...kinds].sort((a, b) => a.points - b.points);
  sorted.forEach((k, i) => { k.tier = Math.min(2, Math.floor((i * 3) / Math.max(1, sorted.length))); });
  return kinds;
}
