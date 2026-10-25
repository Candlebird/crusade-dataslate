import type { RelicTier } from '../data';
import { describe, type Effect } from '../abilities';
import { TRAINING } from '../downtimeData';
import { routeOf, unitTowers } from './board';
import { cardOpen, perkOf, rerollsOf } from './drill';
import { applyLevel, levelCost } from './economy';
import { pick, rand } from './rng';
import { isTrinketCard, takeTrinket, trinketCardText, trinketOffer } from './trinkets';
import { layCover } from './waves';
import type { CardDraw, TrainingRun, UnitTower } from './types';

// Boss-kill cards: pick one of three. Definitions live here, as code; the run holds only CardDraws.

export interface TrainingCard {
  id: string;
  name: string;
  rarity: RelicTier;
  /** `{unit}` is the unit it falls to. */
  text: string;
  /** Only crafted units this allows can draw it; without it, the card is for the whole run. */
  unit?: (t: UnitTower) => boolean;
  /** Whether a whole-run card would do anything now (cardUseful); without it, always. */
  useful?: (run: TrainingRun) => boolean;
  apply: (run: TrainingRun, t?: UnitTower) => void;
}

const C = TRAINING.cards;
const any = () => true;
const shooter = (t: UnitTower) => t.guns.some((g) => !g.melee);
/** Can hold walkers (or will, with more Tough): anything but an Aircraft. */
const grounded = (t: UnitTower) => t.category !== 'Aircraft';
const holder = (t: UnitTower) => grounded(t) && t.tough > 1;
const below = (t: UnitTower) => t.up < t.cap;
const pct = (n: number) => `${Math.round(n * 100)}%`;
/** Mend the base by `n`, never above TRAINING.baseHp. */
const mend = (run: TrainingRun, n: number) => { run.baseHp = Math.min(TRAINING.baseHp, run.baseHp + n); };
/** The base has HP to mend. */
const hurtBase = (run: TrainingRun) => run.baseHp < TRAINING.baseHp;
/** Some crafted unit holds walkers (only units hold), so longer holds do something. */
const holds = (run: TrainingRun) => unitTowers(run).some(grounded);

/** A card that teaches one unit an ability; its text is the ability's unless given. */
const skillCard = (id: string, name: string, rarity: RelicTier, effect: Effect, unit: (t: UnitTower) => boolean = any, text?: string): TrainingCard => ({
  id, name, rarity, text: text ?? `{unit}: ${describe(effect)}.`, unit,
  apply: (_, t) => { t!.skills.push({ source: name, effect, cd: 0 }); },
});

const B = TRAINING.bleedField;

export const CARDS: TrainingCard[] = [
  { id: 'aim', name: 'Target practice', rarity: 'Common', text: '{unit}: +1 to hit when shooting.', unit: shooter, apply: (_, t) => { t!.hitShoot += 1; } },
  { id: 'whet', name: 'Whetstones', rarity: 'Common', text: '{unit}: hits 20% harder.', unit: any, apply: (_, t) => { t!.atkBonus *= 1.2; } },
  { id: 'grip', name: 'Iron grip', rarity: 'Common', text: '{unit}: +1 Tough (holds walkers longer).', unit: grounded, apply: (_, t) => { t!.tough += 1; } },
  {
    id: 'nets', name: 'Snare nets', rarity: 'Common', text: `Every hold lasts ${pct(C.holdMul - 1)} longer.`, useful: holds,
    apply: (run) => { run.mods.holdMul *= C.holdMul; },
  },
  {
    // Laid on the maze's route as it stands, where the enemy walks now.
    id: 'sandbags', name: 'Sandbags', rarity: 'Common', text: `${C.patches} more patches of cover along the route.`,
    apply: (run) => { run.cover.push(...layCover(run, C.patches, routeOf(run), run.cover)); },
  },
  { id: 'walls', name: 'Patch the walls', rarity: 'Common', text: `Mends the base by ${C.walls}.`, useful: hurtBase, apply: (run) => mend(run, C.walls) },
  {
    id: 'supply', name: 'Supply drop', rarity: 'Common', text: 'Credits for the cheapest level-up on the map.',
    apply: (run) => {
      const ts = unitTowers(run).filter(below);
      run.credits += ts.length ? Math.min(...ts.map(levelCost)) : TRAINING.levels.base;
    },
  },
  skillCard('spotter', 'Spotter', 'Rare', { kind: 'onHit', status: 'mark', chance: 0.4, only: 'shoot' }, shooter),
  skillCard('medic', 'Field medic', 'Rare', { kind: 'heal', n: 1, every: 1 }, any,
    `{unit}: enemies within ${B.radius} cells bleed ${B.dmg} over ${B.secs} s, every ability round.`),
  skillCard('drill', 'Shield drill', 'Rare', { kind: 'shield', n: 2, every: 2 }, any,
    `{unit}: every other ability round, another tower hits ${pct(2 * TRAINING.shieldBoost.perN)} harder for a round.`),
  skillCard('thirst', 'Bloodthirst', 'Rare', { kind: 'leech', n: 1 }, holder, '{unit}: drains what it holds.'),
  skillCard('rapid', 'Rapid fire', 'Rare', { kind: 'sixes', again: true }),
  { id: 'promote', name: 'Field promotion', rarity: 'Rare', text: '{unit}: a free level-up.', unit: below, apply: (_, t) => { applyLevel(t!); } },
  { id: 'bounty', name: 'Bounty', rarity: 'Rare', text: `Kills pay ${pct(C.bounty)} more credits.`, apply: (run) => { run.mods.bounty += C.bounty; } },
  { id: 'ramparts', name: 'Ramparts', rarity: 'Rare', text: `Mends the base by ${C.ramparts}.`, useful: hurtBase, apply: (run) => mend(run, C.ramparts) },
  skillCard('trance', 'Battle trance', 'Legendary', { kind: 'frenzy', mul: 2, every: 2, time: 1 }),
  skillCard('uplink', 'Orbital uplink', 'Legendary', { kind: 'barrage', hits: 4, ap: 1, every: 2, radius: 1.5 }),
  skillCard('banner', 'Banner of glory', 'Legendary', { kind: 'aura', stat: 'hit', n: 1, radius: 2 }),
  { id: 'heroes', name: 'Heroes of the hour', rarity: 'Legendary', text: 'Every crafted unit levels up for free.',
    useful: (run) => unitTowers(run).some(below), apply: (run) => { unitTowers(run).forEach(applyLevel); } },
  {
    id: 'chains', name: 'Chains', rarity: 'Legendary', text: `Holds last ${pct(C.holdMul - 1)} longer, and a let-go enemy can't be grabbed again for ${C.regrabAdd} s more.`,
    useful: holds, apply: (run) => { run.mods.holdMul *= C.holdMul; run.mods.regrabAdd += C.regrabAdd; },
  },
  { id: 'line', name: 'Hold the line', rarity: 'Legendary', text: '{unit}: +2 Tough (holds walkers longer).', unit: grounded, apply: (_, t) => { t!.tough += 2; } },
];

