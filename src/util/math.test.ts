import { describe, it, expect } from 'vitest';
import { clampDelta, damp, dist2 } from './math';

describe('clampDelta', () => {
  it('caps long frames at 0.05s and floors negatives at 0', () => {
    expect(clampDelta(3)).toBe(0.05);
    expect(clampDelta(0.016)).toBeCloseTo(0.016);
    expect(clampDelta(-1)).toBe(0);
  });
});

describe('damp', () => {
  it('moves toward target, never overshoots', () => {
    const v = damp(0, 10, 5, 0.1);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(10);
    expect(damp(0, 10, 5, 100)).toBeCloseTo(10);
  });
});

describe('dist2', () => {
  it('is horizontal distance', () => {
    expect(dist2({ x: 0, z: 0 }, { x: 3, z: 4 })).toBe(5);
  });
});
