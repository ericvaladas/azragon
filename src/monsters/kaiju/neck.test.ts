import { describe, it, expect } from 'vitest';
import { canAim, neckAim, stepNeck } from './neck';

describe('neckAim', () => {
  it('turns the neck toward a point in body space, clamped to its reach, and reports the leftover error', () => {
    expect(neckAim(0, 100, 1.6)).toEqual({ yaw: 0, error: 0 });
    const side = neckAim(100, 0, 1.6);
    expect(side.yaw).toBeCloseTo(Math.PI / 2);
    expect(side.error).toBeCloseTo(0);
    const behind = neckAim(0, -100, 1.6);
    expect(Math.abs(behind.yaw)).toBeCloseTo(1.6);
    expect(behind.error).toBeGreaterThan(1.5);
  });
});

describe('stepNeck', () => {
  it('moves toward the wanted yaw at no more than rate × dt, and stops on it', () => {
    expect(stepNeck(0, 1, 2, 0.1)).toBeCloseTo(0.2);
    expect(stepNeck(0, -1, 2, 0.1)).toBeCloseTo(-0.2);
    expect(stepNeck(0.95, 1, 2, 0.1)).toBe(1);
  });
});

describe('canAim', () => {
  const at = { x: 0, z: 0 };
  it('accepts targets the neck can reach without turning the body', () => {
    expect(canAim(at, 0, { x: 0, z: 500 }, 1.6)).toBe(true);
    expect(canAim(at, 0, { x: 500, z: 0 }, 1.6)).toBe(true);
    expect(canAim(at, 0, { x: 0, z: -500 }, 1.6)).toBe(false);
    expect(canAim(at, Math.PI, { x: 0, z: -500 }, 1.6)).toBe(true);
  });
});
