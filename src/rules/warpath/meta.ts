import type { Force, ForceWarpath, WarpathMeta } from '../../model/types';
import type { IconName } from '../../components/Icon';
import type { WarpathRun } from './types';

// Warpath's own meta-progression, per force and only for Warpath: the War Council, a skill tree. A run (not Auto) earns
// Renown; Renown buys nodes. Four branches, six tiers each: two ranked stat nodes, then a choice of two (taking one shuts
// the other), a keystone choice (prestige 1), a capstone choice (prestige 2) and a legend (prestige 3), which change how a
// run plays. A reset gives back
// most of what was spent. Prestige wipes the tree and the Renown in hand for Laurels: each adds to every run's Renown
// for good, and prestiges open the deep tiers.

export type BranchId = 'fire' | 'guard' | 'command' | 'scout';

export const BRANCHES: Record<BranchId, { name: string; icon: IconName; color: string; text: string }> = {
  fire: { name: 'Firepower', icon: 'g:broadsword', color: '#ff7a5c', text: 'Hit harder and faster, then make every kill count.' },
  guard: { name: 'Bulwark', icon: 'g:shield', color: '#6fb3ff', text: 'A hero who takes the swarm on and refuses to fall.' },
  command: { name: 'Command', icon: 'g:crown', color: '#ffd166', text: 'More units, sooner and better drilled; more say at each level-up.' },
  scout: { name: 'Scouting', icon: 'g:sprint', color: '#7ee07e', text: 'Range out: quicker sites, richer finds, warning of what comes.' },
};
export const BRANCH_IDS = Object.keys(BRANCHES) as BranchId[];

export type NodeId =
  | 'edge' | 'drill' | 'bigGuns' | 'hail' | 'overcharge' | 'wrath' | 'executioner'
  | 'vigour' | 'warded' | 'thorns' | 'bastion' | 'secondWind' | 'lastStand' | 'unbreakable'
  | 'lore' | 'lodestone' | 'reserves' | 'orders' | 'muster' | 'veterans' | 'college'
  | 'march' | 'pathfinder' | 'plunder' | 'pilgrim' | 'cartographer' | 'hunter' | 'warning'
  | 'ricochet' | 'shockwave' | 'promotion' | 'forager' | 'barrage' | 'legion' | 'grandStrategy' | 'advance';

export interface TreeNode {
  name: string;
  icon: IconName;
  branch: BranchId;
  /** 1–6, top to bottom. A node needs a rank in some node of the tier above in its branch. */
  tier: number;
  /** Ranks to buy (1 for choices, keystones and capstones). */
  ranks: number;
  /** Renown for each rank. */
  cost: number[];
  /** The node it's a choice against (taking one shuts the other). */
  rival?: NodeId;
  /** Prestiges needed before it can be bought. */
  prestige: number;
  /** What `n` ranks do (n ≥ 1). */
  text: (n: number) => string;
  /** A keystone or capstone: changes how a run plays. */
  key?: boolean;
}

const RANKED_1 = [25, 40, 60];
const RANKED_2 = [60, 90, 130];
const CHOICE = [200];
const KEYSTONE = [450];
const CAPSTONE = [900];
const LEGEND = [1500];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** The numbers each node turns. */
export const TREE_FX = {
  edge: 0.04, drill: 0.04, hailRate: 0.2, hailDmg: 0.15, overchargeEvery: 6, overchargeMul: 2,
  wrathEvery: 20, wrathRadius: 7, wrathHits: 16, wrathAp: 2, executeBelow: 0.15,
  vigour: 0.05, warded: 0.03, thorns: 0.2, thornsBoss: 0.02, bastionEvery: 20, bastion: 0.12, secondWind: 0.25, windIframes: 3,
  lastStandBelow: 0.35, lastStand: 0.3, unbreakable: 0.25,
  lore: 0.06, lodestone: 0.2, reserves: 2, orders: 2, musterEvery: 2, veterans: 2,
  ricochetEvery: 5, ricochetReach: 6, waveAt: 0.08, waveEvery: 10, waveReach: 9, wavePush: 6, waveStun: 1.2, foragerShare: 0.25, foragerGems: 8,
  barrageEvery: 30, barrageSecs: 6, barrageRate: 0.75, legion: 0.25, legionRegen: 0.5, advance: 2,
  march: 0.04, pathfinder: 0.15, plunder: 2, pilgrimSecs: 80, pilgrimHymn: 0.6, cartoLive: 5, cartoEvery: 20, warnSecs: 6, warnSize: 0.7,
};
const F = TREE_FX;

