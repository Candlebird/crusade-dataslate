import { TRAINING } from '../../rules/downtimeData';
import { BASE, N, WAYPOINTS, centreOf, isFlyBossWave, isFlyWave, laneCells, type TrainingRun } from '../../rules/training';
import { BASE_ICON, COVER_ICONS, bar, drawIcon, label, roundRect } from './art';
import { walkPath } from './routePath';

// Canvas drawing for the Training map's ground: the grid, the no-build corner, the route, dangerous terrain, the pads and the base.
// Same frame as draw.ts: `s` pixels a cell, the canvas translated to the map's corner.

/** The ground, a faint grid and the hatched no-build corner where the enemy comes in. */
export function drawGround(ctx: CanvasRenderingContext2D, s: number) {
  const w = N * s;
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, 0, w, w);
  // Every cell when close enough to tell them apart, else every other one (pieces are 2×2), fainter.
  const every = s >= 8 ? 1 : 2;
  ctx.strokeStyle = s >= 8 ? '#1c2129' : '#181c22';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = every; i < N; i += every) {
    ctx.moveTo(i * s + 0.5, 0); ctx.lineTo(i * s + 0.5, w);
    ctx.moveTo(0, i * s + 0.5); ctx.lineTo(w, i * s + 0.5);
  }
  ctx.stroke();
  const nb = (TRAINING.route.noBuild + 1) * s;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, nb, nb); ctx.clip();
  ctx.fillStyle = 'rgba(179,53,43,0.08)';
  ctx.fillRect(0, 0, nb, nb);
  ctx.strokeStyle = 'rgba(179,53,43,0.16)';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.beginPath();
  const step = Math.max(5, s * 1.2);
  for (let d = 0; d < nb * 2; d += step) { ctx.moveTo(d, 0); ctx.lineTo(d - nb, nb); }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(179,53,43,0.4)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0.5, 0.5, nb, nb);
  ctx.setLineDash([]);
  ctx.strokeStyle = '#2c333d';
  ctx.strokeRect(0.5, 0.5, w - 1, w - 1);
}

/** Dangerous terrain: rust-red hazard patches with thorns or ruins on them (Echoes walk slower through one). */
export function drawCover(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  const n = TRAINING.terrain.size;
  for (const c of run.cover) {
    roundRect(ctx, c.x * s + 1, c.y * s + 1, n * s - 2, n * s - 2, s * 0.6);
    ctx.fillStyle = 'rgba(150,72,48,0.2)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(204,104,72,0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([Math.max(2, s * 0.3), Math.max(2, s * 0.25)]);
    ctx.stroke();
    ctx.setLineDash([]);
    const icon = COVER_ICONS[(c.x + c.y) % COVER_ICONS.length];
    drawIcon(ctx, icon, (c.x + n / 2) * s, (c.y + n / 2) * s, n * s * 0.62, 'rgba(208,120,88,0.5)');
  }
}

/** Is wave `w` one with flyers in it. */
const flies = (w: number) => isFlyWave(w) || isFlyBossWave(w);

/**
 * The route walkers take through the maze as it stands, with arrows along it while building (faint during a wave so
 * the enemies stand out), and the flyers' straight lanes pad to pad (a faint band while building) on a wave that has
 * flyers.
 */
export function drawRoute(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  const build = run.phase !== 'wave';
  const wave = build ? run.wave + 1 : run.wave;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (flies(wave)) {
    // While building, a faint band where pieces can shoot what flies (flightLane.ts): anti-air goes beside it.
    if (build) {
      ctx.fillStyle = 'rgba(190,150,255,0.06)';
      for (const c of laneCells()) ctx.fillRect(c.x * s, c.y * s, s, s);
    }
    const pts = WAYPOINTS.map(centreOf);
    // Round violet dots, so the lane never reads as a second walk route beside the dashed one.
    ctx.strokeStyle = build ? 'rgba(190,150,255,0.75)' : 'rgba(190,150,255,0.3)';
    ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.setLineDash([0, Math.max(5, s * 0.9)]);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
    ctx.stroke();
  }
  const path = walkPath(run);
  const trace = () => {
    ctx.beginPath();
    path.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
  };
  ctx.setLineDash([]);
  ctx.strokeStyle = build ? 'rgba(150,175,215,0.08)' : 'rgba(150,175,215,0.04)';
  ctx.lineWidth = Math.max(4, s * 0.9);
  trace();
  ctx.stroke();
  ctx.strokeStyle = build ? 'rgba(160,185,225,0.55)' : 'rgba(160,185,225,0.16)';
  ctx.lineWidth = Math.max(1.5, s * 0.14);
  ctx.setLineDash([Math.max(3, s * 0.45), Math.max(3, s * 0.4)]);
  trace();
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineCap = 'butt';
  if (!build) return;
  // An arrowhead every few cells, pointing the way the enemy walks.
  ctx.fillStyle = 'rgba(190,210,240,0.7)';
  const a = Math.max(2.5, s * 0.32);
  for (let i = 6; i < path.length - 1; i += 7) {
    const p = path[i];
    const q = path[i + 1];
    const t = Math.atan2(q.y - p.y, q.x - p.x);
    ctx.save();
    ctx.translate(p.x * s, p.y * s);
    ctx.rotate(t);
    ctx.beginPath(); ctx.moveTo(a, 0); ctx.lineTo(-a * 0.7, a * 0.75); ctx.lineTo(-a * 0.7, -a * 0.75); ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

/** The spawn (S), the numbered pads, and the base keep with its HP. Drawn over the terrain, so a patch never hides one. */
export function drawPads(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  const inset = Math.max(1, s * 0.1);
  const tile = (x: number, y: number) => roundRect(ctx, x * s + inset, y * s + inset, 2 * s - 2 * inset, 2 * s - 2 * inset, s * 0.35);
  WAYPOINTS.slice(0, -1).forEach((w, i) => {
    tile(w.x, w.y);
    if (i) {
      ctx.fillStyle = '#242a33';
      ctx.strokeStyle = 'rgba(224,182,110,0.8)';
    } else {
      const g = ctx.createRadialGradient((w.x + 1) * s, (w.y + 1) * s, 0, (w.x + 1) * s, (w.y + 1) * s, s * 1.3);
      g.addColorStop(0, 'rgba(230,80,60,0.9)');
      g.addColorStop(1, 'rgba(80,24,22,0.95)');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#e0604c';
    }
    ctx.lineWidth = Math.max(1.5, s * 0.14);
    ctx.fill();
    ctx.stroke();
    label(ctx, i ? String(i) : 'S', (w.x + 1) * s, (w.y + 1) * s + 1, s * 1.05, i ? '#efdcb4' : '#fff0ea');
  });
  const b = BASE.tile;
  tile(b.x, b.y);
  ctx.fillStyle = '#163035';
  ctx.strokeStyle = '#5fb3b3';
  ctx.lineWidth = Math.max(2, s * 0.16);
  ctx.fill();
  ctx.stroke();
  drawIcon(ctx, BASE_ICON, BASE.x * s, BASE.y * s, s * 1.45, '#9fe0e0');
  const share = run.baseHp / TRAINING.baseHp;
  const h = Math.max(4, s * 0.35);
  bar(ctx, (BASE.x - 1.4) * s, (b.y + 2) * s + 3, s * 2.8, share, share > 0.3 ? '#5fd0d0' : '#ff5a4a', h);
}
