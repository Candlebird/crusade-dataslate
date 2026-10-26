import { describe, expect, it } from 'vitest';
import { BUILTIN_MISSIONS, STANDARD_MISSION } from './missions';
import { deploymentMap, suggestTable } from './tableMap';

describe('table map', () => {
  it('suggests 4x4 for small games and 6x4 from 1250 pts', () => {
    expect(suggestTable(800)).toMatchObject({ w: 48, h: 48 });
    expect(suggestTable(1250)).toMatchObject({ w: 72, h: 48 });
    expect(suggestTable(0)).toMatchObject({ w: 72, h: 48 });
  });

  it('draws every built-in mission, with all shapes on the table', () => {
    for (const m of BUILTIN_MISSIONS) {
      const map = deploymentMap(m, 800)!;
      expect(map, m.id).toBeDefined();
      for (const s of map.shapes) {
        const pts = s.kind === 'marker' ? [[s.x, s.y]] : s.kind === 'circle' ? [[s.cx, s.cy]]
          : s.kind === 'rect' ? [[s.x, s.y], [s.x + s.w, s.y + s.h]] : s.kind === 'band' ? [] : [[s.x1, s.y1], [s.x2, s.y2]];
        for (const [x, y] of pts) {
          expect(x, m.id).toBeGreaterThanOrEqual(0); expect(x, m.id).toBeLessThanOrEqual(48);
          expect(y, m.id).toBeGreaterThanOrEqual(0); expect(y, m.id).toBeLessThanOrEqual(48);
        }
      }
    }
  });

  it('the standard mission has two 12" zones and a 24" gap on a 4x4', () => {
    const map = deploymentMap(STANDARD_MISSION, 800)!;
    expect(map.shapes.filter((s) => s.kind === 'rect')).toHaveLength(2);
    expect(map.shapes.some((s) => s.kind === 'dim' && s.text === '24"')).toBe(true);
  });

  it('skips a custom deployment it cannot read', () => {
    expect(deploymentMap({ ...STANDARD_MISSION, id: 'x', deployment: 'Diagonal corners, 9" from the centre.' }, 800)).toBeUndefined();
  });
});
