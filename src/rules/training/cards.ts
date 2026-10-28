import type { RelicTier } from '../data';
import type { Effect } from '../abilities';
import { TRAINING } from '../downtimeData';
import { packMates, unitTowers } from './board';
import { cardOpen, rerollsOf } from './drill';
import { applyLevel } from './economy';
import { pick, rand } from './rng';
import type { CardDraw, DefaultTower, TrainingRun, UnitTower } from './types';

// Boss-kill cards: always pick one of three. Most go to one tower on the field, named on the card: a crafted unit,
// or a default emplacement too for the ones that only change its guns.
// A card comes in up to three strengths, Common, Rare and Legendary: the same card, a bigger number. Definitions live
// here, as code; the run holds only CardDraws.

/** What a card can go to: a crafted unit or a default emplacement. */
export type CardTower = UnitTower | DefaultTower;

export interface TrainingCard {
  id: string;
  name: string;
  /** Its strength at each rarity it comes in (a card without a rarity is never drawn at it). */
  tiers: Partial<Record<RelicTier, number>>;
  /** The card's words at strength `n`; `{unit}` is the tower it goes to. */
  text: (n: number) => string;
  /** Which towers it can go to (some only as things stand in the run); without it, the card is for the whole run. */
  fits?: (t: CardTower, run: TrainingRun) => boolean;
  /** Whether a whole-run card would do anything now (cardUseful); without it, always. */
  useful?: (run: TrainingRun) => boolean;
  apply: (run: TrainingRun, n: number, t?: CardTower) => void;
}

const C = TRAINING.cards;
const isUnit = (t: CardTower): t is UnitTower => t.kind === 'unit';
/** Units only, and only those `f` allows. */
const unit = (f: (t: UnitTower) => boolean = () => true) => (t: CardTower) => isUnit(t) && f(t);
const shoots = (t: CardTower) => t.guns.some((g) => !g.melee);
/** Can hold walkers (or will, with more Tough): a unit but not an Aircraft. */
const grounded = (t: UnitTower) => t.category !== 'Aircraft';
const holder = (t: UnitTower) => grounded(t) && t.tough > 1;
const below = (t: UnitTower) => t.up < t.cap;
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Some crafted unit holds walkers (only units hold), so longer holds do something. */
const holds = (run: TrainingRun) => unitTowers(run).some(grounded);
/** Every gun of the tower (or only its shooting ones) changed by `f`. */
const eachGun = (t: CardTower | undefined, f: (g: CardTower['guns'][number]) => void, shooting = false) =>
  t!.guns.filter((g) => !shooting || !g.melee).forEach(f);

/** The crafted unit with the most kills this run (the first of them on a tie; none before any kill). */
const topKiller = (run: TrainingRun): UnitTower | undefined =>
  unitTowers(run).reduce<UnitTower | undefined>((best, t) => (t.kills > (best?.kills ?? 0) ? t : best), undefined);
const K = TRAINING.cards;

/** A card that teaches one unit an ability made from its strength. */
const skillCard = (
  id: string, name: string, tiers: TrainingCard['tiers'], effect: (n: number) => Effect, text: (n: number) => string,
  fits: (t: UnitTower) => boolean = () => true,
): TrainingCard => ({
  id, name, tiers, text, fits: unit(fits),
  apply: (_, n, t) => { (t as UnitTower).skills.push({ source: name, effect: effect(n), cd: 0 }); },
});

const B = TRAINING.bleedField;
const RAPID = ['', 'another attack', 'another attack and 1 more damage', 'another attack, 1 more damage, and it ignores armour'];

