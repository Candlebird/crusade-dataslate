import { describe, expect, it } from 'vitest';
import { SORTIE_QUIRKS, TRAINING } from '../downtimeData';
import { habitBadges, habitsOf, habitText, quirkHabit } from './habits';

// Sortie quirks in Training: every one does something, and says what.

describe('habits', () => {
  it('maps every Sortie quirk, region ones too, to an effect with words', () => {
    for (const id of Object.keys(SORTIE_QUIRKS)) {
      const h = quirkHabit(id);
      expect(Object.keys(h).length, id).toBeGreaterThan(0);
      expect(habitText(h), id).not.toBe('Nothing here.');
    }
    expect(quirkHabit('native:ashfields')).toEqual({ terrain: TRAINING.habits.native });
    expect(quirkHabit('haunted:glass')).toEqual({ terrain: TRAINING.habits.haunted });
  });

  it('adds them up, the region ones as to hit at an Echo in dangerous terrain', () => {
    const h = habitsOf({ quirks: ['steady', 'hardy', 'native:ashfields', 'eagle', 'clumsy'] });
    expect(h).toMatchObject({ shoot: 1, melee: -1, hold: TRAINING.habits.steady, tough: 1, terrain: 1 });
    expect(habitsOf({ quirks: ['haunted:glass'] }).terrain).toBe(-1);
    expect(habitText({ terrain: 1 })).toBe('+1 to hit shooting at an Echo in dangerous terrain.');
  });

  it('badges each, good or bad', () => {
    const b = habitBadges({ quirks: ['eagle', 'frail'] });
    expect(b.map((x) => [x.name, x.good])).toEqual([['Eagle-eyed', true], ['Frail', false]]);
    expect(b[1].text).toMatch(/-1 Tough/);
  });
});
