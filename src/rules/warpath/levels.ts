import { rand } from '../training/rng';
import { DOCTRINE_IDS, DOCTRINES, WARPATH, type DoctrineId } from './data';
import { heroMaxHp, woundsPer } from './mods';
import type { Card, Squad, WarpathRun } from './types';
import { has, TREE_FX } from './meta';

// Level-ups: the XP curve (slow start, steeper late), three cards (call a unit in, drill one, or a doctrine), three
// rerolls a run, skip for a heal. Once nothing is left to take, a level-up is score and a little healing.

const X = WARPATH.xp;
const K = WARPATH.cards;

/** XP from level n to n + 1. */
export const xpNeed = (n: number) => Math.round(X.base + X.lin * n + X.sq * n * n);

export function gainXp(run: WarpathRun, n: number): void {
  run.xp += n;
  while (run.xp >= xpNeed(run.level)) {
    run.xp -= xpNeed(run.level);
    run.level += 1;
    run.queued += 1;
  }
}

/** Points left under the cap. */
export const pointsLeft = (run: WarpathRun) => WARPATH.cap - run.points;

/** Call-in cards come only on every `callEvery`-th level-up (counting the one open now; supply drops count too). */
export const callLevel = (run: WarpathRun) => (run.levelUps ?? 0) > 0 && (run.levelUps ?? 0) % (has(run, 'muster') ? TREE_FX.musterEvery : K.callEvery) === 0;

/** Every card that could be offered now. */
export function candidates(run: WarpathRun): Card[] {
  const out: Card[] = [];
  if (callLevel(run)) for (const s of run.bench) if (s.points <= pointsLeft(run)) out.push({ kind: 'call', unitId: s.unitId });
  for (const s of run.squads) if (s.level < s.maxLevel) out.push({ kind: 'drill', unitId: s.unitId });
  const held = DOCTRINE_IDS.filter((id) => (run.doctrines[id] ?? 0) > 0);
  for (const id of DOCTRINE_IDS) {
    const l = run.doctrines[id] ?? 0;
    if (l > 0 ? l < WARPATH.doctrines.max : held.length < WARPATH.doctrines.slots + (has(run, 'college') ? 1 : 0)) out.push({ kind: 'doctrine', id });
  }
  return out;
}

const same = (a: Card, b: Card) => a.kind === b.kind && (a.kind === 'doctrine' ? a.id === (b as typeof a).id : a.kind === 'score' || (a as { unitId: string }).unitId === (b as { unitId: string }).unitId);

/** Three cards, drawn by kind (call-ins only every third level-up, and then at least one), no two alike. */
export function drawOffer(run: WarpathRun): Card[] {
  const pool = candidates(run);
  if (!pool.length) return [{ kind: 'score' }];
  const weight = (c: Card) => (c.kind === 'call' ? 1.6 : c.kind === 'drill' ? 1 : 0.9 / Math.max(1, 0.5 * pool.filter((x) => x.kind === 'doctrine').length / 4));
  const out: Card[] = [];
  const left = [...pool];
  // A call-in level always shows at least one unit to call in.
  const calls = left.filter((c) => c.kind === 'call');
  if (calls.length) {
    const c = calls[Math.floor(rand(run) * calls.length)];
    out.push(c);
    left.splice(left.indexOf(c), 1);
  }
  while (out.length < K.offer && left.length) {
    const total = left.reduce((n, c) => n + weight(c), 0);
    let x = rand(run) * total;
    let i = 0;
    for (; i < left.length - 1; i++) if ((x -= weight(left[i])) < 0) break;
    out.push(left[i]);
    left.splice(i, 1);
  }
  return out;
}

/** Open the next level-up, if one is waiting. */
export function openLevelUp(run: WarpathRun): boolean {
  if (run.queued <= 0 || run.phase !== 'play') return false;
  run.queued -= 1;
  run.levelUps = (run.levelUps ?? 0) + 1;
  run.offer = drawOffer(run);
  run.phase = 'card';
  return true;
}

