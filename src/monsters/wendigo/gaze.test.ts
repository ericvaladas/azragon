import { describe, expect, it } from 'vitest';
import { burnIntensity, GAZE, gazing } from './gaze';

describe('Dread Gaze timeline', () => {
  const dur = 1.4;
  it('burns only between ignition and the flare, growing toward it', () => {
    expect(burnIntensity(0, dur)).toBe(0);
    expect(burnIntensity(GAZE.ignite - 0.01, dur)).toBe(0);
    expect(burnIntensity(GAZE.ignite, dur)).toBeGreaterThan(0.5);
    expect(burnIntensity(1.0, dur)).toBeGreaterThan(burnIntensity(0.6, dur));
    expect(burnIntensity(dur - 0.001, dur)).toBeCloseTo(1, 2);
    expect(burnIntensity(dur, dur)).toBe(0);
  });
  it('keeps staring a beat past the flare', () => {
    expect(gazing(0, dur)).toBe(true);
    expect(gazing(dur + GAZE.lookAfter - 0.01, dur)).toBe(true);
    expect(gazing(dur + GAZE.lookAfter, dur)).toBe(false);
  });
});
