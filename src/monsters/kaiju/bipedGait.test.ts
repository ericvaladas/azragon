import { describe, it, expect } from 'vitest';
import { bipedFoot, bipedLanded } from './bipedGait';

describe('biped gait', () => {
  it('alternates: exactly one foot is ever in the air', () => {
    for (let c = 0; c < 3; c += 0.013) {
      const l = bipedFoot(c, 0);
      const r = bipedFoot(c, 1);
      expect(l.lift > 0 && r.lift > 0).toBe(false);
    }
  });
  it('swings each foot forward through the air, then plants and pushes it back', () => {
    expect(bipedFoot(0, 0)).toEqual({ lift: 0, stride: -1 });
    expect(bipedFoot(0.25, 0).lift).toBeCloseTo(1);
    expect(bipedFoot(0.25, 0).stride).toBeCloseTo(0);
    expect(bipedFoot(0.75, 0)).toEqual({ lift: 0, stride: 0 });
    expect(bipedFoot(0, 1)).toEqual({ lift: 0, stride: 1 });
  });
  it('lands each foot once per cycle, half a cycle apart', () => {
    expect(bipedLanded(0.49, 0.51, 0)).toBe(true);
    expect(bipedLanded(0.49, 0.51, 1)).toBe(false);
    expect(bipedLanded(0.99, 1.01, 1)).toBe(true);
    expect(bipedLanded(0.99, 1.01, 0)).toBe(false);
    expect(bipedLanded(0.6, 0.6, 0)).toBe(false);
    let n = 0;
    for (let c = 0; c < 1; c += 0.01) if (bipedLanded(c, c + 0.01, 0)) n++;
    expect(n).toBe(1);
  });
});
