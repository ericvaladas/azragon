import { describe, it, expect } from 'vitest';
import { mulberry32, shuffle, pick } from './rng';

describe('mulberry32', () => {
  it('is deterministic per seed and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle / pick', () => {
  it('shuffle returns a permutation without mutating input', () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, mulberry32(1));
    expect(out.slice().sort()).toEqual([1, 2, 3, 4, 5]);
    expect(src).toEqual([1, 2, 3, 4, 5]);
  });
  it('pick returns an element', () => {
    expect([7, 8, 9]).toContain(pick([7, 8, 9], mulberry32(3)));
  });
});
