import { describe, it, expect } from 'vitest';
import { edgeArrow } from './edgeArrows';

const W = 400;
const H = 800;
const M = 20;

describe('edgeArrow', () => {
  it('returns null for points on screen', () => {
    expect(edgeArrow(0.3, -0.5, false, W, H, M)).toBeNull();
  });
  it('pins a point far to the right onto the right edge, pointing right', () => {
    const a = edgeArrow(5, 0, false, W, H, M)!;
    expect(a.x).toBeCloseTo(W - M);
    expect(a.y).toBeCloseTo(H / 2);
    expect(a.angle).toBeCloseTo(0);
  });
  it('pins a point above onto the top edge, pointing up', () => {
    const a = edgeArrow(0, 3, false, W, H, M)!;
    expect(a.y).toBeCloseTo(M);
    expect(a.angle).toBeCloseTo(-Math.PI / 2);
  });
  it('mirrors points behind the camera (they show on the opposite edge)', () => {
    const a = edgeArrow(0, 0.4, true, W, H, M)!;
    expect(a.y).toBeCloseTo(H - M);
    expect(a.angle).toBeCloseTo(Math.PI / 2);
  });
  it('always stays inside the margin box', () => {
    for (const [x, y] of [[9, 9], [-9, 2], [0.2, -40], [-3, -3]] as const) {
      const a = edgeArrow(x, y, false, W, H, M)!;
      expect(a.x).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.x).toBeLessThanOrEqual(W - M + 1e-6);
      expect(a.y).toBeGreaterThanOrEqual(M - 1e-6);
      expect(a.y).toBeLessThanOrEqual(H - M + 1e-6);
    }
  });
});