export const TREE: Record<NodeId, TreeNode> = {
  // Firepower
  edge: { name: 'Honed Edge', icon: 'g:broadsword', branch: 'fire', tier: 1, ranks: 3, cost: RANKED_1, prestige: 0, text: (n) => `Damage +${pct(F.edge * n)}` },
  drill: { name: 'Drill Sergeants', icon: 'g:sands-of-time', branch: 'fire', tier: 2, ranks: 3, cost: RANKED_2, prestige: 0, text: (n) => `Fire and strike ${pct(F.drill * n)} faster` },
  bigGuns: { name: 'Big Guns', icon: 'g:bullets', branch: 'fire', tier: 3, ranks: 1, cost: CHOICE, rival: 'hail', prestige: 0, text: () => 'Every weapon gains AP +1: armour stops far less' },
  hail: { name: 'Hail of Fire', icon: 'g:archery-target', branch: 'fire', tier: 3, ranks: 1, cost: CHOICE, rival: 'bigGuns', prestige: 0, text: () => `Fire ${pct(F.hailRate)} faster, but each hit does ${pct(F.hailDmg)} less` },
  overcharge: { name: 'Overcharge', icon: 'g:power-lightning', branch: 'fire', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'ricochet', prestige: 1, key: true, text: () => `Every ${F.overchargeEvery}th hit each unit lands is a crit for ×${F.overchargeMul} damage` },
  ricochet: { name: 'Ricochet', icon: 'g:ricochet', branch: 'fire', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'overcharge', prestige: 1, key: true, text: () => `Every ${F.ricochetEvery}th hit each unit lands leaps to another enemy within ${F.ricochetReach}"` },
  wrath: { name: 'Wrath', icon: 'g:sun-radiations', branch: 'fire', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'executioner', prestige: 2, key: true, text: () => `Every ${F.wrathEvery}s the hero bursts: ${F.wrathHits} hits at AP ${F.wrathAp} on everything within ${F.wrathRadius}"` },
  executioner: { name: 'Executioner', icon: 'g:skull-crossed-bones', branch: 'fire', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'wrath', prestige: 2, key: true, text: () => `Any hit that leaves a non-boss under ${pct(F.executeBelow)} HP kills it` },
  barrage: { name: 'Fire at Will', icon: 'g:cannon', branch: 'fire', tier: 6, ranks: 1, cost: LEGEND, prestige: 3, key: true, text: () => `For ${F.barrageSecs}s of every ${F.barrageEvery}s every attack comes ${pct(F.barrageRate)} faster` },
  // Bulwark
  vigour: { name: 'Vigour', icon: 'g:crowned-heart', branch: 'guard', tier: 1, ranks: 3, cost: RANKED_1, prestige: 0, text: (n) => `Hero HP +${pct(F.vigour * n)}` },
  warded: { name: 'Warded Plate', icon: 'g:checked-shield', branch: 'guard', tier: 2, ranks: 3, cost: RANKED_2, prestige: 0, text: (n) => `The hero takes ${pct(F.warded * n)} less damage` },
  thorns: { name: 'Thorns', icon: 'g:pierced-body', branch: 'guard', tier: 3, ranks: 1, cost: CHOICE, rival: 'bastion', prestige: 0, text: () => `An enemy that wounds the hero in melee loses ${pct(F.thorns)} of its HP (a boss ${pct(F.thornsBoss)})` },
  bastion: { name: 'Bastion', icon: 'g:energy-shield', branch: 'guard', tier: 3, ranks: 1, cost: CHOICE, rival: 'thorns', prestige: 0, text: () => `Every ${F.bastionEvery}s the hero gains a shield of ${pct(F.bastion)} HP` },
  secondWind: { name: 'Second Wind', icon: 'g:medical-pack', branch: 'guard', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'shockwave', prestige: 1, key: true, text: () => `Once a run, a killing blow leaves the hero at ${pct(F.secondWind)} HP, untouchable for ${F.windIframes}s` },
  shockwave: { name: 'Shockwave', icon: 'g:fire-ring', branch: 'guard', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'secondWind', prestige: 1, key: true, text: () => `A blow of ${pct(F.waveAt)} HP or more throws back and stuns all but bosses within ${F.waveReach}" (once every ${F.waveEvery}s)` },
  lastStand: { name: 'Last Stand', icon: 'g:spartan-helmet', branch: 'guard', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'unbreakable', prestige: 2, key: true, text: () => `Below ${pct(F.lastStandBelow)} HP the whole force fires ${pct(F.lastStand)} faster` },
  unbreakable: { name: 'Unbreakable', icon: 'g:shield', branch: 'guard', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'lastStand', prestige: 2, key: true, text: () => `No single blow takes more than ${pct(F.unbreakable)} of the hero's HP (was 35%)` },
  legion: { name: 'Iron Legion', icon: 'g:roman-shield', branch: 'guard', tier: 6, ranks: 1, cost: LEGEND, prestige: 3, key: true, text: () => `Squads shrug off ${pct(F.legion)} of wounds and lost models come back twice as fast` },
  // Command
  lore: { name: 'Shard Lore', icon: 'g:crystal-growth', branch: 'command', tier: 1, ranks: 3, cost: RANKED_1, prestige: 0, text: (n) => `Shard XP +${pct(F.lore * n)}` },
  lodestone: { name: 'Lodestone', icon: 'g:magnet', branch: 'command', tier: 2, ranks: 3, cost: RANKED_2, prestige: 0, text: (n) => `Pickup reach +${pct(F.lodestone * n)}` },
  reserves: { name: 'Reserves', icon: 'g:perspective-dice-six-faces-six', branch: 'command', tier: 3, ranks: 1, cost: CHOICE, rival: 'orders', prestige: 0, text: () => `+${F.reserves} rerolls a run` },
  orders: { name: 'Forward Orders', icon: 'g:scroll-unfurled', branch: 'command', tier: 3, ranks: 1, cost: CHOICE, rival: 'reserves', prestige: 0, text: () => `Start every run with ${F.orders} free level-ups` },
  muster: { name: 'Muster', icon: 'g:knight-banner', branch: 'command', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'promotion', prestige: 1, key: true, text: () => `Call-in cards every ${F.musterEvery}nd level-up instead of every 3rd` },
  promotion: { name: 'Field Promotion', icon: 'g:medal', branch: 'command', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'muster', prestige: 1, key: true, text: () => 'The unit that fells a boss gains a level (within its cap)' },
  veterans: { name: 'Veteran Cadre', icon: 'g:rank-3', branch: 'command', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'college', prestige: 2, key: true, text: () => `Units called in arrive ${F.veterans} levels up` },
  college: { name: 'War College', icon: 'g:bookshelf', branch: 'command', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'veterans', prestige: 2, key: true, text: () => '+1 doctrine slot, and each new doctrine comes in at level 2' },
  grandStrategy: { name: 'Grand Strategy', icon: 'g:chess-queen', branch: 'command', tier: 6, ranks: 1, cost: LEGEND, prestige: 3, key: true, text: () => 'Four cards at every level-up, not three' },
  // Scouting
  march: { name: 'Forced March', icon: 'g:sprint', branch: 'scout', tier: 1, ranks: 3, cost: RANKED_1, prestige: 0, text: (n) => `Hero speed +${pct(F.march * n)}` },
  pathfinder: { name: 'Pathfinder', icon: 'g:telescope', branch: 'scout', tier: 2, ranks: 3, cost: RANKED_2, prestige: 0, text: (n) => `Sites take ${pct(F.pathfinder * n)} less time to hold` },
  plunder: { name: 'Plunder', icon: 'g:open-treasure-chest', branch: 'scout', tier: 3, ranks: 1, cost: CHOICE, rival: 'pilgrim', prestige: 0, text: () => `Supply caches give ${F.plunder} level-ups` },
  pilgrim: { name: 'Pilgrim', icon: 'g:holy-symbol', branch: 'scout', tier: 3, ranks: 1, cost: CHOICE, rival: 'plunder', prestige: 0, text: () => `Battle Hymn: +${pct(F.pilgrimHymn)} fire rate for ${F.pilgrimSecs}s (was +40% for 40s)` },
  cartographer: { name: 'Cartographer', icon: 'g:radar-sweep', branch: 'scout', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'forager', prestige: 1, key: true, text: () => `Up to ${F.cartoLive} sites at once, a new one every ${F.cartoEvery}s` },
  forager: { name: 'Forager', icon: 'g:swap-bag', branch: 'scout', tier: 4, ranks: 1, cost: KEYSTONE, rival: 'cartographer', prestige: 1, key: true, text: () => `Each shrine, cache or aid station taken leaves a ring of Shards worth ${pct(F.foragerShare)} of a level` },
  hunter: { name: 'Champion Hunter', icon: 'g:wolf-head', branch: 'scout', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'warning', prestige: 2, key: true, text: () => 'A champion slain gives a free level-up' },
  warning: { name: "Scout's Warning", icon: 'g:radar-dish', branch: 'scout', tier: 5, ranks: 1, cost: CAPSTONE, rival: 'hunter', prestige: 2, key: true, text: () => `Hordes are called ${F.warnSecs}s out and come ${pct(1 - F.warnSize)} smaller` },
  advance: { name: 'Advance Party', icon: 'g:campfire', branch: 'scout', tier: 6, ranks: 1, cost: LEGEND, prestige: 3, key: true, text: () => `Start every run with ${F.advance} random doctrines at level 1` },
};
export const NODE_IDS = Object.keys(TREE) as NodeId[];

