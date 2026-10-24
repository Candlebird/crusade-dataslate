import { describe, expect, it } from 'vitest';
import { SORTIE_QUIRKS, SORTIE_TRINKETS, TRAINING } from '../downtimeData';
import { applyTrinket, coverMulOf, habitBadges, habitsOf, habitText, quirkHabit, trinketHabit } from './habits';
import { testUnit } from './testRun';

// Sortie quirks and trinkets in Training: every one does something, and says what.

describe('habits', () => {
  it('maps every Sortie quirk, region ones too, to an effect with words', () => {
    for (const id of Object.keys(SORTIE_QUIRKS)) {
      const h = quirkHabit(id);
      expect(Object.keys(h).length, id).toBeGreaterThan(0);
      expect(habitText(h), id).not.toBe('Nothing here.');
    }
    expect(quirkHabit('native:ashfields')).toEqual({ cover: -1 });
    expect(quirkHabit('haunted:glass')).toEqual({ cover: 1 });
  });

  it('maps every trinket, Defense, morale and stress to hold time, wounds to Tough', () => {
    for (const [id, k] of Object.entries(SORTIE_TRINKETS)) expect(habitText(trinketHabit(k)), id).not.toBe('Nothing here.');
    expect(trinketHabit(SORTIE_TRINKETS.plate)).toEqual({ init: -1, hold: TRAINING.habits.trinket.def });
    expect(trinketHabit(SORTIE_TRINKETS.flask)).toEqual({ hold: 0.1, tough: -1 });
    expect(trinketHabit(SORTIE_TRINKETS.idol)).toEqual({ hold: -0.1, tough: 1 });
  });

  it('adds them up, and gives the cover multiple', () => {
    const h = habitsOf({ quirks: ['steady', 'hardy', 'native:ashfields'], trinket: 'lens' });
    expect(h).toMatchObject({ shoot: 1, melee: -1, hold: TRAINING.habits.steady, tough: 1, cover: -1 });
    expect(coverMulOf(h)).toBe(0);
    expect(coverMulOf(habitsOf({ quirks: ['haunted:glass'] }))).toBe(2);
  });

  it('badges each, good or bad, the trinket gold', () => {
    const b = habitBadges({ quirks: ['eagle', 'frail'], trinket: 'charm' });
    expect(b.map((x) => [x.name, x.kind, x.good])).toEqual([['Eagle-eyed', 'quirk', true], ['Frail', 'quirk', false], ['Bone Charm', 'trinket', true]]);
    expect(b[1].text).toMatch(/-1 Tough/);
  });

  it('puts a trinket taken mid-run straight on the tower', () => {
    const t = testUnit({ tough: 2 });
    applyTrinket(t, 'totem');
    expect(t).toMatchObject({ trinket: 'totem', hitMelee: 1, init: 1, tough: 1 });
    applyTrinket(t, 'shroud');
    expect(t.grit).toBeCloseTo(1 + TRAINING.habits.trinket.def + (1 - 1.5) * TRAINING.habits.trinket.stress);
  });
});
