import { Fragment } from 'react';
import { ICONS, type IconName } from './iconData';

export type { IconName };

/**
 * An SVG icon: `g:` names are from game-icons.net (CC BY 3.0), `l:` names from Lucide (ISC), both credited on the
 * Settings page. iconData.ts holds only the icons the app uses (scripts/icons.cjs writes it). Sized 1em, in the text colour.
 */
export function Icon({ name, title, className }: { name: IconName; title?: string; className?: string }) {
  const [box, body] = ICONS[name];
  const inner = name.startsWith('g:') ? `<path fill="currentColor" d="${body}"/>` : body;
  return (
    <svg className={`icon${className ? ` ${className}` : ''}`} viewBox={`0 0 ${box} ${box}`} aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      aria-label={title || undefined} data-tip={title || undefined}>
      <g dangerouslySetInnerHTML={{ __html: inner }} />
    </svg>
  );
}

/** An icon inside an SVG drawing, centred on (x, y). */
export function SvgIcon({ name, x, y, size, className, title }: { name: IconName; x: number; y: number; size: number; className?: string; title?: string }) {
  const [box, body] = ICONS[name];
  const inner = name.startsWith('g:') ? `<path fill="currentColor" d="${body}"/>` : body;
  return (
    <svg className={className} x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox={`0 0 ${box} ${box}`} overflow="visible"
      role={title ? 'img' : undefined} aria-label={title || undefined} data-tip={title || undefined}>
      <rect width={box} height={box} fill="transparent" />
      <g dangerouslySetInnerHTML={{ __html: inner }} />
    </svg>
  );
}

/**
 * The icon for each glyph the rules and reports still write as text, so copied and printed text keeps the glyph and the
 * screen shows the icon.
 */
export const GLYPHS: Record<string, IconName> = {
  // Sectors
  '♜': 'g:white-tower', '◉': 'g:ringed-planet', '⌬': 'g:atom', '✠': 'g:holy-symbol', '✺': 'g:vortex', '☣': 'g:biohazard', '❖': 'g:bookshelf', '🛰': 'g:defense-satellite',
  // Map marks
  '⛨': 'g:checked-shield', '🌀': 'g:tornado', '☠': 'g:crowned-skull', '♛': 'g:warlord-helmet', '⚠': 'g:hazard-sign', '⚑': 'g:barbute', '🏴': 'g:hood',
  // Reports and the chronicle
  '⚔': 'g:crossed-swords', '🛡': 'g:shield', '⚖': 'g:scales', '🎲': 'g:perspective-dice-six-faces-six', '🎯': 'g:archery-target', '💀': 'g:death-skull',
  '🏅': 'g:medal', '🎖': 'g:rank-3', '☄': 'g:comet-spark', '✧': 'g:sparkles', '✦': 'g:diamonds', '★': 'g:round-star', '☆': 'l:star', '♚': 'g:crown',
  '📜': 'g:scroll-unfurled', '📰': 'l:newspaper', '⚒': 'g:anvil', '🔬': 'g:microscope', '🏗': 'g:crane', '🎁': 'g:open-treasure-chest', '⚡': 'g:power-lightning',
  '⬆': 'g:upgrade', '◆': 'g:crystal-growth', '⛊': 'g:trench-spade',
  // Tech branches and buildings
  '⛁': 'g:two-coins', '⛫': 'g:castle', '👁': 'g:eyeball', '✶': 'g:star-swirl', '⛟': 'g:truck', '⚙': 'g:gears', '⇄': 'l:arrow-left-right', '🗡': 'g:broadsword',
  '⛭': 'g:tank', '✚': 'g:medical-pack', '⛰': 'g:bunker', '◎': 'g:energy-shield', '📡': 'g:radar-dish', '⌁': 'g:static-waves', '🔭': 'g:telescope',
  '☉': 'g:sun-radiations', '⚜': 'g:fleur-de-lys', '♆': 'g:evil-tower',
  // Sortie
  '⛺': 'g:camping-tent', '▣': 'g:locked-chest', '➶': 'g:high-shot', '≈': 'g:knocked-out-stars', '↑': 'l:arrow-up',
  // Controls
  '✕': 'l:x', '✓': 'l:check', '✔': 'l:circle-check', '○': 'l:circle', '↷': 'l:redo-2', '🔒': 'l:lock',
};

/** One glyph as its icon, or as text if it has none. */
export function Glyph({ g, title }: { g: string | undefined; title?: string }) {
  if (!g) return null;
  const name = GLYPHS[g];
  return name ? <Icon name={name} title={title} /> : <>{g}</>;
}

const GLYPH_RE = new RegExp(`(${Object.keys(GLYPHS).map((g) => g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'u');

/** Text with its glyphs drawn as icons: for toasts and other messages the rules write. */
export function IconText({ text }: { text: string }) {
  const parts = text.split(GLYPH_RE);
  if (parts.length === 1) return <>{text}</>;
  return <>{parts.map((p, i) => (i % 2 ? <Icon key={i} name={GLYPHS[p]} /> : <Fragment key={i}>{p}</Fragment>))}</>;
}