/** Renown a run earns: minutes, kills, captains and lords; Hard pays more; each Laurel adds a share. */
export const RENOWN = { perMin: 8, perKills: 100, captain: 15, lord: 60, hard: 1.5, laurel: 0.1 };
/** Honours: each prestige makes the force a little stronger in every run for good (damage and hero HP), up to `max`
 *  prestiges. It's what lets a deep-prestige force outlast the late swarm; a fresh tree alone can't. */
export const HONOURS = { dmg: 0.11, hp: 0.11, max: 10 };
/** The prestiges a run counts for Honours. */
export const honoursOf = (run: WarpathRun) => Math.min(HONOURS.max, run.meta?.honours ?? 0);
/** Prestige: needs this much Renown earned in the cycle; Laurels = ⌊√(cycle / perLaurel)⌋. A tree reset gives back `refund`. */
export const PRESTIGE = { min: 2000, perLaurel: 500, refund: 0.8 };

/** The Armoury the tree replaced, priced as it was ([base, growth]), so levels bought there come back as Renown. */
const OLD: Record<string, [number, number]> = {
  vigour: [20, 1.35], drill: [20, 1.35], edge: [20, 1.35], stride: [15, 1.35], scholar: [15, 1.35], lure: [15, 1.5],
  warded: [60, 1.35], reserves: [150, 2], orders: [200, 2], veterans: [600, 2.5], doctrine: [1500, 1],
};
export const oldRefund = (levels: Partial<Record<string, number>>) =>
  Object.entries(levels).reduce((n, [id, lv]) => {
    const o = OLD[id];
    if (!o) return n;
    for (let i = 0; i < (lv ?? 0); i++) n += Math.round(o[0] * o[1] ** i);
    return n;
  }, 0);

