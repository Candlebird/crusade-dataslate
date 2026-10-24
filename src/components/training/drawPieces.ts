import type { EmblemLayer } from '../../model/types';
import type { Category } from '../../rules/data';
import type { Grade, RubblePiece, ShardPiece, Tile, UnitTower } from '../../rules/training';
import type { ShardType } from '../../rules/downtimeData';
import { drawEmblem } from '../Emblem';
import { RUBBLE_ICON, SHARD_ICON, alpha, drawIcon, gradeTint, label, pipRow, roundRect, shade, shardColor } from './art';

// Canvas drawing for the pieces on the Training map: Shards, rubble and crafted units. Same frame as draw.ts.

export const CATEGORY_COLORS: Record<Category, string> = {
  Hero: '#c9a24a',
  Infantry: '#6f9a4a',
  Elite: '#5fb3b3',
  'Vehicle/Monster': '#b3352b',
  Aircraft: '#8f7fd0',
  Fortification: '#8d8778',
};

/** What a unit's hold ring and grab line are drawn in (not the gold of ready recipes). */
export const HOLD_COLOR = '#7fe8ff';
/** Ready-recipe glow and focus (DraftPanel's keep hover). */
export const FOCUS_COLOR = '#ffe08a';

/** A 2×2 piece's rounded plate path, inset from its cells. */
function platePath(ctx: CanvasRenderingContext2D, p: Tile, s: number, inset = Math.max(1, s * 0.09)) {
  roundRect(ctx, p.x * s + inset, p.y * s + inset, 2 * s - 2 * inset, 2 * s - 2 * inset, s * 0.3);
}

/** A Shard's crystal, `size` pixels, centred on (x, y): dull and small-glowed at low grades, bright and haloed at high. */
export function drawCrystal(ctx: CanvasRenderingContext2D, type: ShardType, grade: Grade, x: number, y: number, size: number) {
  const color = shardColor(type);
  if (grade >= 3) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.7);
    g.addColorStop(0, alpha(color, 0.1 * (grade - 2)));
    g.addColorStop(1, alpha(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - size, y - size, size * 2, size * 2);
  }
  ctx.save();
  // A dark outline first, so even a dull crystal stands off its plate.
  ctx.shadowColor = grade >= 4 ? color : 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = grade >= 4 ? size * 0.25 * (grade - 3) : Math.max(1, size * 0.06);
  drawIcon(ctx, SHARD_ICON[type], x, y, size, gradeTint(color, grade));
  ctx.restore();
}

/** A Shard: its type's crystal on a type-rimmed plate, with bright grade pips. Draft pieces get a dashed rim and a corner tag. */
export function drawShard(ctx: CanvasRenderingContext2D, p: ShardPiece, s: number, glow: boolean, time: number) {
  const color = shardColor(p.type);
  platePath(ctx, p, s);
  ctx.fillStyle = '#262c35';
  ctx.fill();
  ctx.strokeStyle = alpha(color, 0.35 + p.grade * 0.08);
  ctx.lineWidth = 1;
  ctx.stroke();
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.35 * Math.sin(time * 5);
    ctx.shadowColor = FOCUS_COLOR;
    ctx.shadowBlur = Math.min(16, s * 1.2);
    ctx.strokeStyle = FOCUS_COLOR;
    ctx.lineWidth = Math.min(4, Math.max(2, s * 0.18));
    platePath(ctx, p, s, 1);
    ctx.stroke();
    ctx.restore();
  }
  drawCrystal(ctx, p.type, p.grade, (p.x + 1) * s, (p.y + 0.82) * s, s * 1.25);
  pipRow(ctx, (p.x + 1) * s, (p.y + 1.7) * s, p.grade, Math.max(1.5, s * 0.12), shade(color, 0.15));
  if (p.draft) {
    ctx.strokeStyle = 'rgba(240,240,240,0.85)';
    ctx.lineWidth = Math.min(3, Math.max(1, s * 0.09));
    ctx.setLineDash([Math.max(2, s * 0.25), Math.max(2, s * 0.2)]);
    platePath(ctx, p, s, 1.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // A small white corner tag: not kept yet.
    const t = Math.max(3, s * 0.45);
    ctx.fillStyle = 'rgba(240,240,240,0.9)';
    ctx.beginPath(); ctx.moveTo(p.x * s + 1, p.y * s + 1); ctx.lineTo(p.x * s + 1 + t, p.y * s + 1); ctx.lineTo(p.x * s + 1, p.y * s + 1 + t); ctx.closePath();
    ctx.fill();
  }
}

/** Rubble: no plate, a faint hatched footprint and a low stone pile, so it reads as ground, not a Shard. */
export function drawRubble(ctx: CanvasRenderingContext2D, p: RubblePiece, s: number) {
  ctx.save();
  platePath(ctx, p, s);
  ctx.fillStyle = 'rgba(60,54,46,0.35)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = 'rgba(140,128,110,0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  const step = Math.max(3, s * 0.5);
  for (let d = 0; d < 4 * s; d += step) { ctx.moveTo(p.x * s + d, p.y * s); ctx.lineTo(p.x * s + d - 2 * s, p.y * s + 2 * s); }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = 0.6;
  drawIcon(ctx, RUBBLE_ICON, (p.x + 1) * s, (p.y + 1.05) * s, s * 1.4, '#8a8172');
  ctx.restore();
}

/** A crafted unit: a dark plate rimmed in its category's colour with a drop shadow, its Emblem, level pips and state rings. */
export function drawUnit(ctx: CanvasRenderingContext2D, t: UnitTower, s: number, face: EmblemLayer[] | undefined, time: number) {
  const color = CATEGORY_COLORS[t.category] ?? CATEGORY_COLORS.Fortification;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = Math.max(2, s * 0.35);
  ctx.shadowOffsetY = Math.max(1, s * 0.12);
  platePath(ctx, t, s, Math.max(1, s * 0.06));
  ctx.fillStyle = '#1b1f26';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.min(5, Math.max(2, s * 0.14));
  platePath(ctx, t, s, Math.max(1.5, s * 0.12));
  ctx.stroke();
  if (face) drawEmblem(ctx, face, t.x * s + s * 0.28, t.y * s + s * 0.28, s * 1.44);
  else label(ctx, t.name.slice(0, 1).toUpperCase(), (t.x + 1) * s, (t.y + 1) * s + 1, s * 0.95, color);
  if (t.up) pipRow(ctx, (t.x + 1) * s, t.y * s + Math.max(2, s * 0.14), t.up, Math.max(1.5, s * 0.11), '#ffd45a');
  const cx = (t.x + 1) * s;
  const cy = (t.y + 1) * s;
  const ring = (col: string, r: number, dash?: number[]) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.min(4, Math.max(1.5, s * 0.12));
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.arc(cx, cy, r * s, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  };
  if (t.dmgBoost.left > 0) ring('#5ab0ff', 1.3);
  if (t.frenzy > 0) {
    ctx.save();
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 12);
    ring('#ff6a4a', 1.45);
    ctx.restore();
  }
  if (t.holding !== undefined) {
    ctx.save();
    ctx.lineDashOffset = -time * s * 2;
    ring(HOLD_COLOR, 1.15, [Math.max(2, s * 0.3), Math.max(2, s * 0.2)]);
    ctx.restore();
  }
}
