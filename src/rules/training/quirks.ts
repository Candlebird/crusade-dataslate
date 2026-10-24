import type { Unit } from '../../model/types';
import { TRAINING } from '../downtimeData';
import { addQuirk, quirkInfo } from '../sortie';
import { centreOf, dist, unitTowers } from './board';
import { isBoss, reach } from './harm';
import { rand } from './rng';
import { watchOf } from './tally';
import type { QuirkGain, TrainingRun, UnitTower } from './types';

// Quirks earned in Training, from the one list Sortie uses. A long run can give the MVP a good one to match what it
// did best; a boss walking past a unit that never touched it can leave a bad one. Rolled once as the run ends
// (run.gains), shown in the summary and put on the units at bank (shared.ts bankShared).

const Q = TRAINING.shared.quirks;

/** Note every crafted unit a live boss is within reach of (any of its guns): it had its chance. After walk. */
export function watchBosses(run: TrainingRun): void {
  const ts = unitTowers(run);
  for (const e of run.enemies) {
    if (e.hp <= 0 || !isBoss(e)) continue;
    for (const t of ts) {
      const c = centreOf(t);
      const r = Math.max(0, ...t.guns.map((g) => reach(t, g)));
      if (dist(c.x, c.y, e.x, e.y) > r) continue;
      const w = watchOf(run, e);
      if (!w.passed.includes(t.unitId)) w.passed.push(t.unitId);
    }
  }
}

/** What a unit did most this run: shot, melee, or held (each hold counted as Q.holdDmg damage). Shot when it did nothing. */
export function topStat(t: UnitTower): 'shot' | 'melee' | 'holds' {
  const s = t.tally ?? { shot: 0, melee: 0, holds: 0 };
  const h = s.holds * Q.holdDmg;
  if (s.melee > s.shot && s.melee >= h) return 'melee';
  if (h > s.shot && h > s.melee) return 'holds';
  return 'shot';
}

/** The first quirk of `ids` the unit could take (Sortie's addQuirk rules, tried on a copy). */
function firstNew(t: UnitTower, ids: string[]): string | undefined {
  return ids.find((id) => addQuirk({ quirks: [...(t.quirks ?? [])] } as Unit, id));
}

/** Units a boss walked within reach of and that never hit it. */
export function snubbed(run: TrainingRun): Set<string> {
  const out = new Set<string>();
  for (const w of Object.values(run.watch ?? {})) for (const id of w.passed) if (!w.hit.includes(id)) out.add(id);
  return out;
}

/** Roll the run's quirk gains (once; run.gains). A good one for the MVP on a run that reached wave Q.goodFrom, at Q.good;
 *  a bad one at Q.bad for each unit a boss passed untouched. Each matches what the unit did most. */
export function rollGains(run: TrainingRun): QuirkGain[] {
  if (run.gains) return run.gains;
  const out: QuirkGain[] = [];
  // The MVP as run.mvp has it (most kills, then damage); not imported, run.ts imports this module.
  const best = [...unitTowers(run)].sort((a, b) => b.kills - a.kills || b.dealt - a.dealt)[0];
  if (best && best.kills > 0 && run.wave >= Q.goodFrom && rand(run) < Q.good) {
    const id = firstNew(best, Q.goods[topStat(best)]);
    if (id) out.push({ unitId: best.unitId, name: best.name, quirk: id, good: true });
  }
  const snub = snubbed(run);
  for (const t of unitTowers(run)) {
    if (!snub.has(t.unitId) || rand(run) >= Q.bad) continue;
    const id = firstNew(t, Q.bads[topStat(t)]);
    if (id) out.push({ unitId: t.unitId, name: t.name, quirk: id, good: false });
  }
  run.gains = out;
  for (const g of out) run.log.push(`${g.name} comes away ${quirkInfo(g.quirk)?.name ?? g.quirk}.`);
  return out;
}
