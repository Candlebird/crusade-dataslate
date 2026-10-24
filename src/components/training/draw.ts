import type { EmblemLayer } from '../../model/types';
import type { Category } from '../../rules/data';
import { SHARD_TYPES, TRAINING } from '../../rules/downtimeData';
import {
  BASE, N, WAYPOINTS, centreOf, isFlyWave, pieceById, reach, routeOf,
  type DrawnShard, type Piece, type RubblePiece, type ShardPiece, type Tile, type TrainingRun, type UnitTower,
} from '../../rules/training';
import { drawEmblem } from '../Emblem';
import { COVER_ICONS, RUBBLE_ICON, SHARD_ICON, drawIcon, gradeTint } from './art';

// Canvas drawing for the Training map: ground, cover, route, pads and base, and the pieces on it. Everything is drawn
// at `s` pixels a cell, with the canvas already translated to the map's corner; enemies and fx are in drawLive.ts.

export const CATEGORY_COLORS: Record<Category, string> = {
  Hero: '#c9a24a',
  Infantry: '#6f9a4a',
  Elite: '#5fb3b3',
  'Vehicle/Monster': '#b3352b',
  Aircraft: '#8f7fd0',
  Fortification: '#8d8778',
};

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

export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, share: number, color: string, h = 4) {
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * Math.max(0, Math.min(1, share)), h);
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(8, Math.round(px))}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** The ground, a faint grid and the no-build corner where the enemy comes in. */
export function drawGround(ctx: CanvasRenderingContext2D, s: number) {
  const w = N * s;
  ctx.fillStyle = '#12151a';
  ctx.fillRect(0, 0, w, w);
  const nb = TRAINING.route.noBuild + 1;
  ctx.fillStyle = 'rgba(179,53,43,0.14)';
  ctx.fillRect(0, 0, nb * s, nb * s);
  ctx.strokeStyle = 'rgba(179,53,43,0.35)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(0.5, 0.5, nb * s, nb * s);
  ctx.setLineDash([]);
  // Every cell when close enough to tell them apart, else every other one (pieces are 2×2).
  const every = s >= 8 ? 1 : 2;
  ctx.strokeStyle = '#1e232b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = every; i < N; i += every) {
    ctx.moveTo(i * s, 0); ctx.lineTo(i * s, w);
    ctx.moveTo(0, i * s); ctx.lineTo(w, i * s);
  }
  ctx.stroke();
  ctx.strokeStyle = '#2c333d';
  ctx.strokeRect(0, 0, w, w);
}

/** Cover: green patches with brush or ruins on them (ranged hits on an enemy in one are at −1). */
export function drawCover(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  const n = TRAINING.cover.size;
  for (const c of run.cover) {
    ctx.fillStyle = 'rgba(70,120,60,0.28)';
    ctx.fillRect(c.x * s, c.y * s, n * s, n * s);
    ctx.strokeStyle = 'rgba(111,154,74,0.45)';
    ctx.lineWidth = 1;
    ctx.strokeRect(c.x * s + 0.5, c.y * s + 0.5, n * s - 1, n * s - 1);
    const icon = COVER_ICONS[(c.x + c.y) % COVER_ICONS.length];
    drawIcon(ctx, icon, (c.x + n / 2) * s, (c.y + n / 2) * s, n * s * 0.7, 'rgba(120,170,90,0.7)');
  }
}

/** The route walkers take through the maze as it stands, and the flyers' straight lanes pad to pad. */
export function drawRoute(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  const next = run.phase === 'wave' ? run.wave : run.wave + 1;
  const pts = WAYPOINTS.map(centreOf);
  ctx.strokeStyle = isFlyWave(next) ? 'rgba(143,127,208,0.55)' : 'rgba(143,127,208,0.18)';
  ctx.lineWidth = Math.max(1, s * 0.08);
  ctx.setLineDash([s * 0.6, s * 0.6]);
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x * s, p.y * s) : ctx.moveTo(p.x * s, p.y * s)));
  ctx.stroke();
  const path = routeOf(run);
  ctx.strokeStyle = run.phase === 'build' ? 'rgba(179,53,43,0.6)' : 'rgba(179,53,43,0.3)';
  ctx.lineWidth = Math.max(2, s * 0.22);
  ctx.setLineDash([s * 0.5, s * 0.4]);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  path.forEach((p, i) => (i ? ctx.lineTo((p.x + 0.5) * s, (p.y + 0.5) * s) : ctx.moveTo((p.x + 0.5) * s, (p.y + 0.5) * s)));
  ctx.stroke();
  ctx.setLineDash([]);
}