export const CARDS: TrainingCard[] = [
  // Any tower: its guns.
  {
    id: 'whet', name: 'Whetstones', tiers: { Common: 0.2, Rare: 0.35, Legendary: 0.6 },
    text: (n) => `{unit}: hits ${pct(n)} harder.`, fits: () => true,
    apply: (_, n, t) => { t!.atkBonus *= 1 + n; },
  },
  {
    id: 'aim', name: 'Target practice', tiers: { Rare: 1, Legendary: 2 },
    text: (n) => `{unit}: +${n} to hit with every attack.`, fits: () => true,
    apply: (_, n, t) => { t!.hitShoot += n; t!.hitMelee += n; },
  },
  {
    id: 'barrels', name: 'Long barrels', tiers: { Common: 1, Rare: 2, Legendary: 3 },
    text: (n) => `{unit}: its guns reach ${n} cell${n === 1 ? '' : 's'} further.`, fits: shoots,
    apply: (_, n, t) => eachGun(t, (g) => { g.range += n / TRAINING.rangeMul; }, true),
  },
  {
    id: 'ap', name: 'Piercing rounds', tiers: { Common: 1, Rare: 2, Legendary: 3 },
    text: (n) => `{unit}: +${n} AP on every attack.`, fits: () => true,
    apply: (_, n, t) => eachGun(t, (g) => { g.ap += n; }),
  },
  {
    id: 'blast', name: 'Frag rounds', tiers: { Common: 1, Rare: 2, Legendary: 3 },
    text: (n) => `{unit}: each shot that hits spills onto ${n} more enem${n === 1 ? 'y' : 'ies'} close by.`, fits: shoots,
    apply: (_, n, t) => eachGun(t, (g) => { g.blast = Math.max(1, g.blast) + n; }, true),
  },
  {
    id: 'deadly', name: 'Hollow points', tiers: { Legendary: 1 },
    text: (n) => `{unit}: +${n} Deadly on every attack (each wound counts ${n + 1} times or more).`, fits: () => true,
    apply: (_, n, t) => eachGun(t, (g) => { g.deadly = Math.max(1, g.deadly) + n; }),
  },
  // Crafted units.
  {
    id: 'grip', name: 'Iron grip', tiers: { Common: 1, Rare: 2, Legendary: 3 },
    text: (n) => `{unit}: +${n} Tough (holds walkers longer).`, fits: unit(grounded),
    apply: (_, n, t) => { (t as UnitTower).tough += n; },
  },
  {
    id: 'promote', name: 'Field promotion', tiers: { Common: 1, Rare: 2, Legendary: 3 },
    text: (n) => `{unit}: ${n === 1 ? 'a free level-up' : `${n} free level-ups`} (no higher than its cap).`, fits: unit(below),
    apply: (_, n, t) => { for (let i = 0; i < n && below(t as UnitTower); i++) applyLevel(t as UnitTower); },
  },
  skillCard('spotter', 'Spotter', { Common: 0.3, Rare: 0.45, Legendary: 0.6 },
    (n) => ({ kind: 'onHit', status: 'mark', chance: n, only: 'shoot' }),
    (n) => `{unit}: a shot that hits has a ${pct(n)} chance to mark the enemy (it takes ${TRAINING.markDmg} more damage from every hit).`, shoots),
  skillCard('medic', 'Field medic', { Common: 1, Rare: 2, Legendary: 3 }, (n) => ({ kind: 'heal', n, every: 1 }),
    (n) => `{unit}: enemies within ${B.radius} cells bleed ${n * B.dmg} over ${B.secs} s, every ability round.`),
  skillCard('drill', 'Shield drill', { Common: 2, Rare: 3, Legendary: 5 }, (n) => ({ kind: 'shield', n, every: 2 }),
    (n) => `{unit}: every other ability round, another tower hits ${pct(n * TRAINING.shieldBoost.perN)} harder for a round.`),
  skillCard('thirst', 'Bloodthirst', { Common: 1, Rare: 2, Legendary: 3 }, (n) => ({ kind: 'leech', n }),
    (n) => `{unit}: drains what it holds, ${n} damage a second.`, holder),
  skillCard('rapid', 'Rapid fire', { Common: 1, Rare: 2, Legendary: 3 },
    (n) => ({ kind: 'sixes', again: true, ...(n >= 2 ? { dmg: 1 } : {}), ...(n >= 3 ? { rend: true } : {}) }),
    (n) => `{unit}: a 6 to hit gives ${RAPID[n]}.`),
  skillCard('trance', 'Battle trance', { Common: 1.5, Rare: 2, Legendary: 2.5 }, (n) => ({ kind: 'frenzy', mul: n, every: 2, time: 1 }),
    (n) => `{unit}: every other ability round, attacks ${n} times as fast for a round.`),
  skillCard('uplink', 'Orbital uplink', { Common: 2, Rare: 4, Legendary: 6 }, (n) => ({ kind: 'barrage', hits: n, ap: 1, every: 2, radius: 1.5 }),
    (n) => `{unit}: every other ability round, calls down ${n} hits at AP 1 on the enemy furthest along in reach, spilling round it.`),
  skillCard('banner', 'Banner of glory', { Rare: 1.5, Legendary: 3 }, (n) => ({ kind: 'aura', stat: 'hit', n: 1, radius: n }),
    (n) => `{unit}: towers within ${n} cells (itself too) get +1 to hit.`),
  skillCard('snare', 'Snare field', { Rare: 1.5, Legendary: 2.5 }, (n) => ({ kind: 'field', status: 'slow', radius: n }),
    (n) => `{unit}: enemies within ${n} cells are slowed.`),
  {
    id: 'pack', name: 'Pack tactics', tiers: { Common: 0.08, Rare: 0.12, Legendary: 0.18 },
    text: (n) => `{unit}: hits ${pct(n)} harder for each other crafted unit within ${K.pack.radius} cells.`,
    fits: (t, run) => isUnit(t) && packMates(run, t) > 0,
    apply: (_, n, t) => { (t as UnitTower).pack = ((t as UnitTower).pack ?? 0) + n; },
  },
  {
    id: 'ace', name: 'Ace', tiers: { Common: 0.03, Rare: 0.05, Legendary: 0.08 },
    text: (n) => `{unit}, the run's top killer: hits ${pct(n)} harder for every ${K.ace.per} kills it makes this run.`,
    fits: (t, run) => isUnit(t) && topKiller(run) === t,
    apply: (_, n, t) => { (t as UnitTower).ace = ((t as UnitTower).ace ?? 0) + n; },
  },
  // Any tower: as the fight goes.
  {
    id: 'crossfire', name: 'Crossfire', tiers: { Common: 0.25, Rare: 0.4, Legendary: 0.6 },
    text: (n) => `{unit}: hits ${pct(n)} harder against an enemy being held.`, fits: (_, run) => holds(run),
    apply: (_, n, t) => { t!.crossfire = (t!.crossfire ?? 0) + n; },
  },
  {
    id: 'chain', name: 'Kill chain', tiers: { Common: 0.04, Rare: 0.06, Legendary: 0.1 },
    text: (n) => `{unit}: each kill makes it attack ${pct(n)} faster for ${K.chain.secs} s, up to ${K.chain.max} times over.`, fits: () => true,
    apply: (_, n, t) => { t!.chain = { stacks: 0, left: 0, ...t!.chain, per: (t!.chain?.per ?? 0) + n }; },
  },
  // The whole run.
  {
    id: 'bounty', name: 'Bounty', tiers: { Common: 0.15, Rare: 0.25, Legendary: 0.4 },
    text: (n) => `Kills pay ${pct(n)} more credits.`,
    apply: (run, n) => { run.mods.bounty += n; },
  },
  {
    id: 'nets', name: 'Snare nets', tiers: { Common: 0.25, Rare: 0.5, Legendary: 0.8 },
    text: (n) => `Every hold lasts ${pct(n)} longer.`, useful: holds,
    apply: (run, n) => { run.mods.holdMul *= 1 + n; },
  },
  {
    id: 'heroes', name: 'Heroes of the hour', tiers: { Legendary: 1 },
    text: () => 'Every crafted unit levels up for free.', useful: (run) => unitTowers(run).some(below),
    apply: (run) => { unitTowers(run).filter(below).forEach(applyLevel); },
  },
];

