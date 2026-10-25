export type TipPlace = 'above' | 'below';

interface Rect { left: number; top: number; width: number; height: number }
interface Size { width: number; height: number }

const GAP = 6;
const MARGIN = 8;

/**
 * Where the tooltip goes: centred on the anchor, on the preferred side, flipped to the other side when it does not fit
 * there, and shifted along to stay inside the viewport.
 */
export function placeTip(anchor: Rect, tip: Size, view: Size, place: TipPlace = 'above'): { left: number; top: number; below: boolean } {
  const aboveTop = anchor.top - GAP - tip.height;
  const belowTop = anchor.top + anchor.height + GAP;
  const fitsAbove = aboveTop >= MARGIN;
  const fitsBelow = belowTop + tip.height <= view.height - MARGIN;
  const below = place === 'below' ? fitsBelow || !fitsAbove : !fitsAbove && fitsBelow;
  const top = clamp(below ? belowTop : aboveTop, MARGIN, view.height - MARGIN - tip.height);
  const left = clamp(anchor.left + anchor.width / 2 - tip.width / 2, MARGIN, view.width - MARGIN - tip.width);
  return { left, top, below };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, Math.max(lo, hi)));
}
