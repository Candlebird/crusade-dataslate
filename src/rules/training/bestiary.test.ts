import { describe, expect, it } from 'vitest';
import type { ForceSortie } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { goalProgress } from '../sortie';
import { SORTIE_LORE } from '../sortieStory';
import { bankBeasts, beastKey, loreKnown } from './bestiary';
import { blankRun } from './testRun';

// Training's kills in the bestiary Sortie keeps.

describe('bestiary', () => {
  it('names each kind as the Echo it stands for, the nemesis as its lord', () => {
    const run = blankRun();
    expect(beastKey(run, 'swarm')).toBe('Fang Swarms');
    // Every kind, the Training boss too, is a real Sortie Echo with lore of its own.
    for (const name of Object.values(TRAINING.shared.beasts)) expect(SORTIE_LORE[name], name).toBeDefined();
    expect(beastKey(run, 'nemesis')).toBeUndefined();
    run.nemesis = { id: 'horror', name: 'The Carrion Crown', grudge: 1, rematch: 0, sig: 'dive', sigName: 'Diving Strike' };
    expect(beastKey(run, 'nemesis')).toBe('lord:horror');
  });

  it('adds meetings and kills, a lord slain here as drill, and says what is new', () => {
    const run = blankRun();
    run.nemesis = { id: 'horror', name: 'The Carrion Crown', grudge: 1, rematch: 0, sig: 'dive', sigName: 'Diving Strike', slain: true };
    run.beasts = { swarm: { met: 3, slain: 12 }, drone: { met: 1, slain: 0 }, nemesis: { met: 1, slain: 1 } };
    const story: ForceSortie = { bestiary: { Scourges: { met: 2, slain: 1 }, 'lord:horror': { met: 1, slain: 0 } } };
    const lines = bankBeasts(story, run);
    expect(story.bestiary!['Fang Swarms']).toEqual({ met: 3, slain: 12 });
    expect(story.bestiary!.Scourges).toEqual({ met: 3, slain: 1 });
    expect(story.bestiary!['lord:horror']).toEqual({ met: 2, slain: 0, drill: 1 });
    expect(loreKnown(story.bestiary!['lord:horror'])).toBe(true);
    expect(lines).toEqual([
      'Bestiary: Fang Swarms met for the first time.', 'Bestiary: Fang Swarms\'s lore learned.', 'Bestiary: The Carrion Crown\'s lore learned.',
    ]);
    expect(goalProgress(story, 'lore')).toBe(3);
  });
});
