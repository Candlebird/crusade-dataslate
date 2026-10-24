import type { Campaign, SectorGuardian } from '../../model/types';
import type { RelicTier } from '../data';
import { TRAINING } from '../downtimeData';
import { hasRule } from '../engine';
import { ECHO_LORDS } from '../nexusData';
import { seedOf, shuffle, type Rng } from './rng';
import type { LordTrick, RunLord, RunNexus, TrainingRun } from './types';

// Which of the campaign's own Echo Lords a run meets, on which boss waves, and their tricks in words. Pure: lords.ts
// puts them on the field.

const L = TRAINING.nexus.lords;
const T = TRAINING.nexus.tricks;
const TIERS: RelicTier[] = ['Common', 'Rare', 'Legendary'];

/** What every boss without a real lord is called. */
export const GENERIC_LORD = 'an Echo Lord with no trick';

/** Each trick's name. */
export const TRICK_NAMES: Record<LordTrick, string> = {
  teleport: 'Blink', shield: 'Ward', summon: 'Spawn', burst: 'Surge', regen: 'Regrowth', fear: 'Dread',
  storm: 'Storm', armour: 'Umbral Hide', stealth: 'Mirror Veil',
};

/** What a trick does in the maze. */
export function trickText(k: LordTrick): string {
  switch (k) {
    case 'teleport': return `Every ${T.teleport.every} s it blinks ${T.teleport.cells} cells on, out of any hold.`;
    case 'shield': return `A ward of ${Math.round(T.shield.share * 100)}% of its wounds takes the damage first; it comes back every ${T.shield.every} s.`;
    case 'summon': return `Every ${T.summon.every} s ${T.summon.n} Swarmlings crawl out where it stands.`;
    case 'burst': return `Every ${T.burst.every} s it walks ${T.burst.mul}× as fast for ${T.burst.secs} s.`;
    case 'regen': return `Mends ${Math.round(T.regen.share * 100)}% of its wounds every ${T.regen.every} s.`;
    case 'fear': return `Towers within ${T.fear.radius} cells of it are at -1 to hit.`;
    case 'storm': return `Every ${T.storm.every} s towers within ${T.storm.radius} cells can't fire for ${T.storm.secs} s.`;
    case 'armour': return `Shots from over ${T.armour.from} cells away do ${Math.round(T.armour.mul * 100)}% damage.`;
    case 'stealth': return 'Shots at it are at -1 to hit.';
  }
}

/** A guardian's trick: from the first of its rules in TRAINING.nexus.tricks.byRule, else one of `plain` by its name. */
export function guardianTrick(g: SectorGuardian): LordTrick {
  const rules = g.unit?.rules ?? [];
  for (const [rule, trick] of T.byRule) if (hasRule(rules, rule)) return trick as LordTrick;
  return T.plain[Math.abs(seedOf(g.name)) % T.plain.length] as LordTrick;
}

/** The crisis lord, if one has risen and not been beaten. */
function crisisLord(c: Campaign): RunLord | undefined {
  const l = c.crisis && c.crisis.result !== 'won' ? ECHO_LORDS.find((x) => x.id === c.crisis!.lord) : undefined;
  return l && { key: `nexus:${l.id}`, name: l.name, tier: 'Legendary', trick: (T.byLord[l.id] ?? 'summon') as LordTrick, from: 'crisis' };
}

/** The campaign's lords a run meets, in the order they come: up to lords.max of its sector guardians (a pick by `r`,
 *  in tier order), then the Nexus Crisis lord. */
export function campaignLords(c: Campaign, r: Rng): RunLord[] {
  const crisis = crisisLord(c);
  const seen = new Set<string>();
  const gs = c.sectors.flatMap((s) => (s.guardian && !seen.has(s.guardian.name) && seen.add(s.guardian.name) ? [s.guardian] : []));
  const picked = shuffle(r, gs).slice(0, L.max - (crisis ? 1 : 0));
  picked.sort((a, b) => TIERS.indexOf(a.tier) - TIERS.indexOf(b.tier));
  const out: RunLord[] = picked.map((g) => ({ key: `nexus:g:${g.name}`, name: g.name, tier: g.tier, trick: guardianTrick(g), from: 'guardian' }));
  return crisis ? [...out, crisis] : out;
}

/** The boss wave each lord comes on: every bossEvery-th from lords.from, the nemesis's wave and the Final wave `final`
 *  skipped (`nemesis`: the force has one); at the top Final (finale.to) a last Nexus Crisis lord takes the Final. */
export function lordWaves(nx: RunNexus | undefined, nemesis: boolean, final: number = TRAINING.finale.from): number[] {
  const out: number[] = [];
  const every = TRAINING.wave.bossEvery;
  const lords = nx?.lords ?? [];
  const crisis = final >= TRAINING.finale.to && lords[lords.length - 1]?.from === 'crisis';
  const n = lords.length - (crisis ? 1 : 0);
  for (let w = Math.ceil(L.from / every) * every; out.length < n; w += every) {
    if (!(nemesis && w === TRAINING.shared.nemesis.wave) && w !== final) out.push(w);
  }
  return crisis ? [...out, final] : out;
}

type LordRun = Pick<TrainingRun, 'nexus' | 'nemesis' | 'finale'>;
const wavesOf = (run: LordRun) => lordWaves(run.nexus, !!run.nemesis, run.finale?.final);

/** The lord (RunNexus.lords index) that leads wave `w`, if a real one does. */
export function lordIndex(run: LordRun, w: number): number | undefined {
  const i = wavesOf(run).indexOf(w);
  return i < 0 ? undefined : i;
}

/** The next real lord still to come after wave `w` (default the run's wave), and its wave (in wave order). */
export function nextLord(run: LordRun & Pick<TrainingRun, 'wave'>, w = run.wave): { lord: RunLord; wave: number } | undefined {
  const waves = wavesOf(run);
  const i = waves.findIndex((x) => x > w);
  return i < 0 ? undefined : { lord: run.nexus!.lords[i], wave: waves[i] };
}

/** A lord in a line: its wave, name, tier and trick. */
export const lordLine = (l: RunLord, wave?: number) =>
  `${wave ? `Wave ${wave}: ` : ''}${l.name} (${l.tier}${l.from === 'crisis' ? ', the Nexus Crisis' : ''}). ${TRICK_NAMES[l.trick]}: ${trickText(l.trick)}`;

/** Real lords slain this run (feats, Drill Honours). */
export const lordsSlain = (run: Pick<TrainingRun, 'nexus'>) => run.nexus?.lords.filter((l) => l.slain).length ?? 0;
