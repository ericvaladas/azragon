import { describe, it, expect } from 'vitest';
import { hash2, valueNoise } from './noise';

describe('hash2', () => {
  it('is deterministic, in [0, 1), and differs between cells and seeds', () => {
    expect(hash2(3, -7, 11)).toBe(hash2(3, -7, 11));
    expect(hash2(3, -7, 11)).not.toBe(hash2(4, -7, 11));
    expect(hash2(3, -7, 11)).not.toBe(hash2(3, -7, 12));
    for (let i = -50; i < 50; i++) {
      const h = hash2(i, i * 3, 5);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
});

describe('valueNoise', () => {
  it('is deterministic and in [0, 1)', () => {
    expect(valueNoise(1234, -987, 900, 3)).toBe(valueNoise(1234, -987, 900, 3));
    for (let i = 0; i < 200; i++) {
      const v = valueNoise(i * 137, -i * 91, 900, 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('is smooth: a step of 1% of the scale changes it by little', () => {
    for (let i = 0; i < 100; i++) {
      const x = i * 311;
      const z = -i * 173;
      expect(Math.abs(valueNoise(x + 9, z, 900, 3) - valueNoise(x, z, 900, 3))).toBeLessThan(0.05);
    }
  });
  it('varies across the world', () => {
    const vs = new Set<number>();
    for (let i = 0; i < 50; i++) vs.add(Math.round(valueNoise(i * 2000, i * 1500, 900, 3) * 10));
    expect(vs.size).toBeGreaterThan(4);
  });
});