/** Bring a benched unit onto the field at the hero's side. */
export function callIn(run: WarpathRun, unitId: string): Squad | undefined {
  const i = run.bench.findIndex((s) => s.unitId === unitId);
  if (i < 0) return undefined;
  const [s] = run.bench.splice(i, 1);
  const a = rand(run) * Math.PI * 2;
  s.x = run.hx + Math.cos(a) * 6;
  s.y = run.hy + Math.sin(a) * 6;
  s.angle = a;
  // Veteran Cadre: called in a level or two up (within the unit's own cap).
  if (has(run, 'veterans')) s.level = Math.min(s.maxLevel, s.level + TREE_FX.veterans);
  if (s.kind === 'fort') {
    const hp = woundsPer(s) * s.size * WARPATH.fort.hpPerTough;
    s.fort = { hp, maxHp: hp, down: 0, fall: 1.2 };
    s.x = run.hx + Math.cos(a) * WARPATH.fort.land;
    s.y = run.hy + Math.sin(a) * WARPATH.fort.land;
  }
  run.squads.push(s);
  run.points += s.points;
  run.log.push(`${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')} ${s.name} called in (${run.points}/${WARPATH.cap} pts).`);
  return s;
}

/** Take a card. */
export function choose(run: WarpathRun, i: number): void {
  const c = run.offer[i];
  if (!c || run.phase !== 'card') return;
  if (c.kind === 'call') callIn(run, c.unitId);
  else if (c.kind === 'drill') {
    const s = run.squads.find((x) => x.unitId === c.unitId);
    if (s && s.level < s.maxLevel) {
      s.level += 1;
      if (s.fort) {
        s.fort.maxHp *= WARPATH.levels.woundsMul;
        s.fort.hp *= WARPATH.levels.woundsMul;
      }
      if (s.kind === 'hero') {
        const before = run.maxHp;
        run.maxHp = heroMaxHp(run);
        run.hp += run.maxHp - before;
      }
    }
  } else if (c.kind === 'doctrine') {
    // War College: a new doctrine comes in at level 2.
    const l = run.doctrines[c.id] ?? 0;
    run.doctrines[c.id] = Math.min(WARPATH.doctrines.max, l + (l === 0 && has(run, 'college') ? 2 : 1));
  }
  else {
    run.score += WARPATH.score.level;
    run.hp = Math.min(run.maxHp, run.hp + run.maxHp * K.healAtMax);
  }
  close(run);
}

/** Skip the cards for a heal. */
export function skip(run: WarpathRun): void {
  if (run.phase !== 'card') return;
  run.hp = Math.min(run.maxHp, run.hp + run.maxHp * K.skipHeal);
  close(run);
}

export function reroll(run: WarpathRun): void {
  if (run.phase !== 'card' || run.rerolls <= 0) return;
  run.rerolls -= 1;
  run.offer = drawOffer(run);
}

function close(run: WarpathRun) {
  run.offer = [];
  run.phase = 'play';
  openLevelUp(run);
}

/** A card's title and text, for the offer. */
export function cardText(run: WarpathRun, c: Card): { title: string; text: string; tag: string } {
  if (c.kind === 'score') return { title: 'Glory', text: `Everything is at its best: +${WARPATH.score.level} score and ${Math.round(K.healAtMax * 100)}% HP.`, tag: 'Score' };
  if (c.kind === 'doctrine') {
    const d = DOCTRINES[c.id as DoctrineId];
    const l = run.doctrines[c.id] ?? 0;
    return { title: d.name, text: d.text, tag: l ? `Doctrine ${l} → ${l + 1}` : has(run, 'college') ? 'New doctrine · level 2' : 'New doctrine' };
  }
  const s = c.kind === 'call' ? run.bench.find((x) => x.unitId === c.unitId) : run.squads.find((x) => x.unitId === c.unitId);
  if (!s) return { title: '?', text: '', tag: '' };
  if (c.kind === 'call') {
    const guns = s.guns.map((g) => g.name).join(', ');
    return { title: s.name, text: `${s.size > 1 ? `${s.size} models, ` : ''}Q${s.quality}+ D${s.defense}+${s.kind === 'fort' ? ', drops in as a turret' : s.kind === 'air' ? ', flies strafing loops' : ''}. ${guns}.`, tag: `Call in · ${s.points} pts` };
  }
  const lines = s.kind === 'hero'
    ? 'faster attacks, longer reach, more HP and speed'
    : `faster attacks, longer reach, ${s.kind === 'fort' ? `×${WARPATH.levels.woundsMul} HP` : `${woundsPer(s) * WARPATH.levels.woundsMul} wounds a model`}`;
  return { title: s.name, text: `Level ${s.level} → ${s.level + 1}: ${lines}${(s.level + 1) % WARPATH.levels.dmgEvery === 0 ? ', harder hits' : ''}.`, tag: `Drill · max ${s.maxLevel}` };
}

export { same as sameCard };
