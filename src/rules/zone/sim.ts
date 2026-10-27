import { applySelection } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import type { CatalogBook, Unit } from '../../model/types';
import { aiStyleFor } from '../aiTrees';
import type { MissionDef } from '../missions';
import { bookRules, parseSpell, type BookRules } from '../oprRules';
import { aiTurn } from './ai';
import { act, attackNow, autoDeploy, autoJoin, createBattle, startDeploy, type ZSetup, type ZSetupUnit } from './engine';
import { mulberry32, type Rng } from './dice';
import { profileOf } from './profile';
import type { SideIx, ZBattle } from './state';

// Whole battles with the AI on both sides: Quick battles, the forecast, and the balance sims.

/** A battle unit from a force unit: its profile, AI style, and its book's spells if it casts. */
export function setupUnit(u: Unit, src: string, side: SideIx, owner: string, book?: CatalogBook, rules?: BookRules, wounds?: number): ZSetupUnit {
  const br = rules ?? (book ? bookRules([book]) : undefined);
  const p = profileOf(u, src, br, wounds);
  const casts = p.kits.some((k) => k.hooks.some((h) => h.k === 'caster')) || p.shared.some((h) => h.k === 'caster');
  return {
    id: src, side, owner, name: u.name || u.unitType, p, points: u.points, ai: aiStyleFor(u),
    spells: casts && book ? book.spells.map((s) => parseSpell(s, br)).filter((s) => !s.none) : [],
  };
}

/** A random army from a book, up to `points`, as OPR builds them: no unit over 35% of it, 1 hero per 375 pts, 1 + 1 per 750 pts copies of a datasheet. */
export function randomArmy(book: CatalogBook, points: number, rng: Rng, prefix = 'u'): Unit[] {
  const out: Unit[] = [];
  let left = points;
  const heroes = () => out.filter((u) => u.rules.includes('Hero')).length;
  for (let guard = 0; guard < 200 && left > 0; guard++) {
    const fits = book.units.filter((cu) => {
      if (cu.cost > left || cu.cost <= 0 || cu.cost > points * 0.35) return false;
      if (out.filter((u) => u.unitType === cu.name).length >= 1 + Math.floor(points / 750)) return false;
      if (cu.rules.includes('Hero') && heroes() >= Math.max(1, Math.floor(points / 375))) return false;
      return true;
    });
    if (!fits.length) break;
    const cu = fits[Math.floor(rng() * fits.length)];
    const u = unitFromCatalog(cu, applySelection(cu, {}), book);
    out.push({ ...u, id: `${prefix}${out.length}` });
    left -= u.points;
  }
  return out;
}

export interface SimSide { book: CatalogBook; units: Unit[]; team?: string }

/** A battle between two armies, both sides played by the AI. */
export function simSetup(mission: MissionDef, a: SimSide, d: SimSide, seed: number, smart: [boolean, boolean] = [true, true]): ZSetup {
  const sides = [a, d];
  const points = Math.max(...sides.map((s) => s.units.reduce((n, u) => n + u.points, 0)));
  return {
    id: `sim-${seed}`, mission, points, seed, smart,
    members: sides.map((s, i) => ({ id: `s${i}`, name: s.book.name, side: i as SideIx, ai: true, team: (s.team ?? (i ? 'B' : 'A')) as never })),
    teams: ['A', 'B'] as never,
    units: sides.flatMap((s, i) => {
      const br = bookRules([s.book]);
      return s.units.map((u) => setupUnit(u, `${i}:${u.id}`, i as SideIx, `s${i}`, s.book, br));
    }),
  };
}

/** Plays a battle out with the AI on every side it's given (both by default). Returns it, ended unless stopped. */
export function playOut(b: ZBattle, sides: SideIx[] = [0, 1], maxActs = 2000): ZBattle {
  if (b.phase === 'join') {
    for (const s of sides) autoJoin(b, s);
    startDeploy(b);
  }
  if (b.phase === 'deploy' && sides.length === 2) autoDeploy(b, b.turn, true);
  else if (b.phase === 'deploy') autoDeploy(b, sides[0]);
  if (b.pending && sides.includes(b.turn)) attackNow(b);
  for (let n = 0; b.phase === 'battle' && n < maxActs; n++) {
    if (!sides.includes(b.turn)) break;
    const o = aiTurn(b, b.turn);
    if (!o) break;
    act(b, o);
  }
  return b;
}

/** Quick: a whole battle between two armies, start to end. */
export function quickBattle(mission: MissionDef, a: SimSide, d: SimSide, seed: number): ZBattle {
  return playOut(createBattle(simSetup(mission, a, d, seed)));
}

export { mulberry32 };
