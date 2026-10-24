import type { ShardType } from '../../rules/downtimeData';
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

export const RUBBLE_ICON: IconName = 'g:stone-pile';
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
