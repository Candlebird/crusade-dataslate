import type { Unit } from '../../model/types';
import { SORTIE_TRINKETS, TRAINING, type SortieTrinket } from '../downtimeData';
import { quirkInfo, trinketInfo } from '../sortie';
import type { UnitTower } from './types';

// Sortie habits in Training: what each quirk (the one list Sortie uses, SORTIE_QUIRKS / quirkInfo) and each trinket
// does to a crafted unit's tower. Towers are never attacked, so morale and Defense become hold time, wounds Tough.

const H = TRAINING.habits;

/** What a unit's habits add up to: to hit shooting and in melee, initiative, Jumpy, Short-sighted, a share on every
 *  hold, Tough, and a change to the cover penalty on its shots (−1: none, +1: twice). */
export interface Habits {
  shoot: number;
  melee: number;
  init: number;
  jumpy: boolean;
  myopic: boolean;
  hold: number;
  tough: number;
  cover: number;
}

const NONE: Habits = { shoot: 0, melee: 0, init: 0, jumpy: false, myopic: false, hold: 0, tough: 0, cover: 0 };

/** One quirk's effect here (region quirks by their kind: `native:<region>`, `haunted:<region>`). */
export function quirkHabit(id: string): Partial<Habits> {
  const [kind, region] = id.split(':');
  if (region) return { cover: (kind === 'native' ? H.native : H.haunted) - 1 };
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

/** Away from nothing: 0.5 → 1, −0.5 → −1. */
const away = (x: number) => Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9);

/** A trinket's effect here: hitting and initiative as they are; Defense, morale and stress as hold time; wounds as Tough. */
export function trinketHabit(k: SortieTrinket): Partial<Habits> {
  const T = H.trinket;
  const hold = (k.def ?? 0) * T.def + (k.morale ?? 0) * T.morale + (k.stress !== undefined ? (1 - k.stress) * T.stress : 0);
  return {
    ...(k.shoot ? { shoot: k.shoot } : {}), ...(k.melee ? { melee: k.melee } : {}), ...(k.init ? { init: k.init } : {}),
    ...(Math.abs(hold) > 1e-9 ? { hold: Math.round(hold * 100) / 100 } : {}), ...(k.hp ? { tough: away(k.hp * T.hp) } : {}),
  };
}

const add = (a: Habits, b: Partial<Habits>): Habits => ({
  shoot: a.shoot + (b.shoot ?? 0), melee: a.melee + (b.melee ?? 0), init: a.init + (b.init ?? 0),
  jumpy: a.jumpy || !!b.jumpy, myopic: a.myopic || !!b.myopic, hold: a.hold + (b.hold ?? 0),
  tough: a.tough + (b.tough ?? 0), cover: a.cover + (b.cover ?? 0),
});

/** What a unit's Sortie quirks and trinket do here, all together. */
export function habitsOf(u: Pick<Unit, 'quirks' | 'trinket'>): Habits {
  let h = NONE;
  for (const id of u.quirks ?? []) if (quirkInfo(id)) h = add(h, quirkHabit(id));
  const k = u.trinket ? SORTIE_TRINKETS[u.trinket] : undefined;
  return k ? add(h, trinketHabit(k)) : h;
}

/** The cover penalty on a unit's shots, as a multiple (0: it ignores cover). */
export const coverMulOf = (h: Habits) => Math.max(0, 1 + h.cover);

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
  if (h.cover) {
    const m = Math.max(0, 1 + h.cover);
    bits.push(m === 0 ? 'its shots ignore cover' : `cover is ${m}× the penalty against its shots`);
  }
  const s = bits.join('; ');
  return s ? `${s[0].toUpperCase()}${s.slice(1)}.` : 'Nothing here.';
}

/** A quirk or trinket for the tower card: its name, good or bad, and what it does here. */
export interface HabitBadge {
  name: string;
  kind: 'quirk' | 'trinket';
  good: boolean;
  text: string;
}

/** Every Sortie quirk and the trinket a unit brings to Training, with what each does here. */
export function habitBadges(u: Pick<Unit, 'quirks' | 'trinket'>): HabitBadge[] {
  const out: HabitBadge[] = [];
  for (const id of u.quirks ?? []) {
    const q = quirkInfo(id);
    if (q) out.push({ name: q.name, kind: 'quirk', good: q.good, text: habitText(quirkHabit(id)) });
  }
  const k = u.trinket ? trinketInfo(u.trinket) : undefined;
  if (k) out.push({ name: k.name, kind: 'trinket', good: true, text: habitText(trinketHabit(k)) });
  return out;
}

/** The Sortie quirks and trinket a unit brings to Training, by name. */
export const habitNames = (u: Pick<Unit, 'quirks' | 'trinket'>): string[] => habitBadges(u).map((b) => b.name);

/** A trinket taken mid-run goes to work on the tower at once. */
export function applyTrinket(t: UnitTower, id: string): void {
  const k = SORTIE_TRINKETS[id];
  if (!k) return;
  const h = trinketHabit(k);
  t.trinket = id;
  t.hitShoot += h.shoot ?? 0;
  t.hitMelee += h.melee ?? 0;
  t.init += h.init ?? 0;
  t.tough = Math.max(1, t.tough + (h.tough ?? 0));
  if (h.hold) t.grit = Math.max(TRAINING.veterans.minHold, (t.grit ?? 1) + h.hold);
}
