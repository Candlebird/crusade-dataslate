// Raiders: squads from the other armies in the app, met in Sortie and Training as Marauders and ambushers. Every army
// book is written to the same rules, so any of them can take the field; a unit another force fields is named as theirs.

import { applySelection } from '../armyforge/book';
import { unitFromCatalog } from '../model/factory';
import type { CatalogBook, Force, Unit } from '../model/types';
import { ECHOES_BOOK } from './echoForce';
import { unitName } from './battle';

export interface Raider {
  unit: Unit;
  /** The army it comes from. */
  faction: string;
  /** The force that fields it, when it's one of theirs. */
  force?: string;
}

/** "Rifle Squad (Battle Brothers, of the Iron Hand)". */
export const raiderName = (m: Raider) => `${unitName(m.unit)} (${m.faction}${m.force ? `, of ${m.force}` : ''})`;

const isEchoes = (b: { uid?: string; name?: string }) => b.uid === ECHOES_BOOK || b.name === 'Void Echoes';

/**
 * Who might raid `own`: every unit the other forces field, then every datasheet of the imported books (not the Void
 * Echoes', and not the books `own` is built from, unless there's nothing else). Units with no points are left out.
 */
export function raiderPool(books: CatalogBook[], forces: Force[], own?: Force): Raider[] {
  const out: Raider[] = [];
  const seen = new Set<string>();
  const bookName = (u: Unit) => books.find((b) => b.uid === u.bookUid)?.name ?? u.bookName ?? '';
  for (const f of forces) {
    if (f.id === own?.id) continue;
    for (const u of f.units) {
      if (u.status === 'removed' || u.points <= 0 || isEchoes({ uid: u.bookUid, name: u.bookName })) continue;
      out.push({ unit: u, faction: bookName(u) || f.name, force: f.name });
      seen.add(`${u.bookUid ?? u.bookName}|${u.unitType}`);
    }
  }
  const mine = new Set((own?.units ?? []).map((u) => u.bookUid ?? books.find((b) => b.name === u.bookName)?.uid));
  const others = books.filter((b) => !isEchoes(b));
  const pickFrom = others.some((b) => !mine.has(b.uid)) ? others.filter((b) => !mine.has(b.uid)) : others;
  for (const b of pickFrom) {
    for (const cu of b.units) {
      if (cu.cost <= 0 || seen.has(`${b.uid}|${cu.name}`) || seen.has(`${b.name}|${cu.name}`)) continue;
      out.push({ unit: unitFromCatalog(cu, applySelection(cu, {}), b), faction: b.name });
    }
  }
  return out;
}

/** Up to `n` raiders for one run, from as few armies as it takes: a run meets the same raiders more than once. */
export function pickRaiders(pool: Raider[], n: number, r: () => number): Raider[] {
  if (!pool.length) return [];
  const factions = [...new Set(pool.map((m) => m.faction))];
  const take = new Set([factions[Math.floor(r() * factions.length)], factions[Math.floor(r() * factions.length)]]);
  const from = pool.filter((m) => take.has(m.faction));
  // Units another force fields come first: that's the "it's that guy from their army!" moment.
  const theirs = from.filter((m) => m.force);
  const out: Raider[] = [];
  for (let i = 0; i < 40 && out.length < n; i++) {
    const list = theirs.length && r() < 0.6 ? theirs : from;
    const m = list[Math.floor(r() * list.length)];
    if (!out.includes(m)) out.push(m);
  }
  return out.map((m) => ({ ...m, unit: structuredClone(m.unit) }));
}

/**
 * A band of raiders to `budget` points, at most `max` squads, each trimmed model by model to what's left (like the
 * Echoes). If none fits, the cheapest comes alone, one model strong.
 */
export function raidBand(raiders: Raider[], budget: number, max: number, r: () => number): { unit: Unit; raider: Raider }[] {
  const out: { unit: Unit; raider: Raider }[] = [];
  const order = [...raiders].map((m) => ({ m, k: r() })).sort((a, b) => a.k - b.k).map((x) => x.m);
  const trim = (m: Raider, n: number) => {
    const unit = structuredClone(m.unit);
    unit.points = Math.max(1, Math.round((unit.points * n) / Math.max(1, unit.size)));
    unit.size = n;
    out.push({ unit, raider: m });
  };
  let left = budget;
  for (const m of order) {
    if (out.length >= max) break;
    const per = m.unit.points / Math.max(1, m.unit.size);
    const n = Math.min(m.unit.size, Math.floor(left / per));
    if (n < 1) continue;
    trim(m, n);
    left -= per * n;
  }
  if (!out.length && raiders.length) trim([...raiders].sort((a, b) => a.unit.points / a.unit.size - b.unit.points / b.unit.size)[0], 1);
  return out;
}
