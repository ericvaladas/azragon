import { describe, it, expect } from 'vitest';
import { LEAP_RECOVER, leapPhase } from './leapPose';

const D = 1.4;
const C = 0.2;
const L0 = C * D;

describe('Wendigo leap pose', () => {
  it('sinks into a deep crouch on the ground before liftoff, chest dipping, nothing pushing yet', () => {
    expect(leapPhase(0, D, C).sink).toBeCloseTo(0);
    const at = leapPhase(L0 - 1e-6, D, C);
    expect(at.sink).toBeCloseTo(1, 2);
    expect(at.pitch).toBeGreaterThan(0.1);
    expect(leapPhase(L0 * 0.5, D, C).push).toBe(1);
  });

  it('springs: the body extends past standing and rears as the limbs push off, then lets go of the ground', () => {
    const s = leapPhase(L0 + 0.12, D, C);
    expect(s.sink).toBeLessThan(-0.25);
    expect(s.pitch).toBeLessThan(-0.1);
    expect(leapPhase(L0 + 0.01, D, C).push).toBeGreaterThan(0.9);
    expect(leapPhase(L0 + 0.2, D, C).push).toBe(0);
  });

  it('reaches forward in the air, tucks the hind legs, and puts the claws down first to land', () => {
    const mid = leapPhase(L0 + 0.4 * (D - L0), D, C);
    expect(mid.reach).toBeGreaterThan(0.8);
    expect(mid.tuck).toBeGreaterThan(0.6);
    expect(leapPhase(D - 0.01, D, C).land).toBeGreaterThan(0.9);
    expect(leapPhase(L0 + 0.3 * (D - L0), D, C).land).toBe(0);
  });

  it('absorbs the landing in a deep crouch, then recovers to the walk', () => {
    let deepest = 0;
    for (let t = D; t < D + 0.15; t += 0.005) deepest = Math.max(deepest, leapPhase(t, D, C).sink);
    expect(deepest).toBeGreaterThan(0.9);
    const end = leapPhase(D + LEAP_RECOVER, D, C);
    for (const v of Object.values(end)) expect(Math.abs(v)).toBeLessThan(1e-6);
  });

  it('moves smoothly the whole way (no pops between phases)', () => {
    let prev = leapPhase(0, D, C);
    for (let t = 1 / 240; t <= D + LEAP_RECOVER + 0.1; t += 1 / 240) {
      const p = leapPhase(t, D, C);
      for (const k of Object.keys(p) as (keyof typeof p)[]) expect(Math.abs(p[k] - prev[k])).toBeLessThan(0.07);
      prev = p;
    }
  });
});
