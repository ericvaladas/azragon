import { describe, it, expect } from 'vitest';
import { tailSide, tailSweepTarget, tailSwing } from './tailSweep';

const T = { windup: 0.25, impact: 0.45, end: 1.0 };
const t = (x: number, z: number, airborne = false, alive = true, radius = 20) => ({ position: { x, z }, radius, airborne, isAlive: () => alive });

describe('tailSwing', () => {
  it('cocks the tail away, whips it across to full reach at impact, then returns to rest', () => {
    expect(tailSwing(0, T)).toBe(0);
    expect(tailSwing(0.25, T)).toBeCloseTo(-0.3);
    expect(tailSwing(0.45, T)).toBeCloseTo(1);
    expect(tailSwing(0.7, T)).toBeGreaterThan(0);
    expect(tailSwing(0.7, T)).toBeLessThan(1);
    expect(tailSwing(1.0, T)).toBe(0);
    expect(tailSwing(3, T)).toBe(0);
  });
});

describe('tailSweepTarget', () => {
  const at = { x: 0, z: 0 };
  it('picks the nearest live ground target beside or behind the monster within reach', () => {
    const behind = t(0, -300);
    const side = t(250, 0);
    const front = t(0, 200);
    const far = t(0, -900);
    const flyer = t(0, -150, true);
    const dead = t(0, -100, false, false);
    expect(tailSweepTarget(at, 0, [behind, side, front, far, flyer, dead], 520, 1.9)).toBe(side);
    expect(tailSweepTarget(at, 0, [behind, front, far], 520, 1.9)).toBe(behind);
    expect(tailSweepTarget(at, 0, [front, far, flyer], 520, 1.9)).toBeNull();
  });
  it('turns with the monster: what is behind depends on its yaw', () => {
    expect(tailSweepTarget(at, Math.PI, [t(0, 300)], 520, 1.9)).not.toBeNull();
    expect(tailSweepTarget(at, Math.PI, [t(0, -300)], 520, 1.9)).toBeNull();
  });
});

describe('tailSide', () => {
  it('swings toward the target: +1 for the monster\'s left (+X at yaw 0), -1 for its right', () => {
    expect(tailSide(at0, 0, { x: 300, z: -100 })).toBe(1);
    expect(tailSide(at0, 0, { x: -300, z: -100 })).toBe(-1);
    expect(tailSide(at0, Math.PI, { x: -300, z: 100 })).toBe(1);
  });
});
const at0 = { x: 0, z: 0 };
