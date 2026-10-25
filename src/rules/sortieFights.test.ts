import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newUnit } from '../model/factory';
import { SORTIE } from './downtimeData';
import { autoStep, createRun, startCombat } from './sortie';

// Sortie fights: the better of two to-hit dice.

const book = normalizeBook(JSON.parse(readFileSync('armies/void-echoes.gf.json', 'utf8')));

const gun = (name: string, range: number, attacks: number, count: number, rules: string[] = []): Weapon =>
  ({ id: name, name, range, attacks, count, rules, traits: [] });
const party = (): Unit[] => [
  newUnit({ id: 'inf', name: 'Troopers', category: 'Infantry', size: 10, quality: 4, defense: 4, points: 120, weapons: [gun('Rifles', 24, 1, 10), gun('CCW', 0, 1, 10)] }),
  newUnit({ id: 'hero', name: 'Captain', category: 'Hero', size: 1, tough: 3, quality: 3, defense: 3, points: 80, rules: ['Hero', 'Tough(3)'], weapons: [gun('Pistol', 12, 1, 1), gun('Sword', 0, 3, 1, ['AP(1)'])] }),
  newUnit({ id: 'snip', name: 'Snipers', category: 'Infantry', size: 3, quality: 3, defense: 5, points: 90, rules: ['Stealth'], weapons: [gun('Sniper Rifle', 36, 1, 3, ['AP(2)', 'Deadly(2)'])] }),
];

/** Hits and rounds over a batch of the same fights (every fight sized the same, so only the dice differ). */
function batch() {
  let hits = 0;
  let rounds = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const run = createRun(party(), seed);
    run.scale = { fight: 1 };
    startCombat(run, book, 'fight');
    let seen = 0;
    for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) {
      autoStep(run, book);
      for (const fx of (run.combat?.fx ?? []).filter((f) => f.n > seen)) hits += fx.hits;
      seen = run.combat?.fxSeq ?? seen;
    }
    rounds += run.combat?.round ?? 0;
  }
  return { hits, rounds };
}

describe('Sortie to-hit rolls', () => {
  const was = SORTIE.hitTwice;
  afterEach(() => { SORTIE.hitTwice = was; });

  it('rolls to hit twice and keeps the better, so far more lands and fights end sooner', () => {
    expect(SORTIE.hitTwice).toBe(true);
    const twice = batch();
    SORTIE.hitTwice = false;
    const once = batch();
    expect(twice.hits / twice.rounds).toBeGreaterThan((once.hits / once.rounds) * 1.2);
    expect(twice.rounds).toBeLessThan(once.rounds * 0.9);
  });

  it('shows each attack as one roll: the log still reads one line of hits per attack', () => {
    const run = createRun(party(), 4);
    startCombat(run, book, 'fight');
    for (let i = 0; i < 3000 && run.combat && !run.combat.over; i++) autoStep(run, book);
    const lines = run.combat!.log.map((l) => l.text).filter((t) => / → .*: \d+ hits?, /.test(t));
    expect(lines.length).toBeGreaterThan(0);
    expect(run.combat!.log.some((l) => /twice|reroll/i.test(l.text))).toBe(false);
  });
});
