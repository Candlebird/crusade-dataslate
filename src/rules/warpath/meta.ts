import type { Force, ForceWarpath, WarpathMeta } from '../../model/types';
import type { IconName } from '../../components/Icon';
import type { WarpathRun } from './types';

// Warpath's own meta-progression, per force and only for Warpath. A run (not Auto) earns Renown; Renown buys levels in
// the Armoury, small permanent upgrades whose price climbs each level. Prestige wipes the Armoury and the Renown in
// hand for Laurels: each Laurel adds to every run's Renown for good, and prestiges open deeper upgrades.

export type UpgradeId = 'vigour' | 'drill' | 'edge' | 'stride' | 'scholar' | 'lure' | 'warded' | 'reserves' | 'orders' | 'veterans' | 'doctrine';

export interface Upgrade {
  name: string;
  icon: IconName;
  /** What `n` levels give. */
  text: (n: number) => string;
  /** The effect a level (a share, or a count). */
  per: number;
  max: number;
  /** Price of level n + 1: base × growth^n. */
  base: number;
  growth: number;
  /** Prestiges needed before it can be bought. */
  tier: number;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export const UPGRADES: Record<UpgradeId, Upgrade> = {
  vigour: { name: 'Vigour', icon: 'g:crowned-heart', per: 0.04, max: 10, base: 20, growth: 1.35, tier: 0, text: (n) => `Hero HP +${pct(0.04 * n)}` },
  drill: { name: 'Drill Sergeants', icon: 'g:sands-of-time', per: 0.03, max: 10, base: 20, growth: 1.35, tier: 0, text: (n) => `Fire and strike ${pct(0.03 * n)} faster` },
  edge: { name: 'Honed Edge', icon: 'g:broadsword', per: 0.03, max: 10, base: 20, growth: 1.35, tier: 0, text: (n) => `Damage +${pct(0.03 * n)}` },
  stride: { name: 'Forced March', icon: 'g:sprint', per: 0.02, max: 10, base: 15, growth: 1.35, tier: 0, text: (n) => `Hero speed +${pct(0.02 * n)}` },
  scholar: { name: 'Shard Lore', icon: 'g:crystal-growth', per: 0.04, max: 10, base: 15, growth: 1.35, tier: 0, text: (n) => `Shard XP +${pct(0.04 * n)}` },
  lure: { name: 'Lodestone', icon: 'g:magnet', per: 0.08, max: 5, base: 15, growth: 1.5, tier: 0, text: (n) => `Pickup reach +${pct(0.08 * n)}` },
  warded: { name: 'Warded Plate', icon: 'g:shield', per: 0.02, max: 10, base: 60, growth: 1.35, tier: 1, text: (n) => `Hero takes ${pct(0.02 * n)} less damage` },
  reserves: { name: 'Reserves', icon: 'g:perspective-dice-six-faces-six', per: 1, max: 3, base: 150, growth: 2, tier: 1, text: (n) => `+${n} reroll${n === 1 ? '' : 's'} a run` },
  orders: { name: 'Forward Orders', icon: 'g:scroll-unfurled', per: 1, max: 3, base: 200, growth: 2, tier: 1, text: (n) => `Start with ${n} free level-up${n === 1 ? '' : 's'}` },
  veterans: { name: 'Veteran Cadre', icon: 'g:rank-3', per: 1, max: 2, base: 600, growth: 2.5, tier: 3, text: (n) => `Units called in start ${n} level${n === 1 ? '' : 's'} up` },
  doctrine: { name: 'War College', icon: 'g:bookshelf', per: 1, max: 1, base: 1500, growth: 1, tier: 3, text: (n) => `+${n} doctrine slot` },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

/** Renown a run earns: minutes, kills, captains and lords; Hard pays more; each Laurel adds a share. */
export const RENOWN = { perMin: 8, perKills: 100, captain: 15, lord: 60, hard: 1.5, laurel: 0.1 };
/** Prestige: needs this much Renown earned in the cycle; Laurels = ⌊√(cycle / perLaurel)⌋. */
export const PRESTIGE = { min: 2000, perLaurel: 500 };

export function metaOf(f: Force): WarpathMeta {
  return f.warpath?.meta ?? { renown: 0, cycle: 0, total: 0, prestige: 0, laurels: 0, levels: {} };
}

/** The Armoury level of an upgrade the run was started with. */
export const metaLv = (run: WarpathRun, id: UpgradeId) => run.meta?.[id] ?? 0;
/** The effect of an upgrade in a run (share or count). */
export const metaFx = (run: WarpathRun, id: UpgradeId) => metaLv(run, id) * UPGRADES[id].per;

export const upgradeCost = (id: UpgradeId, level: number) => Math.round(UPGRADES[id].base * UPGRADES[id].growth ** level);

/** Why an upgrade can't be bought now, or '' if it can. */
export function cantBuy(m: WarpathMeta, id: UpgradeId): string {
  const u = UPGRADES[id];
  const lv = m.levels[id] ?? 0;
  if (m.prestige < u.tier) return `Prestige ${u.tier}`;
  if (lv >= u.max) return 'Max';
  if (m.renown < upgradeCost(id, lv)) return 'Not enough Renown';
  return '';
}

function metaIn(f: Force): WarpathMeta {
  const w: ForceWarpath = (f.warpath ??= {});
  return (w.meta ??= { renown: 0, cycle: 0, total: 0, prestige: 0, laurels: 0, levels: {} });
}

/** Buy one level; false if it can't be bought. */
export function buyUpgrade(f: Force, id: UpgradeId): boolean {
  const m = metaIn(f);
  if (cantBuy(m, id)) return false;
  const lv = m.levels[id] ?? 0;
  m.renown -= upgradeCost(id, lv);
  m.levels[id] = lv + 1;
  return true;
}

export function renownOf(run: WarpathRun, laurels: number): number {
  const R = RENOWN;
  const raw = (run.t / 60) * R.perMin + run.kills / R.perKills + run.captains * R.captain + run.lordKills * R.lord;
  return Math.round(raw * (run.mode === 'hard' ? R.hard : 1) * (1 + R.laurel * laurels));
}

/** Pay a finished run's Renown into the force; returns what it got. Auto runs earn nothing. */
export function bankRenown(f: Force, run: WarpathRun): number {
  if (run.auto) return 0;
  const m = metaIn(f);
  const n = renownOf(run, m.laurels);
  m.renown += n;
  m.cycle += n;
  m.total += n;
  return n;
}

export const laurelsFor = (cycle: number) => (cycle < PRESTIGE.min ? 0 : Math.floor(Math.sqrt(cycle / PRESTIGE.perLaurel)));

/** Prestige: wipe the Armoury and the Renown in hand for Laurels. Returns the Laurels gained (0: not allowed). */
export function prestige(f: Force): number {
  const m = metaIn(f);
  const gain = laurelsFor(m.cycle);
  if (gain <= 0) return 0;
  m.laurels += gain;
  m.prestige += 1;
  m.levels = {};
  m.renown = 0;
  m.cycle = 0;
  return gain;
}

/** The summary's Renown line. */
export const renownLine = (n: number, laurels: number) => `+${n.toLocaleString()} Renown${laurels ? ` (Laurels +${Math.round(RENOWN.laurel * laurels * 100)}%)` : ''}`;