export const cardById = (id: string) => CARDS.find((c) => c.id === id);
const RANK: Record<RelicTier, number> = { Common: 0, Rare: 1, Legendary: 2 };

/** The towers on the field a card can go to: crafted units and default emplacements. */
const cardTowers = (run: TrainingRun): CardTower[] =>
  run.pieces.filter((p): p is CardTower => p.kind === 'unit' || p.kind === 'default');

/** The tower a drawn card goes to: a unit by its unitId, an emplacement by its piece id. */
export function cardTower(run: TrainingRun, d: CardDraw): CardTower | undefined {
  if (d.unitId) return unitTowers(run).find((u) => u.unitId === d.unitId);
  if (d.pieceId === undefined) return undefined;
  const p = run.pieces.find((x) => x.id === d.pieceId);
  return p?.kind === 'default' ? p : undefined;
}

/** Would card `c` do something if drawn now: open (Drill Honours), a tower card with a tower on the field it fits, a
 *  whole-run card whose `useful` holds (no free levels with every unit at its cap, no longer holds with no unit to
 *  hold). */
export const cardUseful = (run: TrainingRun, c: TrainingCard): boolean =>
  cardOpen(run, c.id) && (c.fits ? cardTowers(run).some((t) => c.fits!(t, run)) : c.useful?.(run) ?? true);

