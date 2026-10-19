// Starting data: the group's existing rosters (transcribed from the Google Sheets) and the Spears of Dothea book.
import rawDothea from '../data/spears-of-dothea.raw.json';
import { normalizeBook, applySelection } from '../armyforge/book';
import { DEFAULT_SETTINGS, type AppState, type CatalogBook, type Force, type Unit } from './types';
import { newForce, newUnit, unitFromCatalog, uid } from './factory';

const TODO = 'Imported from the old Google Sheet — check stats and upgrades against the sheet.';

function fromBook(book: CatalogBook, type: string, over: Partial<Unit>): Unit {
  const cu = book.units.find((u) => u.name === type);
  if (!cu) return newUnit({ unitType: type, notes: TODO, ...over });
  return { ...unitFromCatalog(cu, applySelection(cu, {}), book), notes: TODO, ...over };
}

function force(name: string, faction: string, description: string, units: Unit[], extra: Partial<Force> = {}): Force {
  return { ...newForce(name), faction, description, units, ...extra };
}

export function buildSeedState(): AppState {
  const dothea = normalizeBook(rawDothea);

  const fang = fromBook(dothea, 'Force Commander', { name: 'The Fang', xp: 27, points: 150 });
  fang.upgrades = [{ id: uid(), name: 'Aura: Enemies within 9" get -1 to Hit', unique: false }];
  if (fang.weapons[0]) {
    fang.weapons[0].name = 'Paired Blades';
    fang.weapons[0].traits = [
      { id: uid(), name: 'Rending', unique: false },
      { id: uid(), name: 'First attack gains Deadly(3)', unique: true },
    ];
  }

  const claws = fromBook(dothea, 'Battle Brothers', { name: 'The Claws', xp: 41, points: 215 });
  claws.upgrades = [{ id: uid(), name: 'Mutations', unique: false }];
  claws.weapons = claws.weapons.map((w) =>
    w.range === 0
      ? {
          ...w,
          traits: [
            { id: uid(), name: 'Quickened Blade (+1 A, Lance)', unique: false },
            { id: uid(), name: 'Precise Blade (First Strike, Lance)', unique: false },
          ],
        }
      : w,
  );

  const headhunters = force(
    'Headhunter Spears',
    'The Spears of Dothea',
    "A detachment from the main Emperor's Spears forces. They focus on quick, decisive strikes, relying on their small fleet of vessels, led by the Avernus, to handle transport.",
    [
      fang,
      claws,
      fromBook(dothea, 'Force Commander', { name: 'Vash', points: 140, notes: `"Bookies" Sternguard. ${TODO}` }),
      fromBook(dothea, 'Stealth Battle Brothers', { name: 'Stealth Battle Brothers' }),
      fromBook(dothea, 'Incursive Battle Brothers', { name: 'Incursive Battle Brothers' }),
      fromBook(dothea, 'Coffin Walker', { name: 'Coffin Walker' }),
      fromBook(dothea, 'Spider Turret', { name: 'Spider Turret' }),
    ],
    {
      ledger: [
        { id: uid(), date: '', label: 'Supply Increases (from sheet)', rp: -6, supply: 6 * DEFAULT_SETTINGS.supplyPerRp },
      ],
    },
  );

  const emperors = force('Emperor\'s Spears', 'The Spears of Dothea', 'The main Spears host.', [
    fromBook(dothea, 'Force Commander', { name: 'Magnus', points: 130 }),
  ]);

  const rhys = newUnit({
    name: 'Rhys',
    unitType: 'Ranger Leader',
    category: 'Hero',
    xp: 90,
    points: 145,
    tough: 3,
    rules: ['Hero', 'Tough(3)'],
    relics: [{ id: uid(), name: 'Xenotech Digital Laser', tier: 'Rare', profile: '12", A2, AP(4), Beam' }],
    notes: `Upgrade names were cut off in the sheet; re-enter them. ${TODO}`,
  });
  const alvaris = force('Alvaris', '', '', [rhys]);

  const empty = (name: string) =>
    force(name, '', 'Roster not yet transcribed — add units from an imported army book or by hand.', []);

  return {
    version: 1,
    forces: [emperors, headhunters, alvaris, empty('Hive Fleet'), empty('Shadows')],
    books: [dothea],
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}
