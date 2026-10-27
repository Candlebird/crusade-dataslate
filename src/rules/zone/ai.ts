import { dist, SQUARE, zoneOf } from './board';
import { canShoot, gunRange, has, mainKit, rulesOf, woundsLeft } from './combat';
import { average, resume } from './dice';
import { actions, arriveSquares, castable, chargeTargets, moves, ready, type Order } from './engine';
import { alive, toughOf } from './profile';
import { onTable, type SideIx, type ZBattle, type ZUnit } from './state';

// The AI: the group's decision trees (aiTrees.ts) give each order — charge, advance and shoot, rush to a marker —
// and where a tree leaves room it picks well: which unit goes next, which enemy, which square.

const pHit = (q: number) => (7 - Math.max(2, Math.min(6, q))) / 6;
const pWound = (def: number, ap: number) => 1 - (7 - Math.max(2, Math.min(6, def + ap))) / 6;

/** Wounds a unit's guns (or melee weapons) would deal a target, on average, from a square. */
export function expected(b: ZBattle, u: ZUnit, t: ZUnit, kind: 'shoot' | 'melee', from = u.sq): number {
  let w = 0;
  const def = mainKit(t).defense + (kind === 'shoot' && b.board.terrain[t.sq]?.cover ? 1 : 0);
  for (const m of alive(u.p)) for (const gi of m.guns) {
    const g = u.p.guns[gi];
    if (kind === 'melee' ? g.range !== 0 : g.range === 0) continue;
    if (kind === 'shoot' && !canShoot({ b }, u, m, gi, t, from)) continue;
    const kit = u.p.kits[m.kit];
    const hit = g.hooks.reduce((s, h) => (h.k === 'hit' && !h.c ? s + h.n : s), 0);
    const ap = g.hooks.reduce((s, h) => (h.k === 'ap' && !h.c ? s + h.n : s), 0);
    const blast = Math.min(alive(t.p).length, Math.max(1, ...g.hooks.map((h) => (h.k === 'blast' ? h.n : 1))));
    const deadly = Math.min(toughOf(t.p), Math.max(1, ...g.hooks.map((h) => (h.k === 'deadly' ? h.n : 1))));
    w += average(g.attacks) * pHit(kit.quality - hit) * pWound(def, ap) * blast * deadly;
  }
  return w;
}

/** What wounding a unit is worth: its points per wound, more if it would fall. */
const worth = (t: ZUnit, wounds: number) => {
  const left = Math.max(1, woundsLeft(t));
  const per = t.points / Math.max(1, t.startWounds);
  return Math.min(wounds, left) * per * (wounds >= left ? 1.5 : 1) + (b0(t) ? 20 : 0);
};
const b0 = (t: ZUnit) => t.p.kits.some((k) => k.hero);

/** The best enemy for this unit to shoot from a square, and the value of it. */
export function bestShot(b: ZBattle, u: ZUnit, from = u.sq, smart = true): { t?: ZUnit; v: number } {
  const enemies = onTable(b).filter((x) => x.side !== u.side);
  if (!smart) {
    const t = enemies.filter((e) => expected(b, u, e, 'shoot', from) > 0).sort((x, y) => dist(b.board, from, x.sq) - dist(b.board, from, y.sq))[0];
    return { t, v: t ? 1 : 0 };
  }
  let best: { t?: ZUnit; v: number } = { v: 0 };
  for (const t of enemies) {
    const v = worth(t, expected(b, u, t, 'shoot', from));
    if (v > best.v) best = { t, v };
  }
  return best;
}

/** The value of charging a target: what it deals, less what comes back. */
function chargeValue(b: ZBattle, u: ZUnit, t: ZUnit): number {
  const dealt = expected(b, u, t, 'melee') + impactGuess(u);
  const back = t.shaken ? expected(b, t, u, 'melee') / 3 : expected(b, t, u, 'melee');
  return worth(t, dealt) - worth(u, back) * 0.6 + (dealt > back ? 6 : 0);
}
const impactGuess = (u: ZUnit) => alive(u.p).reduce((s, m) => s + u.p.kits[m.kit].hooks.reduce((n, h) => (h.k === 'impact' ? n + h.n : n), 0), 0) * 0.5;

/** Markers the side doesn't hold yet. */
const wanted = (b: ZBattle, side: SideIx) => b.board.objectives
  .map((o, i) => ({ sq: o.sq, i, owner: o.owner }))
  .filter((o) => !b.gone[o.i] && b.control[o.i] !== side && o.owner !== side && !(b.carried[o.i] && onTable(b).some((u) => u.id === b.carried[o.i] && u.side === side)));

const nearestSq = (b: ZBattle, from: number, squares: number[]) => squares.sort((x, y) => dist(b.board, from, x) - dist(b.board, from, y))[0];

