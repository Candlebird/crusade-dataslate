import { readFileSync } from 'node:fs';
import type { CatalogBook, Relic, Unit } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';
import { LEVEL_THRESHOLDS } from '../data';

// Test-only: the sample forces the balance tests play (two a book, about 750 pts each). Never imported by the app.

const BOOKS = ['armies/void-echoes.gf.json', 'armies/shadow-stalkers.aof.json', 'src/data/spears-of-dothea.raw.json'];
/** A sample force's points: about this many, never more than `MAX`. */
const AIM = 750;
const MAX = 850;

export const bookUnits = (file: string): Unit[] => {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  // A book copied out of the app (*.app.json) is already in catalog shape.
  const book: CatalogBook = file.endsWith('.app.json') ? raw : normalizeBook(raw);
  return book.units.map((cu) => unitFromCatalog(cu, applySelection(cu, {}), book));
};

/** A ~800 pt force from a book: units in the given order while they fit, until AIM is reached. */
function sample(units: Unit[]): Unit[] {
  const out: Unit[] = [];
  let pts = 0;
  for (const u of units) {
    if (pts >= AIM) break;
    if (pts + u.points > MAX) continue;
    out.push({ ...u, id: `${u.id}-${out.length}` });
    pts += u.points;
  }
  return out;
}

/** Two forces a book: its datasheets in order, and every other one from the back. */
export const FORCES = BOOKS.flatMap((file) => {
  const us = bookUnits(file);
  const name = file.split('/').pop()!.split('.')[0];
  return [
    { name: `${name} A`, book: file, units: sample(us) },
    { name: `${name} B`, book: file, units: sample(us.filter((_, i) => i % 2 === 0).reverse()) },
  ];
});
export const SEEDS = [1, 2, 3];

/** A recruit costs at most this: the size of unit a force takes on, not a titan. */
const RECRUIT_MAX = 250;

/** `n` fresh (level-0) units of at most RECRUIT_MAX pts from a sample force's book that it doesn't already field. */
export function recruits(f: { book: string; units: Unit[] }, n: number): Unit[] {
  const have = new Set(f.units.map((u) => u.unitType));
  return bookUnits(f.book).filter((u) => !have.has(u.unitType) && u.points <= RECRUIT_MAX).slice(0, n).map((u, i) => ({ ...u, id: `${u.id}-new${i}`, xp: 0 }));
}

const TRAITS = ['Resilient', 'Point Blank', 'Blade Master'];
const SCARS = ['Damaged Equipment', 'Weakened Armor', 'Faulty Aim'];
const RELIC_SET: Omit<Relic, 'id'>[] = [
  { name: 'Terminus Eye', tier: 'Common', profile: '12", A1, AP(4), Deadly(3)' },
  { name: 'Combat Stimm Injector', tier: 'Common' },
  { name: 'Auspex Array', tier: 'Common' },
  { name: 'Korvane Guard Standard', tier: 'Rare' },
  { name: 'Artisan Bionics', tier: 'Common' },
  { name: 'Wreck-Core Reactor', tier: 'Rare' },
];

/** A unit with three traits and a relic. */
export const veteran = (u: Unit, i: number): Unit => ({
  ...u,
  upgrades: TRAITS.map((name, j) => ({ id: `t${j}`, name, unique: false })),
  relics: [{ id: `r${i}`, ...RELIC_SET[i % RELIC_SET.length] }],
});

/** A unit with three scars. */
export const scarred = (u: Unit): Unit => ({ ...u, scars: SCARS.map((name, j) => ({ id: `s${j}`, name })) });

const LADDER_TRAITS = ['Resilient', 'Point Blank', 'Blade Master', 'Fortified', 'Rending', 'Fast', 'Precise Strikes'];

/** A force seasoned to veterancy `vet` (the Final-wave balance tests): the XP shared out evenly, a trait a level
 *  (LEVEL_THRESHOLDS) and a relic from level 3, another from level 6. */
export function seasoned(units: Unit[], vet: number): Unit[] {
  const each = Math.floor(vet / Math.max(1, units.length));
  const level = LEVEL_THRESHOLDS.filter((t) => each >= t).length;
  return units.map((u, i) => ({
    ...u,
    xp: each,
    upgrades: LADDER_TRAITS.slice(0, level).map((name, j) => ({ id: `t${j}`, name, unique: false })),
    relics: Array.from({ length: level >= 6 ? 2 : level >= 3 ? 1 : 0 }, (_, k) => ({ id: `r${i}${k}`, ...RELIC_SET[(i + k) % RELIC_SET.length] })),
  }));
}

/** The books the fairness probe plays (fairness.balance.test.ts): one a datasheet set (Shadow Stalkers is Void
 *  Echoes' AoF twin, so it sits out). */
export const FAIR_BOOKS = ['armies/void-echoes.gf.json', 'src/data/spears-of-dothea.raw.json', 'armies/large-alien-beasts.gf.json', 'armies/fabrication-moon.gf.json', 'armies/cobalt-knights.app.json'];

/** A small seeded dice (mulberry32), so a test force is the same every run. */
const dice = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** An "average" list of about `pts` from a book, as a player might take: datasheets drawn at random under the usual
 *  list limits (no unit over 35% of the points, a hero a 375 pts, a datasheet at most 1 + pts/750 times), until no
 *  more fit, landing within 100 pts of `pts`. */
export function averageForce(units: Unit[], pts: number, seed: number): Unit[] {
  const roll = dice(seed * 7919 + units.length);
  const fits = units.filter((u) => u.points > 0 && u.points <= pts * 0.35);
  const heroes = Math.floor(pts / 375);
  const copies = 1 + Math.floor(pts / 750);
  for (let tries = 0; ; tries++) {
    const out: Unit[] = [];
    let sum = 0;
    for (;;) {
      const room = fits.filter((u) => sum + u.points <= pts
        && out.filter((o) => o.unitType === u.unitType).length < copies
        && (u.category !== 'Hero' || out.filter((o) => o.category === 'Hero').length < heroes));
      if (!room.length) break;
      const u = room[Math.floor(roll() * room.length)];
      out.push({ ...u, id: `${u.id}-${out.length}` });
      sum += u.points;
    }
    if (sum >= pts - 100 || tries >= 50) return out;
  }
}

/** Three average 2000 pt forces a fairness book. */
export const FAIR_FORCES = FAIR_BOOKS.flatMap((file) => {
  const us = bookUnits(file);
  const name = file.split('/').pop()!.split('.')[0];
  return [1, 2, 3].map((k) => ({ name: `${name} ${k}`, book: name, units: averageForce(us, 2000, k) }));
});
