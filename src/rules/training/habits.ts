import type { Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { quirkInfo } from '../sortie';

// Sortie habits in Training: what each quirk (the one list Sortie uses, SORTIE_QUIRKS / quirkInfo) does to a crafted
// unit's tower.

const H = TRAINING.habits;

/** What a unit's habits add up to: to hit shooting and in melee, initiative, Jumpy, Short-sighted, a share on every
 *  hold, Tough, and to hit on its shots at an Echo in dangerous terrain (region quirks). */
export interface Habits {
  shoot: number;
  melee: number;
  init: number;
  jumpy: boolean;
  myopic: boolean;
  hold: number;
  tough: number;
  terrain: number;
}

const NONE: Habits = { shoot: 0, melee: 0, init: 0, jumpy: false, myopic: false, hold: 0, tough: 0, terrain: 0 };

/** One quirk's effect here (region quirks by their kind: `native:<region>`, `haunted:<region>`). */
export function quirkHabit(id: string): Partial<Habits> {
  const [kind, region] = id.split(':');
  if (region) return { terrain: kind === 'native' ? H.native : H.haunted };
  switch (id) {
    case 'eagle': return { shoot: 1 };
    case 'myopic': return { myopic: true };
    case 'brute': return { melee: 1 };
    case 'clumsy': return { melee: -1 };
    case 'quick': return { init: 1 };
    case 'jumpy': return { jumpy: true };
    case 'steady': return { hold: H.steady };
    case 'shaky': return { hold: H.shaky };
    case 'hardy': return { tough: H.hardy };
    case 'frail': return { tough: H.frail };
    default: return {};
  }
}

const add = (a: Habits, b: Partial<Habits>): Habits => ({
  shoot: a.shoot + (b.shoot ?? 0), melee: a.melee + (b.melee ?? 0), init: a.init + (b.init ?? 0),
  jumpy: a.jumpy || !!b.jumpy, myopic: a.myopic || !!b.myopic, hold: a.hold + (b.hold ?? 0),
  tough: a.tough + (b.tough ?? 0), terrain: a.terrain + (b.terrain ?? 0),
});

/** What a unit's Sortie quirks do here, all together. */
export function habitsOf(u: Pick<Unit, 'quirks'>): Habits {
  let h = NONE;
  for (const id of u.quirks ?? []) if (quirkInfo(id)) h = add(h, quirkHabit(id));
  return h;
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`);

/** An effect in Training words, e.g. "+1 to hit shooting; holds last 10% longer". */
export function habitText(h: Partial<Habits>): string {
  const bits: string[] = [];
  if (h.shoot) bits.push(`${signed(h.shoot)} to hit shooting`);
  if (h.melee) bits.push(`${signed(h.melee)} to hit in melee`);
  if (h.init) bits.push(`attacks ${pct(h.init * H.rate)} ${h.init > 0 ? 'faster' : 'slower'}`);
  if (h.jumpy) bits.push(`attacks at ${pct(H.jumpyMul)} speed for the first ${H.jumpySecs} s of a wave`);
  if (h.myopic) bits.push(`-1 to hit shooting past ${Math.round(H.myopicFrom * 100)}% of its reach`);
  if (h.hold) bits.push(`holds last ${pct(h.hold)} ${h.hold > 0 ? 'longer' : 'less long'}`);
  if (h.tough) bits.push(`${signed(h.tough)} Tough${h.tough < 0 ? ' (never below 1)' : ''}`);
  if (h.terrain) bits.push(`${signed(h.terrain)} to hit shooting at an Echo in dangerous terrain`);
  const s = bits.join('; ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : 'Nothing here.';
}

/** A quirk for the tower card: its name, good or bad, and what it does here. */
export interface HabitBadge {
  name: string;
  good: boolean;
  text: string;
}

/** Every Sortie quirk a unit brings to Training, with what each does here. */
export function habitBadges(u: Pick<Unit, 'quirks'>): HabitBadge[] {
  const out: HabitBadge[] = [];
  for (const id of u.quirks ?? []) {
    const q = quirkInfo(id);
    if (q) out.push({ name: q.name, good: q.good, text: habitText(quirkHabit(id)) });
  }
  return out;
}

/** The Sortie quirks a unit brings to Training, by name. */
export const habitNames = (u: Pick<Unit, 'quirks'>): string[] => habitBadges(u).map((b) => b.name);
