import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogBook, Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newUnit } from '../model/factory';
import { SORTIE } from './downtimeData';
import { SORTIE_BOSSES } from './sortieStory';
import { autoStep, bossOf, createRun, onField, standing, startCombat, type SortieRun, type SortieSquad } from './sortie';

// The Echo lord's fight: foretold by omens on the road, it comes in late, mid-fight, and the fight is won only with it
// down. (A party once beat a Carrion Crown fight without ever seeing the Crown.)

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });
const party = (): Unit[] => [
  newUnit({ id: 'zerk', name: 'Berserkers', category: 'Infantry', size: 5, quality: 3, defense: 4, points: 130, rules: ['Furious', 'Fearless'], weapons: [gun('Great Axes', 0, 3, 5, ['AP(1)'])] }),
  newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  newUnit({ id: 'tank', name: 'Tank', category: 'Vehicle/Monster', size: 1, tough: 6, quality: 4, defense: 2, points: 210, rules: ['Tough(6)', 'Impact(3)'], weapons: [gun('Cannon', 30, 1, 1, ['AP(2)', 'Blast(3)', 'Deadly(3)']), gun('Heavy MG', 30, 3, 1, ['AP(1)'])] }),
];

const lordOf = (run: SortieRun): SortieSquad => run.combat!.enemies.find((e) => e.key === run.combat!.lord)!;

/** A boss fight against `boss`, played on autopilot to its end; notes the round the lord took the field. */
function bossFight(boss: string, seed: number, b: CatalogBook = book) {
  const run = createRun(party(), seed);
  run.boss = boss;
  startCombat(run, b, 'boss');
  const c = run.combat!;
  const lord = lordOf(run);
  const start = { due: lord.arrives, field: onField(c).map((e) => e.key) };
  let joined: number | undefined;
  let escortsUp = false;
  for (let i = 0; i < 20000 && !c.over; i++) {
    autoStep(run, b);
    if (joined === undefined && !lord.arrives) {
      joined = c.round;
      escortsUp = onField(c).some((e) => e !== lord);
    }
  }
  return { run, c, lord, start, joined, escortsUp };
}

describe('the Echo lord arrives late', () => {
  it('every lord leads its own fight but waits off the field, due in round 2-3, while its escorts take the field', () => {
    for (const b of SORTIE_BOSSES) for (let seed = 1; seed <= 6; seed++) {
      const run = createRun(party(), seed);
      run.boss = b.id;
      startCombat(run, book, 'boss');
      const c = run.combat!;
      const lord = lordOf(run);
      expect(lord, b.id).toBeDefined();
      expect(lord.name).toBe(b.name);
      expect(lord.unit.unitType).toBe(b.unit);
      expect(c.enemies.length, b.id).toBeGreaterThan(1);
      expect(lord.arrives, b.id).toBeGreaterThanOrEqual(SORTIE.lordArrives[0]);
      expect(lord.arrives, b.id).toBeLessThanOrEqual(SORTIE.lordArrives[1]);
      expect(onField(c).includes(lord), b.id).toBe(false);
      expect(onField(c).length, b.id).toBeGreaterThan(0);
      expect(lord.intent).toBe('waiting');
      expect(c.log.some((l) => l.text.includes(`joins the fight in round ${lord.arrives}`)), b.id).toBe(true);
    }
  });

  it('joins mid-fight on its round (or the round after its escorts fall), never in the first, and the fight is never won with it still standing', () => {
    let onTime = 0;
    for (const b of SORTIE_BOSSES) for (let seed = 1; seed <= 8; seed++) {
      const f = bossFight(b.id, seed);
      expect(f.c.over, `${b.id} ${seed}`).toBeDefined();
      if (f.c.over === 'won') {
        expect(standing(f.lord), `${b.id} ${seed}`).toBe(false);
        expect(f.joined, `${b.id} ${seed}`).toBeDefined();
        expect(f.c.log.some((l) => l.text === bossOf(f.run).victory)).toBe(true);
      }
      if (f.joined !== undefined) {
        expect(f.joined, `${b.id} ${seed}`).toBeGreaterThanOrEqual(SORTIE.lordArrives[0]);
        expect(f.joined, `${b.id} ${seed}`).toBeLessThanOrEqual(f.start.due!);
        // It doesn't wait for its escorts to fall: with them still fighting it comes in on its round.
        if (f.escortsUp) { expect(f.joined, `${b.id} ${seed}`).toBe(f.start.due); onTime++; }
        expect(f.c.log.some((l) => l.text === `${b.name} arrives at Close range!`), `${b.id} ${seed}`).toBe(true);
        expect(f.c.log.some((l) => l.text === b.intro), `${b.id} ${seed}`).toBe(true);
      }
    }
    expect(onTime).toBeGreaterThan(0);
  });

  it('comes in the round after, if its escorts all fall before its round', () => {
    const run = createRun(party(), 2);
    run.boss = 'horror';
    startCombat(run, book, 'boss');
    const c = run.combat!;
    const lord = lordOf(run);
    for (const e of c.enemies) if (e !== lord) for (const m of e.models) m.hp = 0;
    lord.arrives = 3;
    for (let i = 0; i < 200 && !c.over && lord.arrives; i++) autoStep(run, book);
    expect(c.over).toBeUndefined();
    expect(lord.arrives).toBeUndefined();
    expect(onField(c)).toEqual([lord]);
    expect(c.round).toBe(2);
  });

  it('a book without the lord’s datasheet still brings the real lord, never a stand-in', () => {
    for (const b of SORTIE_BOSSES) {
      const bare: CatalogBook = { ...book, units: book.units.filter((u) => u.name !== b.unit) };
      const f = bossFight(b.id, 3, bare);
      expect(f.lord.unit.unitType, b.id).toBe(b.unit);
      expect(f.lord.name).toBe(b.name);
      if (f.c.over === 'won') expect(standing(f.lord)).toBe(false);
    }
  });

  it('a whole run read with omens ends in a fight its lord takes part in', () => {
    for (const b of SORTIE_BOSSES) for (let seed = 1; seed <= 3; seed++) {
      const run = createRun(party(), seed);
      run.boss = b.id;
      let met = false;
      for (let i = 0; i < 20000 && !run.over; i++) {
        const c = run.combat;
        if (c?.kind === 'boss' && c.lord && !lordOf(run).arrives) met = true;
        autoStep(run, book);
      }
      if (run.journal.some((j) => j.text.includes('Omen:')) && run.depth >= SORTIE.rows.short) expect(met, `${b.id} ${seed}`).toBe(true);
      if (run.bossDown) expect(met, `${b.id} ${seed}`).toBe(true);
    }
  });
});
