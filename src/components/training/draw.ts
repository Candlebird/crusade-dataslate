import type { EmblemLayer } from '../../model/types';
import { SHARD_TYPES, TRAINING } from '../../rules/downtimeData';
import { centreOf, pieceById, reach, type DrawnShard, type Piece, type Tile, type TrainingRun } from '../../rules/training';
import { label, roundRect } from './art';
import { drawCrystal, drawRubble, drawShard, drawUnit } from './drawPieces';
import { drawCover, drawGround, drawPads, drawRoute } from './drawTerrain';

// Canvas drawing for the Training map: the board under the enemies (ground and pads in drawTerrain.ts, pieces in
// drawPieces.ts), the selection and the placement ghost. Everything is drawn at `s` pixels a cell, with the canvas
// already translated to the map's corner; enemies and fx are in drawLive.ts.

export { CATEGORY_COLORS } from './drawPieces';
export { bar } from './art';

/** What the map shows on top of the run itself. */
export interface Overlay {
  portraits: Record<string, EmblemLayer[]>;
  /** Shard ids that count toward a ready recipe. */
  glow: ReadonlySet<number>;
  selected?: number;
  /** A placement ghost: what would go down, where, and whether it may. */
  ghost?: { shard?: DrawnShard; at: Tile; ok: boolean };
  /** Seconds, for pulsing glows. */
  time: number;
}

export function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, s: number, o: Overlay) {
  if (p.kind === 'shard') drawShard(ctx, p, s, o.glow.has(p.id), o.time);
  else if (p.kind === 'rubble') drawRubble(ctx, p, s);
  else drawUnit(ctx, p, s, o.portraits[p.unitId], o.time);
}

/** A faint disc and a dashed ring for a reach of `r` cells round (x, y) cells. */
function reachRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, s: number, color: string, fill: string) {
  ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The selected piece: a white rim and a ring for each reach of its weapons. */
export function drawSelection(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, id: number | undefined) {
  const p = id === undefined ? undefined : pieceById(run, id);
  if (!p) return;
  if (p.kind !== 'rubble') {
    const c = centreOf(p);
    for (const r of [...new Set(p.guns.map((g) => reach(p, g)))].sort((a, b) => b - a)) {
      reachRing(ctx, c.x, c.y, r, s, 'rgba(232,200,120,0.8)', 'rgba(232,200,120,0.06)');
    }
  }
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  roundRect(ctx, p.x * s, p.y * s, 2 * s, 2 * s, s * 0.35);
  ctx.stroke();
}

/** Where a piece would go: its 2×2 footprint, green when it may go there and red when not, with the Shard and its reach. */
export function drawGhost(ctx: CanvasRenderingContext2D, s: number, g: Overlay['ghost']) {
  if (!g) return;
  const { at, ok, shard } = g;
  if (ok && shard) {
    const def = SHARD_TYPES[shard.type];
    reachRing(ctx, at.x + 1, at.y + 1, def.gun.melee ? TRAINING.meleeReach : def.gun.range, s, 'rgba(111,220,111,0.6)', 'rgba(111,220,111,0.05)');
  }
  roundRect(ctx, at.x * s, at.y * s, 2 * s, 2 * s, s * 0.35);
  ctx.fillStyle = ok ? 'rgba(111,220,111,0.22)' : 'rgba(220,60,50,0.3)';
  ctx.fill();
  ctx.strokeStyle = ok ? '#6fdc6f' : '#dc3c32';
  ctx.lineWidth = 2;
  ctx.stroke();
  if (shard) {
    ctx.save();
    ctx.globalAlpha = ok ? 0.8 : 0.45;
    drawCrystal(ctx, shard.type, shard.grade, (at.x + 1) * s, (at.y + 0.95) * s, s * 1.25);
    ctx.restore();
  }
}

/** The whole board under the enemies: ground, route, cover, pads, pieces, selection and ghost. */
export function drawBoard(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, o: Overlay) {
  drawGround(ctx, s);
  drawRoute(ctx, run, s);
  drawCover(ctx, run, s);
  drawPads(ctx, run, s);
  for (const p of run.pieces) drawPiece(ctx, p, s, o);
  drawSelection(ctx, run, s, o.selected);
  drawGhost(ctx, s, o.ghost);
}

/** A dim layer over the whole view, `w` × `h` pixels, with a word in the middle (paused, run over). Screen frame. */
export function drawVeil(ctx: CanvasRenderingContext2D, w: number, h: number, text: string | null, dim = 0.55) {
  ctx.fillStyle = `rgba(12,13,15,${dim})`;
  ctx.fillRect(0, 0, w, h);
  if (!text) return;
  const px = Math.max(14, Math.min(40, Math.min(w, h) * 0.06));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = 8;
  label(ctx, text, w / 2, h / 2, px, '#f0e6cc');
  ctx.restore();
}
