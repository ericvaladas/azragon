import { describe, it, expect } from 'vitest';
import { kaijuLeap } from './leapPose';

const D = 1.4;
const C = 0.2;
const L0 = C * D;

describe('Kaiju leap pose', () => {
  it('sinks into a crouch on the ground before liftoff: leaning in, arms drawn back, tail low', () => {
    expect(kaijuLeap(0, D, C).sink).toBeCloseTo(0);
    const at = kaijuLeap(L0 - 1e-6, D, C);
    expect(at.sink).toBeCloseTo(1, 2);
    expect(at.pitch).toBeGreaterThan(0.15);
    expect(at.arms).toBeGreaterThan(0.3);
    expect(at.tail).toBeLessThan(0);
    expect(at.tuck).toBe(0);
  });

  it('springs up past standing at liftoff, rearing back', () => {
    const s = kaijuLeap(L0 + 0.16, D, C);
    expect(s.sink).toBeLessThan(-0.2);
    expect(s.pitch).toBeLessThan(0);
  });

  it('tucks its legs up mid-flight, then reaches them back down to land', () => {
    expect(kaijuLeap(L0 + 0.5 * (D - L0), D, C).tuck).toBeGreaterThan(0.8);
    expect(kaijuLeap(D - 0.01, D, C).tuck).toBeLessThan(0.1);
    for (let t = L0 + 0.2; t <= D; t += 0.01) expect(kaijuLeap(t, D, C).sink).toBeLessThanOrEqual(0);
  });

  it('moves smoothly the whole way (no pops between phases)', () => {
    let prev = kaijuLeap(0, D, C);
    for (let t = 0.005; t <= D; t += 0.005) {
      const p = kaijuLeap(t, D, C);
      for (const k of ['sink', 'pitch', 'tuck', 'arms', 'tail'] as const) expect(Math.abs(p[k] - prev[k])).toBeLessThan(0.15);
      prev = p;
    }
  });

  it('with no crouch, leaves the ground at once', () => {
    expect(kaijuLeap(0, D, 0).sink).toBeLessThanOrEqual(1);
    expect(Number.isFinite(kaijuLeap(0.3, D, 0).tuck)).toBe(true);
  });
});
