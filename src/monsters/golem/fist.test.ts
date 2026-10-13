import { describe, it, expect } from 'vitest';
import { backhandYaw, bearingTo, fistKind } from './fist';

describe('Molten Fist', () => {
  it('measures bearing from the nose, positive toward the left (+X)', () => {
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: 0, z: 100 })).toBeCloseTo(0);
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: 100, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(bearingTo({ x: 0, z: 0 }, 0, { x: -100, z: 0 })).toBeCloseTo(-Math.PI / 2);
    expect(bearingTo({ x: 0, z: 0 }, Math.PI / 2, { x: 100, z: 0 })).toBeCloseTo(0);
  });

  it('slams what is ahead and backhands what is beside or behind', () => {
    expect(fistKind(0.5, 0.75)).toBe('slam');
    expect(fistKind(-0.7, 0.75)).toBe('slam');
    expect(fistKind(1.2, 0.75)).toBe('backhand');
    expect(fistKind(-Math.PI, 0.75)).toBe('backhand');
  });

  it('centres the backhand arc on the target\'s side', () => {
    expect(backhandYaw(0, 1.5, 1.95)).toBeCloseTo(1.95);
    expect(backhandYaw(0, -1.5, 1.95)).toBeCloseTo(-1.95);
    expect(backhandYaw(1, 2, 1.95)).toBeCloseTo(2.95);
  });
});
