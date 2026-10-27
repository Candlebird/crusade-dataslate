import type { TrackedBattle } from '../tracker';
import type { ZoneMode } from './rewards';
import type { ZBattle } from './state';

// A zone battle in progress, saved after every step and synced (as shared/zone-<id>), so it can be picked up again on
// another device. It goes when the result is taken.

/** What the battle is for, so its result goes to the right place. */
export type ZoneCtx =
  | { kind: 'tracker' }
  | { kind: 'band'; bandId: string; factionId: string }
  | { kind: 'meeting'; key: string }
  | { kind: 'practice'; forceId: string };

export interface ZoneSave {
  id: string;
  /** Who is playing it (the signed-in email; '' on a device that isn't signed in, which keeps it to itself). */
  owner: string;
  updatedAt: string;
  title: string;
  mode: ZoneMode;
  ctx: ZoneCtx;
  /** The tracked battle it settles, to write the result back onto. */
  tracked: TrackedBattle;
  effects: string[];
  battle: ZBattle;
}

export const ZONE_SAVE_PREFIX = 'shared/zone-';
/** Log lines kept in a save: a Firestore document holds at most 1 MB. */
export const ZONE_SAVE_LOG = 500;

/** The battle as saved: the oldest log lines dropped once it runs long. */
export function savedBattle(z: ZBattle): ZBattle {
  return z.log.length > ZONE_SAVE_LOG ? { ...z, log: z.log.slice(-ZONE_SAVE_LOG) } : z;
}