/** The meta with its nodes always there. */
export type TreeMeta = WarpathMeta & { nodes: Partial<Record<string, number>> };

const blank = (): TreeMeta => ({ renown: 0, cycle: 0, total: 0, prestige: 0, laurels: 0, nodes: {} });

/** The force's progress, read-only (old Armoury levels shown as the Renown they'll come back as). */
export function metaOf(f: Force): TreeMeta {
  const m = f.warpath?.meta;
  if (!m) return blank();
  const out: TreeMeta = { ...m, nodes: m.nodes ?? {} };
  if (m.levels) {
    out.renown += oldRefund(m.levels);
    delete out.levels;
  }
  return out;
}

/** The force's progress to write to (old Armoury levels refunded on the way). */
function metaIn(f: Force): TreeMeta {
  const w: ForceWarpath = (f.warpath ??= {});
  const m = (w.meta ??= blank());
  m.nodes ??= {};
  if (m.levels) {
    m.renown += oldRefund(m.levels);
    delete m.levels;
  }
  return m as TreeMeta;
}

/** Ranks of a node the run was started with. */
export const metaLv = (run: WarpathRun, id: NodeId) => run.meta?.[id] ?? 0;
/** Has the run got this node? */
export const has = (run: WarpathRun, id: NodeId) => metaLv(run, id) > 0;

