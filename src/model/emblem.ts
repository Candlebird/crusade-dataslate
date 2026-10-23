/**
 * Force emblems: three shapes stacked on top of each other, each with its own colour. The emblem is kept on the
 * force, so it reaches every player with the force's cloud copy, and it stands for the force on the Nexus Map.
 */
import type { Category } from '../rules/data';
import type { EmblemLayer, EmblemShape, Unit } from './types';

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

/** A force's default emblem, rolled from its id so it's the same on every device until someone saves it. */
export const defaultEmblem = (forceId: string): EmblemLayer[] => randomEmblem(seededRand(`force:${forceId}`));

/** The emblem a force shows: its own if it has a usable one, else its default. */
export const forceEmblem = (f: { id: string; emblem?: unknown }): EmblemLayer[] => emblemLayers(f.emblem) ?? defaultEmblem(f.id);

// ── Unit portraits ────────────────────────────────────────────────────────────
// The same three stacked shapes stand for a unit in the downtime games (Training Grounds, Sortie). A unit in a force
// wears the force emblem's background and middle layers; only the top layer is its own, rolled from its id (in a colour
// unlike the force's) until a player picks one. A unit with no force (a raider from an army book) gets a whole portrait
// rolled from its id, on a background in its category's colour.

/** Background colour of a default portrait, by category. */
export const CATEGORY_COLORS: Record<Category, string> = {
  Hero: '#c9a24a', Infantry: '#4f8a3c', Elite: '#8e44ad', 'Vehicle/Monster': '#b3352b', Aircraft: '#3d6fb6', Fortification: '#7a7f8a',
};

/** Repeatable dice from a string. */
export function seededRand(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), h | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A unit's default portrait: random shapes from its id, on its category's colour. */
export function defaultPortrait(u: Pick<Unit, 'id' | 'category'>): EmblemLayer[] {
  const layers = randomEmblem(seededRand(u.id));
  const bg = CATEGORY_COLORS[u.category] ?? EMBLEM_PALETTE[0];
  layers[0] = { ...layers[0], color: bg };
  if (layers[1].color === bg) layers[1] = { ...layers[1], color: '#1b1d22' };
  return layers;
}

/** How many layers, from the bottom, a unit's portrait takes from its force's emblem. */
export const FORCE_LAYERS = 2;

/** A random top layer for a portrait over `under`: a shape in a colour none of the layers beneath use. */
export function randomTop(under: EmblemLayer[], rand: () => number = Math.random): EmblemLayer {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const used = new Set(under.map((l) => l.color.toLowerCase()));
  const colors = EMBLEM_PALETTE.filter((c) => !used.has(c));
  return { shape: pick(SHAPE_IDS.filter((s) => s !== 'ring')), color: pick(colors.length ? colors : EMBLEM_PALETTE) };
}

/** A unit's portrait in its force: the force emblem's lower layers, with `top` (or one rolled from the unit's id). */
export function portraitInForce(u: Pick<Unit, 'id'>, force: { id: string; emblem?: unknown }, top?: EmblemLayer): EmblemLayer[] {
  const under = forceEmblem(force).slice(0, FORCE_LAYERS);
  return [...under, top ?? randomTop(under, seededRand(`top:${u.id}`))];
}

/** The portrait a unit shows: in a force, the force's lower layers under its own top; else its own, or its default. */
export function unitPortrait(u: Pick<Unit, 'id' | 'category' | 'portrait'>, force?: { id: string; emblem?: unknown }): EmblemLayer[] {
  const own = emblemLayers(u.portrait);
  if (force) return portraitInForce(u, force, own?.[FORCE_LAYERS]);
  return own ?? defaultPortrait(u);
}

/** Void Echoes' colours: ash, bruise and ghost-light. */
const ECHO_PALETTE = ['#2a1f33', '#4b2d5c', '#7d5ba6', '#5fb3b3', '#a9f0e6', '#1b1d22', '#8a8fa0'];

/** An Echo's portrait, the same for every Echo of a type. */
export function echoPortrait(type: string): EmblemLayer[] {
  const rand = seededRand(`echo:${type}`);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
  const colors: string[] = [];
  for (let i = 0; i < 3; i++) colors.push(pick(ECHO_PALETTE.filter((c) => c !== colors[i - 1])));
  return [
    { shape: pick(['circle', 'hexagon', 'diamond', 'burst'] as EmblemShape[]), color: colors[0] },
    { shape: pick(['skull', 'crescent', 'star', 'wings', 'bolt', 'triangle'] as EmblemShape[]), color: colors[1] },
    { shape: pick(['none', 'circle', 'ring', 'diamond'] as (EmblemShape | 'none')[]), color: colors[2] },
  ];
}