/** Draw `n` cards (TRAINING.cards.offer unless less): rarity by the odds, no card twice, only useful ones
 *  (cardUseful), a tower card to a tower it fits. A rarity no useful card comes in falls back a step. */
export function drawCards(run: TrainingRun, n: number = C.offer): CardDraw[] {
  const ts = cardTowers(run);
  const out: CardDraw[] = [];
  const fits = (c: TrainingCard) => !out.some((d) => d.id === c.id) && cardUseful(run, c);
  for (let i = 0; i < Math.min(n, C.offer); i++) {
    const r = rand(run);
    const want: RelicTier = r < C.odds.Legendary ? 'Legendary' : r < C.odds.Legendary + C.odds.Rare ? 'Rare' : 'Common';
    const tiers = (['Legendary', 'Rare', 'Common'] as RelicTier[]).filter((x) => RANK[x] <= RANK[want]);
    const found = tiers.map((x) => ({ x, pool: CARDS.filter((c) => c.tiers[x] !== undefined && fits(c)) })).find((p) => p.pool.length);
    if (!found) break;
    const c = pick(run, found.pool);
    const to = c.fits ? pick(run, ts.filter((t) => c.fits!(t, run))) : undefined;
    out.push({ id: c.id, rarity: found.x, ...(to ? (isUnit(to) ? { unitId: to.unitId } : { pieceId: to.id }) : {}) });
  }
  return out;
}

/** Put three on offer (a boss died). Does nothing while an offer is already up. */
export function offerCards(run: TrainingRun): void {
  if (run.offer?.length) return;
  const d = drawCards(run);
  if (d.length) run.offer = d;
}

/** A drawn card's name and text, its tower named. A card no longer in the set (an old save's) keeps its id. */
export function cardText(run: TrainingRun, d: CardDraw): { name: string; text: string } {
  const c = cardById(d.id);
  const n = c?.tiers[d.rarity];
  if (!c || n === undefined) return { name: c?.name ?? d.id, text: '' };
  return { name: c.name, text: c.text(n).replace('{unit}', cardTower(run, d)?.name ?? 'Its tower') };
}

/** Take card `i` of the offer. A card no longer in the set (an old save's), or whose tower has gone, does nothing. */
export function pickCard(run: TrainingRun, i: number): void {
  const d = run.offer?.[i];
  if (!d) throw new Error('No such card on offer.');
  const c = cardById(d.id);
  const n = c?.tiers[d.rarity];
  const t = cardTower(run, d);
  if (c && n !== undefined && (!c.fits || t)) c.apply(run, n, t);
  run.cards.push(d);
  run.offer = undefined;
  const { name, text } = cardText(run, d);
  run.log.push(`Card: ${name}. ${text}`);
}

/** The card auto play takes: the rarest, the first of those. */
export const autoCardIndex = (run: TrainingRun): number =>
  (run.offer ?? []).reduce((best, d, i, xs) => (RANK[d.rarity] > RANK[xs[best].rarity] ? i : best), 0);

/** Re-draws of the card offer left this run (the Drill Honours reroll perk). */
export const rerollsLeft = (run: TrainingRun): number => Math.max(0, rerollsOf(run) - (run.rerolls ?? 0));

/** Why the card offer can't be re-drawn, or null. */
export function rerollProblem(run: TrainingRun): string | null {
  if (!run.offer?.length) return 'No cards on offer.';
  if (rerollsOf(run) === 0) return 'Re-draws need a Drill Honour.';
  if (rerollsLeft(run) === 0) return 'No re-draws left this run.';
  return null;
}

/** Re-draw the offer. Throws on a problem. */
export function rerollCards(run: TrainingRun): void {
  const why = rerollProblem(run);
  if (why) throw new Error(why);
  run.rerolls = (run.rerolls ?? 0) + 1;
  const d = drawCards(run);
  run.offer = d.length ? d : run.offer;
  run.log.push('The card offer is re-drawn.');
}