export const cardById = (id: string) => CARDS.find((c) => c.id === id);
const RANK: Record<RelicTier, number> = { Common: 0, Rare: 1, Legendary: 2 };

/** Would card `c` do something if drawn now: open (Drill Honours), a unit card with a crafted unit it fits, a whole-run
 *  card whose `useful` holds (no mending a full base, no free levels with every unit at its cap, no longer holds with no
 *  unit to hold). */
export const cardUseful = (run: TrainingRun, c: TrainingCard): boolean =>
  cardOpen(run, c.id) && (c.unit ? unitTowers(run).some(c.unit) : c.useful?.(run) ?? true);

/** Draw TRAINING.cards.offer cards: rarity by the odds, no card twice, only useful ones (cardUseful), unit cards to a
 *  crafted unit they fit. */
export function drawCards(run: TrainingRun): CardDraw[] {
  const units = unitTowers(run);
  const out: CardDraw[] = [];
  const fits = (c: TrainingCard) => !out.some((d) => d.id === c.id) && cardUseful(run, c);
  for (let i = 0; i < C.offer + perkOf(run, 'offer'); i++) {
    const r = rand(run);
    const want: RelicTier = r < C.odds.Legendary ? 'Legendary' : r < C.odds.Legendary + C.odds.Rare ? 'Rare' : 'Common';
    // A rarity with nothing left that fits falls back a step.
    const tiers = (['Legendary', 'Rare', 'Common'] as RelicTier[]).filter((x) => RANK[x] <= RANK[want]);
    const pool = tiers.map((x) => CARDS.filter((c) => c.rarity === x && fits(c))).find((p) => p.length);
    if (!pool) break;
    const c = pick(run, pool);
    out.push({ id: c.id, rarity: c.rarity, ...(c.unit ? { unitId: pick(run, units.filter(c.unit)).unitId } : {}) });
  }
  return out;
}

/** Put a draw on offer (a boss died), maybe with a trinket card as well (trinkets.ts). Does nothing while one is
 *  already on offer. */
export function offerCards(run: TrainingRun): void {
  if (run.offer?.length) return;
  const d = drawCards(run);
  const k = trinketOffer(run);
  if (k) d.push(k);
  if (d.length) run.offer = d;
}

/** A drawn card's name and text, its unit named. */
export function cardText(run: TrainingRun, d: CardDraw): { name: string; text: string } {
  if (isTrinketCard(d)) return trinketCardText(run, d);
  const c = cardById(d.id);
  const t = unitTowers(run).find((u) => u.unitId === d.unitId);
  return { name: c?.name ?? d.id, text: (c?.text ?? '').replace('{unit}', t?.name ?? '') };
}

/** Take card `i` of the offer. */
export function pickCard(run: TrainingRun, i: number): void {
  const d = run.offer?.[i];
  if (!d) throw new Error('No such card on offer.');
  if (isTrinketCard(d)) takeTrinket(run, d);
  else {
    const c = cardById(d.id);
    if (!c) throw new Error('No such card.');
    c.apply(run, unitTowers(run).find((u) => u.unitId === d.unitId));
  }
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

/** Re-draw the offer's boss cards (a trinket card on offer stays). Throws on a problem. */
export function rerollCards(run: TrainingRun): void {
  const why = rerollProblem(run);
  if (why) throw new Error(why);
  const kept = run.offer!.filter(isTrinketCard);
  run.rerolls = (run.rerolls ?? 0) + 1;
  const d = [...drawCards(run), ...kept];
  run.offer = d.length ? d : run.offer;
  run.log.push('The card offer is re-drawn.');
}
