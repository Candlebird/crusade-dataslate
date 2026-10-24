import { SHARD_TYPES, type ShardType } from '../../rules/downtimeData';
import type { Grade } from '../../rules/training';
import { ICONS, type IconName } from '../iconData';

// Icon art for the Training map, from game-icons.net (by Lorc, Delapouite and others, CC BY 3.0, credited on the
// Settings page). Names are 'g:<name>' so scripts/icons.mjs (npm run icons) copies their paths into iconData.ts.

/** A different crystal for each Shard type. */
export const SHARD_ICON: Record<ShardType, IconName> = {
  assault: 'g:fire-gem',
  firepower: 'g:topaz',
  breach: 'g:cut-diamond',
  blast: 'g:striking-diamonds',
  bulwark: 'g:crystal-bars',
  swift: 'g:floating-crystal',
  command: 'g:crystal-cluster',
  vigor: 'g:crystal-growth',
};

/**
 * The colour each Shard type is drawn in. The data colour, except Bulwark: its stone grey reads as rubble at every
 * grade on the map, so it shows as steel blue (display only).
 */
const SHARD_HUE: Partial<Record<ShardType, string>> = { bulwark: '#7f9bb8' };
export const shardColor = (type: ShardType): string => SHARD_HUE[type] ?? SHARD_TYPES[type].color;

export const RUBBLE_ICON: IconName = 'g:stone-pile';
export const BASE_ICON: IconName = 'g:castle';
/** Cover patches alternate between brush and ruins (by where they lie, so a patch keeps its look). */
export const COVER_ICONS: IconName[] = ['g:berry-bush', 'g:ancient-ruins'];

/** Mix a hex colour toward grey for low grades: grade 1 is mostly grey, grade 5 the full colour, a little lighter. */
export function gradeTint(color: string, grade: Grade): string {
  const n = parseInt(color.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const share = 0.35 + (grade - 1) * 0.16;
  const grey = 110;
  const lift = grade === 5 ? 1.12 : 1;
  const [r, g, b] = rgb.map((c) => Math.min(255, Math.round((grey + (c - grey) * share) * lift)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** A hex colour as rgba() at alpha `a`. */
export function alpha(color: string, a: number): string {
  const n = parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** A hex colour mixed toward white (k > 0) or black (k < 0), k in −1..1. */
export function shade(color: string, k: number): string {
  const n = parseInt(color.slice(1), 16);
  const to = k > 0 ? 255 : 0;
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (to - c) * Math.abs(k)));
  return `rgb(${r}, ${g}, ${b})`;
}

/** A rounded rectangle path (not filled or stroked). */
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + q, y);
  ctx.arcTo(x + w, y, x + w, y + h, q);
  ctx.arcTo(x + w, y + h, x, y + h, q);
  ctx.arcTo(x, y + h, x, y, q);
  ctx.arcTo(x, y, x + w, y, q);
  ctx.closePath();
}

const paths = new Map<IconName, { box: number; path: Path2D }>();

/** An icon's path for canvas drawing, built once. */
function iconPath(name: IconName) {
  let hit = paths.get(name);
  if (!hit) {
    const [box, body] = ICONS[name];
    hit = { box, path: new Path2D(name.startsWith('g:') ? body : '') };
    paths.set(name, hit);
  }
  return hit;
}

/** Fill a game-icons icon `size` pixels square, centred on (x, y). */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string) {
  const { box, path } = iconPath(name);
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / box, size / box);
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.restore();
}

/** Bold centred text `px` high (at least 8). */
export function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, px: number, color: string) {
  ctx.fillStyle = color;
  ctx.font = `bold ${Math.max(8, Math.round(px))}px Rajdhani, 'Segoe UI', system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}

/** Green to amber to red as a share runs down. */
export const hpColor = (share: number) => (share > 0.6 ? '#7ee07e' : share > 0.3 ? '#f0c040' : '#ff5a4a');

/** A health bar: a dark rim, a pale track and a bright fill (by share unless `color` is given). */
export function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, share: number, color?: string, h = 4) {
  const k = Math.max(0, Math.min(1, share));
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color ?? hpColor(k);
  ctx.fillRect(x, y, w * k, h);
}

/** `n` round pips in a row centred on (cx, y), each `r` round with a dark rim. */
export function pipRow(ctx: CanvasRenderingContext2D, cx: number, y: number, n: number, r: number, color: string) {
  const gap = r * 2.5;
  const x0 = cx - (gap * (n - 1)) / 2;
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.lineWidth = 1;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(x0 + i * gap, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
