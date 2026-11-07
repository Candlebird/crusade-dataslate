import type { Effect } from '../abilities';
import { TRAINING } from '../downtimeData';
import type { LordTrick, Tower, TrainingRun } from './types';

// Trophies: a boss with a trick (a real lord, the Final lord or the nemesis) leaves one when it falls, themed on the
// trick. Its own card offer then holds the trophy in place of one of its three cards. A tower trophy goes to the tower
// that landed the killing blow (a crafted unit's skill trophy to the run's top killer if a Shard or emplacement did).
// Plain bosses (no trick) leave none. No trophy mends the base. Pure: cards.ts and harm.ts put it on offer and apply it.

export interface Trophy {
  id: string;
  name: string;
  text: string;
  /** On the tower it goes to ({unit} in the text). */
  tower?: (t: Tower) => void;
  /** A skill it gives a crafted unit. */
  skill?: Effect;
  /** On the whole run. */
  run?: (run: TrainingRun) => void;
}

export const TROPHY_PREFIX = 'trophy:';

export const TROPHIES: Trophy[] = [
  { id: 'phaseAnchor', name: 'Phase Anchor', text: 'Every hold lasts 15% longer.', run: (run) => { run.mods.holdMul *= 1.15; } },
  { id: 'wardStone', name: 'Ward Stone', text: 'Every crafted unit on the field gets +1 Tough.',
    run: (run) => run.pieces.forEach((p) => { if (p.kind === 'unit') p.tough += 1; }) },
  { id: 'warHorn', name: 'War Horn', text: 'Kills pay 10% more credits.', run: (run) => { run.mods.bounty += 0.1; } },
  { id: 'burstCore', name: 'Burst Core', text: '{unit}: each shot that hits spills onto 1 more enemy.',
    tower: (t) => t.guns.filter((g) => !g.melee).forEach((g) => { g.blast = Math.max(1, g.blast) + 1; }) },
  { id: 'livingHeart', name: 'Living Heart', text: '{unit}: hits 15% harder.', tower: (t) => { t.atkBonus *= 1.15; } },
  { id: 'dreadMask', name: 'Dread Mask', text: '{unit}: +1 to hit with every attack.', tower: (t) => { t.hitShoot += 1; t.hitMelee += 1; } },
  { id: 'stormcaller', name: 'Stormcaller', text: '{unit}: its guns reach 1 cell further.',
    tower: (t) => t.guns.filter((g) => !g.melee).forEach((g) => { g.range += 1 / TRAINING.rangeMul; }) },
  { id: 'umbralPlate', name: 'Umbral Plate', text: '{unit}: +1 AP on every attack.', tower: (t) => t.guns.forEach((g) => { g.ap += 1; }) },
  { id: 'mirrorShard', name: 'Mirror Shard', text: '{unit}: a wound has a 20% chance to mark the enemy.', skill: { kind: 'onHit', status: 'mark', chance: 0.2 } },
  { id: 'tremorStone', name: 'Tremor Stone', text: '{unit}: a wound has a 20% chance to daze the enemy.', skill: { kind: 'onHit', status: 'daze', chance: 0.2 } },
];

/** The trophy each lord trick leaves. */
export const TROPHY_OF_TRICK: Record<LordTrick, string> = {
  teleport: 'phaseAnchor', shield: 'wardStone', summon: 'warHorn', burst: 'burstCore', regen: 'livingHeart',
  fear: 'dreadMask', storm: 'stormcaller', armour: 'umbralPlate', stealth: 'mirrorShard',
};

/** The trophy each nemesis signature leaves. */
export const TROPHY_OF_SIG: Record<string, string> = {
  rage: 'burstCore', dive: 'stormcaller', dirge: 'phaseAnchor', tremor: 'tremorStone', dread: 'dreadMask', brood: 'warHorn',
};

export const trophyById = (id: string) => TROPHIES.find((t) => t.id === id);

/** The trophy an enemy leaves when slain (none for a plain boss), given its lord trick or nemesis signature. */
export function trophyFor(trick: LordTrick | undefined, sig: string | undefined): Trophy | undefined {
  const id = trick ? TROPHY_OF_TRICK[trick] : sig ? TROPHY_OF_SIG[sig] : undefined;
  return id ? trophyById(id) : undefined;
}

/** Does a trophy go to one tower (rather than the run)? */
export const towerTrophy = (t: Trophy) => !!(t.tower || t.skill);
