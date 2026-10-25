import { describe, expect, it } from 'vitest';
import { placeTip } from './tooltipPlace';

const view = { width: 400, height: 300 };
const tip = { width: 100, height: 30 };

describe('placeTip', () => {
  it('centres above the anchor when there is room', () => {
    expect(placeTip({ left: 150, top: 100, width: 100, height: 20 }, tip, view)).toEqual({ left: 150, top: 64, below: false });
  });
  it('flips below when the top has no room', () => {
    const p = placeTip({ left: 150, top: 10, width: 100, height: 20 }, tip, view);
    expect(p.below).toBe(true);
    expect(p.top).toBe(36);
  });
  it('prefers below when asked, and flips above at the bottom edge', () => {
    expect(placeTip({ left: 150, top: 100, width: 100, height: 20 }, tip, view, 'below').below).toBe(true);
    expect(placeTip({ left: 150, top: 270, width: 100, height: 20 }, tip, view, 'below').below).toBe(false);
  });
  it('shifts inside the viewport at the sides', () => {
    expect(placeTip({ left: 0, top: 100, width: 10, height: 10 }, tip, view).left).toBe(8);
    expect(placeTip({ left: 395, top: 100, width: 5, height: 10 }, tip, view).left).toBe(292);
  });
});
