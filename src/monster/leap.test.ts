import { describe, it, expect } from 'vitest';
import { dashTarget, leapPeak, leapPosition, leapTarget } from './leap';

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

describe('dashTarget', () => {
  it('points `range` straight ahead along the facing (forward = (sin yaw, cos yaw))', () => {
    const a = dashTarget({ x: 100, z: 50 }, 0, 900);
    expect(a.x).toBeCloseTo(100);
    expect(a.z).toBeCloseTo(950);
    const b = dashTarget({ x: 0, z: 0 }, Math.PI / 2, 900);
    expect(b.x).toBeCloseTo(900);
    expect(b.z).toBeCloseTo(0);
  });
});

describe('leapPosition with a crouch before liftoff', () => {
  const from = { x: 0, z: 0 };
  const to = { x: 1000, z: 0 };
  it('holds on the ground through the crouch, then flies the same arc in the time left, landing on time', () => {
    expect(leapPosition(from, to, 0.1, 1, 200, 0.2)).toEqual({ x: 0, y: 0, z: 0 });
    expect(leapPosition(from, to, 0.2, 1, 200, 0.2).y).toBeCloseTo(0);
    const mid = leapPosition(from, to, 0.6, 1, 200, 0.2);
    expect(mid.x).toBeCloseTo(500);
    expect(mid.y).toBeCloseTo(200);
    const end = leapPosition(from, to, 1, 1, 200, 0.2);
    expect(end.x).toBeCloseTo(1000);
    expect(end.y).toBeCloseTo(0);
  });
  it('is the plain arc with no crouch', () => {
    for (const t of [0, 0.3, 0.5, 0.9, 1]) expect(leapPosition(from, to, t, 1, 200, 0)).toEqual(leapPosition(from, to, t, 1, 200));
  });
});

describe('leapPeak', () => {
  it('jumps highest at full range and lower in proportion for shorter leaps', () => {
    expect(leapPeak(1600, 1600, 340, 0.2)).toBeCloseTo(340);
    expect(leapPeak(800, 1600, 340, 0.2)).toBeCloseTo(170);
    expect(leapPeak(400, 1600, 340, 0.2)).toBeCloseTo(85);
  });
  it('still clears the ground on a tiny hop, and never tops the full-range height', () => {
    expect(leapPeak(0, 1600, 340, 0.2)).toBeCloseTo(68);
    expect(leapPeak(100, 1600, 340, 0.2)).toBeCloseTo(68);
    expect(leapPeak(5000, 1600, 340, 0.2)).toBeCloseTo(340);
  });
});
