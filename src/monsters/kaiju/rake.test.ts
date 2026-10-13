import { describe, it, expect } from 'vitest';
import { rakeSwing } from './rake';

const T = { windup: 0.25, impact: 0.4, end: 0.8 };

describe('rakeSwing', () => {
  it('raises the arm back through the windup, slashes forward by impact, then returns to rest', () => {
    expect(rakeSwing(0, T)).toBe(0);
    expect(rakeSwing(0.25, T)).toBeCloseTo(1);
    expect(rakeSwing(0.4, T)).toBeCloseTo(-0.9);
    expect(rakeSwing(0.6, T)).toBeCloseTo(-0.45);
    expect(rakeSwing(0.8, T)).toBe(0);
    expect(rakeSwing(2, T)).toBe(0);
  });
});
