/**
 * Force emblems: three shapes stacked on top of each other, each with its own colour. The emblem is kept on the
 * force, so it reaches every player with the force's cloud copy, and it stands for the force on the Nexus Map.
 */
import type { EmblemLayer, EmblemShape } from './types';

/** How big each layer is drawn, background first, as a share of the emblem. */
export const LAYER_SCALE = [1, 0.62, 0.34] as const;
export const LAYER_NAMES = ['Background', 'Middle', 'Top'] as const;

/** A star's outline, centred in the 100 × 100 box. */
function star(points: number, outer: number, inner: number): string {
  const pts = Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / points - Math.PI / 2;
    return `${(50 + r * Math.cos(a)).toFixed(1)} ${(50 + r * Math.sin(a)).toFixed(1)}`;
  });
  return `M${pts.join('L')}Z`;
}

/** Each shape as an SVG path filling the 100 × 100 box. */
export const EMBLEM_SHAPES: Record<EmblemShape, { name: string; path: string }> = {
  circle: { name: 'Circle', path: 'M50 2A48 48 0 1 1 49.99 2Z' },
  ring: { name: 'Ring', path: 'M50 2A48 48 0 1 1 49.99 2ZM50 28A22 22 0 1 0 50.01 28Z' },
  square: { name: 'Square', path: 'M6 6H94V94H6Z' },
  diamond: { name: 'Diamond', path: 'M50 2L98 50L50 98L2 50Z' },
  shield: { name: 'Shield', path: 'M8 4H92V44C92 70 72 88 50 98C28 88 8 70 8 44Z' },
  hexagon: { name: 'Hexagon', path: 'M50 2L92 26V74L50 98L8 74V26Z' },
  triangle: { name: 'Triangle', path: 'M50 4L97 92H3Z' },
  star: { name: 'Star', path: star(5, 49, 20) },
  burst: { name: 'Burst', path: star(8, 49, 30) },
  cross: { name: 'Cross', path: 'M37 3H63V37H97V63H63V97H37V63H3V37H37Z' },
  chevron: { name: 'Chevron', path: 'M2 24L50 56L98 24V52L50 84L2 52Z' },
  crescent: { name: 'Crescent', path: 'M70 8A46.5 46.5 0 1 0 70 92A44 44 0 0 1 70 8Z' },
  bolt: { name: 'Lightning', path: 'M60 2L16 58H45L36 98L84 38H55Z' },
  wings: { name: 'Wings', path: 'M50 30L60 46C72 30 86 22 98 20C92 40 80 56 62 64L50 80L38 64C20 56 8 40 2 20C14 22 28 30 40 46Z' },
  skull: {
    name: 'Skull',
    path: 'M50 4C26 4 10 20 10 44C10 58 18 68 28 72V90H72V72C82 68 90 58 90 44C90 20 74 4 50 4ZM34 38A10 10 0 1 1 33.99 38ZM66 38A10 10 0 1 1 65.99 38ZM50 56L57 68H43Z',
  },
};

export const SHAPE_IDS = Object.keys(EMBLEM_SHAPES) as EmblemShape[];

/** Colours offered as one-click picks (any colour can still be chosen). */
export const EMBLEM_PALETTE = ['#c9a24a', '#e8e2d0', '#1b1d22', '#b3352b', '#5fb3b3', '#3d6fb6', '#4f8a3c', '#8e44ad', '#d9822b', '#7a7f8a'];

const isShape = (s: unknown): s is EmblemShape => typeof s === 'string' && s in EMBLEM_SHAPES;
const isColor = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);

/** The emblem's three layers if it has a usable one (a cloud copy from an older or newer app may not). */
export function emblemLayers(emblem: unknown): EmblemLayer[] | undefined {
  if (!Array.isArray(emblem) || emblem.length !== 3) return undefined;
  return emblem.every((l) => l && (l.shape === 'none' || isShape(l.shape)) && isColor(l.color)) ? (emblem as EmblemLayer[]) : undefined;
}

/** Shapes that make a good background: they fill most of the box. */
const BACKGROUNDS: EmblemShape[] = ['circle', 'square', 'diamond', 'shield', 'hexagon', 'burst'];

/** A random emblem: a solid background, then two shapes in colours that differ from the one beneath. */
export function randomEmblem(rand: () => number = Math.random): EmblemLayer[] {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const colors: string[] = [];
  for (let i = 0; i < 3; i++) colors.push(pick(EMBLEM_PALETTE.filter((c) => c !== colors[i - 1])));
  return [
    { shape: pick(BACKGROUNDS), color: colors[0] },
    { shape: pick(SHAPE_IDS), color: colors[1] },
    { shape: pick(SHAPE_IDS.filter((s) => s !== 'ring')), color: colors[2] },
  ];
}