/** The spawn (S), the numbered pads and the base with its HP. */
export function drawPads(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number) {
  WAYPOINTS.slice(0, -1).forEach((w, i) => {
    ctx.fillStyle = i ? '#3b2a2a' : '#5a2320';
    ctx.strokeStyle = '#b3352b';
    ctx.lineWidth = 1.5;
    ctx.fillRect(w.x * s + 1, w.y * s + 1, 2 * s - 2, 2 * s - 2);
    ctx.strokeRect(w.x * s + 1.5, w.y * s + 1.5, 2 * s - 3, 2 * s - 3);
    label(ctx, i ? String(i) : 'S', (w.x + 1) * s, (w.y + 1) * s + 1, s * 1.1, '#e8c0b8');
  });
  ctx.fillStyle = '#2a3442';
  ctx.strokeStyle = '#5fb3b3';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(BASE.x * s, BASE.y * s, BASE.radius * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  bar(ctx, (BASE.x - 1.2) * s, (BASE.y + 1.4) * s, s * 2.4, run.baseHp / TRAINING.baseHp, '#5fb3b3', Math.max(3, s * 0.3));
}

/** A dark 2×2 plate a piece sits on. */
function plate(ctx: CanvasRenderingContext2D, p: Tile, s: number, fill: string, stroke?: string) {
  const pad = Math.max(1, s * 0.08);
  ctx.fillStyle = fill;
  ctx.fillRect(p.x * s + pad, p.y * s + pad, 2 * s - 2 * pad, 2 * s - 2 * pad);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, s * 0.1);
    ctx.strokeRect(p.x * s + pad, p.y * s + pad, 2 * s - 2 * pad, 2 * s - 2 * pad);
  }
}

/** 1–5 grade pips along the bottom of a 2×2 piece. */
function pips(ctx: CanvasRenderingContext2D, p: Tile, s: number, n: number, color: string) {
  const r = Math.max(1, s * 0.12);
  const gap = r * 2.6;
  const x0 = (p.x + 1) * s - (gap * (n - 1)) / 2;
  const y = (p.y + 2) * s - s * 0.28;
  ctx.fillStyle = color;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2); ctx.fill(); }
}

/** A Shard: its type's crystal, dull to bright by grade, with grade pips. Draft pieces get a dashed rim and a tag. */
export function drawShard(ctx: CanvasRenderingContext2D, p: ShardPiece, s: number, glow: boolean, time: number) {
  const def = SHARD_TYPES[p.type];
  const tint = gradeTint(def.color, p.grade);
  plate(ctx, p, s, '#1b1f26');
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 5);
    ctx.shadowColor = '#ffe08a';
    ctx.shadowBlur = s * 1.2;
    ctx.strokeStyle = '#ffe08a';
    ctx.lineWidth = Math.max(2, s * 0.18);
    ctx.strokeRect(p.x * s + 1, p.y * s + 1, 2 * s - 2, 2 * s - 2);
    ctx.restore();
  }
  ctx.save();
  if (p.grade >= 4) { ctx.shadowColor = def.color; ctx.shadowBlur = s * (p.grade - 3) * 0.5; }
  drawIcon(ctx, SHARD_ICON[p.type], (p.x + 1) * s, (p.y + 0.9) * s, s * 1.45, tint);
  ctx.restore();
  pips(ctx, p, s, p.grade, tint);
  if (p.draft) {
    ctx.strokeStyle = 'rgba(232,232,232,0.8)';
    ctx.lineWidth = Math.max(1, s * 0.08);
    ctx.setLineDash([Math.max(2, s * 0.25), Math.max(2, s * 0.2)]);
    ctx.strokeRect(p.x * s + 1.5, p.y * s + 1.5, 2 * s - 3, 2 * s - 3);
    ctx.setLineDash([]);
    if (s >= 7) label(ctx, 'D', (p.x + 0.35) * s, (p.y + 0.35) * s, s * 0.55, '#e8e8e8');
  }
}

