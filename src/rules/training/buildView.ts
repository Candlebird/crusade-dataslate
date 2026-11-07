import { TRAINING } from '../downtimeData';
import { aceSteps, chainMax, packCount, packLimit } from './harm';
import { cardById, cardText, cardTower, isSpecial, type CardTower } from './cards';
import { cardOpen } from './drill';
import { roleOfTower, specById, specProgress, specReady, specsOf, type RoleId, type TrainingSpec } from './specs';
import { STRATAGEMS, stratStatus, heldCount, type Stratagem, type StratStatus } from './stratagems';
import { TROPHY_PREFIX, trophyById } from './trophies';
import type { TrainingRun } from './types';

// The build panel's view of a run (pure): every crafted unit and emplacement with the cards it holds and their live
// numbers, specs, relics and auras; stratagems by status; trophies and whole-run cards; card groups Drill still locks.

const pct = (n: number) => `${Math.round(n * 100)}%`;

export interface HeldCard {
  name: string;
  text: string;
  rarity: string;
}

export interface BuildTower {
  id: number;
  name: string;
  kind: 'unit' | 'default';
  role?: RoleId;
  spec?: TrainingSpec;
  /** Spec progress in words, and the two it may pick (when ready and not yet picked). */
  specLine?: string;
  specChoice?: TrainingSpec[];
  cards: HeldCard[];
  /** Live numbers: hit harder, to-hit, Crossfire, Pack, Ace, Kill chain and the like, in words. */
  live: string[];
  relics: string[];
  auras: string[];
  kills: number;
  dealt: number;
}

export interface BuildStrat {
  strat: Stratagem;
  status: StratStatus;
  /** Each paired card's name, how many the run holds, and whether Drill still locks it. */
  needs: { name: string; held: number; locked: boolean }[];
}

export interface BuildView {
  towers: BuildTower[];
  strats: BuildStrat[];
  trophies: HeldCard[];
  /** Whole-run cards taken (no tower). */
  runCards: HeldCard[];
  /** Card groups Drill Honours still lock: their names and cards. */
  locked: { name: string; cards: string[] }[];
}

/** A tower's live card numbers, in words. */
export function liveLines(run: TrainingRun, t: CardTower): string[] {
  const out: string[] = [];
  if (Math.abs(t.atkBonus - 1) > 0.001) out.push(`Hits ${pct(t.atkBonus - 1)} ${t.atkBonus >= 1 ? 'harder' : 'softer'}`);
  if (t.hitShoot || t.hitMelee) out.push(t.hitShoot === t.hitMelee ? `${t.hitShoot > 0 ? '+' : ''}${t.hitShoot} to hit` : `${t.hitShoot >= 0 ? '+' : ''}${t.hitShoot} to hit shooting, ${t.hitMelee >= 0 ? '+' : ''}${t.hitMelee} in melee`);
  if (t.crossfire) out.push(`Crossfire: ${pct(t.crossfire)} harder against a held enemy`);
  if (t.chain) out.push(`Kill chain: ${pct(t.chain.per)} faster a kill, up to ${chainMax(run)} (now ${t.chain.left > 0 ? t.chain.stacks : 0})`);
  if (t.kind === 'unit') {
    if (t.pack) out.push(`Pack tactics: ${pct(t.pack)} a unit near it, up to ${packLimit(run)} units, +${pct(t.pack * packLimit(run))} (now +${pct(t.pack * packCount(run, t))})`);
    if (t.ace) out.push(`Ace: ${pct(t.ace)} per ${TRAINING.cards.ace.per} kills, up to +${pct(t.ace * TRAINING.cards.ace.max)} (now +${pct(t.ace * aceSteps(t))})`);
    if (t.tough > 1) out.push(`Tough ${t.tough}`);
  }
  return out;
}

export function buildOf(run: TrainingRun): BuildView {
  const ts = run.pieces.filter((p): p is CardTower => p.kind === 'unit' || p.kind === 'default');
  const towers: BuildTower[] = ts.map((t) => {
    const mine = run.cards.filter((d) => cardTower(run, d) === t && !(isSpecial(d) && !d.id.startsWith(TROPHY_PREFIX)));
    const cards = mine.map((d) => ({ ...cardText(run, d), rarity: isSpecial(d) ? 'Trophy' : d.rarity }));
    const base: BuildTower = { id: t.id, name: t.name, kind: t.kind, cards, live: liveLines(run, t), relics: [], auras: [], kills: t.kills, dealt: t.dealt };
    if (t.kind !== 'unit') return base;
    const role = roleOfTower(t);
    const spec = specById(t.spec);
    return {
      ...base, role, spec,
      ...(spec ? {} : { specLine: specProgress(t), ...(specReady(t) ? { specChoice: specsOf(role) } : {}) }),
      relics: (t.relics ?? []).map((r) => r.name),
      auras: t.skills.flatMap((s) => (s.effect.kind === 'aura' ? [`${s.source}: ${auraWords(s.effect.stat, s.effect.n)} within ${s.effect.radius} cells`] : [])),
    };
  });
  const strats = STRATAGEMS.map((s) => ({
    strat: s, status: stratStatus(run, s),
    needs: s.needs.map((c) => ({ name: cardById(c)?.name ?? c, held: heldCount(run, c), locked: !cardOpen(run, c) })),
  }));
  const trophies = (run.trophies ?? []).map((id) => {
    const tr = trophyById(id);
    const d = run.cards.find((x) => x.id === TROPHY_PREFIX + id);
    return { name: tr?.name ?? id, text: d ? cardText(run, d).text : tr?.text ?? '', rarity: 'Trophy' };
  });
  const runCards = run.cards.filter((d) => !isSpecial(d) && !cardById(d.id)?.fits).map((d) => ({ ...cardText(run, d), rarity: d.rarity }));
  const locked = Object.values(TRAINING.drill.groups).filter((g) => g.cards.some((c) => !cardOpen(run, c)))
    .map((g) => ({ name: g.name, cards: g.cards.map((c) => cardById(c)?.name ?? c) }));
  return { towers, strats, trophies, runCards, locked };
}

const auraWords = (stat: string, n: number) =>
  stat === 'hit' ? `+${n} to hit` : stat === 'rate' ? `${pct(n)} faster` : stat === 'range' ? `+${n} reach` : `+${n} ${stat}`;
