import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CatalogBook, Unit, Weapon } from '../model/types';
import { normalizeBook } from '../armyforge/book';
import { newUnit } from '../model/factory';
import { SORTIE } from './downtimeData';
import { SORTIE_BOSSES } from './sortieStory';
import { nextTurn, autoStep, bossOf, braceFor, createRun, giveOrder, onField, sigStrength, sigWeaker, standing, startCombat, startRound, type SortieRun, type SortieSquad } from './sortie';

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

// Omens weaken the lord's own signature, the party braces for one before the fight, and the lord shows a tell the
// round before a signature goes off that the right order answers.
describe('omens, the brace and the lord’s tells', () => {
  /** A lord's fight with the lord on the field from the start, waiting on the brace. */
  const lordFight = (boss: string, seed = 3, omens = 0, tier = 0) => {
    const run = createRun(party(), seed, 'free', 'short', { tier });
    run.boss = boss;
    if (tier >= 3) run.sig2 = SORTIE_BOSSES.find((b) => b.id !== boss && b.sig.id !== SORTIE_BOSSES.find((x) => x.id === boss)!.sig.id)!.sig.id;
    if (omens) run.omens = omens;
    startCombat(run, book, 'boss');
    lordOf(run).arrives = undefined;
    lordOf(run).dist = 1;
    // Sturdy enough to see a few rounds out.
    for (const m of lordOf(run).models) m.hp = m.max = 500;
    return run;
  };
  /** Play out the current round with At will orders. */
  const playRound = (run: SortieRun) => {
    const c = run.combat!;
    const r = c.round;
    for (let i = 0; i < 500 && !c.over && c.round === r; i++) {
      if (c.need === 'start') startRound(run);
      else if (c.need === 'order') giveOrder(run, 'atwill');
      else if (c?.need === 'next') nextTurn(run);
    }
  };
  const toRound = (run: SortieRun, n: number) => {
    for (let i = 0; i < 20 && run.combat!.round < n && !run.combat!.over; i++) playRound(run);
  };
  const wrongBrace = (run: SortieRun, sig: string) => braceFor(run, run.combat!.brace!.options.find((id) => id !== sig)!);

  it('offers the lord’s own signature among decoys (and a borrowed one too) and waits on the pick', () => {
    for (const b of SORTIE_BOSSES) {
      const run = lordFight(b.id);
      const c = run.combat!;
      expect(c.need, b.id).toBe('brace');
      expect(c.brace!.options).toHaveLength(3);
      expect(new Set(c.brace!.options).size).toBe(3);
      expect(c.brace!.options).toContain(b.sig.id);
      expect(() => startRound(run)).toThrow();
      const hard = lordFight(b.id, 3, 0, 3);
      expect(hard.combat!.brace!.options).toHaveLength(4);
      expect(hard.combat!.brace!.options).toEqual(expect.arrayContaining([b.sig.id, hard.sig2]));
    }
  });

  it('weakens the signature per omen and again for a right brace, never under the floor; a wrong brace costs nothing', () => {
    const right = lordFight('behemoth', 3, 2);
    expect(sigStrength(right, 'tremor')).toBeCloseTo(1 - 2 * SORTIE.omens.step);
    braceFor(right, 'tremor');
    expect(sigStrength(right, 'tremor')).toBeCloseTo(1 - 2 * SORTIE.omens.step - SORTIE.omens.brace);
    expect(right.combat!.need).toBe('start');
    expect(right.combat!.log.some((l) => l.text.startsWith('Braced for Tremor, and rightly'))).toBe(true);
    expect(right.combat!.log.some((l) => l.text.startsWith(`Tremor (${sigWeaker(right, 'tremor')}% weaker):`))).toBe(true);
    const wrong = lordFight('behemoth', 3, 2);
    wrongBrace(wrong, 'tremor');
    expect(sigStrength(wrong, 'tremor')).toBeCloseTo(1 - 2 * SORTIE.omens.step);
    expect(wrong.combat!.log.some((l) => l.text.includes('has no such thing'))).toBe(true);
    const most = lordFight('behemoth', 3, 99);
    braceFor(most, 'tremor');
    expect(sigStrength(most, 'tremor')).toBeCloseTo(SORTIE.omens.floor);
  });

  it('the auto-player braces for the real signature once two omens are read', () => {
    for (const b of SORTIE_BOSSES) {
      const run = lordFight(b.id, 5, 2);
      autoStep(run, book);
      expect(run.combat!.brace!.pick, b.id).toBe(b.sig.id);
    }
  });

  it('shows a tell the round before Tremor, and units that Regroup take half the stamp', () => {
    const run = lordFight('behemoth', 3);
    wrongBrace(run, 'tremor');
    const c = run.combat!;
    toRound(run, 2);
    expect(c.round).toBe(2);
    expect(c.tells!.map((t) => t.sig)).toEqual(['tremor']);
    expect(c.log.some((l) => l.text.startsWith('Tell: The ground goes still under your boots.') && l.text.includes('Regroup'))).toBe(true);
    const line = c.party.filter((p) => p.slot !== undefined);
    const braced = line[0];
    c.did = { [braced.key]: ['regroup'] };
    const from = c.log.length;
    playRound(run);
    expect(c.round).toBe(3);
    const lines = c.log.slice(from).map((l) => l.text);
    expect(lines.some((t) => t.startsWith('Tremor: the ground heaves.'))).toBe(true);
    expect(lines.some((t) => t.startsWith('Tremor: ') && t.endsWith(`on ${braced.name}.`))).toBe(false);
    for (const p of line.slice(1)) expect(lines.some((t) => t.startsWith('Tremor (braced)') && t.endsWith(`on ${p.name}.`))).toBe(false);
  });

  it('a unit that Regroups on the Dirge’s tell is not dazed by the next verse', () => {
    const run = lordFight('screecher', 4);
    wrongBrace(run, 'dirge');
    const c = run.combat!;
    toRound(run, 3);
    expect(c.tells!.map((t) => t.sig)).toEqual(['dirge']);
    const line = c.party.filter((p) => p.slot !== undefined);
    c.did = { [line[0].key]: ['regroup'] };
    playRound(run);
    expect(c.round).toBe(4);
    const verse = c.log.filter((l) => l.text.startsWith('Dirge: ')).slice(-1)[0].text;
    // At full strength the song dazes every unit still on the line that didn't answer (a Fear aura may daze it anyway).
    expect(verse).toContain(`(${line[0].name} stopped their ears)`);
    for (const p of line.slice(1)) if (p.models.some((m) => m.hp > 0)) expect(verse).toContain(p.name);
  });

  it('names the unit a dive is meant for, and scales a signature down with its strength', () => {
    const dive = lordFight('horror', 3);
    braceFor(dive, 'dive');
    toRound(dive, 3);
    const t = dive.combat!.tells!.find((x) => x.sig === 'dive')!;
    expect(t.target).toBeDefined();
    const name = dive.combat!.party.find((p) => p.key === t.target)!.name;
    expect(t.text).toContain(name);
    // A weakened Tremor hurts less: about a third as much at the floor.
    let full = 0;
    let weak = 0;
    for (let seed = 1; seed <= 6; seed++) for (const omens of [0, 99]) {
      const run = lordFight('behemoth', seed, omens);
      if (omens) braceFor(run, 'tremor');
      else wrongBrace(run, 'tremor');
      toRound(run, 3);
      const n = run.combat!.log.filter((l) => /^Tremor: \d+ wound/.test(l.text)).reduce((x, l) => x + Number(l.text.match(/(\d+) wound/)![1]), 0);
      if (omens) weak += n;
      else full += n;
    }
    expect(full).toBeGreaterThan(0);
    expect(weak).toBeLessThan(full * 0.6);
  });

  it('says on arrival how much weaker its signature is', () => {
    let seen = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const run = createRun(party(), seed);
      run.boss = 'terror';
      run.omens = 2;
      startCombat(run, book, 'boss');
      for (let i = 0; i < 20000 && !run.combat!.over; i++) autoStep(run, book);
      if (run.combat!.log.some((l) => /Aura of Dread is \d+% weaker for the omens read/.test(l.text))) seen++;
    }
    expect(seen).toBeGreaterThan(0);
  });
});
