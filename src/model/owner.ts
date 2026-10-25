import type { Force } from './types';

/** Can this device change the force? Yes when it has no owner (it stays on this device) or the signed-in account
 *  owns it. The cloud sync marks every other force read-only and undoes changes to it, so the store's own tidy steps
 *  (noting veterancy) skip those forces too: one test for both, so they can't drift apart. */
export const canWriteForce = (f: Pick<Force, 'owner'>, email: string | null | undefined): boolean => !f.owner || f.owner === email;
