import { describe, it, expect } from 'vitest';
import { leapPosition, leapTarget } from './leap';

describe('leapTarget', () => {
  it('keeps targets within range and clamps farther ones along the same direction', () => {
    expect(leapTarget({ x: 0, z: 0 }, { x: 300, z: 400 }, 1000)).toEqual({ x: 300, z: 400 });
    const p = leapTarget({ x: 0, z: 0 }, { x: 3000, z: 4000 }, 1000);
    expect(p.x).toBeCloseTo(600);
    expect(p.z).toBeCloseTo(800);
  });
});

describe('leapPosition', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 1000, z: 0 };
  it('starts at from, ends at to, on the ground', () => {
    expect(leapPosition(from, to, 0, 1, 200)).toEqual({ x: 0, y: 0, z: 0 });
    const end = leapPosition(from, to, 1, 1, 200);
    expect(end.x).toBeCloseTo(1000);
    expect(end.y).toBeCloseTo(0);
  });
  it('peaks at the midpoint and clamps past the duration', () => {
    const mid = leapPosition(from, to, 0.5, 1, 200);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(200);
    expect(leapPosition(from, to, 5, 1, 200).x).toBeCloseTo(1000);
  });
});
