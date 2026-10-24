import type { RelicTier } from '../data';

// The Nexus in a run (F3): what a campaign brings to Training. Plain JSON, on TrainingRun.nexus (nexus.ts builds it).

/** A threat affix: Sortie's affixes and pact marks, remapped to the maze (affixes.ts). */
export type NexusAffixId = 'armoured' | 'swift' | 'regenerating' | 'vengeful' | 'frenzied' | 'shrouded' | 'proud' | 'fierce' | 'bleed';

/** A real lord's one trick in the maze (lords.ts). */
export type LordTrick = 'teleport' | 'shield' | 'summon' | 'burst' | 'regen' | 'fear' | 'storm' | 'armour' | 'stealth';

/** One of the campaign's own Echo Lords: its bestiary key ('nexus:<ECHO_LORDS id>' or 'nexus:g:<name>'), name, tier,
 *  trick, where it comes from, and whether it fell this run. */
export interface RunLord {
  key: string;
  name: string;
  tier: RelicTier;
  trick: LordTrick;
  from: 'crisis' | 'guardian';
  slain?: boolean;
}

/** The campaign as a run meets it: threat, its affixes, this round's Galactic Event (GALACTIC_EVENTS id) and the
 *  lords that take the boss waves, in order. */
export interface RunNexus {
  threat: number;
  affixes: NexusAffixId[];
  event?: string;
  lords: RunLord[];
}

/** A real lord on the field: which (RunNexus.lords index), its trick clock, its ward (shield), seconds of burst left. */
export interface LordState {
  i: number;
  next: number;
  ward: number;
  burst: number;
  armed?: boolean;
}