/** A square to move to on the way to `goal`, picked well: closer, in cover for shooters, room in the zone. */
function stepTo(b: ZBattle, u: ZUnit, action: 'advance' | 'rush', goal: number, smart: boolean): number {
  const opts = moves(b, u, action);
  let best = u.sq, bestV = -Infinity;
  for (const [sq] of opts) {
    let v = -dist(b.board, sq, goal) * 10;
    if (smart) {
      if (b.board.terrain[sq]?.cover) v += u.ai === 'melee' ? 1 : 3;
      if (b.board.terrain[sq]?.dangerous && !has(rulesOf(b, u), 'flying')) v -= 4;
      if (action === 'advance' && u.ai !== 'melee') v += bestShot(b, u, sq).v * 0.3;
    }
    if (v > bestV || (v === bestV && sq < best)) { best = sq; bestV = v; }
  }
  return best;
}

/** Holding a marker: a unit in a marker's zone that it's needed to keep stays and shoots. */
function guarding(b: ZBattle, u: ZUnit): boolean {
  const z = zoneOf(b.board, u.sq);
  return b.board.objectives.some((o, i) => !b.gone[i] && zoneOf(b.board, o.sq) === z && (b.control[i] === u.side || b.control[i] === 'x' || o.owner === u.side)
    && onTable(b).filter((x) => x.side === u.side && zoneOf(b.board, x.sq) === z && !x.shaken).length <= 1);
}

/** The order the unit's decision tree gives, with the AI's picks filled in. */
export function orderFor(b: ZBattle, u: ZUnit, smart = true): Order {
  const can = actions(b, u);
  if (can.includes('arrive')) {
    const squares = arriveSquares(b, u);
    const goals = wanted(b, u.side).map((o) => o.sq);
    const target = goals.length ? goals : onTable(b).filter((x) => x.side !== u.side).map((x) => x.sq);
    const to = smart && target.length ? squares.sort((x, y) => Math.min(...target.map((t) => dist(b.board, x, t))) - Math.min(...target.map((t) => dist(b.board, y, t))))[0] : squares[0];
    return { unit: u.id, action: 'arrive', to };
  }
  if (can.includes('idle') || !can.length) return { unit: u.id, action: 'idle' };
  const spell = pickSpell(b, u);
  const base = { unit: u.id, ...(spell ? { spell } : {}) };
  const charges = can.includes('charge') ? chargeTargets(b, u) : [];
  const pickCharge = () => {
    if (!charges.length) return undefined;
    if (!smart) return charges.sort((x, y) => dist(b.board, u.sq, x.target.sq) - dist(b.board, u.sq, y.target.sq))[0];
    const scored = charges.map((c) => ({ c, v: chargeValue(b, u, c.target) })).sort((x, y) => y.v - x.v);
    return scored[0].v > (u.ai === 'melee' ? -15 : 0) ? scored[0].c : undefined;
  };
  const enemies = onTable(b).filter((x) => x.side !== u.side);
  const nearestEnemy = enemies.sort((x, y) => dist(b.board, u.sq, x.sq) - dist(b.board, u.sq, y.sq))[0];
  const goals = wanted(b, u.side);
  const goal = goals.length ? nearestSq(b, u.sq, goals.map((o) => o.sq)) : undefined;
  const advShot = (to: number) => bestShot(b, u, to, smart);
  const charge = (c: { target: ZUnit }) => ({ ...base, action: 'charge' as const, target: c.target.id });
  const advance = (towards: number) => {
    const to = can.includes('advance') ? stepTo(b, u, 'advance', towards, smart) : u.sq;
    return { ...base, action: (to === u.sq ? 'hold' : 'advance') as 'hold' | 'advance', to, target: advShot(to).t?.id };
  };
  const rush = (towards: number) => (can.includes('rush') ? { ...base, action: 'rush' as const, to: stepTo(b, u, 'rush', towards, smart) } : advance(towards));
  const hold = () => ({ ...base, action: 'hold' as const, target: advShot(u.sq).t?.id });

  // A unit keeping a marker it alone holds stays on it (and shoots, or charges what's in reach).
  if (smart && u.sq >= 0 && guarding(b, u)) {
    const c = pickCharge();
    if (c && zoneOf(b.board, c.target.sq) === zoneOf(b.board, u.sq)) return charge(c);
    const inZone = moves(b, u, 'advance');
    const z = zoneOf(b.board, u.sq);
    const stay = [...inZone.keys()].filter((sq) => zoneOf(b.board, sq) === z);
    const best = stay.sort((x, y) => advShot(y).v - advShot(x).v)[0] ?? u.sq;
    return best !== u.sq && advShot(best).v > advShot(u.sq).v ? { ...base, action: 'advance', to: best, target: advShot(best).t?.id } : hold();
  }

  const canShootFrom = (sq: number) => !!advShot(sq).t;
  const advanceSquares = can.includes('advance') ? [...moves(b, u, 'advance').keys()] : [u.sq];
  const shootAfterAdvance = advanceSquares.some(canShootFrom);

  if (u.ai === 'melee') {
    const c = pickCharge();
    if (goal !== undefined) {
      const inWay = enemies.some((e) => dist(b.board, e.sq, goal) <= dist(b.board, u.sq, goal) && dist(b.board, u.sq, e.sq) <= 2);
      if (inWay && c) return charge(c);
      return rush(goal);
    }
    if (c) return charge(c);
    return nearestEnemy ? rush(nearestEnemy.sq) : hold();
  }
  if (u.ai === 'shooting') {
    const towards = goal ?? nearestEnemy?.sq ?? u.sq;
    if (shootAfterAdvance) {
      // Advance toward the marker if a shot is still there, else to the best firing square.
      const to = can.includes('advance') ? stepTo(b, u, 'advance', towards, smart) : u.sq;
      if (canShootFrom(to)) return { ...base, action: to === u.sq ? 'hold' : 'advance', to, target: advShot(to).t?.id };
      const firing = advanceSquares.filter(canShootFrom).sort((x, y) => advShot(y).v - advShot(x).v)[0];
      return { ...base, action: firing === u.sq ? 'hold' : 'advance', to: firing, target: advShot(firing).t?.id };
    }
    return nearestEnemy ? rush(nearestEnemy.sq) : hold();
  }
  // Hybrid.
  if (goal !== undefined) {
    const inWay = enemies.some((e) => dist(b.board, e.sq, goal) <= dist(b.board, u.sq, goal) && dist(b.board, u.sq, e.sq) <= 2);
    if (inWay) {
      const c = pickCharge();
      if (c) return charge(c);
      if (shootAfterAdvance) return advance(goal);
      return rush(goal);
    }
    const d = dist(b.board, u.sq, goal);
    const s = { adv: moves(b, u, 'advance'), rush: moves(b, u, 'rush') };
    const inAdv = [...s.adv.keys()].some((sq) => zoneOf(b.board, sq) === zoneOf(b.board, goal));
    const inRush = [...s.rush.keys()].some((sq) => zoneOf(b.board, sq) === zoneOf(b.board, goal));
    if (inRush && !inAdv && d > 0) return rush(goal);
    if (shootAfterAdvance) return advance(goal);
  }
  const c = pickCharge();
  if (c) return charge(c);
  if (nearestEnemy) {
    const to = can.includes('advance') ? stepTo(b, u, 'advance', nearestEnemy.sq, smart) : u.sq;
    if (canShootFrom(to)) return { ...base, action: to === u.sq ? 'hold' : 'advance', to, target: advShot(to).t?.id };
    return rush(nearestEnemy.sq);
  }
  return hold();
}

