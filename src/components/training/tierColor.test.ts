import { describe, expect, it } from 'vitest';
import { TRAINING_ENEMIES } from '../../rules/downtimeData';
import { tierColor, tierRim } from './drawLive';

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Hue in degrees, from 0 to 360. */
function hue([r, g, b]: number[]): number {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

describe('Training enemy colours by wave', () => {
  it('keep each kind its own colour early, and its own hue however deep the run', () => {
    for (const d of Object.values(TRAINING_ENEMIES)) {
      expect(tierColor(d.color, 1)).toBe(d.color);
      expect(tierColor(d.color, 14)).toBe(d.color);
      for (const w of [15, 25, 35, 80]) expect(Math.abs(hue(rgb(tierColor(d.color, w))) - hue(rgb(d.color)))).toBeLessThan(4);
    }
  });

  it('show the tier as a halo: none early, magenta from wave 15, red from 35', () => {
    expect(tierRim(14)).toBeUndefined();
    expect(tierRim(15)).toBe('#d94bd0');
    expect(tierRim(35)).toBe('#e03030');
  });
});
