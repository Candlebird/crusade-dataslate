import { TRAINING } from '../downtimeData';

// The screen's clock: real seconds to sim seconds. The engine and the bot count sim seconds only.

/** Sim seconds for `real` seconds on screen at speed `speed` (1×, 2×, …): TRAINING.timeScale makes 1× calmer. */
export const gameSeconds = (real: number, speed: number): number => real * speed * TRAINING.timeScale;
