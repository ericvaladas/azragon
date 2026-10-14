import { describe, it, expect } from 'vitest';
import { HOWL_AFTER, howlPose } from './howlPose';

const D = 1.2;

describe('Wendigo howl', () => {
  it('lowers first: head down, shoulders hunched, nothing lifted yet', () => {
    const b = howlPose(0.18 * D, D);
    expect(b.lower).toBeGreaterThan(0.8);
    expect(b.lift).toBeLessThan(0.1);
    expect(b.jaw).toBeLessThan(0.1);
  });

  it('howls: chest up, neck stretched, muzzle skyward, jaw wide, trembling, then lowers back', () => {
    const h = howlPose(0.6 * D, D);
    expect(h.lift).toBeCloseTo(1, 2);
    expect(h.jaw).toBeGreaterThan(0.9);
    expect(h.lower).toBeLessThan(0.05);
    expect(h.tremble).toBeGreaterThan(0.9);
    const end = howlPose(D + HOWL_AFTER, D);
    for (const v of Object.values(end)) expect(Math.abs(v)).toBeLessThan(1e-6);
    expect(howlPose(0, D).lower).toBe(0);
  });

  it('moves smoothly (no pops)', () => {
    let prev = howlPose(0, D);
    for (let t = 1 / 240; t <= D + HOWL_AFTER + 0.1; t += 1 / 240) {
      const p = howlPose(t, D);
      for (const k of Object.keys(p) as (keyof typeof p)[]) expect(Math.abs(p[k] - prev[k])).toBeLessThan(0.06);
      prev = p;
    }
  });
});
