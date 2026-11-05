// How an auto-firing gun shoots, shared by Training (training/combat.ts) and Warpath (warpath/): the volley clock and the
// OPR roll maths. Each mode brings its own targets, damage multipliers and fx; this is only the method.

/** A gun's volley clock: cooldown to the next volley, shots still to go in it, the gap between them and the time to the next. */
export interface VolleyClock {
  cd: number;
  pending: number;
  gap: number;
  next: number;
  melee: boolean;
  /** Attacks a volley (a fraction is a chance of one more). */
  attacks: number;
}

/** Seconds between volleys (shooting, melee) at rate 1, and the share of that wait a volley's shots spread over. */
export interface VolleyPace { shootEvery: number; meleeEvery: number; volleySpread: number }

/** Attacks in a volley: whole ones, and a fraction as a chance of one more (Shards have half attacks). */
export function volleySize(roll: () => number, attacks: number): number {
  const whole = Math.floor(attacks);
  return whole + (attacks > whole && roll() < attacks - whole ? 1 : 0);
}

/**
 * One gun's clocks: start a volley when it's ready and `ready()` (something is in reach); its shots go one after another
 * over the first part of the wait before the next. The wait carries what this step overshot (never more than a step), so
 * a quick gun keeps its rate between fixed steps. `fire()` false (nothing left to aim at) ends the volley.
 */
export function runVolley(g: VolleyClock, rate: number, dt: number, pace: VolleyPace, roll: () => number, ready: () => boolean, fire: () => boolean): void {
  g.cd -= dt;
  if (g.cd <= 1e-9 && g.pending <= 0 && ready()) {
    const wait = (g.melee ? pace.meleeEvery : pace.shootEvery) / rate;
    g.cd = Math.max(g.cd, -dt) + wait;
    g.pending = volleySize(roll, g.attacks);
    g.gap = g.pending ? (wait * pace.volleySpread) / g.pending : 0;
    g.next = 0;
  }
  if (g.pending <= 0) return;
  g.next -= dt;
  while (g.pending > 0 && g.next <= 0) {
    g.pending -= 1;
    g.next += g.gap;
    if (!fire()) g.pending = 0;
  }
}

/** One roll to hit, read OPR-style: a miss, a 6 (r < 1/6), and whether Rending (or a rend skill) makes it AP 4 and armour-piercing. */
export interface ShotRoll { miss: boolean; six: boolean; rend: boolean; ap: number }

/** Read roll `r` (0–1) against hit chance `p` for a gun with `ap` and `rending`; `rendSkill`: a skill rends on a 6 too. */
export function readShot(r: number, p: number, ap: number, rending: boolean, rendSkill = false): ShotRoll {
  const miss = r >= p;
  const six = !miss && r < 1 / 6;
  const rend = six && (rending || rendSkill);
  return { miss, six, rend, ap: rend ? Math.max(ap, 4) : ap };
}

/** A hit's raw damage: Deadly(X) (at least 1) plus whatever adds to it. */
export const rawDamage = (deadly: number, extra = 0) => Math.max(1, deadly) + extra;

/** Damage through armour: at least half a point, and a rending hit ignores armour. */
export const throughArmour = (raw: number, armour: number, rend: boolean) => Math.max(0.5, raw - (rend ? 0 : armour));
