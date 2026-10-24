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
  from: 'crisis' | 'guardian' | 'final';
  slain?: boolean;
  /** The crafted unit (id) that landed the killing blow, if one did (tally.ts; records.ts). */
  by?: string;
}

/** The campaign as a run meets it: threat, its affixes, this round's Galactic Event (GALACTIC_EVENTS id) and the
 *  lords that take the boss waves, in order. */
export interface RunNexus {
  threat: number;
  affixes: NexusAffixId[];
  event?: string;
  lords: RunLord[];
}

/** The run's Final wave (finale.ts): which wave, the named lord that leads it (when neither the nemesis nor a campaign
 *  lord does), damage dealt to its boss (the Weekly Siege's score), whether the boss fell or got through, the Victory
 *  ('pending' until the player banks it or goes on into Endless), and whether the force has banked it. */
export interface RunFinale {
  final: number;
  lord?: RunLord;
  dealt: number;
  slain?: boolean;
  through?: boolean;
  victory?: 'pending' | 'endless' | 'banked';
  banked?: boolean;
  /** The crafted unit (id) that slew the Final boss, if one did. */
  by?: string;
}

/** A real lord on the field: which (RunNexus.lords index), its trick clock, its ward (shield), seconds of burst left. */
export interface LordState {
  i: number;
  next: number;
  ward: number;
  burst: number;
  armed?: boolean;
}
