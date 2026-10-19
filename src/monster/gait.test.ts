import { describe, it, expect } from 'vitest';
import { footState, didLand, phaseLanded, TRIPOD_A } from './gait';

describe('tripod gait', () => {
  it('lifts exactly tripod A mid-swing, tripod B planted', () => {
    for (let leg = 0; leg < 6; leg++) {
      const { lift } = footState(0.25, leg);
      if (TRIPOD_A.includes(leg)) expect(lift).toBeCloseTo(1);
      else expect(lift).toBe(0);
    }
  });
  it('swing goes back→front, stance front→back', () => {
    expect(footState(0, 0).stride).toBeCloseTo(-1);
    expect(footState(0.49, 0).stride).toBeGreaterThan(0.9);
    expect(footState(0, 1).stride).toBeCloseTo(1);
  });
  it('detects landing when a foot finishes its swing', () => {
    expect(didLand(0.4, 0.6, 0)).toBe(true);
    expect(didLand(0.4, 0.6, 1)).toBe(false);
    expect(didLand(0.9, 1.1, 1)).toBe(true);
    expect(didLand(0.6, 0.6, 0)).toBe(false);
  });
});

describe('phaseLanded', () => {
  it('lands at the end of the swing walking forward, at its start walking backward', () => {
    expect(phaseLanded(0.39, 0.41, 0, 0.4)).toBe(true);
    expect(phaseLanded(0.41, 0.39, 0, 0.4)).toBe(false);
    expect(phaseLanded(0.01, -0.01, 0, 0.4)).toBe(true);
    expect(phaseLanded(-0.01, 0.01, 0, 0.4)).toBe(false);
    expect(phaseLanded(0.5, 0.5, 0, 0.4)).toBe(false);
  });
  it('walking backward lands every leg once per cycle', () => {
    for (let leg = 0; leg < 6; leg++) {
      let n = 0;
      for (let k = 0; k < 100; k++) if (didLand(1.005 - k * 0.01, 0.995 - k * 0.01, leg)) n++;
      expect(n).toBe(1);
    }
  });
});
