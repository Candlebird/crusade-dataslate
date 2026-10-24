import { TRAINING_ENEMIES } from '../../rules/downtimeData';
import { BASE, type TrainingRun } from '../../rules/training';

// View-only fx the engine doesn't make: a burst where an enemy dies, and a red flash on the base when one gets
// through. Found by watching the run between frames (an enemy gone while still alive near the base leaked; any other
// gone enemy died), so nothing here touches the run.

interface Burst { x: number; y: number; color: string; r: number; born: number; boss: boolean }
interface Watch { seen: Map<number, { x: number; y: number; color: string; r: number; boss: boolean }>; hp: number; bursts: Burst[]; flash: number; wave: number }

const BURST = 0.45;
const FLASH = 0.5;
const watched = new WeakMap<TrainingRun, Watch>();

/** Note what changed since the last frame, at `now` seconds. */
export function trackBursts(run: TrainingRun, now: number) {
  let w = watched.get(run);
  if (!w) watched.set(run, (w = { seen: new Map(), hp: run.baseHp, bursts: [], flash: -1, wave: run.wave }));
  if (run.baseHp < w.hp) w.flash = now;
  w.hp = run.baseHp;
  // A new wave (or a loaded run) starts the watch afresh.
  if (run.wave !== w.wave) { w.seen.clear(); w.wave = run.wave; }
  const live = new Set<number>();
  for (const e of run.enemies) {
    live.add(e.id);
    const d = TRAINING_ENEMIES[e.kind];
    w.seen.set(e.id, { x: e.x, y: e.y, color: d.color, r: d.size, boss: d.spawn === 'boss' });
  }
  for (const [id, e] of w.seen) {
    if (live.has(id)) continue;
    w.seen.delete(id);
    // Ending a run clears the enemies off: no bursts for that.
    if (run.phase !== 'over' && Math.hypot(e.x - BASE.x, e.y - BASE.y) > BASE.radius + 0.5) w.bursts.push({ ...e, born: now });
  }
  w.bursts = w.bursts.filter((b) => now - b.born < BURST * (b.boss ? 2 : 1));
}

/** Are any bursts or flashes still playing (the map keeps redrawing while they are). */
export function burstsLive(run: TrainingRun, now: number): boolean {
  const w = watched.get(run);
  return !!w && (w.bursts.length > 0 || now - w.flash < FLASH);
}

/** Draw the bursts and the base flash, at `s` pixels a cell. */
export function drawBursts(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, now: number) {
  const w = watched.get(run);
  if (!w) return;
  for (const b of w.bursts) {
    const life = BURST * (b.boss ? 2 : 1);
    const k = (now - b.born) / life;
    if (k < 0 || k >= 1) continue;
    const x = b.x * s;
    const y = b.y * s;
    const r = Math.max(4, b.r * s) * (b.boss ? 2 : 1);
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath(); ctx.arc(x, y, r * (0.6 + 1.4 * k), 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = b.color;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + b.born;
      const d = r * (0.4 + 2 * k);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, Math.max(1, r * 0.25 * (1 - k)), 0, Math.PI * 2); ctx.fill();
    }
  }
  const f = now - w.flash;
  if (f >= 0 && f < FLASH) {
    ctx.globalAlpha = 0.55 * (1 - f / FLASH);
    ctx.fillStyle = '#ff4a3a';
    ctx.beginPath(); ctx.arc(BASE.x * s, BASE.y * s, s * (1.4 + f * 3), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