export function drawRubble(ctx: CanvasRenderingContext2D, p: RubblePiece, s: number) {
  plate(ctx, p, s, '#2a2621');
  drawIcon(ctx, RUBBLE_ICON, (p.x + 1) * s, (p.y + 1) * s, s * 1.6, '#7d756a');
}

/** A crafted unit: its category's plate with its Emblem, level pips and its state rings. */
export function drawUnit(ctx: CanvasRenderingContext2D, t: UnitTower, s: number, face: EmblemLayer[] | undefined) {
  const color = CATEGORY_COLORS[t.category];
  plate(ctx, t, s, color, '#0c0d0f');
  if (face) drawEmblem(ctx, face, t.x * s + s * 0.2, t.y * s + s * 0.2, s * 1.6);
  else label(ctx, t.name.slice(0, 1).toUpperCase(), (t.x + 1) * s, (t.y + 1) * s + 1, s * 0.9, '#0c0d0f');
  if (t.up) pips(ctx, { x: t.x, y: t.y - 1.6 }, s, t.up, '#ffe08a');
  const c = centreOf(t);
  const ring = (col: string, r: number) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1.5, s * 0.12);
    ctx.beginPath(); ctx.arc(c.x * s, c.y * s, r * s, 0, Math.PI * 2); ctx.stroke();
  };
  if (t.dmgBoost.left > 0) ring('#5ab0ff', 1.3);
  if (t.frenzy > 0) ring('#ff6a4a', 1.45);
  if (t.holding !== undefined) ring('#ffe08a', 1.15);
}

export function drawPiece(ctx: CanvasRenderingContext2D, p: Piece, s: number, o: Overlay) {
  if (p.kind === 'shard') drawShard(ctx, p, s, o.glow.has(p.id), o.time);
  else if (p.kind === 'rubble') drawRubble(ctx, p, s);
  else drawUnit(ctx, p, s, o.portraits[p.unitId]);
}

/** The selected piece: a white rim and a ring for each reach of its weapons. */
export function drawSelection(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, id: number | undefined) {
  const p = id === undefined ? undefined : pieceById(run, id);
  if (!p) return;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.strokeRect(p.x * s, p.y * s, 2 * s, 2 * s);
  if (p.kind === 'rubble') return;
  const c = centreOf(p);
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(201,162,74,0.7)';
  for (const r of new Set(p.guns.map((g) => reach(p, g)))) {
    ctx.beginPath(); ctx.arc(c.x * s, c.y * s, r * s, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
}

/** Where a piece would go: its 2×2 footprint, green when it may go there and red when not, with the Shard and its reach. */
export function drawGhost(ctx: CanvasRenderingContext2D, s: number, g: Overlay['ghost']) {
  if (!g) return;
  const { at, ok, shard } = g;
  ctx.fillStyle = ok ? 'rgba(111,220,111,0.22)' : 'rgba(220,60,50,0.3)';
  ctx.strokeStyle = ok ? '#6fdc6f' : '#dc3c32';
  ctx.lineWidth = 2;
  ctx.fillRect(at.x * s, at.y * s, 2 * s, 2 * s);
  ctx.strokeRect(at.x * s + 1, at.y * s + 1, 2 * s - 2, 2 * s - 2);
  if (!shard) return;
  const def = SHARD_TYPES[shard.type];
  ctx.save();
  ctx.globalAlpha = 0.65;
  drawIcon(ctx, SHARD_ICON[shard.type], (at.x + 1) * s, (at.y + 1) * s, s * 1.45, gradeTint(def.color, shard.grade));
  ctx.restore();
  if (!ok) return;
  const r = def.gun.melee ? TRAINING.meleeReach : def.gun.range;
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(111,220,111,0.5)';
  ctx.beginPath(); ctx.arc((at.x + 1) * s, (at.y + 1) * s, r * s, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

/** The whole board under the enemies: ground, cover, route, pads, pieces, selection and ghost. */
export function drawBoard(ctx: CanvasRenderingContext2D, run: TrainingRun, s: number, o: Overlay) {
  drawGround(ctx, s);
  drawCover(ctx, run, s);
  drawRoute(ctx, run, s);
  drawPads(ctx, run, s);
  for (const p of run.pieces) drawPiece(ctx, p, s, o);
  drawSelection(ctx, run, s, o.selected);
  drawGhost(ctx, s, o.ghost);
}
