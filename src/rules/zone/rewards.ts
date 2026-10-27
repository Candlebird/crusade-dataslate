// What a zone battle earns against a table game. Kept apart so the reward code can read it without the battle engine.

/** How a zone battle is played: you command your side, or the AI plays both. */
export type ZoneMode = 'command' | 'quick';

/** XP and rewards against a table game. */
export const ZONE_REWARDS: Record<ZoneMode, { xp: number; rolls: boolean }> = {
  command: { xp: 0.75, rolls: true },
  quick: { xp: 0.5, rolls: false },
};
