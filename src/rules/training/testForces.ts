import { readFileSync } from 'node:fs';
import type { Relic, Unit } from '../../model/types';
import { applySelection, normalizeBook } from '../../armyforge/book';
import { unitFromCatalog } from '../../model/factory';

// Test-only: the sample forces the balance tests play (two a book, about 750 pts each). Never imported by the app.

const BOOKS = ['armies/void-echoes.gf.json', 'armies/shadow-stalkers.aof.json', 'src/data/spears-of-dothea.raw.json'];
/** A sample force's points: about this many, never more than `MAX`. */
const AIM = 750;
const MAX = 850;

export const bookUnits = (file: string): Unit[] => {
  const book = normalizeBook(JSON.parse(readFileSync(file, 'utf8')));
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
    { name: `${name} A`, units: sample(us) },
    { name: `${name} B`, units: sample(us.filter((_, i) => i % 2 === 0).reverse()) },
  ];
});
export const SEEDS = [1, 2, 3];

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