/** A spell worth casting now: damage on the best target, or a gift for the strongest friend. */
function pickSpell(b: ZBattle, u: ZUnit): Order['spell'] {
  const opts = castable(b, u);
  let best: { name: string; targets: string[]; v: number } | undefined;
  for (const { spell, targets } of opts) {
    const ts = [...targets].sort((x, y) => (spell.side === 'enemy' ? y.points - x.points : Number(x.activated) - Number(y.activated) || y.points - x.points)).slice(0, spell.targets);
    const v = spell.hits ? ts.reduce((s, t) => s + worth(t, average(spell.hits!.n) * pWound(mainKit(t).defense, spell.hits!.ap)), 0) : spell.threshold * 3;
    if (!best || v / spell.threshold > best.v) best = { name: spell.name, targets: ts.map((t) => t.id), v: v / spell.threshold };
  }
  // Keep a token back for stopping enemy spells when there's little to gain.
  return best && best.v > 1 ? { name: best.name, targets: best.targets } : undefined;
}

/** Which unit the AI activates next, and its order: the one with the most to gain now (or a random one, trees only). */
export function aiTurn(b: ZBattle, side: SideIx, smart = b.smart[side]): Order | undefined {
  const units = ready(b, side);
  if (!units.length) return undefined;
  if (!smart) {
    const r = resume(b.rng);
    const u = units[Math.floor(r() * units.length)];
    return orderFor(b, u, false);
  }
  let best: { o: Order; v: number } | undefined;
  for (const u of units) {
    const o = orderFor(b, u, true);
    let v = 0;
    const t = o.target ? onTable(b).find((x) => x.id === o.target) : undefined;
    if (o.action === 'charge' && t) v = chargeValue(b, u, t) + 5;
    else if ((o.action === 'hold' || o.action === 'advance') && t) v = worth(t, expected(b, u, t, 'shoot', o.to ?? u.sq));
    else if (o.action === 'rush') v = 2;
    // Units under threat of a charge, and shaken ones, go early; heroes and big guns a little later.
    if (o.action === 'idle') v = 1;
    if (o.action === 'arrive') v = 3;
    if (!best || v > best.v) best = { o, v };
  }
  return best?.o;
}

/** Reach in squares for a gun, for the unit card. */
export const reachOf = (b: ZBattle, u: ZUnit, gi: number) => {
  const m = alive(u.p).find((x) => x.guns.includes(gi));
  return m ? Math.floor((gunRange({ b }, u, m, gi) + 2) / SQUARE) : 0;
};