export const nodeCost = (id: NodeId, rank: number) => TREE[id].cost[Math.min(rank, TREE[id].cost.length - 1)];

/** Renown spent on the tree. */
export const spentOn = (m: TreeMeta) =>
  NODE_IDS.reduce((n, id) => { for (let i = 0; i < (m.nodes[id] ?? 0); i++) n += nodeCost(id, i); return n; }, 0);

/** Has it what it needs above it (a rank in some node of the tier above, in its branch)? */
export function reached(m: TreeMeta, id: NodeId): boolean {
  const t = TREE[id];
  if (t.tier === 1) return true;
  return NODE_IDS.some((o) => TREE[o].branch === t.branch && TREE[o].tier === t.tier - 1 && (m.nodes[o] ?? 0) > 0);
}

/** maxed / owned (more ranks to buy, too dear) / open (affordable) / poor (reachable, too dear) / locked (tier above
 *  empty) / shut (its rival was taken) / sealed (needs more prestige). */
export type NodeState = 'maxed' | 'owned' | 'open' | 'poor' | 'locked' | 'shut' | 'sealed';

export function nodeState(m: TreeMeta, id: NodeId): NodeState {
  const t = TREE[id];
  const n = m.nodes[id] ?? 0;
  if (n >= t.ranks) return 'maxed';
  if (t.rival && (m.nodes[t.rival] ?? 0) > 0) return 'shut';
  if (m.prestige < t.prestige) return 'sealed';
  if (!reached(m, id)) return 'locked';
  if (m.renown < nodeCost(id, n)) return n > 0 ? 'owned' : 'poor';
  return 'open';
}

/** Why a node can't be bought now, or '' if it can. */
export function cantTake(m: TreeMeta, id: NodeId): string {
  const t = TREE[id];
  const n = m.nodes[id] ?? 0;
  if (n >= t.ranks) return 'Fully taken';
  if (t.rival && (m.nodes[t.rival] ?? 0) > 0) return `You chose ${TREE[t.rival].name} (reset the tree to change)`;
  if (m.prestige < t.prestige) return `Opens at prestige ${t.prestige}`;
  if (!reached(m, id)) return `Take a node in the tier above first`;
  if (m.renown < nodeCost(id, n)) return `Needs ${nodeCost(id, n).toLocaleString()} Renown`;
  return '';
}

/** Buy one rank; false if it can't be bought. */
export function takeNode(f: Force, id: NodeId): boolean {
  const m = metaIn(f);
  if (cantTake(m, id)) return false;
  const n = m.nodes[id] ?? 0;
  m.renown -= nodeCost(id, n);
  m.nodes[id] = n + 1;
  return true;
}

/** What a tree reset would give back. */
export const resetValue = (m: TreeMeta) => Math.floor(spentOn(m) * PRESTIGE.refund);

/** Clear the tree for `refund` of what was spent; returns the Renown given back. */
export function resetTree(f: Force): number {
  const m = metaIn(f);
  const back = resetValue(m);
  m.nodes = {};
  m.renown += back;
  return back;
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

/** Prestige: wipe the tree and the Renown in hand for Laurels. Returns the Laurels gained (0: not allowed). */
export function prestige(f: Force): number {
  const m = metaIn(f);
  const gain = laurelsFor(m.cycle);
  if (gain <= 0) return 0;
  m.laurels += gain;
  m.prestige += 1;
  m.nodes = {};
  m.renown = 0;
  m.cycle = 0;
  return gain;
}

/** The summary's Renown line. */
export const renownLine = (n: number, laurels: number) => `+${n.toLocaleString()} Renown${laurels ? ` (Laurels +${Math.round(RENOWN.laurel * laurels * 100)}%)` : ''}`;
