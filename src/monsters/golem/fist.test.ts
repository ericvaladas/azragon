import { describe, it, expect } from 'vitest';
import { backhandYaw, bearingTo, fistKind, lungeAmount, lungeWeight, strikeReturn, strikeStarted } from './fist';

describe('Rending Claws', () => {
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

  it('detects a strike start: none last frame, or its clock went back', () => {
    expect(strikeStarted(-1, 0.016)).toBe(true);
    expect(strikeStarted(0.84, 0.01)).toBe(true);
    expect(strikeStarted(0.2, 0.216)).toBe(false);
    expect(strikeStarted(0.2, 0.2)).toBe(false);
  });

  it('lunges from the windup, peaks at impact, holds, and eases back by the end', () => {
    const T = { windup: 0.3, impact: 0.45, end: 0.85 };
    const hold = 0.1;
    expect(lungeWeight(0, T, hold)).toBe(0);
    expect(lungeWeight(0.3, T, hold)).toBe(0);
    expect(lungeWeight(0.375, T, hold)).toBeCloseTo(0.5);
    expect(lungeWeight(0.45, T, hold)).toBeCloseTo(1);
    expect(lungeWeight(0.5, T, hold)).toBe(1);
    expect(lungeWeight(0.55, T, hold)).toBeCloseTo(1);
    expect(lungeWeight(0.7, T, hold)).toBeCloseTo(0.5);
    expect(lungeWeight(0.85, T, hold)).toBeCloseTo(0);
    expect(lungeWeight(1, T, hold)).toBe(0);
    expect(lungeWeight(0.4, T, hold)).toBeGreaterThan(lungeWeight(0.35, T, hold));
    expect(lungeWeight(0.75, T, hold)).toBeLessThan(lungeWeight(0.6, T, hold));
  });

  it('holds the fist on the target for `hold` seconds after impact, then eases it home', () => {
    const T = { windup: 0.3, impact: 0.45, end: 0.85 };
    expect(strikeReturn(0.45, T, 0.1)).toBe(0);
    expect(strikeReturn(0.54, T, 0.1)).toBe(0);
    expect(strikeReturn(0.7, T, 0.1)).toBeCloseTo(0.5);
    expect(strikeReturn(0.85, T, 0.1)).toBe(1);
    expect(strikeReturn(0.9, T, 0.1)).toBe(1);
  });

  it('lunges only as far as an outer target needs, up to the cap', () => {
    expect(lungeAmount(200, 380, 150)).toBe(0);
    expect(lungeAmount(380, 380, 150)).toBe(0);
    expect(lungeAmount(450, 380, 150)).toBeCloseTo(70);
    expect(lungeAmount(600, 380, 150)).toBe(150);
  });
});
